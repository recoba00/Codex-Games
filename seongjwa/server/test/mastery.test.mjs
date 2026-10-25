import assert from "node:assert/strict";
import { test } from "node:test";
import { masteryCfg, masteryTier, masteryTiers, masteryView } from "../src/mastery.mjs";

test("숙련도 단계: 0·40·150·400점(가안), 4단계 최소 승률 키, 설정값으로 조정", () => {
  const cfg = masteryCfg({});
  assert.deepEqual(cfg, { winBonus: 1, t2: 40, t3: 150, t4: 400, t4Winrate: 0 });
  assert.deepEqual([0, 39, 40, 149, 150, 399, 400].map((p) => masteryTier({ points: p, games: 10, wins: 1 }, cfg)), [1, 1, 2, 2, 3, 3, 4]);
  const strict = masteryCfg({ settings: { mastery_t4_winrate: 0.55 } });
  assert.equal(masteryTier({ points: 500, games: 100, wins: 54 }, strict), 3, "승률 54%면 4단계 아님");
  assert.equal(masteryTier({ points: 500, games: 100, wins: 55 }, strict), 4);
  assert.equal(masteryTier({ points: 50 }, masteryCfg({ settings: { mastery_t2: 60 } })), 1);
  assert.deepEqual(masteryView({ AU: { points: 45, games: 30, wins: 15 } }, {}).AU, { points: 45, games: 30, wins: 15, tier: 2, next: 150 });
  assert.deepEqual(masteryTiers({ AU: { points: 45 }, SE: { points: 3 } }, {}), { AU: 2 }, "1단계는 생략");
});
