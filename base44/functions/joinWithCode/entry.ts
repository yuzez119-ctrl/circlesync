import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { items: existing } = await base44.asServiceRole.entities.Membership.filter(
      { user_id: user.id },
      { limit: 1 }
    );
    if (existing.length) return Response.json({ membership: existing[0] });

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    if (user.role !== 'admin') {
      if (!code) return Response.json({ error: 'Enter the join code.' }, { status: 400 });

      const { items: configs } = await base44.asServiceRole.entities.AppConfig.list({ limit: 5 });
      const config = configs.find((item) => item.join_code);
      if (!config) return Response.json({ error: 'Joining is closed right now.' }, { status: 403 });

      if (String(config.join_code).trim().toLowerCase() !== code.toLowerCase()) {
        return Response.json({ error: 'That code does not match.' }, { status: 403 });
      }
    }

    // A Founder runs the place, so their account starts on the Founder tier.
    let titleIds = [];
    if (user.role === 'admin') {
      const { items: founderTiers } = await base44.asServiceRole.entities.Title.filter(
        { tier_type: 'founder' },
        { limit: 5 }
      );
      titleIds = founderTiers.map((tier) => tier.id);
    }

    const membership = await base44.asServiceRole.entities.Membership.create({
      user_id: user.id,
      user_email: user.email,
      full_name: user.full_name || user.email,
      title_ids: titleIds
    });

    return Response.json({ membership });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}