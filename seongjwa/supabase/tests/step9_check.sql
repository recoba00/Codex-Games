-- 9·11단계 에셋 DB 함수 검사(11단계: 데이터 버전과 분리, 현재 + 직전 1개, 되돌리기, 감사 로그). 실패하면 예외, 끝에 rollback.
begin;
do $$
declare ad uuid; r jsonb; failed boolean; n integer;
begin
  perform public.staff_invite_create('h9-admin', 'admin', null, 1);
  ad := (public.staff_register('h9-admin', 'Boss9', '관리자', 'x', 'y', 100000)->>'id')::uuid;
  r := public.bo_asset_put(ad, 'slot:TIER_GOLD', '{"path":"slots/TIER_GOLD.a.webp","w":512,"h":512}', '슬롯 파일 교체', '{}');
  assert r->'cur'->>'path' = 'slots/TIER_GOLD.a.webp' and r->'prev' = 'null'::jsonb or r->>'prev' is null, 'first put';
  r := public.bo_asset_put(ad, 'slot:TIER_GOLD', '{"path":"slots/TIER_GOLD.b.webp"}', '슬롯 파일 교체', '{}');
  assert r->'prev'->>'path' = 'slots/TIER_GOLD.a.webp', 'prev kept';
  r := public.bo_asset_revert(ad, 'slot:TIER_GOLD');
  assert r->'cur'->>'path' = 'slots/TIER_GOLD.a.webp' and r->'prev'->>'path' = 'slots/TIER_GOLD.b.webp', 'revert swaps';
  -- 빼기 → 직전에 남고, 다음 올리기 때 빈 값이 직전 값을 덮지 않음
  perform public.bo_asset_put(ad, 'art:AU:000:face', '{"path":"f1"}', '얼굴', '{}');
  r := public.bo_asset_put(ad, 'art:AU:000:face', null, '얼굴 빼기', '{}');
  assert r->>'cur' is null and r->'prev'->>'path' = 'f1', 'remove keeps prev';
  r := public.bo_asset_put(ad, 'art:AU:000:face', '{"path":"f2"}', '얼굴', '{}');
  assert r->'prev'->>'path' = 'f1', 'null cur does not wipe prev';
  failed := false;
  begin perform public.bo_asset_revert(ad, 'slot:NONE'); exception when others then failed := sqlerrm = 'asset_no_previous'; end;
  assert failed, 'no previous';
  failed := false;
  begin perform public.bo_asset_put(ad, 'art:au:0:full', '{}', 'x', '{}'); exception when others then failed := true; end;
  assert failed, 'key format';
  r := public.asset_list();
  assert r->'slot:TIER_GOLD'->'cur'->>'path' = 'slots/TIER_GOLD.a.webp' and r->'slot:TIER_GOLD'->>'by' is not null, 'list';
  select count(*) into n from public.audit_log where target like '에셋 %' and staff_id = ad;
  assert n >= 6, 'audit ' || n;
  assert (public.bo_asset_usage()->'download'->>'bytes')::bigint >= 0, 'usage';
  raise notice 'step9 OK';
end $$;
rollback;
