-- 6단계 보완: 1인 운영 모드(상세 14 '데이터 반영 경로', 2026-10-24 결정)
-- 켜져 있으면 관리자가 자기가 올린 초안도 승인할 수 있다(업로드·승인·배포를 관리자 1계정으로). 팀이 생기면 끈다.
-- 기본값은 꺼짐(자기 승인 금지). 켜고 끄기와 이 모드로 한 자기 승인은 모두 감사 로그에 남는다.
begin;

create table public.bo_config (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff(id)
);
insert into public.bo_config (key, value) values ('solo_mode', 'false');

create or replace function public.bo_config_get() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, jsonb_build_object('value', value, 'updatedAt', updated_at,
                    'updatedBy', (select login from public.staff s where s.id = c.updated_by))), '{}')
    from public.bo_config c;
$$;

-- 설정 변경(관리자만, 사유 필수) + 감사 로그
create or replace function public.bo_config_set(p_key text, p_value jsonb, p_staff uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare before jsonb; r text;
begin
  select role into r from public.staff where id = p_staff and active;
  if r is distinct from 'admin' then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if coalesce(char_length(trim(p_reason)), 0) < 2 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if p_key = 'solo_mode' and jsonb_typeof(p_value) <> 'boolean' then raise exception 'value_invalid' using errcode = 'P0001'; end if;
  select value into before from public.bo_config where key = p_key for update;
  if not found then raise exception 'key_invalid' using errcode = 'P0001'; end if;
  update public.bo_config set value = p_value, updated_at = now(), updated_by = p_staff where key = p_key;
  perform public.audit_add(p_staff, '설정 ' || p_key,
    case when p_key = 'solo_mode' then case when p_value = 'true' then '1인 운영 모드 켬(본인 초안 승인 허용)' else '1인 운영 모드 끔(본인 초안 승인 금지)' end else '설정 변경' end,
    jsonb_build_object('before', before, 'after', p_value), p_reason);
  return public.bo_config_get();
end; $$;

-- 검수 상태 전이: 1인 운영 모드에서는 관리자의 자기 승인·반려를 허용
create or replace function public.bo_review(p_version bigint, p_staff uuid, p_action text, p_reason text, p_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.data_reviews; solo boolean; is_admin boolean;
begin
  select * into r from public.data_reviews where version_id = p_version for update;
  if not found then raise exception 'version_invalid' using errcode = 'P0001'; end if;
  if p_action = 'request' then
    if r.state not in ('editing', 'rejected') then raise exception 'state_invalid' using errcode = 'P0001'; end if;
    if jsonb_array_length(coalesce(r.validation->'errors', '[]')) > 0 or jsonb_array_length(coalesce(r.validation->'blocks', '[]')) > 0 then
      raise exception 'validation_failed' using errcode = 'P0001';
    end if;
    update public.data_reviews set state = 'review', requested_by = p_staff, requested_at = now(), reject_reason = null,
           editors = case when p_staff = any(editors) then editors else editors || p_staff end, updated_at = now() where version_id = p_version;
  elsif p_action in ('approve', 'reject') then
    if r.state <> 'review' then raise exception 'state_invalid' using errcode = 'P0001'; end if;
    if p_staff = any(r.editors) or p_staff = r.requested_by then
      solo := coalesce((select value = 'true' from public.bo_config where key = 'solo_mode'), false);
      is_admin := exists (select 1 from public.staff where id = p_staff and role = 'admin' and active);
      if not (solo and is_admin) then raise exception 'self_review' using errcode = 'P0001'; end if;
      perform public.audit_add(p_staff, '데이터 v' || p_version, '1인 운영 모드로 본인 초안 ' || case when p_action = 'approve' then '승인' else '반려' end, '{}', coalesce(p_reason, ''));
    end if;
    if p_action = 'reject' and coalesce(char_length(trim(p_reason)), 0) < 2 then raise exception 'reason_required' using errcode = 'P0001'; end if;
    update public.data_reviews set state = case when p_action = 'approve' then 'approved' else 'rejected' end,
           reviewed_by = p_staff, reviewed_at = now(), reject_reason = case when p_action = 'reject' then p_reason end, updated_at = now()
     where version_id = p_version;
  elsif p_action = 'schedule' then
    if r.state not in ('approved', 'scheduled') then raise exception 'state_invalid' using errcode = 'P0001'; end if;
    if p_at is null or p_at < now() then raise exception 'schedule_invalid' using errcode = 'P0001'; end if;
    update public.data_reviews set state = 'scheduled', scheduled_for = p_at, scheduled_by = p_staff, updated_at = now() where version_id = p_version;
    update public.data_versions set scheduled_for = p_at where id = p_version;
  elsif p_action = 'unschedule' then
    if r.state <> 'scheduled' then raise exception 'state_invalid' using errcode = 'P0001'; end if;
    update public.data_reviews set state = 'approved', scheduled_for = null, updated_at = now() where version_id = p_version;
    update public.data_versions set scheduled_for = null where id = p_version;
  elsif p_action = 'discard' then
    if r.state in ('published', 'discarded') then raise exception 'state_invalid' using errcode = 'P0001'; end if;
    update public.data_reviews set state = 'discarded', updated_at = now() where version_id = p_version;
    update public.data_versions set status = 'discarded' where id = p_version;
  else raise exception 'action_invalid' using errcode = 'P0001';
  end if;
  return (select to_jsonb(x) from public.data_reviews x where x.version_id = p_version);
end; $$;

alter table public.bo_config enable row level security;
revoke all on table public.bo_config from anon, authenticated;
grant all on table public.bo_config to service_role;
do $$
declare f text;
begin
  foreach f in array array['public.bo_config_get()', 'public.bo_config_set(text,jsonb,uuid,text)', 'public.bo_review(bigint,uuid,text,text,timestamptz)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;
