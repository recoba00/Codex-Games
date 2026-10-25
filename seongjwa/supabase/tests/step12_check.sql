-- 12단계 난이도·숙련도 DB 검사. 실패하면 예외, 끝에 rollback.
begin;
do $$
declare a uuid; b uuid; c uuid; v bigint; v2 bigint; r jsonb; m uuid;
begin
  -- 난이도: xlsx 가져오기 → 초안 복사까지 이어짐
  v := public.bo_import_draft(null, 't12', null, '{"characters":{"AU":{"name":"아우렐","job":"j","role":"r","faction":"불","difficulty":"easy","offer":"included","hp":1000,"atk":100,"def":50,"spd":90,"crit":5,"passive_name":"p","passive_text":"p","active_name":"a","active_text":"a"}},"cards":{},"spells":{},"settings":{},"presets":[],"tables":{}}', '{}');
  assert (select difficulty from public.characters where version_id = v and id = 'AU') = 'easy', 'import difficulty';
  assert (select rarity from public.characters where version_id = v and id = 'AU') = '', 'rarity optional';
  v2 := public.data_create_draft(v, 'copy', null);
  assert (select difficulty from public.characters where version_id = v2 and id = 'AU') = 'easy', 'draft copies difficulty';

  insert into public.accounts (display_name) values ('M1') returning id into a;
  insert into public.accounts (display_name) values ('M2') returning id into b;
  insert into public.accounts (display_name) values ('M3') returning id into c;
  -- 승리 +2, 패배 +1, 같은 판 다시 와도 한 번
  m := gen_random_uuid();
  r := public.mastery_add(m, jsonb_build_array(jsonb_build_object('acc', a, 'char', 'AU', 'result', 'win'), jsonb_build_object('acc', b, 'char', 'SE', 'result', 'loss')), false, '{"win_bonus":1}');
  perform public.mastery_add(m, jsonb_build_array(jsonb_build_object('acc', a, 'char', 'AU', 'result', 'win'), jsonb_build_object('acc', b, 'char', 'SE', 'result', 'loss')), false, '{"win_bonus":1}');
  r := public.mastery_get(array[a, b]);
  assert (r->a::text->'AU'->>'points')::integer = 2 and (r->a::text->'AU'->>'wins')::integer = 1, 'win +2 ' || r::text;
  assert (r->b::text->'SE'->>'points')::integer = 1 and (r->b::text->'SE'->>'games')::integer = 1, 'loss +1';
  -- 이탈한 쪽 0, 이른 항복 판 0
  r := public.mastery_add(gen_random_uuid(), jsonb_build_array(jsonb_build_object('acc', a, 'char', 'AU', 'result', 'win'), jsonb_build_object('acc', c, 'char', 'UM', 'result', 'leave')), false, '{}');
  assert r->1->>'reason' = 'leave' and (r->0->>'points')::integer = 2, 'leave side 0';
  r := public.mastery_add(gen_random_uuid(), jsonb_build_array(jsonb_build_object('acc', a, 'char', 'AU', 'result', 'win'), jsonb_build_object('acc', c, 'char', 'UM', 'result', 'loss')), true, '{}');
  assert r->0->>'reason' = 'early' and (r->0->>'points')::integer = 0, 'early 0';
  -- 몰아주기 조건(같은 두 계정 7일 3판 중 이른 종료 2판)에 걸리면 0
  insert into public.match_results (id, mode, data_version, player_a, player_b, outcome, finish_reason, turns, started_at, ended_at, summary)
  select gen_random_uuid(), 'ranked', v, b, c, 'a', 'surrender', 2, now(), now(), '{}' from generate_series(1, 2);
  insert into public.match_results (id, mode, data_version, player_a, player_b, outcome, finish_reason, turns, started_at, ended_at, summary)
  values (gen_random_uuid(), 'ranked', v, c, b, 'a', 'hp', 8, now(), now(), '{}');
  r := public.mastery_add(gen_random_uuid(), jsonb_build_array(jsonb_build_object('acc', c, 'char', 'UM', 'result', 'win'), jsonb_build_object('acc', b, 'char', 'SE', 'result', 'loss')), false, '{"pair_days":7,"pair_games":3,"pair_early":2}');
  assert r->0->>'reason' = 'pair' and r->1->>'reason' = 'pair', 'pair excluded ' || r::text;
  assert (public.mastery_get(array[a])->a::text->'AU'->>'points')::integer = 4, 'a total 4';
  -- 계정 삭제(익명화) → 0
  update public.accounts set status = 'deleted' where id = a;
  assert (select points from public.mastery where account_id = a and character_id = 'AU') = 0, 'purge on delete';
  -- 슬롯 이름 RARITY_* → MASTERY_n
  insert into public.asset_files (key, cur) values ('slot:RARITY_EPIC', '{"path":"x"}');
  update public.asset_files f set key = 'slot:MASTERY_' || n.no from (values ('COMMON', 1), ('RARE', 2), ('EPIC', 3), ('LEGEND', 4)) n(old, no)
   where f.key = 'slot:RARITY_' || n.old;
  assert exists (select 1 from public.asset_files where key = 'slot:MASTERY_3'), 'slot key';
  raise notice 'step12 OK';
end $$;
rollback;
