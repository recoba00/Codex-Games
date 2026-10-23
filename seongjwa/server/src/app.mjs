// 성좌 결투 서버 라우팅: 계정·인증, 게임 데이터, 친구 비밀방. 진입점은 index.mjs
import { rpc } from "./db.mjs";
import { TEST_PAGE } from "./devpage.mjs";
import { getLive } from "./gamedata.mjs";
import { verifySteamTicket } from "./steam.mjs";
import { newRefreshToken, sha256Hex, signAccess, verifyAccess } from "./tokens.mjs";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_BODY = 8 * 1024;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), { status, headers: { ...JSON_HEADERS, ...extra } });
}

const STATUS = {
  auth_required: 401, auth_invalid: 401, auth_expired: 401, session_ended: 401, refresh_invalid: 401,
  steam_ticket_rejected: 401, account_banned: 403, account_deleted: 403, not_found: 404,
  room_not_found: 404, room_full: 409, not_member: 403, ticket_invalid: 401, room_code_exhausted: 503,
  steam_unavailable: 502, db_error: 502, data_not_published: 503,
  db_not_configured: 503, steam_not_configured: 503, token_secret_invalid: 503
};

async function readJson(request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) throw new Error("body_too_large");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error("body_too_large");
  try { return text ? JSON.parse(text) : {}; } catch { throw new Error("json_invalid"); }
}

function deviceId(input) {
  const value = String(input.deviceId ?? "");
  return /^[A-Za-z0-9_-]{0,128}$/.test(value) ? value : "";
}

async function issueSession(env, provider, providerUid, platform, device) {
  const refreshToken = newRefreshToken();
  const rows = await rpc(env, "auth_login", {
    p_provider: provider, p_provider_uid: providerUid, p_platform: platform, p_device_id: device,
    p_refresh_hash: await sha256Hex(refreshToken), p_ttl_seconds: REFRESH_TTL_SECONDS
  });
  const row = rows?.[0];
  if (!row?.account_id) throw new Error("db_error");
  return {
    ok: true,
    accountId: row.account_id,
    accessToken: await signAccess(env.TOKEN_SECRET, { sub: row.account_id, sid: row.session_id }, ACCESS_TTL_SECONDS),
    accessExpiresIn: ACCESS_TTL_SECONDS,
    refreshToken,
    replacedSessions: row.replaced_sessions,          // > 0 이면 다른 기기 세션을 끝냈음(상세 09)
    restoredFromDeletion: row.restored_from_deletion   // 삭제 유예 중 로그인 → 삭제 취소 안내
  };
}

async function authenticate(request, env) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) throw new Error("auth_required");
  return verifyAccess(env.TOKEN_SECRET, header.slice(7));
}

export async function handle(request, env) {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;

  switch (route) {
    case "GET /health":
      return json({ ok: true, service: "seongjwa", stage: 2 });

    case "POST /v1/auth/steam": {
      const input = await readJson(request);
      const steam = await verifySteamTicket(env, input.ticket);
      return json(await issueSession(env, "steam", steam.steamId, "steam", deviceId(input)));
    }

    case "POST /v1/auth/dev": {
      // 개발·테스트 전용. DEV_LOGIN=1 인 환경에서만 열린다. 운영 환경에서는 절대 켜지 않는다.
      if (env.DEV_LOGIN !== "1") throw new Error("not_found");
      const input = await readJson(request);
      const devId = String(input.devId ?? "");
      if (!/^[a-z0-9_-]{3,32}$/.test(devId)) throw new Error("dev_id_invalid");
      return json(await issueSession(env, "guest", `dev:${devId}`, "steam", deviceId(input)));
    }

    case "POST /v1/auth/refresh": {
      const input = await readJson(request);
      const old = String(input.refreshToken ?? "");
      if (!/^[A-Za-z0-9_-]{32,64}$/.test(old)) throw new Error("refresh_invalid");
      const refreshToken = newRefreshToken();
      const rows = await rpc(env, "auth_refresh", {
        p_old_hash: await sha256Hex(old), p_new_hash: await sha256Hex(refreshToken), p_ttl_seconds: REFRESH_TTL_SECONDS
      });
      const row = rows?.[0];
      if (!row) throw new Error("refresh_invalid"); // 만료·재사용·다른 기기 로그인으로 끝난 세션
      return json({
        ok: true,
        accessToken: await signAccess(env.TOKEN_SECRET, { sub: row.account_id, sid: row.session_id }, ACCESS_TTL_SECONDS),
        accessExpiresIn: ACCESS_TTL_SECONDS,
        refreshToken
      });
    }

    case "POST /v1/auth/logout": {
      const claims = await authenticate(request, env);
      await rpc(env, "auth_logout", { p_session: claims.sid });
      return json({ ok: true });
    }

    case "GET /v1/me": {
      // 세션 유효성까지 확인한다(다른 기기 로그인으로 끝났으면 session_ended).
      const claims = await authenticate(request, env);
      const active = await rpc(env, "auth_session_active", { p_session: claims.sid });
      if (active !== true) throw new Error("session_ended");
      return json({ ok: true, accountId: claims.sub, sessionId: claims.sid });
    }

    case "GET /v1/data/live": {
      // 공개 데이터(카드 문구·수치). sha256을 ETag로 써서 바뀌지 않았으면 304(전송량 절감).
      const live = await getLive(env);
      const etag = `"${live.sha256}"`;
      const cache = { etag, "cache-control": "public, max-age=60" };
      if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: cache });
      return new Response(JSON.stringify({ ok: true, version: live.version, sha256: live.sha256, data: live.snapshot }), {
        status: 200, headers: { "content-type": "application/json; charset=utf-8", ...cache }
      });
    }

    case "POST /v1/rooms": {  // 친구 비밀방 만들기 (총괄 8장: 6자리 코드, 방장이 밴 on/off·턴 20/30초)
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      for (let i = 0; i < 5; i += 1) {
        const code = roomCode();
        const res = await roomCall(env, code, "/create", { acc: claims.sub, code, options: input.options, defaults: input.defaults });
        if (res.status !== 409) return res;
      }
      throw new Error("room_code_exhausted");
    }

    case "GET /dev":
      if (env.DEV_LOGIN !== "1") throw new Error("not_found");
      return new Response(TEST_PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

    default: {
      const m = url.pathname.match(/^\/v1\/rooms\/([A-Z0-9]{6})\/(join|ticket|ws)$/);
      if (!m || !ROOM_CODE.test(m[1])) throw new Error("not_found");
      const [, code, action] = m;
      if (action === "ws") {
        if (request.method !== "GET") throw new Error("not_found");
        return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(`https://room/ws?ticket=${encodeURIComponent(url.searchParams.get("ticket") ?? "")}`, request);
      }
      if (request.method !== "POST") throw new Error("not_found");
      const claims = await authenticate(request, env);
      if (action === "ticket") {
        // 소켓 연결 직전에 세션 유효성 확인(다른 기기 로그인으로 끝난 세션은 차단)
        const active = await rpc(env, "auth_session_active", { p_session: claims.sid });
        if (active !== true) throw new Error("session_ended");
        return roomCall(env, code, "/ticket", { acc: claims.sub, sid: claims.sid });
      }
      const input = await readJson(request);
      return roomCall(env, code, "/join", { acc: claims.sub, defaults: input.defaults });
    }
  }
}

const ROOM_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";  // 헷갈리는 0·O·1·I·L 제외
const ROOM_CODE = new RegExp(`^[${ROOM_ALPHABET}]{6}$`);
function roomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join("");
}
async function roomCall(env, code, path, body) {
  const res = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(`https://room${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  return new Response(res.body, { status: res.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export const app = {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      const code = error instanceof Error ? error.message : "internal_error";
      const known = STATUS[code] ?? (/^[a-z_]+$/.test(code) ? 400 : 500);
      return json({ ok: false, error: known === 500 ? "internal_error" : code }, known);
    }
  }
};
