-- 1048 Gate invite-only league accounts + authenticated member voting
-- Safe to run after the existing site/community schema is installed.

create extension if not exists pgcrypto with schema extensions;

-- Extend the existing auth profile table without changing current staff accounts.
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists member_number text;

create unique index if not exists profiles_username_lower_uidx
  on public.profiles ((lower(username)))
  where username is not null;

create unique index if not exists profiles_member_number_uidx
  on public.profiles (member_number)
  where member_number is not null;

-- Invite codes are never stored in plaintext. The public GitHub repository only
-- contains the roster; codes are generated inside Postgres and returned once.
create table if not exists public.league_invites (
  member_number text primary key,
  display_name text not null,
  desired_role text not null default 'member'
    check (desired_role in ('member','commissioner','site_admin')),
  code_hash text,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.league_invites enable row level security;
revoke all on table public.league_invites from anon, authenticated;
grant all on table public.league_invites to service_role;

insert into public.league_invites (member_number, display_name, desired_role)
values
  ('01','George Travis','commissioner'),
  ('02','Jared Hall','member'),
  ('03','Kyle Fowler','member'),
  ('04','Bryan Hunt','member'),
  ('05','Brian Heino','member'),
  ('06','Vincent Cannarozzi','member'),
  ('07','James Brochu','member'),
  ('08','JD Daley','member'),
  ('09','Thomas Speer','member'),
  ('10','Collin Krum','site_admin'),
  ('11','German Haro','member'),
  ('12','Trevor Hash','member')
on conflict (member_number) do update
set display_name = excluded.display_name,
    desired_role = excluded.desired_role,
    updated_at = now();

-- Helpers used by RLS and staff tools.
create or replace function public.is_league_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('site_admin','commissioner')
  );
$$;

revoke all on function public.is_league_staff() from public;
grant execute on function public.is_league_staff() to authenticated, service_role;

create or replace function public.current_member_number()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.member_number
  from public.profiles p
  where p.id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.current_member_number() from public;
grant execute on function public.current_member_number() to authenticated, service_role;

-- Staff can see account/invite status without ever reading invite hashes.
create or replace function public.list_league_invites()
returns table (
  member_number text,
  display_name text,
  desired_role text,
  invite_ready boolean,
  claimed boolean,
  username text,
  used_at timestamptz
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
         i.desired_role,
         i.code_hash is not null,
         i.used_by is not null,
         p.username,
         i.used_at
  from public.league_invites i
  left join public.profiles p on p.id = i.used_by
  order by i.member_number;
end;
$$;

revoke all on function public.list_league_invites() from public;
grant execute on function public.list_league_invites() to authenticated, service_role;

-- Returns the plaintext code once. Only Commissioner/Site Admin can generate it.
create or replace function public.generate_league_invite(p_member_number text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_claimed boolean;
begin
  if not public.is_league_staff() then
    raise exception 'Staff access required';
  end if;

  select used_by is not null into v_claimed
  from public.league_invites
  where member_number = p_member_number;

  if not found then
    raise exception 'Unknown league member';
  end if;

  if v_claimed then
    raise exception 'That league account has already been claimed';
  end if;

  v_code := '1048-' || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 1, 16));

  update public.league_invites
  set code_hash = extensions.crypt(v_code, extensions.gen_salt('bf')),
      updated_at = now()
  where member_number = p_member_number;

  return v_code;
end;
$$;

revoke all on function public.generate_league_invite(text) from public;
grant execute on function public.generate_league_invite(text) to authenticated, service_role;

-- Service-only validation used by the registration Edge Function.
create or replace function public.validate_league_invite(p_code text)
returns table (
  member_number text,
  display_name text,
  desired_role text
)
language sql
security definer
set search_path = ''
as $$
  select i.member_number, i.display_name, i.desired_role
  from public.league_invites i
  where i.used_by is null
    and i.code_hash is not null
    and extensions.crypt(upper(trim(p_code)), i.code_hash) = i.code_hash
  limit 1;
$$;

revoke all on function public.validate_league_invite(text) from public, anon, authenticated;
grant execute on function public.validate_league_invite(text) to service_role;

-- Atomically link the Auth user to the league identity and consume the invite.
create or replace function public.consume_league_invite(
  p_code text,
  p_user_id uuid,
  p_username text
)
returns table (
  member_number text,
  display_name text,
  role text,
  username text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.league_invites%rowtype;
  v_username text := lower(trim(p_username));
begin
  if v_username !~ '^[a-z0-9][a-z0-9._-]{2,23}$' then
    raise exception 'Username must be 3-24 characters using letters, numbers, dot, dash, or underscore';
  end if;

  select * into v_invite
  from public.league_invites i
  where i.used_by is null
    and i.code_hash is not null
    and extensions.crypt(upper(trim(p_code)), i.code_hash) = i.code_hash
  for update;

  if not found then
    raise exception 'Invite code is invalid or already used';
  end if;

  if exists (
    select 1 from public.profiles p
    where lower(p.username) = v_username
      and p.id <> p_user_id
  ) then
    raise exception 'That username is already taken';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.member_number = v_invite.member_number
      and p.id <> p_user_id
  ) then
    raise exception 'That league member already has an account';
  end if;

  insert into public.profiles (id, display_name, role, username, member_number)
  values (p_user_id, v_invite.display_name, v_invite.desired_role, v_username, v_invite.member_number)
  on conflict (id) do update
  set display_name = excluded.display_name,
      role = excluded.role,
      username = excluded.username,
      member_number = excluded.member_number;

  update public.league_invites
  set used_by = p_user_id,
      used_at = now(),
      updated_at = now()
  where league_invites.member_number = v_invite.member_number;

  return query
  select v_invite.member_number, v_invite.display_name, v_invite.desired_role, v_username;
end;
$$;

revoke all on function public.consume_league_invite(text,uuid,text) from public, anon, authenticated;
grant execute on function public.consume_league_invite(text,uuid,text) to service_role;

-- Move Vote Booth identity from "this browser" to an authenticated league member.
alter table public.poll_votes add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
alter table public.poll_votes add column if not exists member_number text;
alter table public.poll_votes add column if not exists cast_at timestamptz not null default now();

create index if not exists poll_votes_auth_user_idx on public.poll_votes(auth_user_id);
create unique index if not exists poll_votes_one_member_per_poll_uidx
  on public.poll_votes(poll_id, member_number)
  where member_number is not null;

alter table public.poll_votes enable row level security;

-- Replace older browser-voting policies with authenticated-member policies.
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'poll_votes'
  loop
    execute format('drop policy if exists %I on public.poll_votes', r.policyname);
  end loop;
end $$;

revoke insert, update, delete, select on table public.poll_votes from anon;
grant select, insert, delete on table public.poll_votes to authenticated;
grant all on table public.poll_votes to service_role;

create policy poll_votes_select_own_or_staff
on public.poll_votes
for select
to authenticated
using (
  auth_user_id = (select auth.uid())
  or (select public.is_league_staff())
);

create policy poll_votes_insert_member
on public.poll_votes
for insert
to authenticated
with check (
  auth_user_id = (select auth.uid())
  and member_number is not null
  and member_number = (select public.current_member_number())
);

create policy poll_votes_delete_staff
on public.poll_votes
for delete
to authenticated
using ((select public.is_league_staff()));

-- Public result totals reveal counts only, never voter identity.
create or replace function public.get_poll_vote_counts()
returns table (
  poll_id uuid,
  option_id uuid,
  vote_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.poll_id, v.option_id, count(*)::bigint
  from public.poll_votes v
  group by v.poll_id, v.option_id;
$$;

revoke all on function public.get_poll_vote_counts() from public;
grant execute on function public.get_poll_vote_counts() to anon, authenticated, service_role;

-- Staff can track participation. Choices remain hidden while the poll is open.
create or replace function public.get_poll_voter_status(p_poll_id uuid)
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
    on v.poll_id = p_poll_id and v.member_number = i.member_number
  left join public.poll_options o on o.id = v.option_id
  left join public.polls p on p.id = p_poll_id
  order by i.member_number;
end;
$$;

revoke all on function public.get_poll_voter_status(uuid) from public;
grant execute on function public.get_poll_voter_status(uuid) to authenticated, service_role;
