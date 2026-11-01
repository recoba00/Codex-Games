-- 15단계: 카드 면 짧은 문구(시트 `전투카드` 열 `효과_짧게`, 기획지시 2026-11-01 전투UI개편 7). 스냅샷은 to_jsonb(k)라 자동 포함
begin;
alter table public.cards add column if not exists effect_short text;

create or replace function public.data_create_draft(p_based_on bigint, p_note text, p_by uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  insert into public.data_versions (based_on, note, created_by) values (p_based_on, p_note, p_by) returning id into v;
  if p_based_on is not null then
    insert into public.characters select v, c.id, c.name, c.job, c.role, c.faction, c.rarity, c.offer, c.price_note, c.release_at,
      c.hp, c.atk, c.def, c.spd, c.crit, c.passive_name, c.passive_text, c.active_name, c.active_text,
      c.passive_params, c.active_params, c.keywords, c.art_full, c.art_face, c.enabled, c.difficulty
      from public.characters c where c.version_id = p_based_on;
    insert into public.cards select v, k.id, k.name, k.kind, k.phase, k.owner_character, k.cost, k.coef, k.hits, k.pierce, k.effect_text, k.params, k.effect_short
      from public.cards k where k.version_id = p_based_on;
    insert into public.spells select v, s.id, s.name, s.effect_text, s.value, s.cooldown, s.params
      from public.spells s where s.version_id = p_based_on;
    insert into public.settings select v, t.key, t.value, t.unit, t.description
      from public.settings t where t.version_id = p_based_on;
    insert into public.deck_presets select v, d.character_id, d.slot, d.style, d.cards
      from public.deck_presets d where d.version_id = p_based_on;
    insert into public.data_tables select v, x.name, x.body
      from public.data_tables x where x.version_id = p_based_on;
  end if;
  return v;
end; $$;

create or replace function public.bo_import_draft(p_based_on bigint, p_note text, p_staff uuid, p_payload jsonb, p_validation jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v bigint; d jsonb := p_payload;
begin
  v := public.data_create_draft(null, p_note, p_staff);
  update public.data_versions set based_on = p_based_on where id = v;
  insert into public.characters (version_id, id, name, job, role, faction, rarity, difficulty, offer, hp, atk, def, spd, crit,
                                 passive_name, passive_text, active_name, active_text, passive_params, active_params)
  select v, x.key, x.value->>'name', x.value->>'job', x.value->>'role', x.value->>'faction', coalesce(x.value->>'rarity', ''), nullif(x.value->>'difficulty', ''), x.value->>'offer',
         (x.value->>'hp')::numeric, (x.value->>'atk')::numeric, (x.value->>'def')::numeric, (x.value->>'spd')::numeric, (x.value->>'crit')::numeric,
         x.value->>'passive_name', x.value->>'passive_text', x.value->>'active_name', x.value->>'active_text',
         coalesce(x.value->'passive_params', '{}'), coalesce(x.value->'active_params', '{}')
    from jsonb_each(d->'characters') x;
  insert into public.cards (version_id, id, name, kind, phase, owner_character, cost, coef, hits, pierce, effect_text, effect_short)
  select v, x.key, x.value->>'name', x.value->>'kind', (x.value->>'phase')::smallint, x.value->>'owner_character', (x.value->>'cost')::smallint,
         (x.value->>'coef')::numeric, (x.value->>'hits')::smallint, (x.value->>'pierce')::numeric, x.value->>'effect_text', nullif(x.value->>'effect_short', '')
    from jsonb_each(d->'cards') x;
  insert into public.spells (version_id, id, name, effect_text, value, cooldown)
  select v, x.key, x.value->>'name', x.value->>'effect_text', (x.value->>'value')::numeric, (x.value->>'cooldown')::smallint
    from jsonb_each(d->'spells') x;
  insert into public.settings (version_id, key, value, unit, description)
  select v, x.key, x.value->'value', coalesce(x.value->>'unit', ''), coalesce(x.value->>'desc', '')
    from jsonb_each(d->'settings') x;
  insert into public.deck_presets (version_id, character_id, slot, style, cards)
  select v, p->>'character_id', (p->>'slot')::smallint, p->>'style', array(select jsonb_array_elements_text(p->'cards'))
    from jsonb_array_elements(d->'presets') p;
  insert into public.data_tables (version_id, name, body) select v, x.key, x.value from jsonb_each(d->'tables') x;
  insert into public.data_tables (version_id, name, body)
  select v, t.name, t.body from public.data_tables t
   where t.version_id = p_based_on and t.name in ('assets', 'art') and not (coalesce(d->'tables', '{}') ? t.name);
  insert into public.data_reviews (version_id, editors, validation) values (v, array[p_staff], coalesce(p_validation, '{}'));
  return v;
end; $$;


commit;
