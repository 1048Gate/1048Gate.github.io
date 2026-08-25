-- 1048 Gate Trade Board
-- Run this in Supabase SQL Editor after schema.sql and auth_roles.sql.
-- Safe to re-run on existing databases.

-- 1. Create tables if not exists
create table if not exists public.trade_board_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 40),
  post_type text not null check (post_type in ('on_the_block','looking_for','open_to_offers','trade_discussion')),
  player_name text check (char_length(player_name) between 1 and 80),
  position text check (position in ('QB','RB','WR','TE','K','D/ST')),
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

-- 2. Add columns if table already exists (safe migration)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='trade_board_posts' and column_name='post_type') then
    alter table public.trade_board_posts add column post_type text;
    alter table public.trade_board_posts add constraint trade_board_posts_post_type_check check (post_type in ('on_the_block','looking_for','open_to_offers','trade_discussion'));
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='trade_board_posts' and column_name='player_name') then
    alter table public.trade_board_posts add column player_name text;
    alter table public.trade_board_posts add constraint trade_board_posts_player_name_check check (char_length(player_name) between 1 and 80);
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='trade_board_posts' and column_name='position') then
    alter table public.trade_board_posts add column position text;
    alter table public.trade_board_posts add constraint trade_board_posts_position_check check (position in ('QB','RB','WR','TE','K','D/ST'));
  end if;
end $$;

-- 3. Enable RLS
alter table public.trade_board_posts enable row level security;
alter table public.trade_board_comments enable row level security;

-- 4. Public read access
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

-- 5. Authenticated inserts - enforce author_id = auth.uid()
-- Post inserts: user can only insert with their own user ID
drop policy if exists "members create trade board posts" on public.trade_board_posts;
create policy "members create trade board posts"
on public.trade_board_posts for insert
to authenticated
with check (author_id = auth.uid());

-- Comment inserts: user can only insert with their own user ID
drop policy if exists "members create trade board comments" on public.trade_board_comments;
create policy "members create trade board comments"
on public.trade_board_comments for insert
to authenticated
with check (author_id = auth.uid());

-- 6. Author updates - only own posts
drop policy if exists "authors update own trade board posts" on public.trade_board_posts;
create policy "authors update own trade board posts"
on public.trade_board_posts for update
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

-- 7. Author deletes - only own posts
drop policy if exists "authors delete own trade board posts" on public.trade_board_posts;
create policy "authors delete own trade board posts"
on public.trade_board_posts for delete
to authenticated
using (author_id = auth.uid());

-- 8. Author deletes - only own comments
drop policy if exists "authors delete own trade board comments" on public.trade_board_comments;
create policy "authors delete own trade board comments"
on public.trade_board_comments for delete
to authenticated
using (author_id = auth.uid());

-- 9. Staff full access (commissioner/site_admin)
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

-- 10. Trigger to populate author_name from profiles on insert/update
create or replace function public.trade_board_populate_author_name()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  p_display_name text;
begin
  if new.author_id is not null then
    select display_name into p_display_name
    from public.profiles
    where id = new.author_id;
    if p_display_name is not null then
      new.author_name := p_display_name;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trade_board_posts_author_name on public.trade_board_posts;
create trigger trade_board_posts_author_name
before insert or update on public.trade_board_posts
for each row execute procedure public.trade_board_populate_author_name();

drop trigger if exists trade_board_comments_author_name on public.trade_board_comments;
create trigger trade_board_comments_author_name
before insert or update on public.trade_board_comments
for each row execute procedure public.trade_board_populate_author_name();

-- 11. Updated timestamp trigger for posts
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

-- 12. Realtime support
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