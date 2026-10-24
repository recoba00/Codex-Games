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

test("판 보상: 랭킹전 승리 30골드(하루 10승까지) + 일일 첫 승 100×티어 배율 (시트 경제·랭크보상)", () => {
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

test("인정 범위: AI 대전은 하루 3판까지 승리 15골드·첫 승 없음, 친구방은 소셜 미션만 (기획답변 13차 A4)", () => {
  let s = base();
  const gold = [];
  for (let i = 0; i < 4; i += 1) { const r = applyMatch(s, m({ mode: "practice" }), cfg); gold.push(r.gold); s = r.state; }
  assert.deepEqual(gold, [15, 15, 15, 0]);
  assert.equal(s.today.firstWin, false, "AI 대전 승리는 일일 첫 승 아님");
  assert.equal(applyMatch(s, m(), cfg).gold, 30 + 100, "그 뒤 랭킹전 첫 승은 정상");
  assert.equal(s.weekly.list.find((x) => x.id === "W04").p, 3, "AI 대전 3판까지 승리 미션 인정");
  assert.equal(s.weekly.list.find((x) => x.id === "W01").p, 0, "랭킹전 전용 미션은 AI 대전 미인정");
  const f = applyMatch(base(), m({ mode: "friend" }), cfg);
  assert.equal(f.gold, 0);
  assert.equal(f.state.weekly.list.find((x) => x.id === "W03").done, true);
  assert.equal(f.state.weekly.list.find((x) => x.id === "W04").p, 0, "친구방 승리는 승리 미션에 안 셈");
});

test("미션 진행·받기: 진영 3개, 캐릭터별 승리, 티어 도달(any), 중복 받기 금지", () => {
  let s = base();
  for (const [character, faction] of [["AU", "불"], ["SE", "물"], ["SI", "바람"]]) s = applyMatch(s, m({ character, faction }), cfg).state;
  assert.equal(s.weekly.list.find((x) => x.id === "W02").done, true);
  assert.equal(s.seasonM.list.find((x) => x.id === "S09").p, 3);
  assert.equal(s.seasonM.list.find((x) => x.id === "S05").p, 0, "진영별 5승 아직");
  s = applyMatch(s, m({ mode: "friend", tier: 7 }), cfg).state;
  assert.equal(s.seasonM.list.find((x) => x.id === "S01").done, true, "골드 티어 도달(범위 any)");
  assert.equal(s.seasonM.list.find((x) => x.id === "S10").done, false);
  const c = claimMissions(s, "weekly", "W02", cfg);
  assert.equal(c.gold, 200);
  assert.throws(() => claimMissions(c.state, "weekly", "W02", cfg), /mission_claimed/);
  assert.throws(() => claimMissions(c.state, "weekly", "W04", cfg), /mission_not_done/);
  const all = claimMissions(c.state, "season", "all", cfg);
  assert.deepEqual(all.ids.sort(), ["S01"]);
  assert.equal(all.gold, 500);
  const v = econView(all.state, cfg, Date.now());
  assert.equal(v.weekly.find((x) => x.id === "W02").target, 3, "진영 미션 분모 = 진영 수");
  assert.equal(v.season.filter((x) => x.done && !x.claimed).length, 0);
});

test("미션 표가 바뀌면 같은 ID 진행은 유지하고 새 ID는 0부터", () => {
  let s = applyMatch(base(), m(), cfg).state;
  const cfg2 = econConfig({ tables: { missions: { ...cfg.missions, weekly: [...cfg.missions.weekly.slice(0, 4), { id: "W09", name: "x", metric: "games", target: 2, aux: {}, scope: "any", gold: 1 }] } } });
  s = roll(s, { account: "acc-1", now: KST("2026-10-24T13:00:00"), seasonId: 1, cfg: cfg2 });
  assert.deepEqual(s.weekly.list.map((x) => [x.id, x.p]), [["W01", 1], ["W02", 1], ["W03", 0], ["W04", 1], ["W09", 0]]);
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

test("출석: 매일 200, 7일째 +1,000, 누적 28일째 +3,000 1회만, 하루 1번 (기획답변 13차 A5)", () => {
  let s = base();
  const golds = [];
  for (let d = 0; d < 35; d += 1) {
    s = roll(s, { account: "acc-1", now: KST("2026-10-24T12:00:00") + d * 2 * 86400000, seasonId: 1, cfg });  // 이틀에 한 번(빠져도 이어서)
    const r = claimAttendance(s, cfg);
    golds.push(r.gold);
    s = r.state;
    assert.throws(() => claimAttendance(s, cfg), /attendance_done/);
  }
  assert.equal(golds[0], 200);
  assert.equal(golds[6], 1200);
  assert.equal(golds[27], 200 + 1000 + 3000);
  assert.equal(golds[34], 200 + 1000, "35일째(7일째 보너스)는 누적 보상 없음");
});

test("데이터 settings·tables로 덮어쓰기", () => {
  const c = econConfig({ settings: { econ_win_gold: 50, econ_daily_count: 1 }, tables: { missions: { daily: [{ id: "D09", name: "x", metric: "games", target: 1, aux: {}, scope: "ranked_ai", gold: 9 }], weekly: [], season: [] } } });
  assert.equal(c.econ_win_gold, 50);
  const s = roll({}, { account: "a", now: Date.now(), seasonId: 1, cfg: c });
  const r = applyMatch(s, m(), c);
  assert.equal(r.gold, 50 + 100);
  assert.equal(r.state.daily.list[0].done, true);
});
