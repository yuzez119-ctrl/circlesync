drop policy if exists "Members read channels they can access" on public.channels;
drop policy if exists "Members read accessible channel messages" on public.messages;
drop policy if exists "Members post accessible channel messages" on public.messages;
drop policy if exists "Members can read referenced chat attachments" on storage.objects;

-- Drop channel foreign keys before converting both sides to text.
do $$
declare
  foreign_key record;
begin
  for foreign_key in
    select constraint_row.conrelid::regclass as table_name, constraint_row.conname
    from pg_constraint as constraint_row
    join pg_attribute as source_column
      on source_column.attrelid = constraint_row.conrelid
      and source_column.attnum = any(constraint_row.conkey)
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.channels'::regclass
      and source_column.attname = 'channel_id'
      and constraint_row.conrelid in ('public.messages'::regclass, 'public.memberships'::regclass)
  loop
    execute format('alter table %s drop constraint %I', foreign_key.table_name, foreign_key.conname);
  end loop;
end;
$$;

alter table public.channels alter column id drop default;
alter table public.channels alter column id type text using id::text;
alter table public.channels alter column id set default (gen_random_uuid()::text);
alter table public.messages alter column channel_id type text using channel_id::text;
alter table public.read_states alter column target_id type text using target_id::text;

create or replace function public.can_access_channel(channel text)
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

create or replace function public.can_read_attachment(file_path text)
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

-- The app's standard schema has no memberships.channel_id, but convert it when present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'memberships'
      and column_name = 'channel_id'
  ) then
    alter table public.memberships alter column channel_id type text using channel_id::text;
    alter table public.memberships
      add constraint memberships_channel_id_fkey
      foreign key (channel_id) references public.channels (id) on delete cascade;
  end if;
end;
$$;

alter table public.messages
  add constraint messages_channel_id_fkey
  foreign key (channel_id) references public.channels (id) on delete cascade;

create policy "Members read channels they can access"
on public.channels for select using (public.can_access_channel(id));
create policy "Members read accessible channel messages"
on public.messages for select using (public.can_access_channel(channel_id));
create policy "Members post accessible channel messages"
on public.messages for insert
with check (author_id = auth.uid() and public.can_access_channel(channel_id));
create policy "Members can read referenced chat attachments"
on storage.objects for select
using (bucket_id = 'chat-attachments' and public.can_read_attachment(name));

grant execute on function public.can_access_channel(text) to authenticated;
grant execute on function public.can_read_attachment(text) to authenticated;
revoke all on function public.can_access_channel(text) from public, anon;
revoke all on function public.can_read_attachment(text) from public, anon;
revoke all on function public.can_access_channel(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
