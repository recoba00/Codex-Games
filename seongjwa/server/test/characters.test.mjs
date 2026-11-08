import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROTATION_DEFAULT, availOf, baseIds, freeOf, validRotation, weekOf } from "../src/characters.mjs";

const DATA = JSON.parse(readFileSync(new URL("./fixtures/data_v1.json", import.meta.url)));
const at = (s) => Date.parse(s);

test("주 경계 = 월요일 05:00 KST (기획지시 캐릭터입수)", () => {
  assert.equal(weekOf(at("2026-11-08T19:59:59Z")).key, "2026-11-02");  // 월 04:59 KST
  assert.equal(weekOf(at("2026-11-08T20:00:00Z")).key, "2026-11-09");  // 월 05:00 KST
  const w = weekOf(at("2026-11-12T03:00:00Z"));
  assert.equal(w.key, "2026-11-09");
  assert.equal(new Date(w.end).toISOString(), "2026-11-15T20:00:00.000Z");
});

test("고정 6명 = 로테이션 풀(이그니스·테티스·실피)과 유료 추가를 뺀 캐릭터", () => {
  assert.deepEqual(baseIds(DATA).sort(), ["AU", "MO", "PY", "SE", "SI", "UM"]);
  const d = structuredClone(DATA); d.characters.SI.offer = "paid";
  assert.deepEqual(baseIds(d).sort(), ["AU", "MO", "PY", "SE", "UM"]);
});

test("이번 주 무료: 3주 순환 A/B/C, 시작 주 이전도 순환, BO 주차 지정 우선, 무료 수 설정값", () => {
  const f = (iso, cfg = ROTATION_DEFAULT, d = DATA) => freeOf(d, cfg, at(iso)).free;
  assert.deepEqual(f("2026-11-03T00:00:00Z"), ["IG", "TE"]);   // A
  assert.deepEqual(f("2026-11-10T00:00:00Z"), ["TE", "SL"]);   // B
  assert.deepEqual(f("2026-11-17T00:00:00Z"), ["SL", "IG"]);   // C
  assert.deepEqual(f("2026-11-24T00:00:00Z"), ["IG", "TE"]);   // 다시 A
  assert.deepEqual(f("2026-10-27T00:00:00Z"), ["SL", "IG"]);   // 시작 1주 전 = C
  const cfg = validRotation({ ...ROTATION_DEFAULT, start_week: "2026-11-09", overrides: { "2026-11-16": ["SL", "TE"] } });
  assert.deepEqual(f("2026-11-10T00:00:00Z", cfg), ["IG", "TE"]);  // 출시 주 = A
  assert.deepEqual(f("2026-11-17T00:00:00Z", cfg), ["SL", "TE"]);  // 지정 주
  const d1 = structuredClone(DATA); d1.settings.rotation_free_count = 1;
  assert.deepEqual(f("2026-11-03T00:00:00Z", ROTATION_DEFAULT, d1), ["IG"]);
  assert.equal(freeOf(DATA, ROTATION_DEFAULT, at("2026-11-03T00:00:00Z")).until, "2026-11-08T20:00:00.000Z");
});

test("픽 가능 = 보유 + 무료, 조회 실패(null)면 제한 없음 · 로테이션 설정 검증", () => {
  assert.deepEqual(availOf(DATA, ["AU", "SE"], ["IG"]).sort(), ["AU", "IG", "SE"]);
  assert.equal(availOf(DATA, null, ["IG"]), null);
  assert.throws(() => validRotation({ start_week: "2026-11-03", cycle: [["IG"]] }), /value_invalid/);  // 월요일 아님
  assert.throws(() => validRotation({ start_week: "2026-11-02", cycle: [["ig"]] }), /value_invalid/);
  assert.throws(() => validRotation({ start_week: "2026-11-02", cycle: [["IG"]], overrides: { "2026-11-10": ["TE"] } }), /value_invalid/);
});
