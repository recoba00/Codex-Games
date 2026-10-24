-- 테스트 환경(seongjwa-dev) 전용: 상점 확인용 가짜 상품 + 계정마다 테스트 골드 우편. 운영 DB에는 넣지 않는다.
insert into public.catalog_items (id, kind, character_id, name) values
  ('TEST_BACK_STAR', 'cardback', null, '별빛 뒷면(테스트)'),
  ('TEST_FRAME_MOON', 'frame', null, '달빛 프레임(테스트)'),
  ('TEST_EMOTE_WAVE', 'emote', null, '손 흔들기(테스트)'),
  ('TEST_SKIN_AU', 'skin', 'AU', '아우렐 여름 스킨(테스트)')
on conflict (id) do nothing;
insert into public.shop_offers (id, item_id, tab, price_gold, price_krw, slot) values
  ('TEST_O_BACK_STAR', 'TEST_BACK_STAR', 'cosmetic', 6000, 5900, 1),
  ('TEST_O_FRAME_MOON', 'TEST_FRAME_MOON', 'cosmetic', 6000, 5900, 2),
  ('TEST_O_EMOTE_WAVE', 'TEST_EMOTE_WAVE', 'cosmetic', 3000, 2900, 3),
  ('TEST_O_SKIN_AU', 'TEST_SKIN_AU', 'skin', null, 7900, 1)
on conflict (id) do nothing;
select count(public.mail_send(a.id, '테스트 골드', '상점 확인용 테스트 지급입니다.', '[{"type":"gold","amount":10000}]', 'devtest:gold1', 30)) as mailed
  from public.accounts a where a.status = 'active';
