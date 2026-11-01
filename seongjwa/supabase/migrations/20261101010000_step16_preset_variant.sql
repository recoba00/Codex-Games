-- 추천덱 세 번째 유형 '변칙'(variant) 허용 (기획답변 46차, 상세 15). 슬롯 3은 수비 또는 변칙
alter table public.deck_presets drop constraint if exists deck_presets_style_check;
alter table public.deck_presets add constraint deck_presets_style_check check (style = any (array['aggro'::text, 'balance'::text, 'defense'::text, 'variant'::text]));
