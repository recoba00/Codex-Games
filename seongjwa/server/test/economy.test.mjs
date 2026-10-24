import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMatch, claimAttendance, claimMissions, econConfig, econView, firstWinMult, periodKeys, rerollDaily, roll } from "../src/economy.mjs";

const cfg = econConfig({});
const KST = (s) => Date.parse(`${s}+09:00`);
const base = (now = KST("2026-10-24T12:00:00")) => roll({}, { account: "acc-1", now, seasonId: 1, cfg });
const m = (o = {}) => ({ mode: "ranked", result: "win", character: "AU", faction: "불", exclusive: 0, spells: 0, tier: 1, tierMult: 1, ...o });

test("기간: 매일 05:00 KST, 주간은 월요일 05:00 KST (상세 05)", () => {
  assert.equal(periodKeys(KST("2026-10-24T04:59:00")).day, "2026-10-23");
  assert.equal(periodKeys(KST("2026-10-24T05:00:00")).day, "2026-10-24");
  assert.equal(periodKeys(KST("2026-10-26T04:00:00")).week, "2026-10-19");  // 월요일 05:00 전은 지난주
  assert.equal(periodKeys(KST("2026-10-26T05:00:00")).week, "2026-10-26");
  assert.equal(periodKeys(KST("2026-10-24T12:00:00")).nextReset, KST("2026-10-25T05:00:00"));
});

test("일일 미션 3개는 계정·날짜로 고정, 날짜가 바뀌면 새로", () => {
  const a = base(), b = base();
  assert.equal(a.daily.list.length, 3);
  assert.deepEqual(a.daily.list, b.daily.list);
  assert.equal(base(KST("2026-10-24T12:00:00")).weekly.list.length, 5);
  assert.equal(a.seasonM.list.length, 10);
  const next = roll({ ...a, daily: { ...a.daily, rerolls: 1 } }, { account: "acc-1", now: KST("2026-10-25T06:00:00"), seasonId: 1, cfg });
  assert.equal(next.daily.rerolls, 0);
  assert.equal(next.today.wins, 0);
});

test("판 보상: 승리 30골드(하루 10승까지) + 일일 첫 승 100×티어 배율 (시트 경제·랭크보상)", () => {
  let s = base();
  let r = applyMatch(s, m({ tierMult: firstWinMult("골드 II") }), cfg);
  assert.equal(r.gold, 30 + 120);
  s = r.state;
  for (let i = 0; i < 9; i += 1) { r = applyMatch(s, m(), cfg); assert.equal(r.gold, 30); s = r.state; }
  r = applyMatch(s, m(), cfg);
  assert.equal(r.gold, 0, "11승째는 승리 골드 없음");
  assert.equal(applyMatch(base(), m({ result: "loss" }), cfg).gold, 0);
  assert.equal(firstWinMult("브론즈 III"), 1);
  assert.equal(firstWinMult("마스터"), 1.5);
});

test("인정 범위: AI 대전은 하루 3판까지, 친구방은 소셜 미션만 (상세 05)", () => {
  let s = base();
  const gold = [];
  for (let i = 0; i < 4; i += 1) { const r = applyMatch(s, m({ mode: "practice" }), cfg); gold.push(r.gold); s = r.state; }
  assert.deepEqual(gold, [130, 30, 30, 0]);
  const f = applyMatch(base(), m({ mode: "friend" }), cfg);
  assert.equal(f.gold, 0);
  assert.equal(f.state.weekly.list.find((x) => x.id === "W_FRIEND1").done, true);
  assert.equal(f.state.weekly.list.find((x) => x.id === "W_WIN10").p, 0, "친구방 승리는 승리 미션에 안 셈");
});

test("미션 진행·받기: 진영 3개, 캐릭터별 승리, 티어 도달, 중복 받기 금지", () => {
  let s = base();
  for (const [character, faction] of [["AU", "불"], ["SE", "물"], ["SI", "바람"]]) s = applyMatch(s, m({ character, faction }), cfg).state;
  assert.equal(s.weekly.list.find((x) => x.id === "W_FACTION3").done, true);
  assert.equal(s.seasonM.list.find((x) => x.id === "S_CHARS9").p, 3);
  s = applyMatch(s, m({ tier: 7 }), cfg).state;
  assert.equal(s.seasonM.list.find((x) => x.id === "S_TIER_GOLD").done, true);
  const c = claimMissions(s, "weekly", "W_FACTION3", cfg);
  assert.equal(c.gold, 200);
  assert.throws(() => claimMissions(c.state, "weekly", "W_FACTION3", cfg), /mission_claimed/);
  assert.throws(() => claimMissions(c.state, "weekly", "W_WIN10", cfg), /mission_not_done/);
  const all = claimMissions(c.state, "season", "all", cfg);
  assert.deepEqual(all.ids.sort(), ["S_TIER_GOLD"]);
  const v = econView(all.state, cfg, Date.now());
  assert.equal(v.season.filter((x) => x.done && !x.claimed).length, 0);
  assert.equal(v.claimable, v.daily.filter((x) => x.done && !x.claimed).length + v.weekly.filter((x) => x.done && !x.claimed).length);
});

test("일일 미션 하루 1회 교체", () => {
  const s = base();
  const id = s.daily.list[0].id;
  const r = rerollDaily(s, id, "acc-1", cfg);
  assert.notEqual(r.id, id);
  assert.ok(!r.state.daily.list.some((x) => x.id === id));
  assert.equal(new Set(r.state.daily.list.map((x) => x.id)).size, 3);
  assert.throws(() => rerollDaily(r.state, r.state.daily.list[1].id, "acc-1", cfg), /reroll_used/);
});

test("출석: 매일 200, 7일째 +1,000, 누적 28일마다 +3,000, 하루 1번 (시트 경제·상세 05)", () => {
  let s = base();
  const golds = [];
  for (let d = 0; d < 28; d += 1) {
    s = roll(s, { account: "acc-1", now: KST("2026-10-24T12:00:00") + d * 2 * 86400000, seasonId: 1, cfg });  // 이틀에 한 번(빠져도 이어서)
    const r = claimAttendance(s, cfg);
    golds.push(r.gold);
    s = r.state;
    assert.throws(() => claimAttendance(s, cfg), /attendance_done/);
  }
  assert.equal(golds[0], 200);
  assert.equal(golds[6], 1200);
  assert.equal(golds[27], 200 + 1000 + 3000);
  assert.equal(golds.reduce((a, b) => a + b, 0), 28 * 200 + 4 * 1000 + 3000);
});

test("데이터 settings·tables로 덮어쓰기", () => {
  const c = econConfig({ settings: { econ_win_gold: 50 }, tables: { missions: { daily_count: 1, daily: [{ id: "D_X", name: "x", metric: "play", scope: "counted", target: 1, gold: 9 }], weekly: [], season: [] } } });
  assert.equal(c.econ_win_gold, 50);
  const s = roll({}, { account: "a", now: Date.now(), seasonId: 1, cfg: c });
  const r = applyMatch(s, m(), c);
  assert.equal(r.gold, 50 + 100);
  assert.equal(r.state.daily.list[0].done, true);
});
