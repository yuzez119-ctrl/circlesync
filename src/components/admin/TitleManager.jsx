import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";
import { TITLE_PALETTE } from "@/lib/chatUtils";
import { STANDARD, TIER_TYPE_OPTIONS, tierTypeLabel, tierTypeOf } from "@/lib/tiers";
import TitleBadge from "@/components/chat/TitleBadge";

async function getFunctionErrorMessage(error) {
  const context = error?.context;
  if (context && typeof context.clone === "function") {
    try {
      const payload = await context.clone().json();
      if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
      if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
    } catch {
      // Use the SDK error below if the response is not JSON.
    }
  }
  return error?.message || "That change was not allowed.";
}

export default function TitleManager({ titles, isFounder, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [tierType, setTierType] = useState(STANDARD);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const usedColors = new Set(
    titles.filter((title) => title.id !== editing?.id).map((title) => String(title.color).toLowerCase())
  );
  const available = TITLE_PALETTE.filter((value) => !usedColors.has(value.toLowerCase()));
  const typeOptions = isFounder
    ? TIER_TYPE_OPTIONS
    : TIER_TYPE_OPTIONS.filter((option) => option.value === STANDARD);

  const startNew = () => {
    setEditing({});
    setName("");
    setColor(available[0] || "");
    setTierType(STANDARD);
    setNotice("");
    setError("");
  };

  const startEdit = (title) => {
    setEditing(title);
    setName(title.name);
    setColor(title.color);
    setTierType(tierTypeOf(title));
    setNotice("");
    setError("");
  };

  const cancel = () => {
    setEditing(null);
    setName("");
    setColor("");
    setTierType(STANDARD);
  };

  const save = async () => {
    if (!name.trim() || !color) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const { data, error } = await supabase.functions.invoke("tier-admin", {
        body: {
          action: "saveTier",
          id: editing?.id || null,
          name: name.trim(),
          color,
          tier_type: tierType,
        },
      });
      if (error) throw error;
      setNotice(data.applied
        ? "Tier saved."
        : data.awaitingFounder
          ? "Sent to the Founder. There is no other Admin available to approve this request."
          : "Sent to the other Admins — it goes live once they all agree, or as soon as a Founder approves it.");
      cancel();
      await onChanged();
    } catch (err) {
      setError(await getFunctionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const { data, error } = await supabase.functions.invoke("tier-admin", {
        body: { action: "deleteTier", id: target.id },
      });
      if (error) throw error;
      if (data.applied) setNotice("Tier deleted.");
      else if (data.awaitingFounder) setNotice("Sent to the Founder. There is no other Admin available to approve this request.");
      else setNotice("Removing that tier is with the other Admins for agreement.");
      if (editing?.id === target.id) cancel();
      setPendingDelete(null);
      await onChanged();
    } catch (err) {
      setError(await getFunctionErrorMessage(err));
      setPendingDelete(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Tiers carry the colour next to a name, and channels choose which tiers may enter. Changing the tier
          structure is agreed with the other admins first, unless a Founder makes the change.
        </p>
        <Button onClick={startNew} className="shrink-0 gap-2">
          <Plus className="h-4 w-4" />
          New tier
        </Button>
      </div>

      {notice && (
        <p className="rounded-xl border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground">{notice}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {editing && (
        <div className="space-y-4 rounded-2xl border border-border bg-card/50 p-5">
          <div className="space-y-2">
            <Label htmlFor="title-name">Tier name</Label>
            <Input
              id="title-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Weekend crew"
            />
          </div>

          <div className="space-y-2">
            <Label>What this tier does</Label>
            <div className="flex flex-wrap gap-2">
              {typeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTierType(option.value)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left text-xs transition-colors",
                    tierType === option.value
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-secondary/50"
                  )}
                >
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{option.hint}</span>
                </button>
              ))}
            </div>
            {!isFounder && (
              <p className="text-xs text-muted-foreground">
                Only a Founder can create or change an Admin or Founder tier.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2">
              {available.map((value) => (
                <button
                  key={value}
                  onClick={() => setColor(value)}
                  aria-label={`Use colour ${value}`}
                  className={cn(
                    "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
                    color === value ? "border-foreground" : "border-transparent"
                  )}
                  style={{ backgroundColor: value }}
                />
              ))}
              {titles
                .filter((title) => title.id === editing.id)
                .map((title) => (
                  <button
                    key={title.color}
                    onClick={() => setColor(title.color)}
                    aria-label={`Keep colour ${title.color}`}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
                      color === title.color ? "border-foreground" : "border-transparent"
                    )}
                    style={{ backgroundColor: title.color }}
                  />
                ))}
            </div>
            {available.length === 0 && !editing.id && (
              <p className="text-xs text-muted-foreground">Every colour is in use — edit an existing tier instead.</p>
            )}
          </div>

          {name && color && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Preview <TitleBadge title={{ name, color }} />
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={save} disabled={busy || !name.trim() || !color}>
              {busy ? "Saving…" : editing.id ? "Save changes" : "Create tier"}
            </Button>
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/40">
        {titles.map((title) => (
          <div key={title.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: title.color }} />
            <span className="font-heading text-sm font-medium">{title.name}</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              {tierTypeLabel(tierTypeOf(title))}
            </span>
            <span className="flex-1" />
            <Button variant="ghost" size="icon" onClick={() => startEdit(title)} aria-label="Edit tier" className="h-8 w-8 text-muted-foreground">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setPendingDelete(title)} aria-label="Delete tier" className="h-8 w-8 text-muted-foreground">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {titles.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No tiers yet.</p>
        )}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Everyone loses this tier, and channels that only allowed it will hide from them.
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
