-- Run as postgres. Temporary fixture and all session changes roll back.
begin;
insert into public.fantasy_snapshots (season,week,fetched_at,payload)
values (2000,1,'2000-01-01T00:00:00Z','{"test":"owner-access-fixture"}');
select set_config('request.jwt.claim.sub',(select user_id::text from public.fantasy_owner_access),true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.fantasy_snapshots where season=2000) <> 1 then
    raise exception 'Owner cannot read fixture';
  end if;
  if (select count(*) from public.fantasy_owner_access) <> 1 then raise exception 'Owner access missing'; end if;
  if has_table_privilege(current_user,'public.fantasy_snapshots','INSERT')
    or has_table_privilege(current_user,'public.fantasy_snapshots','UPDATE')
    or has_table_privilege(current_user,'public.fantasy_snapshots','DELETE')
    or has_table_privilege(current_user,'public.fantasy_owner_access','INSERT')
    or has_table_privilege(current_user,'public.fantasy_owner_access','UPDATE')
    or has_table_privilege(current_user,'public.fantasy_owner_access','DELETE') then
    raise exception 'Browser can mutate owner data or access';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',coalesce((select id::text from public.profiles where role='commissioner' and id <> (select user_id from public.fantasy_owner_access) limit 1),'ffffffff-ffff-ffff-ffff-ffffffffffff'),true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.fantasy_snapshots) <> 0 then raise exception 'Non-owner can read snapshots'; end if;
  if (select count(*) from public.fantasy_owner_access) <> 0 then raise exception 'Non-owner can read access'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
  if has_table_privilege(current_user,'public.fantasy_snapshots','SELECT')
    or has_table_privilege(current_user,'public.fantasy_owner_access','SELECT') then
    raise exception 'Public can read owner data';
  end if;
end $$;
reset role;
rollback;
