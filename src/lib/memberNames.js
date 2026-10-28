import { supabase, TABLES } from "@/api/supabaseClient";

const PENDING_KEY = "campfire.pending-chat-name";

// A custom name replaces the name from someone's account, everywhere in the chat.
export async function saveMemberName(userId, name) {
  const trimmed = (name || "").trim();
  if (!trimmed) {
    const { error } = await supabase.from(TABLES.memberNames).delete().eq("user_id", userId);
    if (error) throw error;
    return;
  }

  const { data: existing, error: lookupError } = await supabase
    .from(TABLES.memberNames)
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const result = existing
    ? await supabase.from(TABLES.memberNames).update({ display_name: trimmed }).eq("id", existing.id)
    : await supabase.from(TABLES.memberNames).insert({ user_id: userId, display_name: trimmed });
  if (result.error) throw result.error;
}

// The name someone types when signing up is held until they are inside the chat.
export function stashChatName(name) {
  const trimmed = (name || "").trim();
  if (trimmed) localStorage.setItem(PENDING_KEY, trimmed);
}

export function readPendingChatName() {
  return localStorage.getItem(PENDING_KEY) || "";
}

export function clearPendingChatName() {
  localStorage.removeItem(PENDING_KEY);
}