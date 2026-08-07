-- 1048 Gate editable league content
-- Run this in Supabase SQL Editor after auth_roles.sql.

create table if not exists public.league_members (
  id uuid primary key default gen_random_uuid(),
  member_number text not null unique,
  name text not null,
  role_label text not null default 'League Member',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_seasons (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.league_members(id) on delete cascade,
  season_year integer not null,
  final_finish integer not null check (final_finish between 1 and 99),
  team_name text not null,
  record text not null,
  points_for numeric,
  points_against numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(member_id, season_year)
);

create table if not exists public.league_champions (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null unique,
  champion text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_records (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  value text not null,
  detail text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wall_of_shame (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text not null default '',
  icon text not null default '💩',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.league_members enable row level security;
alter table public.member_seasons enable row level security;
alter table public.league_champions enable row level security;
alter table public.league_records enable row level security;
alter table public.wall_of_shame enable row level security;

-- Everyone can read league content.
do $$
declare t text;
begin
  foreach t in array array['league_members','member_seasons','league_champions','league_records','wall_of_shame']
  loop
    execute format('drop policy if exists "public read %s" on public.%I', t, t);
    execute format('create policy "public read %s" on public.%I for select to anon, authenticated using (true)', t, t);
  end loop;
end $$;

-- Only the site admin can change historical/member site data.
do $$
declare t text;
begin
  foreach t in array array['league_members','member_seasons','league_champions','league_records','wall_of_shame']
  loop
    execute format('drop policy if exists "site admin insert %s" on public.%I', t, t);
    execute format('create policy "site admin insert %s" on public.%I for insert to authenticated with check (public.current_user_role() = ''site_admin'')', t, t);
    execute format('drop policy if exists "site admin update %s" on public.%I', t, t);
    execute format('create policy "site admin update %s" on public.%I for update to authenticated using (public.current_user_role() = ''site_admin'') with check (public.current_user_role() = ''site_admin'')', t, t);
    execute format('drop policy if exists "site admin delete %s" on public.%I', t, t);
    execute format('create policy "site admin delete %s" on public.%I for delete to authenticated using (public.current_user_role() = ''site_admin'')', t, t);
  end loop;
end $$;

-- Add the editable content tables to Realtime if needed.
do $$
declare t text;
begin
  foreach t in array array['league_members','member_seasons','league_champions','league_records','wall_of_shame']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
