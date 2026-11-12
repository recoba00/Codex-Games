-- 21단계: 언어를 계정에 저장(기획지시 2026-11-12 모바일시안반영 결정 7). 값이 없으면(null) 클라이언트가 접속 지역(GET /v1/region)으로 정해 저장한다
alter table public.accounts add column if not exists lang text check (lang in ('ko', 'en'));

-- p_lang이 null이면 조회만, 있으면 저장 후 반환
create or replace function public.account_lang(p_account uuid, p_lang text) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if p_lang is not null then
    if p_lang not in ('ko', 'en') then raise exception 'lang_invalid' using errcode = 'P0001'; end if;
    update public.accounts set lang = p_lang where id = p_account;
  end if;
  select lang into v from public.accounts where id = p_account;
  return v;
end; $$;
revoke execute on function public.account_lang(uuid, text) from public, anon, authenticated;
grant execute on function public.account_lang(uuid, text) to service_role;
