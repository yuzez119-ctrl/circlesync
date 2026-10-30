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

    if (action === "changeOwnEmail") {
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      if (!/^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(username) || username.includes("..")) {
        return fail("Use 1–64 letters, numbers, dots, underscores, plus signs, or hyphens for the username.");
      }
      const email = `${username}@gmail.com`;
      if (user.email?.toLowerCase() === email) return fail("That is already your login username.");

      // Check for a friendly duplicate error, while Auth's unique constraint
      // remains the final protection against concurrent changes.
      for (let page = 1; ; page += 1) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        const users = data.users || [];
        if (users.some((entry) => entry.id !== user.id && entry.email?.toLowerCase() === email)) {
          return fail("That username is already in use.", 409);
        }
        if (users.length < 1000) break;
      }

      const { data: updated, error: updateError } = await db.auth.admin.updateUserById(user.id, {
        email,
        email_confirm: true,
      });
      if (updateError) {
        if (/already|duplicate|unique/i.test(updateError.message)) return fail("That username is already in use.", 409);
        throw updateError;
      }
      const { error: membershipEmailError } = await db.from("Membership")
        .update({ user_email: email })
        .eq("user_id", user.id);
      if (membershipEmailError) console.error("Could not refresh the membership email snapshot:", membershipEmailError);
      return json({ email: updated.user.email });
    }

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

    const { data: nameRow, error: nameLookupError } = await db.from("MemberName")
      .select("display_name")
      .eq("user_id", user.id)
      .order("created_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (nameLookupError) throw nameLookupError;
    const myName = nameRow?.display_name || member?.full_name || member?.user_email || user.user_metadata?.full_name || user.email || "An admin";
    const nameOf = (entry: any) => entry?.full_name || entry?.user_email || "A member";
    const adminIds = rows.filter((entry) => tiersOf(entry).some((tier: any) => tier.tier_type === ADMIN)).map((entry) => entry.user_id);
    const writeTiers = async (target: any, ids: string[], actorName = myName) => {
      const clean = [...new Set(ids)].filter((id) => titlesById[id]);
      const { error } = await db.rpc("apply_member_tiers_with_notice", {
        _target_user_id: target.user_id,
        _tier_ids: clean,
        _actor_id: user.id,
        _actor_name: actorName,
      });
      if (error) throw error;
      return clean;
    };
    const dropTierFromMembers = async (tierId: string, actorName = myName) => {
      for (const target of rows.filter((entry) => (entry.title_ids || []).includes(tierId))) {
        await writeTiers(target, target.title_ids.filter((id: string) => id !== tierId), actorName);
      }
    };
    const propose = async (kind: string, summary: string, payload: object) => {
      const { data, error } = await db.from("TierRequest").insert({
        kind, summary, payload, proposed_by: user.id, proposed_by_name: myName, status: "pending", approvals: [],
      }).select().single();
      if (error) throw error;
      return data;
    };
    const applyRequest = async (tierRequest: any, actorName = myName) => {
      const payload = tierRequest.payload || {};
      if (tierRequest.kind === "promotion" || tierRequest.kind === "assignment") {
        const target = rows.find((entry) => entry.user_id === payload.targetUserId);
        if (target) await writeTiers(target, payload.tierIds || [], actorName);
        return;
      }
      if (payload.op === "delete") {
        await dropTierFromMembers(payload.id, actorName);
        const { error } = await db.from("Title").delete().eq("id", payload.id);
        if (error) throw error;
      } else if (payload.op === "update") {
        const { error } = await db.from("Title").update({ name: payload.name, color: payload.color, tier_type: payload.tier_type }).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("Title").insert({ name: payload.name, color: payload.color, tier_type: payload.tier_type });
        if (error) throw error;
      }
    };

    if (action === "publishNotice") {
      const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
      const message = typeof body.body === "string" ? body.body.trim().slice(0, 5000) : "";
      if (!message) return fail("An announcement needs a message.");
      const { data: notice, error } = await db.from("NoticeBoard").insert({
        kind: "announcement",
        title: title || null,
        body: message,
        actor_id: user.id,
        actor_name: myName,
      }).select().single();
      if (error) throw error;
      return json({ notice });
    }

    if (action === "removeMember") {
      // Keep deployed clients working until the updated frontend is live.
      // This legacy action only removes the chat membership, as the old UI says.
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

    if (action === "deleteUser") {
      if (!founder) return fail("Only a Founder can delete user accounts.", 403);
      const target = rows.find((entry) => entry.user_id === body.targetUserId);
      if (!target) return fail("That person has not joined the chat.", 404);
      if (target.user_id === user.id) return fail("You cannot delete your own account.", 400);
      const { data: targetNameRow, error: targetNameError } = await db.from("MemberName")
        .select("display_name")
        .eq("user_id", target.user_id)
        .order("created_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (targetNameError) throw targetNameError;
      const targetName = targetNameRow?.display_name || target.full_name || target.user_email || "Member";
      const { data: targetAuth, error: targetAuthError } = await db.auth.admin.getUserById(target.user_id);
      if (targetAuthError) throw targetAuthError;
      if (!targetAuth.user) return fail("The user account could not be found.", 404);

      // Delete the Auth account only after verifying Founder and target state.
      // Keep historical chat messages, but remove the live membership/profile.
      const { error: deleteAuthError } = await db.auth.admin.deleteUser(target.user_id);
      if (deleteAuthError) throw deleteAuthError;
      const { error: nameError } = await db.from("MemberName").delete().eq("user_id", target.user_id);
      if (nameError) throw nameError;
      const { error: membershipError } = await db.from("Membership").delete().eq("id", target.id);
      if (membershipError) throw membershipError;
      const { error: noticeError } = await db.from("NoticeBoard").insert({
        kind: "announcement",
        title: "User account deleted",
        body: `${targetName}'s CircleSync account was deleted by ${myName}.`,
        actor_id: user.id,
        actor_name: myName,
        affected_user_id: target.user_id,
        affected_user_name: targetName,
      });
      if (noticeError) throw noticeError;

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
      const tierId = typeof body.id === "string" ? body.id : "";
      const { data: tier, error: tierLookupError } = tierId
        ? await db.from("Title").select("*").eq("id", tierId).maybeSingle()
        : { data: null, error: null };
      if (tierLookupError) throw tierLookupError;
      if (!tier) return fail("That tier no longer exists.", 404);
      if (!founder) {
        if (tier.tier_type !== STANDARD) return fail("Only a Founder can remove an Admin or Founder tier.", 403);
        const change = await propose("structure", `Delete the tier “${tier.name}”`, { op: "delete", id: tier.id, name: tier.name });
        return json({ applied: false, request: change });
      }
      await dropTierFromMembers(tier.id);
      const { error } = await db.from("Title").delete().eq("id", tier.id);
      if (error) throw error;
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
        await applyRequest(tierRequest, "全体Admin");
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
