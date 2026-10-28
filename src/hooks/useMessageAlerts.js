import { useEffect, useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { mentionsMe } from "@/lib/chatUtils";

// Watches incoming messages and hands each new one over the moment it arrives.
export default function useMessageAlerts({ me, myName, enabled = true, onMessage }) {
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const seen = useRef(new Set());

  useEffect(() => {
    if (!enabled || !me?.id) return undefined;

    const check = (message, kind) => {
      if (!message?.id) return;
      const actorId = kind === "direct" ? message.sender_id : message.author_id;
      if (!actorId || actorId === me.id) return;
      if (seen.current.has(message.id)) return;
      seen.current.add(message.id);
      handler.current?.({
        ...message,
        kind,
        mentioned: myName ? mentionsMe(message.body, myName) : false,
      });
    };

    const channel = supabase
      .channel(`message-alerts:${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, ({ new: message }) => {
        check(message, "channel");
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, ({ new: message }) => {
        check(message, "direct");
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, me?.id, myName]);
}