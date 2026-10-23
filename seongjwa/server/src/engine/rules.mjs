// 규칙 상수. 기본값은 기획 문서 값이고, 데이터 버전 settings에 같은 키가 있으면 그 값을 쓴다(상세 14 원격 데이터 원칙).
// 근거: 총괄 5·6장, 상세 02, 시트 `설정값`.
export const RULE_DEFAULTS = Object.freeze({
  turn_select_sec: 20,       // 시트 설정값
  timebank_sec: 15,
  max_turn: 10,
  rush_start_turn: 7,
  rush_dmg_step: 0.25,
  rush_heal_cut: 0.5,
  crit_mult: 1.5,
  reconnect_grace_sec: 60,
  // 아래는 총괄 6장·상세 02 문구 값(시트에 키가 생기면 그쪽 우선)
  energy_max: 5,
  energy_carry_max: 1,
  hand_start: 4,
  hand_max: 7,
  draw_per_turn: 2,
  cards_per_turn_max: 3,
  spell_first_turn: 2,
  gauge_turn_start: 15,
  gauge_per_energy: 8,
  gauge_max: 100,
  surrender_from_turn: 4,
  afk_turns_leave: 3,
  burn_pct: 0.03,
  burn_max_stacks: 3,
  mark_crit_bonus: 0.2,
  deck_size: 12,
  deck_same_max: 2
});

export function buildRules(settings = {}) {
  const rules = { ...RULE_DEFAULTS };
  for (const key of Object.keys(rules)) {
    const v = Number(settings[key]);
    if (settings[key] !== undefined && Number.isFinite(v)) rules[key] = v;
  }
  return rules;
}

// 카드·액티브의 계수 외 추가 수치. 데이터의 params(카드)·active_params(캐릭터)가 있으면 덮어쓴다.
// 근거: 시트 `전투카드` 효과 문구, 총괄 4장 캐릭터 표.
export const CARD_PARAM_DEFAULTS = Object.freeze({
  C10: { immuneTurns: 2 },               // 이번 턴 + 다음 턴
  AU02: { gauge: 20 },
  PY01: { selfCost: 0.05 },
  PY02: { selfCost: 0.08 },
  IG02: { burnOnHpHit: 1 },
  SE01: { gauge: 15, turns: 2 },
  SE02: { lifesteal: 0.3 },
  SL01: { gauge: 20 },
  SL02: { fasterMult: 1.5 },
  TE01: { floodGauge: 20 },
  TE02: { ebbMult: 2 },
  UM01: { executeBonus: 0.1, turns: 2 },
  UM02: { spd: 30 },
  SI02: { vsSilenced: 0.5 },
  MO01: { turns: 2 },
  MO02: { hitByWeakBonus: 0.5 }
});

export const CHARACTER_PARAM_DEFAULTS = Object.freeze({
  AU: { passiveShieldBonus: 0.2, passiveCarry: 0.5, activeMult: 1.5 },
  PY: { passiveAtkPer10: 0.04, activeTurns: 2, activeTakenUp: 0.15 },
  IG: { passiveChance: 0.25, activeMult: 2 },
  SE: { passiveRegen: 0.03, passiveShieldCap: 0.1, activeLookback: 2 },
  SL: { activeNoCarry: 1 },
  TE: { flood: 0.2, ebb: 0.2, activeTurns: 2 },
  UM: { passiveCritBonus: 15, passiveHpBelow: 0.5, activePct: 0.35 },
  SI: { passiveDraw: 1, activeEnergyDown: 1, activeSeal: 1 },
  MO: { passiveReduce: 0.15, activePerDebuff: 0.04, activeMaxDebuffs: 5 }
});
