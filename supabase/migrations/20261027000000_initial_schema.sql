create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('user', 'founder')),
  created_date timestamptz not null default now()
);

create table public.titles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null unique,
  tier_type text not null default 'standard' check (tier_type in ('standard', 'admin', 'founder')),
  created_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  user_email text,
  full_name text,
  title_ids jsonb not null default '[]'::jsonb,
  created_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  allowed_title_ids jsonb not null default '[]'::jsonb,
  created_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  body text not null default '',
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text,
  author_title_id uuid references public.titles (id) on delete set null,
  attachments jsonb not null default '[]'::jsonb,
  created_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null
);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  sender_name text,
  sender_title_id uuid references public.titles (id) on delete set null,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  recipient_name text,
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null,
  check (sender_id <> recipient_id)
);

create table public.member_names (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null,
  created_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null
);

create table public.read_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (scope in ('channel', 'direct')),
  target_id uuid not null,
  last_read_at timestamptz not null default now(),
  created_date timestamptz not null default now(),
  unique (user_id, scope, target_id)
);

create table public.app_config (
  id uuid primary key default gen_random_uuid(),
  join_code text not null,
  created_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null
);

create table public.tier_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('structure', 'promotion', 'assignment')),
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  proposed_by uuid references auth.users (id) on delete set null,
  proposed_by_name text,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  approvals jsonb not null default '[]'::jsonb,
  resolved_by_name text,
  created_date timestamptz not null default now(),
  created_by_id uuid references auth.users (id) on delete set null
);

create index messages_channel_created_idx on public.messages (channel_id, created_date desc);
create index direct_messages_sender_created_idx on public.direct_messages (sender_id, created_date desc);
create index direct_messages_recipient_created_idx on public.direct_messages (recipient_id, created_date desc);
create index tier_requests_status_created_idx on public.tier_requests (status, created_date desc);
create index read_states_user_target_idx on public.read_states (user_id, scope, target_id);

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do update set email = excluded.email, full_name = coalesce(profiles.full_name, excluded.full_name);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create function public.prevent_profile_role_change()
returns trigger language plpgsql set search_path = public
as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role then
    raise exception 'Profile roles can only be changed by a trusted administrator';
  end if;
  return new;
end;
$$;

create trigger protect_profile_role
before update on public.profiles
for each row execute procedure public.prevent_profile_role_change();

create function public.is_chat_member()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.memberships where user_id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'founder');
$$;

create function public.is_chat_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'founder')
    or exists (
      select 1
      from public.memberships m
      join public.titles t on m.title_ids ? t.id::text
      where m.user_id = auth.uid() and t.tier_type = 'admin'
    );
$$;

create function public.can_access_channel(channel uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_chat_member() and exists (
    select 1 from public.channels c
    where c.id = channel and (
      jsonb_array_length(c.allowed_title_ids) = 0
      or exists (
        select 1 from public.memberships m
        where m.user_id = auth.uid()
          and m.title_ids ?| array(select jsonb_array_elements_text(c.allowed_title_ids))
      )
      or exists (select 1 from public.profiles where id = auth.uid() and role = 'founder')
    )
  );
$$;

create function public.join_with_code(join_code text default null)
returns public.memberships language plpgsql security definer set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  profile public.profiles;
  existing public.memberships;
  founder_titles jsonb := '[]'::jsonb;
  expected_code text;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  select * into profile from public.profiles where id = current_user_id;
  if profile.id is null then raise exception 'User profile not found'; end if;
  select * into existing from public.memberships where user_id = current_user_id;
  if existing.id is not null then return existing; end if;

  if profile.role <> 'founder' then
    select config.join_code into expected_code from public.app_config config order by config.created_date desc limit 1;
    if expected_code is null then raise exception 'Joining is closed right now.'; end if;
    if lower(trim(coalesce(join_code, ''))) <> lower(trim(expected_code)) then raise exception 'That code does not match.'; end if;
  else
    select coalesce(jsonb_agg(id::text), '[]'::jsonb) into founder_titles from public.titles where tier_type = 'founder';
  end if;

  insert into public.memberships (user_id, user_email, full_name, title_ids, created_by_id)
  values (current_user_id, profile.email, coalesce(profile.full_name, profile.email), founder_titles, current_user_id)
  returning * into existing;
  return existing;
end;
$$;

create function public.can_read_attachment(file_path text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.messages m
    where m.attachments @> jsonb_build_array(jsonb_build_object('file_uri', file_path))
      and public.can_access_channel(m.channel_id)
  ) or exists (
    select 1 from public.direct_messages m
    where m.attachments @> jsonb_build_array(jsonb_build_object('file_uri', file_path))
      and public.is_chat_member()
      and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
  );
$$;

alter table public.profiles enable row level security;
alter table public.titles enable row level security;
alter table public.memberships enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.direct_messages enable row level security;
alter table public.member_names enable row level security;
alter table public.read_states enable row level security;
alter table public.app_config enable row level security;
alter table public.tier_requests enable row level security;

create policy "Users can read their profile and members can read profiles" on public.profiles for select using (id = auth.uid() or public.is_chat_member());
create policy "Users can update their profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "Members can read titles" on public.titles for select using (public.is_chat_member());
create policy "Admins manage titles" on public.titles for all using (public.is_chat_admin()) with check (public.is_chat_admin());
create policy "Members can read memberships" on public.memberships for select using (public.is_chat_member());
create policy "Admins manage memberships" on public.memberships for all using (public.is_chat_admin()) with check (public.is_chat_admin());
create policy "Members read channels they can access" on public.channels for select using (public.can_access_channel(id));
create policy "Admins manage channels" on public.channels for all using (public.is_chat_admin()) with check (public.is_chat_admin());
create policy "Members read accessible channel messages" on public.messages for select using (public.can_access_channel(channel_id));
create policy "Members post accessible channel messages" on public.messages for insert with check (author_id = auth.uid() and public.can_access_channel(channel_id));
create policy "Authors or admins update messages" on public.messages for update using (author_id = auth.uid() or public.is_chat_admin()) with check (author_id = auth.uid() or public.is_chat_admin());
create policy "Authors or admins delete messages" on public.messages for delete using (author_id = auth.uid() or public.is_chat_admin());
create policy "Members read their direct messages" on public.direct_messages for select using (public.is_chat_member() and (sender_id = auth.uid() or recipient_id = auth.uid()));
create policy "Members send direct messages" on public.direct_messages for insert with check (public.is_chat_member() and sender_id = auth.uid());
create policy "Senders update direct messages" on public.direct_messages for update using (sender_id = auth.uid()) with check (sender_id = auth.uid());
create policy "Senders delete direct messages" on public.direct_messages for delete using (sender_id = auth.uid());
create policy "Members read display names" on public.member_names for select using (public.is_chat_member());
create policy "Users manage own display name" on public.member_names for all using (user_id = auth.uid() or public.is_chat_admin()) with check (user_id = auth.uid() or public.is_chat_admin());
create policy "Users manage own read states" on public.read_states for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Admins manage app config" on public.app_config for all using (public.is_chat_admin()) with check (public.is_chat_admin());
create policy "Admins read tier requests" on public.tier_requests for select using (public.is_chat_admin());

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', false, 26214400)
on conflict (id) do nothing;

create policy "Members can read referenced chat attachments" on storage.objects for select using (bucket_id = 'chat-attachments' and public.can_read_attachment(name));
create policy "Members can upload own chat attachments" on storage.objects for insert with check (bucket_id = 'chat-attachments' and public.is_chat_member() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete own chat attachments" on storage.objects for delete using (bucket_id = 'chat-attachments' and (owner_id = auth.uid()::text or public.is_chat_admin()));

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.direct_messages;
alter publication supabase_realtime add table public.member_names;
alter publication supabase_realtime add table public.channels;
alter publication supabase_realtime add table public.memberships;
alter publication supabase_realtime add table public.titles;
