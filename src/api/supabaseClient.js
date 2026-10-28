import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.");
}

export const supabase = createClient(
  supabaseUrl || "https://example.supabase.co",
  supabaseAnonKey || "example-anon-key",
);

export const TABLES = Object.freeze({
  channels: "Channel",
  messages: "Message",
  memberships: "Membership",
  titles: "Title",
  memberNames: "MemberName",
  readStates: "ReadState",
  directMessages: "DirectMessage",
  appConfig: "AppConfig",
  tierRequests: "TierRequest",
});