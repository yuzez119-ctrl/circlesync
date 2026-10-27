import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const STANDARD = 'standard';
const ADMIN = 'admin';
const FOUNDER = 'founder';

const typeOf = (tier) => (tier && tier.tier_type) || STANDARD;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';
    if (!action) return Response.json({ error: 'action is required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const [titlePage, memberPage] = await Promise.all([
      svc.entities.Title.filter({}, { limit: 200 }),
      svc.entities.Membership.filter({}, { limit: 500 }),
    ]);
    const titles = titlePage.items || [];
    const members = memberPage.items || [];
    const titlesById = Object.fromEntries(titles.map((tier) => [tier.id, tier]));

    const tiersOf = (member) =>
      ((member && member.title_ids) || []).map((id) => titlesById[id]).filter(Boolean);

    // A Founder is the app's own owner account. Admins are members holding an admin tier.
    const isFounder = user.role === 'admin';
    const me = members.find((member) => member.user_id === user.id);
    const amAdmin = tiersOf(me).some((tier) => typeOf(tier) === ADMIN);
    if (!isFounder && !amAdmin) {
      return Response.json({ error: 'Only admins can change tiers.' }, { status: 403 });
    }

    const myName = (me && (me.full_name || me.user_email)) || user.full_name || user.email || 'An admin';
    const nameOf = (member) => (member && (member.full_name || member.user_email)) || 'A member';
    const adminIds = members
      .filter((member) => tiersOf(member).some((tier) => typeOf(tier) === ADMIN))
      .map((member) => member.user_id);

    const writeTiers = async (member, ids) => {
      const clean = [...new Set(ids)].filter((id) => titlesById[id]);
      await svc.entities.Membership.update(member.id, { title_ids: clean });
      return clean;
    };

    const dropTierFromMembers = async (tierId) => {
      const affected = members.filter((member) => (member.title_ids || []).includes(tierId));
      if (!affected.length) return;
      await svc.entities.Membership.bulkUpdate(
        affected.map((member) => ({
          id: member.id,
          title_ids: (member.title_ids || []).filter((id) => id !== tierId),
        }))
      );
    };

    const applyRequest = async (request) => {
      const payload = request.payload || {};
      if (request.kind === 'promotion' || request.kind === 'assignment') {
        const target = members.find((member) => member.user_id === payload.targetUserId);
        if (target) await writeTiers(target, payload.tierIds || []);
        return;
      }
      if (payload.op === 'delete') {
        await svc.entities.Title.delete(payload.id);
        await dropTierFromMembers(payload.id);
        return;
      }
      if (payload.op === 'update') {
        await svc.entities.Title.update(payload.id, {
          name: payload.name,
          color: payload.color,
          tier_type: payload.tier_type,
        });
        return;
      }
      await svc.entities.Title.create({
        name: payload.name,
        color: payload.color,
        tier_type: payload.tier_type,
      });
    };

    const propose = (kind, summary, payload) =>
      svc.entities.TierRequest.create({
        kind,
        summary,
        payload,
        proposed_by: user.id,
        proposed_by_name: myName,
        status: 'pending',
        approvals: [],
      });

    if (action === 'assignTiers') {
      const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : '';
      const target = members.find((member) => member.user_id === targetUserId);
      if (!target) return Response.json({ error: 'That person has not joined yet.' }, { status: 404 });

      const nextIds = Array.isArray(body.tierIds)
        ? [...new Set(body.tierIds.filter((id) => titlesById[id]))]
        : [];
      const targetTiers = tiersOf(target);
      const targetIsFounder = targetTiers.some((tier) => typeOf(tier) === FOUNDER);
      const targetIsAdmin = targetTiers.some((tier) => typeOf(tier) === ADMIN);
      const nextIsFounder = nextIds.some((id) => typeOf(titlesById[id]) === FOUNDER);
      const nextIsAdmin = nextIds.some((id) => typeOf(titlesById[id]) === ADMIN);

      if (!isFounder) {
        if (targetIsFounder || nextIsFounder) {
          return Response.json({ error: 'Only a Founder can change the Founder tier.' }, { status: 403 });
        }
        if (targetIsAdmin) {
          return Response.json({ error: "Only a Founder can change another admin's tiers." }, { status: 403 });
        }
        if (nextIsAdmin) {
          const request = await propose('promotion', `Make ${nameOf(target)} an admin`, {
            targetUserId,
            tierIds: nextIds,
          });
          return Response.json({ applied: false, awaitingFounder: true, request });
        }
      }

      const tierIds = await writeTiers(target, nextIds);
      return Response.json({ applied: true, targetUserId, tierIds });
    }

    if (action === 'saveTier') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const color = typeof body.color === 'string' ? body.color.trim() : '';
      const tierType = [STANDARD, ADMIN, FOUNDER].includes(body.tier_type) ? body.tier_type : STANDARD;
      const existing = body.id ? titlesById[body.id] : null;

      if (body.id && !existing) return Response.json({ error: 'That tier no longer exists.' }, { status: 404 });
      if (!name) return Response.json({ error: 'A tier needs a name.' }, { status: 400 });
      if (!color) return Response.json({ error: 'A tier needs a colour.' }, { status: 400 });
      if (titles.some((tier) => tier.id !== body.id && String(tier.color).toLowerCase() === color.toLowerCase())) {
        return Response.json({ error: 'Another tier already uses that colour.' }, { status: 400 });
      }
      if (!isFounder && (tierType !== STANDARD || (existing && typeOf(existing) !== STANDARD))) {
        return Response.json(
          { error: 'Only a Founder can touch an Admin or Founder tier.' },
          { status: 403 }
        );
      }

      if (isFounder) {
        const saved = existing
          ? await svc.entities.Title.update(existing.id, { name, color, tier_type: tierType })
          : await svc.entities.Title.create({ name, color, tier_type: tierType });
        return Response.json({ applied: true, title: saved });
      }

      const request = await propose(
        'structure',
        existing ? `Change the tier “${existing.name}”` : `Add a new tier “${name}”`,
        { op: existing ? 'update' : 'create', id: existing ? existing.id : null, name, color, tier_type: tierType }
      );
      return Response.json({ applied: false, request });
    }

    if (action === 'deleteTier') {
      const tier = body.id ? titlesById[body.id] : null;
      if (!tier) return Response.json({ error: 'That tier no longer exists.' }, { status: 404 });
      if (!isFounder) {
        if (typeOf(tier) !== STANDARD) {
          return Response.json({ error: 'Only a Founder can remove an Admin or Founder tier.' }, { status: 403 });
        }
        const request = await propose('structure', `Delete the tier “${tier.name}”`, {
          op: 'delete',
          id: tier.id,
          name: tier.name,
        });
        return Response.json({ applied: false, request });
      }
      await svc.entities.Title.delete(tier.id);
      await dropTierFromMembers(tier.id);
      return Response.json({ applied: true });
    }

    if (action === 'resolveRequest') {
      const requestId = typeof body.requestId === 'string' ? body.requestId : '';
      const reject = body.decision === 'reject';
      const request = await svc.entities.TierRequest.get(requestId).catch((e) =>
        e.status === 404 ? null : Promise.reject(e)
      );
      if (!request) return Response.json({ error: 'That request is gone.' }, { status: 404 });
      if (request.status !== 'pending') {
        return Response.json({ error: 'That request has already been decided.' }, { status: 400 });
      }
      if (request.kind === 'promotion' && !isFounder) {
        return Response.json(
          { error: 'Only a Founder can decide on making someone an admin.' },
          { status: 403 }
        );
      }

      if (reject) {
        const updated = await svc.entities.TierRequest.update(request.id, {
          status: 'rejected',
          resolved_by_name: myName,
        });
        return Response.json({ status: 'rejected', request: updated });
      }

      if (request.kind === 'promotion' || isFounder) {
        await applyRequest(request);
        const updated = await svc.entities.TierRequest.update(request.id, {
          status: 'applied',
          resolved_by_name: myName,
        });
        return Response.json({ status: 'applied', applied: true, request: updated });
      }

      const approvals = Array.isArray(request.approvals) ? [...request.approvals] : [];
      if (!approvals.some((entry) => entry.user_id === user.id)) {
        approvals.push({ user_id: user.id, name: myName, at: new Date().toISOString() });
      }

      // Every admin except the one who proposed it has to agree before it takes effect.
      const required = adminIds.filter((id) => id !== request.proposed_by && id !== user.id);
      const waiting = required.filter((id) => !approvals.some((entry) => entry.user_id === id));

      if (waiting.length === 0) {
        await applyRequest(request);
        const updated = await svc.entities.TierRequest.update(request.id, {
          status: 'applied',
          approvals,
          resolved_by_name: myName,
        });
        return Response.json({ status: 'applied', applied: true, request: updated });
      }

      const updated = await svc.entities.TierRequest.update(request.id, { approvals });
      return Response.json({ status: 'pending', waiting: waiting.length, request: updated });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}