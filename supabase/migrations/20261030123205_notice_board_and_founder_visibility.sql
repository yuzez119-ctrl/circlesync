-- Keep Founder badge visibility as a presentation preference, never an access
-- control. Only a Founder may change their own preference.
ALTER TABLE public."Membership"
  ADD COLUMN IF NOT EXISTS show_founder_title boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.is_chat_founder()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
SET row_security = off
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public."Membership" AS membership
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(membership.title_ids) = 'array'
        THEN membership.title_ids ELSE '[]'::jsonb END
    ) AS held(title_id)
    JOIN public."Title" AS title ON title.id = held.title_id
    WHERE membership.user_id = auth.uid()::text
      AND title.tier_type = 'founder'
  );
$$;

REVOKE ALL ON FUNCTION public.is_chat_founder() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_founder() TO authenticated, service_role;

GRANT UPDATE (show_founder_title) ON public."Membership" TO authenticated;
DROP POLICY IF EXISTS "Founders update their badge visibility" ON public."Membership";
CREATE POLICY "Founders update their badge visibility" ON public."Membership"
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text AND public.is_chat_founder())
  WITH CHECK (user_id = auth.uid()::text AND public.is_chat_founder());

-- Append-only board: announcements and immutable membership tier audit events.
CREATE TABLE IF NOT EXISTS public."NoticeBoard" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  kind text NOT NULL CHECK (kind IN ('announcement', 'promotion', 'tier_change')),
  title text,
  body text NOT NULL DEFAULT '',
  actor_id text,
  actor_name text NOT NULL,
  affected_user_id text,
  affected_user_name text,
  before_positions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(before_positions) = 'array'),
  after_positions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(after_positions) = 'array'),
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "NoticeBoard_created_date_idx"
  ON public."NoticeBoard" (created_date DESC);

ALTER TABLE public."NoticeBoard" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."NoticeBoard" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."NoticeBoard" TO authenticated;
GRANT ALL ON TABLE public."NoticeBoard" TO service_role;
DROP POLICY IF EXISTS "Members read the notice board" ON public."NoticeBoard";
CREATE POLICY "Members read the notice board" ON public."NoticeBoard"
  FOR SELECT TO authenticated
  USING (public.is_chat_member());

-- Update membership tiers and write the corresponding permanent notice in a
-- single transaction so a successful change cannot lose its audit record.
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
         COALESCE(membership.title_ids, '[]'::jsonb) AS old_ids
  INTO v_member
  FROM public."Membership" AS membership
  WHERE membership.user_id = _target_user_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That member no longer exists';
  END IF;

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
    SELECT 1
    FROM jsonb_array_elements_text(v_after_ids) AS requested(title_id)
    LEFT JOIN public."Title" AS title ON title.id = requested.title_id
    WHERE title.id IS NULL
  ) THEN
    RAISE EXCEPTION 'A selected tier no longer exists';
  END IF;

  v_before_ids := v_member.old_ids;
  IF v_before_ids = v_after_ids THEN
    RETURN jsonb_build_object('changed', false);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', title.id, 'name', title.name, 'tier_type', COALESCE(title.tier_type, 'standard')
         ) ORDER BY held.ordinality), '[]'::jsonb),
         COALESCE(array_agg(DISTINCT COALESCE(title.tier_type, 'standard')) FILTER (WHERE title.id IS NOT NULL), ARRAY[]::text[])
  INTO v_before_positions, v_before_types
  FROM jsonb_array_elements_text(v_before_ids) WITH ORDINALITY AS held(title_id, ordinality)
  LEFT JOIN public."Title" AS title ON title.id = held.title_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', title.id, 'name', title.name, 'tier_type', COALESCE(title.tier_type, 'standard')
         ) ORDER BY held.ordinality), '[]'::jsonb),
         COALESCE(array_agg(DISTINCT COALESCE(title.tier_type, 'standard')) FILTER (WHERE title.id IS NOT NULL), ARRAY[]::text[])
  INTO v_after_positions, v_after_types
  FROM jsonb_array_elements_text(v_after_ids) WITH ORDINALITY AS held(title_id, ordinality)
  LEFT JOIN public."Title" AS title ON title.id = held.title_id;

  v_kind := CASE
    WHEN EXISTS (
      SELECT 1 FROM unnest(v_after_types) AS new_role(tier_type)
      WHERE new_role.tier_type IN ('admin', 'founder')
        AND NOT (new_role.tier_type = ANY(v_before_types))
    ) THEN 'promotion'
    ELSE 'tier_change'
  END;

  UPDATE public."Membership"
  SET title_ids = v_after_ids, updated_date = now()
  WHERE ctid = v_member.row_ctid;

  INSERT INTO public."NoticeBoard" (
    kind, body, actor_id, actor_name, affected_user_id, affected_user_name,
    before_positions, after_positions
  ) VALUES (
    v_kind,
    CASE WHEN v_kind = 'promotion' THEN 'Member promoted' ELSE 'Member tiers changed' END,
    _actor_id,
    _actor_name,
    v_member.user_id,
    v_affected_name,
    v_before_positions,
    v_after_positions
  ) RETURNING id INTO v_notice_id;

  RETURN jsonb_build_object('changed', true, 'kind', v_kind, 'notice_id', v_notice_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_member_tiers_with_notice(text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_member_tiers_with_notice(text, jsonb, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
