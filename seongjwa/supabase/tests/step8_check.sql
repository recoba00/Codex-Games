-- 8단계 지표 로그·금칙어·계정 연동·삭제 DB 함수 검사. 실패하면 예외, 끝에 rollback.
begin;
do $$
declare a uuid; b uuid; ad uuid; r jsonb; failed boolean; wid bigint; h text := md5('x') || md5('y');
begin
  select account_id into a from public.auth_login('guest', 'chk8:a', 'steam', 'dev-a', h, 3600);
  select account_id into b from public.auth_login('steam', 'chk8:b', 'steam', 'dev-b', md5('b') || md5('c'), 3600);
  perform public.staff_invite_create('h8-admin', 'admin', null, 1);
  ad := (public.staff_register('h8-admin', 'Boss8', '관리자', 'x', 'y', 100000)->>'id')::uuid;

  -- 지표 로그: 여러 줄 한 번에, 공통 속성은 계정의 마지막 값, 없는 계정 줄은 버림
  perform public.client_profile(a, 'steam', 'desktop', '0.1.0');
  assert public.events_add(jsonb_build_array(
    jsonb_build_object('account', a, 'name', 'session_start', 'props', '{"res":"1920x1080"}'::jsonb),
    jsonb_build_object('account', a, 'name', 'match_found', 'props', '{"wait_sec":12}'::jsonb),
    jsonb_build_object('account', gen_random_uuid(), 'name', 'session_start'))) = 2, 'events batch';
  assert (select platform || device || app_ver from public.events where account_id = a and name = 'session_start') = 'steamdesktop0.1.0', 'common props';
  r := public.bo_metrics(now() - interval '1 day', now() + interval '1 minute');
  assert (r->>'waitSecMedian')::numeric = 12 and (r->'events'->>'session_start')::integer = 1 and (r->>'newAccounts')::integer >= 2, 'metrics ' || r::text;

  -- 금칙어: 기본 운영자 사칭 단어, 바꿔 쓰기(0→o)·기호 무시, 닉네임 변경 거부
  assert jsonb_array_length(public.name_matches('운 영 자123')) = 1, 'staff word';
  assert jsonb_array_length(public.name_matches('Adm1n_kim')) = 1, 'leet';
  assert jsonb_array_length(public.name_matches('gm_lee')) = 1 and jsonb_array_length(public.name_matches('bigman')) = 0, 'prefix';
  failed := false;
  begin perform public.profile_rename(a, '공식운영', 0, 'r1'); exception when others then failed := sqlerrm = 'name_banned'; end;
  assert failed, 'rename banned';
  wid := public.bo_word_add(ad, '바보', 'ko', 'profanity', 'contains', '테스트');
  failed := false;
  begin perform public.bo_word_add(ad, '바 보', 'ko', 'profanity', 'contains', ''); exception when others then failed := sqlerrm = 'word_exists'; end;
  assert failed, 'dup word';
  update public.accounts set display_name = '바보123' where id = b;
  assert exists (select 1 from jsonb_array_elements(public.bo_names_flagged(50)) x where x->>'id' = b::text), 'flagged';
  r := public.bo_words_bulk(ad, '[{"word":"멍청이","kind":"profanity"},{"word":"바 보"},{"word":"ㅂㅅ","match":"exact"},{"word":"!!"},{"word":"x","match":"weird"}]'::jsonb, '일괄');
  assert (r->>'added')::integer = 2 and r->'skipped' = '["바 보"]' and jsonb_array_length(r->'invalid') = 2, 'bulk ' || r::text;
  r := public.names_check('["멍청이123", "ㅂㅅ", "ㅂㅅ왕", "평범"]');
  assert jsonb_array_length(r->0->'hits') = 1 and jsonb_array_length(r->1->'hits') = 1 and jsonb_array_length(r->2->'hits') = 0 and jsonb_array_length(r->3->'hits') = 0, 'names check';
  perform public.bo_word_remove(ad, wid, '테스트 끝');
  assert jsonb_array_length(public.name_matches('바보123')) = 0, 'removed';
  assert (select count(*) from public.audit_log where target = '금칙어') >= 2, 'audit';

  -- 계정 연동: 새 수단 연결, 이미 다른 계정에 있으면 두 진행도 보여 주고 고르게(합치기 없음)
  assert public.identity_link(a, 'google', 'g-1', null, 1)->>'status' = 'linked', 'link';
  r := public.identity_link(a, 'steam', 'chk8:b', null, 1);
  assert r->>'status' = 'conflict' and r->'other'->>'id' = b::text, 'conflict';
  assert public.identity_link(a, 'steam', 'chk8:b', 'other', 1)->>'status' = 'switch', 'switch';
  r := public.identity_link(a, 'steam', 'chk8:b', 'current', 1);
  assert r->>'status' = 'moved' and (r->>'fromOrphaned')::boolean, 'moved';
  assert (select status from public.accounts where id = b) = 'deletion_pending', 'orphan pending';
  assert jsonb_array_length(public.account_info(a, 1)->'identities') = 3, 'three logins';

  -- 삭제 요청 → 유예 중 로그인하면 취소 → 다시 요청 → 14일 지나면 익명화(결제 기록 분리 보관)
  perform public.account_delete_request(a);
  assert (select status from public.accounts where id = a) = 'deletion_pending', 'pending';
  assert (select restored_from_deletion from public.auth_login('guest', 'chk8:a', 'steam', 'dev-a', md5('z') || md5('w'), 3600)), 'restored';
  perform public.account_delete_request(a);
  insert into public.shop_offers (id, item_id, tab, price_krw) values ('CHK8_OFFER', 'EMOTE_HELLO', 'cosmetic', 2900);
  insert into public.orders (account_id, offer_id, item_id, provider, status, amount, currency) values (a, 'CHK8_OFFER', 'EMOTE_HELLO', 'dev', 'delivered', 5900, 'KRW');
  update public.accounts set deletion_requested_at = now() - interval '15 days' where id in (a, b);
  assert public.account_purge_due(14, 5, 10) = 2, 'purged';
  assert (select status || display_name from public.accounts where id = a) = 'deleted탈퇴한 유저', 'anonymized';
  assert not exists (select 1 from public.identities where provider_uid in ('chk8:a', 'g-1', 'chk8:b')), 'uids gone';
  assert exists (select 1 from public.payment_archive where account_ref = a), 'archive';
  assert (select account_id from public.auth_login('guest', 'chk8:a', 'steam', 'dev-a', md5('q') || md5('e'), 3600)) <> a, 'new account after purge';
  assert not exists (select 1 from public.events where account_id = a), 'events detached';

  -- 오래된 로그 정리
  insert into public.events (name, at) values ('session_end', now() - interval '200 days');
  assert public.events_purge(90, 100) >= 1, 'events purge';
  raise notice 'step8 OK';
end $$;
rollback;
