-- 1048 Gate authentication + staff roles
-- Run this ONCE in Supabase SQL Editor after schema.sql.
-- Safe to rerun for most objects.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'member' check (role in ('member','commissioner','site_admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  body text not null check (char_length(body) between 1 and 1200),
  is_pinned boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Automatically create a member profile whenever an Auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'member'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Security-definer role helper avoids recursive profile RLS checks.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'member');
$$;

grant execute on function public.current_user_role() to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.announcements enable row level security;

-- Profiles: users can read their own record; site admins can read/update all profiles.
drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.current_user_role() = 'site_admin');

drop policy if exists "site admin updates profiles" on public.profiles;
create policy "site admin updates profiles"
on public.profiles for update
to authenticated
using (public.current_user_role() = 'site_admin')
with check (public.current_user_role() = 'site_admin');

-- Announcements are public to read; commissioner/site admin can manage them.
drop policy if exists "announcements public read" on public.announcements;
create policy "announcements public read"
on public.announcements for select
to anon, authenticated
using (true);

drop policy if exists "staff create announcements" on public.announcements;
create policy "staff create announcements"
on public.announcements for insert
to authenticated
with check (public.current_user_role() in ('commissioner','site_admin'));

drop policy if exists "staff update announcements" on public.announcements;
create policy "staff update announcements"
on public.announcements for update
to authenticated
using (public.current_user_role() in ('commissioner','site_admin'))
with check (public.current_user_role() in ('commissioner','site_admin'));

drop policy if exists "staff delete announcements" on public.announcements;
create policy "staff delete announcements"
on public.announcements for delete
to authenticated
using (public.current_user_role() in ('commissioner','site_admin'));

-- Poll management: visitors can still read/vote under schema.sql,
-- but only commissioner/site_admin can create/edit/delete polls and choices.
drop policy if exists "staff create polls" on public.polls;
create policy "staff create polls"
on public.polls for insert
to authenticated
with check (public.current_user_role() in ('commissioner','site_admin'));

drop policy if exists "staff update polls" on public.polls;
create policy "staff update polls"
on public.polls for update
to authenticated
using (public.current_user_role() in ('commissioner','site_admin'))
with check (public.current_user_role() in ('commissioner','site_admin'));

drop policy if exists "staff delete polls" on public.polls;
create policy "staff delete polls"
on public.polls for delete
to authenticated
using (public.current_user_role() in ('commissioner','site_admin'));

drop policy if exists "staff create poll options" on public.poll_options;
create policy "staff create poll options"
on public.poll_options for insert
to authenticated
with check (public.current_user_role() in ('commissioner','site_admin'));

drop policy if exists "staff update poll options" on public.poll_options;
create policy "staff update poll options"
on public.poll_options for update
to authenticated
using (public.current_user_role() in ('commissioner','site_admin'))
with check (public.current_user_role() in ('commissioner','site_admin'));

drop policy if exists "staff delete poll options" on public.poll_options;
create policy "staff delete poll options"
on public.poll_options for delete
to authenticated
using (public.current_user_role() in ('commissioner','site_admin'));

-- Staff moderation for the message board.
drop policy if exists "staff delete board posts" on public.board_posts;
create policy "staff delete board posts"
on public.board_posts for delete
to authenticated
using (public.current_user_role() in ('commissioner','site_admin'));

drop policy if exists "staff delete board comments" on public.board_comments;
create policy "staff delete board comments"
on public.board_comments for delete
to authenticated
using (public.current_user_role() in ('commissioner','site_admin'));

-- Enable realtime announcements if not already present.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='announcements'
  ) then
    alter publication supabase_realtime add table public.announcements;
  end if;
end $$;

-- IMPORTANT: after creating the two Auth users, promote them with SQL like:
-- update public.profiles set role='site_admin', display_name='YOUR NAME' where id=(select id from auth.users where email='YOUR_EMAIL');
-- update public.profiles set role='commissioner', display_name='George' where id=(select id from auth.users where email='GEORGE_EMAIL');
