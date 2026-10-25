// 백오피스 API (/bo/v1/*). 직원 계정·역할 권한(상세 14 권한 표), 모든 조치는 감사 로그.
// 게임 데이터는 xlsx 업로드 → 자동 검증 → 검수(자기 승인 금지) → 예약·즉시 배포 → 롤백 한 길로만 바뀐다.
import { rpc } from "../db.mjs";
import { currentSeason } from "../ranking.mjs";
import { sha256Hex, signAccess, verifyAccess } from "../tokens.mjs";
import { importWorkbook } from "./importer.mjs";
import { readXlsx } from "./xlsx.mjs";
import { pinLive } from "../gamedata.mjs";
import { payoutConfig, seasonSkin, tierGroups } from "../season.mjs";
import { cupRewardCfg, cupWindow } from "../cup.mjs";
import { ART, SLOTS, assetPath, checkRegions, checkUpload, publicBase, slotOf, storagePut, webpInfo } from "../assets.mjs";

export const STAFF_TTL_SECONDS = 8 * 3600;
const PBKDF2_ITER = 100000;  // Workers WebCrypto 상한
const MAX_JSON = 64 * 1024;
const MAX_XLSX = 4 * 1024 * 1024;

// 상세 14 권한 표
export const PERMS = {
  dashboard: ["planner", "reviewer", "admin", "ops"],
  data_view: ["planner", "reviewer", "admin", "ops"],
  data_edit: ["planner", "admin"],
  data_review: ["reviewer", "admin"],
  data_deploy: ["admin"],
  shop: ["admin", "ops"],
  events: ["admin", "ops"],
  users: ["admin", "ops"],
  audit: ["planner", "reviewer", "admin", "ops"],
  staff: ["admin"]
};
export const ROLE_NAMES = { planner: "기획자", reviewer: "검수자", admin: "관리자", ops: "운영·CS" };

const enc = new TextEncoder();
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");
export async function hashPassword(password, saltHex = hex(crypto.getRandomValues(new Uint8Array(16))), iter = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(saltHex), iterations: iter }, key, 256);
  return { hash: hex(new Uint8Array(bits)), salt: saltHex, iter };
}
function sameHex(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const boSecret = (env) => `${env.TOKEN_SECRET}|backoffice`;  // 플레이어 토큰과 섞이지 않게 키를 나눈다

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function body(request, limit = MAX_JSON) {
  const text = await request.text();
  if (text.length > limit) throw new Error("body_too_large");
  try { return text ? JSON.parse(text) : {}; } catch { throw new Error("json_invalid"); }
}
const fail = (code, extra) => Object.assign(new Error(code), { extra });

async function staffOf(request, env) {
  const h = request.headers.get("authorization") ?? "";
  if (!h.startsWith("Bearer ")) throw new Error("auth_required");
  const claims = await verifyAccess(boSecret(env), h.slice(7));
  if (claims.typ !== "staff") throw new Error("auth_invalid");
  const s = await rpc(env, "staff_session", { p_session: claims.sid });
  if (!s) throw new Error("session_ended");
  return { ...s, sid: claims.sid };
}
function allow(staff, perm) {
  if (!PERMS[perm].includes(staff.role)) throw fail("forbidden", { need: PERMS[perm].map((r) => ROLE_NAMES[r]) });
}
const audit = (env, staff, target, action, detail = {}, reason = "") => rpc(env, "audit_add", { p_staff: staff.id, p_target: target, p_action: action, p_detail: detail, p_reason: reason });
const reasonOf = (input, min = 2) => { const r = String(input.reason ?? "").trim(); if (r.length < min) throw fail("reason_required", { min }); return r; };

// ---------- 데이터 비교(라이브 대비 변경) ----------
const ENT = ["characters", "cards", "spells", "settings", "presets", "tables"];
// 표(tables)는 행 단위로 편다: id가 있는 객체 배열은 "missions.weekly.W02"처럼 행마다, 나머지는 키마다
function flattenTables(t = {}) {
  const out = {};
  const walk = (prefix, v) => {
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object" && ("id" in x || "no" in x || "count" in x))) {
      for (const x of v) out[`${prefix}.${x.id ?? x.no ?? x.count}`] = x;
    } else if (v && typeof v === "object" && !Array.isArray(v) && Object.values(v).some((x) => x && typeof x === "object")) {
      for (const [k, x] of Object.entries(v)) walk(`${prefix}.${k}`, x);
    } else out[prefix] = v;
  };
  for (const [name, body] of Object.entries(t)) walk(name, body);
  return out;
}

export function diffData(a = {}, b = {}) {
  const out = [];
  for (const kind of ENT) {
    const A = kind === "tables" ? flattenTables(a.tables) : a[kind] ?? {};
    const B = kind === "tables" ? flattenTables(b.tables) : b[kind] ?? {};
    for (const id of new Set([...Object.keys(A), ...Object.keys(B)])) {
      if (!(id in A)) { out.push({ kind, id, change: "added", to: B[id] }); continue; }
      if (!(id in B)) { out.push({ kind, id, change: "removed", from: A[id] }); continue; }
      const x = A[id], y = B[id];
      if (JSON.stringify(x) === JSON.stringify(y)) continue;
      if (x && y && typeof x === "object" && !Array.isArray(x)) {
        const fields = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((f) => JSON.stringify(x[f]) !== JSON.stringify(y[f]));
        for (const f of fields) out.push({ kind, id, field: f, from: x[f] ?? null, to: y[f] ?? null });
      } else out.push({ kind, id, change: "changed", from: x, to: y });
    }
  }
  return out;
}

// ---------- 크론(5분마다): 예약 배포, 예약 우편 ----------
export async function runCron(env) {
  const due = await rpc(env, "bo_due_publishes", {});
  const done = [];
  for (const d of due ?? []) {
    try {
      await rpc(env, "bo_publish", { p_version: d.version, p_staff: d.by });
      await rpc(env, "audit_add", { p_staff: d.by, p_target: `데이터 v${d.version}`, p_action: "예약 배포 실행", p_detail: { version: d.version }, p_reason: "" });
      done.push(d.version);
    } catch { /* 다음 크론에서 다시 */ }
  }
  const season = await currentSeason(env).catch(() => ({ id: 0 }));  // 끝난 시즌이면 여기서 새 시즌이 생긴다
  const mailed = await rpc(env, "mail_jobs_run", { p_season: season.id });
  // 시즌 보상(상세 08): 끝났고 아직 지급 안 한 시즌 → 최고 도달 티어 기준 우편, 레전드 = 마스터 상위 N%(상한)
  const paid = [];
  for (const s of (await rpc(env, "seasons_due_payout", {})) ?? []) {
    try {
      const { snapshot: data } = await pinLive(env);
      const masters = await rpc(env, "season_masters", { p_season: s.id });
      const skin = seasonSkin(data, s.id);
      paid.push({ season: s.id, mailed: await rpc(env, "season_payout", { p_season: s.id, p_cfg: payoutConfig(data, masters, { skinItem: skin }) }) });
    } catch { /* 다음 크론에서 다시 */ }
  }
  // 정리(한 시간에 한 번): 유예 지난 삭제 요청 계정 익명화(상세 09), 보관 기간 지난 상세 로그 삭제(상세 12)
  let purged = null;
  if (new Date().getUTCMinutes() < 5 || env.CRON_PURGE_ALWAYS === "1") {
    const set = (await pinLive(env).catch(() => ({ snapshot: {} }))).snapshot?.settings ?? {};
    purged = {
      accounts: await rpc(env, "account_purge_due", { p_days: Number(set.account_delete_grace_days ?? 14), p_retain_years: Number(set.payment_retain_years ?? 5), p_limit: 50 }).catch(() => null),
      events: await rpc(env, "events_purge", { p_days: Number(set.log_retention_days ?? 90), p_limit: 20000 }).catch(() => null)
    };
  }
  // 챔피언스 컵(상세 08): 지난 주말에 끝나지 않은 참가는 그 성적으로 마감·보상
  const cupLive = (await pinLive(env).catch(() => ({ snapshot: {} }))).snapshot;
  const cupClosed = await rpc(env, "cup_close_week", { p_before: cupWindow().week, p_cfg: cupRewardCfg(cupLive) }).catch(() => null);
  if (purged) purged.rate = await rpc(env, "rate_purge", { p_keep_sec: 3600 }).catch(() => null);
  return { published: done, mailed, seasons: paid, purged, cupClosed };
}

export async function handleBo(request, env, url) {
  const route = `${request.method} ${url.pathname.replace(/^\/bo\/v1/, "")}`;
  switch (route) {
    // ---------- 계정 ----------
    case "GET /setup": return json({ ok: true, staff: await rpc(env, "staff_count", {}) });

    case "POST /register": {  // 초대 코드로 가입(첫 관리자도 운영자가 만든 초대 코드로)
      const input = await body(request);
      const login = String(input.login ?? "").trim().toLowerCase(), name = String(input.name ?? "").trim(), pw = String(input.password ?? "");
      if (!/^[a-z0-9_.-]{3,32}$/.test(login)) throw new Error("login_invalid");
      if (!name || name.length > 24) throw new Error("name_invalid");
      if (pw.length < 10) throw fail("password_weak", { min: 10 });
      const h = await hashPassword(pw);
      const r = await rpc(env, "staff_register", { p_code_hash: await sha256Hex(String(input.code ?? "").trim()), p_login: login, p_name: name, p_hash: h.hash, p_salt: h.salt, p_iter: h.iter });
      return json({ ok: true, role: r.role });
    }

    case "POST /login": {
      const input = await body(request);
      const s = await rpc(env, "staff_by_login", { p_login: String(input.login ?? "").trim().toLowerCase() });
      const pw = String(input.password ?? "");
      if (!s || !s.active) { await hashPassword(pw, "0".repeat(32)); throw new Error("login_failed"); }  // 계정 유무가 시간 차로 드러나지 않게
      if (s.locked_until && Date.parse(s.locked_until) > Date.now()) throw fail("login_locked", { until: s.locked_until });
      const h = await hashPassword(pw, s.pw_salt, s.pw_iter);
      const ok = sameHex(h.hash, s.pw_hash);
      const sid = await rpc(env, "staff_login_result", { p_staff: s.id, p_ok: ok, p_ttl_seconds: STAFF_TTL_SECONDS });
      if (!ok) throw new Error("login_failed");
      const token = await signAccess(boSecret(env), { sub: s.id, sid, typ: "staff" }, STAFF_TTL_SECONDS);
      return json({ ok: true, token, staff: { id: s.id, login: s.login, name: s.name, role: s.role } });
    }

    case "POST /logout": { const st = await staffOf(request, env); await rpc(env, "staff_logout", { p_session: st.sid }); return json({ ok: true }); }

    case "GET /me": {
      const st = await staffOf(request, env);
      const cfg = await rpc(env, "bo_config_get", {});
      return json({ ok: true, staff: st, perms: Object.fromEntries(Object.entries(PERMS).map(([k, v]) => [k, v.includes(st.role)])),
        soloMode: cfg?.solo_mode?.value === true });
    }

    // 1인 운영 모드(상세 14 데이터 반영 경로): 켜면 관리자가 자기 초안도 승인. 관리자만, 사유 필수, 감사 로그
    case "GET /settings": { const st = await staffOf(request, env); allow(st, "audit"); return json({ ok: true, settings: await rpc(env, "bo_config_get", {}) }); }
    case "POST /settings": {
      const st = await staffOf(request, env); allow(st, "staff");
      const input = await body(request);
      if (input.key !== "solo_mode" || typeof input.value !== "boolean") throw new Error("value_invalid");
      return json({ ok: true, settings: await rpc(env, "bo_config_set", { p_key: input.key, p_value: input.value, p_staff: st.id, p_reason: reasonOf(input) }) });
    }

    case "POST /password": {
      const st = await staffOf(request, env);
      const input = await body(request);
      const s = await rpc(env, "staff_by_login", { p_login: st.login });
      const cur = await hashPassword(String(input.current ?? ""), s.pw_salt, s.pw_iter);
      if (!sameHex(cur.hash, s.pw_hash)) throw new Error("login_failed");
      if (String(input.password ?? "").length < 10) throw fail("password_weak", { min: 10 });
      const h = await hashPassword(String(input.password));
      await rpc(env, "staff_password", { p_staff: st.id, p_hash: h.hash, p_salt: h.salt, p_iter: h.iter });
      await audit(env, st, `직원 ${st.login}`, "비밀번호 변경");
      return json({ ok: true });
    }

    // ---------- 대시보드·감사 로그 ----------
    // ---------- 지표(상세 12 KPI·운영 대시보드) ----------
    case "GET /metrics": {  // ?from=YYYY-MM-DD&to=YYYY-MM-DD (KST 날짜, 기본 최근 7일)
      const st = await staffOf(request, env); allow(st, "dashboard");
      const day = (v, d) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? new Date(`${v}T00:00:00+09:00`) : d);
      const to = day(url.searchParams.get("to"), null);
      const toAt = to ? new Date(to.getTime() + 86400000) : new Date();
      const from = day(url.searchParams.get("from"), new Date(toAt.getTime() - 7 * 86400000));
      const m = await rpc(env, "bo_metrics", { p_from: from.toISOString(), p_to: toAt.toISOString() });
      const { snapshot: data } = await pinLive(env);
      return json({ ok: true, ...m, characterGroups: characterWinRates(data, m.characters ?? []) });
    }

    // ---------- 어뷰징 의심(상세 13 자동 탐지 → 사람이 판단) ----------
    case "GET /suspects": {
      const st = await staffOf(request, env); allow(st, "users");
      const { snapshot: data } = await pinLive(env);
      const set = data?.settings ?? {};
      const pick = (k, d) => Number(set[k] ?? d);
      const cfg = { days: Number(url.searchParams.get("days") ?? 7), macro_min_turns: pick("macro_min_turns", 30), macro_std_sec: pick("macro_std_sec", 0.7),
        marathon_hours: pick("marathon_hours", 12), marathon_games: pick("marathon_games", 100), pair_games: 3,
        smurf_days: pick("smurf_days", 14), smurf_games: pick("smurf_report_games", 10), smurf_winrate: pick("smurf_report_winrate", 0.75) };
      return json({ ok: true, cfg, ...(await rpc(env, "bo_suspects", { p_cfg: cfg })) });
    }

    // ---------- 금칙어(상세 13 닉네임·프로필) ----------
    case "GET /words": { const st = await staffOf(request, env); allow(st, "users"); return json({ ok: true, words: await rpc(env, "bo_words", { p_q: url.searchParams.get("q") ?? "" }) }); }
    case "GET /words/flagged": { const st = await staffOf(request, env); allow(st, "users"); return json({ ok: true, users: await rpc(env, "bo_names_flagged", { p_limit: 200 }) }); }
    case "GET /words/test": { const st = await staffOf(request, env); allow(st, "users"); return json({ ok: true, hits: await rpc(env, "name_matches", { p_name: url.searchParams.get("name") ?? "" }) }); }
    case "POST /words": {
      const st = await staffOf(request, env); allow(st, "users");
      const b = await body(request);
      const pick = (v, list, d) => (list.includes(v) ? v : d);
      return json({ ok: true, id: await rpc(env, "bo_word_add", { p_staff: st.id, p_word: String(b.word ?? "").slice(0, 40), p_lang: pick(b.lang, ["ko", "en", "ja", "any"], "ko"),
        p_kind: pick(b.kind, ["profanity", "hate", "impersonation", "staff", "other"], "profanity"), p_match: pick(b.match, ["contains", "prefix", "exact"], "contains"), p_note: String(b.note ?? "").slice(0, 200) }) });
    }
    case "POST /words/bulk": {  // { text: "씨발, 시발\n…", kind, match, lang, note } 쉼표·줄바꿈으로 나눔, 최대 500개
      const st = await staffOf(request, env); allow(st, "users");
      const b = await body(request);
      const words = [...new Set(String(b.text ?? "").split(/[,\n\r]+/).map((x) => x.trim()).filter(Boolean))];
      if (!words.length || words.length > 500) throw new Error("value_invalid");
      const items = words.map((word) => ({ word, kind: b.kind, match: b.match, lang: b.lang }));
      return json({ ok: true, ...(await rpc(env, "bo_words_bulk", { p_staff: st.id, p_items: items, p_note: String(b.note ?? "").slice(0, 200) })) });
    }
    // 허용 단어(예외): 관리자만(기획답변 19차)
    case "GET /words/allowed": { const st = await staffOf(request, env); allow(st, "users"); return json({ ok: true, words: await rpc(env, "bo_allowed", { p_q: url.searchParams.get("q") ?? "" }) }); }
    case "POST /words/allowed": {  // { text: "성기사, 시발점\n…", note }
      const st = await staffOf(request, env); allow(st, "staff");
      const b = await body(request);
      const words = [...new Set(String(b.text ?? "").split(/[,\n\r]+/).map((x) => x.trim()).filter(Boolean))];
      if (!words.length || words.length > 500) throw new Error("value_invalid");
      return json({ ok: true, ...(await rpc(env, "bo_allowed_bulk", { p_staff: st.id, p_words: words, p_note: String(b.note ?? "").slice(0, 200) })) });
    }
    case "POST /words/allowed/remove": {
      const st = await staffOf(request, env); allow(st, "staff");
      const b = await body(request);
      if (!String(b.reason ?? "").trim()) throw new Error("reason_required");
      await rpc(env, "bo_allowed_remove", { p_staff: st.id, p_id: Number(b.id), p_reason: String(b.reason).slice(0, 200) });
      return json({ ok: true });
    }
    case "POST /words/match": {  // { id, match: contains|prefix|exact, reason } 오탐이면 일치로
      const st = await staffOf(request, env); allow(st, "users");
      const b = await body(request);
      if (!String(b.reason ?? "").trim()) throw new Error("reason_required");
      await rpc(env, "bo_word_match", { p_staff: st.id, p_id: Number(b.id), p_match: String(b.match ?? ""), p_reason: String(b.reason).slice(0, 200) });
      return json({ ok: true });
    }
    case "POST /words/check": {  // { names: [...] } 여러 닉네임 한 번에 미리 검사(오탐 점검)
      const st = await staffOf(request, env); allow(st, "users");
      const b = await body(request);
      const names = (Array.isArray(b.names) ? b.names : String(b.names ?? "").split(/[,\n\r]+/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 200);
      return json({ ok: true, results: await rpc(env, "names_check", { p_names: names }) });
    }
    case "POST /words/remove": {
      const st = await staffOf(request, env); allow(st, "users");
      const b = await body(request);
      if (!String(b.reason ?? "").trim()) throw new Error("reason_required");
      await rpc(env, "bo_word_remove", { p_staff: st.id, p_id: Number(b.id), p_reason: String(b.reason).slice(0, 200) });
      return json({ ok: true });
    }

    case "GET /dashboard": { const st = await staffOf(request, env); allow(st, "dashboard"); return json({ ok: true, ...(await rpc(env, "bo_dashboard", {})), assetUsage: await assetUsage(env) }); }

    // ---------- 에셋 등록(상세 14·10, 기획답변 18·19차) ----------
    case "GET /assets": {  // ?version=N (없으면 편집 중인 최신 초안, 없으면 라이브 보기)
      const st = await staffOf(request, env); allow(st, "data_view");
      const vs = await rpc(env, "bo_versions", { p_limit: 30 });
      const drafts = vs.versions.filter((v) => v.status === "draft" && ["editing", "rejected"].includes(v.state)).map((v) => ({ id: v.id, note: v.note, by: v.created_login, basedOn: v.based_on }));
      const version = Number(url.searchParams.get("version")) || drafts[0]?.id || vs.live;
      const data = await rpc(env, "bo_version_data", { p_version: version });
      const { snapshot: live } = await pinLive(env);
      return json({ ok: true, version, live: vs.live, editable: drafts.some((d) => d.id === version), drafts, base: publicBase(env),
        spec: { art: ART, slots: SLOTS, fullMaxKb: Number(live?.settings?.asset_full_max_kb ?? 1024), faceMaxKb: Number(live?.settings?.asset_face_max_kb ?? 100) },
        characters: Object.entries(data.characters ?? {}).map(([id, c]) => ({ id, name: c.name, faction: c.faction })),
        assets: data.tables?.assets ?? {}, art: data.tables?.art ?? {}, usage: await assetUsage(env) });
    }
    case "POST /assets/draft": {
      const st = await staffOf(request, env); allow(st, "data_edit");
      const b = await body(request);
      return json({ ok: true, version: await rpc(env, "bo_asset_draft", { p_staff: st.id, p_note: String(b.note ?? "").slice(0, 200) }) });
    }
    case "POST /assets/upload": {  // 본문 = 압축한 WebP. ?version&kind=slot|full|thumb|face&slot=ID 또는 &char=AU&skin=000
      const st = await staffOf(request, env); allow(st, "data_edit");
      const version = Number(url.searchParams.get("version"));
      const kind = url.searchParams.get("kind");
      const bytes = new Uint8Array(await request.arrayBuffer());
      const slot = kind === "slot" ? slotOf(url.searchParams.get("slot")) : null;
      if (kind === "slot" && !slot) throw new Error("asset_slot_invalid");
      const ch = url.searchParams.get("char"), skin = url.searchParams.get("skin") ?? "000";
      if (kind !== "slot") {
        if (!["full", "thumb", "face"].includes(kind)) throw new Error("asset_kind_invalid");
        if (!/^\d{3}$/.test(skin)) throw new Error("asset_skin_invalid");
        const data = await rpc(env, "bo_version_data", { p_version: version });
        if (!data.characters?.[ch]) throw new Error("asset_char_invalid");
      }
      const info = webpInfo(bytes);
      checkUpload(kind, info, bytes.length, slot);
      const prefix = kind === "slot" ? `slots/${slot.id}` : `art/${ch}_${skin}_${kind}`;
      const path = assetPath(prefix, [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((x) => x.toString(16).padStart(2, "0")).join(""));
      await storagePut(env, path, bytes);
      const value = { path, w: info.w, h: info.h, bytes: bytes.length, alpha: info.alpha, at: new Date().toISOString() };
      const target = kind === "slot" ? ["assets", ["slots", slot.id]] : ["art", [ch, skin, kind]];
      await rpc(env, "bo_asset_set", { p_staff: st.id, p_version: version, p_table: target[0], p_path: target[1], p_value: value,
        p_action: kind === "slot" ? "슬롯 파일 교체" : `캐릭터 이미지 교체(${kind})`, p_detail: { path, bytes: bytes.length, w: info.w, h: info.h } });
      const { snapshot: live } = await pinLive(env);
      const capKb = kind === "face" ? Number(live?.settings?.asset_face_max_kb ?? 100) : kind === "full" ? Number(live?.settings?.asset_full_max_kb ?? 1024) : null;
      const warnings = capKb && bytes.length > capKb * 1024 ? [`${kind} ${Math.round(bytes.length / 1024)}KB — 목표 ${capKb}KB 초과(상세 14)`] : [];
      return json({ ok: true, path, url: publicBase(env) + path, ...value, warnings });
    }
    case "POST /assets/regions": {  // { version, char, skin, card:{x,y,w,h}, face:{x,y,w,h} } 비율 좌표
      const st = await staffOf(request, env); allow(st, "data_edit");
      const b = await body(request);
      const version = Number(b.version), skin = String(b.skin ?? "000");
      const data = await rpc(env, "bo_version_data", { p_version: version });
      const full = data.tables?.art?.[b.char]?.[skin]?.full;
      if (!full) throw new Error("asset_full_missing");
      const r = checkRegions(full, b.card, b.face);
      await rpc(env, "bo_asset_set", { p_staff: st.id, p_version: version, p_table: "art", p_path: [b.char, skin, "card"], p_value: r.card, p_action: "카드 영역 지정", p_detail: r.card });
      await rpc(env, "bo_asset_set", { p_staff: st.id, p_version: version, p_table: "art", p_path: [b.char, skin, "faceRect"], p_value: r.face, p_action: "얼굴 영역 지정", p_detail: r.face });
      return json({ ok: true, ...r });
    }
    case "POST /assets/remove": {  // { version, slot } 슬롯 파일 빼기(게임 내장 기본 이미지로) 또는 { version, char, skin, kind: "face"|"skin" }
      const st = await staffOf(request, env); allow(st, "data_edit");
      const b = await body(request);
      const version = Number(b.version);
      if (b.slot) {
        if (!slotOf(b.slot)) throw new Error("asset_slot_invalid");
        await rpc(env, "bo_asset_set", { p_staff: st.id, p_version: version, p_table: "assets", p_path: ["slots", b.slot], p_value: null, p_action: "슬롯 파일 빼기(내장 기본 이미지)", p_detail: {} });
      } else {
        if (!["face", "skin"].includes(b.kind) || !/^[A-Z]{2,3}$/.test(String(b.char ?? "")) || !/^\d{3}$/.test(String(b.skin ?? ""))) throw new Error("value_invalid");
        const path = b.kind === "face" ? [b.char, b.skin, "face"] : [b.char, b.skin];
        await rpc(env, "bo_asset_set", { p_staff: st.id, p_version: version, p_table: "art", p_path: path, p_value: null, p_action: b.kind === "face" ? "얼굴 파일 빼기(영역으로 잘라 씀)" : "스킨 이미지 빼기", p_detail: {} });
      }
      return json({ ok: true });
    }
    case "GET /audit": {
      const st = await staffOf(request, env); allow(st, "audit");
      const before = url.searchParams.get("before");
      return json({ ok: true, rows: await rpc(env, "audit_list", { p_limit: 100, p_before: before ? Number(before) : null, p_q: url.searchParams.get("q") ?? "" }) });
    }

    // ---------- 직원·권한 ----------
    case "GET /staff": { const st = await staffOf(request, env); allow(st, "staff"); return json({ ok: true, staff: await rpc(env, "staff_list", {}) }); }
    case "POST /staff/invite": {
      const st = await staffOf(request, env); allow(st, "staff");
      const input = await body(request);
      if (!ROLE_NAMES[input.role]) throw new Error("role_invalid");
      const code = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => "23456789ABCDEFGHJKMNPQRSTUVWXYZ"[b % 31]).join("").replace(/(.{4})(?!$)/g, "$1-");
      await rpc(env, "staff_invite_create", { p_code_hash: await sha256Hex(code), p_role: input.role, p_by: st.id, p_days: 2 });
      await audit(env, st, `초대 ${ROLE_NAMES[input.role]}`, "직원 초대", { role: input.role });
      return json({ ok: true, code, expiresInDays: 2 });  // 코드는 이 응답에서 한 번만 보인다(서버에는 해시만)
    }
    case "POST /staff/update": {
      const st = await staffOf(request, env); allow(st, "staff");
      const input = await body(request);
      if (input.role !== undefined && !ROLE_NAMES[input.role]) throw new Error("role_invalid");
      await rpc(env, "staff_update", { p_staff: String(input.id), p_role: input.role ?? null, p_active: input.active ?? null });
      await audit(env, st, `직원 ${input.id}`, "권한 변경", { role: input.role ?? null, active: input.active ?? null }, String(input.reason ?? ""));
      return json({ ok: true });
    }

    // ---------- 게임 데이터 ----------
    case "GET /data/versions": { const st = await staffOf(request, env); allow(st, "data_view"); return json({ ok: true, ...(await rpc(env, "bo_versions", { p_limit: 40 })) }); }

    case "POST /data/import": {  // 본문 = xlsx 파일 그대로. ?note=…&based_on=N(기본 라이브)
      const st = await staffOf(request, env); allow(st, "data_edit");
      const buf = new Uint8Array(await request.arrayBuffer());
      if (buf.length > MAX_XLSX) throw new Error("file_too_large");
      let sheets;
      try { sheets = await readXlsx(buf); } catch { throw new Error("xlsx_invalid"); }
      const result = importWorkbook(sheets);
      // 보상에 적힌 상품 ID가 상점(카탈로그)에 없으면 지급 때 빠진다 → 알림
      const refs = [...(result.data.tables?.rank_road?.steps ?? []).flatMap((x) => x.items), ...(result.data.tables?.season_skins?.seasons ?? []).map((x) => x.item).filter(Boolean)];
      if (refs.length) {
        const known = new Set(((await rpc(env, "bo_catalog", {}))?.items ?? []).map((i) => i.id));
        const missing = [...new Set(refs)].filter((id) => !known.has(id));
        if (missing.length) result.warnings.push(`상점에 없는 상품 ID(등록 전까지 지급 안 됨): ${missing.join(", ")}`);
      }
      const validation = { errors: result.errors, blocks: result.blocks, warnings: result.warnings, summary: result.summary, file: url.searchParams.get("file") ?? "" };
      if (result.errors.length) return json({ ok: false, error: "validation_errors", validation }, 422);
      const live = (await rpc(env, "bo_versions", { p_limit: 1 })).live;
      const basedOn = url.searchParams.get("based_on") ? Number(url.searchParams.get("based_on")) : live;
      const note = (url.searchParams.get("note") ?? "").slice(0, 200) || `xlsx 업로드 ${validation.file}`;
      const version = await rpc(env, "bo_import_draft", { p_based_on: basedOn ?? null, p_note: note, p_staff: st.id, p_payload: result.data, p_validation: validation });
      const diff = basedOn ? diffData(await rpc(env, "bo_version_data", { p_version: basedOn }), await rpc(env, "bo_version_data", { p_version: version })) : [];
      await audit(env, st, `데이터 v${version}`, "초안 저장(xlsx)", { basedOn, file: validation.file, changes: diff.length, blocks: result.blocks.length, warnings: result.warnings.length }, note);
      return json({ ok: true, version, validation, diff });
    }

    case "GET /data/diff": {
      const st = await staffOf(request, env); allow(st, "data_view");
      const v = Number(url.searchParams.get("version"));
      const base = url.searchParams.get("base") ? Number(url.searchParams.get("base")) : (await rpc(env, "bo_versions", { p_limit: 1 })).live;
      return json({ ok: true, version: v, base, diff: diffData(await rpc(env, "bo_version_data", { p_version: base }), await rpc(env, "bo_version_data", { p_version: v })) });
    }

    case "GET /data/version": {
      const st = await staffOf(request, env); allow(st, "data_view");
      const v = url.searchParams.get("version") ? Number(url.searchParams.get("version")) : (await rpc(env, "bo_versions", { p_limit: 1 })).live;
      return json({ ok: true, version: v, data: await rpc(env, "bo_version_data", { p_version: v }) });
    }

    case "POST /data/review": {  // { version, action: request|approve|reject|schedule|unschedule|discard, reason?, at? }
      const st = await staffOf(request, env);
      const input = await body(request);
      const action = String(input.action ?? "");
      allow(st, { request: "data_edit", discard: "data_edit", approve: "data_review", reject: "data_review", schedule: "data_deploy", unschedule: "data_deploy" }[action] ?? "staff");
      const at = input.at ? new Date(input.at).toISOString() : null;
      const r = await rpc(env, "bo_review", { p_version: Number(input.version), p_staff: st.id, p_action: action, p_reason: input.reason ?? null, p_at: at });
      const LABEL = { request: "검수 요청", approve: "검수 승인", reject: "검수 반려", schedule: "배포 예약", unschedule: "예약 취소", discard: "초안 폐기" };
      await audit(env, st, `데이터 v${input.version}`, LABEL[action], at ? { at } : {}, String(input.reason ?? ""));
      return json({ ok: true, review: r });
    }

    case "POST /data/publish": {
      const st = await staffOf(request, env); allow(st, "data_deploy");
      const input = await body(request);
      const v = await rpc(env, "bo_publish", { p_version: Number(input.version), p_staff: st.id });
      await audit(env, st, `데이터 v${v}`, "배포", {}, String(input.reason ?? ""));
      return json({ ok: true, live: v });
    }

    case "POST /data/rollback": {
      const st = await staffOf(request, env); allow(st, "data_deploy");
      const input = await body(request);
      const reason = reasonOf(input, 5);
      const v = await rpc(env, "bo_rollback", { p_target: Number(input.target), p_staff: st.id, p_note: `롤백 → v${input.target}: ${reason}` });
      await audit(env, st, `데이터 v${v}`, `롤백(v${input.target} 내용)`, { target: Number(input.target) }, reason);
      return json({ ok: true, live: v });
    }

    // ---------- 유저 조회·재화·제재·신고 ----------
    case "GET /users": {
      const st = await staffOf(request, env); allow(st, "users");
      const q = String(url.searchParams.get("q") ?? "").trim();
      if (q.length < 2) throw new Error("query_too_short");
      return json({ ok: true, users: await rpc(env, "bo_user_search", { p_q: q }) });
    }
    case "GET /user": {
      const st = await staffOf(request, env); allow(st, "users");
      const id = String(url.searchParams.get("id") ?? "");
      if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("account_invalid");
      const season = await currentSeason(env);
      await audit(env, st, `유저 ${id}`, "유저 조회");
      return json({ ok: true, season, ...(await rpc(env, "bo_user_detail", { p_account: id, p_season: season.id })) });
    }
    case "POST /user/gold": {
      const st = await staffOf(request, env); allow(st, "users");
      const input = await body(request);
      const delta = Math.trunc(Number(input.delta));
      if (!delta || Math.abs(delta) > 1000000) throw new Error("amount_invalid");
      const g = await rpc(env, "bo_gold_adjust", { p_account: String(input.account), p_delta: delta, p_staff: st.id, p_reason: reasonOf(input), p_ref: `staff:${crypto.randomUUID()}` });
      return json({ ok: true, gold: g });
    }
    case "POST /user/item": {
      const st = await staffOf(request, env); allow(st, "users");
      const input = await body(request);
      await rpc(env, "bo_item_adjust", { p_account: String(input.account), p_item: String(input.item), p_grant: Boolean(input.grant), p_staff: st.id, p_reason: reasonOf(input) });
      return json({ ok: true });
    }
    case "POST /user/sanction": {  // { account, kind: warn|rank_restrict|season_wipe|suspend|rename, days?, reason }
      const st = await staffOf(request, env); allow(st, "users");
      const input = await body(request);
      if (!["warn", "rank_restrict", "season_wipe", "suspend", "rename"].includes(input.kind)) throw new Error("kind_invalid");
      const days = input.days === null || input.days === undefined || input.days === "" ? null : Math.trunc(Number(input.days));
      if (days !== null && !(days >= 1 && days <= 3650)) throw new Error("days_invalid");
      const season = await currentSeason(env);
      const id = await rpc(env, "bo_sanction", { p_account: String(input.account), p_kind: input.kind, p_days: days, p_staff: st.id, p_reason: reasonOf(input), p_season: season.id });
      return json({ ok: true, sanction: id });
    }
    case "POST /user/sanction/revoke": {
      const st = await staffOf(request, env); allow(st, "users");
      const input = await body(request);
      await rpc(env, "bo_sanction_revoke", { p_sanction: Number(input.id), p_staff: st.id, p_reason: reasonOf(input) });
      return json({ ok: true });
    }
    case "GET /reports": { const st = await staffOf(request, env); allow(st, "users"); return json({ ok: true, reports: await rpc(env, "bo_reports", { p_status: url.searchParams.get("status") || null }) }); }
    case "POST /reports/done": {
      const st = await staffOf(request, env); allow(st, "users");
      const input = await body(request);
      return json({ ok: true, done: await rpc(env, "bo_report_done", { p_ids: (input.ids ?? []).map(Number), p_staff: st.id }) });
    }

    // ---------- 상점·배너·공지·우편 ----------
    case "GET /shop": { const st = await staffOf(request, env); allow(st, "shop"); return json({ ok: true, ...(await rpc(env, "bo_catalog", {})) }); }
    case "POST /shop/item": {
      const st = await staffOf(request, env); allow(st, "shop");
      const it = await body(request);
      if (!/^[A-Z0-9_]{2,40}$/.test(String(it.id ?? ""))) throw new Error("id_invalid");
      await rpc(env, "bo_item_upsert", { p_item: it, p_staff: st.id });
      return json({ ok: true });
    }
    case "POST /shop/offer": {
      const st = await staffOf(request, env); allow(st, "shop");
      const of = await body(request);
      if (!/^[A-Z0-9_]{2,40}$/.test(String(of.id ?? ""))) throw new Error("id_invalid");
      if (!of.price_gold && !of.price_krw) throw new Error("price_required");
      await rpc(env, "bo_offer_upsert", { p_offer: of, p_staff: st.id });
      return json({ ok: true });
    }
    case "GET /lobby": { const st = await staffOf(request, env); allow(st, "events"); return json({ ok: true, ...(await rpc(env, "bo_lobby", {})) }); }
    case "POST /lobby/banner": { const st = await staffOf(request, env); allow(st, "events"); return json({ ok: true, id: await rpc(env, "bo_banner_upsert", { p_banner: await body(request), p_staff: st.id }) }); }
    case "POST /lobby/notice": { const st = await staffOf(request, env); allow(st, "events"); return json({ ok: true, id: await rpc(env, "bo_notice_upsert", { p_notice: await body(request), p_staff: st.id }) }); }
    case "POST /mail": {  // { target:{type:all|accounts|tier}, title, body, rewards:[{type:gold,amount}|{type:item,id}], send_at?, reason }
      const st = await staffOf(request, env); allow(st, "events");
      const job = await body(request);
      for (const r of job.rewards ?? []) {
        if (r.type === "gold" ? !(Number.isInteger(r.amount) && r.amount > 0 && r.amount <= 100000) : !(r.type === "item" && /^[A-Z0-9_]{2,40}$/.test(String(r.id)))) throw new Error("reward_invalid");
      }
      reasonOf(job);
      const id = await rpc(env, "bo_mail_job", { p_job: job, p_staff: st.id });
      let sent = null;
      if (!job.send_at || Date.parse(job.send_at) <= Date.now()) sent = await rpc(env, "mail_jobs_run", { p_season: (await currentSeason(env)).id });
      return json({ ok: true, job: id, sent });
    }
    case "POST /mail/cancel": { const st = await staffOf(request, env); allow(st, "events"); await rpc(env, "bo_mail_job_cancel", { p_job: Number((await body(request)).id), p_staff: st.id }); return json({ ok: true }); }

    default: throw new Error("not_found");
  }
}

// 캐릭터 승률을 티어 구간(브론즈~마스터 이름 묶음)별로(상세 12 밸런스, 목표 45~55%)
export function characterWinRates(data, rows) {
  const groups = Object.entries(tierGroups(data)).sort((a, b) => a[1].min - b[1].min);
  const order = (g) => { const i = groups.findIndex(([k]) => k === g); return i < 0 ? 99 : i; };
  const out = {};
  for (const r of rows) {
    const g = groups.find(([, v]) => r.tier >= v.min && r.tier <= v.max)?.[0] ?? "기타";
    const k = `${g}|${r.id}`;
    out[k] ??= { group: g, id: r.id, name: data?.characters?.[r.id]?.name ?? r.id, games: 0, wins: 0 };
    out[k].games += Number(r.games); out[k].wins += Number(r.wins);
  }
  return Object.values(out).map((x) => ({ ...x, winPct: x.games ? Math.round((1000 * x.wins) / x.games) / 10 : null }))
    .sort((a, b) => order(a.group) - order(b.group) || b.games - a.games);
}

// 저장소 사용량과 무료 한도 대비 비율(기획답변 18차: 80%에서 경고). 한도는 설정값 storage_quota_mb·transfer_quota_mb(없으면 무료 플랜 1GB·5GB)
export async function assetUsage(env) {
  const u = await rpc(env, "bo_asset_usage", {}).catch(() => null);
  if (!u) return null;
  const set = (await pinLive(env).catch(() => ({ snapshot: {} }))).snapshot?.settings ?? {};
  const storageQ = Number(set.storage_quota_mb ?? 1024) * 1048576, transferQ = Number(set.transfer_quota_mb ?? 5120) * 1048576;
  const pct = (v, q) => Math.round((1000 * v) / q) / 10;
  const out = { storage: { ...u.storage, quota: storageQ, pct: pct(u.storage.bytes, storageQ) }, download: { ...u.download, quota: transferQ, pct: pct(u.download.bytes, transferQ) } };
  out.warn = out.storage.pct >= 80 || out.download.pct >= 80;
  return out;
}
