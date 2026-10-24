import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { importWorkbook } from "../src/bo/importer.mjs";
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
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.summary, { characters: 9, cards: 34, spells: 8, settings: 44, presets: 27, tables: ["missions", "rank_tiers", "leaver"] });
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
