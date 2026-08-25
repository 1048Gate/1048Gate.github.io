-- 1048 Gate Supabase security and RLS hardening
-- Run after the other files in this directory. Safe to rerun.

begin;

-- Trigger-only functions must not be callable through PostgREST RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.trade_board_populate_author_name() from public, anon, authenticated;
revoke execute on function public.update_trade_board_updated_at() from public, anon, authenticated;

-- This timestamp trigger does not require elevated privileges.
alter function public.update_trade_board_updated_at() security invoker;

-- RLS policies need this recursion-safe helper. Only signed-in users may call it,
-- and it returns only the caller's own role.
revoke execute on function public.current_user_role() from public, anon, authenticated;
grant execute on function public.current_user_role() to authenticated;

-- New functions default to private until explicitly granted to an API role.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- Cache auth and role helpers once per statement in every existing policy.
do $policy_optimization$
declare
  policy_record record;
  rewritten_using text;
  rewritten_check text;
  statement text;
begin
  for policy_record in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%current_user_role()%'
        or coalesce(with_check, '') like '%current_user_role()%'
        or coalesce(qual, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%auth.uid()%'
      )
  loop
    rewritten_using := replace(
      replace(policy_record.qual, 'current_user_role()', '(select public.current_user_role())'),
      'auth.uid()', '(select auth.uid())'
    );
    rewritten_check := replace(
      replace(policy_record.with_check, 'current_user_role()', '(select public.current_user_role())'),
      'auth.uid()', '(select auth.uid())'
    );
    statement := format(
      'alter policy %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
    if rewritten_using is not null then
      statement := statement || format(' using (%s)', rewritten_using);
    end if;
    if rewritten_check is not null then
      statement := statement || format(' with check (%s)', rewritten_check);
    end if;
    execute statement;
  end loop;
end
$policy_optimization$;

-- One policy per command avoids redundant permissive-policy evaluation while
-- preserving author ownership and staff moderation.
drop policy if exists "staff manage trade board posts" on public.trade_board_posts;
drop policy if exists "members create trade board posts" on public.trade_board_posts;
drop policy if exists "authors update own trade board posts" on public.trade_board_posts;
drop policy if exists "authors delete own trade board posts" on public.trade_board_posts;

create policy "members create trade board posts"
on public.trade_board_posts for insert
to authenticated
with check (
  author_id = (select auth.uid())
  or (select public.current_user_role()) in ('commissioner', 'site_admin')
);

create policy "authors update own trade board posts"
on public.trade_board_posts for update
to authenticated
using (
  author_id = (select auth.uid())
  or (select public.current_user_role()) in ('commissioner', 'site_admin')
)
with check (
  author_id = (select auth.uid())
  or (select public.current_user_role()) in ('commissioner', 'site_admin')
);

create policy "authors delete own trade board posts"
on public.trade_board_posts for delete
to authenticated
using (
  author_id = (select auth.uid())
  or (select public.current_user_role()) in ('commissioner', 'site_admin')
);

drop policy if exists "staff manage trade board comments" on public.trade_board_comments;
drop policy if exists "members create trade board comments" on public.trade_board_comments;
drop policy if exists "authors delete own trade board comments" on public.trade_board_comments;
drop policy if exists "staff update trade board comments" on public.trade_board_comments;

create policy "members create trade board comments"
on public.trade_board_comments for insert
to authenticated
with check (
  author_id = (select auth.uid())
  or (select public.current_user_role()) in ('commissioner', 'site_admin')
);

create policy "staff update trade board comments"
on public.trade_board_comments for update
to authenticated
using ((select public.current_user_role()) in ('commissioner', 'site_admin'))
with check ((select public.current_user_role()) in ('commissioner', 'site_admin'));

create policy "authors delete own trade board comments"
on public.trade_board_comments for delete
to authenticated
using (
  author_id = (select auth.uid())
  or (select public.current_user_role()) in ('commissioner', 'site_admin')
);

-- Cover every foreign key reported by the database advisor.
create index if not exists announcements_author_id_idx
  on public.announcements (author_id);
create index if not exists board_comments_post_id_idx
  on public.board_comments (post_id);
create index if not exists poll_votes_poll_option_idx
  on public.poll_votes (poll_id, option_id);
create index if not exists poll_votes_option_id_idx
  on public.poll_votes (option_id);
create index if not exists trade_board_comments_author_id_idx
  on public.trade_board_comments (author_id);
create index if not exists trade_board_comments_post_id_idx
  on public.trade_board_comments (post_id);
create index if not exists trade_board_posts_author_id_idx
  on public.trade_board_posts (author_id);

commit;
