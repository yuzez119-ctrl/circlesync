-- Shared chat title, separate from AppConfig so regular members cannot read
-- the private join code while still loading the chat name.
CREATE TABLE IF NOT EXISTS public."ChatSettings" (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT 'CircleSync',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public."ChatSettings" (id, name)
VALUES ('main', 'CircleSync')
ON CONFLICT (id) DO UPDATE
SET name = 'CircleSync', updated_at = now()
WHERE lower(public."ChatSettings".name) = 'campfire';

ALTER TABLE public."ChatSettings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read chat settings" ON public."ChatSettings";
CREATE POLICY "Members read chat settings" ON public."ChatSettings"
  FOR SELECT TO authenticated USING (public.is_chat_member());
DROP POLICY IF EXISTS "Admins update chat settings" ON public."ChatSettings";
CREATE POLICY "Admins update chat settings" ON public."ChatSettings"
  FOR UPDATE TO authenticated
  USING (public.is_chat_admin())
  WITH CHECK (public.is_chat_admin());
REVOKE ALL ON TABLE public."ChatSettings" FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public."ChatSettings" TO authenticated;
GRANT ALL ON TABLE public."ChatSettings" TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'ChatSettings'
    ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public."ChatSettings"';
  END IF;
END;
$$;

-- Change the preference through a trusted RPC so old Notice Board entries
-- are scrubbed at the same time the Founder title is hidden.
CREATE OR REPLACE FUNCTION public.set_founder_title_visibility(
  _founder_user_id text,
  _show boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_membership_ctid tid;
BEGIN
  IF _founder_user_id IS NULL OR _show IS NULL THEN
    RAISE EXCEPTION 'Founder and visibility are required';
  END IF;

  SELECT membership.ctid INTO v_membership_ctid
  FROM public."Membership" AS membership
  WHERE membership.user_id = _founder_user_id
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(membership.title_ids) = 'array'
          THEN membership.title_ids ELSE '[]'::jsonb END
      ) AS held(title_id)
      JOIN public."Title" AS title ON title.id = held.title_id
      WHERE title.tier_type = 'founder'
    )
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only a current Founder can change this preference';
  END IF;

  UPDATE public."Membership"
  SET show_founder_title = _show, updated_date = now()
  WHERE ctid = v_membership_ctid;

  IF NOT _show THEN
    UPDATE public."NoticeBoard" AS notice
    SET actor_name = CASE WHEN notice.actor_id = _founder_user_id THEN 'Admin' ELSE notice.actor_name END,
        before_positions = CASE WHEN notice.affected_user_id = _founder_user_id THEN
          COALESCE((
            SELECT jsonb_agg(item.value ORDER BY item.ordinality)
            FROM jsonb_array_elements(COALESCE(notice.before_positions, '[]'::jsonb))
              WITH ORDINALITY AS item(value, ordinality)
            WHERE item.value->>'tier_type' IS DISTINCT FROM 'founder'
          ), '[]'::jsonb)
        ELSE notice.before_positions END,
        after_positions = CASE WHEN notice.affected_user_id = _founder_user_id THEN
          COALESCE((
            SELECT jsonb_agg(item.value ORDER BY item.ordinality)
            FROM jsonb_array_elements(COALESCE(notice.after_positions, '[]'::jsonb))
              WITH ORDINALITY AS item(value, ordinality)
            WHERE item.value->>'tier_type' IS DISTINCT FROM 'founder'
          ), '[]'::jsonb)
        ELSE notice.after_positions END
    WHERE notice.actor_id = _founder_user_id
       OR notice.affected_user_id = _founder_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_founder_title_visibility(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_founder_title_visibility(text, boolean) TO service_role;
DROP POLICY IF EXISTS "Founders update their badge visibility" ON public."Membership";
REVOKE UPDATE (show_founder_title) ON public."Membership" FROM authenticated;

-- Do not store the Founder position in future public activity snapshots when
-- the affected member has elected to hide it. Preserve the actual tier change.
CREATE OR REPLACE FUNCTION public.apply_member_tiers_with_notice(
  _target_user_id text,
  _tier_ids jsonb,
  _actor_id text,
  _actor_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_member record;
  v_before_ids jsonb;
  v_after_ids jsonb;
  v_before_positions jsonb;
  v_after_positions jsonb;
  v_before_types text[];
  v_after_types text[];
  v_kind text;
  v_notice_id text;
  v_affected_name text;
  v_founder_visible boolean;
  v_actor_name text := _actor_name;
BEGIN
  IF _target_user_id IS NULL OR _actor_id IS NULL OR _actor_name IS NULL THEN
    RAISE EXCEPTION 'Target and actor are required';
  END IF;
  IF jsonb_typeof(_tier_ids) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Tier IDs must be an array';
  END IF;

  SELECT membership.ctid AS row_ctid,
         membership.user_id,
         COALESCE(NULLIF(membership.full_name, ''), NULLIF(membership.user_email, ''), 'Member') AS affected_name,
         COALESCE(membership.title_ids, '[]'::jsonb) AS old_ids,
         membership.show_founder_title
  INTO v_member
  FROM public."Membership" AS membership
  WHERE membership.user_id = _target_user_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'That member no longer exists'; END IF;
  v_founder_visible := COALESCE(v_member.show_founder_title, true);

  IF EXISTS (
    SELECT 1 FROM public."Membership" AS actor
    WHERE actor.user_id = _actor_id AND actor.show_founder_title = false
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(actor.title_ids) = 'array' THEN actor.title_ids ELSE '[]'::jsonb END) AS held(title_id)
        JOIN public."Title" AS title ON title.id = held.title_id
        WHERE title.tier_type = 'founder'
      )
  ) THEN v_actor_name := 'Admin'; END IF;

  SELECT COALESCE(NULLIF(member_name.display_name, ''), v_member.affected_name)
  INTO v_affected_name
  FROM public."MemberName" AS member_name
  WHERE member_name.user_id = v_member.user_id
  ORDER BY member_name.created_date DESC NULLS LAST
  LIMIT 1;
  v_affected_name := COALESCE(v_affected_name, v_member.affected_name);

  SELECT COALESCE(jsonb_agg(to_jsonb(items.title_id) ORDER BY items.first_order), '[]'::jsonb)
  INTO v_after_ids
  FROM (
    SELECT held.title_id, MIN(held.ordinality) AS first_order
    FROM jsonb_array_elements_text(_tier_ids) WITH ORDINALITY AS held(title_id, ordinality)
    GROUP BY held.title_id
  ) AS items;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(v_after_ids) AS requested(title_id)
    LEFT JOIN public."Title" AS title ON title.id = requested.title_id
    WHERE title.id IS NULL
  ) THEN RAISE EXCEPTION 'A selected tier no longer exists'; END IF;

  v_before_ids := v_member.old_ids;
  IF v_before_ids = v_after_ids THEN RETURN jsonb_build_object('changed', false); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', title.id, 'name', title.name, 'tier_type', COALESCE(title.tier_type, 'standard')
         ) ORDER BY held.ordinality) FILTER (
           WHERE title.id IS NOT NULL AND (v_founder_visible OR COALESCE(title.tier_type, 'standard') <> 'founder')
         ), '[]'::jsonb),
         COALESCE(array_agg(DISTINCT COALESCE(title.tier_type, 'standard')) FILTER (WHERE title.id IS NOT NULL), ARRAY[]::text[])
  INTO v_before_positions, v_before_types
  FROM jsonb_array_elements_text(v_before_ids) WITH ORDINALITY AS held(title_id, ordinality)
  LEFT JOIN public."Title" AS title ON title.id = held.title_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', title.id, 'name', title.name, 'tier_type', COALESCE(title.tier_type, 'standard')
         ) ORDER BY held.ordinality) FILTER (
           WHERE title.id IS NOT NULL AND (v_founder_visible OR COALESCE(title.tier_type, 'standard') <> 'founder')
         ), '[]'::jsonb),
         COALESCE(array_agg(DISTINCT COALESCE(title.tier_type, 'standard')) FILTER (WHERE title.id IS NOT NULL), ARRAY[]::text[])
  INTO v_after_positions, v_after_types
  FROM jsonb_array_elements_text(v_after_ids) WITH ORDINALITY AS held(title_id, ordinality)
  LEFT JOIN public."Title" AS title ON title.id = held.title_id;

  v_kind := CASE WHEN EXISTS (
    SELECT 1 FROM unnest(v_after_types) AS new_role(tier_type)
    WHERE new_role.tier_type IN ('admin', 'founder') AND NOT (new_role.tier_type = ANY(v_before_types))
  ) THEN 'promotion' ELSE 'tier_change' END;

  UPDATE public."Membership" SET title_ids = v_after_ids, updated_date = now() WHERE ctid = v_member.row_ctid;
  INSERT INTO public."NoticeBoard" (
    kind, body, actor_id, actor_name, affected_user_id, affected_user_name, before_positions, after_positions
  ) VALUES (
    v_kind,
    CASE WHEN v_kind = 'promotion' THEN 'Member promoted' ELSE 'Member tiers changed' END,
    _actor_id, v_actor_name, v_member.user_id, v_affected_name, v_before_positions, v_after_positions
  ) RETURNING id INTO v_notice_id;

  RETURN jsonb_build_object('changed', true, 'kind', v_kind, 'notice_id', v_notice_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_member_tiers_with_notice(text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_member_tiers_with_notice(text, jsonb, text, text) TO service_role;

-- Normalize existing history for Founders who already turned the badge off.
DO $$
DECLARE founder_row record;
BEGIN
  FOR founder_row IN
    SELECT membership.user_id
    FROM public."Membership" AS membership
    WHERE membership.show_founder_title = false
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(membership.title_ids) = 'array' THEN membership.title_ids ELSE '[]'::jsonb END) AS held(title_id)
        JOIN public."Title" AS title ON title.id = held.title_id
        WHERE title.tier_type = 'founder'
      )
  LOOP
    PERFORM public.set_founder_title_visibility(founder_row.user_id, false);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
