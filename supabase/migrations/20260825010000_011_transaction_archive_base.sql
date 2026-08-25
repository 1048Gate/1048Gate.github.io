-- 1048 Gate transaction archive import baseline.
-- Raw ESPN payloads are retained for trusted imports only. Public browser access is
-- intentionally introduced later through a safe, field-limited RPC.

begin;

create table if not exists public.league_transactions (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null check (season_year >= 2019),
  espn_transaction_id text not null,
  scoring_period integer,
  transaction_type text,
  status text,
  team_id integer,
  team_name text,
  member_id text,
  bid_amount numeric,
  transaction_date_ms bigint,
  transaction_date timestamptz,
  item_count integer not null default 0 check (item_count >= 0),
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_year, espn_transaction_id)
);

create table if not exists public.league_transaction_items (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null check (season_year >= 2019),
  espn_transaction_id text not null,
  item_index integer not null check (item_index >= 0),
  item_type text,
  player_id bigint,
  player_name text,
  from_team_id integer,
  from_team_name text,
  to_team_id integer,
  to_team_name text,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_year, espn_transaction_id, item_index),
  foreign key (season_year, espn_transaction_id)
    references public.league_transactions(season_year, espn_transaction_id)
    on delete cascade
);

alter table public.league_transactions enable row level security;
alter table public.league_transaction_items enable row level security;

-- Imports use a trusted service role. No browser role receives base-table access.
revoke all on table public.league_transactions from public, anon, authenticated;
revoke all on table public.league_transaction_items from public, anon, authenticated;

grant all on table public.league_transactions to service_role;
grant all on table public.league_transaction_items to service_role;

commit;
