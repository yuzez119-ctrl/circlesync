import { useEffect, useState } from "react";
import { supabase, TABLES } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ChatNameCard({ chatName, onSaved }) {
  const [name, setName] = useState(chatName || "CircleSync");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => setName(chatName || "CircleSync"), [chatName]);

  const save = async (event) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || nextName.length > 48) {
      setError("Enter a name between 1 and 48 characters.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");
    try {
      const { data, error: updateError } = await supabase.from(TABLES.chatSettings)
        .update({ name: nextName, updated_at: new Date().toISOString() })
        .eq("id", "main")
        .select("name")
        .single();
      if (updateError) throw updateError;
      setName(data.name);
      setMessage("Chat name updated for everyone.");
      await onSaved?.();
    } catch (saveError) {
      setError(saveError?.message || "Could not update the chat name.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="max-w-xl space-y-5 rounded-2xl border border-border bg-card/40 p-6">
      <div>
        <h2 className="font-heading text-base font-semibold">Chat name</h2>
        <p className="mt-1 text-sm text-muted-foreground">Admins and the Founder can change the name shown to everyone.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="chat-name">Name</Label>
        <Input id="chat-name" value={name} maxLength={48} onChange={(event) => setName(event.target.value)} />
      </div>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save name"}</Button>
    </form>
  );
}
