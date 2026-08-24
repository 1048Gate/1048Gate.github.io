-- 1048 Gate Trade Board
-- Run this in Supabase SQL Editor after schema.sql and auth_roles.sql.

create table if not exists public.trade_board_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 40),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  is_closed boolean not null default false,
  is_starter boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_board_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.trade_board_posts(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 40),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.trade_board_posts enable row level security;
alter table public.trade_board_comments enable row level security;

-- Public read access for all posts and comments
drop policy if exists "trade board posts readable" on public.trade_board_posts;
create policy "trade board posts readable"
on public.trade_board_posts for select
to anon, authenticated
using (true);

drop policy if exists "trade board comments readable" on public.trade_board_comments;
create policy "trade board comments readable"
on public.trade_board_comments for select
to anon, authenticated
using (true);

-- Authenticated members can create posts
drop policy if exists "members create trade board posts" on public.trade_board_posts;
create policy "members create trade board posts"
on public.trade_board_posts for insert
to authenticated
with check (true);

-- Authenticated members can create comments
drop policy if exists "members create trade board comments" on public.trade_board_comments;
create policy "members create trade board comments"
on public.trade_board_comments for insert
to authenticated
with check (true);

-- Authors can update their own posts (close/reopen, edit)
drop policy if exists "authors update own trade board posts" on public.trade_board_posts;
create policy "authors update own trade board posts"
on public.trade_board_posts for update
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

-- Authors can delete their own posts
drop policy if exists "authors delete own trade board posts" on public.trade_board_posts;
create policy "authors delete own trade board posts"
on public.trade_board_posts for delete
to authenticated
using (author_id = auth.uid());

-- Staff (commissioner/site_admin) can manage all posts and comments
drop policy if exists "staff manage trade board posts" on public.trade_board_posts;
create policy "staff manage trade board posts"
on public.trade_board_posts for all
to authenticated
using (public.current_user_role() in ('commissioner','site_admin'))
with check (public.current_user_role() in ('commissioner','site_admin'));

drop policy if exists "staff manage trade board comments" on public.trade_board_comments;
create policy "staff manage trade board comments"
on public.trade_board_comments for all
to authenticated
using (public.current_user_role() in ('commissioner','site_admin'))
with check (public.current_user_role() in ('commissioner','site_admin'));

-- Prevent non-authors from updating posts (enforced by RLS above)
-- The "authors update own" policy only allows author_id = auth.uid()
-- Staff policy allows commissioner/site_admin
-- No other update policies exist, so non-authors/non-staff cannot update

-- Realtime support
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='trade_board_posts'
  ) then
    alter publication supabase_realtime add table public.trade_board_posts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='trade_board_comments'
  ) then
    alter publication supabase_realtime add table public.trade_board_comments;
  end if;
end $$;

-- Optional: Updated timestamp trigger for posts
create or replace function public.update_trade_board_updated_at()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trade_board_posts_updated_at on public.trade_board_posts;
create trigger trade_board_posts_updated_at
before update on public.trade_board_posts
for each row execute procedure public.update_trade_board_updated_at();