import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { aiAllowed, legendCount, leaverStatus, seasonStart, settle, tierForRp, tiersOf } from "../src/rank.mjs";

const DATA = JSON.parse(readFileSync(new URL("./fixtures/data_v1.json", import.meta.url)));
const { tiers } = tiersOf(DATA);
const row = (tier, extra = {}) => ({ rp: tiers.find((t) => t.no === tier).rp_start + (extra.rpOff ?? 0), tier, state: { streak: extra.streak ?? 0, best: tier, earlyUntil: 0, ...extra.state }, version: 1 });

test("시트 RP 계산기 예시: 골드 II·MMR 1100·2연승 → 승리 +27 / 패배 −23 / 이탈 −33", () => {
  const r = row(8, { streak: 2, rpOff: 50 });
  assert.equal(settle({ data: DATA, row: r, result: "win", mode: "ranked", mmr: 1100 }).rpDelta, 27);
  assert.equal(settle({ data: DATA, row: r, result: "loss", mode: "ranked", mmr: 1100 }).rpDelta, -23);
  assert.equal(settle({ data: DATA, row: r, result: "leave", mode: "ranked", mmr: 1100 }).rpDelta, -33);
});

test("단계표 값: 브론즈 패배 0, 실버 패배 −10, AI 승리 15·실버 AI 패배 −6 (시트 랭크_승점)", () => {
  assert.equal(settle({ data: DATA, row: row(2, { rpOff: 50 }), result: "loss", mode: "ranked", mmr: 850 }).rpDelta, 0);
  assert.equal(settle({ data: DATA, row: row(5, { rpOff: 50 }), result: "loss", mode: "ranked", mmr: 1000 }).rpDelta, -10);
  assert.equal(settle({ data: DATA, row: row(5, { rpOff: 50 }), result: "win", mode: "ranked_ai", mmr: 1000 }).rpDelta, 15);
  assert.equal(settle({ data: DATA, row: row(5, { rpOff: 50 }), result: "loss", mode: "ranked_ai", mmr: 1000 }).rpDelta, -6);
});

test("연승 보너스: 3연승째 +5, 4연승째 +10, 최대 10. 무승부는 변동 없고 연승 유지", () => {
  const base = row(8, { rpOff: 50 });
  assert.equal(settle({ data: DATA, row: { ...base, state: { ...base.state, streak: 3 } }, result: "win", mode: "ranked", mmr: 1150 }).rpDelta, 35);
  assert.equal(settle({ data: DATA, row: { ...base, state: { ...base.state, streak: 9 } }, result: "win", mode: "ranked", mmr: 1150 }).rpDelta, 35);
  const d = settle({ data: DATA, row: { ...base, state: { ...base.state, streak: 2 } }, result: "draw", mode: "ranked", mmr: 1150 });
  assert.deepEqual([d.rpDelta, d.state.streak], [0, 2]);
});

test("AI 랭킹전: 하루 5판까지만 RP 반영, MMR 미반영", () => {
  let r = row(3);
  const now = Date.UTC(2026, 9, 23, 3);
  const deltas = [];
  for (let i = 0; i < 6; i += 1) {
    const out = settle({ data: DATA, row: r, result: "win", mode: "ranked_ai", mmr: 900, now });
    deltas.push(out.rpDelta);
    assert.equal(out.mmrDelta, 0);
    r = { ...r, rp: out.rp, tier: out.tier, state: out.state };
  }
  assert.equal(deltas[5], 0, "6판째는 RP 0");
  assert.ok(deltas.slice(0, 5).every((d) => d > 0));
});

test("하한선: 골드 III 진입 후 그 시즌 동안 아래로 안 떨어짐 / 새 티어 3판 보호", () => {
  let r = row(6, { rpOff: 90 });  // 실버 I 590
  const up = settle({ data: DATA, row: r, result: "win", mode: "ranked", mmr: 1050 });
  assert.equal(up.tier, 7);
  assert.equal(up.state.floor, 7);
  assert.equal(up.state.protect, 3);
  r = { ...r, rp: up.rp, tier: up.tier, state: up.state };
  for (let i = 0; i < 5; i += 1) {
    const out = settle({ data: DATA, row: r, result: "loss", mode: "ranked", mmr: 1000 });
    r = { ...r, rp: out.rp, tier: out.tier, state: out.state };
  }
  assert.equal(r.tier, 7);
  assert.equal(r.rp, 600);
});

test("시즌 리셋: 골드 I → 실버 II(시트 리셋 열), 지난 최고 단계 전까지 승리 ×1.5", () => {
  const start = seasonStart(DATA, { tier_no: 9, rp: 850, state: { best: 10 } });
  assert.equal(start.tier, 5);
  assert.equal(start.rp, 400);
  const w = settle({ data: DATA, row: start, result: "win", mode: "ranked", mmr: 1000 });
  assert.equal(w.rpDelta, Math.round(25 * 1.5));
  assert.deepEqual([seasonStart(DATA, null).tier, seasonStart(DATA, null).rp], [1, 0]);
});

test("다이아 III(13)부터 AI 대체 없음, 레전드 = 마스터 상위 10%·최대 100명", () => {
  assert.equal(aiAllowed(DATA, 12), true);
  assert.equal(aiAllowed(DATA, 13), false);
  assert.equal(legendCount(DATA, 50), 5);
  assert.equal(legendCount(DATA, 5000), 100);
  assert.equal(tierForRp(tiers, 1499), 15);
  assert.equal(tierForRp(tiers, 99999), 16);
});

test("이탈 누적: 2회 → 다음 3판 5분 대기, 4회 → 24시간 잠금, 정상 5판마다 1회 감면, 닷지 5분", () => {
  const now = Date.UTC(2026, 9, 23, 12);
  const at = (h) => new Date(now - h * 3600000).toISOString();
  const two = leaverStatus(DATA, [{ kind: "leave", at: at(10) }, { kind: "leave", at: at(5) }, { kind: "win", at: at(4) }], now);
  assert.deepEqual([two.effective, two.delayMin], [2, 5]);
  const four = leaverStatus(DATA, [1, 2, 3, 4].map((h) => ({ kind: "leave", at: at(h) })), now);
  assert.equal(four.effective, 4);
  assert.ok(four.lockedUntil > now);
  const reduced = leaverStatus(DATA, [{ kind: "leave", at: at(50) }, ...[1, 2, 3, 4, 5].map((h) => ({ kind: "win", at: at(h) }))], now);
  assert.equal(reduced.effective, 0);
  const old = leaverStatus(DATA, [{ kind: "leave", at: at(24 * 8) }], now);
  assert.equal(old.leaves, 0, "7일 지난 이탈은 안 셈");
  assert.ok(leaverStatus(DATA, [{ kind: "dodge", at: at(0.05) }], now).dodgeUntil > now);
});
