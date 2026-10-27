import { base44 } from "@/api/base44Client";

const PENDING_KEY = "campfire.pending-chat-name";

// A custom name replaces the name from someone's account, everywhere in the chat.
export async function saveMemberName(userId, name) {
  const trimmed = (name || "").trim();
  const { items } = await base44.entities.MemberName.filter({ user_id: userId }, { limit: 1 });
  const existing = items[0];

  if (!trimmed) {
    if (existing) await base44.entities.MemberName.delete(existing.id);
    return;
  }

  if (existing) {
    await base44.entities.MemberName.update(existing.id, { display_name: trimmed });
  } else {
    await base44.entities.MemberName.create({ user_id: userId, display_name: trimmed });
  }
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