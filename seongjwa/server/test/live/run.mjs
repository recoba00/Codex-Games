// 통합 테스트: 실제 Workers 런타임(wrangler 로컬)에서 친구방 한 판을 끝까지 진행한다.
// 실행: node test/live/run.mjs   (npm run test:live)
// 시나리오: 로그인 2명 → 방 생성·참가 → 밴(같은 캐릭터 픽 거부) → 픽 → 스펠·덱 → 전투
//          → 연결 끊김 중 턴 시간 초과(자동 방어) → 재접속 → 항복 → 결과 1회 저장 → 재대결 시작
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { startFakeSupabase, saved } from "./fake-supabase.mjs";

const DB_PORT = 54329, API_PORT = 8799;
const API = `http://127.0.0.1:${API_PORT}`;
const here = new URL("../../", import.meta.url).pathname;

const db = await startFakeSupabase(DB_PORT);
writeFileSync(`${here}.dev.vars`, `SUPABASE_URL=http://127.0.0.1:${DB_PORT}\nSUPABASE_SERVICE_KEY=sb_secret_local\nTOKEN_SECRET=local-test-secret-local-test-secret-123\nDEV_LOGIN=1\n`);
// 시험마다 따로 둔 로컬 DO 저장소(앞 시험의 workerd가 늦게 끝나면 SQLITE_BUSY로 DO가 리셋되던 문제)
const PERSIST = `${here}.wrangler/live-${process.pid}`;
const wr = spawn("npx", ["wrangler", "dev", "--persist-to", PERSIST, "--port", String(API_PORT), "--ip", "127.0.0.1", "--var", "DEV_LOGIN:1"], { cwd: here, stdio: ["ignore", "pipe", "pipe"] });
let wlog = "";
wr.stdout.on("data", (d) => { wlog += d; });
wr.stderr.on("data", (d) => { wlog += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function up() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`${API}/health`)).ok) return; } catch { /* starting */ }
    await sleep(500);
  }
  throw new Error(`wrangler did not start\n${wlog}`);
}

async function call(path, body, token) {
  const res = await fetch(API + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

class Client {
  constructor(name) { this.name = name; this.msgs = []; this.errors = []; }
  async login() { const r = await call("/v1/auth/dev", { devId: this.name }); assert.equal(r.status, 200, JSON.stringify(r.body)); this.token = r.body.accessToken; this.acc = r.body.accountId; }
  async connect(code) {
    const t = await call(`/v1/rooms/${code}/ticket`, {}, this.token);
    assert.equal(t.status, 200, JSON.stringify(t.body));
    this.ws = new WebSocket(`ws://127.0.0.1:${API_PORT}/v1/rooms/${code}/ws?ticket=${encodeURIComponent(t.body.ticket)}`);
    this.ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "room") { this.state = m; if (m.reveal && !m.reveal.done && m.battle) this.ws.send(JSON.stringify({ type: "revealed", turn: m.battle.turn })); } else if (m.type === "error") this.errors.push(m.error); this.msgs.push(m); };
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    await this.until((s) => s);
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  async until(pred, ms = 8000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (this.state && pred(this.state)) return this.state; await sleep(50); }
    throw new Error(`${this.name}: 조건 시간 초과, 현재 ${JSON.stringify(this.state)?.slice(0, 400)}`);
  }
  async error(name) { const end = Date.now() + 4000; while (Date.now() < end) { if (this.errors.includes(name)) return; await sleep(50); } throw new Error(`${this.name}: 오류 ${name} 없음 (${this.errors})`); }
}

function playable(st) {
  const b = st.battle, me = b.me;
  const c = me.hand.find((h) => h.cost <= me.energy && !h.sealed);
  return { type: "act", turn: b.turn, cards: c ? [c.uid] : [], spell: null, active: false };
}

const steps = [];
const step = (s) => { steps.push(s); console.log(`ok - ${s}`); };

try {
  await up();
  const alice = new Client("alice"), bob = new Client("bob");
  await alice.login(); await bob.login();
  step("개발 로그인 2명");

  const made = await call("/v1/rooms", { options: { bans: true, turnSec: 20 } }, alice.token);
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const code = made.body.code;
  assert.match(code, /^[2-9A-HJKMNP-Z]{6}$/);
  assert.equal((await call(`/v1/rooms/${code}/join`, {}, bob.token)).status, 200);
  const carol = new Client("carol"); await carol.login();
  assert.equal((await call(`/v1/rooms/${code}/join`, {}, carol.token)).body.error, "room_full");
  step(`방 ${code} 생성·참가, 세 번째 참가는 room_full`);

  await alice.connect(code); await bob.connect(code);
  await alice.until((s) => s.members.length === 2 && s.members.every((m) => m.connected));
  const defaults = { preferred: ["SE", "AU"], spells: ["SP01", "SP04"], preset: 2 };
  alice.send({ type: "ready", defaults }); bob.send({ type: "ready", defaults });
  await alice.until((s) => s.phase === "ban");
  assert.equal(alice.state.dataVersion, 1);
  step("양측 준비 → 밴 단계, 데이터 버전 1 고정");

  alice.send({ type: "ban", characterId: "UM" }); bob.send({ type: "ban", characterId: null });
  await bob.until((s) => s.phase === "pick");
  assert.deepEqual(bob.state.prep.banned, ["UM"]);
  bob.send({ type: "pick", characterId: "UM" });
  await bob.error("character_unavailable");
  alice.send({ type: "pick", characterId: "AU" });
  await alice.until((s) => s.prep.myPick === "AU");
  assert.equal(bob.state.prep.oppPick, null, "픽은 비공개");
  bob.send({ type: "pick", characterId: "SE" });
  await alice.until((s) => s.phase === "loadout");
  assert.equal(alice.state.prep.oppPick, "SE");
  step("밴 UM → 밴된 캐릭터 픽 거부, 픽 비공개 후 스펠·덱 단계에서 공개");

  alice.send({ type: "loadout", spells: ["SP01", "SP02"], preset: 1 });
  bob.send({ type: "loadout", spells: ["SP04", "SP08"], preset: 3 });
  await alice.until((s) => s.phase === "battle");
  assert.equal(alice.state.battle.me.hand.length, 4);
  assert.equal(alice.state.battle.opp.hand, undefined, "상대 손패 숨김");
  step("스펠·덱 확정 → 전투 시작, 상대 손패 비공개");

  alice.send(playable(alice.state)); bob.send(playable(bob.state));
  await alice.until((s) => s.battle?.turn === 2);
  step("1턴 동시 제출 → 즉시 공개·처리 → 2턴");

  bob.ws.close();
  await alice.until((s) => s.members[1].away);
  alice.send(playable(alice.state));
  console.log("  (턴 시간 20초 + 여유 0.5초 대기 중…)");
  await alice.until((s) => s.battle?.turn === 3, 26000);
  const reveal = alice.state.battle.log.find((e) => e.t === "reveal" && e.seat === 1);
  assert.equal(reveal.auto, true, "끊긴 쪽은 자동 처리");
  step("연결 끊김 중 턴 시간 초과 → 서버 자동 방어로 처리, 판 계속");

  await bob.connect(code);
  await bob.until((s) => s.phase === "battle" && s.battle.turn === 3);
  await alice.until((s) => !s.members[1].away && s.members[1].connected);
  step("60초 안에 재접속 → 같은 판 복원");

  while (alice.state.battle.turn < 4) {
    const t = alice.state.battle.turn;
    alice.send(playable(alice.state)); bob.send(playable(bob.state));
    await alice.until((s) => s.phase !== "battle" || s.battle.turn > t);
    if (alice.state.phase !== "battle") break;
  }
  if (alice.state.phase === "battle") {
    bob.send({ type: "surrender" });
    await alice.until((s) => s.phase === "result");
    assert.deepEqual([alice.state.last.outcome, alice.state.last.reason], ["a", "surrender"]);
    step("4턴 항복 → 결과 화면(0번 승리)");
  } else step(`전투가 ${alice.state.last.turn}턴에 끝남(${alice.state.last.reason})`);

  await sleep(500);
  const rows = (await (await fetch(`http://127.0.0.1:${DB_PORT}/_saved`)).json());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mode, "friend");
  assert.equal(rows[0].data_version, 1);
  assert.deepEqual(rows[0].summary.picks, ["AU", "SE"]);
  assert.deepEqual(rows[0].summary.bans, ["UM", null]);
  step("판 결과 1회 저장(판 ID 키, 데이터 버전·밴·픽 기록)");

  alice.send({ type: "ready", defaults }); bob.send({ type: "ready", defaults });
  await bob.until((s) => s.phase === "ban");
  step("재대결: 방 유지한 채 다음 판 밴 단계");

  const relog = await call("/v1/auth/dev", { devId: "bob" });
  assert.equal(relog.body.replacedSessions, 1);
  const t2 = await call(`/v1/rooms/${code}/ticket`, {}, bob.token);
  assert.equal(t2.body.error, "session_ended");
  step("다른 기기에서 다시 로그인 → 기존 세션으로는 방 접속 불가(session_ended)");

  if (process.env.LIVE_LONG === "1") {
    // 긴 시나리오: 재대결 판에서 60초 안에 못 돌아오면 친구방은 결과 없음(void)·방 유지 (총괄 12장)
    await bob.login();
    await bob.connect(code);
    alice.send({ type: "ban", characterId: null }); bob.send({ type: "ban", characterId: null });
    await alice.until((s) => s.phase === "pick");
    alice.send({ type: "pick", characterId: "IG" }); bob.send({ type: "pick", characterId: "MO" });
    await alice.until((s) => s.phase === "loadout");
    alice.send({ type: "loadout", spells: ["SP03", "SP07"], preset: 2 }); bob.send({ type: "loadout", spells: ["SP05", "SP06"], preset: 2 });
    await alice.until((s) => s.phase === "battle");
    bob.ws.onclose = null; bob.ws.close();
    await alice.until((s) => s.members[1].away);
    console.log("  (재접속 유예 60초 대기 중, 0번은 매 턴 카드 제출…)");
    const end = Date.now() + 75000;
    while (Date.now() < end && alice.state.phase === "battle") {
      const t = alice.state.battle.turn;
      if (!alice.state.battle.me.submitted) alice.send(playable(alice.state));
      await alice.until((s) => s.phase !== "battle" || s.battle.turn > t, 25000).catch(() => {});
    }
    assert.equal(alice.state.phase, "result");
    assert.deepEqual([alice.state.last.outcome, alice.state.last.reason], ["void", "leave"]);
    await sleep(500);
    const rows2 = await (await fetch(`http://127.0.0.1:${DB_PORT}/_saved`)).json();
    assert.equal(rows2.length, 2);
    assert.equal(rows2[1].outcome, "void");
    step("60초 유예 초과 → 친구방은 결과 없음(void)으로 기록, 방 유지");
  }

  console.log(`\n통합 테스트 ${steps.length}단계 통과`);
} catch (error) {
  console.error("FAIL:", error.message);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=live test::${String(error.message).replace(/\n/g, " ").slice(0, 900)}`);
  console.error(wlog.split("\n").slice(-30).join("\n"));
  process.exitCode = 1;
} finally {
  wr.kill("SIGTERM");
  db.close();
  rmSync(`${here}.dev.vars`, { force: true });
  setTimeout(() => { try { rmSync(PERSIST, { recursive: true, force: true }); } catch { /* */ } }, 300);
  setTimeout(() => process.exit(), 500);
}
