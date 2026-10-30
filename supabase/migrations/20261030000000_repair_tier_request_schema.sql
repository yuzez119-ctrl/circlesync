-- The live legacy TierRequest table originally contained only id and created_at.
-- Add the fields used by tier-admin and the Admin Requests panel.
alter table public."TierRequest"
  add column if not exists kind text,
  add column if not exists summary text,
  add column if not exists payload jsonb,
  add column if not exists proposed_by text,
  add column if not exists proposed_by_name text,
  add column if not exists status text,
  add column if not exists approvals jsonb,
  add column if not exists resolved_by_name text,
  add column if not exists created_date timestamptz;

-- Keep any pre-existing incomplete shell rows out of the pending approval queue.
update public."TierRequest"
set kind = coalesce(kind, 'structure'),
    summary = coalesce(summary, 'Archived incomplete legacy request'),
    payload = coalesce(payload, '{}'::jsonb),
    proposed_by = coalesce(proposed_by, 'legacy'),
    proposed_by_name = coalesce(proposed_by_name, 'Legacy request'),
    status = coalesce(status, 'rejected'),
    approvals = coalesce(approvals, '[]'::jsonb),
    created_date = coalesce(created_date, created_at, now())
where kind is null
   or summary is null
   or payload is null
   or proposed_by is null
   or proposed_by_name is null
   or status is null
   or approvals is null
   or created_date is null;

alter table public."TierRequest"
  alter column kind set not null,
  alter column summary set not null,
  alter column payload set default '{}'::jsonb,
  alter column payload set not null,
  alter column proposed_by set not null,
  alter column proposed_by_name set not null,
  alter column status set default 'pending',
  alter column status set not null,
  alter column approvals set default '[]'::jsonb,
  alter column approvals set not null,
  alter column created_date set default now(),
  alter column created_date set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public."TierRequest"'::regclass
      and conname = 'TierRequest_kind_check'
  ) then
    alter table public."TierRequest"
      add constraint "TierRequest_kind_check"
      check (kind in ('structure', 'promotion', 'assignment'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public."TierRequest"'::regclass
      and conname = 'TierRequest_status_check'
  ) then
    alter table public."TierRequest"
      add constraint "TierRequest_status_check"
      check (status in ('pending', 'applied', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public."TierRequest"'::regclass
      and conname = 'TierRequest_approvals_array_check'
  ) then
    alter table public."TierRequest"
      add constraint "TierRequest_approvals_array_check"
      check (jsonb_typeof(approvals) = 'array');
  end if;
end;
$$;

create index if not exists "TierRequest_status_created_date_idx"
  on public."TierRequest" (status, created_date desc);

notify pgrst, 'reload schema';
