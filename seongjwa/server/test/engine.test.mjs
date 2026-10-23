import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { autoAction, buildDeck, cardCost, concede, createBattle, presetDeck, resolveTurn, submit, view } from "../src/engine/battle.mjs";
import { CARD_PARAM_DEFAULTS } from "../src/engine/rules.mjs";

const DATA = JSON.parse(readFileSync(new URL("./fixtures/data_v1.json", import.meta.url)));
const CHARS = Object.keys(DATA.characters);

function battle(a = "AU", b = "SE", { seed = 7, spells = [["SP01", "SP02"], ["SP01", "SP02"]] } = {}) {
  return createBattle({
    seed, data: DATA,
    players: [{ characterId: a, spells: spells[0], deck: presetDeck(DATA, a, 2) }, { characterId: b, spells: spells[1], deck: presetDeck(DATA, b, 2) }]
  });
}
// 테스트용: 특정 카드를 손에 넣는다
function give(state, seat, id) {
  const c = DATA.cards[id];
  state.cards[id] ??= { kind: c.kind, phase: c.phase, cost: c.cost, coef: Number(c.coef ?? 0), hits: Number(c.hits ?? 1), pierce: Number(c.pierce ?? 0), owner: c.owner_character ?? null, params: { ...(CARD_PARAM_DEFAULTS[id] ?? {}) } };
  const card = { uid: ++state.uid, id };
  state.players[seat].hand.push(card);
  return card.uid;
}
const pass = { cards: [], spell: null, active: false };
const play = (st, a, b) => { submit(st, 0, a); submit(st, 1, b); return resolveTurn(st); };
const toTurn = (st, n) => { while (st.turn < n && !st.result) { st.players.forEach((p) => { p.idle = -99; }); play(st, pass, pass); } };  // AFK 판정 제외

test("덱: 전용 2 + 공용 10, 같은 카드 최대 2, 전용카드는 공용 칸에 못 넣음 (총괄 6장)", () => {
  for (const ch of CHARS) for (const slot of [1, 2, 3]) assert.equal(presetDeck(DATA, ch, slot).length, 12);
  const ok = DATA.presets.AU[0].cards;
  assert.throws(() => buildDeck(DATA, "AU", ok.slice(0, 9)), /deck_size_invalid/);
  assert.throws(() => buildDeck(DATA, "AU", [...ok.slice(0, 7), "C01", "C01", "C01"]), /deck_card_limit/);
  assert.throws(() => buildDeck(DATA, "AU", [...ok.slice(0, 9), "SE01"]), /deck_card_invalid/);
});

test("시작: 손패 4장, 1턴 에너지 2, 게이지 15. 에너지 = min(N+1,5) + 이월 최대 1", () => {
  const st = battle();
  const p = st.players[0];
  assert.deepEqual([p.hand.length, p.energy, p.gauge], [4, 2, 15]);
  play(st, pass, pass);  // 2턴: 3 + 이월 1, 손패 6
  assert.deepEqual([st.turn, p.energy, p.hand.length], [2, 4, 6]);
  play(st, pass, pass);
  assert.equal(p.energy, 5);  // 3턴: 4 + 1
  toTurn(st, 6);
  assert.equal(p.energy, 6);  // 5(최대) + 이월 1
  assert.ok(p.hand.length <= 7, "손패 최대 7장");
});

test("제출 검증: 카드 3장 초과·에너지 부족·1턴 스펠·게이지 부족 거부", () => {
  const st = battle();
  const p = st.players[0];
  const four = p.hand.slice(0, 4).map((c) => c.uid);
  assert.throws(() => submit(st, 0, { cards: four }), /too_many_cards/);
  const big = give(st, 0, "C04");
  const big2 = give(st, 0, "C04");
  assert.throws(() => submit(st, 0, { cards: [big, big2] }), /energy_short/);
  assert.throws(() => submit(st, 0, { cards: [], spell: "SP01" }), /spell_cooldown/);
  assert.throws(() => submit(st, 0, { cards: [], active: true }), /gauge_not_full/);
});

test("실피 순풍: 매 턴 첫 1E 카드는 에너지 0", () => {
  const st = battle("SL", "AU");
  const a = give(st, 0, "C01"), b = give(st, 0, "C01"), c = give(st, 0, "C05");
  assert.deepEqual(cardCost(st, st.players[0], ["C01", "C01", "C05"]), [0, 1, 1]);
  submit(st, 0, { cards: [a, b, c] });  // 1턴 에너지 2로 1E 3장 가능
});

test("반격: 상대 공격 1장 무효 + 반격 피해, 상대가 공격 안 하면 헛방", () => {
  const st = battle("AU", "UM");
  st.players[0].energy = 5; st.players[1].energy = 5;
  const atk = give(st, 0, "C02"), ctr = give(st, 1, "C07");
  const hpA = st.players[0].hp, hpB = st.players[1].hp;
  play(st, { cards: [atk] }, { cards: [ctr] });
  assert.ok(st.log.some((e) => e.t === "countered" && e.card === "C02"));
  assert.equal(st.players[1].hp, hpB, "공격은 무효");
  assert.ok(st.players[0].hp < hpA, "반격 피해");
});

test("수호: 받는 모든 피해 0. 거울: 반사, 수호 상대에게는 반사도 0 (총괄 12장)", () => {
  const st = battle("UM", "AU", { spells: [["SP02", "SP04"], ["SP01", "SP08"]] });
  toTurn(st, 2);
  st.players[0].energy = 5;
  const atk = give(st, 0, "C02");
  const hpB = st.players[1].hp;
  play(st, { cards: [atk], spell: "SP02" }, { cards: [], spell: "SP01" });
  assert.equal(st.players[1].hp, hpB);
  assert.ok(st.log.some((e) => e.t === "dmg" && e.guard));
});

test("봉쇄: 상대 스펠 무효, 양측 봉쇄는 상쇄, 쿨다운은 둘 다 소모", () => {
  const st = battle("AU", "SE", { spells: [["SP05", "SP04"], ["SP05", "SP04"]] });
  toTurn(st, 2);
  st.players[1].hp -= 300;
  const before = st.players[1].hp;
  play(st, { spell: "SP05" }, { spell: "SP04" });
  assert.ok(st.players[1].hp <= before + 40, "회복 무효(월광 재생만)");  // 월광 3% = 31
  assert.ok(st.log.some((e) => e.t === "spell" && e.id === "SP04" && e.void));
  toTurn(st, 7);
  play(st, { spell: "SP05" }, { spell: "SP05" });
  assert.equal(st.log.filter((e) => e.t === "spell" && e.void).length, 2);
  assert.equal(st.players[0].spellReady.SP05, 7 + 5);
});

test("충전이 봉쇄로 무효: 처리 순서상 뒤쪽(공격) 카드부터 무효, 에너지 소모 (기획답변 2차 2)", () => {
  const st = battle("UM", "AU", { spells: [["SP06", "SP01"], ["SP05", "SP01"]] });
  toTurn(st, 2);
  const p = st.players[0];
  p.energy = 3;
  const atk = give(st, 0, "C02"), def = give(st, 0, "C06");  // 공격 2E를 먼저 골라도 방어(1단계)가 먼저 지불
  const hpB = st.players[1].hp;
  play(st, { cards: [atk, def], spell: "SP06" }, { spell: "SP05" });
  assert.ok(st.log.some((e) => e.t === "void" && e.card === "C02" && e.why === "energy"));
  assert.ok(st.log.some((e) => e.t === "card" && e.id === "C06"));
  assert.equal(st.players[1].hp >= hpB - 0, true);
  assert.ok(p.discard.some((c) => c.id === "C02"), "무효 카드도 버려짐");
});

test("이월 실드는 1턴만, 연쇄 이월 없음. 아우렐 50%는 새 실드에만 (기획답변 3차 B1)", () => {
  const st = battle("AU", "SE");
  const au = st.players[0];
  au.energy = 5;
  const def = give(st, 0, "C06");  // 철벽 DEF×3.5 ×1.2 = 231
  play(st, { cards: [def] }, pass);
  assert.equal(au.shield.carried, Math.round(Math.round(55 * 3.5 * 1.2) * 0.5));  // 다음 턴으로 50% 이월
  st.players.forEach((p) => { p.idle = -99; });
  play(st, pass, pass);
  assert.equal(au.shield.carried, 0, "이월분은 다시 이월되지 않음");
});

test("면역이 침묵보다 먼저(1단계): 같은 턴 침묵 무효 (총괄 12장)", () => {
  const st = battle("SI", "AU");
  st.players[0].energy = 5; st.players[1].energy = 5;
  const sil = give(st, 0, "C08"), imm = give(st, 1, "C10");
  play(st, { cards: [sil] }, { cards: [imm] });
  assert.ok(st.log.some((e) => e.t === "blocked" && e.debuff === "silence"));
  assert.equal(st.players[1].st.activeSeal, undefined);
});

test("침묵된 턴의 액티브는 무효, 게이지 반환 / 다음 턴 액티브 봉인", () => {
  const st = battle("SI", "UM");
  st.players[0].energy = 5;
  st.players[1].gauge = 100;
  const sil = give(st, 0, "C08");
  play(st, { cards: [sil] }, { active: true });
  assert.ok(st.log.some((e) => e.t === "active" && e.void));
  assert.equal(st.players[1].gauge, 100);
  assert.throws(() => submit(st, 1, { active: true }), /active_sealed/);
});

test("작열: 턴 종료마다 최대 HP 3%, 실드 무시, 2턴 후 소멸, 최대 3스택", () => {
  const st = battle("IG", "AU");
  st.players[0].energy = 5;
  const fb = give(st, 0, "C05");
  const ctr = give(st, 0, "IG01");
  const atk = give(st, 1, "C01");
  play(st, { cards: [ctr] }, { cards: [atk] });  // 화염 결계: 공격 무효 + 작열 2스택
  const target = st.players[1];
  assert.equal(target.st.burn.length, 2);
  void fb;
  const before = target.hp;
  play(st, pass, pass);  // 2턴 종료: 2스택 틱 후 소멸
  assert.equal(target.st.burn.length, 0);
  assert.ok(before - target.hp >= 1);
});

test("같은 단계에서 양측 HP 0이면 무승부 (총괄 6·12장)", () => {
  const st = battle("UM", "UM");
  st.players[0].hp = 1; st.players[1].hp = 1;
  st.players[0].energy = 5; st.players[1].energy = 5;
  const a = give(st, 0, "C02"), b = give(st, 1, "C02");
  play(st, { cards: [a] }, { cards: [b] });
  assert.deepEqual(st.result, { outcome: "draw", reason: "hp", turn: 1 });
});

test("10턴 종료: HP 비율 높은 쪽 승리", () => {
  const st = battle("AU", "SE");
  st.players[0].idle = -99; st.players[1].idle = -99;  // AFK 판정 제외
  toTurn(st, 10);
  st.players[1].hp -= 100;
  st.players[0].idle = -99; st.players[1].idle = -99;
  play(st, pass, pass);
  assert.equal(st.result.reason, "turn_limit");
  assert.equal(st.result.outcome, "a");
});

test("AFK: 접속 중 3턴 연속 무행동이면 이탈, 끊김 중 자동 방어 턴은 세지 않음", () => {
  const st = battle();
  for (let i = 0; i < 3; i += 1) {
    submit(st, 0, autoAction(st, 0, { disconnected: true }), { auto: "disconnect" });
    const c = st.players[1].hand[0];
    try { submit(st, 1, { cards: [c.uid] }); } catch { submit(st, 1, pass); }
    resolveTurn(st);
  }
  assert.equal(st.result, null);
  assert.equal(st.players[0].idle, 0);
  const st2 = battle();
  for (let i = 0; i < 3 && !st2.result; i += 1) resolveTurn(st2);  // 양쪽 시간 초과
  assert.equal(st2.result.reason, "afk");
});

test("항복은 4턴부터", () => {
  const st = battle();
  assert.throws(() => concede(st, 0), /surrender_too_early/);
  const st2 = battle();
  st2.players.forEach((p) => { p.idle = -99; });
  toTurn(st2, 4);
  concede(st2, 0);
  assert.deepEqual([st2.result.outcome, st2.result.reason], ["b", "surrender"]);
});

test("시야: 상대 손패·덱 순서·제출 내용은 보이지 않는다", () => {
  const st = battle();
  submit(st, 1, { cards: [st.players[1].hand[0].uid] });
  const v = view(st, 0);
  assert.equal(v.opp.hand, undefined);
  assert.equal(v.opp.handCount, 4);
  assert.equal(v.opp.submitted, true);
  assert.equal(v.opp.mySubmission, undefined);
  assert.equal(JSON.stringify(v).includes('"rng"'), false);
  assert.equal(v.me.hand.length, 4);
});

// 무작위 행동 봇으로 전 캐릭터 조합을 끝까지 돌려 예외·불변식 위반이 없는지 확인
function randomAction(st, seat, r) {
  const p = st.players[seat];
  const spells = Object.keys(p.spellReady).filter((s) => st.turn >= p.spellReady[s]);
  const action = { cards: [], spell: r() < 0.3 && spells.length ? spells[Math.floor(r() * spells.length)] : null, active: false };
  try { action.active = r() < 0.7 && p.gauge >= 100 && !(p.st.activeSeal && p.st.activeSeal.from <= st.turn && st.turn <= p.st.activeSeal.to); } catch { /* */ }
  const hand = p.hand.filter((c) => !p.sealed.includes(c.uid));
  for (const c of hand.sort(() => r() - 0.5)) {
    if (action.cards.length >= 3) break;
    const next = [...action.cards, c.uid];
    try { submit(structuredClone(st), seat, { ...action, cards: next }); action.cards = next; } catch { /* 못 내는 카드 */ }
  }
  return action;
}

test("시뮬레이션: 9×9 캐릭터 × 3덱 무작위 대전이 모두 규칙 안에서 끝난다", () => {
  let seed = 12345;
  const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const stats = { games: 0, turns: 0, draws: 0, reasons: {} };
  const wins = Object.fromEntries(CHARS.map((c) => [c, [0, 0]]));
  for (const a of CHARS) for (const b of CHARS) for (let slot = 1; slot <= 3; slot += 1) {
    const sp = Object.keys(DATA.spells);
    const pick = () => { const s = [...sp].sort(() => r() - 0.5); return s.slice(0, 2); };
    const st = createBattle({ seed: Math.floor(r() * 1e9), data: DATA, players: [
      { characterId: a, spells: pick(), deck: presetDeck(DATA, a, slot) }, { characterId: b, spells: pick(), deck: presetDeck(DATA, b, ((slot) % 3) + 1) }] });
    while (!st.result) {
      submit(st, 0, randomAction(st, 0, r));
      submit(st, 1, randomAction(st, 1, r));
      resolveTurn(st);
      for (const p of st.players) {
        assert.ok(p.hp <= p.maxHp && p.hp >= 0, "HP 범위");
        assert.ok(p.hand.length <= 7, "손패 7장");
        assert.ok(p.gauge >= 0 && p.gauge <= 100, "게이지 범위");
        assert.ok(p.deck.length + p.hand.length + p.discard.length <= 12, "카드 수");
      }
      assert.ok(st.turn <= 10);
    }
    stats.games += 1; stats.turns += st.result.turn;
    stats.reasons[st.result.reason] = (stats.reasons[st.result.reason] ?? 0) + 1;
    if (st.result.outcome === "draw") stats.draws += 1;
    else { wins[st.result.outcome === "a" ? a : b][0] += 1; }
    wins[a][1] += 1; wins[b][1] += 1;
  }
  assert.equal(stats.games, 243);
  console.log(`# 시뮬레이션 ${stats.games}판, 평균 ${(stats.turns / stats.games).toFixed(1)}턴, 무승부 ${stats.draws}, 종료 ${JSON.stringify(stats.reasons)}`);
  console.log(`# 무작위 봇 승률(참고용) ${CHARS.map((c) => `${c} ${Math.round((100 * wins[c][0]) / wins[c][1])}%`).join(" · ")}`);
});

test("결정적: 같은 시드·같은 입력이면 같은 결과", () => {
  const run = () => {
    const st = battle("IG", "MO", { seed: 99 });
    while (!st.result) {
      for (const s of [0, 1]) {
        const p = st.players[s];
        const c = p.hand.find((h) => cardCost(st, p, [h.id])[0] <= p.energy && !p.sealed.includes(h.uid));
        submit(st, s, { cards: c ? [c.uid] : [] });
      }
      resolveTurn(st);
    }
    return JSON.stringify(st.players.map((p) => [p.hp, p.dealt])) + st.result.outcome;
  };
  assert.equal(run(), run());
});
