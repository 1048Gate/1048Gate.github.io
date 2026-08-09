-- Follow-up compatibility layer: do not assume the original poll tables used UUID IDs.
-- The legacy browser voter_id must also become nullable for authenticated member votes.

alter table public.poll_votes alter column voter_id drop not null;

drop function if exists public.get_poll_vote_counts();
create function public.get_poll_vote_counts()
returns table (
  poll_id text,
  option_id text,
  vote_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.poll_id::text, v.option_id::text, count(*)::bigint
  from public.poll_votes v
  group by v.poll_id, v.option_id;
$$;

revoke all on function public.get_poll_vote_counts() from public;
grant execute on function public.get_poll_vote_counts() to anon, authenticated, service_role;

drop function if exists public.get_poll_voter_status(uuid);
drop function if exists public.get_poll_voter_status(text);
create function public.get_poll_voter_status(p_poll_id text)
returns table (
  member_number text,
  display_name text,
  account_claimed boolean,
  has_voted boolean,
  option_label text,
  voted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_league_staff() then
    raise exception 'Staff access required';
  end if;

  return query
  select i.member_number,
         i.display_name,
         i.used_by is not null,
         v.id is not null,
         case when coalesce(p.is_open, false) then null else o.label end,
         v.cast_at
  from public.league_invites i
  left join public.poll_votes v
    on v.poll_id::text = p_poll_id and v.member_number = i.member_number
  left join public.poll_options o on o.id = v.option_id
  left join public.polls p on p.id::text = p_poll_id
  order by i.member_number;
end;
$$;

revoke all on function public.get_poll_voter_status(text) from public;
grant execute on function public.get_poll_voter_status(text) to authenticated, service_role;
