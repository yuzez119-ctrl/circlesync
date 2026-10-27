import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ChannelDialog({ open, onOpenChange, channel, titles, onSaved }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allowed, setAllowed] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(channel?.name || "");
    setDescription(channel?.description || "");
    setAllowed(channel?.allowed_title_ids || []);
  }, [open, channel]);

  const toggle = (id) => {
    setAllowed((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const payload = { name: name.trim(), description: description.trim(), allowed_title_ids: allowed };
    if (channel?.id) await base44.entities.Channel.update(channel.id, payload);
    else await base44.entities.Channel.create(payload);
    setBusy(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{channel ? "Edit channel" : "New channel"}</DialogTitle>
          <DialogDescription>
            Pick which titles are allowed in. Leave all unticked and everyone can join.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name">Name</Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="weekend-plans"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-description">Description</Label>
            <Textarea
              id="channel-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="What is this channel for?"
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label>Allowed titles</Label>
            <div className="space-y-1 rounded-xl border border-border p-2">
              {titles.map((title) => (
                <label
                  key={title.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/50"
                >
                  <Checkbox
                    checked={allowed.includes(title.id)}
                    onCheckedChange={() => toggle(title.id)}
                  />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: title.color }} />
                  <span className="text-sm">{title.name}</span>
                </label>
              ))}
              {titles.length === 0 && (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  No titles yet — everyone will be allowed in.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Save channel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}