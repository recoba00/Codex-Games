// 성좌 결투 서버 (이식 1단계: 계정·인증, 게임 데이터 로딩)
// 전투 판 Durable Object는 2단계에서 추가한다(전작 soullink/server의 판 DO 구조를 기준).
import { rpc } from "./db.mjs";
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
      return json({ ok: true, service: "seongjwa", stage: 1 });

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

    default:
      throw new Error("not_found");
  }
}

export default {
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
