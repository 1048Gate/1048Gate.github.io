-- 1048 Gate historical playoff brackets
-- Run in Supabase SQL Editor after league_content.sql / auth_roles.sql.

create table if not exists public.playoff_seasons (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null unique,
  champion text,
  runner_up text,
  third_place text,
  consolation_winner text,
  summary_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playoff_matchups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.playoff_seasons(id) on delete cascade,
  bracket_type text not null check (bracket_type in ('championship','consolation')),
  round_key text not null,
  round_label text not null,
  round_order integer not null default 1,
  matchup_order integer not null default 1,
  team1_seed integer,
  team1_name text not null,
  team1_owner text not null default '',
  team1_score numeric,
  team2_seed integer,
  team2_name text not null,
  team2_owner text not null default '',
  team2_score numeric,
  winner_slot integer check (winner_slot in (1,2)),
  placement_label text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists playoff_matchups_season_idx on public.playoff_matchups(season_id);
create index if not exists playoff_matchups_sort_idx on public.playoff_matchups(season_id, bracket_type, round_order, matchup_order);

alter table public.playoff_seasons enable row level security;
alter table public.playoff_matchups enable row level security;

drop policy if exists "public read playoff seasons" on public.playoff_seasons;
create policy "public read playoff seasons"
on public.playoff_seasons for select
to anon, authenticated
using (true);

drop policy if exists "public read playoff matchups" on public.playoff_matchups;
create policy "public read playoff matchups"
on public.playoff_matchups for select
to anon, authenticated
using (true);

-- Historical bracket data is maintained by the site admin.
drop policy if exists "site admin insert playoff seasons" on public.playoff_seasons;
create policy "site admin insert playoff seasons"
on public.playoff_seasons for insert
to authenticated
with check (public.current_user_role() = 'site_admin');

drop policy if exists "site admin update playoff seasons" on public.playoff_seasons;
create policy "site admin update playoff seasons"
on public.playoff_seasons for update
to authenticated
using (public.current_user_role() = 'site_admin')
with check (public.current_user_role() = 'site_admin');

drop policy if exists "site admin delete playoff seasons" on public.playoff_seasons;
create policy "site admin delete playoff seasons"
on public.playoff_seasons for delete
to authenticated
using (public.current_user_role() = 'site_admin');

drop policy if exists "site admin insert playoff matchups" on public.playoff_matchups;
create policy "site admin insert playoff matchups"
on public.playoff_matchups for insert
to authenticated
with check (public.current_user_role() = 'site_admin');

drop policy if exists "site admin update playoff matchups" on public.playoff_matchups;
create policy "site admin update playoff matchups"
on public.playoff_matchups for update
to authenticated
using (public.current_user_role() = 'site_admin')
with check (public.current_user_role() = 'site_admin');

drop policy if exists "site admin delete playoff matchups" on public.playoff_matchups;
create policy "site admin delete playoff matchups"
on public.playoff_matchups for delete
to authenticated
using (public.current_user_role() = 'site_admin');

-- Realtime support.
do $$
declare t text;
begin
  foreach t in array array['playoff_seasons','playoff_matchups']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
