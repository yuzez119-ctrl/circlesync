-- Tighten access for the live CamelCase schema used by CircleSync.
-- This is intentionally separate from the earlier lowercase-table migrations.

create or replace function public.is_chat_member()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
set row_security = off
as $$
  select auth.uid() is not null and exists (
    select 1
    from public."Membership" as membership
    where membership.user_id = auth.uid()::text
  );
$$;

create or replace function public.is_chat_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
set row_security = off
as $$
  select auth.uid() is not null and exists (
    select 1
    from public."Membership" as membership
    cross join lateral jsonb_array_elements_text(
      case
        when jsonb_typeof(membership.title_ids) = 'array' then membership.title_ids
        else '[]'::jsonb
      end
    ) as held(title_id)
    join public."Title" as title on title.id = held.title_id
    where membership.user_id = auth.uid()::text
      and title.tier_type in ('admin', 'founder')
  );
$$;

create or replace function public.can_access_channel(_channel_id text)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
set row_security = off
as $$
  select public.is_chat_member() and exists (
    select 1
    from public."Channel" as channel
    where channel.id = _channel_id
      and (
        channel.allowed_title_ids is null
        or channel.allowed_title_ids = '[]'::jsonb
        or (
          jsonb_typeof(channel.allowed_title_ids) = 'array'
          and exists (
            select 1
            from public."Membership" as membership
            cross join lateral jsonb_array_elements_text(
              case
                when jsonb_typeof(membership.title_ids) = 'array' then membership.title_ids
                else '[]'::jsonb
              end
            ) as held(title_id)
            cross join lateral jsonb_array_elements_text(channel.allowed_title_ids) as allowed(title_id)
            where membership.user_id = auth.uid()::text
              and held.title_id = allowed.title_id
          )
        )
      )
  );
$$;

revoke all on function public.is_chat_member() from public, anon;
revoke all on function public.is_chat_admin() from public, anon;
revoke all on function public.can_access_channel(text) from public, anon;
grant execute on function public.is_chat_member() to authenticated, service_role;
grant execute on function public.is_chat_admin() to authenticated, service_role;
grant execute on function public.can_access_channel(text) to authenticated, service_role;

revoke all on function public.join_with_code(text) from public, anon;
grant execute on function public.join_with_code(text) to authenticated, service_role;

alter table public."AppConfig" enable row level security;
alter table public."Channel" enable row level security;
alter table public."DirectMessage" enable row level security;
alter table public."MemberName" enable row level security;
alter table public."Membership" enable row level security;
alter table public."Message" enable row level security;
alter table public."ReadState" enable row level security;
alter table public."TierRequest" enable row level security;
alter table public."Title" enable row level security;

drop policy if exists "Enable read access for all users" on public."AppConfig";
drop policy if exists "Enable read access for all users" on public."Channel";
drop policy if exists "Enable insert for authenticated users only" on public."DirectMessage";
drop policy if exists "Enable read access for all users" on public."DirectMessage";
drop policy if exists "Enable read access for all users" on public."MemberName";
drop policy if exists "Enable insert for authenticated users only" on public."Membership";
drop policy if exists "Enable read access for all users" on public."Membership";
drop policy if exists "Enable insert for authenticated users only" on public."Message";
drop policy if exists "Enable read access for all users" on public."Message";
drop policy if exists "Enable read access for all users" on public."ReadState";
drop policy if exists "Enable read access for all users" on public."TierRequest";
drop policy if exists "Enable read access for all users" on public."Title";

drop policy if exists "Admins manage app config" on public."AppConfig";
create policy "Admins manage app config" on public."AppConfig"
  for all to authenticated
  using (public.is_chat_admin())
  with check (public.is_chat_admin());

drop policy if exists "Members read accessible channels" on public."Channel";
create policy "Members read accessible channels" on public."Channel"
  for select to authenticated
  using (public.can_access_channel(id));
drop policy if exists "Admins manage channels" on public."Channel";
create policy "Admins manage channels" on public."Channel"
  for all to authenticated
  using (public.is_chat_admin())
  with check (public.is_chat_admin());

drop policy if exists "Members read their direct messages" on public."DirectMessage";
create policy "Members read their direct messages" on public."DirectMessage"
  for select to authenticated
  using (
    public.is_chat_member()
    and (sender_id = auth.uid()::text or recipient_id = auth.uid()::text)
  );
drop policy if exists "Members send direct messages" on public."DirectMessage";
create policy "Members send direct messages" on public."DirectMessage"
  for insert to authenticated
  with check (
    public.is_chat_member()
    and sender_id = auth.uid()::text
    and exists (
      select 1 from public."Membership" as recipient
      where recipient.user_id = recipient_id
    )
  );

drop policy if exists "Members read display names" on public."MemberName";
create policy "Members read display names" on public."MemberName"
  for select to authenticated
  using (public.is_chat_member());
drop policy if exists "Users manage their own display name" on public."MemberName";
create policy "Users manage their own display name" on public."MemberName"
  for all to authenticated
  using (public.is_chat_member() and user_id = auth.uid()::text)
  with check (public.is_chat_member() and user_id = auth.uid()::text);

drop policy if exists "Members read memberships" on public."Membership";
create policy "Members read memberships" on public."Membership"
  for select to authenticated
  using (public.is_chat_member());

drop policy if exists "Members read accessible messages" on public."Message";
create policy "Members read accessible messages" on public."Message"
  for select to authenticated
  using (public.can_access_channel(channel_id));
drop policy if exists "Members send messages to accessible channels" on public."Message";
create policy "Members send messages to accessible channels" on public."Message"
  for insert to authenticated
  with check (
    author_id = auth.uid()::text
    and public.can_access_channel(channel_id)
  );

drop policy if exists "Users read their own read states" on public."ReadState";
create policy "Users read their own read states" on public."ReadState"
  for select to authenticated
  using (user_id = auth.uid()::text);
drop policy if exists "Users create their own read states" on public."ReadState";
create policy "Users create their own read states" on public."ReadState"
  for insert to authenticated
  with check (public.is_chat_member() and user_id = auth.uid()::text);
drop policy if exists "Users update their own read states" on public."ReadState";
create policy "Users update their own read states" on public."ReadState"
  for update to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

drop policy if exists "Admins read tier requests" on public."TierRequest";
create policy "Admins read tier requests" on public."TierRequest"
  for select to authenticated
  using (public.is_chat_admin());

drop policy if exists "Members read titles" on public."Title";
create policy "Members read titles" on public."Title"
  for select to authenticated
  using (public.is_chat_member());

revoke all privileges on table
  public."AppConfig",
  public."Channel",
  public."DirectMessage",
  public."MemberName",
  public."Membership",
  public."Message",
  public."ReadState",
  public."TierRequest",
  public."Title"
from public, anon, authenticated;

grant select, insert, update, delete on table public."AppConfig" to authenticated;
grant select, insert, update, delete on table public."Channel" to authenticated;
grant select, insert on table public."DirectMessage" to authenticated;
grant select, insert, update, delete on table public."MemberName" to authenticated;
grant select on table public."Membership" to authenticated;
grant select, insert on table public."Message" to authenticated;
grant select, insert, update on table public."ReadState" to authenticated;
grant select on table public."TierRequest" to authenticated;
grant select on table public."Title" to authenticated;

notify pgrst, 'reload schema';
