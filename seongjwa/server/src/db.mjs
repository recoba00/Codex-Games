// Supabase(PostgREST) 호출. service 키는 Worker 비밀값으로만 둔다.
function headers(env) {
  const key = env.SUPABASE_SERVICE_KEY;
  if (!env.SUPABASE_URL || !key) throw new Error("db_not_configured");
  const h = { apikey: key, "content-type": "application/json", accept: "application/json" };
  if (key.startsWith("eyJ")) h.authorization = `Bearer ${key}`; // 구형 JWT 형식 service_role 키
  return h;
}

function base(env) {
  return String(env.SUPABASE_URL).replace(/\/$/, "");
}

// DB 함수가 raise한 코드(account_banned 등)는 그대로 넘기고, 나머지는 db_error로 감춘다.
const PASS_THROUGH = new Set(["account_banned", "account_deleted", "ttl_invalid", "rank_conflict",
  // 5단계 경제·상점·우편
  "econ_conflict", "gold_short", "price_changed", "already_owned", "offer_unavailable", "gold_not_allowed", "cash_not_allowed",
  "too_many_orders", "order_invalid", "order_closed", "item_invalid", "item_not_owned", "name_invalid",
  // 6단계 백오피스·제재·신고
  "invite_invalid", "login_taken", "last_admin", "validation_failed", "state_invalid", "self_review", "reason_required", "schedule_invalid",
  "not_approved", "version_invalid", "action_invalid", "days_required", "sanction_invalid", "report_invalid", "report_limited",
  "title_required", "target_invalid", "job_invalid", "forbidden", "value_invalid", "key_invalid",
  // 7단계 친구·시즌
  "friend_not_found", "already_friends", "friend_blocked", "friend_limit", "request_invalid", "block_invalid", "block_limit",
  "not_friend", "friend_in_game", "invite_limit",
  // 8단계 금칙어·계정 연동·삭제
  "name_banned", "word_invalid", "word_exists", "word_not_found", "provider_invalid", "provider_taken", "choice_invalid",
  "account_not_found", "account_not_active",
  // 9단계 에셋
  "data_not_published"]);

export async function rpc(env, name, args, fetcher = fetch) {
  const response = await fetcher(`${base(env)}/rest/v1/rpc/${name}`, {
    method: "POST", headers: headers(env), body: JSON.stringify(args)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message ?? "";
    throw new Error(PASS_THROUGH.has(message) ? message : "db_error");
  }
  return body;
}

export async function select(env, pathAndQuery, fetcher = fetch) {
  const response = await fetcher(`${base(env)}/rest/v1/${pathAndQuery}`, { headers: headers(env) });
  if (!response.ok) throw new Error("db_error");
  return response.json();
}
