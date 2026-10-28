-- 10단계 컵·어뷰징·요청 제한 DB 함수 검사. 실패하면 예외, 끝에 rollback.
begin;
do $$
declare a uuid; b uuid; c uuid; e jsonb; cfg jsonb; failed boolean; wk date := date '2026-10-31'; sid integer;
begin
  insert into public.accounts (display_name) values ('CupA') returning id into a;
  insert into public.accounts (display_name) values ('CupB') returning id into b;
  insert into public.seasons (id, starts_at, ends_at) values (77, now() - interval '1 day', now() + interval '20 days');
  sid := 77;
  insert into public.ratings (account_id, season_id, rp, tier_no, state) values (a, sid, 1000, 11, '{"best":11}'), (b, sid, 500, 6, '{"best":6}');

  -- 요청 제한
  assert public.rate_hit('t:1', 2, 60) and public.rate_hit('t:1', 2, 60) and not public.rate_hit('t:1', 2, 60), 'rate limit';

  -- 컵 자격·참가권
  failed := false;
  begin perform public.cup_enter(b, wk, sid, '[]', 10); exception when others then failed := sqlerrm = 'cup_not_eligible'; end;
  assert failed, 'eligibility';
  e := public.cup_enter(a, wk, sid, '[{"char":"AU","preset":1},{"char":"SE","preset":2},{"char":"UM","preset":3}]', 10);
  failed := false;
  begin perform public.cup_enter(a, wk, sid, '[]', 10); exception when others then failed := sqlerrm = 'cup_entry_active'; end;
  assert failed, 'one active';
  -- 7승 → 끝 + 보상(프레임·칭호), 같은 판 두 번 와도 한 번
  for i in 1..7 loop perform public.cup_record((e->>'id')::bigint, gen_random_uuid(), 'win', '{}'); end loop;
  e := public.cup_record((e->>'id')::bigint, gen_random_uuid(), 'win', '{}');
  assert e->>'status' = 'done' and (e->>'wins')::integer = 7 and e->>'rewarded_at' is not null, 'seven wins ' || e::text;
  assert (select rewards @> '[{"id":"TITLE_CUP_20261031"}]' and rewards::text not like '%FRAME_CUP%' from public.mail where account_id = a and ref like 'cup:%'), 'cup mail: title only';
  -- 참가권: 무료 1회 사용 → 다시 못 함, 보너스로 1회 더
  failed := false;
  begin perform public.cup_enter(a, wk, sid, '[]', 10); exception when others then failed := sqlerrm = 'cup_no_ticket'; end;
  assert failed, 'no ticket';
  perform public.cup_bonus_grant(a, wk);
  e := public.cup_enter(a, wk, sid, '[{"char":"AU","preset":1},{"char":"SE","preset":2},{"char":"UM","preset":3}]', 10);
  -- 이탈 → 패배·끝·다음 주 차감, 같은 주 재참가 불가
  e := public.cup_record((e->>'id')::bigint, gen_random_uuid(), 'leave', '{}');
  assert e->>'status' = 'left' and (e->>'losses')::integer = 1, 'leave';
  assert exists (select 1 from public.cup_penalties where account_id = a and week = wk + 7), 'penalty next week';
  assert (public.cup_status(a, wk + 7, sid)->>'penalty')::boolean, 'status penalty';
  failed := false;
  begin perform public.cup_enter(a, wk + 7, sid, '[]', 10); exception when others then failed := sqlerrm = 'cup_no_ticket'; end;
  assert failed, 'penalty consumes free ticket';
  -- 주말 끝 마감: 진행 중 참가는 그 성적으로
  update public.ratings set state = '{"best":12}' where account_id = b;
  e := public.cup_enter(b, wk, sid, '[{"char":"AU","preset":1},{"char":"SE","preset":2},{"char":"UM","preset":3}]', 10);
  perform public.cup_record((e->>'id')::bigint, gen_random_uuid(), 'win', '{}');
  assert public.cup_close_week(wk + 2, '{"gold_0":1000}') = 1, 'close';
  assert (select (rewards->0->>'amount')::integer from public.mail where account_id = b and ref like 'cup:%') = 1000, 'close reward';

  -- 10d: 구간표 보상 + 시즌 3주차 특별 주간 골드 ×1.5(10/17 시작 시즌의 10/31 주 = 3주차)
  cfg := '{"tiers":[{"min":0,"max":2,"gold":1000},{"min":3,"max":4,"gold":2000},{"min":5,"max":6,"gold":3000,"emote":true},{"min":7,"max":7,"gold":3000,"emote":true,"frame":true}],"special_week":3,"special_mult":1.5}';
  insert into public.accounts (display_name) values ('CupC') returning id into c;
  insert into public.seasons (id, starts_at, ends_at) values (78, timestamptz '2026-10-17 10:00+09', timestamptz '2026-11-14 10:00+09');
  insert into public.ratings (account_id, season_id, rp, tier_no, state) values (c, 78, 1000, 11, '{"best":11}');
  e := public.cup_enter(c, wk, 78, '[{"char":"AU","preset":1},{"char":"SE","preset":2},{"char":"UM","preset":3}]', 10);
  for i in 1..3 loop perform public.cup_record((e->>'id')::bigint, gen_random_uuid(), 'win', cfg); end loop;
  for i in 1..3 loop e := public.cup_record((e->>'id')::bigint, gen_random_uuid(), 'loss', cfg); end loop;
  assert e->>'status' = 'done', 'c done';
  assert (select (rewards->0->>'amount')::integer from public.mail where account_id = c and ref like 'cup:%') = 3000, 'special week 2000x1.5';
  assert (select jsonb_array_length(rewards) from public.mail where account_id = c and ref like 'cup:%') = 1, 'gold only';
  assert (select title from public.mail where account_id = c and ref like 'cup:%') like '%특별 주간%', 'special subject';

  -- 부계정 판단용 누적
  assert public.rank_state(a, sid)->'stats' ? 'games', 'stats';
  assert jsonb_typeof(public.bo_suspects('{}')->'macro') = 'array', 'suspects';
  raise notice 'step10 OK';
end $$;
rollback;
