// Palette for titles — one colour belongs to one title, never two.
export const TITLE_PALETTE = [
  "#8B5CF6",
  "#F59E0B",
  "#22C55E",
  "#38BDF8",
  "#F472B6",
  "#EF4444",
  "#14B8A6",
  "#A3E635",
  "#FB923C",
  "#818CF8",
  "#E879F9",
  "#2DD4BF",
];

export function visibleChannels(channels, titleIds) {
  const mine = Array.isArray(titleIds) ? titleIds : [];
  return channels.filter((channel) => {
    const allowed = channel.allowed_title_ids || [];
    if (allowed.length === 0) return true;
    return mine.some((id) => allowed.includes(id));
  });
}

export function canEditChannel(channel, me) {
  if (!channel || !me) return false;
  if (me.role === "admin") return true;
  return channel.created_by_id === me.id;
}

export function makeJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 8; i += 1) out += chars[bytes[i] % chars.length];
  return out;
}

// Someone's custom name wins over the name from their account.
export function displayNameFor(displayNames, userId, fallback) {
  const custom = userId ? displayNames?.[userId] : null;
  return custom || fallback || "";
}

export function membersWithNames(members, displayNames, currentUserId = null) {
  const self = (members || []).find((member) => member?.user_id === currentUserId);
  const selfName = displayNameFor(displayNames, currentUserId, self?.full_name).trim().toLocaleLowerCase();
  const unique = new Map();
  (members || []).forEach((member) => {
    const userId = member?.user_id;
    const name = displayNameFor(displayNames, userId, member?.full_name);
    if (!userId || !name.trim() || unique.has(userId)) return;
    if (userId !== currentUserId && selfName && name.trim().toLocaleLowerCase() === selfName) return;
    unique.set(userId, member);
  });
  return Array.from(unique.values());
}

// ---- Mentions -----------------------------------------------------------------

const NAME_CHARS = "\\p{L}\\p{N}_";

const escapeForRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function namePattern(names) {
  const cleaned = Array.from(
    new Set((names || []).map((name) => (name || "").trim()).filter(Boolean))
  )
    .sort((a, b) => b.length - a.length)
    .map(escapeForRegex);

  if (cleaned.length === 0) return null;
  return new RegExp(`(^|[^${NAME_CHARS}])@(${cleaned.join("|")})(?![${NAME_CHARS}])`, "giu");
}

// Does this message tag the given name?
export function mentionsMe(body, name) {
  const trimmed = (name || "").trim();
  if (!body || !trimmed) return false;
  const pattern = new RegExp(`(^|[^${NAME_CHARS}])@${escapeForRegex(trimmed)}(?![${NAME_CHARS}])`, "iu");
  return pattern.test(body);
}

// Splits a message into plain and tagged parts so tags can stand out.
export function splitMentions(body, names) {
  const text = body || "";
  const pattern = namePattern(names);
  if (!pattern || !text) return [{ text, mention: false }];

  const parts = [];
  let last = 0;
  let match = pattern.exec(text);

  while (match) {
    const start = match.index + match[1].length;
    if (start > last) parts.push({ text: text.slice(last, start), mention: false });
    parts.push({ text: `@${match[2]}`, mention: true });
    last = start + match[0].length - match[1].length;
    match = pattern.exec(text);
  }

  if (last < text.length) parts.push({ text: text.slice(last), mention: false });
  return parts.length ? parts : [{ text, mention: false }];
}