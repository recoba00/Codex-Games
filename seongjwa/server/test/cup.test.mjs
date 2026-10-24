import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cupMatchTick, cupWindow, validRoster } from "../src/cup.mjs";

const DATA = JSON.parse(readFileSync(new URL("./fixtures/data_v1.json", import.meta.url)));
const kst = (s) => Date.parse(`${s}+09:00`);

test("컵 기간: 토 05:00 ~ 월 05:00(한국 시간), 주 = 그 토요일", () => {
  assert.deepEqual([cupWindow(kst("2026-10-31T05:00:00")).open, cupWindow(kst("2026-10-31T05:00:00")).week], [true, "2026-10-31"]);
  assert.equal(cupWindow(kst("2026-10-31T04:59:59")).open, false);
  assert.equal(cupWindow(kst("2026-10-31T04:59:59")).week, "2026-10-31", "토 05시 전이면 다가오는 기간");
  assert.deepEqual([cupWindow(kst("2026-11-02T04:59:00")).open, cupWindow(kst("2026-11-02T04:59:00")).week], [true, "2026-10-31"]);
  assert.deepEqual([cupWindow(kst("2026-11-02T05:00:00")).open, cupWindow(kst("2026-11-02T05:00:00")).week], [false, "2026-11-07"]);
  assert.deepEqual([cupWindow(kst("2026-10-28T12:00:00")).open, cupWindow(kst("2026-10-28T12:00:00")).week], [false, "2026-10-31"]);
  const w = cupWindow(kst("2026-11-01T20:00:00"));
  assert.equal(w.end - w.start, 2 * 86400000);
  assert.equal(new Date(w.start).toISOString(), "2026-10-30T20:00:00.000Z");
});

test("등록: 서로 다른 캐릭터 3명 + 프리셋 1~3", () => {
  assert.deepEqual(validRoster(DATA, [{ char: "AU", preset: 1 }, { char: "SE", preset: 2 }, { char: "UM" }]).map((r) => r.preset), [1, 2, 2]);
  assert.throws(() => validRoster(DATA, [{ char: "AU" }, { char: "AU" }, { char: "UM" }]), /cup_roster_invalid/);
  assert.throws(() => validRoster(DATA, [{ char: "AU" }, { char: "SE" }]), /cup_roster_invalid/);
  assert.throws(() => validRoster(DATA, [{ char: "AU", preset: 9 }, { char: "SE" }, { char: "UM" }]), /cup_roster_invalid/);
});

test("컵 매칭: 같은 승패 우선, 30초 넘으면 ±1승, AI 없음", () => {
  const T = 1e12, e = (acc, wins, losses, waited) => ({ acc, wins, losses, since: T - waited * 1000 });
  let r = cupMatchTick([e("a", 2, 1, 5), e("b", 3, 1, 5), e("c", 2, 1, 1)], T);
  assert.deepEqual(r.pairs.map(([x, y]) => [x.acc, y.acc]), [["a", "c"]]);
  r = cupMatchTick([e("a", 2, 1, 10), e("b", 3, 0, 10)], T);
  assert.equal(r.pairs.length, 0, "30초 전엔 같은 기록만");
  r = cupMatchTick([e("a", 2, 1, 31), e("b", 3, 0, 10)], T);
  assert.equal(r.pairs.length, 1, "30초 넘으면 ±1승");
  assert.equal(cupMatchTick([e("a", 0, 0, 31), e("b", 2, 0, 31)], T).pairs.length, 0, "2승 차이는 안 됨");
  assert.deepEqual(r.ai, []);
});

test("부계정 K값: 누적 5~19판 승률 70% 이상이면 ×2(상세 13), 설정값으로 조정", async () => {
  const { smurfKMult } = await import("../src/rank.mjs");
  assert.equal(smurfKMult(DATA, { games: 10, wins: 8 }), 2);
  assert.equal(smurfKMult(DATA, { games: 10, wins: 5 }), 1);
  assert.equal(smurfKMult(DATA, { games: 3, wins: 3 }), 1, "판수 너무 적음");
  assert.equal(smurfKMult(DATA, { games: 25, wins: 25 }), 1, "초반 구간 지남");
  assert.equal(smurfKMult({ settings: { smurf_k_mult: 1.5 } }, { games: 10, wins: 9 }), 1.5);
});
