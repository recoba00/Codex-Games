-- 캐릭터 보유 조회 실패 감시(기획답변 95차): 최근 N시간 이벤트 수. BO 어뷰징 의심 화면에서 char_check_failed 하루 5회 초과를 표시
create or replace function public.event_count(p_name text, p_hours integer) returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.events where name = p_name and at > now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 720));
$$;
revoke execute on function public.event_count(text, integer) from public, anon, authenticated;
grant execute on function public.event_count(text, integer) to service_role;
