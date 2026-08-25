-- 1048 Gate security and performance release.
-- This migration preserves legacy board records, retires their public endpoints,
-- removes anonymous access to raw ESPN imports, and exposes narrow RPC APIs for
-- archive browsing and informal poll participation.

begin;

-- Preserve legacy board content inside a non-exposed schema before retiring it.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- Keep the recursion-safe role helper outside the exposed API schema. RLS policies
-- can execute it, but PostgREST cannot expose it as a public RPC endpoint.
create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'member');
$$;

revoke all on function private.current_user_role() from public, anon, authenticated;
grant execute on function private.current_user_role() to authenticated;

do $policy_role_helper$
declare
  policy_record record;
  rewritten_using text;
  rewritten_check text;
  statement text;
begin
  for policy_record in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%current_user_role()%'
        or coalesce(with_check, '') like '%current_user_role()%'
      )
  loop
    rewritten_using := replace(
      replace(policy_record.qual, 'public.current_user_role()', '(select private.current_user_role())'),
      'current_user_role()', '(select private.current_user_role())'
    );
    rewritten_check := replace(
      replace(policy_record.with_check, 'public.current_user_role()', '(select private.current_user_role())'),
      'current_user_role()', '(select private.current_user_role())'
    );
    statement := format('alter policy %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
    if rewritten_using is not null then
      statement := statement || format(' using (%s)', rewritten_using);
    end if;
    if rewritten_check is not null then
      statement := statement || format(' with check (%s)', rewritten_check);
    end if;
    execute statement;
  end loop;
end
$policy_role_helper$;

revoke all on function public.current_user_role() from public, anon, authenticated;
drop function if exists public.current_user_role();

create table if not exists private.legacy_board_posts (
  like public.board_posts including all
);

create table if not exists private.legacy_board_comments (
  like public.board_comments including all
);

insert into private.legacy_board_posts
select * from public.board_posts
on conflict (id) do nothing;

insert into private.legacy_board_comments
select * from public.board_comments
on conflict (id) do nothing;

revoke all on table private.legacy_board_posts from public, anon, authenticated;
revoke all on table private.legacy_board_comments from public, anon, authenticated;
grant all on table private.legacy_board_posts to service_role;
grant all on table private.legacy_board_comments to service_role;

-- Retire the legacy public-board surface without deleting records.
drop policy if exists "board posts readable" on public.board_posts;
drop policy if exists "board comments readable" on public.board_comments;
drop policy if exists "anyone can create board posts" on public.board_posts;
drop policy if exists "anyone can create comments" on public.board_comments;
drop policy if exists "staff delete board posts" on public.board_posts;
drop policy if exists "staff delete board comments" on public.board_comments;

revoke all on table public.board_posts from public, anon, authenticated;
revoke all on table public.board_comments from public, anon, authenticated;
grant all on table public.board_posts to service_role;
grant all on table public.board_comments to service_role;

comment on table public.board_posts is
  'Retired legacy board. Records were copied to private.legacy_board_posts by the 20260825012000 security release.';
comment on table public.board_comments is
  'Retired legacy board. Records were copied to private.legacy_board_comments by the 20260825012000 security release.';

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'board_posts'
  ) then
    alter publication supabase_realtime drop table public.board_posts;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'board_comments'
  ) then
    alter publication supabase_realtime drop table public.board_comments;
  end if;
end $$;

-- Raw ESPN imports remain available only to the trusted import service role.
drop policy if exists "Public can read league transactions" on public.league_transactions;
drop policy if exists "Public can read league transaction items" on public.league_transaction_items;
revoke all on table public.league_transactions from public, anon, authenticated;
revoke all on table public.league_transaction_items from public, anon, authenticated;
grant all on table public.league_transactions to service_role;
grant all on table public.league_transaction_items to service_role;

-- Keep a safe projection for trusted maintenance callers. It deliberately omits raw_data.
-- The earlier historical view exposed item.*; dropping it is required before removing
-- its raw-data columns from the public relation definition.
drop view if exists public.league_transaction_archive_items;
create view public.league_transaction_archive_items
with (security_invoker = true)
as
select
  id,
  season_year,
  espn_transaction_id,
  item_index,
  item_type,
  player_id,
  player_name,
  from_team_id,
  from_team_name,
  to_team_id,
  to_team_name,
  created_at,
  updated_at
from public.league_transaction_items;

revoke all on public.league_transaction_archive_items from public, anon, authenticated;
grant select on public.league_transaction_archive_items to service_role;

-- A narrow, paginated API for public transaction browsing. The function returns
-- only display-safe fields and canonicalizes accepted trades by underlying deal ID.
create or replace function public.get_transaction_archive(
  p_page integer default 1,
  p_page_size integer default 35,
  p_season_year integer default null,
  p_category text default 'all',
  p_search text default null,
  p_sort text default 'newest'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 35), 1), 100);
  v_category text := upper(coalesce(nullif(trim(p_category), ''), 'ALL'));
  v_sort text := lower(coalesce(nullif(trim(p_sort), ''), 'newest'));
  v_search text := nullif(trim(p_search), '');
begin
  if v_category not in ('ALL', 'FREEAGENT', 'WAIVER', 'TRADE_ACCEPT') then
    raise exception 'Unsupported transaction category';
  end if;
  if v_sort not in ('newest', 'oldest') then
    raise exception 'Unsupported transaction sort';
  end if;

  return (
    with normal_activities as (
      select
        format('%s|%s', t.season_year, t.espn_transaction_id) as activity_key,
        t.season_year,
        t.transaction_type,
        t.team_name,
        t.bid_amount,
        t.scoring_period,
        t.transaction_date_ms,
        t.transaction_date,
        'not_applicable'::text as source_detail_status,
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'item_index', i.item_index,
              'item_type', i.item_type,
              'player_id', i.player_id,
              'player_name', i.player_name,
              'from_team_id', i.from_team_id,
              'from_team_name', i.from_team_name,
              'to_team_id', i.to_team_id,
              'to_team_name', i.to_team_name
            ) order by i.item_index
          )
          from public.league_transaction_items i
          where i.season_year = t.season_year
            and i.espn_transaction_id = t.espn_transaction_id
            and i.item_type in ('ADD', 'DROP')
        ), '[]'::jsonb) as items
      from public.league_transactions t
      where t.transaction_type in ('FREEAGENT', 'WAIVER')
        and t.status = 'EXECUTED'
    ),
    canonical_trade_events as (
      select distinct on (t.season_year, coalesce(t.related_transaction_id, t.espn_transaction_id))
        format('%s|%s', t.season_year, coalesce(t.related_transaction_id, t.espn_transaction_id)) as activity_key,
        t.season_year,
        coalesce(t.related_transaction_id, t.espn_transaction_id) as deal_id,
        t.team_name,
        t.bid_amount,
        t.scoring_period,
        t.transaction_date_ms,
        t.transaction_date
      from public.league_transactions t
      where t.transaction_type = 'TRADE_ACCEPT'
        and (t.status is null or t.status = 'EXECUTED')
      order by
        t.season_year,
        coalesce(t.related_transaction_id, t.espn_transaction_id),
        t.transaction_date_ms desc nulls last,
        t.espn_transaction_id desc
    ),
    trade_activities as (
      select
        a.activity_key,
        a.season_year,
        'TRADE_ACCEPT'::text as transaction_type,
        a.team_name,
        a.bid_amount,
        a.scoring_period,
        a.transaction_date_ms,
        a.transaction_date,
        case
          when verified.items is not null then 'verified'
          when proposal.items is not null then 'proposal_derived'
          else 'missing'
        end as source_detail_status,
        coalesce(verified.items, proposal.items, '[]'::jsonb) as items
      from canonical_trade_events a
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'item_index', i.item_index,
            'item_type', i.item_type,
            'player_id', i.player_id,
            'player_name', i.player_name,
            'from_team_id', i.from_team_id,
            'from_team_name', i.from_team_name,
            'to_team_id', i.to_team_id,
            'to_team_name', i.to_team_name
          ) order by i.item_index
        ) as items
        from public.league_transaction_items i
        where i.season_year = a.season_year
          and i.item_type = 'TRADE'
          and exists (
            select 1
            from public.league_transactions acceptance
            where acceptance.season_year = a.season_year
              and acceptance.transaction_type = 'TRADE_ACCEPT'
              and (acceptance.status is null or acceptance.status = 'EXECUTED')
              and coalesce(acceptance.related_transaction_id, acceptance.espn_transaction_id) = a.deal_id
              and acceptance.espn_transaction_id = i.espn_transaction_id
          )
      ) verified on true
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'item_index', i.item_index,
            'item_type', i.item_type,
            'player_id', i.player_id,
            'player_name', i.player_name,
            'from_team_id', i.from_team_id,
            'from_team_name', i.from_team_name,
            'to_team_id', i.to_team_id,
            'to_team_name', i.to_team_name
          ) order by i.item_index
        ) as items
        from public.league_transaction_items i
        where i.season_year = a.season_year
          and i.espn_transaction_id = a.deal_id
          and i.item_type = 'TRADE'
      ) proposal on verified.items is null
    ),
    activities as (
      select * from normal_activities
      union all
      select * from trade_activities
    ),
    filtered as (
      select
        activities.*,
        lower(concat_ws(' ', activities.team_name, activities.transaction_type, activities.items::text)) as search_text
      from activities
      where (p_season_year is null or activities.season_year = p_season_year)
        and (v_category = 'ALL' or activities.transaction_type = v_category)
    ),
    counted as (
      select
        filtered.*,
        count(*) over () as total_count,
        row_number() over (
          order by
            case when v_sort = 'oldest' then filtered.transaction_date_ms end asc nulls last,
            case when v_sort = 'newest' then filtered.transaction_date_ms end desc nulls last,
            filtered.activity_key asc
        ) as result_position
      from filtered
      where v_search is null or filtered.search_text like '%' || lower(v_search) || '%'
    ),
    paged as (
      select *
      from counted
      order by result_position
      limit v_page_size
      offset (v_page - 1) * v_page_size
    )
    select jsonb_build_object(
      'page', v_page,
      'page_size', v_page_size,
      'total_count', coalesce(max(total_count), 0),
      'items', coalesce(jsonb_agg(
        jsonb_build_object(
          'activity_key', activity_key,
          'season_year', season_year,
          'transaction_type', transaction_type,
          'team_name', team_name,
          'bid_amount', bid_amount,
          'scoring_period', scoring_period,
          'transaction_date_ms', transaction_date_ms,
          'transaction_date', transaction_date,
          'source_detail_status', source_detail_status,
          'items', items
        ) order by result_position
      ), '[]'::jsonb)
    )
    from paged
  );
end;
$$;

create or replace function public.get_transaction_archive_seasons()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'season_year', season_year,
      'accepted_trade_count', accepted_trade_count
    ) order by season_year desc
  ), '[]'::jsonb)
  from (
    select
      season_year,
      count(distinct coalesce(related_transaction_id, espn_transaction_id)) as accepted_trade_count
    from public.league_transactions
    where transaction_type = 'TRADE_ACCEPT'
      and (status is null or status = 'EXECUTED')
    group by season_year
  ) seasons;
$$;

revoke all on function public.get_transaction_archive(integer, integer, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.get_transaction_archive_seasons() from public, anon, authenticated;
grant execute on function public.get_transaction_archive(integer, integer, integer, text, text, text) to anon, authenticated;
grant execute on function public.get_transaction_archive_seasons() to anon, authenticated;

-- Informal polls remain anonymous-device-based by design, but individual voter
-- identifiers are never readable through the browser API.
drop policy if exists "poll votes readable" on public.poll_votes;
drop policy if exists "anyone can vote" on public.poll_votes;
revoke all on table public.poll_votes from public, anon, authenticated;
grant all on table public.poll_votes to service_role;

create or replace function public.get_informal_polls(p_voter_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'question', p.question,
      'is_open', p.is_open,
      'is_starter', p.is_starter,
      'created_at', p.created_at,
      'my_option_id', (
        select v.option_id
        from public.poll_votes v
        where v.poll_id = p.id
          and v.voter_id = p_voter_id::text
        limit 1
      ),
      'options', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'label', o.label,
            'sort_order', o.sort_order,
            'vote_count', (
              select count(*)
              from public.poll_votes v
              where v.poll_id = p.id and v.option_id = o.id
            )
          ) order by o.sort_order, o.id
        )
        from public.poll_options o
        where o.poll_id = p.id
      ), '[]'::jsonb)
    ) order by p.created_at desc, p.id
  ), '[]'::jsonb)
  from public.polls p;
$$;

create or replace function public.cast_informal_poll_vote(
  p_poll_id uuid,
  p_option_id uuid,
  p_voter_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted uuid;
begin
  if not exists (
    select 1
    from public.polls p
    join public.poll_options o on o.poll_id = p.id and o.id = p_option_id
    where p.id = p_poll_id
      and p.is_open
  ) then
    raise exception 'Poll is unavailable or the option is invalid';
  end if;

  insert into public.poll_votes (poll_id, option_id, voter_id)
  values (p_poll_id, p_option_id, p_voter_id::text)
  on conflict (poll_id, voter_id) do nothing
  returning id into v_inserted;

  return jsonb_build_object(
    'accepted', v_inserted is not null,
    'reason', case when v_inserted is null then 'already_voted' else null end
  );
end;
$$;

revoke all on function public.get_informal_polls(uuid) from public, anon, authenticated;
revoke all on function public.cast_informal_poll_vote(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_informal_polls(uuid) to anon, authenticated;
grant execute on function public.cast_informal_poll_vote(uuid, uuid, uuid) to anon, authenticated;

commit;
