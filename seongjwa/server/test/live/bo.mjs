// 통합 테스트(백오피스): 실제 Workers 런타임(wrangler 로컬, 크론 시험 켬) + 실제 Postgres(마이그레이션 적용).
// 실행: PGHOST=… node test/live/bo.mjs  (npm run test:live:bo)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { pool, startPgRest } from "./pg-rest.mjs";

const DB_PORT = 54361, API_PORT = 8831;
const API = `http://127.0.0.1:${API_PORT}`;
const here = new URL("../../", import.meta.url).pathname;
const XLSX = readFileSync(new URL("../../../data/balance_v7.xlsx", import.meta.url));
const db = await startPgRest(DB_PORT);
writeFileSync(`${here}.dev.vars`, `SUPABASE_URL=http://127.0.0.1:${DB_PORT}\nSUPABASE_SERVICE_KEY=sb_secret_local\nTOKEN_SECRET=local-test-secret-local-test-secret-123\n`);
const wr = spawn("npx", ["wrangler", "dev", "--port", String(API_PORT), "--ip", "127.0.0.1", "--test-scheduled", "--var", "DEV_LOGIN:1"], { cwd: here, stdio: ["ignore", "pipe", "pipe"] });
let wlog = "";
wr.stdout.on("data", (d) => { wlog += d; });
wr.stderr.on("data", (d) => { wlog += d; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q, v) => pool.query(q, v).then((r) => r.rows);

async function call(path, body, token, raw) {
  const res = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": raw ? "application/octet-stream" : "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 && r.body?.ok !== false, `${r.status} ${JSON.stringify(r.body)?.slice(0, 400)}`); return r.body; };
const err = async (p, code, status) => { const r = await p; assert.equal(r.body?.error, code, JSON.stringify(r.body)); if (status) assert.equal(r.status, status); return r.body; };
const tag = Date.now().toString(36);

async function staff(login, code) {
  const pw = `pw-${login}-0123456789`;
  await ok(call("/bo/v1/register", { code, login, name: login, password: pw }));
  const r = await ok(call("/bo/v1/login", { login, password: pw }));
  return r.token;
}

const steps = [];
const step = (s) => { steps.push(s); console.log(`ok - ${s}`); };
try {
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* */ } await sleep(500); }
  const page = await fetch(`${API}/bo`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(await page.text(), /성좌 결투 백오피스/);

  // 1) 첫 관리자: 운영자가 SQL로 만든 초대 코드 → 가입 → 관리자가 다른 역할 초대
  const boot = `BOOT-${tag}`;
  await sql("insert into public.staff_invites (code_hash, role, expires_at) values ($1, 'admin', now() + interval '1 day')", [createHash("sha256").update(boot).digest("hex")]);
  const admin = await staff(`adm${tag}`, boot);
  await err(call("/bo/v1/register", { code: boot, login: `x${tag}`, name: "x", password: "0123456789ab" }), "invite_invalid");
  const inv = async (role) => (await ok(call("/bo/v1/staff/invite", { role }, admin))).code;
  const planner = await staff(`pl${tag}`, await inv("planner"));
  const reviewer = await staff(`rv${tag}`, await inv("reviewer"));
  const ops = await staff(`op${tag}`, await inv("ops"));
  await err(call("/bo/v1/staff/invite", { role: "admin" }, planner), "forbidden", 403);
  await err(call("/bo/v1/login", { login: `pl${tag}`, password: "wrong-password" }), "login_failed", 401);
  const me = await ok(call("/bo/v1/me", undefined, reviewer));
  assert.deepEqual([me.staff.role, me.perms.data_review, me.perms.data_deploy], ["reviewer", true, false]);
  await err(call("/v1/me", undefined, admin), "auth_invalid", 401);  // 직원 토큰은 게임 API에 못 씀
  step("초대 코드 가입(한 번만)·로그인·역할 권한, 직원 토큰과 플레이어 토큰 분리");

  // 2) xlsx 업로드 → 검증 → 검수(자기 승인 금지) → 배포 → 두 번째 버전 예약(크론) → 롤백
  const up = await ok(call(`/bo/v1/data/import?note=${encodeURIComponent("v7 기준 업로드 시험")}&file=balance_v7.xlsx`, XLSX, planner, true));
  assert.deepEqual([up.validation.errors.length, up.validation.blocks.length, up.validation.summary.characters], [0, 0, 9]);
  const v1 = up.version;
  await err(call("/bo/v1/data/import?note=x", XLSX, ops, true), "forbidden", 403);
  await err(call("/bo/v1/data/import?note=x", new Uint8Array([1, 2, 3]), planner, true), "xlsx_invalid", 400);
  await ok(call("/bo/v1/data/review", { version: v1, action: "request" }, planner));
  await err(call("/bo/v1/data/review", { version: v1, action: "approve" }, planner), "forbidden", 403);
  await err(call("/bo/v1/data/publish", { version: v1 }, admin), "not_approved");
  await ok(call("/bo/v1/data/review", { version: v1, action: "approve" }, reviewer));
  await err(call("/bo/v1/data/publish", { version: v1 }, reviewer), "forbidden", 403);
  await ok(call("/bo/v1/data/publish", { version: v1 }, admin));
  let vs = await ok(call("/bo/v1/data/versions", undefined, ops));
  assert.equal(vs.live, v1);
  const up2 = await ok(call("/bo/v1/data/import?note=second", XLSX, admin, true));
  assert.deepEqual(up2.diff, [], "같은 파일 → 라이브와 차이 없음");
  await ok(call("/bo/v1/data/review", { version: up2.version, action: "request" }, admin));
  await err(call("/bo/v1/data/review", { version: up2.version, action: "approve" }, admin), "self_review", 403);  // 관리자도 자기 초안은 승인 불가
  await ok(call("/bo/v1/data/review", { version: up2.version, action: "approve" }, reviewer));
  await ok(call("/bo/v1/data/review", { version: up2.version, action: "schedule", at: new Date(Date.now() + 3600e3).toISOString() }, admin));
  await sql("update public.data_reviews set scheduled_for = now() - interval '1 minute' where version_id = $1", [up2.version]);
  const cron = await fetch(`${API}/__scheduled?cron=*/5+*+*+*+*`);
  assert.equal(cron.status, 200);
  for (let i = 0; i < 20 && (await ok(call("/bo/v1/data/versions", undefined, ops))).live !== up2.version; i += 1) await sleep(250);
  vs = await ok(call("/bo/v1/data/versions", undefined, ops));
  assert.equal(vs.live, up2.version, "크론이 예약 배포 실행");
  await err(call("/bo/v1/data/rollback", { target: v1, reason: "짧" }, admin), "reason_required");
  const rb = await ok(call("/bo/v1/data/rollback", { target: v1, reason: "롤백 시험입니다" }, admin));
  vs = await ok(call("/bo/v1/data/versions", undefined, ops));
  assert.equal(vs.live, rb.live);
  assert.equal(vs.versions.find((v) => v.id === rb.live).kind, "rollback");
  const view = await ok(call("/bo/v1/data/version", undefined, planner));
  assert.equal(view.data.characters.PY.active_params.active_hit_mult, 1.5);
  step(`xlsx 업로드 v${v1}(검증 통과) → 검수(본인·관리자 자기 승인 불가) → 배포 → v${up2.version} 예약 → 크론 배포 → 롤백 v${rb.live}`);

  // 3) 유저 조회·재화·제재(랭킹전 제한·정지)·우편·신고
  const pl = await ok(call("/v1/auth/dev", { devId: `bo${tag}` }));
  const pl2 = await ok(call("/v1/auth/dev", { devId: `bp${tag}` }));
  const found = await ok(call(`/bo/v1/users?q=${pl.accountId}`, undefined, ops));
  assert.equal(found.users[0].id, pl.accountId);
  await err(call(`/bo/v1/users?q=${pl.accountId}`, undefined, reviewer), "forbidden", 403);
  await err(call("/bo/v1/user/gold", { account: pl.accountId, delta: 500, reason: "" }, ops), "reason_required");
  assert.equal((await ok(call("/bo/v1/user/gold", { account: pl.accountId, delta: 500, reason: "점검 보상" }, ops))).gold, 500);
  await ok(call("/bo/v1/user/sanction", { account: pl.accountId, kind: "rank_restrict", days: 1, reason: "고의 지연 반복" }, ops));
  await err(call("/v1/queue/ticket", {}, pl.accessToken), "rank_restricted", 403);
  const sv = await ok(call("/v1/sanctions", undefined, pl.accessToken));
  assert.ok(sv.rankUntil);
  await ok(call("/bo/v1/user/sanction", { account: pl.accountId, kind: "warn", reason: "닉네임 주의" }, ops));
  assert.equal((await ok(call("/v1/sanctions", undefined, pl.accessToken))).warnings.length, 1);
  await ok(call("/v1/sanctions/ack", {}, pl.accessToken));
  await ok(call("/v1/reports", { target: pl.accountId, reason: "afk", note: "계속 잠수" }, pl2.accessToken));
  await err(call("/v1/reports", { target: pl.accountId, reason: "name" }, pl2.accessToken), "report_limited", 429);
  const reps = await ok(call("/bo/v1/reports?status=open", undefined, ops));
  const mine = reps.reports.filter((r) => r.target === pl.accountId);
  assert.equal(mine.length, 1);
  await ok(call("/bo/v1/reports/done", { ids: mine.map((r) => r.id) }, ops));
  const mj = await ok(call("/bo/v1/mail", { target: { type: "accounts", ids: [pl.accountId] }, title: "점검 보상", body: "감사합니다", rewards: [{ type: "gold", amount: 300 }], reason: "점검 지연" }, ops));
  assert.equal(mj.sent, 1);
  const mail = await ok(call("/v1/mail", undefined, pl.accessToken));
  assert.ok(mail.mail.some((m) => m.title === "점검 보상"));
  const detail = await ok(call(`/bo/v1/user?id=${pl.accountId}`, undefined, ops));
  assert.deepEqual([detail.gold, detail.sanctions.length, detail.reports.length], [500, 2, 1]);
  await ok(call("/bo/v1/user/sanction", { account: pl.accountId, kind: "suspend", days: 7, reason: "결제 사기 의심" }, ops));
  await err(call("/v1/auth/dev", { devId: `bo${tag}` }), "account_banned", 403);
  const susp = (await ok(call(`/bo/v1/user?id=${pl.accountId}`, undefined, ops))).sanctions.find((s) => s.kind === "suspend");
  await ok(call("/bo/v1/user/sanction/revoke", { id: susp.id, reason: "오판 해제" }, ops));
  await ok(call("/v1/auth/dev", { devId: `bo${tag}` }));
  step("유저 검색·골드 지급(사유 필수)·랭킹전 제한(큐 차단)·경고 팝업 확인·신고(24시간 1회)·개별 우편·정지(로그인 차단)·해제");

  // 4) 상점·배너·공지 → 플레이어 화면 반영
  await ok(call("/bo/v1/shop/item", { id: `BO_BACK_${tag.toUpperCase()}`, kind: "cardback", name: "백오피스 뒷면" }, ops));
  await ok(call("/bo/v1/shop/offer", { id: `BO_O_${tag.toUpperCase()}`, item_id: `BO_BACK_${tag.toUpperCase()}`, tab: "cosmetic", price_gold: 100 }, ops));
  const shop = await ok(call("/v1/shop", undefined, pl2.accessToken));
  assert.ok(shop.offers.some((o) => o.offer === `BO_O_${tag.toUpperCase()}`));
  await err(call("/bo/v1/shop/offer", { id: "X1", item_id: "X", tab: "cosmetic" }, ops), "price_required");
  await ok(call("/bo/v1/lobby/banner", { title: `배너 ${tag}`, link: `shop:BO_O_${tag.toUpperCase()}`, slot: 1 }, ops));
  await ok(call("/bo/v1/lobby/notice", { title: `공지 ${tag}`, body: "점검 안내" }, ops));
  const lobby = await ok(call("/v1/lobby"));
  assert.ok(lobby.banners.some((b) => b.title === `배너 ${tag}`) && lobby.notice?.title === `공지 ${tag}`);
  step("상품·판매 설정 → 플레이어 상점, 배너·공지 → 플레이어 로비");

  // 5) 대시보드·감사 로그(수정 불가)·직원 비활성화
  const dash = await ok(call("/bo/v1/dashboard", undefined, reviewer));
  assert.ok(dash.accounts >= 2 && dash.liveVersion === rb.live);
  const audit = await ok(call(`/bo/v1/audit?q=${encodeURIComponent("제재")}`, undefined, planner));
  assert.ok(audit.rows.length >= 3);
  const all = (await ok(call("/bo/v1/audit", undefined, planner))).rows.map((r) => r.action);
  for (const a of ["가입", "직원 초대", "초안 저장(xlsx)", "검수 요청", "검수 승인", "배포", "배포 예약", "예약 배포 실행", "골드 지급", "유저 조회", "우편 발송 등록", "배너 저장"]) assert.ok(all.some((x) => x.startsWith(a)), `감사 로그에 '${a}' 없음`);
  await assert.rejects(sql("update public.audit_log set reason = 'x'"), /audit_log_immutable/);
  const list = await ok(call("/bo/v1/staff", undefined, admin));
  const opsId = list.staff.find((s) => s.login === `op${tag}`).id;
  await ok(call("/bo/v1/staff/update", { id: opsId, active: false }, admin));
  await err(call("/bo/v1/dashboard", undefined, ops), "session_ended", 401);
  step("대시보드, 감사 로그(전 조치 기록·수정 불가), 직원 비활성화 → 즉시 세션 종료");

  console.log(`\n백오피스 통합 테스트 ${steps.length}단계 통과`);
} catch (error) {
  console.error("FAIL:", error.message);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=bo live test::${String(error.message).replace(/\n/g, " ").slice(0, 900)}`);
  console.error(wlog.split("\n").filter((l) => /error|Error|✘/.test(l)).slice(-20).join("\n"));
  process.exitCode = 1;
} finally {
  wr.kill("SIGTERM");
  db.close();
  await pool.end().catch(() => {});
  rmSync(`${here}.dev.vars`, { force: true });
  setTimeout(() => process.exit(), 500);
}
