// AI(어려움) 대 AI(어려움) 시뮬레이션: 캐릭터별·덱 유형별 승률 (상세 03 검증, 상세 15 덱 승률 45~55%)
// 사용: node tools/simulate.mjs [판수/조합=20] [데이터 JSON=test/fixtures/data_v1.json] > report.md
import { readFileSync } from "node:fs";
import { chooseAction, chooseLoadout, remember } from "../src/engine/ai.mjs";
import { createBattle, presetDeck, resolveTurn, submit } from "../src/engine/battle.mjs";

const per = Number(process.argv[2] ?? 20);
const DATA = JSON.parse(readFileSync(process.argv[3] ?? new URL("../test/fixtures/data_v1.json", import.meta.url)));
const CHARS = Object.keys(DATA.characters);
const STYLE = { 1: "공세", 2: "균형", 3: "수비" };
let seed = 20261023;
const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const char = Object.fromEntries(CHARS.map((c) => [c, { w: 0, n: 0 }]));
const deck = {};
const pair = {};
let turns = 0, games = 0, draws = 0;
const reasons = {};
for (const a of CHARS) for (const b of CHARS) for (let i = 0; i < per; i += 1) {
  const slots = [1 + Math.floor(r() * 3), 1 + Math.floor(r() * 3)];
  const ids = [a, b];
  const st = createBattle({ seed: Math.floor(r() * 2 ** 31), data: DATA, players: ids.map((c, s) => ({ characterId: c, spells: chooseLoadout(DATA, c, ids[1 - s]).spells, deck: presetDeck(DATA, c, slots[s]) })) });
  const mem = [{ oppKinds: [] }, { oppKinds: [] }];
  while (!st.result) {
    for (const s of [0, 1]) submit(st, s, chooseAction(st, s, { difficulty: "hard", random: r, memory: mem[s] }).action);
    resolveTurn(st);
    remember(st, 0, mem[0]); remember(st, 1, mem[1]);
  }
  games += 1; turns += st.result.turn;
  reasons[st.result.reason] = (reasons[st.result.reason] ?? 0) + 1;
  const score = st.result.outcome === "a" ? [1, 0] : st.result.outcome === "b" ? [0, 1] : [0.5, 0.5];
  if (st.result.outcome === "draw") draws += 1;
  ids.forEach((c, s) => {
    if (a === b) return;  // 미러전은 캐릭터 승률에서 제외
    char[c].w += score[s]; char[c].n += 1;
    const k = `${c} ${STYLE[slots[s]]}`;
    deck[k] ??= { w: 0, n: 0 };
    deck[k].w += score[s]; deck[k].n += 1;
  });
  if (a !== b) { pair[`${a}>${b}`] ??= { w: 0, n: 0 }; pair[`${a}>${b}`].w += score[0]; pair[`${a}>${b}`].n += 1; }
}
const pct = (x) => (x.n ? Math.round((100 * x.w) / x.n) : 0);
const out = [];
out.push(`# AI 대 AI 시뮬레이션 (어려움, 데이터 v${DATA.version})`, "");
out.push(`- 판수 ${games} (조합당 ${per}), 평균 ${(turns / games).toFixed(1)}턴, 무승부 ${draws}, 종료 사유 ${JSON.stringify(reasons)}`);
out.push("- 미러전 제외. 덱 유형은 판마다 무작위. 스펠은 AI 추천 규칙(상세 03). 기준: 캐릭터·덱 45~55%(상세 15)", "");
out.push("| 캐릭터 | 승률 | 판수 | 판정 |", "| --- | --- | --- | --- |");
for (const c of CHARS) out.push(`| ${c} ${DATA.characters[c].name} | ${pct(char[c])}% | ${char[c].n} | ${pct(char[c]) < 45 || pct(char[c]) > 55 ? "벗어남" : "OK"} |`);
out.push("", "| 덱 | 승률 | 판수 |", "| --- | --- | --- |");
for (const k of Object.keys(deck).sort()) out.push(`| ${k} | ${pct(deck[k])}% | ${deck[k].n} |`);
out.push("", "## 상성표 (행 캐릭터가 열 캐릭터를 상대로 이긴 비율, 0번 자리 기준)", "", `| | ${CHARS.join(" | ")} |`, `| --- |${CHARS.map(() => " --- |").join("")}`);
for (const a of CHARS) out.push(`| ${a} | ${CHARS.map((b) => (a === b ? "-" : `${pct(pair[`${a}>${b}`] ?? { w: 0, n: 0 })}`)).join(" | ")} |`);
console.log(out.join("\n"));
