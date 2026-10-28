import { useEffect, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { supabase, TABLES } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { makeJoinCode } from "@/lib/chatUtils";

export default function JoinCodeCard() {
  const [config, setConfig] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from(TABLES.appConfig).select("*").order("created_date", { ascending: false }).limit(1)
      .then(({ data }) => setConfig(data?.[0] || null));
  }, []);

  const write = async (code) => {
    setBusy(true);
    if (config?.id) {
      const { data, error } = await supabase.from(TABLES.appConfig).update({ join_code: code }).eq("id", config.id).select().single();
      if (error) throw error;
      setConfig(data);
    } else {
      const { data, error } = await supabase.from(TABLES.appConfig).insert({ join_code: code }).select().single();
      if (error) throw error;
      setConfig(data);
    }
    setBusy(false);
  };

  const copy = async () => {
    if (!config?.join_code) return;
    await navigator.clipboard.writeText(config.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="max-w-xl space-y-5 rounded-2xl border border-border bg-card/40 p-6">
      <div>
        <h2 className="font-heading text-base font-semibold">Join code</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Friends sign up, then type this code to get in. Only you can see it.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-xl border border-border bg-background/60 px-4 py-3 font-mono text-xl tracking-[0.28em]">
          {config?.join_code || "————"}
        </span>
        <Button variant="secondary" onClick={copy} disabled={!config?.join_code} className="gap-2">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="outline" onClick={() => write(makeJoinCode())} disabled={busy} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          New code
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Making a new code stops the old one from working — anyone already in keeps their access.
      </p>
    </div>
  );
}