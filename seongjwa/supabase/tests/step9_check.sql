-- 9단계 에셋 DB 함수 검사. 실패하면 예외, 끝에 rollback.
begin;
do $$
declare ad uuid; pl uuid; v bigint; v2 bigint; b jsonb; failed boolean; live bigint;
begin
  perform public.staff_invite_create('h9-admin', 'admin', null, 1);
  ad := (public.staff_register('h9-admin', 'Boss9', '관리자', 'x', 'y', 100000)->>'id')::uuid;
  live := (select version_id from public.data_live);
  if live is null then  -- 빈 시험 DB: 빈 버전 하나를 라이브로
    live := public.data_create_draft(null, 'seed', null);
    perform public.data_publish(live);
  end if;
  v := public.bo_asset_draft(ad, '에셋 시험');
  assert (select state from public.data_reviews where version_id = v) = 'editing', 'draft review row';
  b := public.bo_asset_set(ad, v, 'assets', array['slots', 'TIER_GOLD'], '{"path":"slots/TIER_GOLD.a.webp","w":512,"h":512}', '슬롯 파일 교체', '{}');
  assert b->'slots'->'TIER_GOLD'->>'w' = '512', 'deep put';
  b := public.bo_asset_set(ad, v, 'art', array['AU', '000', 'card'], '{"x":0,"y":0.1,"w":1,"h":0.75}', '영역 지정', '{}');
  b := public.bo_asset_set(ad, v, 'art', array['AU', '000', 'face'], '{"path":"f"}', '얼굴', '{}');
  b := public.bo_asset_set(ad, v, 'art', array['AU', '000', 'face'], null, '얼굴 삭제', '{}');
  assert b->'AU'->'000' ? 'card' and not (b->'AU'->'000' ? 'face'), 'remove key';
  assert private.version_data(v)->'tables'->'assets'->'slots' ? 'TIER_GOLD', 'version data';
  -- 검수 요청 뒤에는 못 고침
  update public.data_reviews set state = 'review' where version_id = v;
  failed := false;
  begin perform public.bo_asset_set(ad, v, 'assets', array['slots', 'X'], '{}', 'x', '{}'); exception when others then failed := sqlerrm = 'state_invalid'; end;
  assert failed, 'locked after request';
  -- 배포 후 xlsx 가져오기가 assets·art를 이어받음
  update public.data_reviews set state = 'editing' where version_id = v;
  perform public.data_publish(v);
  v2 := public.bo_import_draft(v, 'xlsx', ad, '{"characters":{},"cards":{},"spells":{},"settings":{},"presets":[],"tables":{"missions":{}}}', '{}');
  assert private.version_data(v2)->'tables' ? 'assets' and private.version_data(v2)->'tables' ? 'art' and private.version_data(v2)->'tables' ? 'missions', 'carry assets';
  assert (public.bo_asset_usage()->'download'->>'bytes')::bigint >= 0, 'usage';
  raise notice 'step9 OK';
end $$;
rollback;
