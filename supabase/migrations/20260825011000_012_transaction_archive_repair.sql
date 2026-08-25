-- Normalize ESPN's link from a trade-acceptance action to its original deal.
-- Run after league_transactions has been imported.

begin;

alter table public.league_transactions
  add column if not exists related_transaction_id text
  generated always as (nullif(raw_data ->> 'relatedTransactionId', '')) stored;

create index if not exists league_transactions_season_related_transaction_idx
  on public.league_transactions (season_year, related_transaction_id)
  where related_transaction_id is not null;

comment on column public.league_transactions.related_transaction_id is
  'ESPN transaction ID for the underlying trade proposal; used to combine acceptance actions into one deal.';

create or replace view public.league_transaction_archive_items
with (security_invoker = true)
as
select item.*
from public.league_transaction_items item
where (
  item.item_type in ('ADD', 'DROP')
  and exists (
    select 1
    from public.league_transactions event
    where event.season_year = item.season_year
      and event.espn_transaction_id = item.espn_transaction_id
      and event.transaction_type in ('FREEAGENT', 'WAIVER')
      and event.status = 'EXECUTED'
  )
) or (
  item.item_type = 'TRADE'
  and exists (
    select 1
    from public.league_transactions acceptance
    where acceptance.season_year = item.season_year
      and acceptance.transaction_type = 'TRADE_ACCEPT'
      and (acceptance.status is null or acceptance.status = 'EXECUTED')
      and (
        acceptance.related_transaction_id = item.espn_transaction_id
        or acceptance.espn_transaction_id = item.espn_transaction_id
      )
  )
);

revoke all on public.league_transaction_archive_items from public;
revoke all on public.league_transaction_archive_items from anon, authenticated, service_role;
grant select on public.league_transaction_archive_items to anon, authenticated, service_role;

comment on view public.league_transaction_archive_items is
  'Curated add/drop and accepted-trade item movement for the public transaction archive.';

commit;
