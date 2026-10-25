-- 10d단계: 컵 보상을 시트 `챔피언스컵` 구간표로, 시즌 3주차 특별 주간은 골드만 cup_special_mult배(기획답변 23차, 상세 08·11)
-- p_cfg: { tiers: [{min,max,gold,emote,frame}], emote_item, special_week, special_mult }. tiers가 없으면 예전 키(gold_0/3/5) → 기본값
begin;
create or replace function private.cup_finish(p_entry public.cup_entries, p_cfg jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare w integer := p_entry.wins; gold integer; rewards jsonb; frame text := 'FRAME_CUP'; title text; t jsonb;
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
  if give_frame then
    insert into public.catalog_items (id, kind, name, grade) values (frame, 'frame', '챔피언스 컵 프레임', 4) on conflict (id) do nothing;
    title := 'TITLE_CUP_' || to_char(p_entry.week, 'YYYYMMDD');
    insert into public.catalog_items (id, kind, name) values (title, 'title', '컵 우승자 (' || to_char(p_entry.week, 'MM/DD') || ' 주)') on conflict (id) do nothing;
    rewards := rewards || jsonb_build_object('type', 'item', 'id', frame) || jsonb_build_object('type', 'item', 'id', title);
  end if;
  perform public.mail_send(p_entry.account_id, '챔피언스 컵 ' || w || '승 보상' || case when mult <> 1 then ' (특별 주간)' else '' end,
    '주말 챔피언스 컵 결과 보상입니다.', rewards, 'cup:' || p_entry.id, 30);
  update public.cup_entries set rewarded_at = now() where id = p_entry.id;
end; $$;
revoke execute on function private.cup_finish(public.cup_entries, jsonb) from public, anon, authenticated;
commit;
