import assert from "node:assert/strict";
import { test } from "node:test";
import { masteryCfg, masteryDbCfg, masteryTier, masteryTiers, masteryView } from "../src/mastery.mjs";

test("숙련도 단계: 0·40·150·400점(가안), 4단계 최소 승률 키, 설정값으로 조정", () => {
  const cfg = masteryCfg({});
  assert.deepEqual(cfg, { winBonus: 1, t2: 40, t3: 150, t4: 400, t4Winrate: 0, emoteStage: 3, titleStage: 4, emoteItem: null });
  assert.equal(masteryDbCfg({ settings: { mastery_emote_item: "EMOTE_M" } }).emote_item, "EMOTE_M");
  assert.deepEqual([0, 39, 40, 149, 150, 399, 400].map((p) => masteryTier({ points: p, games: 10, wins: 1 }, cfg)), [1, 1, 2, 2, 3, 3, 4]);
  const strict = masteryCfg({ settings: { mastery_t4_winrate: 0.55 } });
  assert.equal(masteryTier({ points: 500, games: 100, wins: 54 }, strict), 3, "승률 54%면 4단계 아님");
  assert.equal(masteryTier({ points: 500, games: 100, wins: 55 }, strict), 4);
  assert.equal(masteryTier({ points: 50 }, masteryCfg({ settings: { mastery_t2: 60 } })), 1);
  assert.deepEqual(masteryView({ AU: { points: 45, games: 30, wins: 15 } }, {}).AU, { points: 45, games: 30, wins: 15, tier: 2, next: 150 });
  assert.deepEqual(masteryTiers({ AU: { points: 45 }, SE: { points: 3 } }, {}), { AU: 2 }, "1단계는 생략");
});

test("티어 프레임 = 현재 티어(LoL식 정리): 기록 없으면 지난 시즌으로 시작 티어, 마스터 상위 N%는 레전드, 홀로 등급 전달", async () => {
  const { readFileSync } = await import("node:fs");
  const { frameOf } = await import("../src/badges.mjs");
  const DATA = JSON.parse(readFileSync(new URL("./fixtures/data_v1.json", import.meta.url)));
  assert.deepEqual(frameOf(DATA, { cur: { tier_no: 8 }, holo: 2 }), { frame: "GOLD", tier: 8, holo: 2 });
  assert.equal(frameOf(DATA, null).frame, "BRONZE");
  assert.equal(frameOf(DATA, { prev: { tier_no: 13, state: { best: 13 } } }).frame, "GOLD", "다이아 III → 시즌 리셋 시작 단계(시험 데이터 골드 I)");
  assert.equal(frameOf(DATA, { cur: { tier_no: 16 }, masterRank: 1, masters: 20 }).frame, "LEGEND", "마스터 20명 중 상위 10% = 2명");
  assert.equal(frameOf(DATA, { cur: { tier_no: 16 }, masterRank: 3, masters: 20 }).frame, "MASTER");
});

test("상점 규칙(LoL식 정리): 프레임 판매 안 함, 스킨 현금 전용, 캐릭터·감정표현 골드 전용, 카드 뒷면 둘 다", async () => {
  const { offerRule } = await import("../src/shop-rules.mjs");
  assert.throws(() => offerRule("frame", { price_gold: 100 }), /offer_frame_not_sold/);
  assert.throws(() => offerRule("skin", { price_gold: 8000, price_krw: 7900 }), /offer_cash_only/);
  assert.throws(() => offerRule("character", { price_gold: 15000, price_krw: 9900 }), /offer_gold_only/);
  assert.throws(() => offerRule("character", { price_krw: 9900 }), /offer_gold_only/);
  assert.ok(offerRule("character", { price_gold: 15000 }) && offerRule("skin", { price_krw: 7900 }) && offerRule("cardback", { price_gold: 6000, price_krw: 5900 }));
});
