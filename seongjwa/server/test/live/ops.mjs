// 통합 테스트(지표 로그·백오피스 지표·금칙어·계정 연동·삭제·정리 크론): Workers 런타임(wrangler 로컬, 크론 시험) + 실제 Postgres.
// 실행: PGHOST=… node test/live/ops.mjs  (npm run test:live:ops)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { pool, startPgRest } from "./pg-rest.mjs";

const DB_PORT = 54391, API_PORT = 8871;
const API = `http://127.0.0.1:${API_PORT}`;
const here = new URL("../../", import.meta.url).pathname;
const db = await startPgRest(DB_PORT);
writeFileSync(`${here}.dev.vars`, `SUPABASE_URL=http://127.0.0.1:${DB_PORT}\nSUPABASE_SERVICE_KEY=sb_secret_local\nTOKEN_SECRET=local-test-secret-local-test-secret-123\nAI_THINK_MS=150,300\nCRON_PURGE_ALWAYS=1\n`);
// 시험마다 따로 둔 로컬 DO 저장소(앞 시험의 workerd가 늦게 끝나면 SQLITE_BUSY로 DO가 리셋되던 문제)
const PERSIST = `${here}.wrangler/live-${process.pid}`;
const wr = spawn("npx", ["wrangler", "dev", "--persist-to", PERSIST, "--port", String(API_PORT), "--ip", "127.0.0.1", "--test-scheduled", "--var", "DEV_LOGIN:1", "--var", "CRON_PURGE_ALWAYS:1", "--var", "AI_THINK_MS:200,400"], { cwd: here, stdio: ["ignore", "pipe", "pipe"] });
let wlog = "";
wr.stdout.on("data", (d) => { wlog += d; });
wr.stderr.on("data", (d) => { wlog += d; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q, v) => pool.query(q, v).then((r) => r.rows);

async function call(path, body, token) {
  const res = await fetch(API + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 && r.body?.ok !== false, `${r.status} ${JSON.stringify(r.body)?.slice(0, 300)}`); return r.body; };
const err = async (p, code) => { const r = await p; assert.equal(r.body?.error, code, JSON.stringify(r.body)); return r.body; };

class Client {
  constructor(name) { this.name = name; this.events = []; }
  async login() { const r = await ok(call("/v1/auth/dev", { devId: this.name })); this.token = r.accessToken; this.acc = r.accountId; this.refresh = r.refreshToken; }
  get(p) { return call(p, undefined, this.token); }
  post(p, b = {}) { return call(p, b, this.token); }
  async room(code) {
    const t = await ok(this.post(`/v1/rooms/${code}/ticket`));
    this.state = null; this.events = [];
    this.ws = new WebSocket(`ws://127.0.0.1:${API_PORT}/v1/rooms/${code}/ws?ticket=${encodeURIComponent(t.ticket)}`);
    this.ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "room") this.state = m; else this.events.push(m); };
    this.ws.onclose = (e) => this.events.push({ type: "closed", code: e.code, reason: e.reason, at: Date.now() });
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    await this.until((s) => s);
  }
  async queue() {
    const t = await ok(this.post("/v1/queue/ticket", { humanOnly: true }));
    this.q = [];
    this.qws = new WebSocket(`ws://127.0.0.1:${API_PORT}/v1/queue/ws?ticket=${encodeURIComponent(t.ticket)}`);
    this.qws.onmessage = (e) => this.q.push(JSON.parse(e.data));
    await new Promise((res, rej) => { this.qws.onopen = res; this.qws.onerror = rej; });
  }
  async matched(ms = 15000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const m = this.q.find((x) => x.type === "matched"); if (m) return m; await sleep(50); }
    return null;
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  async until(pred, ms = 10000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (this.state && pred(this.state)) return this.state; await sleep(40); }
    const st = this.state ?? {};
    throw new Error(`${this.name}: 조건 시간 초과 phase=${st.phase} deadline=${(st.phaseDeadline ?? 0) - (st.now ?? 0)}ms prep=${JSON.stringify(st.prep ?? {}).slice(0, 200)} events=${JSON.stringify(this.events.slice(-4)).slice(0, 300)}`);
  }
  async event(pred, ms = 5000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const e = this.events.find(pred); if (e) return e; await sleep(30); }
    return null;
  }
}

async function toBattle(players, picks) {
  const lead = players[0];
  if (lead.state.phase === "ban") { players.forEach((p) => p.send({ type: "ban", characterId: null })); await lead.until((s) => s.phase === "pick", 30000); }
  players.forEach((p, i) => p.send({ type: "pick", characterId: picks[i] }));
  await lead.until((s) => s.phase === "loadout", 30000);
  players.forEach((p) => p.send({ type: "loadout", spells: ["SP01", "SP04"], preset: 2 }));
  await lead.until((s) => s.phase === "battle", 30000);
}
async function playOut(players, loserIdx) {
  const lead = players[0];
  while (lead.state.phase === "battle" && lead.state.battle.turn < 4) {
    const t = lead.state.battle.turn;
    for (const p of players) if (!p.state.battle.me.submitted) p.send({ type: "act", turn: t, cards: [] });
    await lead.until((s) => s.phase !== "battle" || s.battle.turn > t, 30000);
  }
  if (lead.state.phase === "battle") players[loserIdx].send({ type: "surrender" });
  await lead.until((s) => s.phase === "result" && s.last?.econ, 30000);
}

for (const ev of ["unhandledRejection", "uncaughtException"]) process.on(ev, (e) => {  // CI에서 원인이 보이게
  console.error(ev, e?.message ?? e);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=ops live test (${ev})::${String(e?.message ?? e).replace(/\n/g, " ").slice(0, 600)}`);
  process.exitCode = 1;
});
const steps = [];
const step = (s) => { steps.push(s); console.log(`ok - ${s}`); };
const events = (acc, name) => sql("select * from public.events where account_id = $1 and ($2::text is null or name = $2) order by id", [acc, name ?? null]);
try {
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* */ } await sleep(500); }
  const tag = Date.now().toString(36);
  const [a, b, c] = ["oa", "ob", "oc"].map((n) => new Client(`${n}${tag}`));
  for (const x of [a, b, c]) await x.login();

  // 1) 클라이언트 이벤트(상세 12): 허용 이름만, 공통 속성 저장, 계정 마지막 플랫폼·기기 기록
  const ev = await ok(a.post("/v1/events", { platform: "steam", device: "desktop", appVer: "0.1.0", dataVer: 1, events: [
    { name: "session_start", props: { res: "2560x1440", window: "max" } }, { name: "tutorial_step", props: { step_id: "T1", sec: 20, skipped: false } },
    { name: "settings_change", props: { key: "ui_scale", value: 110 } }, { name: "match_end", props: {} }] }));
  assert.deepEqual([ev.saved, ev.dropped], [3, 1]);
  const rows = await events(a.acc);
  assert.deepEqual(rows.map((r) => [r.name, r.platform, r.device, r.app_ver].join(" ")).sort(), ["session_start steam desktop 0.1.0", "settings_change steam desktop 0.1.0", "tutorial_step steam desktop 0.1.0"]);
  await err(a.post("/v1/events", { events: [] }), "events_invalid");
  step("클라이언트 이벤트 묶음 저장(허용 이름만, 플랫폼·기기·앱 버전), 빈 묶음 거부");

  // 2) 판·매칭 이벤트는 서버가 판 끝날 때 한 번에: AI 연습 1판 + 랭킹전 매칭 1판
  const pr = await ok(a.post("/v1/practice", { difficulty: "easy" }));
  await a.room(pr.code);
  a.send({ type: "pick", characterId: "AU" });
  await a.until((s) => s.phase === "loadout");
  a.send({ type: "loadout", spells: ["SP01", "SP04"], preset: 2 });
  await a.until((s) => s.phase === "battle", 30000);  // 스펠·덱 단계는 시간이 다 되면 자동 확정(15초)
  while (a.state.phase === "battle" && a.state.battle.turn < 4) { const t = a.state.battle.turn; const me = a.state.battle.me, cd = me.hand.find((h) => h.cost <= me.energy && !h.sealed); a.send({ type: "act", turn: t, cards: cd ? [cd.uid] : [] }); await a.until((s) => s.phase !== "battle" || s.battle.turn > t, 30000); }
  a.send({ type: "surrender" });
  await a.until((s) => s.phase === "result").catch((e) => { console.error(JSON.stringify(a.events.slice(-3))); throw e; });
  a.ws.close();
  await b.queue(); await c.queue();
  const m = await b.matched(); assert.ok(m, "랭킹전 매칭"); await c.matched();
  await b.room(m.code); await c.room(m.code);
  const order = b.state.you === 0 ? [b, c] : [c, b];
  await toBattle(order, ["UM", "SI"]);
  await playOut(order, 1);
  await sleep(800);
  const ae = (await events(a.acc)).map((r) => r.name);
  assert.ok(["banpick_pick", "banpick_spell", "turn_end", "match_end"].every((n) => ae.includes(n)), ae.join(","));
  const me = (await events(a.acc, "match_end"))[0].props;
  assert.deepEqual([me.mode, me.result, me.reason, me.is_ai, me.character_id, me.leave_flag], ["practice", "loss", "surrender", true, "AU", false]);
  assert.ok(me.surrender_turn >= 2 && me.duration_sec >= 0);
  const te = (await events(a.acc, "turn_end"))[0].props.turns;
  assert.ok(te.length >= 3); assert.ok("cards" in te[0] && "d" in te[0] && "s" in te[0]);
  const be = (await events(b.acc)).map((r) => r.name);
  assert.ok(["match_search_start", "match_found", "banpick_ban", "banpick_pick", "match_end"].every((n) => be.includes(n)), be.join(","));
  const found = (await events(b.acc, "match_found"))[0].props;
  assert.ok(found.wait_sec >= 0 && found.range >= 100);
  step(`판 이벤트(밴·픽·스펠·턴 요약·판 결과)·매칭 이벤트(탐색 시작·상대 확정, 대기 ${found.wait_sec}초) 서버 기록`);

  // 같은 DB로 다시 돌려도 되게 시험 단어 정리(로컬 반복 실행용)
  await sql("update public.banned_words set removed_at = now() where removed_at is null and word in ('나쁜말', '멍청이', '바보', 'ㅂㅅ')");
  await sql("update public.allowed_words set removed_at = now() where removed_at is null and word in ('멍청이왕국', '바보온달')");
  // 3) 백오피스 지표·금칙어: 관리자 → 지표 화면 값, 금칙어 추가 → 닉네임 변경 거부 → 걸린 닉네임 → 강제 변경
  const boot = `BOOT-${tag}`;
  await sql("insert into public.staff_invites (code_hash, role, expires_at) values ($1, 'admin', now() + interval '1 day')", [createHash("sha256").update(boot).digest("hex")]);
  const pw = "pw-ops-0123456789";
  await ok(call("/bo/v1/register", { code: boot, login: `adm${tag}`, name: "운영", password: pw }));
  const admin = (await ok(call("/bo/v1/login", { login: `adm${tag}`, password: pw }))).token;
  const met = await ok(call("/bo/v1/metrics", undefined, admin));
  assert.ok(met.ranked >= 1 && met.matches.practice >= 1 && met.events.session_start >= 1 && met.tutorial.T1 >= 1, JSON.stringify(met).slice(0, 300));
  assert.ok(met.characterGroups.some((x) => x.group === "브론즈" && ["UM", "SI"].includes(x.id)));
  assert.ok(met.matchMinAvg !== null && met.avgTurns >= 1);
  await err(a.post("/v1/profile/name", { name: "운영자짱", requestId: crypto.randomUUID() }), "name_banned");
  const wid = (await ok(call("/bo/v1/words", { word: "나쁜말", kind: "profanity", match: "contains", note: "테스트" }, admin))).id;
  await err(call("/bo/v1/words", { word: "나쁜 말!", match: "contains" }, admin), "word_exists");
  await err(a.post("/v1/profile/name", { name: "나쁜말쟁이", requestId: crypto.randomUUID() }), "name_banned");
  await sql("update public.accounts set display_name = $2 where id = $1", [c.acc, `나쁜말${tag}`.slice(0, 12)]);
  const flagged = await ok(call("/bo/v1/words/flagged", undefined, admin));
  assert.ok(flagged.users.some((u) => u.id === c.acc));
  await ok(call("/bo/v1/user/sanction", { account: c.acc, kind: "rename", reason: "부적절한 닉네임" }, admin));
  assert.ok(!(await ok(call("/bo/v1/words/flagged", undefined, admin))).users.some((u) => u.id === c.acc), "강제 변경 후 목록에서 빠짐");
  const bulk = await ok(call("/bo/v1/words/bulk", { text: "멍청이, 바보\n나쁜말\nㅂㅅ", kind: "profanity", match: "contains", note: "일괄" }, admin));
  assert.deepEqual([bulk.added, bulk.skipped], [3, ["나쁜말"]]);
  const chk = await ok(call("/bo/v1/words/check", { names: "멍청이왕, 평범한이름\n바 보" }, admin));
  assert.deepEqual(chk.results.map((r) => r.hits.length > 0), [true, false, true]);
  assert.equal((await ok(call("/bo/v1/words/allowed", { text: "멍청이왕국, 바보온달", note: "예외" }, admin))).added, 2);
  const chk2 = await ok(call("/bo/v1/words/check", { names: ["멍청이왕국", "멍청이왕국멍청이", "바보온달"] }, admin));
  assert.deepEqual(chk2.results.map((r) => r.hits.length > 0), [false, true, false]);
  const bid = (await ok(call("/bo/v1/words?q=ㅂㅅ", undefined, admin))).words[0].id;
  await ok(call("/bo/v1/words/match", { id: bid, match: "exact", reason: "오탐" }, admin));
  assert.equal((await ok(call("/bo/v1/words/allowed", undefined, admin))).words.length >= 2, true);
  await err(call("/bo/v1/words/remove", { id: wid }, admin), "reason_required");
  await ok(call("/bo/v1/words/remove", { id: wid, reason: "테스트 끝" }, admin));
  assert.equal((await ok(call(`/bo/v1/words/test?name=${encodeURIComponent("나쁜말쟁이")}`, undefined, admin))).hits.length, 0, "삭제 뒤엔 통과");
  assert.ok((await sql("select count(*)::int n from public.audit_log where target = '금칙어'"))[0].n >= 2);
  step("백오피스 지표(판·이벤트·튜토리얼·캐릭터 구간 승률), 금칙어 추가·중복 거부·닉네임 변경 거부·걸린 닉네임 강제 변경·삭제(감사 로그)");

  // 4) 계정 연동·삭제(상세 09): Steam 연결 → 다른 계정의 Steam이면 둘 중 선택 → 삭제 요청 → 로그인하면 취소 → 14일 뒤 익명화
  assert.equal((await ok(a.post("/v1/account/link", { provider: "steam", devSteamId: `st-a${tag}` }))).status, "linked");
  await err(a.post("/v1/account/link", { provider: "steam", devSteamId: `st-x${tag}` }), "provider_taken");
  await err(a.post("/v1/account/link", { provider: "google", token: "x" }), "link_unavailable");
  const conf = await ok(b.post("/v1/account/link", { provider: "steam", devSteamId: `st-a${tag}` }));
  assert.equal(conf.status, "conflict");
  assert.deepEqual([conf.current.id, conf.other.id], [b.acc, a.acc]);
  const sw = await ok(b.post("/v1/account/link", { provider: "steam", devSteamId: `st-a${tag}`, choice: "other" }));
  assert.equal(sw.session.accountId, a.acc, "그 계정으로 전환 = 그 계정 세션");
  const info = await ok(c.get("/v1/account"));
  assert.deepEqual(info.identities.map((i) => i.provider), ["guest"]);
  await err(c.post("/v1/account/delete", {}), "confirm_required");
  const del = await ok(c.post("/v1/account/delete", { confirm: true }));
  assert.ok(Date.parse(del.deletionAt) > Date.now() + 13 * 86400000);
  assert.equal((await call("/v1/auth/refresh", { refreshToken: c.refresh })).status, 401, "삭제 요청하면 세션 종료(갱신 불가)");
  await err(c.post("/v1/profile/name", { name: "남은토큰" }), "session_ended");  // 끝난 세션의 15분 토큰으로 상태 변경 불가
  const back = await ok(call("/v1/auth/dev", { devId: c.name }));
  assert.equal(back.restoredFromDeletion, true);
  c.token = back.accessToken;
  await ok(c.post("/v1/account/delete", { confirm: true }));
  await sql("update public.accounts set deletion_requested_at = now() - interval '15 days' where id = $1", [c.acc]);
  await sql("insert into public.events (name, at) values ('session_end', now() - interval '400 days')");
  assert.equal((await fetch(`${API}/__scheduled?cron=*/5+*+*+*+*`)).status, 200);
  let st = null;
  for (let i = 0; i < 30 && st !== "deleted"; i += 1) { st = (await sql("select status from public.accounts where id = $1", [c.acc]))[0].status; if (st !== "deleted") await sleep(300); }
  assert.equal(st, "deleted");
  assert.equal((await sql("select count(*)::int n from public.events where at < now() - interval '300 days'"))[0].n, 0, "오래된 로그 정리");
  const again = await ok(call("/v1/auth/dev", { devId: c.name }));
  assert.notEqual(again.accountId, c.acc, "익명화 뒤 같은 로그인 수단 = 새 계정");
  step("Steam 연결·종류별 1개·모바일 수단은 2단계, 다른 계정 Steam이면 두 진행도 보여 주고 선택(전환), 삭제 요청(세션 종료)→로그인 취소→14일 뒤 크론 익명화·새 계정, 오래된 로그 정리");

  console.log(`\n운영(지표·금칙어·계정) 통합 테스트 ${steps.length}단계 통과`);
} catch (error) {
  console.error("FAIL:", error.message, error.stack?.split("\n").slice(1, 3).join(" "));
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=ops live test::${String(error.message).replace(/\n/g, " ").slice(0, 900)}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=ops worker log::${wlog.split("\n").filter((l) => /error|Error|✘|exception|reset|Uncaught/i.test(l)).slice(-8).join(" | ").replace(/\x1b\[[0-9;]*m/g, "").slice(0, 1500)}`);
  console.error(wlog.split("\n").filter((l) => /error|Error|✘/.test(l)).slice(-20).join("\n"));
  process.exitCode = 1;
} finally {
  wr.kill("SIGTERM");
  db.close();
  await pool.end().catch(() => {});
  rmSync(`${here}.dev.vars`, { force: true });
  setTimeout(() => { try { rmSync(PERSIST, { recursive: true, force: true }); } catch { /* */ } }, 300);
  setTimeout(() => process.exit(), 500);
}
