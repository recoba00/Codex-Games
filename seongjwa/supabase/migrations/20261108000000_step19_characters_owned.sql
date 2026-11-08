-- 19단계: 캐릭터 보유 1차(기획지시 2026-11-07 캐릭터입수·가격, 기획답변 88-89차, 총괄 11장)
-- - 캐릭터 = 카탈로그 CHAR_xx(kind character). 보유 = 인벤토리(회수 안 됨). 골드 구매는 기존 상점 경로(shop_buy_gold)로 지급
-- - 고정 6명은 ref 'base_characters'로 지급. 지금 계정 전원 지급(88-89차 승인, 튜토리얼 완료로 간주). 이후 계정은 첫 조회 때 지급(튜토리얼 생기면 완료 시점으로 옮김)
-- - 주간 무료 순환은 bo_config.char_rotation(시작 주차·순환·주차별 지정). 계산은 서버(src/characters.mjs)
-- - 최근 전적(89차 3): 모든 모드, void 제외
begin;

insert into public.catalog_items (id, kind, character_id, name) values
  ('CHAR_AU', 'character', 'AU', '아우렐'), ('CHAR_PY', 'character', 'PY', '피로스'), ('CHAR_IG', 'character', 'IG', '이그니스'),
  ('CHAR_SE', 'character', 'SE', '셀레네'), ('CHAR_MO', 'character', 'MO', '모르테'), ('CHAR_TE', 'character', 'TE', '테티스'),
  ('CHAR_UM', 'character', 'UM', '움브라'), ('CHAR_SI', 'character', 'SI', '실렌티아'), ('CHAR_SL', 'character', 'SL', '실피')
on conflict (id) do nothing;

insert into public.inventory (account_id, item_id, source, ref)
  select a.id, 'CHAR_' || c, 'reward', 'base_characters'
    from public.accounts a cross join unnest(array['AU', 'PY', 'SE', 'MO', 'UM', 'SI']) c
on conflict do nothing;

insert into public.bo_config (key, value) values
  ('char_rotation', '{"start_week":"2026-11-02","cycle":[["IG","TE"],["TE","SL"],["SL","IG"]],"overrides":{}}')
on conflict (key) do nothing;

-- 계정별 보유 캐릭터 { "계정": ["AU", ...] }. p_base가 있으면 아직 고정 지급(ref base_characters)을 받지 않은 계정에 먼저 지급
create or replace function public.characters_owned(p_accounts uuid[], p_base text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(array_length(p_base, 1), 0) > 0 then
    insert into public.catalog_items (id, kind, character_id, name)
      select 'CHAR_' || c, 'character', c, c from unnest(p_base) c where c ~ '^[A-Z]{2,3}$'
    on conflict (id) do nothing;
    insert into public.inventory (account_id, item_id, source, ref)
      select a.id, 'CHAR_' || c, 'reward', 'base_characters'
        from public.accounts a cross join unnest(p_base) c
       where a.id = any(p_accounts) and c ~ '^[A-Z]{2,3}$'
         and not exists (select 1 from public.inventory i where i.account_id = a.id and i.ref = 'base_characters')
    on conflict do nothing;
  end if;
  return (select coalesce(jsonb_object_agg(a::text, coalesce(
            (select jsonb_agg(ci.character_id order by ci.character_id)
               from public.inventory i join public.catalog_items ci on ci.id = i.item_id
              where i.account_id = a and ci.kind = 'character' and i.revoked_at is null), '[]'::jsonb)), '{}'::jsonb)
            from unnest(p_accounts) a);
end; $$;

-- 최근 전적: 승 W / 패 L / 무 D, 모드, 종료 사유, 내 캐릭터·상대 캐릭터. 항복·이탈은 결과대로 패
create or replace function public.recent_results(p_account uuid, p_limit integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('result', x.r, 'mode', x.mode, 'reason', x.finish_reason, 'pick', x.pick, 'opp', x.opp, 'at', x.ended_at)
                            order by x.ended_at desc), '[]'::jsonb)
    from (select m.mode, m.finish_reason, m.ended_at,
                 case when m.outcome = 'draw' then 'D' when (m.outcome = 'a') = coalesce(m.player_a = p_account, false) then 'W' else 'L' end r,
                 m.summary -> 'picks' ->> (case when m.player_a = p_account then 0 else 1 end) pick,
                 m.summary -> 'picks' ->> (case when m.player_a = p_account then 1 else 0 end) opp
            from public.match_results m
           where (m.player_a = p_account or m.player_b = p_account) and m.outcome <> 'void'
           order by m.ended_at desc
           limit least(greatest(coalesce(p_limit, 10), 1), 20)) x;
$$;

revoke execute on function public.characters_owned(uuid[], text[]) from public, anon, authenticated;
grant execute on function public.characters_owned(uuid[], text[]) to service_role;
revoke execute on function public.recent_results(uuid, integer) from public, anon, authenticated;
grant execute on function public.recent_results(uuid, integer) to service_role;

commit;
