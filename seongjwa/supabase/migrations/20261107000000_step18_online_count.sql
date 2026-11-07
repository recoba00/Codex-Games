-- 로비 "실시간 접속자 수"(사용자 요청 2026-11-07): 최근 2분 안에 접속 신호가 있는 계정 수(친구 상태와 같은 기준, 상태 숨기기 계정도 숫자에는 포함)
create or replace function public.online_count() returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.accounts where last_seen_at > now() - interval '2 minutes';
$$;
revoke execute on function public.online_count() from public, anon, authenticated;
grant execute on function public.online_count() to service_role;
