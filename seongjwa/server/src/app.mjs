// 성좌 결투 서버 라우팅: 계정·인증, 게임 데이터, 친구 비밀방. 진입점은 index.mjs
import { rpc } from "./db.mjs";
import { TEST_PAGE } from "./devpage.mjs";
import { getLive, pinLive } from "./gamedata.mjs";
import { aiAllowed, legendCount } from "./rank.mjs";
import { currentSeason, loadRank, tierName } from "./ranking.mjs";
import { verifySteamTicket } from "./steam.mjs";
import { econLoad, econMutate } from "./econ-db.mjs";
import { claimAttendance, claimMissions, econConfig, econView, firstWinMult, periodKeys, rerollDaily } from "./economy.mjs";
import { cancelOrder, finishOrder, recoverOrders, startOrder } from "./payments.mjs";
import { handleBo, runCron } from "./bo/api.mjs";
import { claimRankRoad, rankRoadView } from "./season.mjs";
import { pairRule } from "./queue-logic.mjs";
import { assetManifest, loadAssets } from "./assets.mjs";
import { CUP, cupWindow, validRoster, cupBonusMission, cupWaitSec, cupRewardCfg, cupSeasonWeek } from "./cup.mjs";
import { BO_PAGE } from "./bo/page.mjs";
import { newRefreshToken, sha256Hex, signAccess, verifyAccess } from "./tokens.mjs";

// 요청 제한(전작 검토 B6): IP 해시 + 1분 칸. DB가 안 되면 막지 않는다(로그인이 더 중요)
export async function rateLimit(env, request, kind, limit) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
  const key = `${kind}:${(await sha256Hex(`${env.TOKEN_SECRET ?? ""}|${ip}`)).slice(0, 24)}`;
  const ok = await rpc(env, "rate_hit", { p_key: key, p_limit: limit, p_window_sec: 60 }).catch(() => true);
  if (ok === false) throw new Error("rate_limited");
}

// 친구 코드: 표시 접두어는 게임 이름 가안이라 바뀔 수 있음(FRIEND_CODE_PREFIX). 입력은 접두어 있어도 없어도 됨
const codePrefix = (env) => String(env.FRIEND_CODE_PREFIX ?? "ASTRA");
function friendCodeOf(raw) {
  const m = String(raw ?? "").trim().toUpperCase().match(/^(?:[A-Z]+-)?([2-9A-HJKMNP-Z]{4}|[2-9A-HJKMNP-Z]{6})$/);
  return m ? m[1] : null;
}

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
  queue_locked: 403, dodge_blocked: 403, difficulty_invalid: 400,
  room_not_found: 404, room_full: 409, not_member: 403, ticket_invalid: 401, room_code_exhausted: 503,
  steam_unavailable: 502, db_error: 502, data_not_published: 503,
  gold_short: 409, already_owned: 409, price_changed: 409, offer_unavailable: 410, econ_conflict: 409, attendance_done: 409,
  mission_claimed: 409, mission_not_done: 409, nothing_to_claim: 409, reroll_used: 409, order_closed: 409, too_many_orders: 429,
  payment_unavailable: 503, payment_pending: 409, payment_failed: 402, steam_txn_failed: 502, item_not_owned: 403,
  friend_not_found: 404, already_friends: 409, friend_blocked: 403, friend_limit: 409, friend_in_game: 409, invite_expired: 410, not_friend: 403, invite_limit: 429, block_limit: 409,
  asset_not_webp: 400, asset_too_large: 413, asset_spec: 422, asset_region: 422, asset_slot_invalid: 400, asset_kind_invalid: 400, asset_skin_invalid: 400,
  asset_char_invalid: 400, asset_full_missing: 409, asset_no_previous: 409, storage_failed: 502, state_invalid: 409,
  rate_limited: 429, cup_closed: 409, cup_not_eligible: 403, cup_entry_active: 409, cup_left_this_week: 409, cup_no_ticket: 409, cup_no_entry: 409, cup_roster_invalid: 400,
  name_banned: 422, provider_taken: 409, provider_invalid: 400, choice_invalid: 400, account_not_active: 409, link_unavailable: 503, events_invalid: 400, confirm_required: 400,
  forbidden: 403, login_failed: 401, login_locked: 423, self_review: 403, validation_errors: 422, report_limited: 429, rank_restricted: 403,
  db_not_configured: 503, steam_not_configured: 503, token_secret_invalid: 503
};

async function readJson(request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) throw new Error("body_too_large");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error("body_too_large");
  try { return text ? JSON.parse(text) : {}; } catch { throw new Error("json_invalid"); }
}

// 지표 로그(상세 12): 클라이언트가 보내는 이벤트. 판·매칭 이벤트는 서버가, 골드·결제·신고·보상은 원본 표가 기준이라 받지 않는다
export const CLIENT_EVENTS = new Set(["session_start", "session_end", "tutorial_step", "card_detail_open", "shop_view", "item_preview",
  "settings_change", "disconnect", "reconnect", "purchase_start", "purchase_fail", "asset_download"]);  // asset_download { bytes, files }: 저장소 전송량 추정(기획답변 18차)
const PLATFORMS = new Set(["android", "ios", "steam"]), DEVICES = new Set(["phone", "tablet", "desktop"]);
export function clientEvents(input, acc, now = Date.now()) {
  const list = Array.isArray(input?.events) ? input.events : [];
  if (!list.length || list.length > 50) throw new Error("events_invalid");
  const platform = PLATFORMS.has(input.platform) ? input.platform : null;
  const device = DEVICES.has(input.device) ? input.device : null;
  const appVer = /^[0-9A-Za-z.+_-]{1,20}$/.test(String(input.appVer ?? "")) ? String(input.appVer) : null;
  const rows = [];
  for (const e of list) {
    if (!CLIENT_EVENTS.has(e?.name)) continue;  // 모르는 이름은 버림(이름 목록은 상세 12가 기준)
    const props = e.props && typeof e.props === "object" && !Array.isArray(e.props) ? e.props : {};
    if (JSON.stringify(props).length > 2000) continue;
    const t = Date.parse(e.at ?? "");
    const at = Number.isFinite(t) && t <= now + 60000 && t >= now - 7 * 86400000 ? new Date(t).toISOString() : new Date(now).toISOString();  // 오프라인 묶음은 7일까지
    rows.push({ account: acc, name: e.name, at, platform, device, app_ver: appVer, data_ver: Number.isInteger(input.dataVer) ? input.dataVer : null, props });
  }
  return { rows, platform, device, appVer };
}

const originOf = (u) => { try { return new URL(String(u)).origin; } catch { return ""; } };  // 에셋 미리보기(저장소 주소)

function deviceId(input) {
  const value = String(input.deviceId ?? "");
  return /^[A-Za-z0-9_-]{0,128}$/.test(value) ? value : "";
}

async function issueSession(env, provider, providerUid, platform, device) {
  await rpc(env, "account_unban_expired", { p_provider: provider, p_provider_uid: providerUid }).catch(() => false);  // 기간 정지 만료 자동 해제(상세 13), 실패해도 로그인 판단은 auth_login
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

// 상태를 바꾸는 요청(POST)은 세션이 아직 살아 있는지도 본다(로그아웃·다른 기기 로그인·계정 삭제 직후 15분 토큰 재사용 차단).
// 1분마다 오는 하트비트·이벤트·로그아웃은 토큰 검사만(DB 왕복 절약).
const SESSION_CHECK_SKIP = new Set(["/v1/presence", "/v1/events", "/v1/auth/logout"]);
async function authenticate(request, env) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) throw new Error("auth_required");
  const claims = await verifyAccess(env.TOKEN_SECRET, header.slice(7));
  if (request.method === "POST" && !SESSION_CHECK_SKIP.has(new URL(request.url).pathname)
      && (await rpc(env, "auth_session_active", { p_session: claims.sid })) !== true) throw new Error("session_ended");
  return claims;
}

export async function handle(request, env) {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;
  if (url.pathname.startsWith("/bo/v1/")) return handleBo(request, env, url);  // 백오피스 API(직원 계정, 상세 14)

  switch (route) {
    case "GET /bo":  // 백오피스 화면(직원 로그인 필요, 상세 14)
      return new Response(BO_PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY",
        "content-security-policy": `default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob: https: ${originOf(env.SUPABASE_URL)}; connect-src 'self'; frame-ancestors 'none'` } });

    case "GET /v1/lobby":  // 로비 배너(최대 5)·공지 팝업(상세 05)
      return json({ ok: true, ...(await rpc(env, "lobby_content", {})) }, 200, { "cache-control": "public, max-age=60" });

    case "GET /v1/sanctions": {  // 경고 팝업·랭킹전 제한 표시(상세 13)
      const claims = await authenticate(request, env);
      return json({ ok: true, ...(await rpc(env, "sanction_status", { p_account: claims.sub })) });
    }
    case "POST /v1/sanctions/ack": {
      const claims = await authenticate(request, env);
      await rpc(env, "sanction_ack", { p_account: claims.sub });
      return json({ ok: true });
    }
    case "POST /v1/reports": {  // 신고(같은 상대 24시간 1회, 결과는 "처리됨"만, 상세 13)
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      const target = String(input.target ?? ""), match = input.matchId ? String(input.matchId) : null;
      if (!/^[0-9a-f-]{36}$/.test(target) || (match && !/^[0-9a-f-]{36}$/.test(match))) throw new Error("report_invalid");
      if (!["afk", "boosting", "cheat", "name", "emote_spam"].includes(input.reason)) throw new Error("report_invalid");
      await rpc(env, "report_create", { p_reporter: claims.sub, p_target: target, p_reason: input.reason, p_match: match, p_note: String(input.note ?? "").slice(0, 200) });
      return json({ ok: true });
    }

    case "GET /health":
      return json({ ok: true, service: "seongjwa", stage: 2 });

    case "POST /v1/auth/steam": {
      await rateLimit(env, request, "auth", 20);
      const input = await readJson(request);
      const steam = await verifySteamTicket(env, input.ticket);
      return json(await issueSession(env, "steam", steam.steamId, "steam", deviceId(input)));
    }

    case "POST /v1/auth/dev": {
      await rateLimit(env, request, "auth", Number(env.DEV_AUTH_RATE ?? 60));
      // 개발·테스트 전용. DEV_LOGIN=1 인 환경에서만 열린다. 운영 환경에서는 절대 켜지 않는다.
      if (env.DEV_LOGIN !== "1") throw new Error("not_found");
      const input = await readJson(request);
      const devId = String(input.devId ?? "");
      if (!/^[a-z0-9_-]{3,32}$/.test(devId)) throw new Error("dev_id_invalid");
      return json(await issueSession(env, "guest", `dev:${devId}`, "steam", deviceId(input)));
    }

    case "POST /v1/auth/refresh": {
      await rateLimit(env, request, "refresh", 60);
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

    case "POST /v1/queue/ticket": {  // 랭킹전 매칭 진입: 세션·이탈 잠금·닷지 제한 확인 → 큐 티켓 (총괄 8·10장)
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      if ((await rpc(env, "auth_session_active", { p_session: claims.sid })) !== true) throw new Error("session_ended");
      const { snapshot: data } = await pinLive(env);
      const season = await currentSeason(env);
      const rank = await loadRank(env, data, claims.sub, season.id);
      const now = Date.now();
      if (rank.leaver.lockedUntil) throw Object.assign(new Error("queue_locked"), { extra: { until: rank.leaver.lockedUntil, step: rank.leaver.step } });
      if (rank.leaver.dodgeUntil) throw Object.assign(new Error("dodge_blocked"), { extra: { until: rank.leaver.dodgeUntil } });
      const sanction = await rpc(env, "sanction_status", { p_account: claims.sub });  // 제재: 랭킹전 제한(상세 13)
      if (sanction?.rankUntil) throw Object.assign(new Error("rank_restricted"), { extra: { until: sanction.rankUntil } });
      const entry = {
        acc: claims.sub, mmr: rank.mmr, tier: rank.row.tier, seasonId: season.id,
        aiOk: aiAllowed(data, rank.row.tier), humanOnly: Boolean(input.humanOnly),
        notBefore: now + (rank.leaver.delayMin ?? 0) * 60000,  // 이탈 누적 단계의 매칭 전 대기
        aiFallbackSec: Number(data.settings?.ai_fallback_sec ?? 30), pair: pairRule(data.settings), defaults: input.defaults ?? {}
      };
      const res = await env.QUEUE.get(env.QUEUE.idFromName("global")).fetch("https://queue/ticket", { method: "POST", body: JSON.stringify({ acc: claims.sub, entry }) });
      const out = await res.json();
      return json({ ...out, tier: rank.row.tier, tierName: tierName(data, rank.row.tier), rp: rank.row.rp, aiFallback: entry.aiOk && !entry.humanOnly, waitBeforeMin: rank.leaver.delayMin ?? 0, leaverStep: rank.leaver.step?.label ?? null });
    }

    // ---------- 주말 챔피언스 컵(상세 08) ----------
    case "GET /v1/cup": {
      const claims = await authenticate(request, env);
      const season = await currentSeason(env);
      const w = cupWindow();
      const st = await rpc(env, "cup_status", { p_account: claims.sub, p_week: w.week, p_season: season.id });
      const allowed = 1 + (st.bonus ? 1 : 0) - (st.penalty ? 1 : 0);
      return json({ ok: true, open: w.open, week: w.week, startsAt: new Date(w.start).toISOString(), endsAt: new Date(w.end).toISOString(),
        eligible: (st.best ?? 0) >= CUP.minTier, best: st.best ?? 0, minTier: CUP.minTier, entry: st.entry, used: st.used, allowed: Math.max(0, allowed),
        left: st.left, bonus: st.bonus, penalty: st.penalty, history: st.history, sevenWins: st.sevenWins, ...cupView((await pinLive(env)).snapshot, season, w.week) });
    }
    case "POST /v1/cup/enter": {  // { roster: [{char, preset}] × 3 } 기간 안, 플래티넘 III 이상
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      const w = cupWindow();
      if (!w.open && env.CUP_ALWAYS_OPEN !== "1") throw new Error("cup_closed");
      const { snapshot: data } = await pinLive(env);
      const roster = validRoster(data, input.roster);
      const season = await currentSeason(env);
      return json({ ok: true, entry: await rpc(env, "cup_enter", { p_account: claims.sub, p_week: w.week, p_season: season.id, p_roster: roster, p_min_tier: CUP.minTier }) });
    }
    case "POST /v1/cup/ticket": {  // 컵 매칭 진입(같은 승패끼리, AI 없음)
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      if ((await rpc(env, "auth_session_active", { p_session: claims.sid })) !== true) throw new Error("session_ended");
      if (!cupWindow().open && env.CUP_ALWAYS_OPEN !== "1") throw new Error("cup_closed");
      const season = await currentSeason(env);
      const st = await rpc(env, "cup_status", { p_account: claims.sub, p_week: cupWindow().week, p_season: season.id });
      if (!st.entry) throw new Error("cup_no_entry");
      const sanction = await rpc(env, "sanction_status", { p_account: claims.sub });
      if (sanction?.rankUntil) throw Object.assign(new Error("rank_restricted"), { extra: { until: sanction.rankUntil } });
      const e = st.entry;
      const entry = { acc: claims.sub, cup: { entryId: e.id, roster: e.roster, wins: e.wins, losses: e.losses }, wins: e.wins, losses: e.losses, notBefore: 0, seasonId: season.id, defaults: input.defaults ?? {}, waitSec: cupWaitSec((await pinLive(env)).snapshot) };
      const res = await env.QUEUE.get(env.QUEUE.idFromName("cup")).fetch("https://queue/ticket", { method: "POST", body: JSON.stringify({ acc: claims.sub, entry }) });
      return json({ ...(await res.json()), record: [e.wins, e.losses] });
    }
    case "GET /v1/cup/ws":
      return env.QUEUE.get(env.QUEUE.idFromName("cup")).fetch(`https://queue/ws?ticket=${encodeURIComponent(url.searchParams.get("ticket") ?? "")}`, request);

    case "GET /v1/queue/ws":
      return env.QUEUE.get(env.QUEUE.idFromName("global")).fetch(`https://queue/ws?ticket=${encodeURIComponent(url.searchParams.get("ticket") ?? "")}`, request);

    case "POST /v1/practice": {  // AI 대전(연습): 난이도 3단계, 밴 없이 픽만, 승점 없음 (총괄 8장, 상세 03)
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      const difficulty = String(input.difficulty ?? "normal");
      if (!["easy", "normal", "hard"].includes(difficulty)) throw new Error("difficulty_invalid");
      for (let i = 0; i < 5; i += 1) {
        const code = roomCode();
        const res = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch("https://room/create-match", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, mode: "practice", difficulty, players: [{ acc: claims.sub, defaults: input.defaults }] })
        });
        if (res.status !== 409) return new Response(res.body, { status: res.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
      }
      throw new Error("room_code_exhausted");
    }

    case "GET /v1/rank/me": {  // 내 랭크(숨은 MMR은 공개하지 않음)
      const claims = await authenticate(request, env);
      const { snapshot: data } = await pinLive(env);
      const season = await currentSeason(env);
      const rank = await loadRank(env, data, claims.sub, season.id);
      const st = rank.row.state ?? {};
      return json({
        ok: true, season, tier: rank.row.tier, tierName: tierName(data, rank.row.tier), rp: rank.row.rp,
        streak: st.streak ?? 0, best: st.best ?? rank.row.tier, bestName: tierName(data, st.best ?? rank.row.tier),
        games: st.games ?? 0, wins: st.wins ?? 0, floor: st.floor ?? 0, protect: st.protect ?? 0,
        leaver: { count: rank.leaver.effective, step: rank.leaver.step?.label ?? null, lockedUntil: rank.leaver.lockedUntil, dodgeUntil: rank.leaver.dodgeUntil, waitBeforeMin: rank.leaver.delayMin }
      });
    }

    case "GET /v1/rank/board": {  // 랭킹 보드: 시즌 RP 순, 마스터 중 상위 N%(상한 M명) 레전드 표시 (총괄 9장)
      const { snapshot: data } = await pinLive(env);
      const season = await currentSeason(env);
      const board = await rpc(env, "rank_board", { p_season: season.id, p_limit: 100 });
      let legends = legendCount(data, Number(board.masters ?? 0));
      const rows = (board.rows ?? []).map((r, i) => {
        const legend = r.tier >= 16 && legends > 0 ? (legends -= 1, true) : false;
        return { rank: i + 1, name: r.name, rp: r.rp, tier: r.tier, tierName: legend ? "레전드" : tierName(data, r.tier) };
      });
      return json({ ok: true, season, rows }, 200, { "cache-control": "public, max-age=30" });
    }

    // ---------- 5단계: 경제·미션·출석·우편·상점 (상세 05·06·07) ----------
    case "GET /v1/econ": {  // 로비 진입: 골드·미션·출석·받지 않은 우편 수. 미완료 결제가 있으면 확인해 우편 지급(상세 07 흐름 4)
      const claims = await authenticate(request, env);
      const { snapshot: data } = await pinLive(env);
      const ctx = await econLoad(env, data, claims.sub);
      const recovered = ctx.raw.pending_orders?.length ? await recoverOrders(env, claims.sub, ctx.raw.pending_orders) : [];
      return json({
        ok: true, gold: ctx.raw.gold, name: ctx.raw.name, nameChangeGold: ctx.raw.name_changes > 0 ? ctx.cfg.econ_name_change_gold : 0,
        mailUnread: Number(ctx.raw.mail_unread ?? 0) + recovered.length, tierName: ctx.tierName, firstWinGold: Math.round(ctx.cfg.econ_first_win_gold * firstWinMult(ctx.tierName, ctx.cfg)),
        ...econView(ctx.state, ctx.cfg, Date.now()), recovered,
        rankRoad: rankRoadView(ctx.state, data, { best: ctx.best, rp: ctx.rp })
      });
    }

    case "POST /v1/rankroad/claim": {  // 랭크 로드: 이번 시즌 도달한 단계 보상 모두 받기(상세 08)
      const claims = await authenticate(request, env);
      const { snapshot: data } = await pinLive(env);
      const r = await econMutate(env, data, claims.sub, (out, state) => `road:${state.season}:${out.tiers.join(",")}`, (state, ctx) => {
        const out = claimRankRoad(state, data, { best: ctx.best });
        return { ...out, reason: "rank_road", detail: { tiers: out.tiers, items: out.items } };
      });
      if (r.duplicate) throw new Error("nothing_to_claim");
      return json({ ok: true, gold: r.gold, items: r.items, tiers: r.tiers, balance: r.balance });
    }

    // ---------- 친구·소셜(상세 05) ----------
    case "POST /v1/presence": {  // 클라이언트 하트비트(1분마다): 온라인·자리 비움, 상태 숨기기
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      await rpc(env, "presence_touch", { p_account: claims.sub, p_away: input.away === undefined ? null : Boolean(input.away), p_room: null, p_hidden: input.hidden === undefined ? null : Boolean(input.hidden) });
      return json({ ok: true });
    }
    case "GET /v1/friends": {  // 친구 목록(온라인→자리 비움→게임 중→오프라인), 받은·보낸 요청, 받은 초대, 차단 목록, 내 친구 코드
      const claims = await authenticate(request, env);
      await rpc(env, "friend_code_get", { p_account: claims.sub });
      await rpc(env, "presence_touch", { p_account: claims.sub, p_away: null, p_room: null, p_hidden: null });
      const list = await rpc(env, "friends_list", { p_account: claims.sub });
      const show = (c) => (c ? `${codePrefix(env)}-${c}` : c);  // 서버에는 뒤 4~6자리만 저장, 접두어는 표시할 때(기획답변 17차 Q4)
      return json({ ok: true, ...list, code: show(list.code), friends: list.friends.map((f) => ({ ...f, code: show(f.code) })) });
    }
    case "POST /v1/friends/request": {  // { code: "ASTRA-XXXX" 또는 "XXXX" } 또는 { id: 계정 }
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      const id = input.id ? String(input.id) : null;
      if (id && !/^[0-9a-f-]{36}$/.test(id)) throw new Error("friend_not_found");
      const code = id ? null : friendCodeOf(input.code);
      if (!id && !code) throw new Error("friend_code_invalid");
      return json({ ok: true, ...(await rpc(env, "friend_request", { p_account: claims.sub, p_code: code, p_target: id })) });
    }
    case "POST /v1/friends/respond": {
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      return json({ ok: true, ...(await rpc(env, "friend_respond", { p_account: claims.sub, p_request: Number(input.id), p_accept: Boolean(input.accept) })) });
    }
    case "POST /v1/friends/remove": {
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      if (!/^[0-9a-f-]{36}$/.test(String(input.id ?? ""))) throw new Error("friend_not_found");
      await rpc(env, "friend_remove", { p_account: claims.sub, p_other: String(input.id) });
      return json({ ok: true });
    }
    case "POST /v1/friends/block": {  // { id, on: true|false } 차단 최대 100명
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      if (!/^[0-9a-f-]{36}$/.test(String(input.id ?? ""))) throw new Error("block_invalid");
      await rpc(env, "block_set", { p_account: claims.sub, p_other: String(input.id), p_on: input.on !== false });
      return json({ ok: true });
    }
    case "GET /v1/friends/search": {  // 닉네임 앞부분 검색(2자 이상)
      const claims = await authenticate(request, env);
      const q = String(url.searchParams.get("q") ?? "").trim();
      if (q.length < 2) throw new Error("query_too_short");
      return json({ ok: true, users: await rpc(env, "friend_search", { p_account: claims.sub, p_q: q.slice(0, 12) }) });
    }
    case "GET /v1/friends/recent": {  // 최근 대전 상대(최근 20판)
      const claims = await authenticate(request, env);
      return json({ ok: true, users: await rpc(env, "recent_opponents", { p_account: claims.sub }) });
    }
    case "POST /v1/friends/invite": {  // { friend, room } 친구방 초대(5분, 게임 중인 친구는 불가)
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      const room = String(input.room ?? "").toUpperCase();
      if (!ROOM_CODE.test(room) || !/^[0-9a-f-]{36}$/.test(String(input.friend ?? ""))) throw new Error("invite_invalid");
      return json({ ok: true, id: await rpc(env, "friend_invite", { p_account: claims.sub, p_friend: String(input.friend), p_room: room }) });
    }
    case "POST /v1/friends/invite/answer": {  // 초대 받기 → 방 코드(참가는 /v1/rooms/{code}/join)
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      const r = await rpc(env, "friend_invite_answer", { p_account: claims.sub, p_invite: Number(input.id) });
      if (!r || !r.valid) throw new Error("invite_expired");
      return json({ ok: true, room: r.room });
    }
    case "GET /v1/rank/friends": {  // 랭킹 보드 '친구' 탭
      const claims = await authenticate(request, env);
      const { snapshot: data } = await pinLive(env);
      const season = await currentSeason(env);
      const rows = await rpc(env, "rank_friends", { p_account: claims.sub, p_season: season.id });
      return json({ ok: true, season, rows: rows.map((r, i) => ({ rank: i + 1, ...r, tierName: tierName(data, r.tier) })) });
    }
    case "GET /v1/hall-of-fame":  // 명예의 전당(시즌별 레전드 최종 순위)
      return json({ ok: true, rows: await rpc(env, "hall_of_fame_list", { p_season: url.searchParams.get("season") ? Number(url.searchParams.get("season")) : null }) }, 200, { "cache-control": "public, max-age=300" });

    case "POST /v1/attendance/claim": {
      const claims = await authenticate(request, env);
      const { snapshot: data } = await pinLive(env);
      const day = periodKeys(Date.now(), econConfig(data)).day;
      const r = await econMutate(env, data, claims.sub, `att:${day}`, (state, ctx) => {
        const out = claimAttendance(state, ctx.cfg);
        return { ...out, reason: "attendance", detail: { day, cycleDay: out.cycleDay, parts: out.parts } };
      });
      if (r.duplicate) throw new Error("attendance_done");
      return json({ ok: true, gold: r.gold, balance: r.balance, cycleDay: r.cycleDay, parts: r.parts, econ: r.view });
    }

    case "POST /v1/missions/claim": {  // { kind: daily|weekly|season, id: 미션 ID | "all" }
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      const kind = String(input.kind ?? ""), id = String(input.id ?? "all");
      if (!/^[A-Z0-9_]{2,40}$|^all$/.test(id)) throw new Error("mission_invalid");
      const { snapshot: data } = await pinLive(env);
      const r = await econMutate(env, data, claims.sub, (out, state) => `mis:${kind}:${kind === "daily" ? state.day : kind === "weekly" ? state.week : state.season}:${out.ids.sort().join(",")}`,
        (state, ctx) => ({ ...claimMissions(state, kind, id, ctx.cfg), reason: "mission", detail: { kind } }));
      if (r.duplicate) throw new Error("mission_claimed");
      // 챔피언스 컵 추가 참가권(상세 08): 설정값 cup_bonus_mission에 적은 주간 미션을 받으면 그 주(다가오는 주말) 1회
      const bonusId = cupBonusMission(data);
      let cupBonus = false;
      if (kind === "weekly" && bonusId && r.ids.includes(bonusId)) cupBonus = Boolean(await rpc(env, "cup_bonus_grant", { p_account: claims.sub, p_week: cupWindow().week }).catch(() => false));
      return json({ ok: true, gold: r.gold, balance: r.balance, claimed: r.ids, econ: r.view, cupBonus });
    }

    case "POST /v1/missions/reroll": {  // 일일 미션 하루 1개 무료 교체
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      const { snapshot: data } = await pinLive(env);
      const r = await econMutate(env, data, claims.sub, (out, state) => `reroll:${state.day}:${state.daily.rerolls}`,
        (state, ctx) => ({ ...rerollDaily(state, String(input.id ?? ""), claims.sub, ctx.cfg), gold: 0, reason: "reroll" }));
      return json({ ok: true, newId: r.id, econ: r.view });
    }

    case "GET /v1/mail": {
      const claims = await authenticate(request, env);
      return json({ ok: true, mail: await rpc(env, "mail_list", { p_account: claims.sub }) });
    }

    case "POST /v1/mail/claim": {  // { ids?: [...] } 없으면 모두 받기
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      const ids = Array.isArray(input.ids) ? input.ids.map(String) : null;
      if (ids && (ids.length > 100 || ids.some((x) => !/^[0-9a-f-]{36}$/.test(x)))) throw new Error("mail_invalid");
      return json({ ok: true, ...(await rpc(env, "mail_claim", { p_account: claims.sub, p_ids: ids })) });
    }

    case "GET /v1/shop": {
      const claims = await authenticate(request, env);
      return json({ ok: true, offers: await rpc(env, "shop_list", { p_account: claims.sub }), note: "능력치 변화 없음" });
    }

    case "POST /v1/shop/buy": {  // 골드 구매 { offerId, price, requestId(재시도해도 한 번만) }
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      if (!/^[A-Za-z0-9-]{8,64}$/.test(String(input.requestId ?? ""))) throw new Error("request_id_invalid");
      const r = await rpc(env, "shop_buy_gold", { p_account: claims.sub, p_offer: String(input.offerId ?? ""), p_price: Number(input.price), p_ref: `buy:${input.requestId}` });
      return json({ ok: true, ...r });
    }

    case "POST /v1/shop/orders": {  // 현금 주문 시작 { offerId, price } → Steam 오버레이 / dev
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      return json({ ok: true, ...(await startOrder(env, claims.sub, String(input.offerId ?? ""), Number(input.price))) });
    }

    case "GET /v1/inventory": {
      const claims = await authenticate(request, env);
      return json({ ok: true, ...(await rpc(env, "inventory_list", { p_account: claims.sub })) });
    }

    case "GET /v1/assets": {  // 게임이 받는 이미지 목록(데이터 버전과 별개, 기획지시 에셋분리). 파일명이 내용 해시라 바뀐 것만 내려받으면 됨
      const a = await loadAssets(env, rpc);
      const etag = `"a-${a.rev}"`;
      const headers = { etag, "cache-control": "public, max-age=60" };
      if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
      return json({ ok: true, rev: a.rev, ...assetManifest(a.shaped, env) }, 200, headers);
    }

    // ---------- 지표 로그(상세 12) ----------
    case "POST /v1/events": {  // { platform, device, appVer, dataVer, events: [{ name, at, props }] } 최대 50개, 앱이 모아서 보냄
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      const { rows, platform, device, appVer } = clientEvents(input, claims.sub);
      if (platform || device || appVer) await rpc(env, "client_profile", { p_account: claims.sub, p_platform: platform, p_device: device, p_app_ver: appVer });
      const saved = rows.length ? await rpc(env, "events_add", { p_rows: rows }) : 0;
      return json({ ok: true, saved, dropped: input.events.length - rows.length });
    }

    // ---------- 계정(상세 09): 정보, 로그인 수단 연결, 삭제 요청 ----------
    case "GET /v1/account": {
      const claims = await authenticate(request, env);
      const season = await currentSeason(env);
      return json({ ok: true, ...(await rpc(env, "account_info", { p_account: claims.sub, p_season: season.id })) });
    }
    case "POST /v1/account/link": {  // { provider: "steam", ticket } (개발 환경은 { provider: "steam", devSteamId }), choice: null | "current" | "other"
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      const provider = String(input.provider ?? "");
      let uid;
      if (provider === "steam" && input.ticket) uid = (await verifySteamTicket(env, input.ticket)).steamId;
      else if (provider === "steam" && env.DEV_LOGIN === "1" && /^[a-z0-9_-]{3,32}$/.test(String(input.devSteamId ?? ""))) uid = `dev:${input.devSteamId}`;
      else if (["google", "apple"].includes(provider)) throw new Error("link_unavailable");  // 모바일 2단계 출시 때(상세 09)
      else throw new Error("provider_invalid");
      const choice = ["current", "other"].includes(input.choice) ? input.choice : null;
      const season = await currentSeason(env);
      const r = await rpc(env, "identity_link", { p_account: claims.sub, p_provider: provider, p_uid: uid, p_choice: choice, p_season: season.id });
      if (r.status === "switch") return json({ ok: true, status: "switch", session: await issueSession(env, provider, uid, "steam", deviceId(input)) });
      return json({ ok: true, ...r });
    }
    case "POST /v1/account/delete": {  // { confirm: true } 14일 유예, 그동안 로그인하면 취소. 세션은 바로 끝남
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      if (input.confirm !== true) throw new Error("confirm_required");
      return json({ ok: true, ...(await rpc(env, "account_delete_request", { p_account: claims.sub })) });
    }

    case "POST /v1/profile/name": {  // 닉네임 2~12자, 첫 변경 무료·이후 골드(상세 05)
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      const name = String(input.name ?? "").trim();
      if (!/^[\p{L}\p{N}_]{2,12}$/u.test(name)) throw new Error("name_invalid");
      if (!/^[A-Za-z0-9-]{8,64}$/.test(String(input.requestId ?? ""))) throw new Error("request_id_invalid");
      const { snapshot: data } = await pinLive(env);
      return json({ ok: true, ...(await rpc(env, "profile_rename", { p_account: claims.sub, p_name: name, p_cost: econConfig(data).econ_name_change_gold, p_ref: `name:${input.requestId}` })) });
    }

    case "POST /v1/profile/equip": {  // { skins:{AU:id}, cardback, frame, title, emotes:[최대 4] } 가진 것만
      const claims = await authenticate(request, env);
      const input = await readJson(request);
      const { snapshot: data } = await pinLive(env);
      const inv = await rpc(env, "inventory_list", { p_account: claims.sub });
      const kinds = Object.fromEntries((inv.items ?? []).map((i) => [i.id, i]));
      const eq = {}, items = [];
      const need = (id, ok) => { if (!kinds[id] || !ok(kinds[id])) throw new Error("item_not_owned"); items.push(id); return id; };
      if (input.skins && typeof input.skins === "object") {
        eq.skins = {};
        for (const [c, id] of Object.entries(input.skins)) {
          if (!data.characters?.[c]) throw new Error("character_invalid");
          if (id) eq.skins[c] = need(String(id), (it) => it.kind.startsWith("skin") && it.character === c);
        }
      }
      for (const [slot, kind] of [["cardback", "cardback"], ["frame", "frame"], ["title", "title"]]) {
        if (input[slot]) eq[slot] = need(String(input[slot]), (it) => it.kind === kind);
      }
      if (input.emotes) {
        if (!Array.isArray(input.emotes) || input.emotes.length > 4 || new Set(input.emotes).size !== input.emotes.length) throw new Error("emotes_invalid");
        eq.emotes = input.emotes.map((id) => need(String(id), (it) => it.kind === "emote"));
      }
      return json({ ok: true, equipped: await rpc(env, "profile_equip", { p_account: claims.sub, p_equipped: eq, p_items: items }) });
    }

    case "GET /dev":
      if (env.DEV_LOGIN !== "1") throw new Error("not_found");
      return new Response(TEST_PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

    default: {
      const om = url.pathname.match(/^\/v1\/shop\/orders\/(\d{1,19})\/(finalize|cancel)$/);
      if (om && request.method === "POST") {  // Steam 승인 콜백 뒤 확정 / 창 닫음
        const claims = await authenticate(request, env);
        if (om[2] === "cancel") return json(await cancelOrder(env, claims.sub, om[1]));
        return json({ ok: true, ...(await finishOrder(env, claims.sub, om[1])) });
      }
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
  // 5분마다: 예약 배포, 예약 우편(wrangler.jsonc triggers.crons)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env).catch((e) => console.error("cron", e.message)));
  },
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      const code = error instanceof Error ? error.message : "internal_error";
      const known = STATUS[code] ?? (/^[a-z_]+$/.test(code) ? 400 : 500);
      if (known === 500) console.error("internal_error", new URL(request.url).pathname, code.slice(0, 300));
      return json({ ok: false, error: known === 500 ? "internal_error" : code, ...(error.extra ?? {}), ...(known === 500 && env.DEV_LOGIN === "1" ? { debug: code.slice(0, 200) } : {}) }, known);
    }
  }
};

// 컵 규칙·보상표(시트 `챔피언스컵`)·특별 주간(시즌 3주차 골드 cup_special_mult배) — 클라이언트 표시용
function cupView(data, season, week) {
  const cfg = cupRewardCfg(data);
  const special = Boolean(season?.starts_at) && cupSeasonWeek(season.starts_at, week) === cfg.special_week && cfg.special_mult !== 1;
  const mult = special ? cfg.special_mult : 1;
  return { rules: { minTier: CUP.minTier, wins: CUP.wins, losses: CUP.losses, widenAfterSec: CUP.widenAfterSec, waitSec: cupWaitSec(data), bonusMission: cupBonusMission(data) },
    special, specialMult: cfg.special_mult,
    rewards: cfg.tiers.map((t) => ({ ...t, gold: Math.round(t.gold * mult), emote: t.emote && Boolean(cfg.emote_item) })) };
}
