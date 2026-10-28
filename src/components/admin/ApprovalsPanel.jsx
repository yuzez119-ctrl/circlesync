import { useCallback, useEffect, useState } from "react";
import moment from "moment";
import { Check, X } from "lucide-react";
import { supabase, TABLES } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";

export default function ApprovalsPanel({ isFounder }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from(TABLES.tierRequests).select("*")
      .eq("status", "pending").order("created_date", { ascending: false }).limit(100);
    if (error) throw error;
    setRequests(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (request, decision) => {
    setBusy(request.id);
    setNotice("");
    setError("");
    try {
      const { data, error } = await supabase.functions.invoke("tier-admin", {
        body: {
          action: "resolveRequest",
          requestId: request.id,
          decision,
        },
      });
      if (error) throw error;
      if (data.status === "applied") setNotice("Agreed — the change is now live.");
      else if (data.status === "rejected") setNotice("Turned down.");
      else if (typeof data.waiting === "number")
        setNotice(
          `Agreed. Still waiting on ${data.waiting} more admin${data.waiting === 1 ? "" : "s"}.`
        );
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />;
  }

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Tier changes an admin proposes land here. A change goes live once every other admin has agreed to it, or
        as soon as a Founder applies it. A Founder never needs agreement, and only a Founder can settle making
        someone an admin.
      </p>

      {notice && (
        <p className="rounded-xl border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground">{notice}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/40">
        {requests.map((request) => {
          const founderOnly = request.kind === "promotion" && !isFounder;
          const approvals = request.approvals || [];
          return (
            <div key={request.id} className="space-y-3 px-4 py-4">
              <div>
                <p className="font-heading text-sm font-medium">{request.summary}</p>
                <p className="text-xs text-muted-foreground">
                  Proposed by {request.proposed_by_name || "an admin"} ·{" "}
                  {moment(request.created_date).format("D MMM, HH:mm")}
                  {request.kind === "promotion" ? " · needs the Founder" : ""}
                </p>
              </div>

              {approvals.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Agreed by {approvals.map((entry) => entry.name).join(", ")}
                </p>
              )}

              {founderOnly ? (
                <p className="text-xs text-muted-foreground">Waiting on the Founder.</p>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={busy === request.id}
                    onClick={() => decide(request, "approve")}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Agree
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5"
                    disabled={busy === request.id}
                    onClick={() => decide(request, "reject")}
                  >
                    <X className="h-3.5 w-3.5" />
                    Turn down
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {requests.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing waiting. Tier changes admins propose will show up here.
          </p>
        )}
      </div>
    </div>
  );
}