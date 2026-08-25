-- Remove the duplicate poll_options (poll_id, id) uniqueness constraint reported by
-- the database advisor. Rebuild the retained pair-integrity foreign key so it uses
-- the single named uniqueness constraint after the historical duplicate is removed.

begin;

alter table public.poll_votes
  drop constraint if exists poll_votes_poll_id_option_id_fkey;

alter table public.poll_votes
  drop constraint if exists poll_votes_option_belongs_to_poll;

alter table public.poll_options
  drop constraint if exists poll_options_poll_id_id_key;

alter table public.poll_votes
  add constraint poll_votes_option_belongs_to_poll
  foreign key (poll_id, option_id)
  references public.poll_options(poll_id, id)
  on delete cascade;

commit;
