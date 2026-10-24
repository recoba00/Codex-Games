-- 7단계: 친구·차단·접속 상태·친구 초대(상세 05), 시즌 보상·랭크 로드·명예의 전당(상세 08)
-- 원칙: 행을 지우지 않고 상태 열로 끝낸다(removed_at·status) — 이력 보존, 운영 DB에서 삭제 문 없음.
begin;

alter table public.accounts add column if not exists friend_code text unique;
alter table public.accounts add column if not exists last_seen_at timestamptz;
alter table public.accounts add column if not exists presence_hidden boolean not null default false;
alter table public.accounts add column if not exists presence_away boolean not null default false;
alter table public.accounts add column if not exists presence_room text;
alter table public.seasons add column if not exists rewarded_at timestamptz;

-- 친구 관계: 방향마다 한 행(a의 친구 목록 = a가 앞인 행)
create table public.friend_links (
  a uuid not null references public.accounts(id) on delete cascade,
  b uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (a, b),
  check (a <> b)
);

create table public.friend_requests (
  id bigserial primary key,
  from_acc uuid not null references public.accounts(id) on delete cascade,
  to_acc uuid not null references public.accounts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'canceled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (from_acc <> to_acc)
);
create unique index friend_requests_pending on public.friend_requests (from_acc, to_acc) where status = 'pending';
create index friend_requests_to on public.friend_requests (to_acc, status);

create table public.blocks (
  account uuid not null references public.accounts(id) on delete cascade,
  blocked uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (account, blocked),
  check (account <> blocked)
);

create table public.friend_invites (
  id bigserial primary key,
  from_acc uuid not null references public.accounts(id) on delete cascade,
  to_acc uuid not null references public.accounts(id) on delete cascade,
  room_code text not null check (room_code ~ '^[2-9A-HJKMNP-Z]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  answered_at timestamptz
);
create index friend_invites_to on public.friend_invites (to_acc, created_at desc);

create table public.hall_of_fame (
  season_id integer not null references public.seasons(id),
  rank integer not null,
  account_id uuid references public.accounts(id) on delete set null,
  name text not null,
  rp integer not null,
  primary key (season_id, rank)
);

-- ---------- 친구 ----------
create or replace function private.is_friend(p_a uuid, p_b uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friend_links where a = p_a and b = p_b and removed_at is null);
$$;
create or replace function private.is_blocked(p_a uuid, p_b uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks where ((account = p_a and blocked = p_b) or (account = p_b and blocked = p_a)) and removed_at is null);
$$;

-- 친구 코드 ASTRA-XXXX(상세 05). 처음 부를 때 만든다
create or replace function public.friend_code_get(p_account uuid) returns text language plpgsql security definer set search_path = '' as $$
declare c text; i integer := 0;
begin
  select friend_code into c from public.accounts where id = p_account;
  while c is null loop
    i := i + 1;
    c := 'ASTRA-' || (select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::integer, 1), '') from generate_series(1, case when i < 20 then 4 else 6 end));
    begin
      update public.accounts set friend_code = c where id = p_account and friend_code is null;
    exception when unique_violation then c := null;
    end;
    if c is not null then select friend_code into c from public.accounts where id = p_account; end if;
  end loop;
  return c;
end; $$;

-- 접속 상태(상세 05: 온라인·게임 중·자리 비움·오프라인, 숨기기). 클라이언트 하트비트·방 시작/끝에서 부른다
create or replace function public.presence_touch(p_account uuid, p_away boolean, p_room text, p_hidden boolean) returns void
language sql security definer set search_path = '' as $$
  update public.accounts set last_seen_at = now(), presence_away = coalesce(p_away, presence_away),
         presence_room = case when p_room = '' then null else coalesce(p_room, presence_room) end,
         presence_hidden = coalesce(p_hidden, presence_hidden)
   where id = p_account;
$$;

create or replace function private.presence_of(a public.accounts) returns text language sql stable set search_path = '' as $$
  select case when a.presence_hidden or a.last_seen_at is null or a.last_seen_at < now() - interval '2 minutes' then 'offline'
              when a.presence_room is not null then 'in_game' when a.presence_away then 'away' else 'online' end;
$$;

create or replace function public.friends_list(p_account uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', (select friend_code from public.accounts where id = p_account),
    'friends', coalesce((select jsonb_agg(x order by x.ord, x.name) from (
        select ac.id, ac.display_name as name, ac.friend_code as code, private.presence_of(ac) as status,
               case when ac.presence_hidden then null else ac.last_seen_at end as "lastSeenAt",
               case private.presence_of(ac) when 'online' then 0 when 'away' then 1 when 'in_game' then 2 else 3 end as ord, l.created_at as since
          from public.friend_links l join public.accounts ac on ac.id = l.b
         where l.a = p_account and l.removed_at is null) x), '[]'),
    'incoming', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'from', r.from_acc, 'name', a.display_name, 'at', r.created_at) order by r.id desc)
        from public.friend_requests r join public.accounts a on a.id = r.from_acc
       where r.to_acc = p_account and r.status = 'pending' and r.created_at > now() - interval '30 days'), '[]'),
    'outgoing', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'to', r.to_acc, 'name', a.display_name, 'at', r.created_at) order by r.id desc)
        from public.friend_requests r join public.accounts a on a.id = r.to_acc
       where r.from_acc = p_account and r.status = 'pending' and r.created_at > now() - interval '30 days'), '[]'),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'from', i.from_acc, 'name', a.display_name, 'room', i.room_code, 'expiresAt', i.expires_at) order by i.id desc)
        from public.friend_invites i join public.accounts a on a.id = i.from_acc
       where i.to_acc = p_account and i.answered_at is null and i.expires_at > now()), '[]'),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.display_name)) from public.blocks b join public.accounts a on a.id = b.blocked
       where b.account = p_account and b.removed_at is null), '[]'));
$$;

create or replace function private.link(p_a uuid, p_b uuid) returns void language sql security definer set search_path = '' as $$
  insert into public.friend_links (a, b) values (p_a, p_b), (p_b, p_a)
  on conflict (a, b) do update set removed_at = null, created_at = now();
$$;

-- 친구 요청: 코드·계정 ID로. 상대가 이미 나에게 요청했으면 바로 친구. 결과: sent | accepted
create or replace function public.friend_request(p_account uuid, p_code text, p_target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t uuid; rid bigint;
begin
  t := coalesce(p_target, (select id from public.accounts where friend_code = upper(trim(p_code))));
  if t is null or t = p_account or not exists (select 1 from public.accounts where id = t and status = 'active') then raise exception 'friend_not_found' using errcode = 'P0001'; end if;
  if private.is_friend(p_account, t) then raise exception 'already_friends' using errcode = 'P0001'; end if;
  if private.is_blocked(p_account, t) then raise exception 'friend_blocked' using errcode = 'P0001'; end if;
  if (select count(*) from public.friend_links where a = p_account and removed_at is null) >= 50
     or (select count(*) from public.friend_links where a = t and removed_at is null) >= 50 then raise exception 'friend_limit' using errcode = 'P0001'; end if;
  select id into rid from public.friend_requests where from_acc = t and to_acc = p_account and status = 'pending' and created_at > now() - interval '30 days' for update;
  if found then
    update public.friend_requests set status = 'accepted', decided_at = now() where id = rid;
    perform private.link(p_account, t);
    return jsonb_build_object('status', 'accepted', 'friend', t);
  end if;
  update public.friend_requests set status = 'canceled', decided_at = now() where from_acc = p_account and to_acc = t and status = 'pending' and created_at <= now() - interval '30 days';
  insert into public.friend_requests (from_acc, to_acc) values (p_account, t) on conflict do nothing;
  return jsonb_build_object('status', 'sent', 'friend', t);
end; $$;

create or replace function public.friend_respond(p_account uuid, p_request bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.friend_requests;
begin
  select * into r from public.friend_requests where id = p_request and to_acc = p_account and status = 'pending' for update;
  if not found or r.created_at <= now() - interval '30 days' then raise exception 'request_invalid' using errcode = 'P0001'; end if;
  if p_accept then
    if (select count(*) from public.friend_links where a = p_account and removed_at is null) >= 50
       or (select count(*) from public.friend_links where a = r.from_acc and removed_at is null) >= 50 then
      raise exception 'friend_limit' using errcode = 'P0001';
    end if;
    perform private.link(p_account, r.from_acc);
  end if;
  update public.friend_requests set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now() where id = p_request;
  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end);
end; $$;

create or replace function public.friend_remove(p_account uuid, p_other uuid) returns void language sql security definer set search_path = '' as $$
  update public.friend_links set removed_at = now() where ((a = p_account and b = p_other) or (a = p_other and b = p_account)) and removed_at is null;
$$;

-- 차단(최대 100명): 친구 관계·대기 요청·초대도 함께 끝낸다
create or replace function public.block_set(p_account uuid, p_other uuid, p_on boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_account = p_other then raise exception 'block_invalid' using errcode = 'P0001'; end if;
  if p_on then
    if (select count(*) from public.blocks where account = p_account and removed_at is null) >= 100 then raise exception 'block_limit' using errcode = 'P0001'; end if;
    insert into public.blocks (account, blocked) values (p_account, p_other) on conflict (account, blocked) do update set removed_at = null, created_at = now();
    perform public.friend_remove(p_account, p_other);
    update public.friend_requests set status = 'canceled', decided_at = now()
     where ((from_acc = p_account and to_acc = p_other) or (from_acc = p_other and to_acc = p_account)) and status = 'pending';
    update public.friend_invites set answered_at = now() where ((from_acc = p_account and to_acc = p_other) or (from_acc = p_other and to_acc = p_account)) and answered_at is null;
  else
    update public.blocks set removed_at = now() where account = p_account and blocked = p_other and removed_at is null;
  end if;
end; $$;

-- 닉네임 검색(앞부분 일치, 차단 관계 제외)
create or replace function public.friend_search(p_account uuid, p_q text) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.display_name, 'friend', private.is_friend(p_account, a.id))), '[]')
    from (select * from public.accounts where status = 'active' and id <> p_account and display_name ilike replace(replace(p_q, '%', ''), '_', '') || '%'
          order by last_seen_at desc nulls last limit 20) a
   where not private.is_blocked(p_account, a.id);
$$;

-- 최근 대전 상대(최근 20판, 사람만)
create or replace function public.recent_opponents(p_account uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.opp, 'name', a.display_name, 'mode', x.mode, 'at', x.ended_at, 'friend', private.is_friend(p_account, x.opp)) order by x.ended_at desc), '[]')
    from (select distinct on (opp) opp, mode, ended_at from (
            select case when player_a = p_account then player_b else player_a end opp, mode, ended_at
              from public.match_results where (player_a = p_account or player_b = p_account) order by ended_at desc limit 20) y
           where opp is not null order by opp, ended_at desc) x
    join public.accounts a on a.id = x.opp;
$$;

-- 친구 초대: 친구이고 게임 중이 아니어야 한다(상세 05). 5분 유효
create or replace function public.friend_invite(p_account uuid, p_friend uuid, p_room text) returns bigint language plpgsql security definer set search_path = '' as $$
declare iid bigint; st text;
begin
  if not private.is_friend(p_account, p_friend) then raise exception 'not_friend' using errcode = 'P0001'; end if;
  select private.presence_of(ac) into st from public.accounts ac where ac.id = p_friend;
  if st = 'in_game' then raise exception 'friend_in_game' using errcode = 'P0001'; end if;
  if (select count(*) from public.friend_invites where from_acc = p_account and created_at > now() - interval '1 minute') >= 5 then raise exception 'invite_limit' using errcode = 'P0001'; end if;
  insert into public.friend_invites (from_acc, to_acc, room_code, expires_at) values (p_account, p_friend, p_room, now() + interval '5 minutes') returning id into iid;
  return iid;
end; $$;

create or replace function public.friend_invite_answer(p_account uuid, p_invite bigint) returns jsonb language sql security definer set search_path = '' as $$
  update public.friend_invites set answered_at = now() where id = p_invite and to_acc = p_account and answered_at is null
  returning jsonb_build_object('room', room_code, 'valid', expires_at > now());
$$;

-- 친구 랭킹(상세 05 랭킹 보드 '친구' 탭): 나 + 친구의 이번 시즌 티어·RP
create or replace function public.rank_friends(p_account uuid, p_season integer) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.display_name, 'rp', coalesce(r.rp, 0), 'tier', coalesce(r.tier_no, 1), 'me', a.id = p_account)
           order by coalesce(r.rp, 0) desc, a.display_name), '[]')
    from public.accounts a left join public.ratings r on r.account_id = a.id and r.season_id = p_season and not r.excluded
   where a.id = p_account or a.id in (select b from public.friend_links where a = p_account and removed_at is null);
$$;

-- 경제 상태에 이번 시즌 최고 단계·RP 추가(랭크 로드 판단)
create or replace function public.econ_get(p_account uuid, p_season integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'gold', coalesce((select gold from public.wallets where account_id = p_account), 0),
    'state', coalesce((select state from public.econ_state where account_id = p_account), '{}'),
    'version', coalesce((select version from public.econ_state where account_id = p_account), 0),
    'tier', (select tier_no from public.ratings where account_id = p_account and season_id = p_season),
    'best', (select coalesce((state->>'best')::integer, tier_no) from public.ratings where account_id = p_account and season_id = p_season and not excluded),
    'rp', (select rp from public.ratings where account_id = p_account and season_id = p_season),
    'name', (select display_name from public.accounts where id = p_account),
    'name_changes', (select name_changes from public.accounts where id = p_account),
    'mail_unread', (select count(*) from public.mail where account_id = p_account and claimed_at is null and expires_at > now()),
    'pending_orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'provider', o.provider, 'status', o.status, 'created_at', o.created_at))
                                from public.orders o where o.account_id = p_account and o.status in ('init', 'approved')), '[]')
  );
$$;

-- ---------- 경제 커밋 + 상품 지급(랭크 로드 경계 보상) ----------
create or replace function public.econ_commit_items(
  p_account uuid, p_ref text, p_expected_version integer, p_state jsonb,
  p_gold_delta integer, p_reason text, p_detail jsonb, p_items text[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare res jsonb; x text;
begin
  res := public.econ_commit(p_account, p_ref, p_expected_version, p_state, p_gold_delta, p_reason, p_detail);
  if res->>'status' = 'ok' then
    foreach x in array coalesce(p_items, '{}') loop
      if exists (select 1 from public.catalog_items where id = x) then perform private.item_grant(p_account, x, 'reward', p_ref); end if;
    end loop;
  end if;
  return res;
end; $$;

-- ---------- 시즌 보상(상세 08): 최고 도달 티어 기준, 우편 30일, 레전드 = 서버가 계산한 상위 명단 ----------
create or replace function public.seasons_due_payout() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'endsAt', ends_at) order by id), '[]') from public.seasons where ends_at <= now() and rewarded_at is null;
$$;

create or replace function public.season_masters(p_season integer) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('account', r.account_id, 'name', a.display_name, 'rp', r.rp) order by r.rp desc), '[]')
    from public.ratings r join public.accounts a on a.id = r.account_id
   where r.season_id = p_season and r.tier_no >= 16 and not r.excluded;
$$;

-- p_cfg: { groups:[{key,min,max,gold,frame,title,grade,skin}], legend:{gold,frame,title,grade,skin}, legends:[account...], skin_item, days }
create or replace function public.season_payout(p_season integer, p_cfg jsonb) returns integer language plpgsql security definer set search_path = '' as $$
declare r record; g jsonb; rewards jsonb; n integer := 0; leg uuid[]; key text; frame_id text; title_id text; i integer := 0;
begin
  perform 1 from public.seasons where id = p_season and rewarded_at is null and ends_at <= now() for update;
  if not found then return 0; end if;
  leg := array(select (jsonb_array_elements_text(coalesce(p_cfg->'legends', '[]')))::uuid);
  for r in select x.account_id, coalesce((x.state->>'best')::integer, x.tier_no) as best from public.ratings x
            where x.season_id = p_season and not x.excluded loop
    if r.account_id = any(leg) then g := p_cfg->'legend' || jsonb_build_object('key', 'legend');
    else select e into g from jsonb_array_elements(p_cfg->'groups') e where r.best between (e->>'min')::integer and (e->>'max')::integer limit 1;
    end if;
    if g is null then continue; end if;
    key := upper(g->>'key');
    rewards := jsonb_build_array(jsonb_build_object('type', 'gold', 'amount', (g->>'gold')::integer));
    if coalesce((g->>'frame')::boolean, false) then
      frame_id := 'FRAME_S' || p_season || '_' || key;
      insert into public.catalog_items (id, kind, name, grade) values (frame_id, 'frame', '시즌 ' || p_season || ' ' || coalesce(g->>'label', key) || ' 프레임', coalesce((g->>'grade')::smallint, 1))
      on conflict (id) do nothing;
      rewards := rewards || jsonb_build_object('type', 'item', 'id', frame_id);
    end if;
    if coalesce((g->>'title')::boolean, false) then
      title_id := case when key = 'LEGEND' then 'TITLE_S' || p_season || '_LEGEND' else 'TITLE_S' || p_season end;
      insert into public.catalog_items (id, kind, name) values (title_id, 'title', case when key = 'LEGEND' then '시즌 ' || p_season || ' 레전드' else '시즌 ' || p_season || ' 도전자' end)
      on conflict (id) do nothing;
      rewards := rewards || jsonb_build_object('type', 'item', 'id', title_id);
    end if;
    if coalesce((g->>'skin')::boolean, false) and p_cfg->>'skin_item' is not null and exists (select 1 from public.catalog_items where id = p_cfg->>'skin_item') then
      rewards := rewards || jsonb_build_object('type', 'item', 'id', p_cfg->>'skin_item');
    end if;
    perform public.mail_send(r.account_id, '시즌 ' || p_season || ' 보상', '시즌 최고 도달 티어 보상입니다.', rewards, 'season:' || p_season, coalesce((p_cfg->>'days')::integer, 30));
    n := n + 1;
  end loop;
  for r in select x.account_id, a.display_name, x.rp from public.ratings x join public.accounts a on a.id = x.account_id
            where x.season_id = p_season and x.account_id = any(leg) order by x.rp desc loop
    i := i + 1;
    insert into public.hall_of_fame (season_id, rank, account_id, name, rp) values (p_season, i, r.account_id, r.display_name, r.rp) on conflict do nothing;
  end loop;
  update public.seasons set rewarded_at = now() where id = p_season;
  insert into public.audit_log (target, action, detail) values ('시즌 ' || p_season, '시즌 보상 지급', jsonb_build_object('mailed', n, 'legends', coalesce(array_length(leg, 1), 0)));
  return n;
end; $$;

create or replace function public.hall_of_fame_list(p_season integer) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('season', season_id, 'rank', rank, 'name', name, 'rp', rp) order by season_id desc, rank), '[]')
    from public.hall_of_fame where p_season is null or season_id = p_season;
$$;

-- ---------- 권한 ----------
do $$
declare t text;
begin
  foreach t in array array['friend_links', 'friend_requests', 'blocks', 'friend_invites', 'hall_of_fame'] loop
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
            where n.nspname = 'public' and p.proname in ('friend_code_get', 'presence_touch', 'friends_list', 'friend_request', 'friend_respond', 'friend_remove',
              'block_set', 'friend_search', 'recent_opponents', 'friend_invite', 'friend_invite_answer', 'rank_friends', 'econ_commit_items',
              'seasons_due_payout', 'season_masters', 'season_payout', 'hall_of_fame_list', 'econ_get') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
  for f in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and p.proname in ('is_friend', 'is_blocked', 'link', 'presence_of') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

commit;
