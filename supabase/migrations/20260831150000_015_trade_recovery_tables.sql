-- Canonical executed-trade reconciliation layer.
--
-- ESPN's league activity feed preserves proposal/review/vote lifecycle events,
-- but older seasons do not consistently attach final-state player movement to
-- the public-facing TRADE_ACCEPT row. The deeper kona_playercard history does.
-- These private tables store only the verified executed trades recovered from
-- that endpoint; raw league_transactions remain unchanged for auditability.

begin;

create schema if not exists private;

create table if not exists private.transaction_trade_recovery (
  season_year integer not null,
  espn_transaction_id text not null,
  related_transaction_id text,
  scoring_period integer,
  transaction_date_ms bigint,
  transaction_date timestamptz,
  team_id integer,
  source text not null default 'ESPN kona_playercard',
  recovered_at timestamptz not null default now(),
  primary key (season_year, espn_transaction_id)
);

create table if not exists private.transaction_trade_recovery_items (
  season_year integer not null,
  espn_transaction_id text not null,
  item_index integer not null,
  item_type text,
  player_id bigint,
  player_name text,
  from_team_id integer,
  to_team_id integer,
  primary key (season_year, espn_transaction_id, item_index),
  foreign key (season_year, espn_transaction_id)
    references private.transaction_trade_recovery(season_year, espn_transaction_id)
    on delete cascade
);

revoke all on private.transaction_trade_recovery from public, anon, authenticated;
revoke all on private.transaction_trade_recovery_items from public, anon, authenticated;
grant all on private.transaction_trade_recovery to service_role;
grant all on private.transaction_trade_recovery_items to service_role;

create index if not exists transaction_trade_recovery_season_date_idx
  on private.transaction_trade_recovery(season_year, transaction_date_ms desc);

comment on table private.transaction_trade_recovery is
  'Verified executed ESPN fantasy trades recovered from kona_playercard transaction history.';
comment on table private.transaction_trade_recovery_items is
  'Traded-player legs for verified executed ESPN fantasy trades; roster-space drops are intentionally excluded.';

commit;
