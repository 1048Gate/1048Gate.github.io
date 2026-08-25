-- Staging-only assertions for the 1048 Gate security and performance release.
-- Execute only after migrations 001–013 have been applied to an isolated project.

begin;

insert into public.league_transactions (
  season_year, espn_transaction_id, scoring_period, transaction_type, status,
  team_name, transaction_date_ms, transaction_date, raw_data
) values
  (2099, 'fixture-add', 1, 'FREEAGENT', 'EXECUTED', 'Fixture Alpha', 4070908800000, '2099-01-01T00:00:00Z', '{}'::jsonb),
  (2099, 'fixture-deal-verified', 1, 'TRADE_PROPOSAL', 'PROPOSED', 'Fixture Alpha', 4070995200000, '2099-01-02T00:00:00Z', '{}'::jsonb),
  (2099, 'fixture-accept-verified', 1, 'TRADE_ACCEPT', 'EXECUTED', 'Fixture Alpha ↔ Fixture Beta', 4071081600000, '2099-01-03T00:00:00Z', '{"relatedTransactionId":"fixture-deal-verified"}'::jsonb),
  (2099, 'fixture-deal-proposal', 1, 'TRADE_PROPOSAL', 'PROPOSED', 'Fixture Gamma', 4071168000000, '2099-01-04T00:00:00Z', '{}'::jsonb),
  (2099, 'fixture-accept-proposal', 1, 'TRADE_ACCEPT', 'EXECUTED', 'Fixture Gamma ↔ Fixture Delta', 4071254400000, '2099-01-05T00:00:00Z', '{"relatedTransactionId":"fixture-deal-proposal"}'::jsonb),
  (2099, 'fixture-accept-missing', 1, 'TRADE_ACCEPT', 'EXECUTED', 'Fixture Epsilon ↔ Fixture Zeta', 4071340800000, '2099-01-06T00:00:00Z', '{"relatedTransactionId":"fixture-deal-missing"}'::jsonb)
on conflict (season_year, espn_transaction_id) do nothing;

insert into public.league_transaction_items (
  season_year, espn_transaction_id, item_index, item_type, player_id, player_name,
  from_team_name, to_team_name, raw_data
) values
  (2099, 'fixture-add', 0, 'ADD', 1, 'Fixture Add', null, 'Fixture Alpha', '{"internal":"not-public"}'::jsonb),
  (2099, 'fixture-accept-verified', 0, 'TRADE', 2, 'Verified Player', 'Fixture Alpha', 'Fixture Beta', '{"internal":"not-public"}'::jsonb),
  (2099, 'fixture-deal-proposal', 0, 'TRADE', 3, 'Proposal Player', 'Fixture Gamma', 'Fixture Delta', '{"internal":"not-public"}'::jsonb)
on conflict (season_year, espn_transaction_id, item_index) do nothing;

do $assertions$
declare
  archive jsonb;
  verified jsonb;
  proposal jsonb;
  missing jsonb;
  poll_id uuid;
  option_id uuid;
  response_one jsonb;
  response_two jsonb;
  polls jsonb;
  test_voter uuid := '00000000-0000-4000-8000-000000000999';
begin
  archive := public.get_transaction_archive(1, 2, 2099, 'all', null, 'newest');
  if (archive->>'total_count')::integer <> 4 then
    raise exception 'Expected four canonical fixture activities, found %', archive->>'total_count';
  end if;
  if jsonb_array_length(archive->'items') <> 2 then
    raise exception 'Transaction pagination did not enforce a two-row page';
  end if;
  if archive::text like '%raw_data%' or archive::text like '%not-public%' then
    raise exception 'Transaction RPC exposed raw import data';
  end if;

  verified := public.get_transaction_archive(1, 100, 2099, 'TRADE_ACCEPT', 'Verified Player', 'newest');
  if verified #>> '{items,0,source_detail_status}' <> 'verified' then
    raise exception 'Direct accepted-trade player movement was not marked verified';
  end if;

  proposal := public.get_transaction_archive(1, 100, 2099, 'TRADE_ACCEPT', 'Proposal Player', 'newest');
  if proposal #>> '{items,0,source_detail_status}' <> 'proposal_derived' then
    raise exception 'Proposal-derived player movement was not labeled correctly';
  end if;

  missing := public.get_transaction_archive(1, 100, 2099, 'TRADE_ACCEPT', 'Fixture Epsilon', 'newest');
  if missing #>> '{items,0,source_detail_status}' <> 'missing' then
    raise exception 'Trade with no source detail was not preserved as missing';
  end if;

  if has_table_privilege('anon', 'public.league_transactions', 'select')
     or has_table_privilege('authenticated', 'public.league_transactions', 'select')
     or has_table_privilege('anon', 'public.league_transaction_items', 'select')
     or has_table_privilege('anon', 'public.poll_votes', 'select')
     or has_table_privilege('anon', 'public.board_posts', 'select')
     or has_table_privilege('anon', 'public.board_comments', 'select') then
    raise exception 'Anonymous or authenticated browser roles retain a retired or raw-table read grant';
  end if;

  if not has_function_privilege('anon', 'public.get_transaction_archive(integer,integer,integer,text,text,text)'::regprocedure, 'execute')
     or not has_function_privilege('anon', 'public.get_informal_polls(uuid)'::regprocedure, 'execute')
     or not has_function_privilege('anon', 'public.cast_informal_poll_vote(uuid,uuid,uuid)'::regprocedure, 'execute') then
    raise exception 'Required field-limited public RPC grants are missing';
  end if;

  if to_regprocedure('public.current_user_role()') is not null
     or to_regprocedure('private.current_user_role()') is null then
    raise exception 'Role helper must be private and unavailable through public RPC';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('board_posts', 'board_comments')
  ) then
    raise exception 'Retired legacy board policies remain active';
  end if;

  if not exists (select 1 from private.legacy_board_posts)
     or not exists (select 1 from private.legacy_board_comments) then
    raise exception 'Legacy board records were not preserved in the private archive';
  end if;

  delete from public.poll_votes where voter_id = test_voter::text;

  select p.id, o.id into poll_id, option_id
  from public.polls p
  join public.poll_options o on o.poll_id = p.id
  where p.is_open
  order by p.created_at, o.sort_order
  limit 1;
  if poll_id is null then
    raise exception 'No open poll fixture exists for informal-vote testing';
  end if;

  response_one := public.cast_informal_poll_vote(poll_id, option_id, test_voter);
  response_two := public.cast_informal_poll_vote(poll_id, option_id, test_voter);
  if coalesce((response_one->>'accepted')::boolean, false) is not true
     or coalesce((response_two->>'accepted')::boolean, true) is not false then
    raise exception 'Informal vote deduplication did not accept once and reject the duplicate';
  end if;

  polls := public.get_informal_polls(test_voter);
  if polls::text like '%voter_id%' then
    raise exception 'Informal poll result payload exposed voter identifiers';
  end if;
end
$assertions$;

select 'security-performance staging assertions passed' as result limit 1;

commit;
