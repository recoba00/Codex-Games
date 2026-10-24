-- 10b단계: 지난 요청 제한 기록 정리(크론). 이 파일만 delete 문이 있다.
begin;
create or replace function public.rate_purge(p_keep_sec integer) returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.rate_hits where bucket < floor(extract(epoch from now()) / 60)::bigint - greatest(coalesce(p_keep_sec, 3600), 60) / 60;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke execute on function public.rate_purge(integer) from public, anon, authenticated;
grant execute on function public.rate_purge(integer) to service_role;
commit;
