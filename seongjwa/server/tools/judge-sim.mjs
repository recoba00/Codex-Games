// 10턴 판정 편향 점검(기획지시 2026-11-08 판정승률점검): AI 대 AI, 판마다 종료 사유·남은 HP·받은 피해·실드 흡수·회복·재생을 기록해 캐릭터별로 나눔
// 사용: node tools/judge-sim.mjs [판수/조합=40] [데이터 JSON] [난이도 hard|normal] > report.json
import { readFileSync } from "node:fs";
import { chooseAction, chooseLoadout, remember } from "../src/engine/ai.mjs";
import { createBattle, presetDeck, resolveTurn, submit } from "../src/engine/battle.mjs";

const per = Number(process.argv[2] ?? 40);
const DATA = JSON.parse(readFileSync(process.argv[3] ?? new URL("../test/fixtures/data_v1.json", import.meta.url)));
const diff = process.argv[4] ?? "hard";
const CHARS = Object.keys(DATA.characters);
let seed = Number(process.env.SIM_SEED ?? 20261108);
const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const games = [];
for (const a of CHARS) for (const b of CHARS) for (let i = 0; i < per; i += 1) {
  if (a === b) continue;  // 미러전 제외
  const slots = [1 + Math.floor(r() * 3), 1 + Math.floor(r() * 3)], ids = [a, b];
  const st = createBattle({ seed: Math.floor(r() * 2 ** 31), data: DATA, players: ids.map((c, s) => ({ characterId: c, spells: chooseLoadout(DATA, c, ids[1 - s]).spells, deck: presetDeck(DATA, c, slots[s]) })) });
  const mem = [{ oppKinds: [] }, { oppKinds: [] }];
  const acc = [0, 1].map(() => ({ taken: 0, absorbed: 0, heal: 0, regen: 0, self: 0 }));
  while (!st.result) {
    for (const s of [0, 1]) submit(st, s, chooseAction(st, s, { difficulty: diff, random: r, memory: mem[s] }).action);
    resolveTurn(st);
    let end = false;
    for (const e of st.log) {
      if (e.t === "phase" && e.n === 5) end = true;
      if (e.t === "dmg" && e.seat != null) { acc[e.seat].taken += e.v || 0; acc[e.seat].absorbed += e.absorbed || 0; }
      if (e.t === "heal" && e.seat != null) acc[e.seat][end && st.players[e.seat].char === "SE" ? "regen" : "heal"] += e.v || 0;
      if (e.t === "selfcost" && e.seat != null) acc[e.seat].self += e.v || 0;
    }
    remember(st, 0, mem[0]); remember(st, 1, mem[1]);
  }
  const endE = st.log.find((e) => e.t === "end") || {};
  games.push({ a, b, sl: slots, o: st.result.outcome, r: st.result.reason, ko2: !!endE.koBoth, t: st.result.turn,
    hp: st.players.map((p) => Math.max(0, p.hp) / p.maxHp), mx: st.players.map((p) => p.maxHp), dealt: st.players.map((p) => p.dealt ?? 0),
    acc: acc.map((x, s) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, Math.round(v) / st.players[s].maxHp]))) });
}
console.log(JSON.stringify({ diff, per, version: DATA.version, games }));
