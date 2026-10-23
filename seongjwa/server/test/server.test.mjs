import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { app as worker, ACCESS_TTL_SECONDS } from "../src/app.mjs";
import { _resetCache, getVersion, LIVE_TTL_MS, getLive } from "../src/gamedata.mjs";
import { verifySteamTicket } from "../src/steam.mjs";
import { sha256Hex, signAccess, verifyAccess } from "../src/tokens.mjs";

const SECRET = "test-secret-test-secret-test-secret-0123";
const env = {
  SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_KEY: "sb_secret_test", TOKEN_SECRET: SECRET,
  STEAM_WEB_API_KEY: "k", STEAM_APP_ID: "480", STEAM_TICKET_IDENTITY: "seongjwa-auth", DEV_LOGIN: "0"
};
const ACC = "11111111-1111-1111-1111-111111111111";
const SID = "22222222-2222-2222-2222-222222222222";

// 가짜 외부 응답: 호출 기록을 남기고 경로별 응답을 돌려준다
let calls;
let routes;
function respond(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  calls.push({ url: u, init });
  const hit = routes.find(([prefix]) => u.toString().startsWith(prefix));
  if (!hit) throw new Error(`unexpected fetch ${u}`);
  return hit[1](u, init);
};

beforeEach(() => {
  calls = [];
  routes = [];
  _resetCache();
});

function call(method, path, { body, token, headers = {} } = {}, e = env) {
  const h = { ...headers };
  if (body) h["content-type"] = "application/json";
  if (token) h.authorization = `Bearer ${token}`;
  return worker.fetch(new Request(`https://api.example${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), e);
}

const steamOk = (u) => respond({ response: { params: { result: "OK", steamid: "76561198000000001", ownersteamid: "76561198000000001", vacbanned: false, publisherbanned: false } } });
const loginOk = () => respond([{ account_id: ACC, session_id: SID, replaced_sessions: 1, restored_from_deletion: false }]);

test("토큰: 서명·검증, 위조·만료 거부", async () => {
  const token = await signAccess(SECRET, { sub: ACC, sid: SID }, 60, 1_000_000);
  assert.equal((await verifyAccess(SECRET, token, 1_000_000)).sub, ACC);
  await assert.rejects(verifyAccess(SECRET, token, 1_000_000 + 61_000), /auth_expired/);
  await assert.rejects(verifyAccess(SECRET + "x", token, 1_000_000), /auth_invalid/);
  const [h, b, s] = token.split(".");
  await assert.rejects(verifyAccess(SECRET, `${h}.${b.slice(0, -2)}AA.${s}`, 1_000_000), /auth_invalid/);
  await assert.rejects(signAccess("short", { sub: ACC, sid: SID }, 60), /token_secret_invalid/);
});

test("Steam 티켓: 퍼블리셔 API에 키·앱·identity를 보내고 SteamID를 받는다", async () => {
  routes.push(["https://partner.steam-api.com/", steamOk]);
  const r = await verifySteamTicket(env, "abcdef0123456789");
  assert.equal(r.steamId, "76561198000000001");
  const q = calls[0].url.searchParams;
  assert.equal(q.get("appid"), "480");
  assert.equal(q.get("identity"), "seongjwa-auth");
  await assert.rejects(verifySteamTicket(env, "not-hex!"), /steam_ticket_invalid/);
  routes[0] = ["https://partner.steam-api.com/", () => respond({ response: { error: { errorcode: 101 } } })];
  await assert.rejects(verifySteamTicket(env, "abcdef0123456789"), /steam_ticket_rejected/);
  routes[0] = ["https://partner.steam-api.com/", () => respond({ response: { params: { result: "OK", steamid: "76561198000000001", publisherbanned: true } } })];
  await assert.rejects(verifySteamTicket(env, "abcdef0123456789"), /account_banned/);
});

test("Steam 로그인 → 세션 발급, 리프레시 토큰은 해시로만 DB에 간다", async () => {
  routes.push(["https://partner.steam-api.com/", steamOk], ["https://db.example/rest/v1/rpc/auth_login", loginOk]);
  const res = await call("POST", "/v1/auth/steam", { body: { ticket: "abcdef0123456789", deviceId: "pc-1" } });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.accountId, ACC);
  assert.equal(out.replacedSessions, 1);
  assert.equal(out.accessExpiresIn, ACCESS_TTL_SECONDS);
  const sent = JSON.parse(calls[1].init.body);
  assert.equal(sent.p_provider, "steam");
  assert.equal(sent.p_provider_uid, "76561198000000001");
  assert.equal(sent.p_refresh_hash, await sha256Hex(out.refreshToken));
  assert.ok(!calls[1].init.body.includes(out.refreshToken), "원본 리프레시 토큰은 DB로 보내지 않는다");
  assert.equal(calls[1].init.headers.authorization, undefined, "새 형식 secret 키는 apikey 헤더만");
  const claims = await verifyAccess(SECRET, out.accessToken);
  assert.deepEqual([claims.sub, claims.sid], [ACC, SID]);
});

test("제재 계정 로그인은 403", async () => {
  routes.push(["https://partner.steam-api.com/", steamOk],
    ["https://db.example/rest/v1/rpc/auth_login", () => respond({ message: "account_banned" }, 400)]);
  const res = await call("POST", "/v1/auth/steam", { body: { ticket: "abcdef0123456789" } });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "account_banned");
});

test("DB 내부 오류 메시지는 밖으로 내보내지 않는다", async () => {
  routes.push(["https://partner.steam-api.com/", steamOk],
    ["https://db.example/rest/v1/rpc/auth_login", () => respond({ message: "relation secret_table does not exist" }, 400)]);
  const res = await call("POST", "/v1/auth/steam", { body: { ticket: "abcdef0123456789" } });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, "db_error");
});

test("개발 로그인은 DEV_LOGIN=1일 때만 열린다", async () => {
  assert.equal((await call("POST", "/v1/auth/dev", { body: { devId: "tester" } })).status, 404);
  routes.push(["https://db.example/rest/v1/rpc/auth_login", loginOk]);
  const res = await call("POST", "/v1/auth/dev", { body: { devId: "tester" } }, { ...env, DEV_LOGIN: "1" });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(calls[0].init.body).p_provider_uid, "dev:tester");
});

test("갱신: 무효·재사용 토큰은 401, 정상은 새 토큰 쌍", async () => {
  routes.push(["https://db.example/rest/v1/rpc/auth_refresh", () => respond([])]);
  const bad = await call("POST", "/v1/auth/refresh", { body: { refreshToken: "x".repeat(43) } });
  assert.equal(bad.status, 401);
  routes[0] = ["https://db.example/rest/v1/rpc/auth_refresh", () => respond([{ account_id: ACC, session_id: SID }])];
  const ok = await call("POST", "/v1/auth/refresh", { body: { refreshToken: "x".repeat(43) } });
  const out = await ok.json();
  assert.equal(ok.status, 200);
  assert.notEqual(out.refreshToken, "x".repeat(43));
});

test("/v1/me: 토큰 없음 401, 다른 기기 로그인으로 끝난 세션 401(session_ended)", async () => {
  assert.equal((await call("GET", "/v1/me")).status, 401);
  const token = await signAccess(SECRET, { sub: ACC, sid: SID }, 60);
  routes.push(["https://db.example/rest/v1/rpc/auth_session_active", () => respond(true)]);
  assert.equal((await (await call("GET", "/v1/me", { token })).json()).accountId, ACC);
  routes[0] = ["https://db.example/rest/v1/rpc/auth_session_active", () => respond(false)];
  const ended = await call("GET", "/v1/me", { token });
  assert.equal(ended.status, 401);
  assert.equal((await ended.json()).error, "session_ended");
});

const LIVE_ROW = [{ version_id: 3, data_versions: { id: 3, snapshot_sha256: "ab".repeat(32), snapshot: { version: 3, characters: { SE: { name: "셀레네" } } } } }];

test("게임 데이터: 라이브 스냅샷 캐시, ETag 일치 시 304", async () => {
  routes.push(["https://db.example/rest/v1/data_live", () => respond(LIVE_ROW)]);
  const first = await call("GET", "/v1/data/live");
  const body = await first.json();
  assert.equal(body.version, 3);
  assert.equal(body.data.characters.SE.name, "셀레네");
  const etag = first.headers.get("etag");
  const second = await call("GET", "/v1/data/live", { headers: { "if-none-match": etag } });
  assert.equal(second.status, 304);
  assert.equal(calls.length, 1, "캐시 기간 안에는 DB를 다시 읽지 않는다");
});

test("게임 데이터: 캐시 만료 후 다시 읽고, 고정된 버전은 그대로 복원", async () => {
  routes.push(["https://db.example/rest/v1/data_live", () => respond(LIVE_ROW)]);
  const t0 = 1_000_000;
  const pinned = await getLive(env, fetch, t0);
  await getLive(env, fetch, t0 + LIVE_TTL_MS - 1);
  assert.equal(calls.length, 1);
  routes[0] = ["https://db.example/rest/v1/data_live", () => respond([{ version_id: 4, data_versions: { id: 4, snapshot_sha256: "cd".repeat(32), snapshot: { version: 4 } } }])];
  assert.equal((await getLive(env, fetch, t0 + LIVE_TTL_MS + 1)).version, 4);
  assert.equal((await getVersion(env, pinned.version)).version, 3, "진행 중인 판의 버전은 캐시에서 그대로");
  assert.equal(calls.length, 2);
});

test("없는 경로 404, 잘못된 JSON 400", async () => {
  assert.equal((await call("GET", "/nope")).status, 404);
  const res = await worker.fetch(new Request("https://api.example/v1/auth/refresh", { method: "POST", body: "{bad" }), env);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "json_invalid");
});
