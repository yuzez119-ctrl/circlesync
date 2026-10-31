import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase, TABLES } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
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
import ChannelDialog from "@/components/chat/ChannelDialog";
import TitleBadge from "@/components/chat/TitleBadge";

export default function ChannelManager({ channels, titles, onChanged }) {
  const [dialog, setDialog] = useState({ open: false, channel: null });
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const titlesById = Object.fromEntries(titles.map((title) => [title.id, title]));

  const remove = async () => {
    if (!pendingDelete) return;
    if (!pendingDelete.id) {
      setDeleteError("This channel has no ID yet. Refresh the page after the channel data is repaired.");
      return;
    }

    try {
      const { error } = await supabase.from(TABLES.channels).delete().eq("id", pendingDelete.id);
      if (error) throw error;
      setPendingDelete(null);
      setDeleteError("");
      onChanged();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete the channel.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-md text-sm text-muted-foreground">
          A channel with no titles ticked is open to everyone. Tick titles and only those people can enter.
        </p>
        <Button onClick={() => setDialog({ open: true, channel: null })} className="shrink-0 gap-2">
          <Plus className="h-4 w-4" />
          New channel
        </Button>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/40">
        {channels.map((channel) => (
          <div key={channel.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-[140px] flex-1">
              <button
                onClick={() => setDialog({ open: true, channel })}
                className="font-heading text-sm font-medium transition-colors hover:text-primary"
              >
                #{channel.name}
              </button>
              <p className="truncate text-xs text-muted-foreground">{channel.description || "No description"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(channel.allowed_title_ids || []).length === 0 ? (
                <span className="text-xs text-muted-foreground">Everyone</span>
              ) : (
                (channel.allowed_title_ids || []).map((id) => <TitleBadge key={id} title={titlesById[id]} />)
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setPendingDelete(channel)} aria-label="Delete channel" className="h-8 w-8 text-muted-foreground">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {channels.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No channels yet.</p>
        )}
      </div>

      <ChannelDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        channel={dialog.channel}
        titles={titles}
        onSaved={onChanged}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => {
        if (!open) {
          setPendingDelete(null);
          setDeleteError("");
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete #{pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its messages stay in the database but the channel disappears from everyone's list.
              {deleteError && <span className="mt-2 block text-destructive">{deleteError}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
