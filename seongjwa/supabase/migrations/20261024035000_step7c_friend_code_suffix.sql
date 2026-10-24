-- 7c단계: 친구 코드는 뒤 4자리(겹치면 6자리)만 저장한다. 접두어(ASTRA-)는 서버가 표시할 때 붙인다(기획답변 17차 Q4, 상세 05).
update public.accounts set friend_code = substr(friend_code, 7) where friend_code like 'ASTRA-%';

create or replace function public.friend_code_get(p_account uuid) returns text language plpgsql security definer set search_path = '' as $$
declare c text; i integer := 0;
begin
  select friend_code into c from public.accounts where id = p_account;
  while c is null loop
    i := i + 1;
    c := (select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::integer, 1), '') from generate_series(1, case when i < 20 then 4 else 6 end));
    begin
      update public.accounts set friend_code = c where id = p_account and friend_code is null;
    exception when unique_violation then c := null;
    end;
    if c is not null then select friend_code into c from public.accounts where id = p_account; end if;
  end loop;
  return c;
end; $$;

alter table public.accounts add constraint accounts_friend_code_format check (friend_code ~ '^([2-9A-HJKMNP-Z]{4}|[2-9A-HJKMNP-Z]{6})$') not valid;
alter table public.accounts validate constraint accounts_friend_code_format;
