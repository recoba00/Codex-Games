-- 13단계 LoL식 정리 DB 검사. 실패하면 예외, 끝에 rollback.
begin;
do $$
declare a uuid; b uuid; r jsonb; cfg jsonb;
begin
  insert into public.accounts (display_name) values ('L1') returning id into a;
  insert into public.accounts (display_name) values ('L2') returning id into b;
  -- 숙련도 단계 보상: 3단계 공용 감정표현, 4단계 '<캐릭터명> 장인' 칭호(한 번만)
  insert into public.catalog_items (id, kind, name) values ('EMOTE_MASTERY', 'emote', '숙련');
  cfg := '{"win_bonus":1,"t2":2,"t3":4,"t4":6,"emote_stage":3,"title_stage":4,"emote_item":"EMOTE_MASTERY"}';
  r := public.mastery_add(gen_random_uuid(), jsonb_build_array(jsonb_build_object('acc', a, 'char', 'AU', 'name', '아우렐', 'result', 'win'), jsonb_build_object('acc', b, 'char', 'SE', 'result', 'loss')), false, cfg);
  assert (r->0->>'stage')::integer = 2 and r->0->'unlocked' = '[]', 'stage 2 ' || r::text;
  r := public.mastery_add(gen_random_uuid(), jsonb_build_array(jsonb_build_object('acc', a, 'char', 'AU', 'name', '아우렐', 'result', 'win'), jsonb_build_object('acc', b, 'char', 'SE', 'result', 'loss')), false, cfg);
  assert r->0->'unlocked' = '["EMOTE_MASTERY"]', 'emote at 3 ' || r::text;
  r := public.mastery_add(gen_random_uuid(), jsonb_build_array(jsonb_build_object('acc', a, 'char', 'AU', 'name', '아우렐', 'result', 'win'), jsonb_build_object('acc', b, 'char', 'SE', 'result', 'loss')), false, cfg);
  assert r->0->'unlocked' = '["TITLE_MASTERY_AU"]', 'title at 4 ' || r::text;
  assert (select name from public.catalog_items where id = 'TITLE_MASTERY_AU') = '아우렐 장인', 'title name';
  assert (select count(*) from public.inventory where account_id = a and item_id in ('EMOTE_MASTERY', 'TITLE_MASTERY_AU')) = 2, 'owned';
  -- 시즌 보상: 시즌 중 정지 제재(해제 안 됨) 계정은 전체 제외, 홀로 등급도 없음
  insert into public.seasons (id, starts_at, ends_at) values (91, now() - interval '30 days', now() - interval '1 minute');
  insert into public.ratings (account_id, season_id, rp, tier_no, state) values (a, 91, 800, 9, '{"best":9}'), (b, 91, 800, 9, '{"best":9}');
  insert into public.sanctions (account_id, kind, until, reason, created_at) values (b, 'suspend', now() + interval '3 days', '시험 정지', now() - interval '5 days');
  update public.accounts set holo_grade = 3, holo_season = 90 where id = b;
  assert public.season_payout(91, jsonb_build_object('groups', jsonb_build_array(jsonb_build_object('key', 'gold', 'min', 7, 'max', 9, 'gold', 2000, 'grade', '1')), 'legends', '[]'::jsonb)) = 1, 'one paid';
  assert not exists (select 1 from public.mail where account_id = b and ref = 'season:91'), 'sanctioned excluded';
  assert (select holo_grade from public.accounts where id = b) is null and (select holo_grade from public.accounts where id = a) = 1, 'holo';
  -- 판·프로필 표시값
  r := public.badges_get(array[a, b], 91, 16);
  assert (r->a::text->'cur'->>'tier_no')::integer = 9 and (r->a::text->>'holo')::integer = 1, 'badges ' || r::text;
  r := public.profile_get(a);
  assert r->'seasons'->0->>'season' = '91' and (r->'seasons'->0->>'best')::integer = 9, 'profile seasons';
  raise notice 'step13 OK';
end $$;
rollback;
