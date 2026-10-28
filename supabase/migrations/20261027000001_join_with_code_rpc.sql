create or replace function public.join_with_code(join_code text default null)
returns public.memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  profile public.profiles%rowtype;
  existing public.memberships%rowtype;
  founder_titles jsonb := '[]'::jsonb;
  expected_code text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into profile
  from public.profiles
  where id = current_user_id;

  if profile.id is null then
    raise exception 'User profile not found';
  end if;

  select * into existing
  from public.memberships
  where user_id = current_user_id;

  if existing.id is not null then
    return existing;
  end if;

  if profile.role <> 'founder' then
    select config.join_code into expected_code
    from public.app_config as config
    order by config.created_date desc
    limit 1;

    if expected_code is null then
      raise exception 'Joining is closed right now.';
    end if;

    if lower(trim(coalesce(join_code, ''))) <> lower(trim(expected_code)) then
      raise exception 'That code does not match.';
    end if;
  else
    select coalesce(jsonb_agg(title.id::text), '[]'::jsonb)
    into founder_titles
    from public.titles as title
    where title.tier_type = 'founder';
  end if;

  insert into public.memberships (
    user_id,
    user_email,
    full_name,
    title_ids,
    created_by_id
  )
  values (
    current_user_id,
    profile.email,
    coalesce(profile.full_name, profile.email),
    founder_titles,
    current_user_id
  )
  on conflict (user_id) do update
    set user_id = excluded.user_id
  returning * into existing;

  return existing;
end;
$$;

revoke all on function public.join_with_code(text) from public, anon;
grant execute on function public.join_with_code(text) to authenticated;

notify pgrst, 'reload schema';
