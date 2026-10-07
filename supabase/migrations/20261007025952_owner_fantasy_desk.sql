create table public.fantasy_owner_access (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table public.fantasy_owner_access enable row level security;
revoke all on public.fantasy_owner_access from anon, authenticated;
grant select on public.fantasy_owner_access to authenticated;
grant all on public.fantasy_owner_access to service_role;
create policy "owner reads own access" on public.fantasy_owner_access
for select to authenticated using (user_id = (select auth.uid()));

create table public.fantasy_snapshots (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  week integer not null check (week between 1 and 25),
  fetched_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  unique (season, fetched_at)
);
create index fantasy_snapshots_latest on public.fantasy_snapshots (fetched_at desc);
alter table public.fantasy_snapshots enable row level security;
revoke all on public.fantasy_snapshots from anon, authenticated;
grant select on public.fantasy_snapshots to authenticated;
grant all on public.fantasy_snapshots to service_role;
create policy "only owner reads fantasy snapshots" on public.fantasy_snapshots
for select to authenticated using (
  exists (select 1 from public.fantasy_owner_access where user_id = (select auth.uid()))
);
