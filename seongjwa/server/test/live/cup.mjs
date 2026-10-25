// 통합 테스트(챔피언스 컵·요청 제한·어뷰징 의심): Workers 런타임(wrangler 로컬) + 실제 Postgres.
// 실행: PGHOST=… node test/live/cup.mjs  (npm run test:live:cup)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { pool, startPgRest } from "./pg-rest.mjs";

const DB_PORT = 54397, API_PORT = 8877;
const API = `http://127.0.0.1:${API_PORT}`;
const here = new URL("../../", import.meta.url).pathname;
const db = await startPgRest(DB_PORT);
writeFileSync(`${here}.dev.vars`, `SUPABASE_URL=http://127.0.0.1:${DB_PORT}\nSUPABASE_SERVICE_KEY=sb_secret_local\nTOKEN_SECRET=local-test-secret-local-test-secret-123\nCUP_ALWAYS_OPEN=1\nDEV_AUTH_RATE=12\n`);
// 시험마다 따로 둔 로컬 DO 저장소(앞 시험의 workerd가 늦게 끝나면 SQLITE_BUSY로 DO가 리셋되던 문제)
const PERSIST = `${here}.wrangler/live-${process.pid}`;
const wr = spawn("npx", ["wrangler", "dev", "--persist-to", PERSIST, "--port", String(API_PORT), "--ip", "127.0.0.1", "--test-scheduled", "--var", "DEV_LOGIN:1"], { cwd: here, stdio: ["ignore", "pipe", "pipe"] });
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
    this.ws.onclose = (e) => this.events.push({ type: "closed", code: e.code });
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    await this.until((s) => s);
  }
  async queue() {
    const t = await ok(this.post("/v1/cup/ticket", {}));
    this.q = [];
    this.qws = new WebSocket(`ws://127.0.0.1:${API_PORT}/v1/cup/ws?ticket=${encodeURIComponent(t.ticket)}`);
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

const steps = [];
const step = (s) => { steps.push(s); console.log(`ok - ${s}`); };
const R = (a, b, c) => [{ char: a, preset: 1 }, { char: b, preset: 2 }, { char: c, preset: 3 }];
try {
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* */ } await sleep(500); }
  await sql("delete from public.rate_hits");  // 앞 시험들의 로그인 횟수(같은 IP·같은 분)를 비움(시험 DB만)
  const tag = Date.now().toString(36);
  const [a, b, c] = ["ca", "cb", "cc"].map((n) => new Client(`${n}${tag}`));
  for (const x of [a, b, c]) await x.login();

  // 1) 자격·참가: 플래티넘 III 미만 거부, 등록 검사, 참가권
  const st0 = await ok(a.get("/v1/cup"));
  assert.equal(st0.eligible, false);
  assert.deepEqual([st0.rewards.length, st0.rewards[0].gold, st0.rules.waitSec, typeof st0.special], [4, st0.special ? 1500 : 1000, 300, "boolean"], "보상표·최대 대기·특별 주간(기획답변 23차)");
  const sid = (await sql("select id from public.seasons where starts_at <= now() and ends_at > now() order by id desc limit 1"))[0].id;
  await sql("insert into public.ratings (account_id, season_id, rp, tier_no, state) values ($1, $3, 1000, 11, '{\"best\":11}'), ($2, $3, 900, 10, '{\"best\":10}') on conflict (account_id, season_id) do update set state = excluded.state, tier_no = excluded.tier_no", [a.acc, b.acc, sid]);
  await err(c.post("/v1/cup/enter", { roster: R("AU", "SE", "UM") }), "cup_not_eligible");
  await err(a.post("/v1/cup/enter", { roster: R("AU", "AU", "UM") }), "cup_roster_invalid");
  await err(a.post("/v1/cup/ticket", {}), "cup_no_entry");
  await ok(a.post("/v1/cup/enter", { roster: R("AU", "SE", "UM") }));
  await ok(b.post("/v1/cup/enter", { roster: R("PY", "SI", "AU") }));
  await err(a.post("/v1/cup/enter", { roster: R("AU", "SE", "UM") }), "cup_entry_active");
  const st1 = await ok(a.get("/v1/cup"));
  assert.deepEqual([st1.eligible, st1.used, st1.allowed, st1.entry.wins], [true, 1, 1, 0]);
  step("자격(플래티넘 III) 미달 거부, 서로 다른 3명 등록, 참가 없으면 매칭 불가, 진행 중 중복 참가 불가");

  // 2) 컵 매칭 → 밴(상대 등록 3명 중) → 픽(내 등록 중 밴 안 된 것) → 덱 프리셋 고정 → 전투 → 항복 → 1승·1패 기록
  await a.queue(); await b.queue();
  const m = await a.matched(); assert.ok(m, "컵 매칭"); await b.matched();
  await a.room(m.code); await b.room(m.code);
  assert.equal(a.state.mode, "cup"); assert.equal(a.state.phase, "ban");
  assert.deepEqual(a.state.prep.characters.sort(), ["AU", "PY", "SI"], "밴 단계엔 상대 등록 3명");
  a.send({ type: "ban", characterId: "SE" });   // 상대 등록에 없음
  assert.ok(await a.event((e) => e.type === "error" && e.error === "character_unavailable"));
  a.send({ type: "ban", characterId: "PY" }); b.send({ type: "ban", characterId: "AU" });
  await a.until((s) => s.phase === "pick", 30000);
  assert.deepEqual(a.state.prep.characters.sort(), ["SE", "UM"], "내 등록 중 상대가 밴한 AU 제외");
  assert.deepEqual(b.state.prep.characters.sort(), ["AU", "SI"], "같은 AU라도 b의 AU는 밴 안 됨");
  a.send({ type: "pick", characterId: "AU" });
  assert.ok(await a.event((e) => e.type === "error" && e.error === "character_unavailable" && e.about === "pick"));
  a.send({ type: "pick", characterId: "UM" }); b.send({ type: "pick", characterId: "AU" });
  await a.until((s) => s.phase === "loadout", 30000);
  a.send({ type: "loadout", spells: ["SP01", "SP04"], preset: 1 }); b.send({ type: "loadout", spells: ["SP02", "SP03"], preset: 2 });
  await a.until((s) => s.phase === "battle", 30000);
  assert.equal(a.state.prep.myLoadout.preset, 3, "덱은 등록한 프리셋(UM=3) 고정");
  assert.equal(b.state.prep.myLoadout.preset, 3, "b의 AU=3");
  while (a.state.phase === "battle" && a.state.battle.turn < 4) {
    const t = a.state.battle.turn;
    for (const p of [a, b]) if (!p.state.battle.me.submitted) { const me = p.state.battle.me, cd = me.hand.find((h) => h.cost <= me.energy && !h.sealed); p.send({ type: "act", turn: t, cards: cd ? [cd.uid] : [] }); }
    await a.until((s) => s.phase !== "battle" || s.battle.turn > t, 30000);
  }
  if (a.state.phase === "battle") b.send({ type: "surrender" });
  await a.until((s) => s.phase === "result" && s.last?.cup, 30000);
  const rec = await sql("select account_id, wins, losses, status from public.cup_entries where account_id in ($1, $2)", [a.acc, b.acc]);
  const ra = rec.find((x) => x.account_id === a.acc), rb = rec.find((x) => x.account_id === b.acc);
  assert.deepEqual([ra.wins, ra.losses, rb.wins, rb.losses], [1, 0, 0, 1]);
  assert.equal((await sql("select count(*)::int n from public.rank_events where account_id in ($1, $2)", [a.acc, b.acc]))[0].n, 0, "랭크 영향 없음");
  const mr = (await sql("select mode from public.match_results where player_a = $1 or player_b = $1 order by ended_at desc limit 1", [a.acc]))[0];
  assert.equal(mr?.mode, "cup");
  step("컵 매칭(같은 승패) → 상대 등록 중 밴 → 남은 내 캐릭터 픽 → 덱 프리셋 고정 → 전투 → 1승·1패 기록, 랭크 영향 없음");
  a.ws.close(); b.ws.close(); a.qws.close(); b.qws.close();

  // 3) 이탈: 밴픽 중 나가면 이탈 패배 → 이번 주 끝, 다음 주 참가권 차감
  await a.queue(); await b.queue();
  const m2 = await a.matched(45000); assert.ok(m2, "±1승 범위 매칭(30초 뒤)"); await b.matched();
  await a.room(m2.code); await b.room(m2.code);
  b.ws.close();
  await a.until((s) => s.phase === "closed" || s.notice?.startsWith("dodge"), 60000);
  let eb = null;
  for (let i = 0; i < 40 && eb?.status !== "left"; i += 1) { eb = (await sql("select status, losses from public.cup_entries where account_id = $1 order by id desc limit 1", [b.acc]))[0]; if (eb.status !== "left") await sleep(250); }
  assert.deepEqual([eb.status, eb.losses], ["left", 2]);
  await err(b.post("/v1/cup/enter", { roster: R("PY", "SI", "AU") }), "cup_left_this_week");
  assert.equal((await sql("select count(*)::int n from public.cup_penalties where account_id = $1", [b.acc]))[0].n, 1);
  assert.equal((await sql("select status from public.cup_entries where account_id = $1", [a.acc]))[0].status, "active", "남은 쪽은 계속");
  step("밴픽 중 이탈 → 이탈 패배·이번 주 끝(재참가 불가)·다음 주 참가권 차감, 상대는 계속");
  a.ws.close(); a.qws.close();

  // 4) 요청 제한(로그인 1분 12회) · 백오피스 어뷰징 의심 목록
  let limited = false;
  for (let i = 0; i < 26 && !limited; i += 1) limited = (await call("/v1/auth/dev", { devId: `rl${tag}` })).status === 429;
  assert.ok(limited, "로그인 반복 → 429 rate_limited");
  const boot = `BOOT-${tag}`;
  await sql("insert into public.staff_invites (code_hash, role, expires_at) values ($1, 'admin', now() + interval '1 day')", [createHash("sha256").update(boot).digest("hex")]);
  await ok(call("/bo/v1/register", { code: boot, login: `cu${tag}`, name: "컵", password: "pw-cup-0123456789" }));
  const admin = (await ok(call("/bo/v1/login", { login: `cu${tag}`, password: "pw-cup-0123456789" }))).token;
  const sus = await ok(call("/bo/v1/suspects?days=7", undefined, admin));
  assert.ok(["macro", "marathon", "pairs", "smurf"].every((k) => Array.isArray(sus[k])));
  step("로그인 반복 요청 제한(429), 백오피스 어뷰징 의심 목록(매크로·연속 플레이·몰아주기·부계정)");

  console.log(`\n컵·운영 보강 통합 테스트 ${steps.length}단계 통과`);
} catch (error) {
  console.error("FAIL:", error.message, error.stack?.split("\n").slice(1, 3).join(" "));
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=cup live test::${String(error.message).replace(/\n/g, " ").slice(0, 900)}`);
  console.error(wlog.split("\n").filter((l) => /error|Error|✘/.test(l)).slice(-20).join("\n")); if (process.env.WLOG_FILE) (await import("node:fs")).writeFileSync(process.env.WLOG_FILE, wlog);
  process.exitCode = 1;
} finally {
  wr.kill("SIGTERM");
  db.close();
  await pool.end().catch(() => {});
  rmSync(`${here}.dev.vars`, { force: true });
  setTimeout(() => { try { rmSync(PERSIST, { recursive: true, force: true }); } catch { /* */ } }, 300);
  setTimeout(() => process.exit(), 500);
}
