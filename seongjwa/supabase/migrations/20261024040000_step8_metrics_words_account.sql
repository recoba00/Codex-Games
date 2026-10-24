-- 8단계: 지표 로그(상세 12), 금칙어(상세 13), 계정 삭제·연동(상세 09)
-- 정리 작업: 14일 지난 계정 익명화는 step8b, 오래된 로그 삭제(delete 문)는 step8c.
begin;

-- ---------- 지표 로그(상세 12) ----------
-- 공통 속성: 유저·시각·플랫폼·기기·앱 버전·데이터 버전. 판 이벤트는 판이 끝날 때 한 번에(배치) 넣는다.
-- 골드 변동·결제·신고·보상은 원본 표(gold_ledger·orders·reports·inventory)를 그대로 지표에 쓴다(중복 저장 안 함).
alter table public.accounts add column if not exists last_platform text check (last_platform in ('android', 'ios', 'steam'));
alter table public.accounts add column if not exists last_device text check (last_device in ('phone', 'tablet', 'desktop'));
alter table public.accounts add column if not exists last_app_ver text;

create table public.events (
  id bigint generated always as identity primary key,
  account_id uuid references public.accounts(id) on delete cascade,
  name text not null check (name ~ '^[a-z_]{3,40}$'),
  at timestamptz not null default now(),
  platform text,
  device text,
  app_ver text,
  data_ver bigint,
  props jsonb not null default '{}'
);
create index events_name_at on public.events (name, at);
create index events_account_at on public.events (account_id, at);
create index events_at on public.events (at);

-- 여러 줄 한 번에. 플랫폼·기기·앱 버전이 비면 계정의 마지막 값. 없는(삭제된) 계정 줄은 버린다
create or replace function public.events_add(p_rows jsonb) returns integer language sql security definer set search_path = '' as $$
  with r as (select * from jsonb_to_recordset(coalesce(p_rows, '[]')) as x(account uuid, name text, at timestamptz, platform text, device text, app_ver text, data_ver bigint, props jsonb)),
  ins as (
    insert into public.events (account_id, name, at, platform, device, app_ver, data_ver, props)
    select r.account, r.name, coalesce(r.at, now()), coalesce(r.platform, a.last_platform), coalesce(r.device, a.last_device),
           coalesce(r.app_ver, a.last_app_ver), r.data_ver, coalesce(case when jsonb_typeof(r.props) = 'object' then r.props end, '{}')
      from r left join public.accounts a on a.id = r.account
     where r.account is null or a.id is not null
    returning 1)
  select count(*)::integer from ins;
$$;

create or replace function public.client_profile(p_account uuid, p_platform text, p_device text, p_app_ver text) returns void
language sql security definer set search_path = '' as $$
  update public.accounts set last_platform = coalesce(p_platform, last_platform), last_device = coalesce(p_device, last_device),
         last_app_ver = coalesce(p_app_ver, last_app_ver)
   where id = p_account;
$$;

-- 백오피스 지표(상세 12 KPI). 기간 [p_from, p_to). 티어 구간별 캐릭터 승률은 단계 번호로 내보내고 이름 묶음은 서버(JS)가 한다
create or replace function public.bo_metrics(p_from timestamptz, p_to timestamptz) returns jsonb language sql stable security definer set search_path = '' as $$
  with m as (select * from public.match_results where ended_at >= p_from and ended_at < p_to and outcome <> 'void'),
  rk as (select * from m where mode in ('ranked', 'ranked_ai')),
  ev as (select * from public.events where at >= p_from and at < p_to),
  seats as (
    select m.id, m.mode, m.player_a acc, m.summary->'picks'->>0 ch, m.summary->'spells'->0 sp, case m.outcome when 'a' then 1.0 when 'draw' then 0.5 else 0 end w from m
    union all
    select m.id, m.mode, m.player_b acc, m.summary->'picks'->>1 ch, m.summary->'spells'->1 sp, case m.outcome when 'b' then 1.0 when 'draw' then 0.5 else 0 end w from m where m.player_b is not null),
  rseats as (select s.*, (e.detail->>'tierBefore')::integer tier from seats s left join public.rank_events e on e.match_id = s.id and e.account_id = s.acc where s.mode in ('ranked', 'ranked_ai')),
  newacc as (select id, created_at from public.accounts where created_at >= p_from and created_at < p_to),
  act as (  -- 그날 활동: 앱 시작 이벤트 또는 판 기록
    select account_id acc, at from public.events where name = 'session_start' and at >= p_from
    union all select player_a, ended_at from public.match_results where ended_at >= p_from and player_a is not null
    union all select player_b, ended_at from public.match_results where ended_at >= p_from and player_b is not null),
  spend as (select account_id, min(created_at) first_at from public.gold_ledger where delta < 0 group by account_id)
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'matches', (select coalesce(jsonb_object_agg(mode, n), '{}') from (select mode, count(*) n from m where mode is not null group by mode) x),
    'ranked', (select count(*) from rk),
    'matchMinAvg', (select round(avg(extract(epoch from ended_at - started_at)) / 60, 2) from rk),
    'matchMinP90', (select round((percentile_cont(0.9) within group (order by extract(epoch from ended_at - started_at)) / 60)::numeric, 2) from rk),
    'battleMinMedian', (select round((percentile_cont(0.5) within group (order by (summary->>'battle_sec')::numeric) / 60)::numeric, 2) from rk where summary ? 'battle_sec'),
    'avgTurns', (select round(avg(turns), 1) from rk),
    'waitSecMedian', (select round((percentile_cont(0.5) within group (order by (props->>'wait_sec')::numeric))::numeric, 1) from ev where name = 'match_found' and props ? 'wait_sec'),
    'searches', (select jsonb_build_object('found', count(*) filter (where name = 'match_found'), 'ai', count(*) filter (where name = 'match_ai_fallback'), 'cancel', count(*) filter (where name = 'match_cancel'))
                   from ev where name in ('match_found', 'match_ai_fallback', 'match_cancel')),
    'aiFallbackPct', (select round(100.0 * count(*) filter (where mode = 'ranked_ai') / nullif(count(*), 0), 1) from rk),
    'leavePct', (select round(100.0 * count(*) filter (where finish_reason in ('leave', 'afk')) / nullif(count(*), 0), 1) from rk),
    'surrenderPct', (select round(100.0 * count(*) filter (where finish_reason = 'surrender') / nullif(count(*), 0), 1) from rk),
    'newAccounts', (select count(*) from newacc),
    'rankedEntryPct', (select round(100.0 * count(*) filter (where exists (select 1 from public.match_results x where x.mode in ('ranked', 'ranked_ai')
                          and (x.player_a = n.id or x.player_b = n.id) and x.ended_at < n.created_at + interval '1 day')) / nullif(count(*), 0), 1) from newacc n),
    'tutorial', (select coalesce(jsonb_object_agg(step, n), '{}') from (select props->>'step_id' step, count(distinct account_id) n from ev where name = 'tutorial_step' and props->>'step_id' is not null group by 1) x),
    'retention', (select jsonb_object_agg('d' || d, jsonb_build_object('cohort', c, 'back', b, 'pct', round(100.0 * b / nullif(c, 0), 1)))
                    from (select d, count(*) filter (where n.created_at + make_interval(days => d + 1) <= now()) c,
                                 count(*) filter (where n.created_at + make_interval(days => d + 1) <= now() and exists (select 1 from act where act.acc = n.id
                                   and act.at >= n.created_at + make_interval(days => d) and act.at < n.created_at + make_interval(days => d + 1))) b
                            from newacc n, unnest(array[1, 7, 30]) d group by d) r),
    'characters', (select coalesce(jsonb_agg(jsonb_build_object('id', ch, 'tier', tier, 'games', g, 'wins', w)), '[]')
                     from (select ch, tier, count(*) g, sum(w) w from rseats where ch is not null and not (mode = 'ranked_ai' and acc is null) group by ch, tier) x),
    'bans', (select coalesce(jsonb_object_agg(c, n), '{}') from (select b c, count(*) n from rk, jsonb_array_elements_text(coalesce(summary->'bans', '[]')) b where b is not null group by b) x),
    'spells', (select coalesce(jsonb_object_agg(sid, jsonb_build_object('games', g, 'wins', w)), '{}')
                 from (select sid, count(*) g, sum(w) w from rseats, jsonb_array_elements_text(case when jsonb_typeof(sp) = 'array' then sp else '[]' end) sid where acc is not null and sid is not null group by sid) x),
    'gold', jsonb_build_object(
       'earned', (select coalesce(sum(delta), 0) from public.gold_ledger where delta > 0 and created_at >= p_from and created_at < p_to),
       'spent', (select coalesce(-sum(delta), 0) from public.gold_ledger where delta < 0 and created_at >= p_from and created_at < p_to),
       'bySource', (select coalesce(jsonb_object_agg(reason, s), '{}') from (select reason, sum(delta) s from public.gold_ledger where created_at >= p_from and created_at < p_to group by reason) x),
       'firstSpendDaysMedian', (select round((percentile_cont(0.5) within group (order by extract(epoch from s.first_at - a.created_at) / 86400))::numeric, 1)
                                  from spend s join public.accounts a on a.id = s.account_id where a.created_at >= p_from and a.created_at < p_to)),
    'revenue', (select jsonb_build_object('orders', count(*) filter (where status in ('delivered', 'refunded')), 'amount', coalesce(sum(amount) filter (where status = 'delivered'), 0),
                  'refundPct', round(100.0 * count(*) filter (where status = 'refunded') / nullif(count(*) filter (where status in ('delivered', 'refunded')), 0), 1))
                  from public.orders where created_at >= p_from and created_at < p_to),
    'reports', (select count(*) from public.reports where created_at >= p_from and created_at < p_to),
    'events', (select coalesce(jsonb_object_agg(name, n), '{}') from (select name, count(*) n from ev group by name) x),
    'settings', (select coalesce(jsonb_object_agg(k, n), '{}') from (select props->>'key' k, count(distinct account_id) n from ev where name = 'settings_change' and props->>'key' is not null group by 1) x)
  );
$$;

-- ---------- 금칙어(상세 13 닉네임·프로필) ----------
-- 비교는 소문자 + 공백·기호 제거 + 흔한 숫자 바꿔 쓰기(0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s)
create or replace function private.norm_name(p text) returns text language sql immutable set search_path = '' as $$
  select regexp_replace(translate(lower(coalesce(p, '')), '013457@$', 'oieastas'), '[^a-z가-힣ㄱ-ㅎㅏ-ㅣぁ-んァ-ヶ一-龥々ー]', '', 'g');
$$;

create table public.banned_words (
  id bigint generated always as identity primary key,
  word text not null check (char_length(word) between 1 and 40),
  lang text not null default 'ko' check (lang in ('ko', 'en', 'ja', 'any')),
  kind text not null default 'profanity' check (kind in ('profanity', 'hate', 'impersonation', 'staff', 'other')),
  match text not null default 'contains' check (match in ('contains', 'prefix', 'exact')),
  note text not null default '',
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.staff(id)
);
create unique index banned_words_live on public.banned_words (private.norm_name(word), match) where removed_at is null;

-- 기본: 운영자·공식 사칭 단어만 넣는다. 욕설·혐오 목록은 기획·운영이 백오피스에서 채운다
insert into public.banned_words (word, lang, kind, match, note) values
  ('운영자', 'ko', 'staff', 'contains', '기본'), ('관리자', 'ko', 'staff', 'contains', '기본'), ('운영진', 'ko', 'staff', 'contains', '기본'),
  ('운영팀', 'ko', 'staff', 'contains', '기본'), ('개발자', 'ko', 'staff', 'contains', '기본'), ('개발팀', 'ko', 'staff', 'contains', '기본'),
  ('gm', 'en', 'staff', 'prefix', '기본'), ('admin', 'en', 'staff', 'contains', '기본'), ('moderator', 'en', 'staff', 'contains', '기본'),
  ('official', 'en', 'impersonation', 'contains', '기본'), ('공식', 'ko', 'impersonation', 'contains', '기본'), ('성좌결투', 'ko', 'impersonation', 'contains', '기본'),
  ('staff', 'en', 'staff', 'contains', '기본');

create or replace function public.name_matches(p_name text) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'word', w.word, 'kind', w.kind, 'match', w.match)), '[]')
    from public.banned_words w, (select private.norm_name(p_name) n) x
   where w.removed_at is null and private.norm_name(w.word) <> ''
     and case w.match when 'exact' then x.n = private.norm_name(w.word)
                      when 'prefix' then left(x.n, char_length(private.norm_name(w.word))) = private.norm_name(w.word)
                      else strpos(x.n, private.norm_name(w.word)) > 0 end;
$$;

-- 닉네임 변경: 금칙어 검사 추가(나머지는 5단계 그대로)
create or replace function public.profile_rename(p_account uuid, p_name text, p_cost integer, p_ref text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n integer; cost integer; g integer;
begin
  if char_length(p_name) not between 2 and 12 then raise exception 'name_invalid' using errcode = 'P0001'; end if;
  if jsonb_array_length(public.name_matches(p_name)) > 0 then raise exception 'name_banned' using errcode = 'P0001'; end if;
  select name_changes into n from public.accounts where id = p_account for update;
  cost := case when n = 0 then 0 else p_cost end;
  g := private.gold_apply(p_account, -cost, 'name_change', p_ref, jsonb_build_object('name', p_name));
  update public.accounts set display_name = p_name, name_changes = n + 1, updated_at = now() where id = p_account;
  return jsonb_build_object('gold', g, 'cost', cost, 'name', p_name);
end; $$;

create or replace function public.bo_words(p_q text) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'word', w.word, 'lang', w.lang, 'kind', w.kind, 'match', w.match, 'note', w.note, 'createdAt', w.created_at,
           'by', s.name) order by w.id desc), '[]')
    from public.banned_words w left join public.staff s on s.id = w.created_by
   where w.removed_at is null and (coalesce(p_q, '') = '' or w.word ilike '%' || p_q || '%');
$$;

create or replace function public.bo_word_add(p_staff uuid, p_word text, p_lang text, p_kind text, p_match text, p_note text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare wid bigint;
begin
  if private.norm_name(p_word) = '' then raise exception 'word_invalid' using errcode = 'P0001'; end if;
  if exists (select 1 from public.banned_words where removed_at is null and private.norm_name(word) = private.norm_name(p_word) and match = coalesce(p_match, 'contains')) then
    raise exception 'word_exists' using errcode = 'P0001';
  end if;
  insert into public.banned_words (word, lang, kind, match, note, created_by)
  values (trim(p_word), coalesce(p_lang, 'ko'), coalesce(p_kind, 'profanity'), coalesce(p_match, 'contains'), coalesce(p_note, ''), p_staff) returning id into wid;
  perform public.audit_add(p_staff, '금칙어', '금칙어 추가', jsonb_build_object('id', wid, 'word', p_word, 'kind', p_kind, 'match', p_match), coalesce(p_note, ''));
  return wid;
end; $$;

create or replace function public.bo_word_remove(p_staff uuid, p_id bigint, p_reason text) returns void language plpgsql security definer set search_path = '' as $$
declare w text;
begin
  update public.banned_words set removed_at = now(), removed_by = p_staff where id = p_id and removed_at is null returning word into w;
  if w is null then raise exception 'word_not_found' using errcode = 'P0001'; end if;
  perform public.audit_add(p_staff, '금칙어', '금칙어 삭제', jsonb_build_object('id', p_id, 'word', w), p_reason);
end; $$;

-- 지금 목록에 걸리는 기존 닉네임(검토 후 강제 변경용)
create or replace function public.bo_names_flagged(p_limit integer) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select a.id, a.display_name as name, public.name_matches(a.display_name) as hits
      from public.accounts a where a.status in ('active', 'banned') and jsonb_array_length(public.name_matches(a.display_name)) > 0
     order by a.last_login_at desc nulls last limit greatest(1, least(coalesce(p_limit, 100), 500))) x;
$$;

-- ---------- 계정 연동(상세 09): 한 계정에 여러 로그인 수단, 합치기 없음 ----------
create or replace function public.account_summary(p_account uuid, p_season integer) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'name', a.display_name, 'createdAt', a.created_at, 'lastLoginAt', a.last_login_at,
    'tier', (select tier_no from public.ratings where account_id = a.id and season_id = p_season),
    'rp', (select rp from public.ratings where account_id = a.id and season_id = p_season),
    'gold', coalesce((select gold from public.wallets where account_id = a.id), 0),
    'items', (select count(*) from public.inventory where account_id = a.id and revoked_at is null),
    'paidItems', (select count(*) from public.inventory where account_id = a.id and revoked_at is null and source = 'cash'),
    'games', (select count(*) from public.match_results where player_a = a.id or player_b = a.id),
    'logins', coalesce((select jsonb_agg(provider order by linked_at) from public.identities where account_id = a.id), '[]'))
  from public.accounts a where a.id = p_account;
$$;

create or replace function public.account_info(p_account uuid, p_season integer) returns jsonb language sql stable security definer set search_path = '' as $$
  select public.account_summary(p_account, p_season) || jsonb_build_object(
    'status', a.status, 'deletionRequestedAt', a.deletion_requested_at,
    'deletionAt', a.deletion_requested_at + interval '14 days',
    'identities', coalesce((select jsonb_agg(jsonb_build_object('provider', provider, 'linkedAt', linked_at, 'lastUsedAt', last_used_at) order by linked_at)
                    from public.identities where account_id = a.id), '[]'))
  from public.accounts a where a.id = p_account;
$$;

-- p_choice: null = 확인만(다른 계정에 있으면 두 계정 진행도를 돌려줌), 'current' = 이 계정으로 옮김, 'other' = 그 계정으로 전환(서버가 그 계정 세션 발급)
create or replace function public.identity_link(p_account uuid, p_provider text, p_uid text, p_choice text, p_season integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ex public.identities; other uuid; left_n integer;
begin
  if p_provider not in ('steam', 'google', 'apple', 'guest') then raise exception 'provider_invalid' using errcode = 'P0001'; end if;
  select * into ex from public.identities where provider = p_provider and provider_uid = p_uid for update;
  if found and ex.account_id = p_account then return jsonb_build_object('status', 'already'); end if;
  if exists (select 1 from public.identities where account_id = p_account and provider = p_provider) then
    raise exception 'provider_taken' using errcode = 'P0001';  -- 수단 종류별 1개
  end if;
  if not found then
    insert into public.identities (account_id, provider, provider_uid) values (p_account, p_provider, p_uid);
    insert into public.audit_log (target, action, detail) values ('유저 ' || p_account, '로그인 수단 연결', jsonb_build_object('provider', p_provider));
    return jsonb_build_object('status', 'linked');
  end if;
  other := ex.account_id;
  if p_choice is null then
    return jsonb_build_object('status', 'conflict', 'current', public.account_summary(p_account, p_season), 'other', public.account_summary(other, p_season));
  elsif p_choice = 'other' then
    return jsonb_build_object('status', 'switch', 'account', other);
  elsif p_choice = 'current' then
    update public.identities set account_id = p_account, linked_at = now() where id = ex.id;
    select count(*) into left_n from public.identities where account_id = other;
    if left_n = 0 then  -- 남은 로그인 수단이 없는 계정은 들어갈 길이 없으므로 삭제 유예로 둔다(14일 뒤 정리)
      update public.accounts set status = 'deletion_pending', deletion_requested_at = now() where id = other and status = 'active';
      update public.sessions set revoked_at = now(), revoked_reason = 'deleted' where account_id = other and revoked_at is null;
    end if;
    insert into public.audit_log (target, action, detail) values ('유저 ' || p_account, '로그인 수단 옮김(계정 선택)',
      jsonb_build_object('provider', p_provider, 'from', other, 'fromOrphaned', left_n = 0));
    return jsonb_build_object('status', 'moved', 'from', other, 'fromOrphaned', left_n = 0);
  end if;
  raise exception 'choice_invalid' using errcode = 'P0001';
end; $$;

-- ---------- 계정 삭제 요청(상세 09): 14일 유예, 그동안 로그인하면 취소(auth_login이 처리) ----------
create or replace function public.account_delete_request(p_account uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare st text;
begin
  select status into st from public.accounts where id = p_account for update;
  if st is null then raise exception 'account_not_found' using errcode = 'P0001'; end if;
  if st <> 'active' then raise exception 'account_not_active' using errcode = 'P0001'; end if;
  update public.accounts set status = 'deletion_pending', deletion_requested_at = now(), updated_at = now() where id = p_account;
  update public.sessions set revoked_at = now(), revoked_reason = 'deleted' where account_id = p_account and revoked_at is null;
  update public.friend_invites set answered_at = now() where (from_acc = p_account or to_acc = p_account) and answered_at is null;
  insert into public.audit_log (target, action, detail) values ('유저 ' || p_account, '계정 삭제 요청', '{}');
  return jsonb_build_object('deletionAt', now() + interval '14 days');
end; $$;

-- 결제 기록 분리 보관(삭제 뒤에도 법정 보관 기간). 계정과 연결하지 않는다
create table public.payment_archive (
  order_id bigint primary key,
  account_ref uuid not null,
  data jsonb not null,
  archived_at timestamptz not null default now(),
  retain_until date not null
);

-- ---------- 권한 ----------
do $$
declare t text;
begin
  foreach t in array array['events', 'banned_words', 'payment_archive'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('events_add', 'client_profile', 'bo_metrics', 'name_matches', 'profile_rename', 'bo_words', 'bo_word_add',
              'bo_word_remove', 'bo_names_flagged', 'account_summary', 'account_info', 'identity_link', 'account_delete_request') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
  revoke execute on function private.norm_name(text) from public, anon, authenticated;
end $$;
commit;
