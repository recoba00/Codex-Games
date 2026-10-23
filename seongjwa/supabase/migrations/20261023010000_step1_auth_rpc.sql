-- 성좌 결투 · 이식 1단계: 로그인·세션 함수 (Worker 전용)
-- 근거: 상세 09(로그인 수단, 동시 접속 1기기, 계정 삭제 14일 유예), 전작 검토 B7
-- Worker는 로그인 1회 = RPC 1회로 처리한다(왕복·DB 부하 최소화, 총괄 14장).

begin;

-- 로그인: 수단으로 계정을 찾거나 만들고, 기존 활성 세션을 끝낸 뒤 새 세션을 만든다.
create or replace function public.auth_login(
  p_provider text, p_provider_uid text, p_platform text, p_device_id text,
  p_refresh_hash text, p_ttl_seconds integer
) returns table (account_id uuid, session_id uuid, replaced_sessions integer, restored_from_deletion boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_account uuid;
  v_identity bigint;
  v_status text;
  v_replaced integer := 0;
  v_restored boolean := false;
begin
  if p_ttl_seconds not between 60 and 60 * 60 * 24 * 90 then
    raise exception 'ttl_invalid' using errcode = 'P0001';
  end if;

  select i.account_id, i.id into v_account, v_identity
    from public.identities i where i.provider = p_provider and i.provider_uid = p_provider_uid;

  if v_account is null then
    insert into public.accounts default values returning id into v_account;
    insert into public.identities (account_id, provider, provider_uid)
      values (v_account, p_provider, p_provider_uid)
      on conflict (provider, provider_uid) do nothing
      returning id into v_identity;
    if v_identity is null then  -- 동시 첫 로그인 경합: 먼저 만든 계정을 쓰고 방금 만든 빈 계정은 지운다
      delete from public.accounts where id = v_account;
      select i.account_id, i.id into v_account, v_identity
        from public.identities i where i.provider = p_provider and i.provider_uid = p_provider_uid;
    end if;
  end if;

  -- 같은 계정 동시 로그인을 직렬화
  select a.status into v_status from public.accounts a where a.id = v_account for update;
  if v_status = 'banned' then raise exception 'account_banned' using errcode = 'P0001'; end if;
  if v_status = 'deleted' then raise exception 'account_deleted' using errcode = 'P0001'; end if;
  if v_status = 'deletion_pending' then  -- 유예 기간 중 로그인 = 삭제 취소 (상세 09)
    update public.accounts set status = 'active', deletion_requested_at = null where id = v_account;
    v_restored := true;
  end if;

  update public.sessions s set revoked_at = now(), revoked_reason = 'new_login'
   where s.account_id = v_account and s.revoked_at is null;
  get diagnostics v_replaced = row_count;

  insert into public.sessions (account_id, identity_id, platform, device_id, refresh_token_hash, expires_at)
    values (v_account, v_identity, p_platform, nullif(p_device_id, ''), p_refresh_hash, now() + make_interval(secs => p_ttl_seconds))
    returning id into session_id;

  update public.identities set last_used_at = now() where id = v_identity;
  update public.accounts set last_login_at = now() where id = v_account;

  account_id := v_account;
  replaced_sessions := v_replaced;
  restored_from_deletion := v_restored;
  return next;
end; $$;

-- 갱신: 리프레시 토큰을 한 번 쓰면 새 값으로 교체(재사용 차단). 무효면 빈 결과.
create or replace function public.auth_refresh(p_old_hash text, p_new_hash text, p_ttl_seconds integer)
returns table (account_id uuid, session_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.sessions s
     set refresh_token_hash = p_new_hash, expires_at = now() + make_interval(secs => p_ttl_seconds)
    from public.accounts a
   where s.refresh_token_hash = p_old_hash and s.revoked_at is null and s.expires_at > now()
     and a.id = s.account_id and a.status = 'active'
  returning s.account_id, s.id;
end; $$;

create or replace function public.auth_logout(p_session uuid)
returns boolean language sql security definer set search_path = '' as $$
  with u as (
    update public.sessions set revoked_at = now(), revoked_reason = 'logout'
     where id = p_session and revoked_at is null returning 1)
  select exists (select 1 from u);
$$;

-- 판 시작·재접속 때 세션이 아직 유효한지(다른 기기 로그인으로 끝났는지) 확인
create or replace function public.auth_session_active(p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sessions where id = p_session and revoked_at is null and expires_at > now());
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.auth_login(text,text,text,text,text,integer)',
    'public.auth_refresh(text,text,integer)',
    'public.auth_logout(uuid)',
    'public.auth_session_active(uuid)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;
