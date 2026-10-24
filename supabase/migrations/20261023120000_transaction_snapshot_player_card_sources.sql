-- Accept the daily player-card import (ESPN kona_playercard) without degrading
-- archive rows that came from the richer ESPN mTransactions2 feed.
--
-- * Allowed sources mirror ALLOWED_SOURCES in scripts/import_transactions_to_supabase.py
--   (scripts/test_import_transactions.py asserts they match).
-- * 'ESPN mTransactions2' keeps the original behaviour exactly (full overwrite, and
--   reconciliation/deletes when snapshot_complete is true).
-- * 'ESPN kona_playercard' is non-authoritative (player cards do not see failed
--   waivers or trade proposals): it may never reconcile/delete, never overwrites a
--   stored non-null column or raw_data key (it only fills gaps and inserts new
--   transactions), and never rewrites items of a transaction that already has
--   stored items (player-card item order/count differs from mTransactions2).
-- Idempotent: create or replace + re-asserted grants. No table, RLS or grant change
-- outside this function.
begin;
create or replace function public.import_transaction_snapshot(p_snapshot jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_allowed_sources constant text[] := array['ESPN mTransactions2', 'ESPN kona_playercard'];
  v_authoritative_source constant text := 'ESPN mTransactions2';
  v_season integer := (p_snapshot->>'season')::integer;
  v_stamp timestamptz := (p_snapshot->>'fetched_at')::timestamptz;
  v_complete boolean := coalesce((p_snapshot->>'snapshot_complete')::boolean, false);
  v_source text := p_snapshot->>'source';
  v_authoritative boolean;
begin
  if v_season is null or v_season < 2019 or v_stamp is null
     or p_snapshot->>'league_id' is distinct from '1237285'
     or not coalesce(v_source = any(v_allowed_sources), false)
     or jsonb_typeof(p_snapshot->'transactions') is distinct from 'array'
     or jsonb_typeof(p_snapshot->'items') is distinct from 'array'
     or (p_snapshot->>'transaction_count')::integer is distinct from jsonb_array_length(p_snapshot->'transactions')
     or (p_snapshot->>'item_count')::integer is distinct from jsonb_array_length(p_snapshot->'items') then
    raise exception 'Invalid transaction snapshot identity';
  end if;
  v_authoritative := v_source = v_authoritative_source;
  if v_complete and not v_authoritative then
    raise exception 'Only % snapshots may reconcile a season', v_authoritative_source;
  end if;
  perform pg_advisory_xact_lock(1048, v_season);
  if exists (select 1 from public.transaction_import_state where season_year=v_season and fetched_at>v_stamp) then
    raise exception 'Obsolete transaction snapshot';
  end if;
  create temporary table import_tx on commit drop as
    select * from jsonb_populate_recordset(null::public.league_transactions, p_snapshot->'transactions');
  create temporary table import_items on commit drop as
    select * from jsonb_populate_recordset(null::public.league_transaction_items, p_snapshot->'items');
  if exists (select 1 from import_tx where season_year is distinct from v_season
      or espn_transaction_id is null or btrim(espn_transaction_id)='' or item_count is null or item_count<0
      or raw_data->>'id' is distinct from espn_transaction_id or transaction_type='DRAFT')
    or exists (select 1 from import_tx group by espn_transaction_id having count(*)>1)
    or exists (select 1 from import_items group by espn_transaction_id,item_index having count(*)>1)
    or exists (select 1 from import_items i where season_year is distinct from v_season or item_index is null or item_index<0
      or not exists (select 1 from import_tx t where t.espn_transaction_id=i.espn_transaction_id))
    or exists (select 1 from import_tx t where item_count<>(select count(*) from import_items i where i.espn_transaction_id=t.espn_transaction_id)
      or exists (select 1 from import_items i where i.espn_transaction_id=t.espn_transaction_id and i.item_index>=t.item_count)) then
    raise exception 'Incomplete or mismatched transaction rows';
  end if;
  insert into public.league_transactions as cur (season_year, espn_transaction_id, scoring_period, transaction_type, status, team_id, team_name, member_id, bid_amount, transaction_date_ms, transaction_date, item_count, raw_data)
    select season_year, espn_transaction_id, scoring_period, transaction_type, status, team_id, team_name, member_id, bid_amount, transaction_date_ms, transaction_date, item_count, raw_data from import_tx
    on conflict (season_year, espn_transaction_id) do update set
      -- Non-authoritative: a stored non-null value always wins; the snapshot only fills gaps.
      scoring_period=case when v_authoritative then excluded.scoring_period else coalesce(cur.scoring_period, excluded.scoring_period) end,
      transaction_type=case when v_authoritative then excluded.transaction_type else coalesce(cur.transaction_type, excluded.transaction_type) end,
      status=case when v_authoritative then excluded.status else coalesce(cur.status, excluded.status) end,
      team_id=case when v_authoritative then excluded.team_id else coalesce(cur.team_id, excluded.team_id) end,
      team_name=case when v_authoritative then excluded.team_name else coalesce(cur.team_name, excluded.team_name) end,
      member_id=case when v_authoritative then excluded.member_id else coalesce(cur.member_id, excluded.member_id) end,
      bid_amount=case when v_authoritative then excluded.bid_amount else coalesce(cur.bid_amount, excluded.bid_amount) end,
      transaction_date_ms=case when v_authoritative then excluded.transaction_date_ms else coalesce(cur.transaction_date_ms, excluded.transaction_date_ms) end,
      transaction_date=case when v_authoritative then excluded.transaction_date else coalesce(cur.transaction_date, excluded.transaction_date) end,
      item_count=case when v_authoritative
        or not exists (select 1 from public.league_transaction_items e where e.season_year=cur.season_year and e.espn_transaction_id=cur.espn_transaction_id)
        then excluded.item_count else cur.item_count end,
      raw_data=case when v_authoritative then excluded.raw_data
        else jsonb_strip_nulls(coalesce(excluded.raw_data, '{}'::jsonb)) || coalesce(cur.raw_data, '{}'::jsonb) end,
      updated_at=now();
  -- Non-authoritative snapshots only add items for transactions with no stored items.
  insert into public.league_transaction_items (season_year, espn_transaction_id, item_index, item_type, player_id, player_name, from_team_id, from_team_name, to_team_id, to_team_name, raw_data)
    select season_year, espn_transaction_id, item_index, item_type, player_id, player_name, from_team_id, from_team_name, to_team_id, to_team_name, raw_data from import_items i
    where v_authoritative
      or not exists (select 1 from public.league_transaction_items e where e.season_year=i.season_year and e.espn_transaction_id=i.espn_transaction_id)
    on conflict (season_year, espn_transaction_id, item_index) do update set
      item_type=excluded.item_type,
      player_id=excluded.player_id,
      player_name=excluded.player_name,
      from_team_id=excluded.from_team_id,
      from_team_name=excluded.from_team_name,
      to_team_id=excluded.to_team_id,
      to_team_name=excluded.to_team_name,
      raw_data=excluded.raw_data,
      updated_at=now();
  if v_complete and v_authoritative then
    -- Only ESPN imports are owned here. Preserve unrelated/manual and draft rows.
    delete from public.league_transaction_items i
      where i.season_year=v_season
      and exists (select 1 from import_tx t where t.espn_transaction_id=i.espn_transaction_id)
      and not exists (select 1 from import_items n where n.espn_transaction_id=i.espn_transaction_id and n.item_index=i.item_index);
    delete from public.league_transactions t
      where t.season_year=v_season and t.raw_data->>'id'=t.espn_transaction_id
      and t.transaction_type is distinct from 'DRAFT'
      and not exists (select 1 from import_tx n where n.espn_transaction_id=t.espn_transaction_id);
  end if;
  insert into public.transaction_import_state values (v_season,v_stamp)
    on conflict (season_year) do update set fetched_at=excluded.fetched_at;
  return jsonb_build_object('transactions',(select count(*) from import_tx),'items',(select count(*) from import_items),'reconciled',v_complete and v_authoritative);
end;
$$;
revoke all on function public.import_transaction_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.import_transaction_snapshot(jsonb) to service_role;
commit;
