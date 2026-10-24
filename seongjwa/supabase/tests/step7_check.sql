-- 7단계 친구·차단·초대·시즌 보상 DB 함수 검사. 실패하면 예외, 끝에 rollback.
begin;
do $$
declare a uuid; b uuid; c uuid; r jsonb; failed boolean; code text; rid bigint; sid integer;
begin
  insert into public.accounts (display_name) values ('Alpha') returning id into a;
  insert into public.accounts (display_name) values ('Bravo') returning id into b;
  insert into public.accounts (display_name) values ('Charlie') returning id into c;

  -- 친구 코드·요청·수락·상호 요청 자동 수락
  code := public.friend_code_get(b);
  assert code ~ '^[2-9A-HJKMNP-Z]{4}$' and public.friend_code_get(b) = code, 'code stable';
  r := public.friend_request(a, code, null);
  assert r->>'status' = 'sent', 'sent';
  assert jsonb_array_length(public.friends_list(b)->'incoming') = 1, 'incoming';
  rid := (public.friends_list(b)->'incoming'->0->>'id')::bigint;
  perform public.friend_respond(b, rid, true);
  assert private.is_friend(a, b) and private.is_friend(b, a), 'linked both ways';
  failed := false;
  begin perform public.friend_request(a, null, b); exception when others then failed := sqlerrm = 'already_friends'; end;
  assert failed, 'already';
  perform public.friend_request(c, null, a);
  r := public.friend_request(a, null, c);
  assert r->>'status' = 'accepted', 'mutual request auto accept';

  -- 접속 상태: 오프라인 → 온라인 → 게임 중(초대 불가) → 숨김
  assert public.friends_list(a)->'friends'->0->>'status' = 'offline', 'offline';
  perform public.presence_touch(b, false, null, null);
  assert (select x->>'status' from jsonb_array_elements(public.friends_list(a)->'friends') x where x->>'id' = b::text) = 'online', 'online';
  perform public.presence_touch(b, null, 'ABCDEF', null);
  failed := false;
  begin perform public.friend_invite(a, b, 'ABCDEF'); exception when others then failed := sqlerrm = 'friend_in_game'; end;
  assert failed, 'in game invite blocked';
  perform public.presence_touch(b, null, '', null);
  perform public.friend_invite(a, b, 'ABCDEF');
  r := public.friends_list(b)->'invites'->0;
  assert r->>'room' = 'ABCDEF', 'invite listed';
  assert (public.friend_invite_answer(b, (r->>'id')::bigint))->>'valid' = 'true', 'answer';
  assert jsonb_array_length(public.friends_list(b)->'invites') = 0, 'answered gone';
  perform public.presence_touch(b, null, null, true);
  assert (select x->>'status' from jsonb_array_elements(public.friends_list(a)->'friends') x where x->>'id' = b::text) = 'offline', 'hidden';

  -- 차단: 친구 끊김 + 요청 불가, 해제
  perform public.block_set(a, c, true);
  assert not private.is_friend(a, c), 'block unfriends';
  failed := false;
  begin perform public.friend_request(c, null, a); exception when others then failed := sqlerrm = 'friend_blocked'; end;
  assert failed, 'blocked request';
  perform public.block_set(a, c, false);
  assert public.friend_request(c, null, a)->>'status' = 'sent', 'unblock';
  perform public.friend_remove(a, b);
  assert not private.is_friend(b, a), 'remove both';

  -- 시즌 보상: 최고 티어 기준(막판 하락 무관), 레전드 명단, 우편 1번, 명예의 전당, 두 번 실행해도 한 번
  insert into public.seasons (id, starts_at, ends_at) values (90, now() - interval '30 days', now() - interval '1 minute');
  insert into public.ratings (account_id, season_id, rp, tier_no, state) values
    (a, 90, 3000, 16, '{"best":16}'), (b, 90, 300, 4, '{"best":8}'), (c, 90, 10, 1, '{"best":1}');
  sid := public.season_payout(90, jsonb_build_object(
    'groups', jsonb_build_array(
      jsonb_build_object('key', 'bronze', 'min', 1, 'max', 3, 'gold', 500),
      jsonb_build_object('key', 'silver', 'min', 4, 'max', 6, 'gold', 1000, 'frame', true, 'grade', 0),
      jsonb_build_object('key', 'gold', 'min', 7, 'max', 9, 'gold', 2000, 'frame', true, 'grade', 1, 'label', '골드'),
      jsonb_build_object('key', 'master', 'min', 16, 'max', 16, 'gold', 8000, 'frame', true, 'title', true, 'grade', 3, 'skin', true)),
    'legend', jsonb_build_object('gold', 12000, 'frame', true, 'title', true, 'grade', 4, 'skin', true, 'label', '레전드'),
    'legends', jsonb_build_array(a)));
  assert sid = 3, 'mailed 3';
  assert (select rewards->0->>'amount' from public.mail where account_id = b and ref = 'season:90') = '2000', 'best tier gold, not current';
  assert (select rewards from public.mail where account_id = a and ref = 'season:90') @> '[{"type":"item","id":"FRAME_S90_LEGEND"},{"type":"item","id":"TITLE_S90_LEGEND"}]', 'legend items';
  assert (select name from public.catalog_items where id = 'FRAME_S90_GOLD') = '시즌 90 골드 프레임', 'frame item';
  assert public.season_payout(90, '{}') = 0, 'once';
  assert public.hall_of_fame_list(90)->0->>'name' = 'Alpha', 'hall of fame';
  raise notice 'step7 OK';
end $$;
rollback;
