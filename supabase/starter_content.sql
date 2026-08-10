-- 1048 Gate launch examples
-- Run once in Supabase SQL Editor after schema.sql and auth_roles.sql.
-- The rows appear in the normal Staff Tools lists and can be deleted there.
-- Safe to rerun: fixed IDs and conflict handling prevent duplicates.

begin;

alter table public.announcements add column if not exists is_starter boolean not null default false;
alter table public.board_posts add column if not exists is_starter boolean not null default false;
alter table public.polls add column if not exists is_starter boolean not null default false;

-- Keep a vote's poll and option paired. The original schema only checked them separately.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'poll_options_poll_id_id_unique'
      and conrelid = 'public.poll_options'::regclass
  ) then
    alter table public.poll_options
      add constraint poll_options_poll_id_id_unique unique (poll_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'poll_votes_option_belongs_to_poll'
      and conrelid = 'public.poll_votes'::regclass
  ) then
    alter table public.poll_votes
      add constraint poll_votes_option_belongs_to_poll
      foreign key (poll_id, option_id)
      references public.poll_options(poll_id, id)
      on delete cascade;
  end if;
end $$;

-- A public visitor may vote only in a real, currently open poll.
drop policy if exists "anyone can vote" on public.poll_votes;
create policy "anyone can vote"
on public.poll_votes for insert
to anon, authenticated
with check (
  exists (
    select 1 from public.polls
    where polls.id = poll_votes.poll_id
      and polls.is_open = true
      and polls.is_starter = false
  )
);

insert into public.announcements
  (id, author_name, body, is_pinned, is_starter, created_at, updated_at)
values
  ('10480000-0000-4000-8000-000000000101', 'Commissioner George', E'Keeper Deadline\nKeepers will be due three days before the draft. No late changes after the deadline unless the league approves it.', true, true, now() - interval '1 minute', now() - interval '1 minute'),
  ('10480000-0000-4000-8000-000000000102', 'Commissioner George', E'Dues & Punishment\nLeague dues need to be paid before draft night. Last-place punishment ideas belong in the Vote Booth.', true, true, now() - interval '2 minutes', now() - interval '2 minutes')
on conflict (id) do nothing;

insert into public.board_posts
  (id, author, category, title, body, is_starter, created_at)
values
  ('10480000-0000-4000-8000-000000000201', 'George', 'General', 'Szn 10 roll call — what weekend works best?', 'Drop your best weekend below so we can narrow down the draft date before the official vote goes live.', true, now() - interval '18 minutes'),
  ('10480000-0000-4000-8000-000000000202', 'Jared', 'Trade Talk', 'Putting an early pick on the trade block', 'Open to moving my second-round pick for the right keeper upgrade. Send an actual offer—not a screenshot of your bench.', true, now() - interval '1 hour'),
  ('10480000-0000-4000-8000-000000000203', 'Kyle', 'Waiver Wire', 'We need a real FAAB debate before draft night', 'Inverse standings is simple, but FAAB makes every waiver claim a decision. I want to hear the case against switching.', true, now() - interval '1 day'),
  ('10480000-0000-4000-8000-000000000204', 'Tommy', 'Trash Talk', 'Preseason power rankings are already disrespectful', 'I have seen enough. Put me first, put everybody else in any order you want, and save us all some time.', true, now() - interval '2 days')
on conflict (id) do nothing;

insert into public.board_comments
  (id, post_id, author, body, created_at)
values
  ('10480000-0000-4000-8000-000000000301', '10480000-0000-4000-8000-000000000201', 'German', 'Saturday night works best for me. I can make Sunday work if we draft a little earlier.', now() - interval '11 minutes'),
  ('10480000-0000-4000-8000-000000000302', '10480000-0000-4000-8000-000000000201', 'Bryan', 'I am good either day as long as we lock it in soon.', now() - interval '6 minutes'),
  ('10480000-0000-4000-8000-000000000303', '10480000-0000-4000-8000-000000000202', 'JD', 'Define “actual offer” because your counteroffers usually require legal review.', now() - interval '46 minutes'),
  ('10480000-0000-4000-8000-000000000304', '10480000-0000-4000-8000-000000000202', 'Jared', 'That sounds like somebody who cannot afford the pick.', now() - interval '39 minutes'),
  ('10480000-0000-4000-8000-000000000305', '10480000-0000-4000-8000-000000000203', 'Brian', 'FAAB is better until I spend 70% on a Week 2 running back who disappears by Sunday.', now() - interval '23 hours'),
  ('10480000-0000-4000-8000-000000000306', '10480000-0000-4000-8000-000000000203', 'Trevor', 'That is not a flaw in FAAB. That is a scouting report on you.', now() - interval '22 hours'),
  ('10480000-0000-4000-8000-000000000307', '10480000-0000-4000-8000-000000000204', 'George', 'Power rankings have been delayed while we search for evidence supporting this claim.', now() - interval '47 hours')
on conflict (id) do nothing;

insert into public.polls
  (id, question, is_open, is_starter, created_at)
values
  ('10480000-0000-4000-8000-000000000401', 'Which night should host the Szn 10 draft?', false, true, now() - interval '10 minutes'),
  ('10480000-0000-4000-8000-000000000402', 'Should 1048 Gate switch to FAAB waivers?', false, true, now() - interval '1 day'),
  ('10480000-0000-4000-8000-000000000403', 'Choose the Szn 10 last-place punishment', false, true, now() - interval '2 days')
on conflict (id) do nothing;

insert into public.poll_options
  (id, poll_id, label, sort_order)
values
  ('10480000-0000-4000-8000-000000000501', '10480000-0000-4000-8000-000000000401', 'Saturday at 7:00 PM', 1),
  ('10480000-0000-4000-8000-000000000502', '10480000-0000-4000-8000-000000000401', 'Sunday at 6:00 PM', 2),
  ('10480000-0000-4000-8000-000000000503', '10480000-0000-4000-8000-000000000401', 'Friday at 8:00 PM', 3),
  ('10480000-0000-4000-8000-000000000504', '10480000-0000-4000-8000-000000000402', 'Yes — $100 seasonal budget', 1),
  ('10480000-0000-4000-8000-000000000505', '10480000-0000-4000-8000-000000000402', 'No — keep inverse standings', 2),
  ('10480000-0000-4000-8000-000000000506', '10480000-0000-4000-8000-000000000403', 'NFL combine at the park', 1),
  ('10480000-0000-4000-8000-000000000507', '10480000-0000-4000-8000-000000000403', 'Calendar photo shoot', 2),
  ('10480000-0000-4000-8000-000000000508', '10480000-0000-4000-8000-000000000403', 'Open-mic comedy set', 3)
on conflict (id) do nothing;

-- Fixed example results: 6/4/2, 7/4, and 5/4/3.
insert into public.poll_votes (poll_id, option_id, voter_id)
select
  '10480000-0000-4000-8000-000000000401'::uuid,
  case when n <= 6 then '10480000-0000-4000-8000-000000000501'::uuid
       when n <= 10 then '10480000-0000-4000-8000-000000000502'::uuid
       else '10480000-0000-4000-8000-000000000503'::uuid end,
  'starter-draft-' || lpad(n::text,2,'0')
from generate_series(1,12) n
on conflict (poll_id, voter_id) do nothing;

insert into public.poll_votes (poll_id, option_id, voter_id)
select
  '10480000-0000-4000-8000-000000000402'::uuid,
  case when n <= 7 then '10480000-0000-4000-8000-000000000504'::uuid
       else '10480000-0000-4000-8000-000000000505'::uuid end,
  'starter-faab-' || lpad(n::text,2,'0')
from generate_series(1,11) n
on conflict (poll_id, voter_id) do nothing;

insert into public.poll_votes (poll_id, option_id, voter_id)
select
  '10480000-0000-4000-8000-000000000403'::uuid,
  case when n <= 5 then '10480000-0000-4000-8000-000000000506'::uuid
       when n <= 9 then '10480000-0000-4000-8000-000000000507'::uuid
       else '10480000-0000-4000-8000-000000000508'::uuid end,
  'starter-punishment-' || lpad(n::text,2,'0')
from generate_series(1,12) n
on conflict (poll_id, voter_id) do nothing;

commit;
