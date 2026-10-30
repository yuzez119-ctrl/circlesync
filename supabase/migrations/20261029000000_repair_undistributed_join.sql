-- Ensure new members always receive the reserved default Title, even when the
-- earlier seed migration was skipped or the Title was removed later.
create or replace function public.join_with_code(join_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
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
begin
  if current_user_id is null then
    return jsonb_build_object('success', false, 'message', 'Authentication required.');
  end if;

  select membership_row.*
  into existing_membership
  from public."Membership" as membership_row
  where membership_row.user_id::text = current_user_id::text
  limit 1;

  if found then
    return jsonb_build_object('success', true, 'membership', to_jsonb(existing_membership));
  end if;

  select app_config.join_code
  into expected_join_code
  from public."AppConfig" as app_config
  order by app_config.created_date desc
  limit 1;

  if expected_join_code is null then
    return jsonb_build_object('success', false, 'message', 'Joining is closed right now.');
  end if;

  if lower(trim(coalesce($1, ''))) <> lower(trim(expected_join_code)) then
    return jsonb_build_object('success', false, 'message', 'That code does not match.');
  end if;

  -- Serialize first-time joins so concurrent requests cannot create duplicate
  -- reserved Titles. This also repairs projects where the seed migration was
  -- never run or the Title was deleted.
  perform pg_advisory_xact_lock(hashtext('circlesync:undistributed-title'));
  select title.id::text
  into undistributed_title_id
  from public."Title" as title
  where lower(trim(title.name)) = 'undistributed'
  order by title.id
  limit 1;

  if undistributed_title_id is null then
    loop
      fallback_color := '#' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      exit when not exists (
        select 1 from public."Title" as title
        where lower(title.color) = lower(fallback_color)
      );
    end loop;

    undistributed_title_id := left(replace(gen_random_uuid()::text, '-', ''), 24);
    insert into public."Title" (id, name, color, tier_type)
    values (undistributed_title_id, 'undistributed', fallback_color, 'standard');
  end if;

  insert into public."Membership" (
    id,
    user_id,
    user_email,
    full_name,
    title_ids,
    created_date
  )
  values (
    left(replace(gen_random_uuid()::text, '-', ''), 24),
    current_user_id::text,
    nullif(current_email, ''),
    current_name,
    jsonb_build_array(undistributed_title_id),
    now()
  )
  returning * into created_membership;

  return jsonb_build_object('success', true, 'membership', to_jsonb(created_membership));
end;
$$;

revoke all on function public.join_with_code(text) from public, anon;
grant execute on function public.join_with_code(text) to authenticated;

notify pgrst, 'reload schema';
