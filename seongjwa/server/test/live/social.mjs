// 통합 테스트(친구·초대·감정표현·랭크 로드·몰아주기 방지·시즌 보상): Workers 런타임(wrangler 로컬, 크론 시험) + 실제 Postgres.
// 실행: PGHOST=… node test/live/social.mjs  (npm run test:live:social)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { pool, startPgRest } from "./pg-rest.mjs";

const DB_PORT = 54381, API_PORT = 8851;
const API = `http://127.0.0.1:${API_PORT}`;
const here = new URL("../../", import.meta.url).pathname;
const db = await startPgRest(DB_PORT);
writeFileSync(`${here}.dev.vars`, `SUPABASE_URL=http://127.0.0.1:${DB_PORT}\nSUPABASE_SERVICE_KEY=sb_secret_local\nTOKEN_SECRET=local-test-secret-local-test-secret-123\n`);
const wr = spawn("npx", ["wrangler", "dev", "--port", String(API_PORT), "--ip", "127.0.0.1", "--test-scheduled", "--var", "DEV_LOGIN:1"], { cwd: here, stdio: ["ignore", "pipe", "pipe"] });
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
  async login() { const r = await ok(call("/v1/auth/dev", { devId: this.name })); this.token = r.accessToken; this.acc = r.accountId; }
  get(p) { return call(p, undefined, this.token); }
  post(p, b = {}) { return call(p, b, this.token); }
  async room(code) {
    const t = await ok(this.post(`/v1/rooms/${code}/ticket`));
    this.state = null; this.events = [];
    this.ws = new WebSocket(`ws://127.0.0.1:${API_PORT}/v1/rooms/${code}/ws?ticket=${encodeURIComponent(t.ticket)}`);
    this.ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "room") this.state = m; else this.events.push(m); };
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
    throw new Error(`${this.name}: 조건 시간 초과 ${JSON.stringify(this.state)?.slice(0, 300)}`);
  }
  async event(pred, ms = 5000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const e = this.events.find(pred); if (e) return e; await sleep(30); }
    return null;
  }
}

async function toBattle(players, picks) {
  const lead = players[0];
  if (lead.state.phase === "ban") { players.forEach((p) => p.send({ type: "ban", characterId: null })); await lead.until((s) => s.phase === "pick"); }
  players.forEach((p, i) => p.send({ type: "pick", characterId: picks[i] }));
  await lead.until((s) => s.phase === "loadout");
  players.forEach((p) => p.send({ type: "loadout", spells: ["SP01", "SP04"], preset: 2 }));
  await lead.until((s) => s.phase === "battle");
}
async function playOut(players, loserIdx) {
  const lead = players[0];
  while (lead.state.phase === "battle" && lead.state.battle.turn < 4) {
    const t = lead.state.battle.turn;
    for (const p of players) if (!p.state.battle.me.submitted) p.send({ type: "act", turn: t, cards: [] });
    await lead.until((s) => s.phase !== "battle" || s.battle.turn > t, 8000);
  }
  if (lead.state.phase === "battle") players[loserIdx].send({ type: "surrender" });
  await lead.until((s) => s.phase === "result" && s.last?.econ, 10000);
}

const steps = [];
const step = (s) => { steps.push(s); console.log(`ok - ${s}`); };
try {
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* */ } await sleep(500); }
  const tag = Date.now().toString(36);
  const [a, b, c] = ["sa", "sb", "sc"].map((n) => new Client(`${n}${tag}`));
  for (const x of [a, b, c]) await x.login();

  // 1) 친구 코드 → 요청 → 수락, 상호 요청 자동 수락, 검색·차단
  const fa = await ok(a.get("/v1/friends"));
  assert.match(fa.code, /^ASTRA-[2-9A-HJKMNP-Z]{4}$/);
  assert.equal((await ok(b.post("/v1/friends/request", { code: fa.code.toLowerCase() }))).status, "sent");
  const inc = (await ok(a.get("/v1/friends"))).incoming;
  assert.equal(inc.length, 1);
  await ok(a.post("/v1/friends/respond", { id: inc[0].id, accept: true }));
  await err(b.post("/v1/friends/request", { id: a.acc }), "already_friends");
  await ok(c.post("/v1/friends/request", { id: a.acc }));
  assert.equal((await ok(a.post("/v1/friends/request", { id: c.acc }))).status, "accepted");
  await ok(b.post("/v1/presence", {})); await ok(c.post("/v1/presence", {}));
  let fl = await ok(a.get("/v1/friends"));
  assert.deepEqual(fl.friends.map((f) => f.status).sort(), ["online", "online"]);
  await ok(a.post("/v1/friends/block", { id: c.acc, on: true }));
  assert.equal((await ok(a.get("/v1/friends"))).friends.length, 1);
  await err(c.post("/v1/friends/request", { id: a.acc }), "friend_blocked");
  await ok(a.post("/v1/friends/block", { id: c.acc, on: false }));
  await ok(c.post("/v1/friends/request", { id: a.acc }));
  assert.equal((await ok(a.post("/v1/friends/request", { id: c.acc }))).status, "accepted", "해제 뒤 다시 친구");
  await err(a.post("/v1/friends/request", { code: "ASTRA-0000" }), "friend_code_invalid");
  step("친구 코드·요청·수락, 상호 요청 자동 수락, 차단(친구 끊김·요청 불가)·해제");

  // 2) 친구방 초대 → 받기 → 참가, 게임 중 표시, 감정표현(장착·3초·상대 끄기)
  const room = (await ok(a.post("/v1/rooms", { options: { bans: false, turnSec: 20 } }))).code;
  await ok(a.post("/v1/friends/invite", { friend: b.acc, room }));
  const inv = (await ok(b.get("/v1/friends"))).invites;
  assert.equal(inv.length, 1, JSON.stringify(inv) + room);
  assert.equal(inv[0].room, room);
  const ans = await ok(b.post("/v1/friends/invite/answer", { id: inv[0].id }));
  await ok(b.post(`/v1/rooms/${ans.room}/join`));
  await a.room(room); await b.room(room);
  const defaults = { preferred: ["AU"], spells: ["SP01", "SP04"], preset: 2 };
  a.send({ type: "ready", defaults }); b.send({ type: "ready", defaults });
  await a.until((s) => s.phase === "pick" || s.phase === "ban");
  await toBattle([a, b], ["AU", "SE"]);
  await sleep(500);
  fl = await ok(c.get("/v1/friends"));
  assert.equal(fl.friends.find((f) => f.id === a.acc)?.status, "in_game", JSON.stringify(fl.friends));
  await err(c.post("/v1/friends/invite", { friend: a.acc, room }), "friend_in_game");
  a.send({ type: "emote", id: "EMOTE_HELLO" });
  assert.ok(await b.event((e) => e.type === "emote" && e.id === "EMOTE_HELLO" && e.seat === 0), "상대에게 감정표현 도착");
  a.send({ type: "emote", id: "EMOTE_NICE" });
  await a.until(() => true);
  await sleep(200);
  assert.ok(a.events.some((e) => e.type === "error" && e.error === "emote_cooldown"), "3초에 1회");
  a.send({ type: "emote", id: "NOT_MINE" });
  await sleep(200);
  assert.ok(a.events.some((e) => e.type === "error" && e.error === "emote_not_equipped"));
  b.send({ type: "mute_emotes" });
  assert.ok(await b.event((e) => e.type === "emote_muted"));
  await sleep(3100);
  const before = b.events.filter((e) => e.type === "emote").length;
  a.send({ type: "emote", id: "EMOTE_THINK" });
  assert.ok(await a.event((e) => e.type === "emote" && e.id === "EMOTE_THINK"));
  await sleep(300);
  assert.equal(b.events.filter((e) => e.type === "emote").length, before, "끈 뒤로는 안 옴");
  await playOut([a, b], 1);
  await sleep(500);
  assert.equal((await ok(c.get("/v1/friends"))).friends.find((f) => f.id === a.acc)?.status, "online", "판 끝나면 게임 중 해제");
  const recent = await ok(a.get("/v1/friends/recent"));
  assert.equal(recent.users[0].id, b.acc);
  step("친구방 초대→받기→참가, '게임 중' 표시·초대 불가, 감정표현(전달·3초 제한·미장착 거부·상대 끄기), 최근 대전 상대");
  a.ws.close(); b.ws.close();

  // 3) 랭킹전 2판 뒤 같은 상대 3번째는 매칭 안 됨(몰아주기 방지) + 랭크 로드·친구 랭킹
  for (let n = 0; n < 2; n += 1) {
    await a.queue(); await b.queue();
    const m = await a.matched(); assert.ok(m, `${n + 1}번째 매칭`); await b.matched();
    await a.room(m.code); await b.room(m.code);
    const seatA = a.state.you;
    const order = seatA === 0 ? [a, b] : [b, a];
    await toBattle(order, ["UM", "SI"]);
    await playOut(order, seatA === 0 ? 1 : 0);
    a.ws.close(); b.ws.close(); a.qws.close(); b.qws.close();
  }
  await a.queue(); await b.queue();
  assert.equal(await a.matched(4000), null, "24시간 안 3번째 같은 상대는 피함");
  a.qws.send('{"type":"cancel"}'); b.qws.send('{"type":"cancel"}');
  const econ = await ok(a.get("/v1/econ"));
  assert.ok(econ.rankRoad.claimable >= 1, JSON.stringify(econ.rankRoad).slice(0, 200));
  const road = await ok(a.post("/v1/rankroad/claim"));
  assert.ok(road.gold >= 100 && road.tiers.includes(1));
  await err(a.post("/v1/rankroad/claim"), "nothing_to_claim");
  const rf = await ok(a.get("/v1/rank/friends"));
  assert.ok(rf.rows.some((r) => r.me) && rf.rows.some((r) => r.id === b.acc));
  step(`랭킹전 2판 → 3번째 같은 상대 매칭 회피, 랭크 로드 ${road.tiers.length}단계 +${road.gold}골드(두 번 불가), 친구 랭킹`);

  // 4) 시즌 종료 → 크론이 최고 도달 티어 기준 우편 지급, 명예의 전당
  const sid = 9000 + Math.floor(Math.random() * 900);
  await sql("insert into public.seasons (id, starts_at, ends_at) values ($1, now() - interval '30 days', now() - interval '1 minute')", [sid]);
  await sql("insert into public.ratings (account_id, season_id, rp, tier_no, state) values ($1, $4, 3500, 16, '{\"best\":16}'), ($2, $4, 300, 4, '{\"best\":8}'), ($3, $4, 0, 1, '{\"best\":1}')", [a.acc, b.acc, c.acc, sid]);
  const cron = await fetch(`${API}/__scheduled?cron=*/5+*+*+*+*`);
  assert.equal(cron.status, 200);
  let mailB = null;
  for (let i = 0; i < 30 && !mailB; i += 1) { mailB = (await ok(b.get("/v1/mail"))).mail.find((m) => m.title === `시즌 ${sid} 보상`); if (!mailB) await sleep(300); }
  assert.ok(mailB, "시즌 보상 우편");
  assert.equal(mailB.rewards[0].amount, 2000, "최고 도달 골드 티어 기준");
  assert.ok(mailB.rewards.some((r) => r.id === `FRAME_S${sid}_GOLD`));
  const mailA = (await ok(a.get("/v1/mail"))).mail.find((m) => m.title === `시즌 ${sid} 보상`);
  assert.ok(mailA.rewards.some((r) => r.id === `FRAME_S${sid}_MASTER`) && mailA.rewards.some((r) => r.id === `TITLE_S${sid}`), JSON.stringify(mailA.rewards));
  const claimB = await ok(b.post("/v1/mail/claim", {}));
  assert.ok(claimB.items.includes(`FRAME_S${sid}_GOLD`));
  assert.ok((await ok(b.get("/v1/inventory"))).items.some((i) => i.id === `FRAME_S${sid}_GOLD` && i.kind === "frame"));
  assert.equal((await sql("select rewarded_at is not null as done from public.seasons where id = $1", [sid]))[0].done, true);
  step(`시즌 ${sid} 종료 → 크론이 최고 티어 기준 우편(골드 2,000 + 시즌 골드 프레임, 마스터는 프레임·칭호) → 받기 → 보관함`);

  console.log(`\n소셜·시즌 통합 테스트 ${steps.length}단계 통과`);
} catch (error) {
  console.error("FAIL:", error.message, error.stack?.split("\n").slice(1, 3).join(" "));
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=social live test::${String(error.message).replace(/\n/g, " ").slice(0, 900)}`);
  console.error(wlog.split("\n").filter((l) => /error|Error|✘/.test(l)).slice(-20).join("\n"));
  process.exitCode = 1;
} finally {
  wr.kill("SIGTERM");
  db.close();
  await pool.end().catch(() => {});
  rmSync(`${here}.dev.vars`, { force: true });
  setTimeout(() => process.exit(), 500);
}
