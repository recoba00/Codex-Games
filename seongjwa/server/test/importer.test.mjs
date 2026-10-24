import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { importWorkbook } from "../src/bo/importer.mjs";
import { diffData } from "../src/bo/api.mjs";
import { readXlsx } from "../src/bo/xlsx.mjs";

// 백오피스 업로드 경로(JS 리더 + JS 가져오기)가 라이브 데이터(테스트 픽스처)와 같은 결과를 내는지 확인한다.
const XLSX = new URL("../../data/balance_v8.xlsx", import.meta.url);
const FIX = JSON.parse(readFileSync(new URL("./fixtures/data_v1.json", import.meta.url)));
const sheetsP = readXlsx(readFileSync(XLSX));

test("xlsx 리더: 시트 12개, 수식 셀은 저장된 결과값", async () => {
  const s = await sheetsP;
  assert.equal(Object.keys(s).length, 12);
  assert.ok(s["경제"].some((r) => r.includes("하루 골드 수입")));
  const row = s["경제"].find((r) => r[0] === "하루 골드 수입");
  assert.ok(Math.abs(row[1] - 1311.4285714) < 1e-3, "수식 결과값");
});

test("가져오기: 오류·검수 차단·경고 0건, 라이브 데이터와 같은 값", async () => {
  const r = importWorkbook(await sheetsP);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.blocks, []);
  assert.deepEqual(r.warnings.map((w) => w.split(" →")[0]), ["시트 `랭크로드` 없음"], "v8에는 랭크로드 시트가 없음(기획답변 17차에서 추가)");
  assert.deepEqual(r.summary, { characters: 9, cards: 34, spells: 8, settings: 44, presets: 27, tables: ["missions", "rank_tiers", "leaver", "rank_rewards"] });
  const d = r.data;
  for (const [id, c] of Object.entries(FIX.characters)) {
    for (const k of ["name", "job", "role", "faction", "rarity", "offer", "hp", "atk", "def", "spd", "crit", "passive_name", "passive_text", "active_name", "active_text", "passive_params", "active_params"]) {
      assert.deepEqual(d.characters[id][k], c[k], `${id}.${k}`);
    }
  }
  for (const [id, c] of Object.entries(FIX.cards)) {
    for (const k of ["name", "kind", "phase", "owner_character", "cost", "effect_text"]) assert.deepEqual(d.cards[id][k], c[k], `${id}.${k}`);
    for (const k of ["coef", "hits", "pierce"]) assert.equal(Number(d.cards[id][k]), Number(c[k]), `${id}.${k}`);
  }
  for (const [id, s] of Object.entries(FIX.spells)) {
    assert.deepEqual([d.spells[id].name, d.spells[id].cooldown, d.spells[id].effect_text], [s.name, s.cooldown, s.effect_text], id);
    assert.equal(d.spells[id].value === null ? null : Number(d.spells[id].value), s.value === null ? null : Number(s.value), id);
  }
  for (const [k, v] of Object.entries(FIX.settings)) assert.equal(Number(d.settings[k].value), Number(v), k);
  for (const [cid, list] of Object.entries(FIX.presets)) {
    for (const p of list) assert.deepEqual(d.presets.find((x) => x.character_id === cid && x.slot === p.slot).cards, p.cards, `${cid}#${p.slot}`);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(d.tables)), FIX.tables);
});

test("가져오기 검증: 형식 오류는 errors, 스탯 예산·범위는 blocks", async () => {
  const s = structuredClone(await sheetsP);
  const rows = s["캐릭터"];
  const hr = rows.findIndex((r) => r?.includes("HP"));
  const ci = rows[hr].indexOf("HP"), idc = rows[hr].indexOf("ID"), ps = rows[hr].indexOf("액티브 수치");
  const au = rows.findIndex((r) => r?.[idc] === "AU");
  rows[au][ci] = 2000;
  rows[au][ps] = "active_mult=1.5;oops=1";
  const r = importWorkbook(s);
  assert.ok(r.errors.some((e) => e.includes("알 수 없는 키 'oops'")), r.errors.join("\n"));
  assert.ok(r.blocks.some((e) => e.startsWith("AU HP 2000 범위")), r.blocks.join("\n"));
  assert.ok(r.blocks.some((e) => e.startsWith("AU 스탯 예산")));
});

test("경제 시트: E열 키는 설정으로, 미션 표는 tables.missions로 (기획답변 13차)", async () => {
  const r = importWorkbook(await sheetsP);
  assert.deepEqual([r.data.settings.econ_practice_win_gold.value, r.data.settings.econ_attend_cum28_gold.value], [15, 3000]);
  const m = r.data.tables.missions;
  assert.deepEqual([m.daily.length, m.weekly.length, m.season.length], [5, 5, 10]);
  assert.deepEqual(m.weekly.find((x) => x.id === "W02"), { id: "W02", name: "진영 3개 모두로 1승", metric: "faction_wins", target: 1, aux: { factions: 3 }, scope: "ranked_ai", gold: 200 });
  const s = structuredClone(await sheetsP);
  const row = s["경제"].find((x) => x?.[1] === "D02");
  row[3] = "winz"; row[6] = "everyone";
  const bad = importWorkbook(s);
  assert.ok(bad.errors.some((e) => e.includes("조건 종류 'winz'")) && bad.errors.some((e) => e.includes("범위 'everyone'")), bad.errors.join("\n"));
});

test("변경표: 경제 키 추가는 설정 행, 미션 표는 미션 행 단위, 값 변경은 항목 단위", async () => {
  const { diffData } = await import("../src/bo/api.mjs");
  const v8 = structuredClone(FIX);
  const v7 = structuredClone(FIX);
  for (const k of Object.keys(v7.settings)) if (/^econ_|^season_days$/.test(k)) delete v7.settings[k];
  delete v7.tables.missions;
  delete v8.tables.rank_rewards; delete v7.tables.rank_rewards;
  const d = diffData(v7, v8);
  assert.equal(d.filter((x) => x.kind === "settings" && x.change === "added").length, 9);
  assert.deepEqual(d.filter((x) => x.kind === "tables").map((x) => x.id).slice(0, 2), ["missions.daily.D01", "missions.daily.D02"]);
  assert.equal(d.filter((x) => x.kind === "tables" && x.change === "added").length, 20);
  const v9 = structuredClone(v8);
  v9.tables.missions.weekly[1].gold = 250;
  v9.characters.AU.hp = 1210;
  assert.deepEqual(diffData(v8, v9).map((x) => [x.kind, x.id, x.field, x.from, x.to]),
    [["characters", "AU", "hp", 1200, 1210], ["tables", "missions.weekly.W02", "gold", 200, 250]]);
});

// 기획답변 17차 시트 배치: 랭크로드(헤더 4행, 데이터 5~20행, 22행 합계), 시즌스킨(헤더 4행, 데이터 5행~), 설정값 39·40행
function withV9(sheets) {
  const s = structuredClone(sheets);
  const tiers = ["브론즈 III", "브론즈 II", "브론즈 I", "실버 III", "실버 II", "실버 I", "골드 III", "골드 II", "골드 I", "플래티넘 III", "플래티넘 II", "플래티넘 I", "다이아 III", "다이아 II", "다이아 I", "마스터"];
  const edge = new Set([4, 7, 10, 13, 16]);
  s["랭크로드"] = [["랭크 로드(시즌마다 각 단계 첫 도달 1회)"], ["메모"], [],
    ["단계 번호", "단계", "골드", "추가 보상 종류", "상품 ID"],
    ...tiers.map((t, i) => [i + 1, t, edge.has(i + 1) ? 300 : 100, edge.has(i + 1) ? "감정표현·카드 뒷면" : "", ""]),
    [], ["합계", "", 2600]];
  s["시즌스킨"] = [["시즌 이벤트 스킨"], [], [], ["시즌", "상품 ID", "비고"], [1, "", "출시 스킨 0종"], [2, "", ""]];
  const set = s["설정값"];
  const at = set.findIndex((r) => r?.[4] === "ai_subopt_gold_plat") + 1;
  set.splice(at, 0, ["몰아주기 기간", 24, "시간", "상세 13", "pair_window_hours"], ["몰아주기 판수", 2, "판", "상세 13", "pair_limit"]);
  return s;
}

test("랭크로드·시즌스킨·몰아주기 설정 (기획답변 17차)", async () => {
  const r = importWorkbook(withV9(await sheetsP));
  assert.deepEqual([r.errors, r.blocks, r.warnings], [[], [], []]);
  const road = r.data.tables.rank_road.steps;
  assert.equal(road.length, 16);
  assert.equal(road.reduce((a, x) => a + x.gold, 0), 2600);
  assert.deepEqual(road[3], { no: 4, name: "실버 III", gold: 300, extra: "감정표현·카드 뒷면", items: [] });
  assert.deepEqual(r.data.tables.season_skins.seasons.map((x) => [x.no, x.item]), [[1, null], [2, null]]);
  assert.deepEqual([r.data.settings.pair_window_hours.value, r.data.settings.pair_limit.value], [24, 2]);
  // 변경표: 랭크로드 16행 + 시즌스킨 2행 + 설정 2개 추가, 그 밖은 0
  const base = importWorkbook(await sheetsP).data;
  const diff = diffData(base, r.data);
  assert.deepEqual([diff.filter((d) => d.id.startsWith("rank_road.")).length, diff.filter((d) => d.id.startsWith("season_skins.")).length, diff.filter((d) => d.kind === "settings").length, diff.length], [16, 2, 2, 20]);
  // 오류: 상품 ID 형식, 단계 수
  const bad = withV9(await sheetsP);
  bad["랭크로드"][4][4] = "emote hello!";
  bad["랭크로드"].splice(6, 1);
  const e = importWorkbook(bad).errors.join(" / ");
  assert.match(e, /상품 ID 형식 오류/);
  assert.match(e, /15단계/);
});
