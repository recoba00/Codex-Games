import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { chooseAction, chooseBan, chooseLoadout, choosePick, remember } from "../src/engine/ai.mjs";
import { createBattle, presetDeck, resolveTurn, submit } from "../src/engine/battle.mjs";

const DATA = JSON.parse(readFileSync(new URL("./fixtures/data_v1.json", import.meta.url)));
const CHARS = Object.keys(DATA.characters);

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function randomBot(st, seat, r) {
  const p = st.players[seat];
  const action = { cards: [], spell: null, active: false };
  for (const c of [...p.hand].sort(() => r() - 0.5)) {
    if (action.cards.length >= 3) break;
    try { submit(structuredClone(st), seat, { ...action, cards: [...action.cards, c.uid] }); action.cards.push(c.uid); } catch { /* */ }
  }
  return action;
}

function play(a, b, players, seed) {
  const r = rng(seed);
  const st = createBattle({ seed, data: DATA, players: players.map((ch) => ({ characterId: ch, spells: chooseLoadout(DATA, ch, players[1 - players.indexOf(ch)]).spells, deck: presetDeck(DATA, ch, 2) })) });
  const mem = [{ oppKinds: [] }, { oppKinds: [] }];
  while (!st.result) {
    [a, b].forEach((bot, seat) => {
      const act = bot === "random" ? randomBot(st, seat, r) : chooseAction(st, seat, { difficulty: bot, random: r, memory: mem[seat] }).action;
      submit(st, seat, act);  // AI 행동은 서버 검증을 반드시 통과해야 함
    });
    resolveTurn(st);
    remember(st, 0, mem[0]); remember(st, 1, mem[1]);
  }
  return st.result;
}

test("AI 행동은 항상 서버 검증을 통과(전 캐릭터 조합, 3난이도)", () => {
  let n = 0;
  for (const a of CHARS) for (const b of CHARS) {
    for (const d of ["easy", "normal", "hard"]) { play(d, d, [a, b], 1000 + n); n += 1; }
  }
  assert.equal(n, 243);
});

test("어려움 AI는 무작위 행동보다 확실히 강하고, 난이도 순서가 맞다", () => {
  const rate = (x, y, games = 162) => {
    let w = 0;
    for (let i = 0; i < games; i += 1) {
      const a = CHARS[i % 9], b = CHARS[(i * 4 + 1) % 9];
      const swap = i % 2 === 1;  // 자리 편향 제거
      const res = swap ? play(y, x, [b, a], 5000 + i) : play(x, y, [a, b], 5000 + i);
      if (res.outcome === (swap ? "b" : "a")) w += 1; else if (res.outcome === "draw") w += 0.5;
    }
    return w / games;
  };
  const hardVsRandom = rate("hard", "random");
  const hardVsEasy = rate("hard", "easy");
  console.log(`# 어려움 vs 무작위 ${(hardVsRandom * 100).toFixed(0)}%, 어려움 vs 쉬움 ${(hardVsEasy * 100).toFixed(0)}%`);
  assert.ok(hardVsRandom > 0.7, `hard vs random ${hardVsRandom}`);
  assert.ok(hardVsEasy > 0.5, `hard vs easy ${hardVsEasy}`);
});

test("밴·픽·스펠 AI: 규칙 범위 안 선택", () => {
  const r = rng(3);
  for (let i = 0; i < 50; i += 1) {
    assert.ok(CHARS.includes(chooseBan(DATA, { playerFavorite: "SE", random: r })));
    const pool = CHARS.filter((c) => c !== "AU");
    assert.ok(pool.includes(choosePick(DATA, pool, { playerFaction: "불", random: r })));
  }
  const l = chooseLoadout(DATA, "AU", "SI");
  assert.deepEqual(l.spells, ["SP01", "SP03"]);
  assert.equal(new Set(l.spells).size, 2);
});
