-- 5단계 경제·상점·우편 DB 함수 검사. 실패하면 예외. 끝에 rollback이라 데이터가 남지 않는다.
-- 실행: psql -v ON_ERROR_STOP=1 -f supabase/tests/step5_check.sql
begin;
do $$
declare a uuid; b uuid; r jsonb; m uuid; o bigint; failed boolean;
begin
  insert into public.accounts (display_name) values ('Alice') returning id into a;
  insert into public.accounts (display_name) values ('Bob') returning id into b;
  insert into public.identities (account_id, provider, provider_uid) values (b, 'steam', '76561198000000001');

  -- 1) econ_commit: 상태 + 골드, 같은 ref 두 번이면 duplicate, 버전 충돌
  r := public.econ_commit(a, 'match:1', 0, '{"day":"2026-10-24"}', 130, 'match_win', '{}');
  assert r->>'status' = 'ok' and (r->>'gold')::int = 130, 'commit 1 ' || r;
  r := public.econ_commit(a, 'match:1', 1, '{}', 130, 'match_win', '{}');
  assert r->>'status' = 'duplicate', 'dup ' || r;
  failed := false;
  begin perform public.econ_commit(a, 'match:2', 0, '{}', 30, 'match_win', '{}'); exception when others then failed := sqlerrm = 'econ_conflict'; end;
  assert failed, 'version conflict';
  r := public.econ_get(a, 1);
  assert (r->>'gold')::int = 130 and (r->>'version')::int = 1 and r->'state'->>'day' = '2026-10-24', 'get ' || r;

  -- 2) 상한 999,999 (넘친 양은 장부 detail.capped)
  r := public.econ_commit(a, 'admin:big', 1, '{}', 1000000, 'admin', '{}');
  assert (r->>'gold')::int = 999999, 'cap ' || r;
  assert (select (detail->>'capped')::int from public.gold_ledger where account_id = a and ref = 'admin:big') = 130 + 1000000 - 999999, 'capped detail';
  update public.wallets set gold = 7000 where account_id = a;

  -- 3) 골드 구매: 가격 확인, 보유 중이면 거절, 골드 부족
  insert into public.catalog_items (id, kind, name) values ('T_BACK', 'cardback', '시험 뒷면'), ('T_SKIN', 'skin', '시험 스킨'), ('T_EMO', 'emote', '시험 감정');
  insert into public.catalog_items (id, kind, name, bundle_items) values ('T_BUNDLE', 'bundle', '시험 번들', '{T_SKIN,T_EMO}');
  insert into public.shop_offers (id, item_id, tab, price_gold, price_krw) values ('O_BACK', 'T_BACK', 'cosmetic', 6000, 5900);
  insert into public.shop_offers (id, item_id, tab, price_krw) values ('O_BUNDLE', 'T_BUNDLE', 'bundle', 25000);
  insert into public.shop_offers (id, item_id, tab, price_gold, ends_at, starts_at) values ('O_OLD', 'T_EMO', 'cosmetic', 3000, now() - interval '1 day', now() - interval '2 day');
  failed := false;
  begin perform public.shop_buy_gold(a, 'O_BACK', 5000, 'buy:x'); exception when others then failed := sqlerrm = 'price_changed'; end;
  assert failed, 'price_changed';
  r := public.shop_buy_gold(a, 'O_BACK', 6000, 'buy:1');
  assert (r->>'gold')::int = 1000 and private.owns(a, 'T_BACK'), 'buy ' || r;
  assert public.shop_buy_gold(a, 'O_BACK', 6000, 'buy:1')->>'status' = 'duplicate', 'buy dup';
  failed := false;
  begin perform public.shop_buy_gold(a, 'O_BACK', 6000, 'buy:2'); exception when others then failed := sqlerrm = 'already_owned'; end;
  assert failed, 'already_owned';
  failed := false;
  begin perform public.shop_buy_gold(a, 'O_OLD', 3000, 'buy:3'); exception when others then failed := sqlerrm = 'offer_unavailable'; end;
  assert failed, 'ended offer';
  failed := false;
  begin perform public.shop_buy_gold(a, 'O_BUNDLE', 25000, 'buy:4'); exception when others then failed := sqlerrm = 'gold_not_allowed'; end;
  assert failed, 'cash only';
  update public.inventory set revoked_at = now() where account_id = a and item_id = 'T_BACK';
  update public.wallets set gold = 100 where account_id = a;
  failed := false;
  begin perform public.shop_buy_gold(a, 'O_BACK', 6000, 'buy:5'); exception when others then failed := sqlerrm = 'gold_short'; end;
  assert failed, 'gold_short';
  assert (select gold from public.wallets where account_id = a) = 100, 'no partial charge';

  -- 4) 현금 주문 → 지급(번들은 구성품까지) → 중복 지급 없음 → 환불 회수
  r := public.order_create(b, 'O_BUNDLE', 'steam', 25000);
  o := (r->>'order')::bigint;
  assert r->>'steamId' = '76561198000000001' and o >= 100000, 'order ' || r;
  perform public.order_mark(o, 'approved', 'T123', '{}');
  r := public.order_deliver(o, 'T123', false);
  assert r->>'status' = 'ok' and private.owns(b, 'T_BUNDLE') and private.owns(b, 'T_SKIN') and private.owns(b, 'T_EMO'), 'deliver ' || r;
  assert public.order_deliver(o, null, false)->>'status' = 'duplicate', 'deliver dup';
  failed := false;
  begin perform public.order_create(b, 'O_BUNDLE', 'steam', 25000); exception when others then failed := sqlerrm = 'already_owned'; end;
  assert failed, 'owned bundle';
  r := public.order_refund(o, 'test');
  assert not private.owns(b, 'T_BUNDLE') and not private.owns(b, 'T_SKIN'), 'refund revoke';
  assert (select status from public.orders where id = o) = 'refunded', 'refund status';

  -- 5) 우편 지급 경로(결제됐는데 지급 안 됨 → 다음 로그인 때 우편) + 모두 받기
  r := public.order_create(b, 'O_BACK', 'steam', 5900);
  o := (r->>'order')::bigint;
  r := public.order_deliver(o, 'T124', true);
  assert r->>'viaMail' = 'true' and not private.owns(b, 'T_BACK'), 'mail deliver ' || r;
  m := public.mail_send(b, '보상', '', '[{"type":"gold","amount":300},{"type":"gold","amount":200}]', 'event:1', 30);
  assert public.mail_send(b, '보상', '', '[{"type":"gold","amount":300}]', 'event:1', 30) is null, 'mail ref dup';
  perform public.mail_send(b, '만료', '', '[{"type":"gold","amount":999}]', 'event:old', 30);
  update public.mail set expires_at = now() - interval '1 hour' where ref = 'event:old';
  assert (public.econ_get(b, 1)->>'mail_unread')::int = 2, 'unread';
  r := public.mail_claim(b, null);
  assert (r->>'claimed')::int = 2 and (r->>'gold')::int = 500 and (r->>'balance')::int = 500 and private.owns(b, 'T_BACK'), 'claim ' || r;
  assert (public.mail_claim(b, null)->>'claimed')::int = 0, 'claim twice';

  -- 6) 닉네임: 첫 변경 무료, 2회째 골드, 부족하면 실패
  r := public.profile_rename(b, '밥이', 4000, 'name:1');
  assert (r->>'cost')::int = 0, 'rename free ' || r;
  failed := false;
  begin perform public.profile_rename(b, '밥이다', 4000, 'name:2'); exception when others then failed := sqlerrm = 'gold_short'; end;
  assert failed, 'rename cost';
  assert (select display_name from public.accounts where id = b) = '밥이', 'name kept';

  -- 7) 장착: 가진 것만
  perform public.profile_equip(b, '{"cardback":"T_BACK","emotes":["EMOTE_HELLO"]}', '{T_BACK,EMOTE_HELLO}');
  failed := false;
  begin perform public.profile_equip(b, '{"skins":{"AU":"T_SKIN"}}', '{T_SKIN}'); exception when others then failed := sqlerrm = 'item_not_owned'; end;
  assert failed, 'equip not owned';
  r := public.inventory_list(b);
  assert jsonb_array_length(r->'items') = 5 and r->'equipped'->>'cardback' = 'T_BACK', 'inventory ' || r;  -- 기본 감정표현 4 + 뒷면
  r := public.shop_list(b);
  assert jsonb_array_length(r) = 2 and (select bool_or((x->>'owned')::boolean) from jsonb_array_elements(r) x where x->>'offer' = 'O_BACK'), 'shop ' || r;

  raise notice 'step5 OK';
end $$;
rollback;
