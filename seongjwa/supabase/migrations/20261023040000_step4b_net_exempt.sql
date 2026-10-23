-- 성좌 결투 · 4단계 보강: 네트워크 면책 표시(기획답변 3차 A3, 총괄 10장)
-- rank_state의 최근 기록에 면책 여부를 함께 돌려준다(하루 첫 1회 판정용).
begin;

create or replace function public.rank_state(p_account uuid, p_season integer, p_window_days integer default 7)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'current', (select to_jsonb(r) from public.ratings r where r.account_id = p_account and r.season_id = p_season),
    'previous', (select to_jsonb(r) from public.ratings r where r.account_id = p_account and r.season_id < p_season order by r.season_id desc limit 1),
    'mmr', coalesce((select m.mmr from public.mmr m where m.account_id = p_account), 800),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.created_at, 'mode', e.mode,
                   'exempt', coalesce((e.detail->>'netExempt')::boolean, false)) order by e.created_at)
                 from public.rank_events e where e.account_id = p_account and e.created_at > now() - make_interval(days => p_window_days)), '[]')
  );
$$;
revoke execute on function public.rank_state(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.rank_state(uuid,integer,integer) to service_role;

commit;
