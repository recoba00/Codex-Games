-- 성좌 결투 · 이식 2·3단계: 추천덱(데이터 버전에 포함), 판 결과
-- 근거: 총괄 6장(덱 12장, 프리셋 3개), 상세 15(추천덱), 시트 `추천덱`, 총괄 8·9·10장, 상세 12(판 종료 때 한 번에 저장)

begin;

-- 추천덱: 캐릭터당 3개(공세·균형·수비), 공용 10장. 전용 2장은 서버가 자동으로 넣는다.
create table public.deck_presets (
  version_id bigint not null references public.data_versions (id) on delete cascade,
  character_id text not null,
  slot smallint not null check (slot between 1 and 3),
  style text not null check (style in ('aggro', 'balance', 'defense')),
  cards text[] not null check (cardinality(cards) = 10),
  primary key (version_id, character_id, slot),
  foreign key (version_id, character_id) references public.characters (version_id, id) on delete cascade
);

create trigger deck_presets_lock before insert or update or delete on public.deck_presets
for each row execute function private.lock_published_rows();

-- 초안 복사·배포 스냅샷에 추천덱 포함 (기존 함수 교체)
create or replace function public.data_create_draft(p_based_on bigint, p_note text, p_by uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  insert into public.data_versions (based_on, note, created_by) values (p_based_on, p_note, p_by) returning id into v;
  if p_based_on is not null then
    insert into public.characters select v, c.id, c.name, c.job, c.role, c.faction, c.rarity, c.offer, c.price_note, c.release_at,
      c.hp, c.atk, c.def, c.spd, c.crit, c.passive_name, c.passive_text, c.active_name, c.active_text,
      c.passive_params, c.active_params, c.keywords, c.art_full, c.art_face, c.enabled
      from public.characters c where c.version_id = p_based_on;
    insert into public.cards select v, k.id, k.name, k.kind, k.phase, k.owner_character, k.cost, k.coef, k.hits, k.pierce, k.effect_text, k.params
      from public.cards k where k.version_id = p_based_on;
    insert into public.spells select v, s.id, s.name, s.effect_text, s.value, s.cooldown, s.params
      from public.spells s where s.version_id = p_based_on;
    insert into public.settings select v, t.key, t.value, t.unit, t.description
      from public.settings t where t.version_id = p_based_on;
    insert into public.deck_presets select v, d.character_id, d.slot, d.style, d.cards
      from public.deck_presets d where d.version_id = p_based_on;
  end if;
  return v;
end; $$;

create or replace function public.data_publish(p_version bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare snap jsonb;
begin
  perform 1 from public.data_versions where id = p_version and status = 'draft' for update;
  if not found then raise exception 'version % is not a draft', p_version using errcode = 'P0001'; end if;

  snap := jsonb_build_object(
    'version', p_version,
    'characters', coalesce((select jsonb_object_agg(c.id, to_jsonb(c) - 'version_id' - 'id') from public.characters c where c.version_id = p_version and c.enabled), '{}'),
    'cards',      coalesce((select jsonb_object_agg(k.id, to_jsonb(k) - 'version_id' - 'id') from public.cards k where k.version_id = p_version), '{}'),
    'spells',     coalesce((select jsonb_object_agg(s.id, to_jsonb(s) - 'version_id' - 'id') from public.spells s where s.version_id = p_version), '{}'),
    'settings',   coalesce((select jsonb_object_agg(t.key, t.value) from public.settings t where t.version_id = p_version), '{}'),
    'presets',    coalesce((select jsonb_object_agg(x.character_id, x.list) from (
                    select d.character_id, jsonb_agg(jsonb_build_object('slot', d.slot, 'style', d.style, 'cards', to_jsonb(d.cards)) order by d.slot) list
                      from public.deck_presets d where d.version_id = p_version group by d.character_id) x), '{}')
  );

  update public.data_versions
     set status = 'published', snapshot = snap, published_at = now(),
         snapshot_sha256 = encode(sha256(convert_to(snap::text, 'UTF8')), 'hex')
   where id = p_version;

  insert into public.data_live (singleton, version_id) values (true, p_version)
  on conflict (singleton) do update set version_id = excluded.version_id, switched_at = now();
  return p_version;
end; $$;

-- 판 결과: 판 ID(UUID)가 키라 재시도해도 중복 저장되지 않는다(전작 검토 B1·B2)
create table public.match_results (
  id uuid primary key,
  mode text not null check (mode in ('friend', 'practice', 'ranked', 'ranked_ai')),
  room_code text,
  data_version bigint not null references public.data_versions (id),
  player_a uuid references public.accounts (id) on delete set null,
  player_b uuid references public.accounts (id) on delete set null,   -- AI 상대면 null
  outcome text not null check (outcome in ('a', 'b', 'draw', 'void')),
  finish_reason text not null check (finish_reason in ('hp', 'turn_limit', 'surrender', 'leave', 'afk', 'void')),
  turns smallint not null check (turns between 0 and 20),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  summary jsonb not null default '{}',   -- 밴·픽·스펠·덱·HP·누적 피해(상세 12 판 요약)
  created_at timestamptz not null default now(),
  check (ended_at >= started_at)
);
create index match_results_a_idx on public.match_results (player_a, ended_at desc);
create index match_results_b_idx on public.match_results (player_b, ended_at desc);

do $$
declare t text;
begin
  foreach t in array array['deck_presets', 'match_results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

commit;
