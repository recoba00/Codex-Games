-- 15단계: 카드 짧은 문구(effect_short)가 업로드 → 초안 복사 → 스냅샷까지 이어지는지. 실패하면 예외, 끝에 rollback.
begin;
do $$ declare ad uuid; v bigint; v2 bigint; begin
  perform public.staff_invite_create('h15', 'admin', null, 1);
  ad := (public.staff_register('h15', 'B15', '관리자', 'x', 'y', 100000)->>'id')::uuid;
  v := public.bo_import_draft(null, 't', ad, '{"characters":{},"cards":{"C01":{"name":"베기","kind":"attack","phase":4,"cost":1,"coef":1,"hits":1,"pierce":0,"effect_text":"ATK×1.0","effect_short":"피해 ATK×1.0"},"C02":{"name":"x","kind":"attack","phase":4,"cost":1,"coef":1,"hits":1,"pierce":0,"effect_text":"y","effect_short":""}},"spells":{},"settings":{},"presets":[],"tables":{}}', '{}');
  assert (select effect_short from public.cards where version_id = v and id = 'C02') is null, 'empty → null';
  v2 := public.data_create_draft(v, 'copy', ad);
  assert (select effect_short from public.cards where version_id = v2 and id = 'C01') = '피해 ATK×1.0', 'copy';
  raise notice 'step15 OK';
end $$;
rollback;
