import { useState } from "react";
import { Flame, KeyRound } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function JoinGate({ me, onJoined, onSignOut }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data, error: joinError } = await supabase.rpc("join_with_code", { join_code: code });
      if (joinError) throw joinError;
      const rpcResult = Array.isArray(data) ? data[0] : data;
      if (rpcResult?.success === false) {
        throw new Error(
          typeof rpcResult.message === "string" && rpcResult.message.trim()
            ? rpcResult.message
            : "That join code was rejected. Check it and try again."
        );
      }
      const joinedMembership = rpcResult?.membership || rpcResult?.data?.membership || rpcResult;
      const membership = await onJoined(joinedMembership);
      if (!membership) {
        throw new Error("The code was accepted, but no membership record was found. Please retry or contact an admin.");
      }
    } catch (err) {
      setError(err.message || "Could not join with that code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card/60 p-8 shadow-2xl">
        <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Flame className="h-6 w-6" />
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">One more step</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the join code you were given to get into the chat.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="join-code">Join code</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="join-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="ABCD1234"
                autoComplete="off"
                className="pl-9 tracking-[0.2em] uppercase"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={busy || !code.trim()} className="w-full">
            {busy ? "Checking…" : "Join the chat"}
          </Button>
        </form>

        <p className="mt-6 text-xs text-muted-foreground">
          Signed in as {me?.email}.{" "}
          <button onClick={onSignOut} className="underline transition-colors hover:text-foreground">
            Use a different account
          </button>
        </p>
      </div>
    </div>
  );
}