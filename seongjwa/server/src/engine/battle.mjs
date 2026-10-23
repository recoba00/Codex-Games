// 동시 턴 전투 엔진 (서버 권위). 순수 함수 + 직렬화 가능한 상태(JSON)라 DO 저장소에 그대로 넣는다.
// 근거: 총괄 5장(스펠), 6장(덱·에너지·처리 순서·피해 공식·판당 시간 장치), 12장(예외), 상세 02(키워드·피해 계산 순서).
// 수치는 데이터 스냅샷(cards·spells·characters·settings)에서 읽고, 코드에는 규칙(무엇을 하는지)만 있다.
import { buildRules, CARD_PARAM_DEFAULTS, CHARACTER_PARAM_DEFAULTS } from "./rules.mjs";

export const SPELL = Object.freeze({ GUARD: "SP01", MIRROR: "SP02", CLEANSE: "SP03", HEAL: "SP04", SEAL: "SP05", CHARGE: "SP06", INSIGHT: "SP07", EXHAUST: "SP08" });
const DEBUFFS = ["burn", "mark", "weak", "activeSeal", "skillBlock", "handSeal", "energyDown"];

// ---------- 난수 (결정적, 상태에 저장) ----------
function nextRandom(state) {
  let x = state.rng >>> 0 || 0x9e3779b9;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  state.rng = x;
  return x / 0x100000000;
}
function shuffle(state, list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const within = (s, turn) => Boolean(s) && s.from <= turn && turn <= s.to;
const round = (v) => Math.round(v);

// ---------- 덱 검증 (총괄 6장: 전용 2 + 공용 10, 같은 카드 최대 2) ----------
export function buildDeck(data, characterId, commonCards, rules = buildRules(data.settings)) {
  if (!data.characters?.[characterId]) throw new Error("character_unavailable");
  if (!Array.isArray(commonCards) || commonCards.length !== rules.deck_size - 2) throw new Error("deck_size_invalid");
  const counts = {};
  for (const id of commonCards) {
    const card = data.cards?.[id];
    if (!card || card.owner_character) throw new Error("deck_card_invalid");
    counts[id] = (counts[id] ?? 0) + 1;
    if (counts[id] > rules.deck_same_max) throw new Error("deck_card_limit");
  }
  const own = Object.entries(data.cards).filter(([, c]) => c.owner_character === characterId).map(([id]) => id).sort();
  if (own.length !== 2) throw new Error("deck_exclusive_missing");
  return [...own, ...commonCards];
}

export function presetDeck(data, characterId, slot) {
  const preset = data.presets?.[characterId]?.find((p) => p.slot === Number(slot));
  if (!preset) throw new Error("preset_not_found");
  return buildDeck(data, characterId, preset.cards);
}

// ---------- 생성 ----------
export function createBattle({ seed, data, players, rules: overrides = {} }) {
  const rules = { ...buildRules(data.settings), ...overrides };
  if (!Array.isArray(players) || players.length !== 2) throw new Error("players_invalid");
  const state = {
    v: 1, turn: 0, rng: (Number(seed) >>> 0) || 1, uid: 0, rules,
    dataVersion: data.version ?? null,
    cards: {}, spells: {}, players: [], log: [], result: null
  };
  // 이 판에서 쓰는 카드·스펠 정의만 상태에 복사(판 도중 데이터가 바뀌어도 영향 없음)
  for (const p of players) {
    const ch = data.characters?.[p.characterId];
    if (!ch) throw new Error("character_unavailable");
    const deckIds = p.deck ?? buildDeck(data, p.characterId, p.commonCards, rules);
    for (const id of deckIds) {
      const c = data.cards[id];
      if (!c) throw new Error("deck_card_invalid");
      state.cards[id] = { kind: c.kind, phase: c.phase, cost: c.cost, coef: Number(c.coef ?? 0), hits: Number(c.hits ?? 1),
        pierce: Number(c.pierce ?? 0), owner: c.owner_character ?? null, params: { ...(CARD_PARAM_DEFAULTS[id] ?? {}), ...(c.params ?? {}) } };
    }
    const spells = p.spells ?? [];
    if (spells.length !== 2 || spells[0] === spells[1]) throw new Error("spells_invalid");
    for (const id of spells) {
      const s = data.spells?.[id];
      if (!s) throw new Error("spell_invalid");
      state.spells[id] = { value: Number(s.value ?? 0), cooldown: Number(s.cooldown) };
    }
    state.players.push({
      char: p.characterId,
      cp: { ...(CHARACTER_PARAM_DEFAULTS[p.characterId] ?? {}), ...(ch.passive_params ?? {}), ...(ch.active_params ?? {}) },
      maxHp: ch.hp, hp: ch.hp, atk: ch.atk, def: ch.def, spd: ch.spd, crit: ch.crit,
      deck: shuffle(state, deckIds.map((id) => ({ uid: ++state.uid, id }))),
      hand: [], discard: [],
      energy: 0, carry: 0, gauge: 0,
      spellReady: Object.fromEntries(spells.map((id) => [id, rules.spell_first_turn])),
      shield: { norm: 0, full: 0 }, mo02: 0, mo02Used: false,
      st: { burn: [] }, hpStart: {}, dealt: 0, debuffsLanded: 0,
      submitted: null, idle: 0, revealed: [], sealed: [], pendingSeal: 0,
      tb: false
    });
  }
  beginTurn(state);
  return state;
}

// ---------- 공통 효과 ----------
function draw(state, p, n) {
  const drawn = [];
  for (let i = 0; i < n; i += 1) {
    if (!p.deck.length && p.discard.length) {
      p.deck = shuffle(state, p.discard);  // 덱 소진: 사용한 카드 섞어 재생성(패널티 없음)
      p.discard = [];
    }
    const card = p.deck.shift();
    if (!card) break;
    if (p.hand.length >= state.rules.hand_max) {
      state.log.push({ t: "burnout", seat: state.players.indexOf(p), card: card.id });  // 손패 초과: 소멸
      continue;
    }
    p.hand.push(card);
    drawn.push(card.uid);
  }
  return drawn;
}

function rushMult(state) {
  const r = state.rules;
  return state.turn >= r.rush_start_turn ? 1 + r.rush_dmg_step * (state.turn - r.rush_start_turn + 1) : 1;
}

function immuneNow(state, p) {
  return within(p.st.immune, state.turn);
}

// 디버프 부여: 면역이면 막힘(영혼 수확 횟수에도 안 셈)
function applyDebuff(state, src, dst, kind, apply) {
  const seat = state.players.indexOf(dst);
  if (immuneNow(state, dst)) {
    state.log.push({ t: "blocked", seat, debuff: kind });
    return false;
  }
  apply();
  src.debuffsLanded += 1;
  state.log.push({ t: "debuff", seat, debuff: kind });
  return true;
}

function cleanse(p) {
  for (const k of DEBUFFS) if (k !== "burn") delete p.st[k];
  p.st.burn = [];
  p.pendingSeal = 0;
  p.sealed = [];
  p.silencedNow = false;
}

function heal(state, p, amount) {
  if (amount <= 0) return 0;
  let v = amount;
  if (within(p.st.healBoost, state.turn)) v *= 1 + p.st.healBoost.v;
  if (state.turn >= state.rules.rush_start_turn) v *= 1 - state.rules.rush_heal_cut;
  v = round(v);
  const room = p.maxHp - p.hp;
  const healed = Math.min(room, v);
  p.hp += healed;
  if (p.char === "SE" && v > healed) {  // 셀레네 월광: 넘친 회복은 실드로(최대 HP 10%)
    const cap = round(p.maxHp * p.cp.passiveShieldCap);
    p.shield.full = Math.min(cap, p.shield.full + (v - healed));
  }
  state.log.push({ t: "heal", seat: state.players.indexOf(p), v: healed });
  return healed;
}

function selfCost(state, p, pct) {
  const before = p.hp;
  p.hp = Math.max(1, p.hp - round(p.maxHp * pct));  // 소모: 1 아래로 내리지 않음, 배율 없음
  state.log.push({ t: "selfcost", seat: state.players.indexOf(p), v: before - p.hp });
}

function gaugeAdd(state, p, n) {
  p.gauge = Math.max(0, Math.min(state.rules.gauge_max, p.gauge + n));
}

function addShield(p, amount, full = false) {
  if (full) p.shield.full += round(amount); else p.shield.norm += round(amount);
}

function isFlood(state, p) {
  return p.char === "TE" && (state.turn % 2 === 1 || within(p.st.greatTide, state.turn));
}
function isEbb(state, p) {
  return p.char === "TE" && (state.turn % 2 === 0 || within(p.st.greatTide, state.turn));
}

// 받는 피해 감소·증가(상세 02 피해 계산 6단계). 탈진은 공격 카드에만.
function receivedMult(state, attacker, target, isAttack) {
  let m = 1;
  if (isAttack && attacker.exhausted) m *= 1 - attacker.exhausted;
  if (isEbb(state, target)) m *= 1 - target.cp.ebb;
  if (target.char === "MO" && within(attacker.st.weak, state.turn)) m *= 1 - target.cp.passiveReduce;
  if (within(target.st.inferno, state.turn)) m *= 1 + target.cp.activeTakenUp;
  return m;
}

// 실드 차감 후 HP 피해. 반환: { pre, hp }
function dealDirect(state, attacker, target, raw, { ignoreShield = false, reflectable = true, source = "attack" } = {}) {
  const tSeat = state.players.indexOf(target);
  if (target.invuln) {  // 수호: 0으로 끝(반사도 0)
    state.log.push({ t: "dmg", seat: tSeat, v: 0, src: source, guard: true });
    return { pre: 0, hp: 0 };
  }
  let pre = round(raw);
  if (pre <= 0) return { pre: 0, hp: 0 };
  let rest = pre;
  if (!ignoreShield) {
    // 망령 갑주: 약화 상태 상대에게 맞으면 실드 +50%(턴당 1회)
    if (target.mo02 > 0 && !target.mo02Used && within(attacker.st.weak, state.turn)) {
      addShield(target, target.mo02 * state.cards.MO02.params.hitByWeakBonus);
      target.mo02Used = true;
    }
    for (const k of ["norm", "full"]) {
      const used = Math.min(target.shield[k], rest);
      target.shield[k] -= used;
      rest -= used;
    }
  }
  target.hp -= rest;
  attacker.dealt += rest;
  state.log.push({ t: "dmg", seat: tSeat, v: rest, absorbed: pre - rest, src: source });
  if (reflectable && target.mirror) {  // 거울: 실드 차감 전 받는 직접 피해의 N% 반사, 재반사 없음
    dealDirect(state, target, attacker, pre * target.mirror, { reflectable: false, source: "mirror" });
  }
  return { pre, hp: rest };
}

// 공격 카드·반격 피해 (상세 02 피해 계산 1~8단계, 타수마다 실드 차감)
function strike(state, attacker, target, { coef, hits = 1, pierce = 0, attackCard = true, extraMult = 1, ctx }) {
  let atk = attacker.atk;
  if (attacker.char === "PY") atk *= 1 + attacker.cp.passiveAtkPer10 * Math.floor((1 - ctx.hpAt[attacker.seat] / attacker.maxHp) * 10);
  let buff = attackCard ? attacker.attackBuff : 0;
  if (attackCard && isFlood(state, attacker)) buff += attacker.cp.flood;
  let mult = (1 + buff) * extraMult;
  if (within(attacker.st.weak, state.turn)) mult *= 0.8;
  const defense = 100 / (100 + target.def * (1 - pierce));
  let critChance = attacker.crit;
  if (attacker.char === "UM" && ctx.hpAt[target.seat] <= target.maxHp * attacker.cp.passiveHpBelow) critChance += attacker.cp.passiveCritBonus;
  const marked = within(target.st.mark, state.turn);
  let total = 0;
  for (let h = 0; h < hits; h += 1) {
    const crit = nextRandom(state) * 100 < critChance;
    let v = atk * coef * mult * defense;
    if (crit) v *= state.rules.crit_mult * (marked ? 1 + state.rules.mark_crit_bonus : 1);
    v *= rushMult(state) * receivedMult(state, attacker, target, attackCard);
    const r = dealDirect(state, attacker, target, v, { source: attackCard ? "card" : "counter" });
    if (crit) state.log.push({ t: "crit", seat: target.seat });
    total += r.hp;
  }
  return total;
}

// ---------- 턴 시작 ----------
function beginTurn(state) {
  state.turn += 1;
  const r = state.rules;
  for (const p of state.players) {
    p.seat = state.players.indexOf(p);
    const down = within(p.st.energyDown, state.turn) ? p.st.energyDown.n : 0;
    const carry = within(p.st.noCarry, state.turn) ? 0 : p.carry;
    p.energy = Math.max(1, Math.min(state.turn + 1, r.energy_max) + carry - down);  // 에너지 감소: 최소 1 보장
    if (state.turn === 1) draw(state, p, r.hand_start); else draw(state, p, r.draw_per_turn);
    gaugeAdd(state, p, r.gauge_turn_start);
    p.hpStart[state.turn] = p.hp;
    p.sealed = [];
    if (p.pendingSeal > 0) {  // 손패 봉인: 무작위 N장 이번 턴 사용 불가
      const pool = shuffle(state, p.hand.map((c) => c.uid));
      p.sealed = pool.slice(0, p.pendingSeal);
      p.pendingSeal = 0;
    }
    p.submitted = null;
    p.freeUsed = false;
    p.attackBuff = 0;
    p.invuln = false; p.mirror = 0; p.exhausted = 0; p.silencedNow = false;
    p.counters = []; p.mo02 = 0; p.mo02Used = false;
  }
}

// ---------- 제출 (총괄 6장: 카드 최대 3장, 스펠 1개, 액티브) ----------
export function cardCost(state, p, cardIds) {
  let free = false;
  return cardIds.map((id) => {
    const c = state.cards[id];
    if (p.char === "SL" && !free && c.cost === 1) { free = true; return 0; }  // 순풍: 매 턴 첫 1E 카드 0
    return c.cost;
  });
}

export function validateAction(state, seat, action) {
  if (state.result) throw new Error("match_finished");
  const p = state.players[seat];
  if (!p) throw new Error("seat_invalid");
  if (p.submitted) throw new Error("already_submitted");
  const uids = Array.isArray(action?.cards) ? action.cards.map(Number) : [];
  if (uids.length > state.rules.cards_per_turn_max) throw new Error("too_many_cards");
  if (new Set(uids).size !== uids.length) throw new Error("card_duplicate");
  const cards = uids.map((uid) => {
    const c = p.hand.find((h) => h.uid === uid);
    if (!c) throw new Error("card_not_in_hand");
    if (p.sealed.includes(uid)) throw new Error("card_sealed");
    if (state.cards[c.id].kind === "skill" && within(p.st.skillBlock, state.turn)) throw new Error("skill_blocked");
    return c;
  });
  const spell = action?.spell ? String(action.spell) : null;
  if (spell) {
    if (!(spell in p.spellReady)) throw new Error("spell_not_owned");
    if (state.turn < p.spellReady[spell]) throw new Error("spell_cooldown");
  }
  const active = Boolean(action?.active);
  if (active) {
    if (p.gauge < state.rules.gauge_max) throw new Error("gauge_not_full");
    if (within(p.st.activeSeal, state.turn)) throw new Error("active_sealed");
  }
  const cost = cardCost(state, p, cards.map((c) => c.id)).reduce((a, b) => a + b, 0);
  const bonus = spell === SPELL.CHARGE ? state.spells[SPELL.CHARGE].value : 0;
  if (cost > p.energy + bonus) throw new Error("energy_short");
  return { cards: uids, spell, active };
}

export function submit(state, seat, action, { auto = false } = {}) {
  const valid = validateAction(state, seat, action);
  state.players[seat].submitted = { ...valid, auto };
  return state.players.every((p) => p.submitted);
}

// 시간 초과: 아무것도 안 낸 것. 연결이 끊긴 쪽은 "자동 방어"(가장 싼 방어 카드 1장, 총괄 10장)
export function autoAction(state, seat, { disconnected = false } = {}) {
  const p = state.players[seat];
  if (!disconnected) return { cards: [], spell: null, active: false };
  const options = p.hand
    .filter((c) => state.cards[c.id].kind === "defense" && !p.sealed.includes(c.uid))
    .map((c) => ({ c, cost: cardCost(state, p, [c.id])[0] }))
    .filter((o) => o.cost <= p.energy)
    .sort((a, b) => a.cost - b.cost || a.c.uid - b.c.uid);
  return { cards: options.length ? [options[0].c.uid] : [], spell: null, active: false };
}

// ---------- 해결 ----------
export function resolveTurn(state) {
  if (state.result) throw new Error("match_finished");
  for (let s = 0; s < 2; s += 1) if (!state.players[s].submitted) submit(state, s, autoAction(state, s), { auto: true });
  state.log = [{ t: "turn", turn: state.turn }];
  const [A, B] = state.players;
  const opp = (p) => (p === A ? B : A);
  const order = () => {  // 같은 단계 안 연출 순서: SPD(+그림자 걸음) 높은 쪽 먼저, 같으면 무작위. 판정은 동시
    const sa = A.spd + (within(A.st.spdUp, state.turn) ? A.st.spdUp.v : 0);
    const sb = B.spd + (within(B.st.spdUp, state.turn) ? B.st.spdUp.v : 0);
    A.speed = sa; B.speed = sb;
    if (sa !== sb) return sa > sb ? [A, B] : [B, A];
    return nextRandom(state) < 0.5 ? [A, B] : [B, A];
  };
  const seq = order();

  // 제출 정리: 손패에서 빼고 공개
  const plays = new Map();
  for (const p of state.players) {
    const sub = p.submitted;
    const cards = sub.cards.map((uid) => p.hand.find((c) => c.uid === uid));
    p.hand = p.hand.filter((c) => !sub.cards.includes(c.uid));
    // AFK: 접속 중 아무 행동 없음 연속 횟수. 연결 끊김 중 자동 방어 턴은 세지 않음(60초 유예가 따로 처리, 총괄 10장)
    if (sub.auto !== "disconnect") {
      const idle = sub.auto === true || (!cards.length && !sub.spell && !sub.active);
      p.idle = idle ? p.idle + 1 : 0;
    }
    plays.set(p, { cards, spell: sub.spell, active: sub.active, spellOn: false, live: [] });
    state.log.push({ t: "reveal", seat: p.seat, cards: cards.map((c) => c.id), spell: sub.spell, active: sub.active, auto: Boolean(sub.auto) });
  }
  for (const p of state.players) p.revealed = p.revealed.filter((x) => opp(p).hand.some((c) => c.uid === x.uid));  // 통찰 공개분 중 아직 상대 손에 있는 것만
  const ctx = { hpAt: [A.hp, B.hp] };

  // 0 스펠 (총괄 5장). 쿨다운은 무효여도 소모
  const sa = plays.get(A).spell, sb = plays.get(B).spell;
  for (const p of state.players) {
    const pl = plays.get(p);
    if (pl.spell) p.spellReady[pl.spell] = state.turn + state.spells[pl.spell].cooldown;
  }
  const sealA = sa === SPELL.SEAL, sealB = sb === SPELL.SEAL;
  plays.get(A).spellOn = Boolean(sa) && !sealB;
  plays.get(B).spellOn = Boolean(sb) && !sealA;
  if (sealA && sealB) { plays.get(A).spellOn = false; plays.get(B).spellOn = false; }  // 양측 봉쇄: 상쇄
  for (const p of seq) {
    const pl = plays.get(p);
    if (!pl.spell) continue;
    if (!pl.spellOn) { state.log.push({ t: "spell", seat: p.seat, id: pl.spell, void: true }); continue; }
    const s = state.spells[pl.spell];
    const o = opp(p);
    switch (pl.spell) {
      case SPELL.GUARD: p.invuln = true; break;
      case SPELL.MIRROR: p.mirror = s.value; break;
      case SPELL.CLEANSE: cleanse(p); p.st.immune = { from: state.turn, to: Math.max(state.turn, p.st.immune?.to ?? 0) }; break;
      case SPELL.HEAL: heal(state, p, p.maxHp * s.value); break;
      case SPELL.CHARGE: break;  // 아래 에너지 지불에서 반영
      case SPELL.INSIGHT: {
        draw(state, p, s.value);
        if (o.hand.length) {
          const c = o.hand[Math.floor(nextRandom(state) * o.hand.length)];
          if (!p.revealed.some((x) => x.uid === c.uid)) p.revealed.push({ uid: c.uid, id: c.id });
        }
        break;
      }
      case SPELL.EXHAUST: o.exhausted = s.value; break;
      default: break;
    }
    state.log.push({ t: "spell", seat: p.seat, id: pl.spell });
  }

  // 에너지 지불: 충전이 무효되면 처리 순서(단계 → 선택 순서)상 뒤쪽 카드부터 무효, 무효 카드도 버려지고 에너지 소모(기획답변 2차 2)
  for (const p of state.players) {
    const pl = plays.get(p);
    const available = p.energy + (pl.spell === SPELL.CHARGE && pl.spellOn ? state.spells[SPELL.CHARGE].value : 0);
    const costs = cardCost(state, p, pl.cards.map((c) => c.id));  // 순풍(첫 1E 무료)은 선택 순서 기준
    const order = pl.cards.map((c, i) => ({ c, i, cost: costs[i] })).sort((x, y) => state.cards[x.c.id].phase - state.cards[y.c.id].phase || x.i - y.i);
    let paid = 0;
    const ok = new Set();
    for (const o of order) {
      if (paid + o.cost <= available) { paid += o.cost; ok.add(o.c.uid); } else state.log.push({ t: "void", seat: p.seat, card: o.c.id, why: "energy" });
    }
    for (const c of pl.cards) {
      if (ok.has(c.uid)) pl.live.push(c);
      p.discard.push(c);
    }
    gaugeAdd(state, p, paid * state.rules.gauge_per_energy);
    p.carry = Math.min(state.rules.energy_carry_max, Math.max(0, p.energy - Math.min(paid, p.energy)));
  }
  const live = (p, kinds) => plays.get(p).live.filter((c) => kinds.includes(state.cards[c.id].kind));
  const P = (id) => state.cards[id].params;

  // 1 보호: 면역·방어·반격
  for (const p of seq) {
    for (const c of live(p, ["immune", "defense", "counter"])) {
      const card = state.cards[c.id];
      if (card.kind === "immune") {
        const turns = c.id === "C10" ? P("C10").immuneTurns : 1;
        p.st.immune = { from: state.turn, to: Math.max(state.turn + turns - 1, p.st.immune?.to ?? 0) };
        if (c.id === "C11") { cleanse(p); p.st.immune = { from: state.turn, to: Math.max(state.turn, p.st.immune?.to ?? 0) }; addShield(p, p.def * card.coef); }
      } else if (card.kind === "defense") {
        let amount = p.def * card.coef;
        if (c.id === "TE02" && isEbb(state, p)) amount *= P("TE02").ebbMult;
        if (p.char === "AU") amount *= 1 + p.cp.passiveShieldBonus;
        addShield(p, amount, c.id === "AU01");
        if (c.id === "MO02") p.mo02 += round(amount);
      } else {
        p.counters.push(c.id);
      }
      state.log.push({ t: "card", seat: p.seat, id: c.id, phase: 1 });
    }
  }

  // 2 방해: 침묵·방해
  for (const p of seq) {
    const o = opp(p);
    for (const c of live(p, ["silence", "disrupt"])) {
      const card = state.cards[c.id];
      state.log.push({ t: "card", seat: p.seat, id: c.id, phase: 2 });
      if (card.kind === "silence") {
        if (p.char === "SI") draw(state, p, p.cp.passiveDraw);  // 고요: 침묵 카드 사용 시 드로우
        if (c.id === "C09") {
          applyDebuff(state, p, o, "skillBlock", () => { o.st.skillBlock = { from: state.turn + 1, to: state.turn + 1 }; });
        } else {
          const ok = applyDebuff(state, p, o, "silence", () => {
            o.silencedNow = true;
            o.st.activeSeal = { from: state.turn + 1, to: state.turn + 1 };
          });
          if (ok && c.id === "SI01") gaugeAdd(state, o, -card.coef);
        }
      } else if (c.id === "C12" || c.id === "MO01") {
        const turns = c.id === "MO01" ? P("MO01").turns : 1;
        applyDebuff(state, p, o, "weak", () => {
          const to = state.turn + turns;
          o.st.weak = { from: state.turn + 1, to: Math.max(to, o.st.weak?.to ?? 0) };  // 긴 쪽 유지
        });
      } else if (c.id === "UM01") {
        applyDebuff(state, p, o, "mark", () => { o.st.mark = { from: state.turn + 1, to: state.turn + P("UM01").turns }; });
      }
    }
  }

  // 3 스킬: 스킬 카드 → 액티브. 침묵이면 무효(액티브 게이지 반환 = 소모하지 않음)
  for (const p of seq) {
    for (const c of live(p, ["skill"])) {
      if (p.silencedNow) { state.log.push({ t: "void", seat: p.seat, card: c.id, why: "silence" }); continue; }
      const card = state.cards[c.id];
      const prm = card.params;
      state.log.push({ t: "card", seat: p.seat, id: c.id, phase: 3 });
      switch (c.id) {
        case "C13": heal(state, p, p.maxHp * card.coef); break;
        case "C14": gaugeAdd(state, p, card.coef); break;
        case "C15": draw(state, p, card.coef); break;
        case "C16": p.attackBuff += card.coef; break;
        case "AU02": p.shield.norm = round(p.shield.norm * (1 + card.coef)); p.shield.full = round(p.shield.full * (1 + card.coef)); gaugeAdd(state, p, prm.gauge); break;
        case "PY02": selfCost(state, p, prm.selfCost); gaugeAdd(state, p, card.coef); break;
        case "SE01": p.st.healBoost = { from: state.turn, to: state.turn + prm.turns - 1, v: card.coef }; gaugeAdd(state, p, prm.gauge); break;
        case "SL01": draw(state, p, card.coef); gaugeAdd(state, p, prm.gauge); break;
        case "UM02": p.st.spdUp = { from: state.turn + 1, to: state.turn + 1, v: prm.spd }; gaugeAdd(state, p, card.coef); break;
        default: break;
      }
    }
  }
  for (const p of seq) {
    if (!plays.get(p).active) continue;
    if (p.silencedNow) { state.log.push({ t: "active", seat: p.seat, void: true }); continue; }
    p.gauge = 0;
    state.log.push({ t: "active", seat: p.seat, char: p.char });
    useActive(state, p, opp(p));
  }
  if (finishIfDead(state)) return state;

  // 4 공격: SPD 순 연출, 판정 동시(HP 0 확인은 단계 끝). 반격은 상대 공격 카드를 순서대로 1장씩 무효
  const attacks = [];
  for (const p of seq) for (const c of live(p, ["attack"])) attacks.push({ p, c });
  const counterLeft = new Map(state.players.map((p) => [p, [...p.counters]]));
  for (const { p, c } of attacks) {
    const o = opp(p);
    const card = state.cards[c.id];
    const prm = card.params;
    const counters = counterLeft.get(o);
    if (counters.length) {
      const cid = counters.shift();
      state.log.push({ t: "countered", seat: p.seat, card: c.id, by: cid });
      const cc = state.cards[cid];
      if (cid === "IG01") {
        applyDebuff(state, o, p, "burn", () => addBurn(state, p, cc.coef));
      } else {
        strike(state, o, p, { coef: cc.coef, attackCard: false, ctx });
      }
      continue;
    }
    state.log.push({ t: "card", seat: p.seat, id: c.id, phase: 4 });
    if (c.id === "PY01") selfCost(state, p, prm.selfCost);
    let extra = 1;
    if (c.id === "SL02" && p.speed > o.speed) extra *= prm.fasterMult;
    if (c.id === "SI02" && o.silencedNow) extra *= 1 + prm.vsSilenced;
    const hits = card.hits * (within(p.st.inferno, state.turn) ? 2 : 1);
    const hpDmg = strike(state, p, o, { coef: card.coef, hits, pierce: card.pierce, extraMult: extra, ctx });
    if (hpDmg > 0) {
      if (c.id === "IG02") applyDebuff(state, p, o, "burn", () => addBurn(state, o, prm.burnOnHpHit));
      if (c.id === "SE02") heal(state, p, hpDmg * prm.lifesteal);
      if (p.char === "IG" && nextRandom(state) < p.cp.passiveChance) applyDebuff(state, p, o, "burn", () => addBurn(state, o, 1));
    }
    if (c.id === "TE01" && isFlood(state, p)) gaugeAdd(state, p, prm.floodGauge);
  }
  if (finishIfDead(state)) return state;

  // 5 턴 종료: 작열 → 월광 재생 → 실드 이월 → 판정
  for (const p of seq) {
    const o = opp(p);
    const stacks = p.st.burn.filter((b) => b.from <= state.turn && state.turn <= b.to);
    if (stacks.length) {
      const v = p.invuln ? 0 : p.maxHp * state.rules.burn_pct * stacks.length * rushMult(state);
      dealDirect(state, o, p, v, { ignoreShield: true, reflectable: false, source: "burn" });
    }
    p.st.burn = p.st.burn.filter((b) => b.to > state.turn);
  }
  for (const p of seq) if (p.char === "SE") heal(state, p, p.maxHp * p.cp.passiveRegen);
  for (const p of state.players) {
    const keepNorm = p.char === "AU" ? round(p.shield.norm * p.cp.passiveCarry) : 0;
    p.shield = { norm: keepNorm + p.shield.full, full: 0 };  // 이월분은 다음 턴 일반 실드로
    for (const [k, s] of Object.entries(p.st)) if (k !== "burn" && s && s.to !== undefined && s.to <= state.turn) delete p.st[k];
  }
  if (finishIfDead(state)) return state;

  // AFK: 연속 무행동 N턴이면 이탈(2턴째 경고는 DO가 알림)
  const afk = state.players.filter((p) => p.idle >= state.rules.afk_turns_leave);
  if (afk.length) {
    finish(state, afk.length === 2 ? "draw" : afk[0] === A ? "b" : "a", "afk");
    return state;
  }
  if (state.turn >= state.rules.max_turn) {
    // 최대 턴: HP 비율 → 누적 준 HP 피해 → 무승부 (총괄 6·12장)
    const ra = A.hp / A.maxHp, rb = B.hp / B.maxHp;
    const outcome = ra !== rb ? (ra > rb ? "a" : "b") : A.dealt !== B.dealt ? (A.dealt > B.dealt ? "a" : "b") : "draw";
    finish(state, outcome, "turn_limit");
    return state;
  }
  beginTurn(state);
  if (state.turn === state.rules.rush_start_turn) state.log.push({ t: "rush" });
  return state;
}

function addBurn(state, target, stacks) {
  for (let i = 0; i < stacks; i += 1) {
    const stack = { from: state.turn, to: state.turn + 1 };  // 부여된 턴의 종료 처리부터 2턴
    if (target.st.burn.length >= state.rules.burn_max_stacks) {
      target.st.burn.sort((x, y) => x.to - y.to);
      target.st.burn[0] = stack;  // 3스택에서 더 걸면 가장 오래된 스택 갱신
    } else target.st.burn.push(stack);
  }
}

function useActive(state, p, o) {
  const cp = p.cp;
  const fixed = (raw, opts = {}) => dealDirect(state, p, o, raw * rushMult(state) * receivedMult(state, p, o, false), { source: "active", ...opts });
  switch (p.char) {
    case "AU": {  // 일륜 반격: 실드 전부(이월 포함) ×150% → 피해, 방어력·치명 무시, 상대 실드 먼저
      const total = p.shield.norm + p.shield.full;
      p.shield = { norm: 0, full: 0 };
      fixed(total * cp.activeMult);
      break;
    }
    case "PY": p.st.inferno = { from: state.turn + 1, to: state.turn + cp.activeTurns }; break;
    case "IG": {  // 대화재: 남은 작열 피해 ×2 즉시, 스택 소모
      const ticks = o.st.burn.reduce((sum, b) => sum + Math.max(0, b.to - state.turn + 1), 0);
      o.st.burn = [];
      if (ticks) dealDirect(state, p, o, o.invuln ? 0 : o.maxHp * state.rules.burn_pct * ticks * cp.activeMult * rushMult(state), { ignoreShield: true, source: "active" });
      break;
    }
    case "SE": {  // 만월 역행: 2턴 전 시작 HP로(기록 없으면 1턴), 지금보다 낮으면 효과 없음
      const back = p.hpStart[state.turn - cp.activeLookback] ?? p.hpStart[1];
      if (back > p.hp) { state.log.push({ t: "rewind", seat: p.seat, from: p.hp, to: back }); p.hp = Math.min(p.maxHp, back); }
      break;
    }
    case "SL": {  // 회오리: 상대 손패를 덱에 섞고 같은 장수 다시 뽑기, 상대 다음 턴 이월 0
      const n = o.hand.length;
      o.deck.push(...o.hand);
      o.hand = [];
      o.revealed = [];
      p.revealed = [];
      shuffle(state, o.deck);
      draw(state, o, n);
      o.st.noCarry = { from: state.turn + 1, to: state.turn + 1 };
      break;
    }
    case "TE": p.st.greatTide = { from: state.turn + 1, to: state.turn + cp.activeTurns }; break;
    case "UM": {  // 처형: 잃은 HP의 35%(표식 +10%p), 방어력·실드 무시
      const pct = cp.activePct + (within(o.st.mark, state.turn) ? state.cards.UM01?.params.executeBonus ?? 0.1 : 0);
      fixed((o.maxHp - o.hp) * pct, { ignoreShield: true });
      break;
    }
    case "SI":  // 망각의 밤: 다음 턴 에너지 −1, 손패 1장 봉인
      applyDebuff(state, p, o, "energyDown", () => {
        const n = (within(o.st.energyDown, state.turn + 1) ? o.st.energyDown.n : 0) + cp.activeEnergyDown;
        o.st.energyDown = { from: state.turn + 1, to: state.turn + 1, n };
      });
      applyDebuff(state, p, o, "handSeal", () => { o.pendingSeal += cp.activeSeal; });
      break;
    case "MO": {  // 영혼 수확: 건 디버프 횟수(최대 5) × 상대 최대 HP 4%, 준 피해만큼 회복
      const n = Math.min(cp.activeMaxDebuffs, p.debuffsLanded);
      const r = fixed(o.maxHp * cp.activePerDebuff * n);
      heal(state, p, r.hp);
      break;
    }
    default: break;
  }
}

function finishIfDead(state) {
  const [A, B] = state.players;
  const da = A.hp <= 0, db = B.hp <= 0;
  if (!da && !db) return false;
  finish(state, da && db ? "draw" : da ? "b" : "a", "hp");  // 같은 단계 동시 HP 0: 무승부
  return true;
}

function finish(state, outcome, reason) {
  state.result = { outcome, reason, turn: state.turn };
  for (const p of state.players) p.hp = Math.max(0, p.hp);
  state.log.push({ t: "end", outcome, reason });
}

// 항복(4턴부터, 일반 패배) / 이탈(재접속 실패)
export function concede(state, seat, reason = "surrender") {
  if (state.result) throw new Error("match_finished");
  if (reason === "surrender" && state.turn < state.rules.surrender_from_turn) throw new Error("surrender_too_early");
  finish(state, seat === 0 ? "b" : "a", reason);
  return state;
}

// ---------- 시야 필터: 상대 손패·덱 순서·제출 내용·난수 상태는 숨긴다 ----------
export function view(state, seat) {
  const pub = (p, mine) => ({
    char: p.char, hp: p.hp, maxHp: p.maxHp, shield: p.shield.norm + p.shield.full,
    energy: p.energy, gauge: p.gauge, deck: p.deck.length, handCount: p.hand.length,
    discard: p.discard.map((c) => c.id),
    spells: Object.fromEntries(Object.entries(p.spellReady).map(([id, t]) => [id, Math.max(0, t - state.turn)])),
    status: statusView(state, p), submitted: Boolean(p.submitted), idle: p.idle,
    ...(mine ? {
      hand: p.hand.map((c) => ({ uid: c.uid, id: c.id, cost: cardCost(state, p, [c.id])[0], sealed: p.sealed.includes(c.uid) })),
      revealed: p.revealed, mySubmission: p.submitted ? { cards: p.submitted.cards, spell: p.submitted.spell, active: p.submitted.active } : null
    } : {})
  });
  return {
    turn: state.turn, dataVersion: state.dataVersion, rules: { max_turn: state.rules.max_turn, rush_start_turn: state.rules.rush_start_turn, cards_per_turn_max: state.rules.cards_per_turn_max },
    you: seat, me: pub(state.players[seat], true), opp: pub(state.players[1 - seat], false),
    log: state.log, result: state.result
  };
}

function statusView(state, p) {
  const out = [];
  const t = state.turn;
  if (p.st.burn.length) out.push({ k: "burn", n: p.st.burn.length });
  for (const k of ["mark", "weak", "activeSeal", "skillBlock", "energyDown", "immune", "healBoost", "spdUp", "inferno", "greatTide", "noCarry"]) {
    const s = p.st[k];
    if (s && s.to >= t) out.push({ k, left: s.to - Math.max(t, s.from) + 1, from: s.from });
  }
  if (p.sealed.length) out.push({ k: "handSeal", n: p.sealed.length });
  if (p.char === "TE") out.push({ k: "tide", flood: isFlood(state, p), ebb: isEbb(state, p) });
  return out;
}
