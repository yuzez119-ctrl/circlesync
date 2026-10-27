import { useRef, useState } from "react";
import { Loader2, Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import CropDialog from "./CropDialog";
import PendingFiles from "./PendingFiles";
import {
  MAX_FILE_BYTES,
  compressImage,
  isImageFile,
  newItemId,
  uploadPrivateFileWithProgress,
} from "@/lib/uploads";

const ACCEPT =
  "image/*,.pdf,.txt,.csv,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";

export default function Composer({ onSend, placeholder = "Write a message…", sending = false }) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [cropping, setCropping] = useState(null);
  const inputRef = useRef(null);
  const controllers = useRef(new Map());

  const patch = (id, changes) =>
    setFiles((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));

  const addFiles = async (picked) => {
    const chosen = Array.from(picked || []);
    if (!chosen.length) return;

    const added = [];
    for (const file of chosen) {
      const kind = isImageFile(file) ? "image" : "file";

      if (file.size > MAX_FILE_BYTES) {
        added.push({
          id: newItemId(),
          file,
          name: file.name,
          size: file.size,
          kind,
          previewUrl: null,
          status: "error",
          error: "Too large — 25 MB max",
          progress: 0,
        });
        continue;
      }

      const { file: working, compressed } = await compressImage(file);
      added.push({
        id: newItemId(),
        file: working,
        name: working.name,
        size: working.size,
        originalSize: compressed ? file.size : null,
        compressed,
        kind: isImageFile(working) ? "image" : "file",
        previewUrl: isImageFile(working) ? URL.createObjectURL(working) : null,
        status: "ready",
        progress: 0,
      });
    }

    setFiles((prev) => [...prev, ...added]);
  };

  const removeFile = (item) => {
    const controller = controllers.current.get(item.id);
    if (controller) {
      controller.abort();
      controllers.current.delete(item.id);
    }
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setFiles((prev) => prev.filter((entry) => entry.id !== item.id));
  };

  const applyCrop = (cropped) => {
    if (!cropping) return;
    if (cropping.previewUrl) URL.revokeObjectURL(cropping.previewUrl);
    patch(cropping.id, {
      file: cropped,
      name: cropped.name,
      size: cropped.size,
      kind: "image",
      previewUrl: URL.createObjectURL(cropped),
      status: "ready",
      progress: 0,
      error: null,
      compressed: false,
      originalSize: null,
    });
    setCropping(null);
  };

  const submit = async () => {
    const body = value.trim();
    if (sending || uploading) return;
    if (!body && files.length === 0) return;

    if (files.length === 0) {
      setValue("");
      await onSend(body);
      return;
    }

    setUploading(true);
    const results = await Promise.all(
      files.map(async (item) => {
        const controller = new AbortController();
        controllers.current.set(item.id, controller);
        patch(item.id, { status: "uploading", progress: 0, error: null });

        try {
          const fileUri = await uploadPrivateFileWithProgress(item.file, {
            signal: controller.signal,
            onProgress: (progress) => patch(item.id, { progress }),
          });
          patch(item.id, { status: "done", progress: 100 });
          return {
            file_uri: fileUri,
            file_name: item.name,
            file_type: item.file.type || "",
            file_size: item.size,
            kind: item.kind,
          };
        } catch (error) {
          if (error?.cancelled) return null;
          patch(item.id, { status: "error", error: error?.message || "Upload failed" });
          return null;
        } finally {
          controllers.current.delete(item.id);
        }
      })
    );

    setUploading(false);
    const attachments = results.filter(Boolean);
    if (!attachments.length && !body) return;

    await onSend(body, attachments);
    setValue("");
    setFiles((prev) => prev.filter((item) => item.status === "error"));
  };

  return (
    <div className="border-t border-border bg-card/30 px-4 py-4 sm:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-background/50 p-2 transition-colors focus-within:border-primary/60">
        <PendingFiles files={files} onRemove={removeFile} onCrop={setCropping} />

        <div className="flex items-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="h-10 w-10 shrink-0 rounded-xl text-muted-foreground"
            aria-label="Attach files"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />

          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={placeholder}
            className="min-h-[40px] flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />

          <Button
            size="icon"
            onClick={submit}
            disabled={(!value.trim() && files.length === 0) || sending || uploading}
            className="h-10 w-10 shrink-0 rounded-xl"
            aria-label="Send message"
          >
            {uploading || sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <CropDialog
        open={!!cropping}
        onOpenChange={(open) => !open && setCropping(null)}
        file={cropping?.file}
        onCropped={applyCrop}
      />
    </div>
  );
}