// 통합 테스트(경제·미션·출석·우편·상점·결제): 실제 Workers 런타임(wrangler 로컬) + 실제 Postgres(마이그레이션 적용) + 가짜 Steam.
// 실행: PGHOST=… node test/live/econ.mjs  (npm run test:live:econ). CI는 postgres 서비스 컨테이너.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { rmSync, writeFileSync } from "node:fs";
import { pool, startPgRest } from "./pg-rest.mjs";

const DB_PORT = 54341, API_PORT = 8811, STEAM_PORT = 54342;
const API = `http://127.0.0.1:${API_PORT}`;
const here = new URL("../../", import.meta.url).pathname;
const db = await startPgRest(DB_PORT);

// 가짜 Steam MicroTxn: 주문 상태를 테스트가 정한다
const steamTxn = new Map();
const steamCalls = [];
const steam = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const q = new URLSearchParams(req.method === "POST" ? raw : url.search.slice(1));
    const method = url.pathname.split("/")[2];
    steamCalls.push({ method, path: url.pathname, orderid: q.get("orderid"), amount: q.get("amount[0]"), key: q.get("key") });
    const id = q.get("orderid");
    let params = {};
    if (method === "InitTxn") { steamTxn.set(id, "Init"); params = { orderid: id, transid: `T${id}` }; }
    if (method === "QueryTxn") params = { orderid: id, status: steamTxn.get(id) ?? "Failed" };
    if (method === "FinalizeTxn") { steamTxn.set(id, "Succeeded"); params = { orderid: id }; }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ response: { result: "OK", params } }));
  });
}).listen(STEAM_PORT, "127.0.0.1");

writeFileSync(`${here}.dev.vars`, `SUPABASE_URL=http://127.0.0.1:${DB_PORT}\nSUPABASE_SERVICE_KEY=sb_secret_local\nTOKEN_SECRET=local-test-secret-local-test-secret-123\n`);
const wr = spawn("npx", ["wrangler", "dev", "--port", String(API_PORT), "--ip", "127.0.0.1", "--var", "DEV_LOGIN:1", "--var", "AI_THINK_MS:150,300",
  "--var", "STEAM_WEB_API_KEY:test-publisher-key", "--var", "STEAM_APP_ID:480", "--var", `STEAM_API_BASE:http://127.0.0.1:${STEAM_PORT}`], { cwd: here, stdio: ["ignore", "pipe", "pipe"] });
let wlog = "";
wr.stdout.on("data", (d) => { wlog += d; });
wr.stderr.on("data", (d) => { wlog += d; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q, v) => pool.query(q, v).then((r) => r.rows);

async function call(path, body, token) {
  const res = await fetch(API + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const ok = async (p) => { const r = await p; assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };

class Client {
  constructor(name) { this.name = name; }
  async login() { const r = await ok(call("/v1/auth/dev", { devId: this.name })); this.token = r.accessToken; this.acc = r.accountId; }
  get(path) { return call(path, undefined, this.token); }
  post(path, body = {}) { return call(path, body, this.token); }
  async room(code) {
    const t = await ok(this.post(`/v1/rooms/${code}/ticket`));
    this.state = null;
    this.ws = new WebSocket(`ws://127.0.0.1:${API_PORT}/v1/rooms/${code}/ws?ticket=${encodeURIComponent(t.ticket)}`);
    this.ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "room") this.state = m; };
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
    throw new Error(`${this.name}: 매칭 안 됨`);
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  async until(pred, ms = 10000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (this.state && pred(this.state)) return this.state; await sleep(40); }
    throw new Error(`${this.name}: 조건 시간 초과 ${JSON.stringify(this.state)?.slice(0, 400)}`);
  }
}

// 판 진행: 밴 없음 → 픽 → 덱 → 4턴까지 카드 1장씩 → 진 쪽 항복
async function playMatch(players, picks, loserIdx) {
  const lead = players[0];
  if (lead.state.phase === "ban") { players.forEach((p) => p.send({ type: "ban", characterId: null })); await lead.until((s) => s.phase === "pick"); }
  players.forEach((p, i) => p.send({ type: "pick", characterId: picks[i] }));
  await lead.until((s) => s.phase === "loadout");
  players.forEach((p) => p.send({ type: "loadout", spells: ["SP01", "SP04"], preset: 2 }));
  await lead.until((s) => s.phase === "battle");
  while (lead.state.phase === "battle" && lead.state.battle.turn < 4) {
    const t = lead.state.battle.turn;
    for (const p of players) {
      const me = p.state.battle.me;
      if (me.submitted) continue;
      const c = me.hand.find((h) => h.cost <= me.energy && !h.sealed);
      p.send({ type: "act", turn: t, cards: c ? [c.uid] : [] });
    }
    await lead.until((s) => s.phase !== "battle" || s.battle.turn > t, 8000);
  }
  if (lead.state.phase === "battle") players[loserIdx].send({ type: "surrender" });
  return lead.until((s) => s.phase === "result" && s.last?.econ, 10000);
}

const steps = [];
const step = (s) => { steps.push(s); console.log(`ok - ${s}`); };
try {
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* */ } await sleep(500); }
  const tag = Date.now().toString(36);
  const [alice, bob] = [`ea${tag}`, `eb${tag}`].map((n) => new Client(n));
  for (const c of [alice, bob]) await c.login();
  await sql("insert into public.identities (account_id, provider, provider_uid) values ($1, 'steam', $2)", [bob.acc, `7656119${String(Date.now()).slice(-10)}`]);
  const T = tag.toUpperCase();
  await sql(`insert into public.catalog_items (id, kind, character_id, name) values ($1, 'emote', null, '시험 감정'), ($2, 'skin', 'AU', '시험 스킨'), ($3, 'cardback', null, '시험 뒷면')`, [`E_${T}`, `S_${T}`, `B_${T}`]);
  await sql(`insert into public.shop_offers (id, item_id, tab, price_gold, price_krw) values ($1, $2, 'cosmetic', 3000, 2900), ($3, $4, 'skin', null, 7900), ($5, $6, 'cosmetic', 6000, 5900)`,
    [`OE_${T}`, `E_${T}`, `OS_${T}`, `S_${T}`, `OB_${T}`, `B_${T}`]);

  // 1) 로비 경제 화면 + 출석
  let e = await ok(alice.get("/v1/econ"));
  assert.deepEqual([e.gold, e.daily.length, e.weekly.length, e.season.length, e.attendance.claimedToday], [0, 3, 5, 10, false]);
  const att = await ok(alice.post("/v1/attendance/claim"));
  assert.deepEqual([att.gold, att.balance, att.cycleDay], [200, 200, 1]);
  assert.equal((await alice.post("/v1/attendance/claim")).body.error, "attendance_done");
  step("로비 경제 화면(미션 3·5·10) → 출석 1일차 +200, 같은 날 두 번 불가");

  // 2) 친구방 한 판: 골드 없음, 소셜 미션만
  const made = await ok(alice.post("/v1/rooms", { options: { bans: false, turnSec: 20 } }));
  await ok(bob.post(`/v1/rooms/${made.code}/join`));
  await alice.room(made.code); await bob.room(made.code);
  const defaults = { preferred: ["AU"], spells: ["SP01", "SP04"], preset: 2 };
  alice.send({ type: "ready", defaults }); bob.send({ type: "ready", defaults });
  await alice.until((s) => s.phase === "ban" || s.phase === "pick");
  let st = await playMatch([alice, bob], ["AU", "SE"], 1);
  assert.equal(st.last.econ[0].gold, 0, "친구방은 골드 없음");
  e = await ok(alice.get("/v1/econ"));
  assert.equal(e.weekly.find((m) => m.id === "W_FRIEND1").done, true);
  assert.equal(e.today.wins, 0);
  step("친구방 승리: 골드 0, '친구와 1판' 미션 완료, 승리 수 안 셈");
  alice.ws.close(); bob.ws.close();

  // 3) 랭킹전 승리: 30 + 첫 승 100(브론즈 ×1.0)
  await alice.queue(); await bob.queue();
  const mq = await alice.matched(); await bob.matched();
  await alice.room(mq.code); await bob.room(mq.code);
  const aSeat = alice.state.you;
  st = await playMatch(aSeat === 0 ? [alice, bob] : [bob, alice], ["SE", "UM"], aSeat === 0 ? 1 : 0);
  await sleep(300);
  st = await alice.until((s) => s.last?.econ?.[aSeat]);
  assert.equal(st.last.econ[aSeat].gold, 130, JSON.stringify(st.last.econ));
  e = await ok(alice.get("/v1/econ"));
  assert.deepEqual([e.gold, e.today.wins, e.today.firstWinDone], [330, 1, true]);
  const led = await sql("select count(*)::int n from public.gold_ledger where account_id = $1 and ref like 'match:%'", [alice.acc]);
  assert.equal(led[0].n, 2, "판마다 장부 1줄(친구방 0골드 포함)");
  step(`랭킹전 승리 → +30 승리 +100 첫 승(${e.tierName}) = 잔액 ${e.gold}`);
  alice.ws.close(); bob.ws.close();

  // 4) 미션 받기 + 일일 교체
  const cl = await ok(alice.post("/v1/missions/claim", { kind: "weekly", id: "W_FRIEND1" }));
  assert.deepEqual([cl.gold, cl.balance], [200, 530]);
  assert.equal((await alice.post("/v1/missions/claim", { kind: "weekly", id: "W_FRIEND1" })).body.error, "mission_claimed");
  const unclaimed = e.daily.find((m) => !m.claimed);
  const rr = await ok(alice.post("/v1/missions/reroll", { id: unclaimed.id }));
  assert.notEqual(rr.newId, unclaimed.id);
  assert.equal((await alice.post("/v1/missions/reroll", { id: rr.newId })).body.error, "reroll_used");
  step("주간 미션 받기 +200(두 번 불가), 일일 미션 1회 교체(두 번째 불가)");

  // 5) 우편 → 골드 구매(가격 확인·중복 요청·보유 중)
  assert.equal((await alice.post("/v1/shop/buy", { offerId: `OE_${T}`, price: 3000, requestId: `r1-${tag}` })).body.error, "gold_short");
  await sql("select public.mail_send($1, '운영 보상', '테스트', '[{\"type\":\"gold\",\"amount\":10000}]', $2, 30)", [alice.acc, `test:${tag}`]);
  e = await ok(alice.get("/v1/econ"));
  assert.equal(e.mailUnread, 1);
  const mc = await ok(alice.post("/v1/mail/claim", {}));
  assert.deepEqual([mc.claimed, mc.gold, mc.balance], [1, 10000, 10530]);
  const shop = await ok(alice.get("/v1/shop"));
  assert.ok(shop.offers.some((o) => o.offer === `OE_${T}` && !o.owned));
  assert.equal((await alice.post("/v1/shop/buy", { offerId: `OE_${T}`, price: 2000, requestId: `r2-${tag}` })).body.error, "price_changed");
  const buy = await ok(alice.post("/v1/shop/buy", { offerId: `OE_${T}`, price: 3000, requestId: `r3-${tag}` }));
  assert.equal(buy.gold, 7530);
  assert.equal((await ok(alice.post("/v1/shop/buy", { offerId: `OE_${T}`, price: 3000, requestId: `r3-${tag}` }))).status, "duplicate");
  assert.equal((await alice.post("/v1/shop/buy", { offerId: `OE_${T}`, price: 3000, requestId: `r4-${tag}` })).body.error, "already_owned");
  assert.equal((await ok(alice.get("/v1/econ"))).gold, 7530, "중복 요청에 이중 차감 없음");
  step("우편 모두 받기 +10,000 → 골드 구매 3,000(가격 변경·같은 요청 재전송·보유 중 처리)");

  // 6) 현금 구매(테스트 환경 dev 결제) → 지급 → 장착
  const od = await ok(alice.post("/v1/shop/orders", { offerId: `OS_${T}`, price: 7900 }));
  assert.equal(od.provider, "dev");
  const fin = await ok(alice.post(`/v1/shop/orders/${od.order}/finalize`));
  assert.equal(fin.status, "ok");
  assert.equal((await ok(alice.post(`/v1/shop/orders/${od.order}/finalize`))).status, "duplicate");
  const inv = await ok(alice.get("/v1/inventory"));
  assert.ok(inv.items.some((i) => i.id === `S_${T}` && i.source === "cash"));
  assert.equal(inv.items.filter((i) => i.kind === "emote").length, 5, "기본 4 + 구매 1");
  await ok(alice.post("/v1/profile/equip", { skins: { AU: `S_${T}` }, emotes: ["EMOTE_HELLO", `E_${T}`] }));
  assert.equal((await alice.post("/v1/profile/equip", { skins: { SE: `S_${T}` } })).body.error, "item_not_owned", "다른 캐릭터 스킨");
  assert.equal((await alice.post("/v1/profile/equip", { cardback: `B_${T}` })).body.error, "item_not_owned", "안 산 뒷면");
  step("현금 구매(dev 결제) → 즉시 지급(재확정 중복 없음) → 스킨·감정표현 장착, 남의 것 장착 불가");

  // 7) Steam 결제: 승인 전 확정 시도 → 대기, 결제됐는데 지급 못 받은 주문 → 다음 로그인 때 우편 지급
  const os = await ok(bob.post("/v1/shop/orders", { offerId: `OB_${T}`, price: 5900 }));
  assert.equal(os.provider, "steam");
  const init = steamCalls.find((c) => c.method === "InitTxn" && c.orderid === os.order);
  assert.ok(init && init.amount === "590000" && init.key === "test-publisher-key" && init.path.includes("Sandbox"), JSON.stringify(steamCalls));
  assert.equal((await bob.post(`/v1/shop/orders/${os.order}/finalize`)).body.error, "payment_pending");
  steamTxn.set(os.order, "Approved");  // 사용자가 오버레이에서 승인했지만 앱이 종료돼 확정 요청이 오지 않음
  await sql("update public.orders set created_at = now() - interval '2 minutes' where id = $1", [os.order]);
  e = await ok(bob.get("/v1/econ"));
  assert.deepEqual(e.recovered.map((x) => x.order), [os.order]);
  assert.ok(steamCalls.some((c) => c.method === "FinalizeTxn" && c.orderid === os.order));
  const bm = await ok(bob.post("/v1/mail/claim", {}));
  assert.deepEqual(bm.items, [`B_${T}`]);
  assert.ok((await ok(bob.get("/v1/inventory"))).items.some((i) => i.id === `B_${T}`));
  step("Steam 결제(샌드박스, 원화 ×100): 승인 전엔 대기 → 승인 후 미확정 주문을 로비 진입 때 확정·우편 지급");

  // 8) 환불 회수 + 닉네임
  const orderId = (await sql("select id from public.orders where id = $1", [os.order]))[0].id;
  await sql("select public.order_refund($1, 'test')", [orderId]);
  assert.ok(!(await ok(bob.get("/v1/inventory"))).items.some((i) => i.id === `B_${T}`));
  const n1 = await ok(alice.post("/v1/profile/name", { name: `앨리스${tag.slice(-3)}`, requestId: `n1-${tag}` }));
  assert.equal(n1.cost, 0);
  e = await ok(alice.get("/v1/econ"));
  assert.equal(e.nameChangeGold, 4000);
  const n2 = await ok(alice.post("/v1/profile/name", { name: `앨리스2${tag.slice(-3)}`, requestId: `n2-${tag}` }));
  assert.deepEqual([n2.cost, n2.gold], [4000, 3530]);
  assert.equal((await alice.post("/v1/profile/name", { name: "a", requestId: `n3-${tag}` })).body.error, "name_invalid");
  step("환불 → 상품 회수(골드는 그대로), 닉네임 첫 변경 무료·두 번째 4,000골드");

  console.log(`\n경제 통합 테스트 ${steps.length}단계 통과`);
} catch (error) {
  console.error("FAIL:", error.message);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=econ live test::${String(error.message).replace(/\n/g, " ").slice(0, 900)}`);
  console.error(wlog.split("\n").filter((l) => /error|Error|✘/.test(l)).slice(-20).join("\n"));
  process.exitCode = 1;
} finally {
  wr.kill("SIGTERM");
  db.close(); steam.close();
  await pool.end().catch(() => {});
  rmSync(`${here}.dev.vars`, { force: true });
  setTimeout(() => process.exit(), 500);
}
