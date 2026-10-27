import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cropImage } from "@/lib/uploads";

const MIN_SIZE = 40;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const HANDLES = [
  { name: "nw", className: "-left-1.5 -top-1.5 cursor-nwse-resize" },
  { name: "ne", className: "-right-1.5 -top-1.5 cursor-nesw-resize" },
  { name: "sw", className: "-left-1.5 -bottom-1.5 cursor-nesw-resize" },
  { name: "se", className: "-right-1.5 -bottom-1.5 cursor-nwse-resize" },
];

export default function CropDialog({ open, onOpenChange, file, onCropped }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [natural, setNatural] = useState(null);
  const [frame, setFrame] = useState(null);
  const [box, setBox] = useState(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef(null);

  useEffect(() => {
    if (!open || !file) return undefined;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setNatural(null);
    setFrame(null);
    setBox(null);
    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  useEffect(() => {
    const onMove = (event) => {
      const state = drag.current;
      if (!state || !frame) return;
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      const start = state.box;

      if (state.handle === "move") {
        setBox({
          ...start,
          x: clamp(start.x + dx, 0, frame.width - start.width),
          y: clamp(start.y + dy, 0, frame.height - start.height),
        });
        return;
      }

      const right = start.x + start.width;
      const bottom = start.y + start.height;

      if (state.handle === "nw") {
        const x = clamp(start.x + dx, 0, right - MIN_SIZE);
        const y = clamp(start.y + dy, 0, bottom - MIN_SIZE);
        setBox({ x, y, width: right - x, height: bottom - y });
      } else if (state.handle === "ne") {
        const y = clamp(start.y + dy, 0, bottom - MIN_SIZE);
        const width = clamp(right + dx, start.x + MIN_SIZE, frame.width) - start.x;
        setBox({ x: start.x, y, width, height: bottom - y });
      } else if (state.handle === "sw") {
        const x = clamp(start.x + dx, 0, right - MIN_SIZE);
        const height = clamp(bottom + dy, start.y + MIN_SIZE, frame.height) - start.y;
        setBox({ x, y: start.y, width: right - x, height });
      } else {
        const width = clamp(right + dx, start.x + MIN_SIZE, frame.width) - start.x;
        const height = clamp(bottom + dy, start.y + MIN_SIZE, frame.height) - start.y;
        setBox({ x: start.x, y: start.y, width, height });
      }
    };

    const onUp = () => {
      drag.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [frame]);

  const startDrag = (event, handle) => {
    if (!box) return;
    event.preventDefault();
    drag.current = { handle, startX: event.clientX, startY: event.clientY, box: { ...box } };
  };

  const handleLoaded = (event) => {
    const image = event.currentTarget;
    const width = image.clientWidth;
    const height = image.clientHeight;
    setNatural({ width: image.naturalWidth, height: image.naturalHeight });
    setFrame({ width, height });
    const inset = 0.06;
    setBox({
      x: Math.round(width * inset),
      y: Math.round(height * inset),
      width: Math.round(width * (1 - inset * 2)),
      height: Math.round(height * (1 - inset * 2)),
    });
  };

  const reset = () => {
    if (!frame) return;
    const inset = 0.06;
    setBox({
      x: Math.round(frame.width * inset),
      y: Math.round(frame.height * inset),
      width: Math.round(frame.width * (1 - inset * 2)),
      height: Math.round(frame.height * (1 - inset * 2)),
    });
  };

  const save = async () => {
    if (!box || !natural || !frame || !file) return;
    setBusy(true);
    try {
      const scale = natural.width / frame.width;
      const cropped = await cropImage(file, {
        x: box.x * scale,
        y: box.y * scale,
        width: box.width * scale,
        height: box.height * scale,
      });
      onCropped(cropped);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border bg-card">
        <DialogHeader>
          <DialogTitle className="font-heading">Crop image</DialogTitle>
          <DialogDescription>Drag the corners to choose the part you want to send.</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] items-center justify-center overflow-hidden rounded-xl bg-secondary/30 p-3">
          {imageUrl && (
            <div className="relative w-fit leading-none">
              <img
                src={imageUrl}
                alt="Image to crop"
                onLoad={handleLoaded}
                className="block max-h-[52vh] w-auto max-w-full select-none rounded-lg"
                draggable={false}
              />
              {box && frame && (
                <div
                  onPointerDown={(event) => startDrag(event, "move")}
                  className="absolute cursor-move border-2 border-primary"
                  style={{
                    left: box.x,
                    top: box.y,
                    width: box.width,
                    height: box.height,
                    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
                  }}
                >
                  {HANDLES.map((handle) => (
                    <span
                      key={handle.name}
                      onPointerDown={(event) => startDrag(event, handle.name)}
                      className={`absolute h-3 w-3 rounded-sm border border-primary bg-background ${handle.className}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={reset} disabled={!box || busy}>
            Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!box || busy}>
              {busy ? "Cropping…" : "Crop & attach"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}