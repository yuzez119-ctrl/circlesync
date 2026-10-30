-- Keep an audit tombstone when an announcement is removed after approval.
ALTER TABLE public."NoticeBoard"
  ADD COLUMN IF NOT EXISTS deletion_request_id text;

ALTER TABLE public."NoticeBoard"
  DROP CONSTRAINT IF EXISTS "NoticeBoard_kind_check";
ALTER TABLE public."NoticeBoard"
  ADD CONSTRAINT "NoticeBoard_kind_check"
  CHECK (kind IN ('announcement', 'promotion', 'tier_change', 'notice_removal'));

CREATE UNIQUE INDEX IF NOT EXISTS "NoticeBoard_deletion_request_id_key"
  ON public."NoticeBoard" (deletion_request_id)
  WHERE deletion_request_id IS NOT NULL;

ALTER TABLE public."TierRequest"
  DROP CONSTRAINT IF EXISTS "TierRequest_kind_check";
ALTER TABLE public."TierRequest"
  ADD CONSTRAINT "TierRequest_kind_check"
  CHECK (kind IN ('structure', 'promotion', 'assignment', 'notice_delete', 'member_tier_change'));

-- Delete the selected announcement and append its removal audit entry atomically.
CREATE OR REPLACE FUNCTION public.delete_approved_notice(
  _notice_id text,
  _request_id text,
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
  v_notice record;
  v_removal record;
BEGIN
  IF _notice_id IS NULL OR _actor_id IS NULL OR _actor_name IS NULL THEN
    RAISE EXCEPTION 'Notice and approver are required';
  END IF;

  IF _request_id IS NOT NULL THEN
    SELECT * INTO v_removal
    FROM public."NoticeBoard"
    WHERE deletion_request_id = _request_id
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('removed', true, 'notice', to_jsonb(v_removal));
    END IF;
  END IF;

  SELECT * INTO v_notice
  FROM public."NoticeBoard"
  WHERE id = _notice_id AND kind = 'announcement'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That announcement no longer exists or cannot be removed';
  END IF;

  DELETE FROM public."NoticeBoard" WHERE id = v_notice.id;

  INSERT INTO public."NoticeBoard" (
    kind, title, body, actor_id, actor_name, deletion_request_id
  ) VALUES (
    'notice_removal',
    'Notice removed after approval',
    format(
      '“%s” posted by %s on %s was removed after approval.',
      COALESCE(NULLIF(v_notice.title, ''), 'Announcement'),
      v_notice.actor_name,
      to_char(v_notice.created_date AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC'
    ),
    _actor_id,
    _actor_name,
    _request_id
  ) RETURNING * INTO v_removal;

  RETURN jsonb_build_object('removed', true, 'notice', to_jsonb(v_removal));
END;
$$;

REVOKE ALL ON FUNCTION public.delete_approved_notice(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_approved_notice(text, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
