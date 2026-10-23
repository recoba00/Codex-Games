// 통합 테스트(랭크·매칭·AI): 실제 Workers 런타임(wrangler 로컬) + 가짜 Supabase.
// 실행: node test/live/rank.mjs  (npm run test:live:rank)
// 시나리오: AI 연습(밴 없음) → 랭킹전 사람 대 사람(큐 매칭·RP·MMR) → AI 랭킹전 전환(3초) → 닷지(−5RP·5분 제한) → 내 랭크·보드
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { rankEvents, saved, startFakeSupabase } from "./fake-supabase.mjs";

const DB_PORT = 54331, API_PORT = 8801;
const API = `http://127.0.0.1:${API_PORT}`;
const here = new URL("../../", import.meta.url).pathname;
const db = await startFakeSupabase(DB_PORT);
writeFileSync(`${here}.dev.vars`, `SUPABASE_URL=http://127.0.0.1:${DB_PORT}\nSUPABASE_SERVICE_KEY=sb_secret_local\nTOKEN_SECRET=local-test-secret-local-test-secret-123\nDEV_LOGIN=1\nAI_THINK_MS=150,300\n`);
const wr = spawn("npx", ["wrangler", "dev", "--port", String(API_PORT), "--ip", "127.0.0.1", "--var", "DEV_LOGIN:1", "--var", "AI_THINK_MS:150,300"], { cwd: here, stdio: ["ignore", "pipe", "pipe"] });
let wlog = "";
wr.stdout.on("data", (d) => { wlog += d; });
wr.stderr.on("data", (d) => { wlog += d; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, body, token) {
  const res = await fetch(API + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

class Client {
  constructor(name) { this.name = name; this.errors = []; }
  async login() { const r = await call("/v1/auth/dev", { devId: this.name }); assert.equal(r.status, 200); this.token = r.body.accessToken; this.acc = r.body.accountId; }
  async room(code) {
    const t = await call(`/v1/rooms/${code}/ticket`, {}, this.token);
    assert.equal(t.status, 200, JSON.stringify(t.body));
    this.state = null;
    this.ws = new WebSocket(`ws://127.0.0.1:${API_PORT}/v1/rooms/${code}/ws?ticket=${encodeURIComponent(t.body.ticket)}`);
    this.ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "room") this.state = m; else if (m.type === "error") this.errors.push(m.error); };
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    await this.until((s) => s);
  }
  async queue(humanOnly = false) {
    const t = await call("/v1/queue/ticket", { humanOnly }, this.token);
    if (t.status !== 200) return t;
    this.q = [];
    this.qws = new WebSocket(`ws://127.0.0.1:${API_PORT}/v1/queue/ws?ticket=${encodeURIComponent(t.body.ticket)}`);
    this.qws.onmessage = (e) => this.q.push(JSON.parse(e.data));
    await new Promise((res, rej) => { this.qws.onopen = res; this.qws.onerror = rej; });
    return t;
  }
  async matched(ms = 15000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const m = this.q.find((x) => x.type === "matched"); if (m) return m; await sleep(50); }
    throw new Error(`${this.name}: 매칭 안 됨 ${JSON.stringify(this.q)}`);
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  async until(pred, ms = 10000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (this.state && pred(this.state)) return this.state; await sleep(40); }
    throw new Error(`${this.name}: 조건 시간 초과 ${JSON.stringify(this.state)?.slice(0, 500)}`);
  }
}

const act = (st) => {
  const me = st.battle.me;
  const c = me.hand.find((h) => h.cost <= me.energy && !h.sealed);
  return { type: "act", turn: st.battle.turn, cards: c ? [c.uid] : [] };
};
async function playToTurn4(players) {  // 사람 자리들이 매 턴 카드 1장씩 내며 4턴까지(AI는 서버가 처리)
  const lead = players[0];
  while (lead.state.phase === "battle" && lead.state.battle.turn < 4) {
    const t = lead.state.battle.turn;
    for (const p of players) if (!p.state.battle.me.submitted) p.send(act(p.state));
    await lead.until((s) => s.phase !== "battle" || s.battle.turn > t, 8000);
  }
}
async function prep(players, picks) {
  const lead = players[0];
  if (lead.state.phase === "ban") { players.forEach((p) => p.send({ type: "ban", characterId: null })); await lead.until((s) => s.phase === "pick"); }
  players.forEach((p, i) => {  // AI가 무작위로 밴할 수 있으니 밴되지 않은 캐릭터로 바꿔 고름
    const banned = p.state.prep.banned;
    const id = picks[i] && !banned.includes(picks[i]) ? picks[i] : p.state.prep.characters.find((c) => !banned.includes(c));
    p.send({ type: "pick", characterId: id });
  });
  await lead.until((s) => s.phase === "loadout");
  players.forEach((p) => p.send({ type: "loadout", spells: ["SP01", "SP04"], preset: 2 }));
  await lead.until((s) => s.phase === "battle");
}

const steps = [];
const step = (s) => { steps.push(s); console.log(`ok - ${s}`); };
try {
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* */ } await sleep(500); }
  const [alice, bob, carol, dave, erin] = ["alice", "bob", "carol", "dave", "erin"].map((n) => new Client(n));
  for (const c of [alice, bob, carol, dave, erin]) await c.login();

  // 1) AI 연습: 밴 없이 픽부터, AI가 픽·스펠·덱·턴을 스스로 진행
  const pr = await call("/v1/practice", { difficulty: "easy" }, alice.token);
  assert.equal(pr.status, 200, JSON.stringify(pr.body));
  await alice.room(pr.body.code);
  assert.equal(alice.state.mode, "practice");
  assert.equal(alice.state.phase, "pick", "연습은 밴 없음");
  assert.ok(alice.state.members[1].ai, "상대는 AI로 표시");
  await prep([alice], ["AU"]);
  await playToTurn4([alice]);
  if (alice.state.phase === "battle") { alice.send({ type: "surrender" }); await alice.until((s) => s.phase === "result"); }
  assert.ok(saved.some((r) => r.mode === "practice" && r.player_b === null));
  step("AI 연습: 밴 없음, AI가 픽·덱·턴 진행, 결과 저장(연습 모드)");
  alice.ws.close();

  // 2) 랭킹전 사람 대 사람: 큐 → 매칭 → 판 → 결과 → RP·MMR 반영
  await alice.queue(); await bob.queue();
  const [ma, mb] = [await alice.matched(), await bob.matched()];
  assert.equal(ma.code, mb.code);
  assert.equal(ma.mode, "ranked");
  await alice.room(ma.code); await bob.room(mb.code);
  await prep([alice, bob], ["SE", "UM"]);
  await playToTurn4([alice, bob]);
  if (alice.state.phase === "battle") { bob.send({ type: "surrender" }); }
  await alice.until((s) => s.phase === "result" && s.last?.rank, 10000);
  const r2 = alice.state.last;
  step(`랭킹전 매칭(같은 MMR 즉시) → 판 종료(${r2.reason}) → RP 반영 ${JSON.stringify(Object.values(r2.rank).map((x) => `${x.result} ${x.rpDelta >= 0 ? "+" : ""}${x.rpDelta}`))}`);
  const evs = rankEvents.filter((e) => e.mode === "ranked");
  assert.equal(evs.length, 2);
  alice.send({ type: "ready" });
  await sleep(300);
  assert.ok(alice.errors.includes("requeue_required"), "랭킹전 재매칭은 매칭부터");
  alice.ws.close(); bob.ws.close();

  // 3) AI 랭킹전 전환: 혼자 대기 → 3초(테스트값) 뒤 AI 매칭, RP는 AI 배율
  await carol.queue();
  const mc = await carol.matched(10000);
  assert.equal(mc.mode, "ranked_ai");
  await carol.room(mc.code);
  assert.ok(carol.state.members[1].ai);
  await prep([carol], ["IG", null]);
  await playToTurn4([carol]);
  if (carol.state.phase === "battle") carol.send({ type: "surrender" });
  await carol.until((s) => s.phase === "result" && s.last?.rank, 10000);
  assert.ok(rankEvents.some((e) => e.mode === "ranked_ai"));
  step(`AI 랭킹전 전환(대기 ${mc.waitSec}초) → AI 표시 → 결과 ${JSON.stringify(carol.state.last.rank[0])}`);
  carol.ws.close();

  // 4) 닷지: 밴픽 중 나가면 −5RP(브론즈는 0 아래로 안 내려감)·5분 매칭 제한, 상대는 우선권
  await dave.queue(); await erin.queue();
  const md = await dave.matched();
  await dave.room(md.code); await erin.room(md.code);
  await erin.until((s) => s.phase === "ban");
  erin.send({ type: "leave" });
  await dave.until((s) => s.phase === "closed", 8000);
  await sleep(300);
  assert.ok(rankEvents.some((e) => e.kind === "dodge"));
  const blocked = await call("/v1/queue/ticket", {}, erin.token);
  assert.deepEqual([blocked.status, blocked.body.error], [403, "dodge_blocked"]);
  assert.ok(blocked.body.until > Date.now());
  step("닷지 → 랭크 기록(dodge), 5분 매칭 제한(dodge_blocked), 방 닫힘");

  // 5) 내 랭크·보드
  const me = await call("/v1/rank/me", undefined, alice.token);
  assert.equal(me.status, 200);
  assert.ok(me.body.tierName);
  assert.equal(me.body.mmr, undefined, "숨은 MMR은 공개하지 않음");
  const board = await call("/v1/rank/board");
  assert.ok(board.body.rows.length >= 3);
  step(`내 랭크(${me.body.tierName} ${me.body.rp}RP)·랭킹 보드(${board.body.rows.length}명)`);
  console.log(`\n랭크 통합 테스트 ${steps.length}단계 통과`);
} catch (error) {
  console.error("FAIL:", error.message);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=live test::${String(error.message).replace(/\n/g, " ").slice(0, 900)}`);
  console.error(wlog.split("\n").filter((l) => /error|Error|✘/.test(l)).slice(-20).join("\n"));
  process.exitCode = 1;
} finally {
  wr.kill("SIGTERM");
  db.close();
  rmSync(`${here}.dev.vars`, { force: true });
  setTimeout(() => process.exit(), 500);
}
