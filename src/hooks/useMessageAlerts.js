import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
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

    const unsubscribeMessages = base44.entities.Message.subscribe((event) => {
      if (event.type === "create") check(event.data, "channel");
    });
    const unsubscribeDirect = base44.entities.DirectMessage.subscribe((event) => {
      if (event.type === "create") check(event.data, "direct");
    });

    return () => {
      unsubscribeMessages();
      unsubscribeDirect();
    };
  }, [enabled, me?.id, myName]);
}