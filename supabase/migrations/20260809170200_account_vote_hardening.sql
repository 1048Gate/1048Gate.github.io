-- Defense-in-depth for league identity and Vote Booth integrity.

-- A normal authenticated member must not be able to edit the protected identity
-- fields directly through the Data API. Staff and service-role operations remain
-- allowed; service-role requests do not have a normal member auth.uid().
create or replace function public.protect_league_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not public.is_league_staff()
     and (
       new.member_number is distinct from old.member_number
       or new.role is distinct from old.role
       or new.username is distinct from old.username
     ) then
    raise exception 'League identity fields cannot be changed directly';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_league_profile_identity() from public, anon, authenticated;
grant execute on function public.protect_league_profile_identity() to service_role;

drop trigger if exists protect_league_profile_identity_trigger on public.profiles;
create trigger protect_league_profile_identity_trigger
before update on public.profiles
for each row execute function public.protect_league_profile_identity();

-- Tighten the vote insert policy so a browser cannot bypass the UI and vote on
-- a closed poll or submit an option that does not belong to the specified poll.
drop policy if exists poll_votes_insert_member on public.poll_votes;
create policy poll_votes_insert_member
on public.poll_votes
for insert
to authenticated
with check (
  auth_user_id = (select auth.uid())
  and member_number is not null
  and member_number = (select public.current_member_number())
  and exists (
    select 1
    from public.poll_options o
    join public.polls p on p.id = o.poll_id
    where o.id = poll_votes.option_id
      and o.poll_id = poll_votes.poll_id
      and p.is_open = true
  )
);
