import { useCallback, useEffect, useState } from "react";
import moment from "moment";
import { Megaphone, Menu, Send, Trash2 } from "lucide-react";
import { supabase, TABLES } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PAGE_SIZE = 50;

function positionsLabel(positions) {
  if (!Array.isArray(positions) || positions.length === 0) return "No tier";
  return positions.map((position) => position.name).filter(Boolean).join(", ") || "No tier";
}

export default function NoticeBoard({ isAdmin, onOpenSidebar }) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [removalMessage, setRemovalMessage] = useState("");
  const [removalError, setRemovalError] = useState("");

  const loadPage = useCallback(async (offset = 0) => {
    const { data, error: queryError } = await supabase.from(TABLES.noticeBoard)
      .select("*")
      .order("created_date", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (queryError) throw queryError;
    return data || [];
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const page = await loadPage(0);
      setNotices(page);
      setHasMore(page.length === PAGE_SIZE);
    } catch (loadError) {
      setError(loadError?.message || "The Notice Board could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [loadPage]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const channel = supabase
      .channel("notice-board-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLES.noticeBoard }, ({ new: notice }) => {
        setNotices((current) => [notice, ...current.filter((entry) => entry.id !== notice.id)]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: TABLES.noticeBoard }, ({ old: removed }) => {
        setNotices((current) => current.filter((entry) => entry.id !== removed.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    setError("");
    try {
      const page = await loadPage(notices.length);
      setNotices((current) => [...current, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (loadError) {
      setError(loadError?.message || "Older notices could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  };

  const publish = async (event) => {
    event.preventDefault();
    if (!body.trim()) return;
    setPublishing(true);
    setPublishError("");
    try {
      const { data, error: functionError } = await supabase.functions.invoke("tier-admin", {
        body: { action: "publishNotice", title: title.trim(), body: body.trim() },
      });
      if (functionError) throw functionError;
      if (!data?.notice) throw new Error("The notice was not published.");
      setNotices((current) => [data.notice, ...current.filter((item) => item.id !== data.notice.id)]);
      setTitle("");
      setBody("");
    } catch (publishError) {
      let message = publishError?.message || "The notice could not be published.";
      if (publishError?.context && typeof publishError.context.clone === "function") {
        try {
          const payload = await publishError.context.clone().json();
          if (typeof payload?.error === "string") message = payload.error;
        } catch {
          // Keep the SDK message when the function response is not JSON.
        }
      }
      setPublishError(message);
    } finally {
      setPublishing(false);
    }
  };

  const requestRemoval = async () => {
    if (!pendingRemoval) return;
    setRemoving(true);
    setRemovalMessage("");
    setRemovalError("");
    try {
      const { data, error: functionError } = await supabase.functions.invoke("tier-admin", {
        body: { action: "requestDeleteNotice", noticeId: pendingRemoval.id },
      });
      if (functionError) throw functionError;
      if (data?.applied) {
        setNotices((current) => [data.notice, ...current.filter((entry) => entry.id !== pendingRemoval.id && entry.id !== data.notice?.id)]);
        setRemovalMessage("The announcement was removed. A permanent approval record was added to the Notice Board.");
      } else if (data?.request) {
        setRemovalMessage("Removal request sent. The announcement will be removed after all Admins agree or a Founder approves it.");
      } else {
        throw new Error("The removal request could not be submitted.");
      }
      setPendingRemoval(null);
    } catch (requestError) {
      let message = requestError?.message || "The removal request could not be submitted.";
      if (requestError?.context && typeof requestError.context.clone === "function") {
        try {
          const payload = await requestError.context.clone().json();
          if (typeof payload?.error === "string") message = payload.error;
        } catch {
          // Use the SDK error when the Edge Function response is not JSON.
        }
      }
      setRemovalError(message);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-card/30 px-4 py-5 sm:px-8">
        <Button variant="ghost" size="icon" onClick={onOpenSidebar} className="h-9 w-9 shrink-0 text-muted-foreground md:hidden" aria-label="Open channels">
          <Menu className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">Notice Board</h1>
          <p className="mt-1 text-sm text-muted-foreground">Announcements and a permanent record of member changes and approved removals.</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-8">
        {isAdmin && (
          <form onSubmit={publish} className="space-y-3 rounded-2xl border border-border bg-card/40 p-4 sm:p-5">
            <div className="flex items-center gap-2 font-heading text-sm font-semibold">
              <Megaphone className="h-4 w-4 text-primary" />
              Post an announcement
            </div>
            <div className="space-y-2">
              <Label htmlFor="notice-title">Title</Label>
              <Input id="notice-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Optional heading" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notice-body">Message</Label>
              <Textarea id="notice-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={4} placeholder="Share an update with everyone…" />
            </div>
            {publishError && <p role="alert" className="text-sm text-destructive">{publishError}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={publishing || !body.trim()} className="gap-2">
                <Send className="h-4 w-4" />
                {publishing ? "Posting…" : "Post notice"}
              </Button>
            </div>
          </form>
        )}

        {removalMessage && <p role="status" className="rounded-xl border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground">{removalMessage}</p>}
        {removalError && <p role="alert" className="text-sm text-destructive">{removalError}</p>}

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
            {error} <button type="button" onClick={loadInitial} className="ml-2 underline">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10"><div className="h-7 w-7 animate-spin rounded-full border-4 border-border border-t-primary" /></div>
        ) : notices.length > 0 ? (
          <div className="space-y-3">
            {notices.map((notice) => (
              <article key={notice.id} className="rounded-2xl border border-border bg-card/40 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="font-heading text-sm font-semibold">
                    {notice.kind === "announcement" ? (notice.title || "Announcement") : notice.kind === "promotion" ? "Member promoted" : notice.kind === "notice_removal" ? "Notice removed after approval" : "Member tiers changed"}
                  </div>
                  <time className="text-xs text-muted-foreground" dateTime={notice.created_date}>
                    {moment(notice.created_date).format("MMM D, YYYY · HH:mm")}
                  </time>
                </div>

                {notice.kind === "announcement" || notice.kind === "notice_removal" ? (
                  <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{notice.body}</div>
                ) : (
                  <div className="mt-2 space-y-2 text-sm">
                    <p><span className="text-muted-foreground">By</span> {notice.actor_name} <span className="text-muted-foreground">· for</span> {notice.affected_user_name || "a member"}</p>
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <p className="rounded-lg bg-background/70 px-3 py-2"><span className="text-muted-foreground">Before:</span> {positionsLabel(notice.before_positions)}</p>
                      <p className="rounded-lg bg-background/70 px-3 py-2"><span className="text-muted-foreground">After:</span> {positionsLabel(notice.after_positions)}</p>
                    </div>
                  </div>
                )}

                {(notice.kind === "announcement" || notice.kind === "notice_removal") && (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">{notice.kind === "announcement" ? "Posted by" : "Removal approved by"} {notice.actor_name}</p>
                    {isAdmin && notice.kind === "announcement" && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setPendingRemoval(notice); setRemovalError(""); }} className="h-8 gap-1.5 text-muted-foreground">
                        <Trash2 className="h-3.5 w-3.5" />
                        Request removal
                      </Button>
                    )}
                  </div>
                )}
              </article>
            ))}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load older notices"}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            No notices yet.
          </div>
        )}
      </div>

      <AlertDialog open={!!pendingRemoval} onOpenChange={(open) => !open && !removing && setPendingRemoval(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request announcement removal?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingRemoval?.title || "Announcement"}” will be removed after every Admin agrees or a Founder approves. A permanent removal record will remain on the Notice Board.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={requestRemoval} disabled={removing}>
              {removing ? "Sending…" : "Request removal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
