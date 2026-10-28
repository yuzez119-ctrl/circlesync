import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const STANDARD = "standard";
const ADMIN = "admin";
const FOUNDER = "founder";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return fail("Method not allowed", 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return fail("Unauthorized", 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return fail("Unauthorized", 401);

    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "";
    if (!action) return fail("action is required");

    const [{ data: titleRows, error: titleError }, { data: members, error: memberError }] = await Promise.all([
      db.from("Title").select("*").limit(200),
      db.from("Membership").select("*").limit(500),
    ]);
    if (titleError) throw titleError;
    if (memberError) throw memberError;
    const titles = titleRows || [];
    const rows = members || [];
    const titlesById = Object.fromEntries(titles.map((title) => [title.id, title]));
    const member = rows.find((entry) => entry.user_id === user.id);
    const tiersOf = (entry: any) => (entry?.title_ids || []).map((id: string) => titlesById[id]).filter(Boolean);
    const founder = tiersOf(member).some((tier: any) => tier.tier_type === FOUNDER);
    const admin = founder || tiersOf(member).some((tier: any) => tier.tier_type === ADMIN);
    if (!admin) return fail("Only admins can change tiers.", 403);

    const myName = member?.full_name || member?.user_email || user.user_metadata?.full_name || user.email || "An admin";
    const nameOf = (entry: any) => entry?.full_name || entry?.user_email || "A member";
    const adminIds = rows.filter((entry) => tiersOf(entry).some((tier: any) => tier.tier_type === ADMIN)).map((entry) => entry.user_id);
    const writeTiers = async (target: any, ids: string[]) => {
      const clean = [...new Set(ids)].filter((id) => titlesById[id]);
      const { error } = await db.from("Membership").update({ title_ids: clean }).eq("id", target.id);
      if (error) throw error;
      return clean;
    };
    const dropTierFromMembers = async (tierId: string) => {
      for (const target of rows.filter((entry) => (entry.title_ids || []).includes(tierId))) {
        await writeTiers(target, target.title_ids.filter((id: string) => id !== tierId));
      }
    };
    const propose = async (kind: string, summary: string, payload: object) => {
      const { data, error } = await db.from("TierRequest").insert({
        kind, summary, payload, proposed_by: user.id, proposed_by_name: myName, status: "pending", approvals: [],
      }).select().single();
      if (error) throw error;
      return data;
    };
    const applyRequest = async (tierRequest: any) => {
      const payload = tierRequest.payload || {};
      if (tierRequest.kind === "promotion" || tierRequest.kind === "assignment") {
        const target = rows.find((entry) => entry.user_id === payload.targetUserId);
        if (target) await writeTiers(target, payload.tierIds || []);
        return;
      }
      if (payload.op === "delete") {
        const { error } = await db.from("Title").delete().eq("id", payload.id);
        if (error) throw error;
        await dropTierFromMembers(payload.id);
      } else if (payload.op === "update") {
        const { error } = await db.from("Title").update({ name: payload.name, color: payload.color, tier_type: payload.tier_type }).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("Title").insert({ name: payload.name, color: payload.color, tier_type: payload.tier_type });
        if (error) throw error;
      }
    };

    if (action === "removeMember") {
      if (!founder) return fail("Only a Founder can remove people from the chat.", 403);
      const target = rows.find((entry) => entry.user_id === body.targetUserId);
      if (!target) return fail("That person has not joined the chat.", 404);
      if (target.user_id === user.id) return fail("You cannot remove your own Founder membership.", 400);
      if (tiersOf(target).some((tier: any) => tier.tier_type === FOUNDER)) {
        return fail("Transfer the Founder tier before removing this person.", 400);
      }

      const { error: nameError } = await db.from("MemberName").delete().eq("user_id", target.user_id);
      if (nameError) throw nameError;
      const { error: membershipError } = await db.from("Membership").delete().eq("id", target.id);
      if (membershipError) throw membershipError;

      return json({ removed: true, targetUserId: target.user_id });
    }

    if (action === "assignTiers") {
      const target = rows.find((entry) => entry.user_id === body.targetUserId);
      if (!target) return fail("That person has not joined yet.", 404);
      const nextIds = Array.isArray(body.tierIds) ? [...new Set(body.tierIds.filter((id: string) => titlesById[id]))] : [];
      const targetTiers = tiersOf(target);
      const targetFounder = targetTiers.some((tier: any) => tier.tier_type === FOUNDER);
      const targetAdmin = targetTiers.some((tier: any) => tier.tier_type === ADMIN);
      const nextFounder = nextIds.some((id) => titlesById[id]?.tier_type === FOUNDER);
      const nextAdmin = nextIds.some((id) => titlesById[id]?.tier_type === ADMIN);
      if (!founder) {
        if (targetFounder || nextFounder) return fail("Only a Founder can change the Founder tier.", 403);
        if (targetAdmin) return fail("Only a Founder can change another admin's tiers.", 403);
        if (nextAdmin) {
          const change = await propose("promotion", `Make ${nameOf(target)} an admin`, { targetUserId: target.user_id, tierIds: nextIds });
          return json({ applied: false, awaitingFounder: true, request: change });
        }
      }
      const tierIds = await writeTiers(target, nextIds);
      return json({ applied: true, targetUserId: target.user_id, tierIds });
    }

    if (action === "saveTier") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const color = typeof body.color === "string" ? body.color.trim() : "";
      const tierType = [STANDARD, ADMIN, FOUNDER].includes(body.tier_type) ? body.tier_type : STANDARD;
      const existing = body.id ? titlesById[body.id] : null;
      if (body.id && !existing) return fail("That tier no longer exists.", 404);
      if (!name) return fail("A tier needs a name.");
      if (!color) return fail("A tier needs a colour.");
      if (titles.some((tier) => tier.id !== body.id && String(tier.color).toLowerCase() === color.toLowerCase())) return fail("Another tier already uses that colour.");
      if (!founder && (tierType !== STANDARD || (existing && existing.tier_type !== STANDARD))) return fail("Only a Founder can touch an Admin or Founder tier.", 403);
      if (founder) {
        const query = existing
          ? db.from("Title").update({ name, color, tier_type: tierType }).eq("id", existing.id)
          : db.from("Title").insert({ name, color, tier_type: tierType });
        const { data, error } = await query.select().single();
        if (error) throw error;
        return json({ applied: true, title: data });
      }
      const change = await propose("structure", existing ? `Change the tier “${existing.name}”` : `Add a new tier “${name}”`, {
        op: existing ? "update" : "create", id: existing?.id || null, name, color, tier_type: tierType,
      });
      return json({ applied: false, request: change });
    }

    if (action === "deleteTier") {
      const tier = body.id ? titlesById[body.id] : null;
      if (!tier) return fail("That tier no longer exists.", 404);
      if (!founder) {
        if (tier.tier_type !== STANDARD) return fail("Only a Founder can remove an Admin or Founder tier.", 403);
        const change = await propose("structure", `Delete the tier “${tier.name}”`, { op: "delete", id: tier.id, name: tier.name });
        return json({ applied: false, request: change });
      }
      const { error } = await db.from("Title").delete().eq("id", tier.id);
      if (error) throw error;
      await dropTierFromMembers(tier.id);
      return json({ applied: true });
    }

    if (action === "resolveRequest") {
      const { data: tierRequest, error } = await db.from("TierRequest").select("*").eq("id", body.requestId).maybeSingle();
      if (error) throw error;
      if (!tierRequest) return fail("That request is gone.", 404);
      if (tierRequest.status !== "pending") return fail("That request has already been decided.");
      if (tierRequest.kind === "promotion" && !founder) return fail("Only a Founder can decide on making someone an admin.", 403);
      if (body.decision === "reject") {
        const { data, error: updateError } = await db.from("TierRequest").update({ status: "rejected", resolved_by_name: myName }).eq("id", tierRequest.id).select().single();
        if (updateError) throw updateError;
        return json({ status: "rejected", request: data });
      }
      if (tierRequest.kind === "promotion" || founder) {
        await applyRequest(tierRequest);
        const { data, error: updateError } = await db.from("TierRequest").update({ status: "applied", resolved_by_name: myName }).eq("id", tierRequest.id).select().single();
        if (updateError) throw updateError;
        return json({ status: "applied", applied: true, request: data });
      }
      const approvals = Array.isArray(tierRequest.approvals) ? [...tierRequest.approvals] : [];
      if (!approvals.some((entry: any) => entry.user_id === user.id)) approvals.push({ user_id: user.id, name: myName, at: new Date().toISOString() });
      const required = adminIds.filter((id) => id !== tierRequest.proposed_by && id !== user.id);
      const waiting = required.filter((id) => !approvals.some((entry: any) => entry.user_id === id));
      if (waiting.length === 0) {
        await applyRequest(tierRequest);
        const { data, error: updateError } = await db.from("TierRequest").update({ status: "applied", approvals, resolved_by_name: myName }).eq("id", tierRequest.id).select().single();
        if (updateError) throw updateError;
        return json({ status: "applied", applied: true, request: data });
      }
      const { data, error: updateError } = await db.from("TierRequest").update({ approvals }).eq("id", tierRequest.id).select().single();
      if (updateError) throw updateError;
      return json({ status: "pending", waiting: waiting.length, request: data });
    }

    return fail("Unknown action", 400);
  } catch (error) {
    console.error(error);
    return fail(error instanceof Error ? error.message : "Unexpected server error", 500);
  }
});
