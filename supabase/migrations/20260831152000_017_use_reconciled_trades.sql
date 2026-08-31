-- Serve completed trades from the verified reconciliation layer while leaving
-- free-agent and waiver activity on the original ESPN activity import.

begin;

create or replace function private.transaction_team_name(
  p_season_year integer,
  p_team_id integer
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with names as (
    select from_team_name as team_name
    from public.league_transaction_items
    where season_year = p_season_year
      and from_team_id = p_team_id
      and from_team_name is not null
    union all
    select to_team_name
    from public.league_transaction_items
    where season_year = p_season_year
      and to_team_id = p_team_id
      and to_team_name is not null
  )
  select team_name
  from names
  group by team_name
  order by count(*) desc, team_name
  limit 1;
$$;

revoke all on function private.transaction_team_name(integer, integer) from public, anon, authenticated;
grant execute on function private.transaction_team_name(integer, integer) to service_role;

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
set search_path = public, private
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
    trade_activities as (
      select
        format('%s|%s', r.season_year, coalesce(r.related_transaction_id, r.espn_transaction_id)) as activity_key,
        r.season_year,
        'TRADE_ACCEPT'::text as transaction_type,
        coalesce(private.transaction_team_name(r.season_year, r.team_id), 'League trade') as team_name,
        null::numeric as bid_amount,
        r.scoring_period,
        r.transaction_date_ms,
        r.transaction_date,
        'verified'::text as source_detail_status,
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'item_index', i.item_index,
              'item_type', i.item_type,
              'player_id', i.player_id,
              'player_name', i.player_name,
              'from_team_id', i.from_team_id,
              'from_team_name', private.transaction_team_name(i.season_year, i.from_team_id),
              'to_team_id', i.to_team_id,
              'to_team_name', private.transaction_team_name(i.season_year, i.to_team_id)
            ) order by i.item_index
          )
          from private.transaction_trade_recovery_items i
          where i.season_year = r.season_year
            and i.espn_transaction_id = r.espn_transaction_id
            and i.item_type = 'TRADE'
        ), '[]'::jsonb) as items
      from private.transaction_trade_recovery r
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
set search_path = public, private
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'season_year', season_year,
      'accepted_trade_count', accepted_trade_count
    ) order by season_year desc
  ), '[]'::jsonb)
  from (
    select season_year, count(*) as accepted_trade_count
    from private.transaction_trade_recovery
    group by season_year
  ) seasons;
$$;

revoke all on function public.get_transaction_archive(integer, integer, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.get_transaction_archive_seasons() from public, anon, authenticated;
grant execute on function public.get_transaction_archive(integer, integer, integer, text, text, text) to anon, authenticated;
grant execute on function public.get_transaction_archive_seasons() to anon, authenticated;

commit;
