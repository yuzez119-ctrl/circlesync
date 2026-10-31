-- The restored legacy Channel table had nullable IDs and no ID default. Its
-- rows therefore reached the client with id=null, making channel mutations
-- filter on `id=eq.null` and silently match nothing.
update public."Channel"
set id = gen_random_uuid()::text
where id is null or btrim(id) = '';

alter table public."Channel"
  alter column id set default (gen_random_uuid()::text),
  alter column id set not null;

create unique index if not exists channel_id_unique_idx
  on public."Channel" (id);
