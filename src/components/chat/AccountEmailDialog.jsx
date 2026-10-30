import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/api/supabaseClient";

export default function AccountEmailDialog({ open, onOpenChange, currentEmail, onChanged }) {
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setUsername(currentEmail?.toLowerCase().endsWith("@gmail.com") ? currentEmail.slice(0, -10) : "");
      setError("");
    }
  }, [open, currentEmail]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("tier-admin", {
        body: { action: "changeOwnEmail", username: username.trim() },
      });
      if (invokeError) {
        if (invokeError.context && typeof invokeError.context.clone === "function") {
          try {
            const payload = await invokeError.context.clone().json();
            throw new Error(payload?.error || invokeError.message);
          } catch (parseError) {
            if (parseError instanceof Error && parseError.message !== invokeError.message) throw parseError;
          }
        }
        throw invokeError;
      }
      if (!data?.email) throw new Error("The login email was not changed.");
      await onChanged(data.email);
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError?.message || "Could not change your login email.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change login username</DialogTitle>
          <DialogDescription>
            This changes the username you use to sign in. Your chat display name and password stay the same.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-username">New username</Label>
            <div className="flex items-center gap-2">
              <Input
                id="login-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                maxLength={64}
                required
              />
              <span className="shrink-0 text-sm text-muted-foreground">@gmail.com</span>
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !username.trim()}>{saving ? "Saving…" : "Change username"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
