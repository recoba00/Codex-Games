-- 6단계: 백오피스(상세 14) + 신고·제재(상세 13) + 로비 배너·공지(상세 05)
-- 원칙: 게임 데이터는 "초안 → 자동 검증 → 검수 → 배포 예약 → 라이브" 한 길로만. 모든 조치는 감사 로그(수정·삭제 불가).
--       권한(역할) 판단은 Worker가 하고, DB는 자기 승인 금지·상태 전이·원자성을 지킨다.
begin;

-- ---------- 직원 계정·초대·세션 ----------
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  login text not null unique check (login ~ '^[a-z0-9_.-]{3,32}$'),
  name text not null check (char_length(name) between 1 and 24),
  role text not null check (role in ('planner', 'reviewer', 'admin', 'ops')),
  pw_hash text not null, pw_salt text not null, pw_iter integer not null,
  active boolean not null default true,
  failed_logins integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table public.staff_invites (
  code_hash text primary key,
  role text not null check (role in ('planner', 'reviewer', 'admin', 'ops')),
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.staff(id)
);

create table public.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

-- ---------- 감사 로그: 추가만 가능(상세 14 "삭제·수정 불가, 1년 이상 보관") ----------
create table public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  staff_id uuid references public.staff(id),
  staff_login text,
  staff_role text,
  target text not null,
  action text not null,
  detail jsonb not null default '{}',
  reason text not null default ''
);
create index audit_log_at on public.audit_log (at desc);

create or replace function private.audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_log_immutable' using errcode = 'P0001'; end; $$;
create trigger audit_log_no_update before update or delete on public.audit_log for each row execute function private.audit_immutable();

-- ---------- 데이터 검수 흐름 ----------
create table public.data_reviews (
  version_id bigint primary key references public.data_versions(id) on delete cascade,
  state text not null default 'editing' check (state in ('editing', 'review', 'approved', 'scheduled', 'rejected', 'published', 'discarded')),
  editors uuid[] not null default '{}',     -- 초안을 만든·고친 직원(자기 승인 금지 판단)
  validation jsonb not null default '{}',   -- 가져오기 결과 { errors, blocks, warnings, summary }
  requested_by uuid references public.staff(id), requested_at timestamptz,
  reviewed_by uuid references public.staff(id), reviewed_at timestamptz,
  reject_reason text,
  scheduled_for timestamptz, scheduled_by uuid references public.staff(id),
  published_by uuid references public.staff(id),
  updated_at timestamptz not null default now()
);

-- ---------- 제재·신고 (상세 13) ----------
alter table public.accounts add column if not exists banned_until timestamptz;
alter table public.ratings add column if not exists excluded boolean not null default false;

create table public.sanctions (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind text not null check (kind in ('warn', 'rank_restrict', 'season_wipe', 'suspend', 'rename')),
  until timestamptz,                       -- null = 영구(정지) / 기간 없음(경고)
  reason text not null check (char_length(reason) >= 2),
  detail jsonb not null default '{}',
  staff_id uuid references public.staff(id),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,             -- 경고 팝업 확인
  revoked_at timestamptz, revoked_by uuid references public.staff(id), revoke_reason text
);
create index sanctions_account on public.sanctions (account_id, created_at desc);

create table public.reports (
  id bigserial primary key,
  reporter uuid not null references public.accounts(id) on delete cascade,
  target uuid not null references public.accounts(id) on delete cascade,
  reason text not null check (reason in ('afk', 'boosting', 'cheat', 'name', 'emote_spam')),
  match_id uuid,
  note text not null default '' check (char_length(note) <= 200),
  status text not null default 'open' check (status in ('open', 'done')),
  handled_by uuid references public.staff(id), handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_open on public.reports (status, created_at desc);
create index reports_pair on public.reports (reporter, target, created_at desc);

-- ---------- 로비 배너·공지, 우편 발송 작업 ----------
create table public.lobby_banners (
  id bigserial primary key,
  title text not null,
  image_url text,
  link text not null default '',          -- 예: shop:OFFER_ID, event:ID
  slot smallint not null default 1 check (slot between 1 and 5),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  enabled boolean not null default true
);

create table public.notices (
  id bigserial primary key,
  title text not null,
  body text not null default '',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  enabled boolean not null default true
);

create table public.mail_jobs (
  id bigserial primary key,
  target jsonb not null,                  -- {"type":"all"} | {"type":"accounts","ids":[...]} | {"type":"tier","min":13}
  title text not null, body text not null default '', rewards jsonb not null default '[]',
  days integer not null default 30,
  send_at timestamptz not null default now(),
  sent_at timestamptz, sent_count integer,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

-- =========================================================
-- 함수: 직원
-- =========================================================
create or replace function public.staff_count() returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.staff;
$$;

create or replace function public.staff_by_login(p_login text) returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(s) from public.staff s where s.login = lower(p_login);
$$;

-- 로그인 결과 기록: 5번 연속 실패면 15분 잠금
create or replace function public.staff_login_result(p_staff uuid, p_ok boolean, p_ttl_seconds integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if p_ok then
    update public.staff set failed_logins = 0, locked_until = null, last_login_at = now() where id = p_staff;
    insert into public.staff_sessions (staff_id, expires_at) values (p_staff, now() + make_interval(secs => p_ttl_seconds)) returning id into sid;
    return sid;
  end if;
  update public.staff set failed_logins = failed_logins + 1,
         locked_until = case when failed_logins + 1 >= 5 then now() + interval '15 minutes' else locked_until end
   where id = p_staff;
  return null;
end; $$;

create or replace function public.staff_session(p_session uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'login', s.login, 'name', s.name, 'role', s.role)
    from public.staff_sessions ss join public.staff s on s.id = ss.staff_id
   where ss.id = p_session and ss.revoked_at is null and ss.expires_at > now() and s.active;
$$;

create or replace function public.staff_logout(p_session uuid) returns void language sql security definer set search_path = '' as $$
  update public.staff_sessions set revoked_at = now() where id = p_session and revoked_at is null;
$$;

create or replace function public.staff_invite_create(p_code_hash text, p_role text, p_by uuid, p_days integer) returns void
language sql security definer set search_path = '' as $$
  insert into public.staff_invites (code_hash, role, created_by, expires_at) values (p_code_hash, p_role, p_by, now() + make_interval(days => p_days));
$$;

-- 초대 코드로 가입(한 번만). 직원이 0명일 때의 첫 초대는 운영자가 SQL로 만든다
create or replace function public.staff_register(p_code_hash text, p_login text, p_name text, p_hash text, p_salt text, p_iter integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare inv public.staff_invites; sid uuid;
begin
  select * into inv from public.staff_invites where code_hash = p_code_hash for update;
  if not found or inv.used_at is not null or inv.expires_at < now() then raise exception 'invite_invalid' using errcode = 'P0001'; end if;
  if exists (select 1 from public.staff where login = lower(p_login)) then raise exception 'login_taken' using errcode = 'P0001'; end if;
  insert into public.staff (login, name, role, pw_hash, pw_salt, pw_iter) values (lower(p_login), p_name, inv.role, p_hash, p_salt, p_iter) returning id into sid;
  update public.staff_invites set used_at = now(), used_by = sid where code_hash = p_code_hash;
  insert into public.audit_log (staff_id, staff_login, staff_role, target, action, detail)
  values (sid, lower(p_login), inv.role, '직원 ' || lower(p_login), '가입', jsonb_build_object('invited_by', inv.created_by));
  return jsonb_build_object('id', sid, 'role', inv.role);
end; $$;

create or replace function public.staff_list() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'login', login, 'name', name, 'role', role, 'active', active, 'lastLoginAt', last_login_at, 'createdAt', created_at) order by created_at), '[]') from public.staff;
$$;

create or replace function public.staff_update(p_staff uuid, p_role text, p_active boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.staff set role = coalesce(p_role, role), active = coalesce(p_active, active) where id = p_staff;
  if p_active = false then update public.staff_sessions set revoked_at = now() where staff_id = p_staff and revoked_at is null; end if;
  if (select count(*) from public.staff where role = 'admin' and active) = 0 then raise exception 'last_admin' using errcode = 'P0001'; end if;
end; $$;

create or replace function public.staff_password(p_staff uuid, p_hash text, p_salt text, p_iter integer) returns void language sql security definer set search_path = '' as $$
  update public.staff set pw_hash = p_hash, pw_salt = p_salt, pw_iter = p_iter, failed_logins = 0, locked_until = null where id = p_staff;
$$;

create or replace function public.audit_add(p_staff uuid, p_target text, p_action text, p_detail jsonb, p_reason text) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (staff_id, staff_login, staff_role, target, action, detail, reason)
  select p_staff, s.login, s.role, p_target, p_action, coalesce(p_detail, '{}'), coalesce(p_reason, '') from public.staff s where s.id = p_staff;
$$;

create or replace function public.audit_list(p_limit integer, p_before bigint, p_q text) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.id desc), '[]') from (
    select * from public.audit_log
     where (p_before is null or id < p_before)
       and (p_q is null or p_q = '' or target ilike '%' || p_q || '%' or action ilike '%' || p_q || '%' or staff_login ilike '%' || p_q || '%')
     order by id desc limit least(coalesce(p_limit, 100), 500)) a;
$$;

-- =========================================================
-- 함수: 게임 데이터 버전·검수·배포
-- =========================================================
create or replace function private.version_data(p_version bigint) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'characters', coalesce((select jsonb_object_agg(c.id, to_jsonb(c) - 'version_id' - 'id') from public.characters c where c.version_id = p_version and c.enabled), '{}'),
    'cards',      coalesce((select jsonb_object_agg(k.id, to_jsonb(k) - 'version_id' - 'id') from public.cards k where k.version_id = p_version), '{}'),
    'spells',     coalesce((select jsonb_object_agg(s.id, to_jsonb(s) - 'version_id' - 'id') from public.spells s where s.version_id = p_version), '{}'),
    'settings',   coalesce((select jsonb_object_agg(t.key, t.value) from public.settings t where t.version_id = p_version), '{}'),
    'presets',    coalesce((select jsonb_object_agg(x.character_id, x.list) from (
                    select d.character_id, jsonb_agg(jsonb_build_object('slot', d.slot, 'style', d.style, 'cards', to_jsonb(d.cards)) order by d.slot) list
                      from public.deck_presets d where d.version_id = p_version group by d.character_id) x), '{}'),
    'tables',     coalesce((select jsonb_object_agg(x.name, x.body) from public.data_tables x where x.version_id = p_version), '{}'));
$$;

create or replace function public.bo_version_data(p_version bigint) returns jsonb language sql stable security definer set search_path = '' as $$
  select private.version_data(p_version);
$$;

-- xlsx 가져오기 결과로 초안 버전 만들기(시트의 6개 표 전체 = 초안 내용)
create or replace function public.bo_import_draft(p_based_on bigint, p_note text, p_staff uuid, p_payload jsonb, p_validation jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v bigint; d jsonb := p_payload;
begin
  v := public.data_create_draft(null, p_note, p_staff);  -- 빈 초안에 시트의 6개 표를 통째로 넣는다(기준 버전은 기록만)
  update public.data_versions set based_on = p_based_on where id = v;
  insert into public.characters (version_id, id, name, job, role, faction, rarity, offer, hp, atk, def, spd, crit,
                                 passive_name, passive_text, active_name, active_text, passive_params, active_params)
  select v, x.key, x.value->>'name', x.value->>'job', x.value->>'role', x.value->>'faction', x.value->>'rarity', x.value->>'offer',
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
  insert into public.data_reviews (version_id, editors, validation) values (v, array[p_staff], coalesce(p_validation, '{}'));
  return v;
end; $$;

create or replace function public.bo_versions(p_limit integer) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'live', (select version_id from public.data_live),
    'versions', coalesce((select jsonb_agg(x order by x.id desc) from (
      select v.id, v.status, v.kind, v.based_on, v.note, v.created_at, v.published_at, v.created_by,
             r.state, r.validation, r.editors, r.requested_by, r.requested_at, r.reviewed_by, r.reviewed_at, r.reject_reason, r.scheduled_for, r.published_by,
             (select login from public.staff where id = v.created_by) as created_login,
             (select login from public.staff where id = r.reviewed_by) as reviewed_login
        from public.data_versions v left join public.data_reviews r on r.version_id = v.id
       order by v.id desc limit least(coalesce(p_limit, 30), 100)) x), '[]'));
$$;

-- 상태 전이. p_action: request | approve | reject | schedule | unschedule | discard
create or replace function public.bo_review(p_version bigint, p_staff uuid, p_action text, p_reason text, p_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.data_reviews;
begin
  select * into r from public.data_reviews where version_id = p_version for update;
  if not found then raise exception 'version_invalid' using errcode = 'P0001'; end if;
  if p_action = 'request' then
    if r.state not in ('editing', 'rejected') then raise exception 'state_invalid' using errcode = 'P0001'; end if;
    if jsonb_array_length(coalesce(r.validation->'errors', '[]')) > 0 or jsonb_array_length(coalesce(r.validation->'blocks', '[]')) > 0 then
      raise exception 'validation_failed' using errcode = 'P0001';
    end if;
    update public.data_reviews set state = 'review', requested_by = p_staff, requested_at = now(), reject_reason = null,
           editors = case when p_staff = any(editors) then editors else editors || p_staff end, updated_at = now() where version_id = p_version;
  elsif p_action in ('approve', 'reject') then
    if r.state <> 'review' then raise exception 'state_invalid' using errcode = 'P0001'; end if;
    if p_staff = any(r.editors) or p_staff = r.requested_by then raise exception 'self_review' using errcode = 'P0001'; end if;  -- 상세 14: 자기 초안 자기 승인 불가
    if p_action = 'reject' and coalesce(char_length(trim(p_reason)), 0) < 2 then raise exception 'reason_required' using errcode = 'P0001'; end if;
    update public.data_reviews set state = case when p_action = 'approve' then 'approved' else 'rejected' end,
           reviewed_by = p_staff, reviewed_at = now(), reject_reason = case when p_action = 'reject' then p_reason end, updated_at = now()
     where version_id = p_version;
  elsif p_action = 'schedule' then
    if r.state not in ('approved', 'scheduled') then raise exception 'state_invalid' using errcode = 'P0001'; end if;
    if p_at is null or p_at < now() then raise exception 'schedule_invalid' using errcode = 'P0001'; end if;
    update public.data_reviews set state = 'scheduled', scheduled_for = p_at, scheduled_by = p_staff, updated_at = now() where version_id = p_version;
    update public.data_versions set scheduled_for = p_at where id = p_version;
  elsif p_action = 'unschedule' then
    if r.state <> 'scheduled' then raise exception 'state_invalid' using errcode = 'P0001'; end if;
    update public.data_reviews set state = 'approved', scheduled_for = null, updated_at = now() where version_id = p_version;
    update public.data_versions set scheduled_for = null where id = p_version;
  elsif p_action = 'discard' then
    if r.state in ('published', 'discarded') then raise exception 'state_invalid' using errcode = 'P0001'; end if;
    update public.data_reviews set state = 'discarded', updated_at = now() where version_id = p_version;
    update public.data_versions set status = 'discarded' where id = p_version;
  else raise exception 'action_invalid' using errcode = 'P0001';
  end if;
  return (select to_jsonb(x) from public.data_reviews x where x.version_id = p_version);
end; $$;

-- 배포: 승인·예약된 초안만. 진행 중인 판은 시작 시점 데이터로 끝까지(서버가 판마다 버전 고정)
create or replace function public.bo_publish(p_version bigint, p_staff uuid) returns bigint language plpgsql security definer set search_path = '' as $$
declare st text;
begin
  select state into st from public.data_reviews where version_id = p_version for update;
  if st is null or st not in ('approved', 'scheduled') then raise exception 'not_approved' using errcode = 'P0001'; end if;
  perform public.data_publish(p_version);
  update public.data_reviews set state = 'published', published_by = p_staff, updated_at = now() where version_id = p_version;
  return p_version;
end; $$;

create or replace function public.bo_due_publishes() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('version', version_id, 'by', scheduled_by) order by scheduled_for), '[]')
    from public.data_reviews where state = 'scheduled' and scheduled_for <= now();
$$;

-- 롤백: 대상 버전 내용을 새 버전으로 복사해 바로 배포(덮어쓰지 않음, 상세 14)
create or replace function public.bo_rollback(p_target bigint, p_staff uuid, p_note text) returns bigint language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  v := public.data_rollback(p_target, p_note, p_staff);
  insert into public.data_reviews (version_id, state, editors, published_by, validation) values (v, 'published', array[p_staff], p_staff, '{}');
  return v;
end; $$;

-- =========================================================
-- 함수: 유저 조회·재화·제재·신고
-- =========================================================
create or replace function public.bo_user_search(p_q text) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.display_name, 'status', a.status, 'createdAt', a.created_at, 'lastLoginAt', a.last_login_at)), '[]')
    from (select * from public.accounts a
           where a.id::text = p_q or a.display_name ilike '%' || p_q || '%'
              or exists (select 1 from public.identities i where i.account_id = a.id and i.provider_uid = p_q)
           order by a.last_login_at desc nulls last limit 50) a;
$$;

create or replace function public.bo_user_detail(p_account uuid, p_season integer) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'account', (select to_jsonb(a) from public.accounts a where a.id = p_account),
    'identities', coalesce((select jsonb_agg(jsonb_build_object('provider', provider, 'uid', provider_uid, 'linkedAt', linked_at, 'lastUsedAt', last_used_at)) from public.identities where account_id = p_account), '[]'),
    'gold', coalesce((select gold from public.wallets where account_id = p_account), 0),
    'ledger', coalesce((select jsonb_agg(to_jsonb(l) order by l.id desc) from (select * from public.gold_ledger where account_id = p_account order by id desc limit 30) l), '[]'),
    'inventory', coalesce((select jsonb_agg(jsonb_build_object('item', i.item_id, 'name', c.name, 'kind', c.kind, 'source', i.source, 'acquiredAt', i.acquired_at, 'revokedAt', i.revoked_at) order by i.acquired_at desc)
                  from public.inventory i join public.catalog_items c on c.id = i.item_id where i.account_id = p_account), '[]'),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from (select * from public.orders where account_id = p_account order by created_at desc limit 20) o), '[]'),
    'rank', (select to_jsonb(r) from public.ratings r where r.account_id = p_account and r.season_id = p_season),
    'mmr', (select mmr from public.mmr where account_id = p_account),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'mode', m.mode, 'outcome', m.outcome, 'reason', m.finish_reason, 'turns', m.turns, 'endedAt', m.ended_at,
                  'seat', case when m.player_a = p_account then 'a' else 'b' end, 'picks', m.summary->'picks') order by m.ended_at desc)
                  from (select * from public.match_results where player_a = p_account or player_b = p_account order by ended_at desc limit 20) m), '[]'),
    'sanctions', coalesce((select jsonb_agg(to_jsonb(s) order by s.id desc) from public.sanctions s where s.account_id = p_account), '[]'),
    'reports', coalesce((select jsonb_agg(to_jsonb(r) order by r.id desc) from (select * from public.reports where target = p_account order by id desc limit 20) r), '[]'));
$$;

-- 재화 지급·회수(사유 필수, 감사 로그). 회수가 잔액보다 크면 gold_short
create or replace function public.bo_gold_adjust(p_account uuid, p_delta integer, p_staff uuid, p_reason text, p_ref text) returns integer
language plpgsql security definer set search_path = '' as $$
declare g integer;
begin
  if coalesce(char_length(trim(p_reason)), 0) < 2 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  g := private.gold_apply(p_account, p_delta, 'admin', p_ref, jsonb_build_object('staff', p_staff, 'reason', p_reason));
  perform public.audit_add(p_staff, '유저 ' || p_account, case when p_delta >= 0 then '골드 지급' else '골드 회수' end, jsonb_build_object('delta', p_delta, 'balance', g), p_reason);
  return g;
end; $$;

create or replace function public.bo_item_adjust(p_account uuid, p_item text, p_grant boolean, p_staff uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(char_length(trim(p_reason)), 0) < 2 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if p_grant then perform private.item_grant(p_account, p_item, 'admin', 'staff:' || p_staff);
  else update public.inventory set revoked_at = now() where account_id = p_account and item_id = p_item and revoked_at is null;
  end if;
  perform public.audit_add(p_staff, '유저 ' || p_account, case when p_grant then '상품 지급' else '상품 회수' end, jsonb_build_object('item', p_item), p_reason);
end; $$;

-- 제재(상세 13 제재 단계). p_days null = 영구(정지만)
create or replace function public.bo_sanction(p_account uuid, p_kind text, p_days integer, p_staff uuid, p_reason text, p_season integer) returns bigint
language plpgsql security definer set search_path = '' as $$
declare sid bigint; until_at timestamptz := case when p_days is null then null else now() + make_interval(days => p_days) end; nm text;
begin
  if p_kind = 'rank_restrict' and until_at is null then raise exception 'days_required' using errcode = 'P0001'; end if;
  if p_kind = 'rename' then
    nm := 'Player' || lpad((floor(random() * 10000))::integer::text, 4, '0');
    update public.accounts set display_name = nm, name_changes = 0 where id = p_account;  -- 강제 변경 + 무료 변경권(상세 13)
  end if;
  insert into public.sanctions (account_id, kind, until, reason, staff_id, detail)
  values (p_account, p_kind, case when p_kind in ('warn', 'rename', 'season_wipe') then null else until_at end, p_reason, p_staff,
          case when p_kind = 'rename' then jsonb_build_object('new_name', nm) when p_kind = 'season_wipe' then jsonb_build_object('season', p_season,
            'rp_before', (select rp from public.ratings where account_id = p_account and season_id = p_season)) else '{}' end)
  returning id into sid;
  if p_kind = 'suspend' then
    update public.accounts set status = 'banned', banned_until = until_at where id = p_account and status <> 'deleted';
    update public.sessions set revoked_at = now(), revoked_reason = 'sanction' where account_id = p_account and revoked_at is null;
  elsif p_kind = 'season_wipe' then
    update public.ratings set rp = 0, tier_no = 1, excluded = true, version = version + 1, updated_at = now() where account_id = p_account and season_id = p_season;
  end if;
  perform public.audit_add(p_staff, '유저 ' || p_account, '제재 ' || p_kind, jsonb_build_object('sanction', sid, 'days', p_days), p_reason);
  return sid;
end; $$;

create or replace function public.bo_sanction_revoke(p_sanction bigint, p_staff uuid, p_reason text) returns void language plpgsql security definer set search_path = '' as $$
declare s public.sanctions;
begin
  select * into s from public.sanctions where id = p_sanction for update;
  if not found or s.revoked_at is not null then raise exception 'sanction_invalid' using errcode = 'P0001'; end if;
  update public.sanctions set revoked_at = now(), revoked_by = p_staff, revoke_reason = p_reason where id = p_sanction;
  if s.kind = 'suspend' then update public.accounts set status = 'active', banned_until = null where id = s.account_id and status = 'banned'; end if;
  if s.kind = 'season_wipe' then  -- 잘못된 제재: 회수한 RP 복구(상세 13 이의 제기)
    update public.ratings set excluded = false, rp = coalesce((s.detail->>'rp_before')::integer, rp), version = version + 1, updated_at = now()
     where account_id = s.account_id and season_id = (s.detail->>'season')::integer;
  end if;
  perform public.audit_add(p_staff, '유저 ' || s.account_id, '제재 해제 ' || s.kind, jsonb_build_object('sanction', p_sanction), p_reason);
end; $$;

-- 플레이어 쪽: 확인 안 한 경고, 랭킹전 제한, 정지(로그인 차단은 auth_login)
create or replace function public.sanction_status(p_account uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'warnings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'reason', reason, 'at', created_at)) from public.sanctions
                          where account_id = p_account and kind in ('warn', 'rename', 'season_wipe') and acknowledged_at is null and revoked_at is null), '[]'),
    'rankUntil', (select max(until) from public.sanctions where account_id = p_account and kind = 'rank_restrict' and revoked_at is null and until > now()));
$$;

create or replace function public.sanction_ack(p_account uuid) returns void language sql security definer set search_path = '' as $$
  update public.sanctions set acknowledged_at = now() where account_id = p_account and acknowledged_at is null;
$$;

-- 신고(같은 상대 24시간에 1회)
create or replace function public.report_create(p_reporter uuid, p_target uuid, p_reason text, p_match uuid, p_note text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare rid bigint;
begin
  if p_reporter = p_target then raise exception 'report_invalid' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.accounts where id = p_target) then raise exception 'report_invalid' using errcode = 'P0001'; end if;
  if exists (select 1 from public.reports where reporter = p_reporter and target = p_target and created_at > now() - interval '24 hours') then
    raise exception 'report_limited' using errcode = 'P0001';
  end if;
  insert into public.reports (reporter, target, reason, match_id, note) values (p_reporter, p_target, p_reason, p_match, coalesce(p_note, '')) returning id into rid;
  return rid;
end; $$;

create or replace function public.bo_reports(p_status text) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reporter', r.reporter, 'target', r.target, 'targetName', a.display_name, 'reason', r.reason, 'match', r.match_id,
           'note', r.note, 'status', r.status, 'createdAt', r.created_at,
           'targetReports7d', (select count(*) from public.reports x where x.target = r.target and x.created_at > now() - interval '7 days')) order by r.id desc), '[]')
    from (select * from public.reports where p_status is null or status = p_status order by id desc limit 200) r join public.accounts a on a.id = r.target;
$$;

create or replace function public.bo_report_done(p_ids bigint[], p_staff uuid) returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.reports set status = 'done', handled_by = p_staff, handled_at = now() where id = any(p_ids) and status = 'open';
  get diagnostics n = row_count;
  perform public.audit_add(p_staff, '신고 ' || array_to_string(p_ids, ','), '신고 처리', jsonb_build_object('count', n), '');
  return n;
end; $$;

-- =========================================================
-- 함수: 상점·배너·공지·우편 발송·대시보드
-- =========================================================
create or replace function public.bo_catalog() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(c) order by c.kind, c.id) from public.catalog_items c), '[]'),
    'offers', coalesce((select jsonb_agg(to_jsonb(o) || jsonb_build_object('sold', (select count(*) from public.inventory i where i.item_id = o.item_id and i.source in ('gold', 'cash') and i.revoked_at is null),
                  'state', case when not o.enabled then 'off' when o.starts_at > now() then 'scheduled' when o.ends_at is not null and o.ends_at <= now() then 'ended' else 'live' end)
                  order by o.tab, o.slot, o.id) from public.shop_offers o), '[]'));
$$;

create or replace function public.bo_item_upsert(p_item jsonb, p_staff uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.catalog_items (id, kind, character_id, name, grade, default_owned, bundle_items, enabled)
  values (p_item->>'id', p_item->>'kind', nullif(p_item->>'character_id', ''), p_item->>'name', coalesce((p_item->>'grade')::smallint, 1),
          coalesce((p_item->>'default_owned')::boolean, false), coalesce(array(select jsonb_array_elements_text(p_item->'bundle_items')), '{}'), coalesce((p_item->>'enabled')::boolean, true))
  on conflict (id) do update set kind = excluded.kind, character_id = excluded.character_id, name = excluded.name, grade = excluded.grade,
     default_owned = excluded.default_owned, bundle_items = excluded.bundle_items, enabled = excluded.enabled;
  perform public.audit_add(p_staff, '상품 ' || (p_item->>'id'), '상품 저장', p_item, '');
end; $$;

create or replace function public.bo_offer_upsert(p_offer jsonb, p_staff uuid) returns void language plpgsql security definer set search_path = '' as $$
declare before jsonb;
begin
  select to_jsonb(o) into before from public.shop_offers o where id = p_offer->>'id';
  insert into public.shop_offers (id, item_id, tab, price_gold, price_krw, starts_at, ends_at, slot, enabled)
  values (p_offer->>'id', p_offer->>'item_id', p_offer->>'tab', (p_offer->>'price_gold')::integer, (p_offer->>'price_krw')::integer,
          coalesce((p_offer->>'starts_at')::timestamptz, now()), (p_offer->>'ends_at')::timestamptz, coalesce((p_offer->>'slot')::smallint, 0), coalesce((p_offer->>'enabled')::boolean, true))
  on conflict (id) do update set item_id = excluded.item_id, tab = excluded.tab, price_gold = excluded.price_gold, price_krw = excluded.price_krw,
     starts_at = excluded.starts_at, ends_at = excluded.ends_at, slot = excluded.slot, enabled = excluded.enabled;
  perform public.audit_add(p_staff, '판매 ' || (p_offer->>'id'), '판매 설정', jsonb_build_object('before', before, 'after', p_offer), '');
end; $$;

create or replace function public.bo_lobby() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'banners', coalesce((select jsonb_agg(to_jsonb(b) order by b.slot, b.id) from public.lobby_banners b), '[]'),
    'notices', coalesce((select jsonb_agg(to_jsonb(n) order by n.id desc) from public.notices n), '[]'),
    'mailJobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.id desc) from (select * from public.mail_jobs order by id desc limit 50) j), '[]'));
$$;

create or replace function public.bo_banner_upsert(p_banner jsonb, p_staff uuid) returns bigint language plpgsql security definer set search_path = '' as $$
declare bid bigint := (p_banner->>'id')::bigint;
begin
  if bid is null then
    insert into public.lobby_banners (title, image_url, link, slot, starts_at, ends_at, enabled)
    values (p_banner->>'title', nullif(p_banner->>'image_url', ''), coalesce(p_banner->>'link', ''), coalesce((p_banner->>'slot')::smallint, 1),
            coalesce((p_banner->>'starts_at')::timestamptz, now()), (p_banner->>'ends_at')::timestamptz, coalesce((p_banner->>'enabled')::boolean, true)) returning id into bid;
  else
    update public.lobby_banners set title = p_banner->>'title', image_url = nullif(p_banner->>'image_url', ''), link = coalesce(p_banner->>'link', ''),
           slot = coalesce((p_banner->>'slot')::smallint, slot), starts_at = coalesce((p_banner->>'starts_at')::timestamptz, starts_at),
           ends_at = (p_banner->>'ends_at')::timestamptz, enabled = coalesce((p_banner->>'enabled')::boolean, enabled) where id = bid;
  end if;
  perform public.audit_add(p_staff, '배너 ' || bid, '배너 저장', p_banner, '');
  return bid;
end; $$;

create or replace function public.bo_notice_upsert(p_notice jsonb, p_staff uuid) returns bigint language plpgsql security definer set search_path = '' as $$
declare nid bigint := (p_notice->>'id')::bigint;
begin
  if nid is null then
    insert into public.notices (title, body, starts_at, ends_at, enabled)
    values (p_notice->>'title', coalesce(p_notice->>'body', ''), coalesce((p_notice->>'starts_at')::timestamptz, now()), (p_notice->>'ends_at')::timestamptz, coalesce((p_notice->>'enabled')::boolean, true))
    returning id into nid;
  else
    update public.notices set title = p_notice->>'title', body = coalesce(p_notice->>'body', ''), starts_at = coalesce((p_notice->>'starts_at')::timestamptz, starts_at),
           ends_at = (p_notice->>'ends_at')::timestamptz, enabled = coalesce((p_notice->>'enabled')::boolean, enabled) where id = nid;
  end if;
  perform public.audit_add(p_staff, '공지 ' || nid, '공지 저장', p_notice, '');
  return nid;
end; $$;

-- 로비 화면용(플레이어): 진행 중 배너 최대 5개 + 진행 중 공지 1개
create or replace function public.lobby_content() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'banners', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'image', image_url, 'link', link, 'endsAt', ends_at) order by slot, id) from (
                 select * from public.lobby_banners where enabled and starts_at <= now() and (ends_at is null or ends_at > now()) order by slot, id limit 5) b), '[]'),
    'notice', (select jsonb_build_object('id', id, 'title', title, 'body', body) from public.notices
                where enabled and starts_at <= now() and (ends_at is null or ends_at > now()) order by id desc limit 1));
$$;

create or replace function public.bo_mail_job(p_job jsonb, p_staff uuid) returns bigint language plpgsql security definer set search_path = '' as $$
declare jid bigint;
begin
  if coalesce(char_length(trim(p_job->>'title')), 0) < 2 then raise exception 'title_required' using errcode = 'P0001'; end if;
  if (p_job->'target'->>'type') not in ('all', 'accounts', 'tier') then raise exception 'target_invalid' using errcode = 'P0001'; end if;
  insert into public.mail_jobs (target, title, body, rewards, days, send_at, created_by)
  values (p_job->'target', p_job->>'title', coalesce(p_job->>'body', ''), coalesce(p_job->'rewards', '[]'), coalesce((p_job->>'days')::integer, 30),
          coalesce((p_job->>'send_at')::timestamptz, now()), p_staff) returning id into jid;
  perform public.audit_add(p_staff, '우편 작업 ' || jid, '우편 발송 등록', p_job, coalesce(p_job->>'reason', ''));
  return jid;
end; $$;

create or replace function public.bo_mail_job_cancel(p_job bigint, p_staff uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.mail_jobs set canceled_at = now() where id = p_job and sent_at is null and canceled_at is null;
  if not found then raise exception 'job_invalid' using errcode = 'P0001'; end if;
  perform public.audit_add(p_staff, '우편 작업 ' || p_job, '우편 발송 취소', '{}', '');
end; $$;

-- 발송 시각이 된 작업 실행(크론·즉시). 계정마다 ref 'job:<id>'라 다시 돌려도 중복 없음
create or replace function public.mail_jobs_run(p_season integer) returns integer language plpgsql security definer set search_path = '' as $$
declare j public.mail_jobs; n integer; total integer := 0;
begin
  for j in select * from public.mail_jobs where sent_at is null and canceled_at is null and send_at <= now() order by id for update skip locked loop
    with targets as (
      select a.id from public.accounts a where a.status = 'active' and (
        (j.target->>'type' = 'all')
        or (j.target->>'type' = 'accounts' and a.id::text in (select jsonb_array_elements_text(j.target->'ids')))
        or (j.target->>'type' = 'tier' and exists (select 1 from public.ratings r where r.account_id = a.id and r.season_id = p_season and r.tier_no >= (j.target->>'min')::integer)))
    ), sent as (
      insert into public.mail (account_id, title, body, rewards, ref, expires_at)
      select t.id, j.title, j.body, j.rewards, 'job:' || j.id, now() + make_interval(days => j.days) from targets t
      on conflict (account_id, ref) do nothing returning 1)
    select count(*) into n from sent;
    update public.mail_jobs set sent_at = now(), sent_count = n where id = j.id;
    total := total + n;
  end loop;
  return total;
end; $$;

-- 대시보드(상세 14 운영): 오늘(05:00 KST 기준) 지표 + 최근 7일 캐릭터 승률·픽률·밴률(랭킹전)
create or replace function public.bo_dashboard() returns jsonb language sql stable security definer set search_path = '' as $$
  with day0 as (select (date_trunc('day', now() at time zone 'Asia/Seoul' - interval '5 hours') + interval '5 hours') at time zone 'Asia/Seoul' as t),
  today as (select m.* from public.match_results m, day0 where m.ended_at >= day0.t),
  wk as (select * from public.match_results where ended_at > now() - interval '7 days' and mode in ('ranked', 'ranked_ai') and outcome <> 'void'),
  picks as (
    select (summary->'picks'->>0) c, case outcome when 'a' then 1.0 when 'draw' then 0.5 else 0 end w from wk
    union all select (summary->'picks'->>1) c, case outcome when 'b' then 1.0 when 'draw' then 0.5 else 0 end w from wk where mode = 'ranked'),
  bans as (select jsonb_array_elements_text(summary->'bans') c from wk where summary->'bans' is not null)
  select jsonb_build_object(
    'accounts', (select count(*) from public.accounts),
    'newToday', (select count(*) from public.accounts, day0 where created_at >= day0.t),
    'activeToday', (select count(*) from public.accounts, day0 where last_login_at >= day0.t),
    'matchesToday', (select jsonb_object_agg(mode, n) from (select mode, count(*) n from today group by mode) x),
    'aiFallbackRate', (select round(100.0 * count(*) filter (where mode = 'ranked_ai') / nullif(count(*) filter (where mode in ('ranked', 'ranked_ai')), 0), 1) from today),
    'leaveRate', (select round(100.0 * count(*) filter (where finish_reason in ('leave', 'afk')) / nullif(count(*), 0), 1) from today where mode in ('ranked', 'ranked_ai')),
    'avgTurns', (select round(avg(turns), 1) from today where outcome <> 'void'),
    'avgBattleSec', (select round(avg((summary->>'battle_sec')::numeric)) from today where outcome <> 'void'),
    'revenueToday', (select coalesce(sum(amount), 0) from public.orders, day0 where status = 'delivered' and delivered_at >= day0.t),
    'goldIssuedToday', (select coalesce(sum(delta), 0) from public.gold_ledger, day0 where delta > 0 and created_at >= day0.t),
    'pendingReviews', (select count(*) from public.data_reviews where state in ('review', 'approved', 'scheduled')),
    'openReports', (select count(*) from public.reports where status = 'open'),
    'liveVersion', (select version_id from public.data_live),
    'characters7d', (select coalesce(jsonb_agg(jsonb_build_object('id', c, 'games', n, 'winRate', wr, 'pickRate', pr, 'banRate', br) order by c), '[]') from (
        select p.c, count(*) n, round(100.0 * avg(p.w), 1) wr,
               round(100.0 * count(*) / nullif((select count(*) from wk), 0), 1) pr,
               round(100.0 * (select count(*) from bans b where b.c = p.c) / nullif((select count(*) from wk), 0), 1) br
          from picks p where p.c is not null group by p.c) x),
    'rankedGames7d', (select count(*) from wk));
$$;

-- =========================================================
-- 기존 함수 보완: 기간 정지 자동 해제, 랭킹 보드에서 시즌 기록 처리 계정 제외
-- =========================================================
-- 기간 정지가 끝났으면 자동 해제(상세 13). Worker가 로그인 직전에 부른다(auth_login은 그대로 둔다)
create or replace function public.account_unban_expired(p_provider text, p_provider_uid text) returns boolean
language sql security definer set search_path = '' as $$
  with u as (
    update public.accounts a set status = 'active', banned_until = null
      from public.identities i
     where i.provider = p_provider and i.provider_uid = p_provider_uid and a.id = i.account_id
       and a.status = 'banned' and a.banned_until is not null and a.banned_until <= now()
    returning 1)
  select exists (select 1 from u);
$$;

create or replace function public.rank_board(p_season integer, p_limit integer default 100)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'masters', (select count(*) from public.ratings where season_id = p_season and tier_no >= 16 and not excluded),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('account', r.account_id, 'name', a.display_name, 'rp', r.rp, 'tier', r.tier_no) order by r.rp desc)
      from (select * from public.ratings where season_id = p_season and not excluded order by rp desc limit least(p_limit, 200)) r
      join public.accounts a on a.id = r.account_id), '[]'));
$$;

-- ---------- 권한 ----------
do $$
declare t text;
begin
  foreach t in array array['staff', 'staff_invites', 'staff_sessions', 'audit_log', 'data_reviews', 'sanctions', 'reports', 'lobby_banners', 'notices', 'mail_jobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to service_role;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in (
              'staff_count', 'staff_by_login', 'staff_login_result', 'staff_session', 'staff_logout', 'staff_invite_create', 'staff_register', 'staff_list',
              'staff_update', 'staff_password', 'audit_add', 'audit_list', 'bo_version_data', 'bo_import_draft', 'bo_versions', 'bo_review', 'bo_publish',
              'bo_due_publishes', 'bo_rollback', 'bo_user_search', 'bo_user_detail', 'bo_gold_adjust', 'bo_item_adjust', 'bo_sanction', 'bo_sanction_revoke',
              'sanction_status', 'sanction_ack', 'report_create', 'bo_reports', 'bo_report_done', 'bo_catalog', 'bo_item_upsert', 'bo_offer_upsert', 'bo_lobby',
              'bo_banner_upsert', 'bo_notice_upsert', 'lobby_content', 'bo_mail_job', 'bo_mail_job_cancel', 'mail_jobs_run', 'bo_dashboard', 'account_unban_expired', 'rank_board') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
  for f in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and p.proname in ('version_data', 'audit_immutable') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

commit;
