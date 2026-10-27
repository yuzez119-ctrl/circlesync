import { Crop, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { formatBytes } from "@/lib/uploads";

export default function PendingFiles({ files, onRemove, onCrop }) {
  if (!files.length) return null;

  return (
    <div className="mb-2 flex flex-col gap-2">
      {files.map((item) => {
        const uploading = item.status === "uploading";
        const failed = item.status === "error";

        if (item.previewUrl === undefined) return null;

        return (
          <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-2">
            {item.previewUrl ? (
              <Image
                src={item.previewUrl}
                alt={item.name}
                className="h-11 w-11 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary/70 text-muted-foreground">
                <FileText className="h-4 w-4" />
              </span>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-xs font-medium">{item.name}</span>
                {item.compressed && (
                  <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Compressed
                  </span>
                )}
              </div>

              <div className={failed ? "truncate text-[11px] text-destructive" : "truncate text-[11px] text-muted-foreground"}>
                {failed
                  ? item.error || "Upload failed"
                  : item.compressed && item.originalSize
                    ? `${formatBytes(item.size)} · was ${formatBytes(item.originalSize)}`
                    : formatBytes(item.size)}
              </div>

              {uploading && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-200"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-[10px] text-muted-foreground">{item.progress}%</span>
                </div>
              )}
            </div>

            {item.kind === "image" && item.status === "ready" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground"
                onClick={() => onCrop(item)}
                aria-label={`Crop ${item.name}`}
              >
                <Crop className="h-3.5 w-3.5" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={() => onRemove(item)}
              aria-label={uploading ? `Cancel upload of ${item.name}` : `Remove ${item.name}`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}