-- 성좌 결투 · 4단계: 랭크·시즌·이탈 누적
-- 근거: 총괄 8장(AI 랭킹전), 9장(RP·하한선·시즌 리셋·레전드), 10장(이탈 단계), 시트 `랭크_승점`·`이탈패널티`·`설정값`
-- RP 계산은 서버(Worker)의 rank.mjs 한 곳에서 하고, DB는 판 단위로 한 번만 반영(판 ID + 계정이 키)한다.

begin;

-- 시트 단위 표(랭크 단계표, 이탈 패널티 단계)를 데이터 버전에 포함
create table public.data_tables (
  version_id bigint not null references public.data_versions (id) on delete cascade,
  name text not null check (name ~ '^[a-z][a-z0-9_]{1,31}$'),
  body jsonb not null,
  primary key (version_id, name)
);
create trigger data_tables_lock before insert or update or delete on public.data_tables
for each row execute function private.lock_published_rows();

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
    insert into public.data_tables select v, x.name, x.body
      from public.data_tables x where x.version_id = p_based_on;
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
                      from public.deck_presets d where d.version_id = p_version group by d.character_id) x), '{}'),
    'tables',     coalesce((select jsonb_object_agg(x.name, x.body) from public.data_tables x where x.version_id = p_version), '{}')
  );
  update public.data_versions
     set status = 'published', snapshot = snap, published_at = now(),
         snapshot_sha256 = encode(sha256(convert_to(snap::text, 'UTF8')), 'hex')
   where id = p_version;
  insert into public.data_live (singleton, version_id) values (true, p_version)
  on conflict (singleton) do update set version_id = excluded.version_id, switched_at = now();
  return p_version;
end; $$;

-- 시즌 (4주, 총괄 9장). 진행 중인 판은 시작 시각 기준 시즌에 반영한다.
create table public.seasons (
  id integer primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);

-- 숨은 MMR은 시즌과 무관하게 계정에 하나(사람 랭킹전만 반영, AI 판 미반영)
create table public.mmr (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  mmr integer not null default 800,
  games integer not null default 0,
  updated_at timestamptz not null default now()
);

-- 시즌별 랭크 상태. state는 rank.mjs가 계산한 전체 값(rp·연승·최고 단계·하한선·보호 판수·AI 일일 판수 등)
create table public.ratings (
  account_id uuid not null references public.accounts (id) on delete cascade,
  season_id integer not null references public.seasons (id),
  rp integer not null default 0,
  tier_no smallint not null default 1,
  state jsonb not null default '{}',
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (account_id, season_id)
);
create index ratings_board_idx on public.ratings (season_id, rp desc);

-- 판 단위 랭크 반영 기록(감사·중복 방지·이탈 누적 계산)
create table public.rank_events (
  match_id uuid not null,
  account_id uuid not null references public.accounts (id) on delete cascade,
  season_id integer not null,
  kind text not null check (kind in ('win', 'loss', 'draw', 'leave', 'dodge', 'void')),
  mode text not null check (mode in ('ranked', 'ranked_ai')),
  rp_delta integer not null,
  mmr_delta integer not null default 0,
  rp_after integer not null,
  tier_after smallint not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (match_id, account_id)
);
create index rank_events_account_idx on public.rank_events (account_id, created_at desc);

-- 현재 시즌(없으면 4주짜리를 만든다)
create or replace function public.season_current(p_length_days integer default 28)
returns public.seasons language plpgsql security definer set search_path = '' as $$
declare s public.seasons;
begin
  select * into s from public.seasons where now() >= starts_at and now() < ends_at order by id desc limit 1;
  if found then return s; end if;
  insert into public.seasons (id, starts_at, ends_at)
  select coalesce(max(id), 0) + 1, greatest(now(), coalesce(max(ends_at), now())), greatest(now(), coalesce(max(ends_at), now())) + make_interval(days => p_length_days)
    from public.seasons
  on conflict (id) do nothing;
  select * into s from public.seasons where now() >= starts_at and now() < ends_at order by id desc limit 1;
  return s;
end; $$;

-- 랭크 상태 읽기: 이번 시즌 행(없으면 null) + 지난 시즌 마지막 행 + MMR + 최근 7일 이탈·완료 기록
create or replace function public.rank_state(p_account uuid, p_season integer, p_window_days integer default 7)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'current', (select to_jsonb(r) from public.ratings r where r.account_id = p_account and r.season_id = p_season),
    'previous', (select to_jsonb(r) from public.ratings r where r.account_id = p_account and r.season_id < p_season order by r.season_id desc limit 1),
    'mmr', coalesce((select m.mmr from public.mmr m where m.account_id = p_account), 800),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.created_at, 'mode', e.mode) order by e.created_at)
                 from public.rank_events e where e.account_id = p_account and e.created_at > now() - make_interval(days => p_window_days)), '[]')
  );
$$;

-- 반영: 판 ID + 계정이 이미 있으면 아무것도 안 함(재시도 안전). 버전이 다르면 conflict → 서버가 다시 계산
create or replace function public.rank_commit(
  p_match uuid, p_account uuid, p_season integer, p_expected_version integer,
  p_rp integer, p_tier smallint, p_state jsonb, p_mmr_delta integer, p_event jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  insert into public.rank_events (match_id, account_id, season_id, kind, mode, rp_delta, mmr_delta, rp_after, tier_after, detail)
  values (p_match, p_account, p_season, p_event->>'kind', p_event->>'mode', (p_event->>'rp_delta')::integer, p_mmr_delta, p_rp, p_tier, coalesce(p_event->'detail', '{}'))
  on conflict (match_id, account_id) do nothing;
  if not found then return 'duplicate'; end if;

  select r.version into v from public.ratings r where r.account_id = p_account and r.season_id = p_season for update;
  if v is null then
    if p_expected_version <> 0 then raise exception 'rank_conflict' using errcode = 'P0001'; end if;
    insert into public.ratings (account_id, season_id, rp, tier_no, state, version) values (p_account, p_season, p_rp, p_tier, p_state, 1);
  else
    if v <> p_expected_version then raise exception 'rank_conflict' using errcode = 'P0001'; end if;
    update public.ratings set rp = p_rp, tier_no = p_tier, state = p_state, version = v + 1, updated_at = now()
     where account_id = p_account and season_id = p_season;
  end if;
  if p_mmr_delta <> 0 then
    insert into public.mmr (account_id, mmr, games) values (p_account, 800 + p_mmr_delta, 1)
    on conflict (account_id) do update set mmr = public.mmr.mmr + p_mmr_delta, games = public.mmr.games + 1, updated_at = now();
  end if;
  return 'ok';
end; $$;

-- 순위표: 시즌 RP 순(레전드 표시는 서버가 마스터 중 상위 N%·상한으로 계산)
create or replace function public.rank_board(p_season integer, p_limit integer default 100)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'masters', (select count(*) from public.ratings where season_id = p_season and tier_no >= 16),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('account', r.account_id, 'name', a.display_name, 'rp', r.rp, 'tier', r.tier_no) order by r.rp desc)
      from (select * from public.ratings where season_id = p_season order by rp desc limit least(p_limit, 200)) r
      join public.accounts a on a.id = r.account_id), '[]'));
$$;

do $$
declare t text;
begin
  foreach t in array array['data_tables', 'seasons', 'mmr', 'ratings', 'rank_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.season_current(integer)', 'public.rank_state(uuid,integer,integer)',
    'public.rank_commit(uuid,uuid,integer,integer,integer,smallint,jsonb,integer,jsonb)', 'public.rank_board(integer,integer)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;
