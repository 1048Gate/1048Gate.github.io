-- 1048 Gate League Content Manager upgrade
-- Safe migration: adds richer admin fields without deleting or replacing existing data.

alter table public.league_champions
  add column if not exists champion_team text not null default '',
  add column if not exists runner_up text not null default '',
  add column if not exists championship_score text not null default '';

alter table public.league_records
  add column if not exists holder text not null default '',
  add column if not exists season_context text not null default '';

alter table public.wall_of_shame
  add column if not exists season_year integer,
  add column if not exists member_team text not null default '',
  add column if not exists punishment text not null default '';

-- Backfill the richer fields where the old free-text fields already contain data.
update public.league_records
set holder = detail
where holder = '' and detail <> '';

update public.wall_of_shame
set punishment = note
where punishment = '' and note <> '';
