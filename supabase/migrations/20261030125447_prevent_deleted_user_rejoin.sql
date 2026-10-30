-- Deleted Auth users may still present an access token until it expires.
-- Prevent those stale tokens from creating a new chat membership.
CREATE OR REPLACE FUNCTION public.join_with_code(join_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_variable
DECLARE
  current_user_id uuid := auth.uid();
  current_email text := coalesce(auth.jwt() ->> 'email', '');
  current_name text := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1),
    'Member'
  );
  existing_membership public."Membership"%rowtype;
  created_membership public."Membership"%rowtype;
  expected_join_code text;
  undistributed_title_id text;
  fallback_color text;
BEGIN
  IF current_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  -- Removing a user from Auth does not immediately invalidate already-issued
  -- JWTs, so verify that the identity still exists before honoring this RPC.
  IF NOT EXISTS (SELECT 1 FROM auth.users AS auth_user WHERE auth_user.id = current_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'This account has been deleted.');
  END IF;

  SELECT membership_row.*
  INTO existing_membership
  FROM public."Membership" AS membership_row
  WHERE membership_row.user_id::text = current_user_id::text
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'membership', to_jsonb(existing_membership));
  END IF;

  SELECT app_config.join_code
  INTO expected_join_code
  FROM public."AppConfig" AS app_config
  ORDER BY app_config.created_date DESC
  LIMIT 1;

  IF expected_join_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Joining is closed right now.');
  END IF;

  IF lower(trim(coalesce($1, ''))) <> lower(trim(expected_join_code)) THEN
    RETURN jsonb_build_object('success', false, 'message', 'That code does not match.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('circlesync:undistributed-title'));
  SELECT title.id::text
  INTO undistributed_title_id
  FROM public."Title" AS title
  WHERE lower(trim(title.name)) = 'undistributed'
  ORDER BY title.id
  LIMIT 1;

  IF undistributed_title_id IS NULL THEN
    LOOP
      fallback_color := '#' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public."Title" AS title
        WHERE lower(title.color) = lower(fallback_color)
      );
    END LOOP;

    undistributed_title_id := left(replace(gen_random_uuid()::text, '-', ''), 24);
    INSERT INTO public."Title" (id, name, color, tier_type)
    VALUES (undistributed_title_id, 'undistributed', fallback_color, 'standard');
  END IF;

  INSERT INTO public."Membership" (
    id, user_id, user_email, full_name, title_ids, created_date
  ) VALUES (
    left(replace(gen_random_uuid()::text, '-', ''), 24),
    current_user_id::text,
    nullif(current_email, ''),
    current_name,
    jsonb_build_array(undistributed_title_id),
    now()
  )
  RETURNING * INTO created_membership;

  RETURN jsonb_build_object('success', true, 'membership', to_jsonb(created_membership));
END;
$$;

REVOKE ALL ON FUNCTION public.join_with_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_with_code(text) TO authenticated, service_role;

-- Enable immediate Notice Board updates for members who already have it open.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'NoticeBoard'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."NoticeBoard";
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
