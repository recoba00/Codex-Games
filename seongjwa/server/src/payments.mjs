// 현금 결제(상세 07 구매 흐름). 1단계 Steam MicroTxn, 테스트 환경은 dev(가짜 결제).
// Steam 흐름: 서버 InitTxn → Steam 오버레이에서 사용자 승인 → 클라이언트가 MicroTxnAuthorizationResponse를 받고 finalize 요청
//            → 서버 FinalizeTxn → 지급. 결제됐는데 지급이 안 된 주문은 다음 로그인(GET /v1/econ) 때 QueryTxn으로 확인해 우편 지급.
// 퍼블리셔 키는 로그인 검증과 같은 STEAM_WEB_API_KEY(비밀값). STEAM_TXN_SANDBOX="0"일 때만 실결제.
import { rpc } from "./db.mjs";

const STALE_MS = 60 * 1000;          // 이보다 오래된 미완료 주문만 복구 확인
const ABANDON_MS = 30 * 60 * 1000;   // 승인 없이 이만큼 지나면 취소 처리

function steamBase(env) {
  // STEAM_API_BASE는 통합 테스트에서 가짜 Steam 서버로 돌릴 때만 쓴다
  return `${env.STEAM_API_BASE ?? "https://partner.steam-api.com"}/${env.STEAM_TXN_SANDBOX === "0" ? "ISteamMicroTxn" : "ISteamMicroTxnSandbox"}`;
}

export function providerFor(env, steamId) {
  if (steamId && env.STEAM_WEB_API_KEY && env.STEAM_APP_ID) return "steam";
  if (env.DEV_LOGIN === "1") return "dev";
  throw new Error("payment_unavailable");
}

async function steamCall(env, method, version, params, { post = true } = {}, fetcher = fetch) {
  const body = new URLSearchParams({ key: env.STEAM_WEB_API_KEY, appid: String(env.STEAM_APP_ID), ...params });
  const url = `${steamBase(env)}/${method}/${version}/`;
  const res = post
    ? await fetcher(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body })
    : await fetcher(`${url}?${body}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("steam_unavailable");
  const json = await res.json().catch(() => null);
  const r = json?.response;
  if (r?.result !== "OK") {
    const e = new Error("steam_txn_failed");
    e.extra = { steamError: r?.error?.errordesc ?? null, steamCode: r?.error?.errorcode ?? null };
    throw e;
  }
  return r.params ?? {};
}

// 주문 시작. 반환: { order, provider, ... } — Steam이면 오버레이가 뜨고 클라이언트는 승인 콜백을 기다린다
export async function startOrder(env, account, offerId, price, { language = "ko", fetcher = fetch } = {}) {
  const steamId = await rpc(env, "account_steam_id", { p_account: account });
  const provider = providerFor(env, steamId);
  const created = await rpc(env, "order_create", { p_account: account, p_offer: offerId, p_provider: provider, p_price: price });
  if (provider === "steam") {
    try {
      const p = await steamCall(env, "InitTxn", "v3", {
        orderid: String(created.order), steamid: created.steamId, itemcount: "1", language, currency: created.currency,
        usersession: "client", "itemid[0]": String(created.order % 4294967296), "qty[0]": "1",
        // Steam 금액 단위는 "cents". 원화도 ×100으로 보낸다(샌드박스에서 확인 필요, 기획확인요청 13차)
        "amount[0]": String(created.amount * 100), "description[0]": created.name.slice(0, 128)
      }, {}, fetcher);
      await rpc(env, "order_mark", { p_order: created.order, p_status: "init", p_txn: p.transid ?? null, p_detail: { steam_init: true } });
    } catch (error) {
      await rpc(env, "order_mark", { p_order: created.order, p_status: "failed", p_txn: null, p_detail: { error: error.message } });
      throw error;
    }
  }
  return { order: String(created.order), provider, item: created.item, amount: created.amount, currency: created.currency };
}

// 승인 후 확정(클라이언트 finalize 요청 또는 복구). viaMail=true면 우편 지급
export async function finishOrder(env, account, orderId, { viaMail = false, fetcher = fetch } = {}) {
  const o = await rpc(env, "order_get", { p_account: account, p_order: orderId });
  if (!o) throw new Error("order_invalid");
  if (o.status === "delivered") return { status: "duplicate", item: o.item_id };
  if (!["init", "approved"].includes(o.status)) throw new Error("order_closed");
  if (o.provider === "steam") {
    const q = await steamCall(env, "QueryTxn", "v3", { orderid: String(o.id) }, { post: false }, fetcher);
    const st = String(q.status ?? "");
    if (st === "Approved") {
      await steamCall(env, "FinalizeTxn", "v2", { orderid: String(o.id) }, {}, fetcher);
    } else if (st !== "Succeeded") {
      if (["Failed", "Refunded", "Chargedback", "Revoked", "RefundedSuspectedFraud", "RefundedFriendlyFraud"].includes(st)) {
        await rpc(env, "order_mark", { p_order: o.id, p_status: "failed", p_txn: null, p_detail: { steam_status: st } });
        throw new Error("payment_failed");
      }
      throw new Error("payment_pending");  // Init: 아직 사용자가 승인하지 않음
    }
  } else if (o.provider !== "dev") throw new Error("order_invalid");
  return rpc(env, "order_deliver", { p_order: o.id, p_txn: o.provider_txn ?? null, p_via_mail: viaMail });
}

export async function cancelOrder(env, account, orderId) {
  const o = await rpc(env, "order_get", { p_account: account, p_order: orderId });
  if (!o) throw new Error("order_invalid");
  if (o.status === "init") await rpc(env, "order_mark", { p_order: o.id, p_status: "canceled", p_txn: null, p_detail: { by: "user" } });
  return { ok: true };
}

// 로그인·로비 진입 때: 오래된 미완료 주문을 확인해 결제됐으면 우편 지급, 버려진 주문은 취소
export async function recoverOrders(env, account, pending, { fetcher = fetch, now = Date.now() } = {}) {
  const done = [];
  for (const p of pending ?? []) {
    const age = now - Date.parse(p.created_at);
    if (age < STALE_MS) continue;
    try {
      if (p.provider === "dev") {
        if (age > ABANDON_MS) await rpc(env, "order_mark", { p_order: p.id, p_status: "canceled", p_txn: null, p_detail: { by: "timeout" } });
        continue;
      }
      const r = await finishOrder(env, account, p.id, { viaMail: true, fetcher });
      done.push({ order: String(p.id), item: r.item, viaMail: true });
    } catch (error) {
      if (error.message === "payment_pending" && age > ABANDON_MS) {
        await rpc(env, "order_mark", { p_order: p.id, p_status: "canceled", p_txn: null, p_detail: { by: "timeout" } });
      }
    }
  }
  return done;
}
