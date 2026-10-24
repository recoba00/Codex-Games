-- 8c단계: 보관 기간이 지난 상세 로그(events) 정리(상세 12 "오래된 상세 로그는 기간 후 삭제"). 크론이 부른다.
-- 이 파일만 delete 문이 있다(한 번에 최대 p_limit줄).
begin;
create or replace function public.events_purge(p_days integer, p_limit integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with old as (select id from public.events where at < now() - make_interval(days => greatest(coalesce(p_days, 90), 7)) order by id limit greatest(coalesce(p_limit, 20000), 1))
  delete from public.events e using old where e.id = old.id;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke execute on function public.events_purge(integer, integer) from public, anon, authenticated;
grant execute on function public.events_purge(integer, integer) to service_role;
commit;
