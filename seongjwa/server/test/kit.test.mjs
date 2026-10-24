import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CHARACTER_PARAM_DEFAULTS as P } from "../src/engine/rules.mjs";

// 스킬 문구(데이터)에 적힌 수치와 엔진이 실제로 쓰는 값이 같은지 확인한다.
// 기획이 문구의 수치만 바꾸고 엔진 값이 그대로 남는 일을 막는다(기획답변 9차: 영혼 수확 4% → 6%).
const DATA = JSON.parse(readFileSync(new URL("./fixtures/data_v1.json", import.meta.url)));
const pct = (v) => `${Math.round(v * 100)}%`;
const CHECKS = [
  ["AU", "passive_text", `실드 +${pct(P.AU.passiveShieldBonus)}`], ["AU", "passive_text", `${pct(P.AU.passiveCarry)} 이월`], ["AU", "active_text", `${pct(P.AU.activeMult)}를 피해`],
  ["PY", "passive_text", `ATK +${pct(P.PY.passiveAtkPer10)}`], ["PY", "active_text", `받는 피해 +${pct(P.PY.activeTakenUp)}`], ["PY", "active_text", `${P.PY.activeTurns}턴간`],
  ["IG", "passive_text", pct(P.IG.passiveChance)], ["IG", "active_text", `${P.IG.activeMult}배`],
  ["SE", "passive_text", `최대 HP ${pct(P.SE.passiveRegen)} 회복`], ["SE", "passive_text", `최대 HP ${pct(P.SE.passiveShieldCap)}`], ["SE", "active_text", `${P.SE.activeLookback}턴 전`],
  ["TE", "passive_text", `공격 피해 +${pct(P.TE.flood)}`], ["TE", "passive_text", `받는 피해 −${pct(P.TE.ebb)}`], ["TE", "active_text", `${P.TE.activeTurns}턴간`],
  ["UM", "passive_text", `${pct(P.UM.passiveHpBelow)} 이하`], ["UM", "passive_text", `치명 +${P.UM.passiveCritBonus}%p`], ["UM", "active_text", `${pct(P.UM.activePct)} 피해`],
  ["SI", "passive_text", `${P.SI.passiveDraw}장 드로우`], ["SI", "active_text", `에너지 −${P.SI.activeEnergyDown}`], ["SI", "active_text", `${P.SI.activeSeal}장 봉인`],
  ["MO", "passive_text", `받는 피해 −${pct(P.MO.passiveReduce)}`], ["MO", "active_text", `최대 ${P.MO.activeMaxDebuffs}`], ["MO", "active_text", `최대 HP ${pct(P.MO.activePerDebuff)} 피해`]
];

test("스킬 문구의 수치 = 엔진 값 (패시브·액티브 9명)", () => {
  const bad = CHECKS.filter(([c, field, s]) => !DATA.characters[c][field].includes(s)).map(([c, f, s]) => `${c} ${f}: '${s}' 없음 → '${DATA.characters[c][f]}'`);
  assert.deepEqual(bad, []);
});
