-- 12단계: 캐릭터 등급 폐지 → 난이도 뱃지, 계정×캐릭터 숙련도(기획지시 2026-10-25 숙련도, 총괄 4·13장, 상세 10·14).
begin;
-- 난이도(easy·normal·hard). 등급 열은 옛 버전 기록용으로 남기고, 새 버전은 빈 문자열
alter table public.characters add column if not exists difficulty text check (difficulty in ('easy', 'normal', 'hard'));

-- 초안 복사·xlsx 가져오기가 난이도를 옮기도록 다시 정의
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
    insert into public.cards select v, k.id, k.name, k.kind, k.phase, k.owner_character, k.cost, k.coef, k.hits, k.pierce, k.effect_text, k.params
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
  insert into public.cards (version_id, id, name, kind, phase, owner_character, cost, coef, hits, pierce, effect_text)
  select v, x.key, x.value->>'name', x.value->>'kind', (x.value->>'phase')::smallint, x.value->>'owner_character', (x.value->>'cost')::smallint,
         (x.value->>'coef')::numeric, (x.value->>'hits')::smallint, (x.value->>'pierce')::numeric, x.value->>'effect_text'
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


-- 숙련도: 계정×캐릭터 점수(사람 상대 랭킹전 판당 +1, 승리 +mastery_win_bonus). 판 ID로 한 번만
create table public.mastery (
  account_id uuid not null references public.accounts(id) on delete cascade,
  character_id text not null check (character_id ~ '^[A-Z]{2,3}$'),
  points integer not null default 0 check (points >= 0),
  games integer not null default 0,
  wins integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (account_id, character_id)
);
create table public.mastery_log (
  match_id uuid not null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  character_id text not null,
  points integer not null,
  reason text,                       -- 0점인 까닭(early·pair·leave)
  at timestamptz not null default now(),
  primary key (match_id, account_id)
);
alter table public.mastery enable row level security;
alter table public.mastery_log enable row level security;
revoke all on public.mastery, public.mastery_log from anon, authenticated;

-- p_rows: [{acc, char, result: win|loss|draw|leave}], p_early: 3턴 안 항복·이탈·AFK, p_cfg: {win_bonus, pair_days, pair_games, pair_early}
-- 제외(0점): 이른 항복·이탈 판, 몰아주기 탐지 조건(같은 두 계정 pair_days일 랭킹전 pair_games판 이상 중 이른 종료 pair_early판 이상)에 걸린 두 계정의 판, 이탈·AFK한 쪽
create or replace function public.mastery_add(p_match uuid, p_rows jsonb, p_early boolean, p_cfg jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; pts integer; why text; pair boolean := false; a uuid; b uuid; out jsonb := '[]';
begin
  if jsonb_array_length(p_rows) = 2 then
    a := least((p_rows->0->>'acc')::uuid, (p_rows->1->>'acc')::uuid); b := greatest((p_rows->0->>'acc')::uuid, (p_rows->1->>'acc')::uuid);
    select count(*) >= coalesce((p_cfg->>'pair_games')::integer, 3)
           and count(*) filter (where m.finish_reason in ('surrender', 'leave', 'afk') and m.turns <= 3) >= coalesce((p_cfg->>'pair_early')::integer, 2)
      into pair
      from public.match_results m
     where m.mode = 'ranked' and least(m.player_a, m.player_b) = a and greatest(m.player_a, m.player_b) = b
       and m.ended_at > now() - make_interval(days => coalesce((p_cfg->>'pair_days')::integer, 7));
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    why := case when p_early then 'early' when pair then 'pair' when r->>'result' = 'leave' then 'leave' end;
    pts := case when why is null then 1 + case when r->>'result' = 'win' then coalesce((p_cfg->>'win_bonus')::integer, 1) else 0 end else 0 end;
    insert into public.mastery_log (match_id, account_id, character_id, points, reason)
    values (p_match, (r->>'acc')::uuid, r->>'char', pts, why) on conflict do nothing;
    if found and why is null then
      insert into public.mastery as m (account_id, character_id, points, games, wins)
      values ((r->>'acc')::uuid, r->>'char', pts, 1, case when r->>'result' = 'win' then 1 else 0 end)
      on conflict (account_id, character_id) do update set points = m.points + excluded.points, games = m.games + 1,
        wins = m.wins + excluded.wins, updated_at = now();
    end if;
    out := out || jsonb_build_object('acc', r->>'acc', 'char', r->>'char', 'points', pts, 'reason', why);
  end loop;
  return out;
end; $$;

-- 계정 삭제(익명화)되면 숙련도도 0으로(상세 09 진행도 제거)
create or replace function private.mastery_on_delete() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.mastery set points = 0, games = 0, wins = 0, updated_at = now() where account_id = new.id;
  return new;
end; $$;
create trigger accounts_mastery_purge after update of status on public.accounts
for each row when (new.status = 'deleted' and old.status is distinct from 'deleted') execute function private.mastery_on_delete();

-- 여러 계정의 숙련도 {계정: {캐릭터: {points, games, wins}}}
create or replace function public.mastery_get(p_accounts uuid[]) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(acc, chars), '{}') from (
    select m.account_id acc, jsonb_object_agg(m.character_id, jsonb_build_object('points', m.points, 'games', m.games, 'wins', m.wins)) chars
      from public.mastery m where m.account_id = any(p_accounts) group by m.account_id) x;
$$;

-- 슬롯 이름 변경: 등급 테두리 RARITY_* → 숙련도 테두리 MASTERY_1~4(같은 순서). 이미 올린 파일이 있으면 키만 바꿔 이어 씀
update public.asset_files f set key = 'slot:MASTERY_' || n.no
  from (values ('COMMON', 1), ('RARE', 2), ('EPIC', 3), ('LEGEND', 4)) n(old, no)
 where f.key = 'slot:RARITY_' || n.old and not exists (select 1 from public.asset_files x where x.key = 'slot:MASTERY_' || n.no);

revoke execute on function public.mastery_add(uuid, jsonb, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.mastery_add(uuid, jsonb, boolean, jsonb) to service_role;
revoke execute on function public.mastery_get(uuid[]) from public, anon, authenticated;
grant execute on function public.mastery_get(uuid[]) to service_role;
commit;
