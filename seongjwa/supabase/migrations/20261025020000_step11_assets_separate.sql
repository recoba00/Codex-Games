-- 11단계: 에셋 등록을 데이터 버전에서 분리(기획지시 2026-10-25 에셋분리, 상세 14 '에셋 등록 (슬롯 방식)').
-- 사람이 압축 전후를 보고 승인하면 바로 반영된다. 데이터 버전 배포·롤백·폐기와 무관. 파일마다 현재 + 직전 1개, 되돌리기, 감사 로그.
-- 키: slot:<슬롯 ID> | art:<캐릭터>:<스킨 3자리>:full|thumb|face|regions (regions = { card, faceRect } 비율 좌표)
begin;
create table public.asset_files (
  key text primary key check (key ~ '^(slot:[A-Z][A-Z0-9_]{1,47}|art:[A-Z]{2,3}:[0-9]{3}:(full|thumb|face|regions))$'),
  cur jsonb,                -- 지금 쓰는 값(null = 비어 있음 → 게임 내장 기본)
  prev jsonb,               -- 직전 값 1개(되돌리기용)
  updated_by uuid references public.staff(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.asset_files enable row level security;
revoke all on public.asset_files from anon, authenticated;

-- 올리기·영역 저장·빼기(p_value null). 직전 값은 지금 값(비어 있으면 원래 직전 값 유지)
create or replace function public.bo_asset_put(p_staff uuid, p_key text, p_value jsonb, p_action text, p_detail jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.asset_files;
begin
  insert into public.asset_files (key, cur, updated_by) values (p_key, p_value, p_staff)
  on conflict (key) do update set prev = coalesce(public.asset_files.cur, public.asset_files.prev), cur = excluded.cur,
                                  updated_by = excluded.updated_by, updated_at = now()
  returning * into r;
  perform public.audit_add(p_staff, '에셋 ' || p_key, p_action, coalesce(p_detail, '{}'), '');
  return to_jsonb(r);
end; $$;

-- 이전 파일로 되돌리기: 지금 값 ↔ 직전 값(한 번 더 누르면 다시 돌아옴)
create or replace function public.bo_asset_revert(p_staff uuid, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.asset_files;
begin
  update public.asset_files set cur = prev, prev = cur, updated_by = p_staff, updated_at = now()
   where key = p_key and prev is not null returning * into r;
  if not found then raise exception 'asset_no_previous' using errcode = 'P0001'; end if;
  perform public.audit_add(p_staff, '에셋 ' || p_key, '이전 파일로 되돌리기', jsonb_build_object('cur', r.cur, 'prev', r.prev), '');
  return to_jsonb(r);
end; $$;

-- 전체 목록(게임 목록·백오피스). 수십~수백 행이라 한 번에
create or replace function public.asset_list() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, jsonb_build_object('cur', cur, 'prev', prev, 'at', updated_at, 'by', s.login)), '{}')
    from public.asset_files f left join public.staff s on s.id = f.updated_by;
$$;

-- 이전: 라이브 데이터 버전의 표 assets·art가 있으면 옮긴다(2026-10-25 라이브 v16에는 없음 → 새로 시작)
insert into public.asset_files (key, cur)
select 'slot:' || s.key, s.value from public.data_tables t, jsonb_each(t.body->'slots') s
 where t.version_id = (select version_id from public.data_live) and t.name = 'assets' and jsonb_typeof(s.value) = 'object'
on conflict (key) do nothing;
insert into public.asset_files (key, cur)
select 'art:' || c.key || ':' || k.key || ':' || f.kind, f.val
  from public.data_tables t, jsonb_each(t.body) c, jsonb_each(c.value) k,
       lateral (values ('full', k.value->'full'), ('thumb', k.value->'thumb'), ('face', k.value->'face'),
                       ('regions', case when k.value ? 'card' or k.value ? 'faceRect' then jsonb_build_object('card', k.value->'card', 'faceRect', k.value->'faceRect') end)) f(kind, val)
 where t.version_id = (select version_id from public.data_live) and t.name = 'art' and f.val is not null and jsonb_typeof(f.val) = 'object'
on conflict (key) do nothing;

-- 예전 함수 bo_asset_draft·bo_asset_set은 운영 DB에 남겨 둔다(쓰지 않음, 삭제는 승인 창에서 막혀 보류).

revoke execute on function public.bo_asset_put(uuid, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.bo_asset_put(uuid, text, jsonb, text, jsonb) to service_role;
revoke execute on function public.bo_asset_revert(uuid, text) from public, anon, authenticated;
grant execute on function public.bo_asset_revert(uuid, text) to service_role;
revoke execute on function public.asset_list() from public, anon, authenticated;
grant execute on function public.asset_list() to service_role;
commit;
