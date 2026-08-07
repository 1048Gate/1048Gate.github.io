-- 1048 Gate staff dashboard realtime upgrades
-- Run this in Supabase SQL Editor after auth_roles.sql.
-- Safe to rerun.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='polls'
  ) then
    alter publication supabase_realtime add table public.polls;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='poll_options'
  ) then
    alter publication supabase_realtime add table public.poll_options;
  end if;
end $$;
