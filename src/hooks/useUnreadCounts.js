import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, TABLES } from "@/api/supabaseClient";

const EMPTY = { channel: {}, direct: {} };

// Counts what other people posted in each channel and private conversation since it was last opened.
export default function useUnreadCounts({ me, membership, targets, enabled = true }) {
  const [counts, setCounts] = useState(EMPTY);
  const since = useRef({});
  const userId = me?.id;
  const joinedAt = membership?.created_date;

  // Counting happens when the list of conversations itself changes, not on every new message.
  const listKey = useMemo(() => (targets || []).map((target) => target.key).join("|"), [targets]);
  const listRef = useRef(targets);
  listRef.current = targets;

  useEffect(() => {
    if (!enabled || !userId || !joinedAt) {
      setCounts(EMPTY);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const { data: items } = await supabase.from(TABLES.readStates).select("*").eq("user_id", userId).limit(500);
      const remembered = {};
      (items || []).forEach((row) => {
        remembered[`${row.scope}:${row.target_id}`] = row.last_read_at || joinedAt;
      });
      // Keep the freshest moment already recorded on screen, in case a write is still in flight.
      Object.entries(since.current).forEach(([key, at]) => {
        if (!remembered[key] || remembered[key] < at) remembered[key] = at;
      });
      since.current = remembered;

      const rows = await Promise.all(
        (listRef.current || []).map(async (target) => {
          const count = await countSince(target, userId, remembered[target.key] || joinedAt);
          return [target.scope, target.targetId, count];
        })
      );

      if (cancelled) return;
      const next = { channel: {}, direct: {} };
      rows.forEach(([scope, id, count]) => {
        next[scope][id] = count;
      });
      setCounts(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, userId, joinedAt, listKey]);

  // Opening a conversation clears it and remembers the moment.
  const markRead = useCallback(
    async (scope, targetId) => {
      if (!userId || !scope || !targetId) return;
      const at = new Date().toISOString();
      since.current = { ...since.current, [`${scope}:${targetId}`]: at };
      setCounts((prev) => ({ ...prev, [scope]: { ...prev[scope], [targetId]: 0 } }));

      await supabase.from(TABLES.readStates).upsert(
        { user_id: userId, scope, target_id: targetId, last_read_at: at },
        { onConflict: "user_id,scope,target_id" },
      );
    },
    [userId]
  );

  // A message just arrived in a conversation that is not on screen.
  const bump = useCallback((scope, targetId) => {
    if (!scope || !targetId) return;
    setCounts((prev) => ({
      ...prev,
      [scope]: { ...prev[scope], [targetId]: (prev[scope]?.[targetId] || 0) + 1 },
    }));
  }, []);

  return { counts, markRead, bump };
}

// Only what other people sent — your own messages never count as unread.
function countSince(target, userId, from) {
  if (target.scope === "channel") {
    return supabase.from(TABLES.messages).select("id", { count: "exact", head: true })
      .eq("channel_id", target.targetId).neq("author_id", userId).gt("created_date", from)
      .then(({ count }) => count || 0);
  }

  return supabase.from(TABLES.directMessages).select("id", { count: "exact", head: true })
    .or(`and(sender_id.eq.${userId},recipient_id.eq.${target.targetId}),and(sender_id.eq.${target.targetId},recipient_id.eq.${userId})`)
    .neq("sender_id", userId).gt("created_date", from)
    .then(({ count }) => count || 0);
}