-- 성좌 결투 · 이식 1단계: 계정·인증 + 게임 데이터 버전 (초안 v0.1)
-- 근거: 상세 09(계정·플랫폼), 상세 14(백오피스: 배포·롤백·버전), 총괄 14장(서버비 절감),
--       시트 설정값·캐릭터·전투카드·스펠, docs/전작_이식_목록.md 1·2·5장
-- 전제(개발 제안): 클라이언트는 Supabase에 직접 붙지 않는다. Worker만 service_role로 접근한다.
--   → 인증은 Worker가 자체 발급한 토큰으로 처리(Supabase Auth 미사용). 전작 검토 B5(요청마다 Supabase 토큰 조회) 해소.

begin;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

-- =========================================================
-- 1. 계정 (상세 09)
-- =========================================================

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default 'Player' check (char_length(display_name) between 1 and 24),
  status text not null default 'active'
    check (status in ('active', 'deletion_pending', 'deleted', 'banned')),
  deletion_requested_at timestamptz,            -- 14일 유예 시작. 기간 중 로그인하면 null로 되돌림
  current_room text,                            -- 진행 중인 판(다른 기기 "이어서 할까요?" 판단용)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  check ((status = 'deletion_pending') = (deletion_requested_at is not null))
);

-- 계정 1 : 로그인 수단 N. 1단계는 steam만 쓰지만 구조는 처음부터 N
create table public.identities (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  provider text not null check (provider in ('steam', 'google', 'apple', 'guest')),
  provider_uid text not null check (char_length(provider_uid) between 1 and 255),  -- SteamID64 등
  linked_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (provider, provider_uid),   -- 같은 수단은 한 계정에만 (이미 연결된 수단이면 계정 선택 흐름)
  unique (account_id, provider)      -- 한 계정에 수단 종류별 1개
);
create index identities_account_idx on public.identities (account_id);

-- 동시 접속 1기기: 활성 세션은 계정당 1개 (새 로그인이 기존 세션을 revoke)
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  identity_id bigint references public.identities (id) on delete set null,
  platform text not null check (platform in ('steam', 'android', 'ios')),
  device_id text check (char_length(device_id) <= 128),
  refresh_token_hash text not null unique check (refresh_token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason in ('new_login', 'logout', 'expired', 'sanction', 'deleted'))
);
create unique index sessions_one_active_per_account
  on public.sessions (account_id) where revoked_at is null;

create trigger accounts_set_updated_at before update on public.accounts
for each row execute function private.set_updated_at();

-- =========================================================
-- 2. 게임 데이터 버전 (상세 14 배포·롤백, 상세 12 배포 번호)
--  - 버전마다 전체 행을 가진다(데이터가 작음: 캐릭터 9, 카드 34, 스펠 8, 설정 ~30).
--  - draft 버전에서만 수정 가능. 배포 시 snapshot(jsonb) 1행을 만들어 서버는 그 1행만 읽고 캐시.
--  - 롤백 = 이전 버전 행을 복사한 새 버전 발행(덮어쓰지 않음).
--  - 검수·승인 흐름과 권한은 6단계(백오피스 API)에서 이 테이블 위에 붙인다.
-- =========================================================

create table public.data_versions (
  id bigint generated always as identity primary key,
  status text not null default 'draft' check (status in ('draft', 'published', 'discarded')),
  kind text not null default 'deploy' check (kind in ('deploy', 'rollback')),
  based_on bigint references public.data_versions (id),  -- 초안 출발점 / 롤백 대상
  note text not null default '',
  snapshot jsonb,                                         -- 배포 시 생성, 서버가 읽는 유일한 형태
  snapshot_sha256 text,
  scheduled_for timestamptz,                              -- 배포 예약
  created_by uuid,                                        -- admin_users는 6단계
  created_at timestamptz not null default now(),
  published_at timestamptz,
  check ((status = 'published') = (snapshot is not null and published_at is not null))
);

-- 라이브 버전 포인터(1행)
create table public.data_live (
  singleton boolean primary key default true check (singleton),
  version_id bigint not null references public.data_versions (id),
  switched_at timestamptz not null default now()
);

create table public.characters (
  version_id bigint not null references public.data_versions (id) on delete cascade,
  id text not null check (id ~ '^[A-Z]{2,3}$'),           -- 상세 14: 영문 대문자 2~3자, 변경 불가
  name text not null check (char_length(name) between 2 and 8),
  job text not null,
  role text not null,
  faction text not null,
  rarity text not null,
  offer text not null check (offer in ('included', 'addon')),  -- 제공 방식: 본편 포함 / 유료 추가 (기획답변 3, 상세 14). 해금·조각 없음
  price_note text,                                        -- 유료 추가 가격 미정
  release_at date,
  hp integer not null, atk integer not null, def integer not null,
  spd integer not null, crit integer not null,            -- 허용 범위·예산은 설정값 기준으로 앱에서 검증(설정 변경 가능하므로 CHECK 미사용)
  passive_name text not null, passive_text text not null,
  active_name text not null, active_text text not null,
  passive_params jsonb not null default '{}',
  active_params jsonb not null default '{}',
  keywords text[] not null default '{}',                  -- 상세 02 키워드 사전 ID. 1개 이상은 검수 요청 시 앱 검증(상세 14)
  art_full text,                                          -- 에셋 해시 파일명(R2), 6단계 assets 연결
  art_face text,
  enabled boolean not null default true,
  primary key (version_id, id),
  unique (version_id, name)
);

create table public.cards (
  version_id bigint not null references public.data_versions (id) on delete cascade,
  id text not null check (id ~ '^(C[0-9]{2}|[A-Z]{2,3}[0-9]{2})$'),  -- 공용 C01~C16, 전용 = 캐릭터ID+2자리 (기획답변 2)
  name text not null,
  kind text not null check (kind in ('immune','defense','counter','silence','disrupt','skill','attack')),  -- 기획답변 5
  phase smallint not null check (phase between 0 and 5),  -- 0 스펠·1 보호·2 방해·3 스킬·4 공격·5 턴 종료 (총괄 6장, 기획답변 4)
  owner_character text,                                   -- null = 공용, 값 = 전용 카드 주인
  cost smallint not null check (cost between 0 and 3),
  coef numeric(6,3),
  hits smallint not null default 1 check (hits >= 1),
  pierce numeric(4,3) not null default 0 check (pierce between 0 and 1),
  effect_text text not null,
  params jsonb not null default '{}',                     -- 키워드별 추가 수치
  check (phase = case kind when 'immune' then 1 when 'defense' then 1 when 'counter' then 1
                          when 'silence' then 2 when 'disrupt' then 2 when 'skill' then 3 else 4 end),
  check ((owner_character is null) = (id ~ '^C[0-9]{2}$')),
  check (owner_character is null or id = owner_character || substring(id from '[0-9]{2}$')),
  primary key (version_id, id),
  foreign key (version_id, owner_character) references public.characters (version_id, id) on delete cascade
);

create table public.spells (
  version_id bigint not null references public.data_versions (id) on delete cascade,
  id text not null check (id ~ '^SP[0-9]{2}$'),           -- SP01 수호 … SP08 탈진, 신규는 다음 번호 (기획답변 2)
  name text not null,
  effect_text text not null,
  value numeric(6,3),
  cooldown smallint not null check (cooldown >= 1),
  params jsonb not null default '{}',
  primary key (version_id, id)
);

-- 설정값 시트 1행 = 1키. 값은 숫자/불리언/목록이 섞여 jsonb
create table public.settings (
  version_id bigint not null references public.data_versions (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,63}$'),  -- 시트 `설정값` 5번째 열 snake_case (기획답변 6)
  value jsonb not null,
  unit text,
  description text not null default '',
  primary key (version_id, key)
);

-- 배포된 버전의 행은 수정·삭제 불가
create or replace function private.lock_published_rows()
returns trigger language plpgsql set search_path = '' as $$
declare v bigint := coalesce(old.version_id, new.version_id);
begin
  if (select status from public.data_versions where id = v) <> 'draft' then
    raise exception 'data_version % is frozen', v using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.version_id <> old.version_id then
    raise exception 'version_id is immutable' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

create trigger characters_lock before insert or update or delete on public.characters
for each row execute function private.lock_published_rows();
create trigger cards_lock before insert or update or delete on public.cards
for each row execute function private.lock_published_rows();
create trigger spells_lock before insert or update or delete on public.spells
for each row execute function private.lock_published_rows();
create trigger settings_lock before insert or update or delete on public.settings
for each row execute function private.lock_published_rows();

-- 새 초안: 기준 버전 행을 통째로 복사
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
  end if;
  return v;
end; $$;

-- 배포: 스냅샷 생성 → 동결 → 라이브 전환. 진행 중인 판은 시작 시 받은 스냅샷으로 끝까지 진행(서버 DO 책임)
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
    'settings',   coalesce((select jsonb_object_agg(t.key, t.value) from public.settings t where t.version_id = p_version), '{}')
  );

  update public.data_versions
     set status = 'published', snapshot = snap, published_at = now(),
         snapshot_sha256 = encode(sha256(convert_to(snap::text, 'UTF8')), 'hex')
   where id = p_version;

  insert into public.data_live (singleton, version_id) values (true, p_version)
  on conflict (singleton) do update set version_id = excluded.version_id, switched_at = now();
  return p_version;
end; $$;

-- 롤백: 대상 버전을 복사한 새 버전을 발행(덮어쓰지 않음)
create or replace function public.data_rollback(p_target bigint, p_note text, p_by uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if (select status from public.data_versions where id = p_target) <> 'published' then
    raise exception 'rollback target % is not published', p_target using errcode = 'P0001';
  end if;
  v := public.data_create_draft(p_target, p_note, p_by);
  update public.data_versions set kind = 'rollback' where id = v;
  return public.data_publish(v);
end; $$;

-- =========================================================
-- 3. 접근 권한: 클라이언트 직접 접근 없음, Worker(service_role)만
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array['accounts','identities','sessions','data_versions','data_live','characters','cards','spells','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

revoke execute on function public.data_create_draft(bigint, text, uuid) from public, anon, authenticated;
revoke execute on function public.data_publish(bigint) from public, anon, authenticated;
revoke execute on function public.data_rollback(bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.data_create_draft(bigint, text, uuid) to service_role;
grant execute on function public.data_publish(bigint) to service_role;
grant execute on function public.data_rollback(bigint, text, uuid) to service_role;
revoke execute on function private.lock_published_rows() from public;
revoke execute on function private.set_updated_at() from public;

commit;
