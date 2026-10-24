-- 10단계 컵·어뷰징·요청 제한 DB 함수 검사. 실패하면 예외, 끝에 rollback.
begin;
do $$
declare a uuid; b uuid; e jsonb; failed boolean; wk date := date '2026-10-31'; sid integer;
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
  assert (select rewards @> '[{"id":"FRAME_CUP"},{"id":"TITLE_CUP_20261031"}]' from public.mail where account_id = a and ref like 'cup:%'), 'cup mail';
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

  -- 부계정 판단용 누적
  assert public.rank_state(a, sid)->'stats' ? 'games', 'stats';
  assert jsonb_typeof(public.bo_suspects('{}')->'macro') = 'array', 'suspects';
  raise notice 'step10 OK';
end $$;
rollback;
