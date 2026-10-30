import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/api/supabaseClient";
import { STANDARD, tierTypeOf } from "@/lib/tiers";

/** @param {{ open: boolean, onOpenChange: (open: boolean) => void, titles: Array<{ id: string, name: string, color: string }>, currentTierIds: string[], onSubmitted?: () => void }} props */
export default function MemberTierRequestDialog({ open, onOpenChange, titles, currentTierIds, onSubmitted }) {
  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const memberTiers = useMemo(() => titles.filter((title) => tierTypeOf(title) === STANDARD), [titles]);

  useEffect(() => {
    if (open) {
      setSelected(currentTierIds.filter((id) => memberTiers.some((title) => title.id === id)));
      setMessage("");
      setError("");
      setSubmitted(false);
    }
  }, [open, currentTierIds, memberTiers]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("tier-admin", {
        body: { action: "requestOwnMemberTiers", tierIds: selected },
      });
      if (invokeError) {
        if (invokeError.context && typeof invokeError.context.clone === "function") {
          try {
            const payload = await invokeError.context.clone().json();
            if (payload?.error) throw new Error(payload.error);
          } catch (parseError) {
            if (parseError instanceof Error && parseError.message !== invokeError.message) throw parseError;
          }
        }
        throw invokeError;
      }
      if (!data?.request) throw new Error("Your request could not be submitted.");
      setMessage("Request sent. It will take effect after all Admins agree or a Founder approves it.");
      setSubmitted(true);
      await onSubmitted?.();
    } catch (submitError) {
      setError(submitError?.message || "Your request could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request member tier change</DialogTitle>
          <DialogDescription>
            Choose the member tiers you want. Admin and Founder tiers cannot be requested here; an Admin must agree, or a Founder may approve.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {memberTiers.length ? (
            <div className="space-y-2">
              {memberTiers.map((tier) => (
                <label key={tier.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm">
                  <Checkbox
                    checked={selected.includes(tier.id)}
                    onCheckedChange={(checked) => setSelected((current) => (
                      checked ? [...new Set([...current, tier.id])] : current.filter((id) => id !== tier.id)
                    ))}
                  />
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tier.color }} />
                  <span>{tier.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">There are no member tiers to request.</p>
          )}
          {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>{submitted ? "Close" : "Cancel"}</Button>
            <Button type="submit" disabled={submitting || submitted || memberTiers.length === 0}>
              {submitting ? "Sending…" : submitted ? "Sent" : "Send request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
