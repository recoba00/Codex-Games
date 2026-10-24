import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { econConfig, firstWinMult } from "../src/economy.mjs";
import { claimRankRoad, payoutConfig, rankRoadSteps, rankRoadView, tierGroups } from "../src/season.mjs";

const DATA = JSON.parse(readFileSync(new URL("./fixtures/data_v1.json", import.meta.url)));

test("시즌 보상 설정: 시트 랭크보상 + 단계 번호 범위, 레전드 = 마스터 상위 N%(상세 08)", () => {
  assert.deepEqual(tierGroups(DATA)["골드"], { min: 7, max: 9 });
  const masters = Array.from({ length: 25 }, (_, i) => ({ account: `m${i}`, rp: 3000 - i }));
  const cfg = payoutConfig(DATA, masters);
  assert.deepEqual(cfg.groups.map((g) => [g.key, g.min, g.max, g.gold]),
    [["bronze", 1, 3, 500], ["silver", 4, 6, 1000], ["gold", 7, 9, 2000], ["platinum", 10, 12, 3500], ["diamond", 13, 15, 5000], ["master", 16, 16, 8000]]);
  assert.deepEqual([cfg.legend.gold, cfg.legend.grade, cfg.legend.title], [12000, 4, true]);
  assert.deepEqual(cfg.legends, ["m0", "m1"], "마스터 25명의 상위 10% = 2명");
  assert.equal(cfg.groups.find((g) => g.key === "silver").frame, true);
  assert.equal(cfg.groups.find((g) => g.key === "bronze").frame, false);
});

test("일일 첫 승 배율·기본 골드는 시트 랭크보상 값", () => {
  const cfg = econConfig(DATA);
  assert.equal(cfg.econ_first_win_gold, 100);
  assert.deepEqual(["브론즈 III", "실버 I", "다이아 II", "마스터"].map((t) => firstWinMult(t, cfg)), [1, 1.1, 1.4, 1.5]);
});

test("랭크 로드: 16단계, 티어 경계 300골드·나머지 100, 도달한 만큼 한 번에 받기, 다시 못 받음", () => {
  const steps = rankRoadSteps(DATA);
  assert.equal(steps.length, 16);
  assert.deepEqual(steps.filter((s) => s.gold === 300).map((s) => s.tier), [4, 7, 10, 13, 16]);
  let state = { season: 1, seasonM: { list: [], fw: {}, cw: {} } };
  const v = rankRoadView(state, DATA, { best: 7, rp: 650 });
  assert.equal(v.claimable, 7);
  assert.equal(v.nextRewardTier, "골드 II");
  const r = claimRankRoad(state, DATA, { best: 7 });
  assert.deepEqual([r.gold, r.tiers.length], [100 * 5 + 300 * 2, 7]);
  state = r.state;
  assert.throws(() => claimRankRoad(state, DATA, { best: 7 }), /nothing_to_claim/);
  assert.deepEqual(claimRankRoad(state, DATA, { best: 8 }).tiers, [8]);
  assert.equal(rankRoadView(state, DATA, { best: 8, rp: 700 }).claimable, 1);
});

test("랭크 로드·시즌 스킨: 시트 값(tables.rank_road·season_skins)이 있으면 그 값", async () => {
  const { seasonSkin } = await import("../src/season.mjs");
  const data = structuredClone(DATA);
  data.tables.rank_road = { steps: Array.from({ length: 16 }, (_, i) => ({ no: i + 1, gold: 50, extra: "", items: i === 3 ? ["EMOTE_S1"] : [] })) };
  data.tables.season_skins = { seasons: [{ no: 1, item: null }, { no: 2, item: "SKIN_AU_S2" }] };
  const r = claimRankRoad({ season: 1, seasonM: { list: [], fw: {}, cw: {} } }, data, { best: 4 });
  assert.deepEqual([r.gold, r.items], [200, ["EMOTE_S1"]]);
  assert.deepEqual([seasonSkin(data, 1), seasonSkin(data, 2), seasonSkin(data, 3)], [null, "SKIN_AU_S2", null]);
});
