import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/uploads";
import useSignedUrl from "@/hooks/useSignedUrl";

function AttachmentImage({ attachment, onOpen, bucket }) {
  const url = useSignedUrl(attachment.file_uri, bucket);

  if (!url) {
    return <div className="h-32 w-40 animate-pulse rounded-xl bg-secondary/50" />;
  }

  return (
    <button
      type="button"
      onClick={() => onOpen({ name: attachment.file_name, url })}
      className="overflow-hidden rounded-xl border border-border/60"
      aria-label={`Open ${attachment.file_name || "image"}`}
    >
      <Image
        src={url}
        alt={attachment.file_name || "Shared image"}
        className="h-32 w-40 object-cover transition-transform hover:scale-[1.02]"
      />
    </button>
  );
}

function AttachmentFile({ attachment, bucket }) {
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(attachment.file_uri, 300);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-left transition-colors hover:bg-secondary/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary/70 text-muted-foreground">
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{attachment.file_name || "File"}</span>
        <span className="block text-[11px] text-muted-foreground">
          {busy ? "Preparing link…" : formatBytes(attachment.file_size)}
        </span>
      </span>
      <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export default function MessageAttachments({ attachments, mine = false, bucket = "chat-attachments" }) {
  const [viewer, setViewer] = useState(null);
  const list = attachments || [];
  if (!list.length) return null;

  const images = list.filter((item) => item.kind === "image");
  const others = list.filter((item) => item.kind !== "image");

  return (
    <div className={cn("mt-2 flex flex-col gap-2", mine && "items-end")}>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((image) => (
            <AttachmentImage key={image.file_uri} attachment={image} onOpen={setViewer} bucket={bucket} />
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="flex w-full max-w-[280px] flex-col gap-2">
          {others.map((item) => (
            <AttachmentFile key={item.file_uri} attachment={item} bucket={bucket} />
          ))}
        </div>
      )}

      <Dialog open={!!viewer} onOpenChange={(next) => !next && setViewer(null)}>
        <DialogContent className="max-w-3xl border-border bg-card p-2">
          {viewer && (
            <Image
              src={viewer.url}
              alt={viewer.name || "Shared image"}
              fittingType="fit"
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
