-- 9단계: 에셋 등록(상세 14 '에셋 등록'·'이미지 업로드·압축', 상세 10, 기획답변 18·19차).
-- 파일은 Supabase Storage 공개 버킷 `assets`(무료 플랜, 결제 수단 없음). 어떤 파일을 쓰는지는 데이터 버전의 표 `assets`(슬롯)·`art`(캐릭터·스킨 이미지와 영역)에 둔다.
begin;

-- 버킷: 로컬 시험 DB에는 storage 스키마가 없으므로 있을 때만 만든다. 파일 상한 2MB, WebP만
do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $q$insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
                values ('assets', 'assets', true, 2097152, array['image/webp']) on conflict (id) do nothing$q$;
  end if;
end $$;

-- 에셋 작업용 초안(라이브를 그대로 복사, 검수 기록 포함)
create or replace function public.bo_asset_draft(p_staff uuid, p_note text) returns bigint language plpgsql security definer set search_path = '' as $$
declare v bigint; live bigint := (select version_id from public.data_live);
begin
  if live is null then raise exception 'data_not_published' using errcode = 'P0001'; end if;
  v := public.data_create_draft(live, coalesce(nullif(p_note, ''), '에셋 변경'), p_staff);
  insert into public.data_reviews (version_id, editors, validation) values (v, array[p_staff], '{}');
  perform public.audit_add(p_staff, '데이터 v' || v, '에셋 초안 만들기', jsonb_build_object('basedOn', live), coalesce(p_note, ''));
  return v;
end; $$;

-- 깊은 경로에 값 넣기(중간 키가 없으면 만든다). 값이 null이면 그 키를 지운다
create or replace function private.jsonb_put(p_body jsonb, p_path text[], p_value jsonb) returns jsonb language plpgsql immutable set search_path = '' as $$
declare head text;
begin
  if coalesce(array_length(p_path, 1), 0) = 0 then return p_value; end if;
  head := p_path[1];
  if array_length(p_path, 1) = 1 then
    return case when p_value is null then coalesce(p_body, '{}') - head else jsonb_set(coalesce(p_body, '{}'), array[head], p_value, true) end;
  end if;
  return jsonb_set(coalesce(p_body, '{}'), array[head], private.jsonb_put(coalesce(p_body, '{}')->head, p_path[2:], p_value), true);
end; $$;

-- 초안의 표 assets·art 고치기. 편집 중(또는 반려된) 초안만. 고친 직원은 편집자에 들어가 자기 승인 금지 규칙을 따른다
create or replace function public.bo_asset_set(p_staff uuid, p_version bigint, p_table text, p_path text[], p_value jsonb, p_action text, p_detail jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare st text; nb jsonb;
begin
  if p_table not in ('assets', 'art') then raise exception 'value_invalid' using errcode = 'P0001'; end if;
  select r.state into st from public.data_reviews r join public.data_versions v on v.id = r.version_id
   where r.version_id = p_version and v.status = 'draft' for update of r;
  if st is null or st not in ('editing', 'rejected') then raise exception 'state_invalid' using errcode = 'P0001'; end if;
  insert into public.data_tables (version_id, name, body) values (p_version, p_table, '{}') on conflict (version_id, name) do nothing;
  select private.jsonb_put(t.body, p_path, p_value) into nb from public.data_tables t where t.version_id = p_version and t.name = p_table;
  update public.data_tables set body = nb where version_id = p_version and name = p_table;
  update public.data_reviews set state = 'editing', reject_reason = null, updated_at = now(),
         editors = case when p_staff = any(editors) then editors else editors || p_staff end
   where version_id = p_version;
  perform public.audit_add(p_staff, '데이터 v' || p_version, p_action, coalesce(p_detail, '{}') || jsonb_build_object('path', array_to_string(p_path, '.')), '');
  return nb;
end; $$;

-- xlsx 가져오기: 시트에 없는 표(assets·art)는 기준 버전에서 이어받는다(에셋이 시트 업로드로 사라지지 않게)
create or replace function public.bo_import_draft(p_based_on bigint, p_note text, p_staff uuid, p_payload jsonb, p_validation jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v bigint; d jsonb := p_payload;
begin
  v := public.data_create_draft(null, p_note, p_staff);
  update public.data_versions set based_on = p_based_on where id = v;
  insert into public.characters (version_id, id, name, job, role, faction, rarity, offer, hp, atk, def, spd, crit,
                                 passive_name, passive_text, active_name, active_text, passive_params, active_params)
  select v, x.key, x.value->>'name', x.value->>'job', x.value->>'role', x.value->>'faction', x.value->>'rarity', x.value->>'offer',
         (x.value->>'hp')::numeric, (x.value->>'atk')::numeric, (x.value->>'def')::numeric, (x.value->>'spd')::numeric, (x.value->>'crit')::numeric,
         x.value->>'passive_name', x.value->>'passive_text', x.value->>'active_name', x.value->>'active_text',
         coalesce(x.value->'passive_params', '{}'), coalesce(x.value->'active_params', '{}')
    from jsonb_each(d->'characters') x;
  insert into public.cards (version_id, id, name, kind, phase, owner_character, cost, coef, hits, pierce, effect_text)
  select v, x.key, x.value->>'name', x.value->>'kind', (x.value->>'phase')::smallint, x.value->>'owner_character', (x.value->>'cost')::smallint,
         (x.value->>'coef')::numeric, (x.value->>'hits')::smallint, (x.value->>'pierce')::numeric, x.value->>'effect_text'
    from jsonb_each(d->'cards') x;
  insert into public.spells (version_id, id, name, effect_text, value, cooldown)
  select v, x.key, x.value->>'name', x.value->>'effect_text', (x.value->>'value')::numeric, (x.value->>'cooldown')::smallint
    from jsonb_each(d->'spells') x;
  insert into public.settings (version_id, key, value, unit, description)
  select v, x.key, x.value->'value', coalesce(x.value->>'unit', ''), coalesce(x.value->>'desc', '')
    from jsonb_each(d->'settings') x;
  insert into public.deck_presets (version_id, character_id, slot, style, cards)
  select v, p->>'character_id', (p->>'slot')::smallint, p->>'style', array(select jsonb_array_elements_text(p->'cards'))
    from jsonb_array_elements(d->'presets') p;
  insert into public.data_tables (version_id, name, body) select v, x.key, x.value from jsonb_each(d->'tables') x;
  insert into public.data_tables (version_id, name, body)
  select v, t.name, t.body from public.data_tables t
   where t.version_id = p_based_on and t.name in ('assets', 'art') and not (coalesce(d->'tables', '{}') ? t.name);
  insert into public.data_reviews (version_id, editors, validation) values (v, array[p_staff], coalesce(p_validation, '{}'));
  return v;
end; $$;

-- 사용량(상세 14·기획답변 18차): 저장 용량은 버킷 파일 합계, 전송량은 게임이 보낸 asset_download 이벤트(이번 달) 합계로 추정
create or replace function public.bo_asset_usage() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare st jsonb := jsonb_build_object('bytes', 0, 'files', 0, 'available', false);
begin
  if to_regclass('storage.objects') is not null then
    execute $q$select jsonb_build_object('bytes', coalesce(sum((metadata->>'size')::bigint), 0), 'files', count(*), 'available', true)
                 from storage.objects where bucket_id = 'assets'$q$ into st;
  end if;
  return jsonb_build_object('storage', st,
    'download', (select jsonb_build_object('bytes', coalesce(sum((props->>'bytes')::bigint), 0), 'events', count(*))
                   from public.events where name = 'asset_download' and at >= date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
                    and jsonb_typeof(props->'bytes') = 'number'));
end; $$;

revoke execute on function public.bo_asset_draft(uuid, text) from public, anon, authenticated;
grant execute on function public.bo_asset_draft(uuid, text) to service_role;
revoke execute on function public.bo_asset_set(uuid, bigint, text, text[], jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.bo_asset_set(uuid, bigint, text, text[], jsonb, text, jsonb) to service_role;
revoke execute on function public.bo_asset_usage() from public, anon, authenticated;
grant execute on function public.bo_asset_usage() to service_role;
revoke execute on function private.jsonb_put(jsonb, text[], jsonb) from public, anon, authenticated;
commit;
