-- 13단계: LoL식 정리(기획지시 2026-10-29) — 카드 프레임 = 현재 티어, 시즌 보상 프레임 → 홀로 연출 속성, 컵 7승 칭호만, 숙련도 단계 보상, 제재 계정 시즌 보상 제외.
-- 이 파일은 drop 문 없이 추가·재정의만 한다.
begin;
-- 홀로 연출 등급(0~4, null = 없음): 끝난 시즌의 최고 티어로 정해져 다음 시즌 동안 내 모든 카드에 적용
alter table public.accounts add column if not exists holo_grade smallint check (holo_grade between 0 and 4);
alter table public.accounts add column if not exists holo_season integer;

create or replace function public.season_payout(p_season integer, p_cfg jsonb) returns integer language plpgsql security definer set search_path = '' as $$
declare r record; g jsonb; rewards jsonb; n integer := 0; leg uuid[]; key text; title_id text; i integer := 0; s_start timestamptz; s_end timestamptz;
begin
  perform 1 from public.seasons where id = p_season and rewarded_at is null and ends_at <= now() for update;
  if not found then return 0; end if;
  select starts_at, ends_at into s_start, s_end from public.seasons where id = p_season;
  leg := array(select (jsonb_array_elements_text(coalesce(p_cfg->'legends', '[]')))::uuid);
  -- 홀로 연출(LoL식 정리): 이 시즌 결과로 갱신 — 먼저 모두 비우고 받을 사람만 채운다(영구 보유 아님)
  update public.accounts set holo_grade = null, holo_season = p_season where holo_season is distinct from p_season and holo_grade is not null;
  for r in select x.account_id, coalesce((x.state->>'best')::integer, x.tier_no) as best from public.ratings x
             join public.accounts a on a.id = x.account_id
            where x.season_id = p_season and not x.excluded and a.status <> 'banned'
              -- 시즌 중 이용 정지 이상 제재(해제되지 않은 것)를 받은 계정은 보상 전체 제외(상세 13)
              and not exists (select 1 from public.sanctions z where z.account_id = x.account_id and z.kind = 'suspend' and z.revoked_at is null
                                and z.created_at >= s_start and z.created_at < s_end) loop
    if r.account_id = any(leg) then g := p_cfg->'legend' || jsonb_build_object('key', 'legend');
    else select e into g from jsonb_array_elements(p_cfg->'groups') e where r.best between (e->>'min')::integer and (e->>'max')::integer limit 1;
    end if;
    if g is null then continue; end if;
    key := upper(g->>'key');
    rewards := jsonb_build_array(jsonb_build_object('type', 'gold', 'amount', (g->>'gold')::integer));
    -- 프레임 아이템 지급 중단 → 홀로 연출 등급(시트 `랭크보상` G열)을 다음 시즌 동안 계정 속성으로
    update public.accounts set holo_grade = case when g->>'grade' ~ '^[0-9]+$' then (g->>'grade')::smallint end, holo_season = p_season where id = r.account_id;
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

create or replace function private.cup_finish(p_entry public.cup_entries, p_cfg jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare w integer := p_entry.wins; gold integer; rewards jsonb; title text; t jsonb;
        emote boolean; give_frame boolean; mult numeric := 1; season_start date;
begin
  if p_entry.rewarded_at is not null then return; end if;
  select x into t from jsonb_array_elements(coalesce(p_cfg->'tiers', '[]'::jsonb)) x
   where w between (x->>'min')::integer and (x->>'max')::integer limit 1;
  if t is not null then
    gold := (t->>'gold')::integer; emote := coalesce((t->>'emote')::boolean, false); give_frame := coalesce((t->>'frame')::boolean, false);
  else
    gold := case when w >= 5 then coalesce((p_cfg->>'gold_5')::integer, 3000) when w >= 3 then coalesce((p_cfg->>'gold_3')::integer, 2000) else coalesce((p_cfg->>'gold_0')::integer, 1000) end;
    emote := w >= 5; give_frame := w >= 7;
  end if;
  select (s.starts_at at time zone 'Asia/Seoul')::date into season_start from public.seasons s where s.id = p_entry.season_id;
  if season_start is not null and p_cfg ? 'special_week'
     and ((p_entry.week - season_start) / 7) + 1 = (p_cfg->>'special_week')::integer then
    mult := coalesce((p_cfg->>'special_mult')::numeric, 1);
  end if;
  gold := round(gold * mult)::integer;
  rewards := jsonb_build_array(jsonb_build_object('type', 'gold', 'amount', gold));
  if emote and p_cfg->>'emote_item' is not null and exists (select 1 from public.catalog_items where id = p_cfg->>'emote_item') then
    rewards := rewards || jsonb_build_object('type', 'item', 'id', p_cfg->>'emote_item');
  end if;
  if give_frame then  -- 시트 `챔피언스컵` F열 `지급` = 칭호만(프레임 지급 중단, LoL식 정리)
    title := 'TITLE_CUP_' || to_char(p_entry.week, 'YYYYMMDD');
    insert into public.catalog_items (id, kind, name) values (title, 'title', '컵 우승자 (' || to_char(p_entry.week, 'MM/DD') || ' 주)') on conflict (id) do nothing;
    rewards := rewards || jsonb_build_object('type', 'item', 'id', title);
  end if;
  perform public.mail_send(p_entry.account_id, '챔피언스 컵 ' || w || '승 보상' || case when mult <> 1 then ' (특별 주간)' else '' end,
    '주말 챔피언스 컵 결과 보상입니다.', rewards, 'cup:' || p_entry.id, 30);
  update public.cup_entries set rewarded_at = now() where id = p_entry.id;
end; $$;

create or replace function public.mastery_add(p_match uuid, p_rows jsonb, p_early boolean, p_cfg jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; pts integer; why text; pair boolean := false; a uuid; b uuid; out jsonb := '[]'; ms public.mastery; stage integer; tid text; got jsonb;
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
        wins = m.wins + excluded.wins, updated_at = now()
      returning * into ms;
      -- 단계 보상(LoL식 정리): emote_stage 처음 도달 → 공용 숙련도 감정표현, title_stage → '<캐릭터명> 장인' 칭호. 이미 있으면 그대로
      stage := case when ms.points >= coalesce((p_cfg->>'t4')::integer, 400)
                     and (coalesce((p_cfg->>'t4_winrate')::numeric, 0) = 0 or (ms.games > 0 and ms.wins::numeric / ms.games >= (p_cfg->>'t4_winrate')::numeric)) then 4
                    when ms.points >= coalesce((p_cfg->>'t3')::integer, 150) then 3 when ms.points >= coalesce((p_cfg->>'t2')::integer, 40) then 2 else 1 end;
      got := '[]';
      if stage >= coalesce((p_cfg->>'emote_stage')::integer, 3) and p_cfg->>'emote_item' is not null
         and exists (select 1 from public.catalog_items where id = p_cfg->>'emote_item') then
        insert into public.inventory (account_id, item_id, source, ref) values (ms.account_id, p_cfg->>'emote_item', 'reward', 'mastery:' || ms.character_id)
        on conflict do nothing;
        if found then got := got || to_jsonb(p_cfg->>'emote_item'); end if;
      end if;
      if stage >= coalesce((p_cfg->>'title_stage')::integer, 4) then
        tid := 'TITLE_MASTERY_' || ms.character_id;
        insert into public.catalog_items (id, kind, name, character_id) values (tid, 'title', coalesce(nullif(r->>'name', ''), ms.character_id) || ' 장인', ms.character_id) on conflict (id) do nothing;
        insert into public.inventory (account_id, item_id, source, ref) values (ms.account_id, tid, 'reward', 'mastery:' || ms.character_id) on conflict do nothing;
        if found then got := got || to_jsonb(tid); end if;
      end if;
    end if;
    out := out || jsonb_build_object('acc', r->>'acc', 'char', r->>'char', 'points', pts, 'reason', why, 'stage', stage, 'unlocked', coalesce(got, '[]'));
    stage := null; got := null;
  end loop;
  return out;
end; $$;

-- 판·프로필 표시용: 현재 시즌 티어(없으면 지난 시즌 기록으로 시작 티어 계산), 마스터 중 순위(레전드 판정), 홀로 등급
create or replace function public.badges_get(p_accounts uuid[], p_season integer, p_master_tier integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  with masters as (select r.account_id, row_number() over (order by r.rp desc) rk from public.ratings r
                    where r.season_id = p_season and r.tier_no >= p_master_tier and not r.excluded)
  select coalesce(jsonb_object_agg(a.id, jsonb_build_object(
    'cur', (select jsonb_build_object('tier_no', r.tier_no, 'rp', r.rp, 'state', r.state) from public.ratings r where r.account_id = a.id and r.season_id = p_season),
    'prev', (select jsonb_build_object('tier_no', r.tier_no, 'state', r.state) from public.ratings r where r.account_id = a.id and r.season_id < p_season order by r.season_id desc limit 1),
    'masterRank', (select m.rk from masters m where m.account_id = a.id),
    'masters', (select count(*) from masters),
    'holo', a.holo_grade)), '{}')
    from public.accounts a where a.id = any(p_accounts);
$$;

-- 프로필: 이름·홀로 등급·시즌별 최고 티어 기록(지난 시즌 포함)
create or replace function public.profile_get(p_account uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'name', a.display_name, 'holo', a.holo_grade, 'holoSeason', a.holo_season, 'equipped', a.equipped,
    'seasons', coalesce((select jsonb_agg(jsonb_build_object('season', r.season_id, 'best', coalesce((r.state->>'best')::integer, r.tier_no), 'tier', r.tier_no, 'rp', r.rp, 'excluded', r.excluded)
                                 order by r.season_id desc) from public.ratings r where r.account_id = a.id), '[]'))
    from public.accounts a where a.id = p_account and a.status <> 'deleted';
$$;

-- 테스트 데이터 정리: 프레임 상품 판매 폐지(장착·보유 0건 확인 후 숨김)
update public.shop_offers set enabled = false where item_id in (select id from public.catalog_items where kind = 'frame');
update public.catalog_items set enabled = false where kind = 'frame';
-- 판매 규칙에 어긋나는 테스트 상품 가격 정리: 캐릭터·감정표현 = 골드 전용, 스킨·홀로 = 현금 전용
update public.shop_offers set price_krw = null where price_gold is not null and price_krw is not null
   and item_id in (select id from public.catalog_items where kind in ('character', 'emote'));
update public.shop_offers set price_gold = null where price_gold is not null and price_krw is not null
   and item_id in (select id from public.catalog_items where kind in ('skin', 'skin_premium', 'skin_limited', 'holo'));

revoke execute on function public.badges_get(uuid[], integer, integer) from public, anon, authenticated;
grant execute on function public.badges_get(uuid[], integer, integer) to service_role;
revoke execute on function public.profile_get(uuid) from public, anon, authenticated;
grant execute on function public.profile_get(uuid) to service_role;
commit;
