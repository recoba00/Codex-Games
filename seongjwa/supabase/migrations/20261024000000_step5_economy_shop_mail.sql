-- 5단계: 경제(골드)·미션·출석·우편·상점·주문·인벤토리
-- 근거: 상세 05(미션·출석·우편·닉네임), 상세 06(골드 1종, 상한 999,999, 판매 안 함), 상세 07(상점·구매 흐름·환불), 시트 `경제`·`랭크보상`.
-- 원칙: 골드 변화는 모두 장부(gold_ledger)에 남기고 (계정, ref)가 같으면 한 번만 반영(재시도 안전).
--       미션·출석 상태는 econ_state 한 행(jsonb)에 두고 버전으로 동시 수정을 막는다(rank_commit과 같은 방식).
begin;

alter table public.accounts add column if not exists name_changes integer not null default 0;
alter table public.accounts add column if not exists equipped jsonb not null default '{}';

create table public.wallets (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  gold integer not null default 0 check (gold between 0 and 999999),
  updated_at timestamptz not null default now()
);

create table public.gold_ledger (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  delta integer not null,
  balance_after integer not null,
  reason text not null,          -- match_win, first_win, mission, attendance, mail, shop, name_change, admin …
  ref text not null,             -- 멱등 키: match:<판ID>, att:<날짜>, mis:<종류>:<기간>:<ID>, mail:<우편ID>, buy:<요청ID> …
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (account_id, ref)
);
create index gold_ledger_account on public.gold_ledger (account_id, created_at desc);

create table public.econ_state (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  state jsonb not null default '{}',
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

-- 외형·캐릭터 카탈로그. 가격·판매 기간은 shop_offers(백오피스 예약)
create table public.catalog_items (
  id text primary key check (id ~ '^[A-Z0-9_]{2,40}$'),
  kind text not null check (kind in ('skin', 'skin_premium', 'skin_limited', 'holo', 'cardback', 'frame', 'emote', 'title', 'character', 'bundle')),
  character_id text,             -- 스킨·홀로·캐릭터 상품의 대상 캐릭터
  name text not null,
  grade smallint not null default 1,          -- 연출 등급(상세 10)
  default_owned boolean not null default false,  -- 기본 감정표현 4종 등 모두가 가진 것
  bundle_items text[] not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.shop_offers (
  id text primary key check (id ~ '^[A-Z0-9_]{2,40}$'),
  item_id text not null references public.catalog_items(id),
  tab text not null check (tab in ('featured', 'skin', 'cosmetic', 'bundle', 'character')),
  price_gold integer check (price_gold > 0),
  price_krw integer check (price_krw > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  slot smallint not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check (price_gold is not null or price_krw is not null),
  check (ends_at is null or ends_at > starts_at)
);

create table public.inventory (
  account_id uuid not null references public.accounts(id) on delete cascade,
  item_id text not null references public.catalog_items(id),
  source text not null,          -- gold, cash, mail, reward, admin
  ref text,
  acquired_at timestamptz not null default now(),
  revoked_at timestamptz,        -- 환불 회수(상세 06·07)
  primary key (account_id, item_id)
);

-- 현금 주문. id는 Steam MicroTxn orderid(uint64)로 그대로 쓴다
create sequence public.order_seq start 100000;
create table public.orders (
  id bigint primary key default nextval('public.order_seq'),
  account_id uuid not null references public.accounts(id) on delete cascade,
  offer_id text not null references public.shop_offers(id),
  item_id text not null references public.catalog_items(id),
  provider text not null check (provider in ('steam', 'dev')),
  status text not null default 'init' check (status in ('init', 'approved', 'delivered', 'failed', 'canceled', 'refunded')),
  amount integer not null,
  currency text not null default 'KRW',
  provider_txn text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index orders_pending on public.orders (account_id, status) where status in ('init', 'approved');

create table public.mail (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null,
  body text not null default '',
  rewards jsonb not null default '[]',   -- [{"type":"gold","amount":100}, {"type":"item","id":"EMOTE_X"}]
  ref text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  unique (account_id, ref)
);
create index mail_account on public.mail (account_id, created_at desc);

-- 기본 감정표현 4종(상세 05: 인사·칭찬·아쉬움·생각 중, 무료)
insert into public.catalog_items (id, kind, name, default_owned) values
  ('EMOTE_HELLO', 'emote', '인사', true), ('EMOTE_NICE', 'emote', '칭찬', true),
  ('EMOTE_OOPS', 'emote', '아쉬움', true), ('EMOTE_THINK', 'emote', '생각 중', true);

-- ---------- 내부: 골드 반영(장부 + 잔액, 상한 999,999) ----------
create or replace function private.gold_apply(p_account uuid, p_delta integer, p_reason text, p_ref text, p_detail jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare cur integer; nxt integer;
begin
  insert into public.wallets (account_id) values (p_account) on conflict do nothing;
  select gold into cur from public.wallets where account_id = p_account for update;
  if cur + p_delta < 0 then raise exception 'gold_short' using errcode = 'P0001'; end if;
  nxt := least(999999, cur + p_delta);
  insert into public.gold_ledger (account_id, delta, balance_after, reason, ref, detail)
  values (p_account, nxt - cur, nxt, p_reason, p_ref,
          coalesce(p_detail, '{}') || case when nxt - cur <> p_delta then jsonb_build_object('capped', p_delta - (nxt - cur)) else '{}' end);
  update public.wallets set gold = nxt, updated_at = now() where account_id = p_account;
  return nxt;
end; $$;

create or replace function private.item_grant(p_account uuid, p_item text, p_source text, p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
declare b text[];
begin
  select bundle_items into b from public.catalog_items where id = p_item;
  if not found then raise exception 'item_invalid' using errcode = 'P0001'; end if;
  insert into public.inventory (account_id, item_id, source, ref) values (p_account, p_item, p_source, p_ref)
  on conflict (account_id, item_id) do update set revoked_at = null, source = excluded.source, ref = excluded.ref, acquired_at = now()
    where public.inventory.revoked_at is not null;
  if coalesce(array_length(b, 1), 0) > 0 then
    insert into public.inventory (account_id, item_id, source, ref)
    select p_account, x, p_source, p_ref from unnest(b) x
    on conflict (account_id, item_id) do update set revoked_at = null where public.inventory.revoked_at is not null;
  end if;
end; $$;

create or replace function private.owns(p_account uuid, p_item text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.inventory where account_id = p_account and item_id = p_item and revoked_at is null)
      or exists (select 1 from public.catalog_items where id = p_item and default_owned);
$$;

-- ---------- 경제 상태 ----------
-- 지갑·미션 상태·현재 시즌 티어·닉네임 변경 횟수·받지 않은 우편 수
create or replace function public.econ_get(p_account uuid, p_season integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'gold', coalesce((select gold from public.wallets where account_id = p_account), 0),
    'state', coalesce((select state from public.econ_state where account_id = p_account), '{}'),
    'version', coalesce((select version from public.econ_state where account_id = p_account), 0),
    'tier', (select tier_no from public.ratings where account_id = p_account and season_id = p_season),
    'name', (select display_name from public.accounts where id = p_account),
    'name_changes', (select name_changes from public.accounts where id = p_account),
    'mail_unread', (select count(*) from public.mail where account_id = p_account and claimed_at is null and expires_at > now()),
    'pending_orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'provider', o.provider, 'status', o.status, 'created_at', o.created_at))
                                from public.orders o where o.account_id = p_account and o.status in ('init', 'approved')), '[]')
  );
$$;

-- 상태 저장 + 골드 반영을 한 번에. ref가 이미 있으면 'duplicate'(아무것도 안 함), 버전이 다르면 econ_conflict
create or replace function public.econ_commit(
  p_account uuid, p_ref text, p_expected_version integer, p_state jsonb,
  p_gold_delta integer, p_reason text, p_detail jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v integer; g integer;
begin
  if exists (select 1 from public.gold_ledger where account_id = p_account and ref = p_ref) then
    return jsonb_build_object('status', 'duplicate');
  end if;
  select version into v from public.econ_state where account_id = p_account for update;
  if coalesce(v, 0) <> p_expected_version then raise exception 'econ_conflict' using errcode = 'P0001'; end if;
  if v is null then
    insert into public.econ_state (account_id, state, version) values (p_account, p_state, 1);
  else
    update public.econ_state set state = p_state, version = v + 1, updated_at = now() where account_id = p_account;
  end if;
  g := private.gold_apply(p_account, p_gold_delta, p_reason, p_ref, p_detail);
  return jsonb_build_object('status', 'ok', 'gold', g);
end; $$;

-- ---------- 닉네임 (상세 05: 2~12자, 첫 변경 무료, 이후 골드) ----------
create or replace function public.profile_rename(p_account uuid, p_name text, p_cost integer, p_ref text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n integer; cost integer; g integer;
begin
  if char_length(p_name) not between 2 and 12 then raise exception 'name_invalid' using errcode = 'P0001'; end if;
  select name_changes into n from public.accounts where id = p_account for update;
  cost := case when n = 0 then 0 else p_cost end;
  g := private.gold_apply(p_account, -cost, 'name_change', p_ref, jsonb_build_object('name', p_name));
  update public.accounts set display_name = p_name, name_changes = n + 1, updated_at = now() where id = p_account;
  return jsonb_build_object('gold', g, 'cost', cost, 'name', p_name);
end; $$;

create or replace function public.profile_equip(p_account uuid, p_equipped jsonb, p_items text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare x text;
begin
  foreach x in array coalesce(p_items, '{}') loop
    if not private.owns(p_account, x) then raise exception 'item_not_owned' using errcode = 'P0001'; end if;
  end loop;
  update public.accounts set equipped = p_equipped, updated_at = now() where id = p_account;
  return p_equipped;
end; $$;

-- ---------- 인벤토리·상점 ----------
create or replace function public.inventory_list(p_account uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'character', c.character_id, 'name', c.name, 'grade', c.grade, 'source', coalesce(i.source, 'default')) order by c.kind, c.id)
       from public.catalog_items c left join public.inventory i on i.item_id = c.id and i.account_id = p_account and i.revoked_at is null
       where c.default_owned or i.item_id is not null), '[]'),
    'equipped', (select equipped from public.accounts where id = p_account));
$$;

create or replace function public.shop_list(p_account uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'offer', o.id, 'tab', o.tab, 'slot', o.slot, 'item', c.id, 'kind', c.kind, 'character', c.character_id, 'name', c.name, 'grade', c.grade,
      'priceGold', o.price_gold, 'priceKrw', o.price_krw, 'endsAt', o.ends_at,
      'owned', private.owns(p_account, c.id)) order by o.tab, o.slot, o.id), '[]')
  from public.shop_offers o join public.catalog_items c on c.id = o.item_id
  where o.enabled and c.enabled and o.starts_at <= now() and (o.ends_at is null or o.ends_at > now());
$$;

create or replace function private.offer_live(p_offer text)
returns public.shop_offers language plpgsql stable security definer set search_path = '' as $$
declare o public.shop_offers;
begin
  select so.* into o from public.shop_offers so join public.catalog_items c on c.id = so.item_id
   where so.id = p_offer and so.enabled and c.enabled and so.starts_at <= now() and (so.ends_at is null or so.ends_at > now());
  if not found then raise exception 'offer_unavailable' using errcode = 'P0001'; end if;
  return o;
end; $$;

-- 골드 구매(상세 07 구매 흐름 2: 확인 팝업 → 즉시 지급). p_price는 화면에 보인 가격(바뀌었으면 price_changed)
create or replace function public.shop_buy_gold(p_account uuid, p_offer text, p_price integer, p_ref text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.shop_offers; g integer;
begin
  if exists (select 1 from public.gold_ledger where account_id = p_account and ref = p_ref) then
    return jsonb_build_object('status', 'duplicate', 'gold', (select gold from public.wallets where account_id = p_account));
  end if;
  o := private.offer_live(p_offer);
  if o.price_gold is null then raise exception 'gold_not_allowed' using errcode = 'P0001'; end if;
  if o.price_gold <> p_price then raise exception 'price_changed' using errcode = 'P0001'; end if;
  if private.owns(p_account, o.item_id) then raise exception 'already_owned' using errcode = 'P0001'; end if;
  g := private.gold_apply(p_account, -o.price_gold, 'shop', p_ref, jsonb_build_object('offer', o.id, 'item', o.item_id));
  perform private.item_grant(p_account, o.item_id, 'gold', p_ref);
  return jsonb_build_object('status', 'ok', 'gold', g, 'item', o.item_id);
end; $$;

-- 현금 주문 생성: Steam이면 SteamID를 같이 돌려준다(InitTxn에 필요)
create or replace function public.order_create(p_account uuid, p_offer text, p_provider text, p_price integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.shop_offers; oid bigint; sid text;
begin
  o := private.offer_live(p_offer);
  if o.price_krw is null then raise exception 'cash_not_allowed' using errcode = 'P0001'; end if;
  if o.price_krw <> p_price then raise exception 'price_changed' using errcode = 'P0001'; end if;
  if private.owns(p_account, o.item_id) then raise exception 'already_owned' using errcode = 'P0001'; end if;
  if (select count(*) from public.orders where account_id = p_account and status = 'init' and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'too_many_orders' using errcode = 'P0001';
  end if;
  insert into public.orders (account_id, offer_id, item_id, provider, amount) values (p_account, o.id, o.item_id, p_provider, o.price_krw)
  returning id into oid;
  select provider_uid into sid from public.identities where account_id = p_account and provider = 'steam' limit 1;
  return jsonb_build_object('order', oid, 'item', o.item_id, 'amount', o.price_krw, 'currency', 'KRW', 'steamId', sid,
                            'name', (select name from public.catalog_items where id = o.item_id));
end; $$;

create or replace function public.account_steam_id(p_account uuid)
returns text language sql stable security definer set search_path = '' as $$
  select provider_uid from public.identities where account_id = p_account and provider = 'steam' limit 1;
$$;

create or replace function public.order_get(p_account uuid, p_order bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(o) from public.orders o where o.id = p_order and (p_account is null or o.account_id = p_account);
$$;

create or replace function public.order_mark(p_order bigint, p_status text, p_txn text, p_detail jsonb)
returns void language sql security definer set search_path = '' as $$
  update public.orders set status = p_status, provider_txn = coalesce(p_txn, provider_txn), detail = detail || coalesce(p_detail, '{}'), updated_at = now()
   where id = p_order and status in ('init', 'approved');
$$;

-- 지급(멱등). p_via_mail=true면 우편으로(결제는 됐는데 지급이 안 된 경우 다음 로그인 때, 상세 07 흐름 4)
create or replace function public.order_deliver(p_order bigint, p_txn text, p_via_mail boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order_invalid' using errcode = 'P0001'; end if;
  if o.status = 'delivered' then return jsonb_build_object('status', 'duplicate', 'item', o.item_id); end if;
  if o.status not in ('init', 'approved') then raise exception 'order_closed' using errcode = 'P0001'; end if;
  if p_via_mail then
    insert into public.mail (account_id, title, body, rewards, ref, expires_at)
    values (o.account_id, '구매 상품 지급', '결제가 확인된 상품을 보내 드립니다.', jsonb_build_array(jsonb_build_object('type', 'item', 'id', o.item_id)),
            'order:' || o.id, now() + interval '30 days')
    on conflict (account_id, ref) do nothing;
  else
    perform private.item_grant(o.account_id, o.item_id, 'cash', 'order:' || o.id);
  end if;
  update public.orders set status = 'delivered', provider_txn = coalesce(p_txn, provider_txn), delivered_at = now(), updated_at = now(),
         detail = detail || jsonb_build_object('via_mail', p_via_mail) where id = p_order;
  return jsonb_build_object('status', 'ok', 'item', o.item_id, 'viaMail', p_via_mail);
end; $$;

-- 환불: 상품 회수, 골드는 건드리지 않음(상세 06)
create or replace function public.order_refund(p_order bigint, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order_invalid' using errcode = 'P0001'; end if;
  if o.status = 'refunded' then return jsonb_build_object('status', 'duplicate'); end if;
  update public.inventory set revoked_at = now() where account_id = o.account_id and revoked_at is null
     and (item_id = o.item_id or item_id = any (select unnest(bundle_items) from public.catalog_items where id = o.item_id));
  update public.orders set status = 'refunded', updated_at = now(), detail = detail || jsonb_build_object('refund_note', p_note) where id = p_order;
  return jsonb_build_object('status', 'ok');
end; $$;

-- ---------- 우편 (상세 05: 보관 30일, 모두 받기) ----------
create or replace function public.mail_send(p_account uuid, p_title text, p_body text, p_rewards jsonb, p_ref text, p_days integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  insert into public.mail (account_id, title, body, rewards, ref, expires_at)
  values (p_account, p_title, coalesce(p_body, ''), coalesce(p_rewards, '[]'), p_ref, now() + make_interval(days => coalesce(p_days, 30)))
  on conflict (account_id, ref) do nothing returning id into mid;
  return mid;
end; $$;

create or replace function public.mail_list(p_account uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'body', m.body, 'rewards', m.rewards,
           'createdAt', m.created_at, 'expiresAt', m.expires_at, 'claimed', m.claimed_at is not null) order by m.created_at desc), '[]')
  from public.mail m where m.account_id = p_account and m.expires_at > now() - interval '1 day' and m.created_at > now() - interval '30 days';
$$;

-- 받기: p_ids가 null이면 모두 받기. 이미 가진 상품은 건너뜀(중복 지급 없음)
create or replace function public.mail_claim(p_account uuid, p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m record; r jsonb; n integer := 0; k integer := 0; gsum integer := 0; items text[] := '{}'; g integer;
begin
  for m in select * from public.mail where account_id = p_account and claimed_at is null and expires_at > now()
             and (p_ids is null or id = any (p_ids)) order by created_at for update loop
    for r in select * from jsonb_array_elements(m.rewards) loop
      if r->>'type' = 'gold' then
        g := private.gold_apply(p_account, (r->>'amount')::integer, 'mail', 'mail:' || m.id || ':' || k, jsonb_build_object('mail', m.id));
        gsum := gsum + (r->>'amount')::integer;
        k := k + 1;
      elsif r->>'type' = 'item' then
        perform private.item_grant(p_account, r->>'id', 'mail', 'mail:' || m.id);
        items := items || (r->>'id');
      end if;
    end loop;
    update public.mail set claimed_at = now() where id = m.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('claimed', n, 'gold', gsum, 'items', to_jsonb(items),
                            'balance', coalesce((select gold from public.wallets where account_id = p_account), 0));
end; $$;

-- ---------- 권한: Worker(service_role)만 ----------
do $$
declare t text;
begin
  foreach t in array array['wallets', 'gold_ledger', 'econ_state', 'catalog_items', 'shop_offers', 'inventory', 'orders', 'mail'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
revoke all on sequence public.order_seq from anon, authenticated;
grant usage, select on sequence public.order_seq to service_role;
grant usage, select on sequence public.gold_ledger_id_seq to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.econ_get(uuid,integer)', 'public.econ_commit(uuid,text,integer,jsonb,integer,text,jsonb)',
    'public.profile_rename(uuid,text,integer,text)', 'public.profile_equip(uuid,jsonb,text[])',
    'public.inventory_list(uuid)', 'public.shop_list(uuid)', 'public.shop_buy_gold(uuid,text,integer,text)',
    'public.order_create(uuid,text,text,integer)', 'public.order_get(uuid,bigint)', 'public.account_steam_id(uuid)', 'public.order_mark(bigint,text,text,jsonb)',
    'public.order_deliver(bigint,text,boolean)', 'public.order_refund(bigint,text)',
    'public.mail_send(uuid,text,text,jsonb,text,integer)', 'public.mail_list(uuid)', 'public.mail_claim(uuid,uuid[])'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['private.gold_apply(uuid,integer,text,text,jsonb)', 'private.item_grant(uuid,text,text,text)',
                           'private.owns(uuid,text)', 'private.offer_live(text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

commit;
