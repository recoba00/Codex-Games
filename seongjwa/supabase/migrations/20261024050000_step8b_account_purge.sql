-- 8b단계: 삭제 요청 후 유예 기간이 지난 계정 정리(상세 09). 크론이 부른다.
-- 행을 지우지 않고 익명화한다: 판 기록·상대 쪽 기록이 깨지지 않고, 로그인 수단 ID를 바꿔 같은 Steam 계정으로 들어오면 새 계정이 된다.
-- 결제 기록은 payment_archive에 분리 보관(법정 보관 기간). 개인정보(닉네임·로그인 수단 ID·기기 ID)와 진행도(골드·보유·랭크·미션)는 없앤다.
begin;

create or replace function public.account_purge_due(p_days integer, p_retain_years integer, p_limit integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare acc uuid; n integer := 0; orders_n integer;
begin
  for acc in select id from public.accounts
              where status = 'deletion_pending' and deletion_requested_at <= now() - make_interval(days => greatest(coalesce(p_days, 14), 1))
              order by deletion_requested_at limit greatest(coalesce(p_limit, 50), 1) for update skip locked loop
    insert into public.payment_archive (order_id, account_ref, data, retain_until)
    select o.id, o.account_id, to_jsonb(o), (o.created_at + make_interval(years => greatest(coalesce(p_retain_years, 5), 1)))::date
      from public.orders o where o.account_id = acc and o.status <> 'init'
    on conflict (order_id) do nothing;
    get diagnostics orders_n = row_count;
    update public.identities set provider_uid = 'deleted:' || id::text, last_used_at = null where account_id = acc;
    update public.sessions set revoked_at = coalesce(revoked_at, now()), revoked_reason = coalesce(revoked_reason, 'deleted'), device_id = '' where account_id = acc;
    update public.accounts set status = 'deleted', deletion_requested_at = null, display_name = '탈퇴한 유저', friend_code = null, equipped = '{}',
           presence_room = null, presence_hidden = true, last_seen_at = null, current_room = null, updated_at = now()
     where id = acc;
    update public.wallets set gold = 0 where account_id = acc;
    update public.econ_state set state = '{}' where account_id = acc;
    update public.inventory set revoked_at = coalesce(revoked_at, now()) where account_id = acc;
    update public.mail set claimed_at = coalesce(claimed_at, now()) where account_id = acc;
    update public.ratings set excluded = true where account_id = acc;
    update public.friend_links set removed_at = coalesce(removed_at, now()) where a = acc or b = acc;
    update public.friend_requests set status = 'canceled', decided_at = now() where (from_acc = acc or to_acc = acc) and status = 'pending';
    update public.blocks set removed_at = coalesce(removed_at, now()) where account = acc or blocked = acc;
    update public.events set account_id = null where account_id = acc;
    insert into public.audit_log (target, action, detail) values ('유저 ' || acc, '계정 삭제(유예 기간 경과, 익명화)', jsonb_build_object('archivedOrders', orders_n));
    n := n + 1;
  end loop;
  return n;
end; $$;

revoke execute on function public.account_purge_due(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.account_purge_due(integer, integer, integer) to service_role;
commit;
