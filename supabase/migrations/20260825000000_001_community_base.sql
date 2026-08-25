-- 1048 Gate community database
-- Run this entire file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.board_posts (
  id uuid primary key default gen_random_uuid(),
  author text not null check (char_length(author) between 1 and 40),
  category text not null default 'General' check (category in ('Trash Talk','Trade Talk','Waiver Wire','General')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  is_starter boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.board_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.board_posts(id) on delete cascade,
  author text not null check (char_length(author) between 1 and 40),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 1 and 200),
  is_open boolean not null default true,
  is_starter boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  sort_order integer not null default 0,
  unique (poll_id, id)
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null,
  voter_id text not null check (char_length(voter_id) between 10 and 100),
  created_at timestamptz not null default now(),
  unique (poll_id, voter_id),
  foreign key (poll_id, option_id) references public.poll_options(poll_id, id) on delete cascade
);

alter table public.board_posts enable row level security;
alter table public.board_comments enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

-- Public league site: everyone may read.
drop policy if exists "board posts readable" on public.board_posts;
create policy "board posts readable" on public.board_posts for select using (true);
drop policy if exists "board comments readable" on public.board_comments;
create policy "board comments readable" on public.board_comments for select using (true);
drop policy if exists "polls readable" on public.polls;
create policy "polls readable" on public.polls for select using (true);
drop policy if exists "poll options readable" on public.poll_options;
create policy "poll options readable" on public.poll_options for select using (true);
drop policy if exists "poll votes readable" on public.poll_votes;
create policy "poll votes readable" on public.poll_votes for select using (true);

-- Lightweight posting/voting. Database constraints cap lengths and duplicate votes.
drop policy if exists "anyone can create board posts" on public.board_posts;
create policy "anyone can create board posts" on public.board_posts for insert with check (true);
drop policy if exists "anyone can create comments" on public.board_comments;
create policy "anyone can create comments" on public.board_comments for insert with check (true);
drop policy if exists "anyone can vote" on public.poll_votes;
create policy "anyone can vote" on public.poll_votes for insert with check (
  exists (
    select 1 from public.polls
    where polls.id = poll_votes.poll_id
      and polls.is_open = true
  )
);

-- Poll creation/editing intentionally has no public write policy.
-- Create polls in the Supabase dashboard/SQL editor so normal visitors cannot create or close polls.

-- Realtime support.
alter publication supabase_realtime add table public.board_posts;
alter publication supabase_realtime add table public.board_comments;
alter publication supabase_realtime add table public.poll_votes;

-- Example poll (optional):
-- insert into public.polls (question) values ('Should we change the keeper rule?') returning id;
-- Then use that returned poll id in statements like:
-- insert into public.poll_options (poll_id,label,sort_order) values
-- ('YOUR-POLL-ID','Yes',1),
-- ('YOUR-POLL-ID','No',2);
