// AI 봇 (상세 03). 사람과 같은 규칙·같은 공개 정보만 쓴다(상대 손패·덱 순서·제출 내용을 보지 않음).
// 매 턴: 후보 조합 → 상대 행동 예측 → 점수(피해·생존·읽기·자원) → 난이도에 따라 1등 또는 차선.
import { cardCost, SPELL } from "./battle.mjs";

export const DIFFICULTY = Object.freeze({
  easy: { subopt: 0.3, read: "none" },      // 상대 읽기 안 함, 스펠은 쿨다운 돌아오면 바로
  normal: { subopt: 0.15, read: "basic" },  // 에너지·손패 장수만, HP 40% 이하일 때 방어 스펠
  hard: { subopt: 0.05, read: "pattern" }   // 최근 3턴 패턴, 상대 게이지·폭주 직전 신호
});

const within = (s, t) => Boolean(s) && s.from <= t && t <= s.to;
const defRed = (def, pierce = 0) => 100 / (100 + def * (1 - pierce));

function rushMult(state) {
  const r = state.rules;
  return state.turn >= r.rush_start_turn ? 1 + r.rush_dmg_step * (state.turn - r.rush_start_turn + 1) : 1;
}

// 상대 행동 확률 추정(공개 정보만): 공격·반격·침묵 가능성
function predict(state, seat, level, memory) {
  const o = state.players[1 - seat];
  if (level === "none") return { atk: 0.5, counter: 0.2, silence: 0.2, guard: 0.15 };
  const e = Math.min(o.energy, 5);
  let atk = Math.min(0.9, 0.3 + 0.1 * e + (o.hand.length >= 5 ? 0.1 : 0));
  let counter = e >= 2 ? 0.25 : 0.05;
  let silence = e >= 1 ? 0.15 : 0;
  if (level === "pattern" && memory?.oppKinds?.length) {
    const recent = memory.oppKinds.slice(-3);
    const freq = (k) => recent.filter((x) => x.includes(k)).length / recent.length;
    atk = 0.5 * atk + 0.5 * freq("attack");
    counter = 0.5 * counter + 0.5 * freq("counter");
    silence = 0.5 * silence + 0.5 * freq("silence");
  }
  const guardReady = Object.entries(o.spellReady).some(([id, t]) => (id === SPELL.GUARD || id === SPELL.EXHAUST) && state.turn >= t);
  return { atk, counter, silence, guard: guardReady ? 0.25 : 0 };
}

function combos(list, max) {
  const out = [[]];
  const rec = (start, cur) => {
    for (let i = start; i < list.length; i += 1) {
      const next = [...cur, list[i]];
      out.push(next);
      if (next.length < max) rec(i + 1, next);
    }
  };
  rec(0, []);
  return out;
}

function score(state, seat, cand, pred, level) {
  const me = state.players[seat], o = state.players[1 - seat];
  const rush = rushMult(state);
  const late = state.turn >= state.rules.rush_start_turn - 1;
  const ids = cand.cards.map((c) => c.id);
  const defs = ids.map((id) => state.cards[id]);
  const hpRatio = me.hp / me.maxHp;
  let buff = defs.filter((_, i) => ids[i] === "C16").reduce((a, c) => a + c.coef, 0);
  if (me.char === "TE" && state.turn % 2 === 1) buff += 0.2;
  const weak = within(me.st.weak, state.turn) ? 0.8 : 1;
  const critMult = 1 + (me.crit / 100) * (state.rules.crit_mult - 1);

  // 피해 가치
  let dmg = 0;
  defs.forEach((c, i) => {
    if (c.kind !== "attack") return;
    const hits = c.hits * (within(me.st.inferno, state.turn) ? 2 : 1);
    dmg += me.atk * c.coef * hits * (1 + buff) * weak * defRed(o.def, c.pierce) * critMult * rush;
    if (ids[i] === "SL02" && me.spd > o.spd) dmg *= 1.2;
  });
  dmg *= 1 - pred.counter * 0.6 - pred.guard * 0.5;
  if (cand.active) {
    if (me.char === "UM") dmg += (o.maxHp - o.hp) * 0.35 * rush;
    if (me.char === "AU") dmg += (me.shield.carried + me.shield.norm + me.shield.full) * 1.5 * rush;
    if (me.char === "IG") dmg += o.st.burn.length * o.maxHp * 0.03 * 2 * 2;
    if (me.char === "MO") dmg += Math.min(5, me.debuffsLanded) * o.maxHp * 0.04 * rush;
  }
  let v = (dmg / o.maxHp) * 100;
  if (dmg >= o.hp + o.shield.carried + o.shield.norm + o.shield.full) v += 60;  // 이번 턴 처치 가능

  // 생존 가치
  const incoming = pred.atk * o.atk * 1.6 * defRed(me.def) * rush;
  let saved = 0;
  defs.forEach((c, i) => {
    if (c.kind === "defense") saved += Math.min(incoming, me.def * c.coef * (me.char === "AU" ? 1.2 : 1));
    if (c.kind === "counter") saved += pred.atk * o.atk * 1.4 * defRed(me.def) * rush + (ids[i] === "C07" ? pred.atk * me.atk * 0.8 * defRed(o.def) : 0);
    if (ids[i] === "C13" && hpRatio < 0.7) saved += me.maxHp * c.coef;
  });
  if (cand.spell === SPELL.GUARD) saved += incoming * 1.2;
  if (cand.spell === SPELL.EXHAUST) saved += incoming * 0.3;
  if (cand.spell === SPELL.MIRROR) v += (incoming * 0.5 / o.maxHp) * 100;
  if (cand.spell === SPELL.HEAL && hpRatio < 0.6) saved += me.maxHp * state.spells[SPELL.HEAL].value;
  v += (saved / me.maxHp) * 100 * (hpRatio < 0.4 ? 1.6 : 1);

  // 읽기 가치: 예측한 상대 행동에 상성상 이기는 카드
  if (ids.some((id) => state.cards[id].kind === "immune")) v += pred.silence * 12;
  if (ids.some((id) => state.cards[id].kind === "silence")) v += (o.gauge >= 100 ? 14 : 4) + (level === "pattern" && o.gauge >= 85 ? 6 : 0);
  if (ids.some((id) => state.cards[id].kind === "disrupt")) v += pred.atk * 6;

  // 자원 가치: 게이지·이월·카드 아끼기(폭주 구간엔 낮춤)
  const res = late ? 0.3 : 1;
  const paid = cardCost(state, me, ids).reduce((a, b) => a + b, 0);
  v += res * (Math.min(paid, me.energy) * 0.8 + (me.energy - paid >= 1 ? 1 : 0));
  defs.forEach((c, i) => { if (["C14", "PY02", "UM02"].includes(ids[i])) v += res * c.coef * 0.12; if (ids[i] === "C15") v += res * 4; });
  if (cand.active) v += 10;
  if (cand.spell === SPELL.INSIGHT) v += res * 5;
  if (cand.spell === SPELL.CLEANSE) v += Object.keys(me.st).filter((k) => ["weak", "mark", "skillBlock", "energyDown"].includes(k)).length * 8 + me.st.burn.length * 5;
  if (cand.spell === SPELL.CHARGE) v += 1;
  return v;
}

// 난이도별 스펠 사용 조건(상세 03 표)
function spellAllowed(state, seat, spell, level) {
  if (!spell) return true;
  const me = state.players[seat], o = state.players[1 - seat];
  if (level === "none") return true;
  const defensive = [SPELL.GUARD, SPELL.HEAL, SPELL.EXHAUST, SPELL.MIRROR].includes(spell);
  if (level === "basic") return !defensive || me.hp / me.maxHp <= 0.4;
  if (!defensive) return true;
  return me.hp / me.maxHp <= 0.5 || o.gauge >= 100 || state.turn === state.rules.rush_start_turn - 1 || state.turn >= state.rules.rush_start_turn;
}

export function chooseAction(state, seat, { difficulty = "normal", subopt, random = Math.random, memory = null } = {}) {
  const prof = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  const p = state.players[seat];
  const hand = p.hand.filter((c) => !p.sealed.includes(c.uid) && !(state.cards[c.id].kind === "skill" && within(p.st.skillBlock, state.turn)));
  const readySpells = Object.keys(p.spellReady).filter((id) => state.turn >= p.spellReady[id]);
  const canActive = p.gauge >= state.rules.gauge_max && !within(p.st.activeSeal, state.turn);
  const pred = predict(state, seat, prof.read, memory);
  const cands = [];
  for (const cards of combos(hand, state.rules.cards_per_turn_max)) {
    const cost = cardCost(state, p, cards.map((c) => c.id)).reduce((a, b) => a + b, 0);
    for (const spell of [null, ...readySpells]) {
      if (!spellAllowed(state, seat, spell, prof.read)) continue;
      const bonus = spell === SPELL.CHARGE ? state.spells[SPELL.CHARGE].value : 0;
      if (cost > p.energy + bonus) continue;
      for (const active of canActive ? [false, true] : [false]) {
        const cand = { cards, spell, active };
        cands.push({ cand, s: score(state, seat, cand, pred, prof.read) + random() * 0.5 });
      }
    }
  }
  if (prof.read === "none" && readySpells.length) {  // 쉬움: 쿨다운 돌아오면 바로 씀
    const withSpell = cands.filter((c) => c.cand.spell);
    if (withSpell.length) cands.splice(0, cands.length, ...withSpell);
  }
  cands.sort((a, b) => b.s - a.s);
  const rate = subopt ?? prof.subopt;
  const pick = cands.length > 1 && random() < rate ? cands[1] : cands[0];
  const c = pick?.cand ?? { cards: [], spell: null, active: false };
  return { action: { cards: c.cards.map((x) => x.uid), spell: c.spell, active: c.active }, log: { candidates: cands.length, score: Math.round(pick?.s ?? 0), subopt: pick !== cands[0] } };
}

// 상대가 지난 턴에 낸 카드 종류를 기억(어려움: 최근 3턴 패턴)
export function remember(state, seat, memory = { oppKinds: [] }) {
  const reveal = state.log.find((e) => e.t === "reveal" && e.seat === 1 - seat);
  if (reveal) memory.oppKinds = [...memory.oppKinds, reveal.cards.map((id) => state.cards[id]?.kind ?? "")].slice(-3);
  return memory;
}

// ---------- 밴·픽·스펠·덱 (상세 03 밴픽 AI) ----------
const BEATS = { 불: "물", 바람: "불", 물: "바람" };  // 총괄 4장 성향 상성: 물 → 불, 불 → 바람, 바람 → 물 (키 진영을 이기는 진영)

export function chooseBan(data, { playerFavorite = null, random = Math.random } = {}) {
  const ids = Object.keys(data.characters);
  if (playerFavorite && ids.includes(playerFavorite) && random() < 0.5) return playerFavorite;
  return ids[Math.floor(random() * ids.length)];
}

export function choosePick(data, pool, { playerFaction = null, random = Math.random } = {}) {
  if (playerFaction && random() < 0.3) {
    const strong = pool.filter((id) => data.characters[id].faction === BEATS[playerFaction]);
    if (strong.length) return strong[Math.floor(random() * strong.length)];
  }
  return pool[Math.floor(random() * pool.length)];
}

// 추천 스펠 2종 + 상대를 보고 바꾸는 규칙 2~3개, 덱은 균형 추천덱
export function chooseLoadout(data, charId, oppCharId) {
  let spells = [SPELL.GUARD, SPELL.HEAL];
  const opp = data.characters[oppCharId];
  if (["SI", "SL", "MO"].includes(oppCharId)) spells = [SPELL.GUARD, SPELL.CLEANSE];       // 침묵·디버프 상대 → 정화
  else if (["PY", "UM"].includes(oppCharId)) spells = [SPELL.EXHAUST, SPELL.HEAL];          // 폭딜 상대 → 탈진
  else if (oppCharId === "IG") spells = [SPELL.CLEANSE, SPELL.HEAL];                        // 작열 → 정화
  if (charId === "SE" && spells.includes(SPELL.HEAL)) spells = spells.map((s) => (s === SPELL.HEAL ? SPELL.MIRROR : s));
  void opp;
  return { spells, preset: 2 };
}
