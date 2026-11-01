-- step16: 추천덱 유형에 변칙(variant) 허용
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'deck_presets_style_check' and pg_get_constraintdef(oid) like '%variant%') then
    raise exception 'step16: variant 미허용';
  end if;
  raise notice 'step16 OK';
end $$;
