-- 14단계: 저장소 정리. 에셋 표(현재·직전 파일)가 가리키지 않는 버킷 파일 목록(크론이 Storage API로 지운다).
-- 같은 내용 = 같은 이름(내용 해시)이라 다시 올려도 겹치지 않지만, 교체가 두 번 이상 되면 직전보다 오래된 파일이 남는다.
begin;
create or replace function public.asset_orphans(p_min_age_sec integer, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb := '[]';
begin
  if to_regclass('storage.objects') is null then return r; end if;  -- 로컬 시험 DB
  execute $q$
    select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'bytes', (o.metadata->>'size')::bigint)), '[]') from (
      select o.name, o.metadata from storage.objects o
       where o.bucket_id = 'assets' and o.created_at < now() - make_interval(secs => $1)
         and not exists (select 1 from public.asset_files f where f.cur->>'path' = o.name or f.prev->>'path' = o.name)
       order by o.created_at limit $2) o$q$
    into r using greatest(coalesce(p_min_age_sec, 86400), 3600), least(greatest(coalesce(p_limit, 100), 1), 500);
  return r;
end; $$;
-- 정리 기록(시스템 작업이라 직원 없음)
create or replace function public.asset_cleanup_log(p_detail jsonb) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (target, action, detail) values ('에셋 저장소', '안 쓰는 파일 정리', coalesce(p_detail, '{}'));
$$;
revoke execute on function public.asset_cleanup_log(jsonb) from public, anon, authenticated;
grant execute on function public.asset_cleanup_log(jsonb) to service_role;
revoke execute on function public.asset_orphans(integer, integer) from public, anon, authenticated;
grant execute on function public.asset_orphans(integer, integer) to service_role;
commit;
