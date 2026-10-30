import { useCallback, useEffect, useState } from "react";
import moment from "moment";
import { Megaphone, Menu, Paperclip, Pin, PinOff, Send, Trash2, X } from "lucide-react";
import { supabase, TABLES } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MessageAttachments from "./MessageAttachments";
import { MAX_FILE_BYTES, uploadPrivateFileWithProgress } from "@/lib/uploads";
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
const MAX_ATTACHMENTS = 10;

function sortNotices(entries) {
  return [...entries].sort((left, right) => Number(!!right.is_pinned) - Number(!!left.is_pinned)
    || new Date(right.created_date).getTime() - new Date(left.created_date).getTime());
}

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
  const [files, setFiles] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [pinningNoticeId, setPinningNoticeId] = useState(null);
  const [pinError, setPinError] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [removalMessage, setRemovalMessage] = useState("");
  const [removalError, setRemovalError] = useState("");

  const loadPage = useCallback(async (offset = 0) => {
    const { data, error: queryError } = await supabase.from(TABLES.noticeBoard)
      .select("*")
      .order("is_pinned", { ascending: false })
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
        setNotices((current) => sortNotices([notice, ...current.filter((entry) => entry.id !== notice.id)]));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: TABLES.noticeBoard }, ({ new: notice }) => {
        setNotices((current) => sortNotices(current.map((entry) => entry.id === notice.id ? notice : entry)));
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
    if (!body.trim() && files.length === 0) return;
    setPublishing(true);
    setPublishError("");
    try {
      const attachments = await Promise.all(files.map(async (file) => {
        const fileUri = await uploadPrivateFileWithProgress(file, { bucket: "notice-attachments" });
        return {
          file_uri: fileUri,
          file_name: file.name,
          file_type: file.type || "",
          file_size: file.size,
          kind: file.type.startsWith("image/") ? "image" : "file",
        };
      }));
      const { data, error: functionError } = await supabase.functions.invoke("tier-admin", {
        body: { action: "publishNotice", title: title.trim(), body: body.trim(), attachments },
      });
      if (functionError) throw functionError;
      if (!data?.notice) throw new Error("The notice was not published.");
      setNotices((current) => sortNotices([data.notice, ...current.filter((item) => item.id !== data.notice.id)]));
      setTitle("");
      setBody("");
      setFiles([]);
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

  const addFiles = (event) => {
    const chosen = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length + chosen.length > MAX_ATTACHMENTS) {
      setPublishError(`An announcement can include up to ${MAX_ATTACHMENTS} attachments.`);
      return;
    }
    const oversized = chosen.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) {
      setPublishError(`${oversized.name} is too large. The maximum size is 25 MB.`);
      return;
    }
    setPublishError("");
    setFiles((current) => [...current, ...chosen]);
  };

  const togglePinned = async (notice) => {
    setPinningNoticeId(notice.id);
    setPinError("");
    try {
      const { data, error: functionError } = await supabase.functions.invoke("tier-admin", {
        body: { action: "setNoticePinned", noticeId: notice.id, isPinned: !notice.is_pinned },
      });
      if (functionError) throw functionError;
      if (!data?.notice) throw new Error("The pin setting was not saved.");
      setNotices((current) => sortNotices(current.map((entry) => entry.id === data.notice.id ? data.notice : entry)));
    } catch (requestError) {
      let message = requestError?.message || "The pin setting could not be saved.";
      if (requestError?.context && typeof requestError.context.clone === "function") {
        try {
          const payload = await requestError.context.clone().json();
          if (typeof payload?.error === "string") message = payload.error;
        } catch { /* Keep the SDK message when the response is not JSON. */ }
      }
      setPinError(message);
    } finally {
      setPinningNoticeId(null);
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
            <div className="space-y-2">
              <Label htmlFor="notice-files">Attachments (up to 10 files, 25 MB each)</Label>
              <label htmlFor="notice-files" className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/50">
                <Paperclip className="h-4 w-4" /> Attach files
              </label>
              <input id="notice-files" type="file" multiple className="sr-only" onChange={addFiles} />
              {files.length > 0 && (
                <ul className="space-y-1.5">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-background/70 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{file.name}</span>
                      <button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={`Remove ${file.name}`}>
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {publishError && <p role="alert" className="text-sm text-destructive">{publishError}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={publishing || (!body.trim() && files.length === 0)} className="gap-2">
                <Send className="h-4 w-4" />
                {publishing ? "Uploading and posting…" : "Post notice"}
              </Button>
            </div>
          </form>
        )}

        {removalMessage && <p role="status" className="rounded-xl border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground">{removalMessage}</p>}
        {removalError && <p role="alert" className="text-sm text-destructive">{removalError}</p>}
        {pinError && <p role="alert" className="text-sm text-destructive">{pinError}</p>}

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
                  <div className="flex items-center gap-2 font-heading text-sm font-semibold">
                    {notice.kind === "announcement" ? (notice.title || "Announcement") : notice.kind === "promotion" ? "Member promoted" : notice.kind === "notice_removal" ? "Notice removed after approval" : "Member tiers changed"}
                    {notice.kind === "announcement" && notice.is_pinned && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"><Pin className="h-3 w-3" /> Pinned</span>}
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

                {notice.kind === "announcement" && <MessageAttachments attachments={notice.attachments || []} bucket="notice-attachments" />}

                {(notice.kind === "announcement" || notice.kind === "notice_removal") && (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">{notice.kind === "announcement" ? "Posted by" : "Removal approved by"} {notice.actor_name}</p>
                    {isAdmin && notice.kind === "announcement" && (
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => togglePinned(notice)} disabled={pinningNoticeId === notice.id} className="h-8 gap-1.5 text-muted-foreground">
                          {notice.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                          {notice.is_pinned ? "Unpin" : "Pin"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => { setPendingRemoval(notice); setRemovalError(""); }} className="h-8 gap-1.5 text-muted-foreground">
                          <Trash2 className="h-3.5 w-3.5" />
                          Request removal
                        </Button>
                      </div>
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
