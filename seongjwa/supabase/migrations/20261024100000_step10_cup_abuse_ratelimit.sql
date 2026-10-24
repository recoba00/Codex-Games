-- 10단계: 주말 챔피언스 컵(상세 08), 자동 어뷰징 탐지·부계정 K값(상세 13), 로그인 요청 제한(전작 검토 B6).
-- 오래된 요청 기록 정리(delete)는 step10b에 따로 둔다.
begin;

-- ---------- 요청 제한: 키(예: 'auth:' + IP 해시)마다 시간 칸(window) 단위 횟수 ----------
create table public.rate_hits (
  key text not null,
  bucket bigint not null,          -- floor(epoch / window)
  hits integer not null default 0,
  primary key (key, bucket)
);
create or replace function public.rate_hit(p_key text, p_limit integer, p_window_sec integer) returns boolean
language sql security definer set search_path = '' as $$
  insert into public.rate_hits (key, bucket, hits) values (p_key, floor(extract(epoch from now()) / p_window_sec)::bigint, 1)
  on conflict (key, bucket) do update set hits = public.rate_hits.hits + 1
  returning hits <= p_limit;
$$;

-- ---------- 부계정 K값(상세 13): 사람 랭킹전 누적 판수·승수를 랭크 상태에 함께 ----------
create or replace function public.rank_state(p_account uuid, p_season integer, p_window_days integer default 7)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'current', (select to_jsonb(r) from public.ratings r where r.account_id = p_account and r.season_id = p_season),
    'previous', (select to_jsonb(r) from public.ratings r where r.account_id = p_account and r.season_id < p_season order by r.season_id desc limit 1),
    'mmr', coalesce((select m.mmr from public.mmr m where m.account_id = p_account), 800),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.created_at, 'mode', e.mode,
                   'exempt', coalesce((e.detail->>'netExempt')::boolean, false)) order by e.created_at)
                 from public.rank_events e where e.account_id = p_account and e.created_at > now() - make_interval(days => p_window_days)), '[]'),
    'stats', (select jsonb_build_object('games', count(*), 'wins', count(*) filter (where e.kind = 'win'))
                from public.rank_events e where e.account_id = p_account and e.mode = 'ranked' and e.kind in ('win', 'loss', 'leave', 'draw'))
  );
$$;

-- ---------- 어뷰징 의심 목록(상세 13 자동 탐지 → 사람이 백오피스에서 판단) ----------
-- 매크로: 사람이 직접 확정한 턴의 확정 시간이 거의 같음(표준편차 작음). 연속 플레이: 짧은 시간 판수 과다.
-- 몰아주기: 같은 두 계정의 반복 랭킹전에서 한쪽이 일찍 항복·이탈. 부계정: 신규 계정 초반 고승률(자동으로 K값 증가, 제재 대상 아님)
create or replace function public.bo_suspects(p_cfg jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  with cfg as (select coalesce((p_cfg->>'days')::integer, 7) days, coalesce((p_cfg->>'macro_min_turns')::integer, 30) mt,
                      coalesce((p_cfg->>'macro_std_sec')::numeric, 0.7) ms, coalesce((p_cfg->>'marathon_hours')::integer, 12) mh,
                      coalesce((p_cfg->>'marathon_games')::integer, 40) mg, coalesce((p_cfg->>'pair_games')::integer, 3) pg,
                      coalesce((p_cfg->>'smurf_days')::integer, 14) sd, coalesce((p_cfg->>'smurf_games')::integer, 10) sg,
                      coalesce((p_cfg->>'smurf_winrate')::numeric, 0.75) sw),
  turns as (select e.account_id acc, (t->>'s')::numeric s from public.events e, cfg, jsonb_array_elements(coalesce(e.props->'turns', '[]')) t
             where e.name = 'turn_end' and e.at > now() - make_interval(days => cfg.days) and e.account_id is not null
               and coalesce((t->>'auto')::integer, 0) = 0 and jsonb_typeof(t->'s') = 'number'),
  seats as (select m.player_a acc, m.ended_at from public.match_results m where m.player_a is not null
            union all select m.player_b, m.ended_at from public.match_results m where m.player_b is not null),
  pairs as (select least(m.player_a, m.player_b) a, greatest(m.player_a, m.player_b) b, count(*) games,
                   count(*) filter (where m.finish_reason in ('surrender', 'leave', 'afk') and m.turns <= 3) early,
                   count(*) filter (where (m.outcome = 'a' and m.player_a = least(m.player_a, m.player_b)) or (m.outcome = 'b' and m.player_b = least(m.player_a, m.player_b))) a_wins
              from public.match_results m, cfg
             where m.mode = 'ranked' and m.player_a is not null and m.player_b is not null and m.ended_at > now() - make_interval(days => cfg.days)
             group by 1, 2)
  select jsonb_build_object(
    'macro', coalesce((select jsonb_agg(x order by x.std) from (
        select t.acc id, a.display_name name, count(*) turns, round(stddev_pop(t.s), 2) std, round(avg(t.s), 1) avg
          from turns t join public.accounts a on a.id = t.acc, cfg group by t.acc, a.display_name, cfg.mt, cfg.ms
        having count(*) >= cfg.mt and stddev_pop(t.s) < cfg.ms) x), '[]'),
    'marathon', coalesce((select jsonb_agg(x order by x.games desc) from (
        select s.acc id, a.display_name name, count(*) games from seats s join public.accounts a on a.id = s.acc, cfg
         where s.ended_at > now() - make_interval(hours => cfg.mh) group by s.acc, a.display_name, cfg.mg having count(*) >= cfg.mg) x), '[]'),
    'pairs', coalesce((select jsonb_agg(jsonb_build_object('a', p.a, 'aName', aa.display_name, 'b', p.b, 'bName', ab.display_name, 'games', p.games, 'early', p.early, 'aWins', p.a_wins) order by p.early desc, p.games desc)
        from pairs p join public.accounts aa on aa.id = p.a join public.accounts ab on ab.id = p.b, cfg where p.games >= cfg.pg and p.early >= 2), '[]'),
    'smurf', coalesce((select jsonb_agg(x order by x.winrate desc) from (
        select a.id, a.display_name name, a.created_at, count(*) games, count(*) filter (where e.kind = 'win') wins,
               round(count(*) filter (where e.kind = 'win')::numeric / count(*), 2) winrate
          from public.accounts a join public.rank_events e on e.account_id = a.id and e.mode = 'ranked' and e.kind in ('win', 'loss', 'leave', 'draw'), cfg
         where a.created_at > now() - make_interval(days => cfg.sd)
         group by a.id, a.display_name, a.created_at, cfg.sg, cfg.sw
        having count(*) >= cfg.sg and count(*) filter (where e.kind = 'win')::numeric / count(*) >= cfg.sw) x), '[]'));
$$;

-- ---------- 주말 챔피언스 컵(상세 08) ----------
alter table public.match_results drop constraint if exists match_results_mode_check;
alter table public.match_results add constraint match_results_mode_check check (mode in ('friend', 'practice', 'ranked', 'ranked_ai', 'cup'));
-- 주(week) = 그 주 토요일 날짜(한국 시간). 기간 토 05:00 ~ 월 05:00. 참가 = 등록 1회(7승 또는 3패까지)
create table public.cup_entries (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  week date not null,
  season_id integer not null,
  roster jsonb not null,            -- [{char, preset}] 3명
  wins smallint not null default 0,
  losses smallint not null default 0,
  status text not null default 'active' check (status in ('active', 'done', 'left')),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  rewarded_at timestamptz
);
create unique index cup_entries_one_active on public.cup_entries (account_id) where status = 'active';
create index cup_entries_week on public.cup_entries (week, status);
create table public.cup_matches (    -- 판마다 기록(재시도 안전)
  match_id uuid not null,
  entry_id bigint not null references public.cup_entries(id) on delete cascade,
  result text not null check (result in ('win', 'loss', 'draw', 'leave')),
  created_at timestamptz not null default now(),
  primary key (match_id, entry_id)
);
create table public.cup_bonus (      -- 주간 미션 보상 추가 참가권(상세 08)
  account_id uuid not null references public.accounts(id) on delete cascade,
  week date not null,
  granted_at timestamptz not null default now(),
  primary key (account_id, week)
);
create table public.cup_penalties (  -- 이탈: 다음 주 참가권 1회 차감
  account_id uuid not null references public.accounts(id) on delete cascade,
  week date not null,
  created_at timestamptz not null default now(),
  primary key (account_id, week)
);

create or replace function public.cup_status(p_account uuid, p_week date, p_season integer) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'best', (select coalesce((r.state->>'best')::integer, r.tier_no) from public.ratings r where r.account_id = p_account and r.season_id = p_season and not r.excluded),
    'entry', (select to_jsonb(e) from public.cup_entries e where e.account_id = p_account and e.status = 'active'),
    'used', (select count(*) from public.cup_entries e where e.account_id = p_account and e.week = p_week),
    'bonus', exists (select 1 from public.cup_bonus b where b.account_id = p_account and b.week = p_week),
    'penalty', exists (select 1 from public.cup_penalties p where p.account_id = p_account and p.week = p_week),
    'left', exists (select 1 from public.cup_entries e where e.account_id = p_account and e.week = p_week and e.status = 'left'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('week', e.week, 'wins', e.wins, 'losses', e.losses, 'status', e.status) order by e.id desc)
                 from (select * from public.cup_entries e where e.account_id = p_account order by e.id desc limit 10) e), '[]'),
    'sevenWins', (select count(*) from public.cup_entries e where e.account_id = p_account and e.wins >= 7));
$$;

-- 참가: 자격(서버가 확인한 최고 단계)·참가권(1 + 보너스 − 이탈 차감)·이번 주 이탈 없음·진행 중 없음
create or replace function public.cup_enter(p_account uuid, p_week date, p_season integer, p_roster jsonb, p_min_tier integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare st jsonb := public.cup_status(p_account, p_week, p_season); allowed integer; e public.cup_entries;
begin
  if coalesce((st->>'best')::integer, 0) < p_min_tier then raise exception 'cup_not_eligible' using errcode = 'P0001'; end if;
  if st->'entry' <> 'null'::jsonb then raise exception 'cup_entry_active' using errcode = 'P0001'; end if;
  if (st->>'left')::boolean then raise exception 'cup_left_this_week' using errcode = 'P0001'; end if;
  allowed := 1 + case when (st->>'bonus')::boolean then 1 else 0 end - case when (st->>'penalty')::boolean then 1 else 0 end;
  if (st->>'used')::integer >= allowed then raise exception 'cup_no_ticket' using errcode = 'P0001'; end if;
  insert into public.cup_entries (account_id, week, season_id, roster) values (p_account, p_week, p_season, p_roster) returning * into e;
  return to_jsonb(e);
end; $$;

-- 판 결과: 7승·3패에 끝나면 보상 우편(같은 판 다시 와도 한 번). 이탈 = 패배 + 이번 주 끝 + 다음 주 1회 차감
create or replace function private.cup_finish(p_entry public.cup_entries, p_cfg jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare w integer := p_entry.wins; gold integer; rewards jsonb; frame text := 'FRAME_CUP'; title text;
begin
  if p_entry.rewarded_at is not null then return; end if;
  gold := case when w >= 5 then coalesce((p_cfg->>'gold_5')::integer, 3000) when w >= 3 then coalesce((p_cfg->>'gold_3')::integer, 2000) else coalesce((p_cfg->>'gold_0')::integer, 1000) end;
  rewards := jsonb_build_array(jsonb_build_object('type', 'gold', 'amount', gold));
  if w >= 5 and p_cfg->>'emote_item' is not null and exists (select 1 from public.catalog_items where id = p_cfg->>'emote_item') then
    rewards := rewards || jsonb_build_object('type', 'item', 'id', p_cfg->>'emote_item');
  end if;
  if w >= 7 then
    insert into public.catalog_items (id, kind, name, grade) values (frame, 'frame', '챔피언스 컵 프레임', 4) on conflict (id) do nothing;
    title := 'TITLE_CUP_' || to_char(p_entry.week, 'YYYYMMDD');
    insert into public.catalog_items (id, kind, name) values (title, 'title', '컵 우승자 (' || to_char(p_entry.week, 'MM/DD') || ' 주)') on conflict (id) do nothing;
    rewards := rewards || jsonb_build_object('type', 'item', 'id', frame) || jsonb_build_object('type', 'item', 'id', title);
  end if;
  perform public.mail_send(p_entry.account_id, '챔피언스 컵 ' || w || '승 보상', '주말 챔피언스 컵 결과 보상입니다.', rewards, 'cup:' || p_entry.id, 30);
  update public.cup_entries set rewarded_at = now() where id = p_entry.id;
end; $$;

create or replace function public.cup_record(p_entry bigint, p_match uuid, p_result text, p_cfg jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.cup_entries;
begin
  select * into e from public.cup_entries where id = p_entry for update;
  if not found then raise exception 'cup_entry_not_found' using errcode = 'P0001'; end if;
  insert into public.cup_matches (match_id, entry_id, result) values (p_match, p_entry, p_result) on conflict do nothing;
  if not found or e.status <> 'active' then return to_jsonb(e); end if;
  update public.cup_entries set wins = wins + case when p_result = 'win' then 1 else 0 end,
         losses = losses + case when p_result in ('loss', 'leave') then 1 else 0 end
   where id = p_entry returning * into e;
  if p_result = 'leave' then
    update public.cup_entries set status = 'left', finished_at = now() where id = p_entry returning * into e;
    insert into public.cup_penalties (account_id, week) values (e.account_id, e.week + 7) on conflict do nothing;
  elsif e.wins >= 7 or e.losses >= 3 then
    update public.cup_entries set status = 'done', finished_at = now() where id = p_entry returning * into e;
  end if;
  if e.status <> 'active' then perform private.cup_finish(e, p_cfg); select * into e from public.cup_entries where id = p_entry; end if;
  return to_jsonb(e);
end; $$;

-- 주말이 끝나면 진행 중인 참가를 그 성적으로 마감·보상(크론)
create or replace function public.cup_close_week(p_before date, p_cfg jsonb) returns integer language plpgsql security definer set search_path = '' as $$
declare e public.cup_entries; n integer := 0;
begin
  for e in select * from public.cup_entries where status = 'active' and week < p_before for update skip locked loop
    update public.cup_entries set status = 'done', finished_at = now() where id = e.id returning * into e;
    perform private.cup_finish(e, p_cfg);
    n := n + 1;
  end loop;
  return n;
end; $$;

create or replace function public.cup_bonus_grant(p_account uuid, p_week date) returns boolean language sql security definer set search_path = '' as $$
  insert into public.cup_bonus (account_id, week) values (p_account, p_week) on conflict do nothing returning true;
$$;

do $$
declare t text;
begin
  foreach t in array array['rate_hits', 'cup_entries', 'cup_matches', 'cup_bonus', 'cup_penalties'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('rate_hit', 'rank_state', 'bo_suspects', 'cup_status', 'cup_enter', 'cup_record', 'cup_close_week', 'cup_bonus_grant') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
  revoke execute on function private.cup_finish(public.cup_entries, jsonb) from public, anon, authenticated;
end $$;
commit;
