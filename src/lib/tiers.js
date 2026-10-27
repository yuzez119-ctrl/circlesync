export const STANDARD = "standard";
export const ADMIN = "admin";
export const FOUNDER = "founder";

export const TIER_TYPE_OPTIONS = [
  { value: STANDARD, label: "Member tier", hint: "Only decides which channels open up." },
  { value: ADMIN, label: "Admin tier", hint: "Can manage members and put tier changes to the other admins." },
  { value: FOUNDER, label: "Founder tier", hint: "Full control. Only founders can change this tier." },
];

export function tierTypeOf(tier) {
  return tier?.tier_type || STANDARD;
}

export function tierTypeLabel(type) {
  return TIER_TYPE_OPTIONS.find((option) => option.value === (type || STANDARD))?.label || "Member tier";
}

// Every tier a member holds, in founder → admin → member order.
const ORDER = { founder: 0, admin: 1, standard: 2 };

export function sortTiers(tiers) {
  return [...(tiers || [])].sort(
    (a, b) => (ORDER[tierTypeOf(a)] ?? 3) - (ORDER[tierTypeOf(b)] ?? 3)
  );
}

export function tiersFor(titlesById, member) {
  return sortTiers((member?.title_ids || []).map((id) => titlesById[id]).filter(Boolean));
}

export function tierMapFor(titles, members) {
  const titlesById = Object.fromEntries(titles.map((tier) => [tier.id, tier]));
  return Object.fromEntries(
    (members || []).map((member) => [member.user_id, tiersFor(titlesById, member)])
  );
}

export function hasTierType(tiers, type) {
  return (tiers || []).some((tier) => tierTypeOf(tier) === type);
}

export function primaryColor(tiers) {
  return tiers?.[0]?.color;
}