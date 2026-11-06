import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { artKey, assetManifest, bgOf, cardTo57, checkBg, checkRegions, checkUpload, shapeAssets, SLOTS, slotOf, webpInfo } from "../src/assets.mjs";

const f = (n) => readFileSync(new URL(`./fixtures/assets/${n}`, import.meta.url));

test("WebP 헤더: 손실(VP8)·무손실(VP8L)·확장(VP8X, 알파) 크기 읽기, WebP 아니면 null", () => {
  assert.deepEqual(webpInfo(f("full_1080.webp")), { w: 1080, h: 1920, alpha: true, format: "VP8X" });
  assert.deepEqual(webpInfo(f("face.webp")), { w: 512, h: 512, alpha: true, format: "VP8L" });
  assert.deepEqual(webpInfo(f("tier_vp8.webp")), { w: 512, h: 512, alpha: false, format: "VP8" });
  assert.equal(webpInfo(new TextEncoder().encode("‰PNG not webp at all, padding padding")), null);
});

test("슬롯 70개(상세 14 표 + 티어 프레임 7 + 카드 일러스트 16 + 진영 문양 3, 종류 아이콘 7 폐지), 규격: 엠블럼 512, 아이콘·숙련도 뱃지 256, 카드 관련 800×1120, 배경 2560×1440", () => {
  assert.equal(SLOTS.length, 70);  // KIND_* 7종 폐지(유형에너지텍스트)
  assert.equal(new Set(SLOTS.map((s) => s.id)).size, 70);
  assert.equal(slotOf("KIND_ATTACK"), null);
  assert.deepEqual([slotOf("FACTION_WIND").w, slotOf("FACTION_WIND").group, slotOf("FACTION_FIRE").name], [256, "아이콘", "진영 문양(아이콘) 불"]);
  assert.deepEqual([slotOf("CARD_ART_C16").w, slotOf("CARD_ART_C16").h, slotOf("CARD_ART_C01").alpha, slotOf("CARD_ART_C17")], [800, 1120, false, null]);
  assert.deepEqual([slotOf("MASTERY_3").w, slotOf("MASTERY_3").h, slotOf("FRAME_LEGEND").w, slotOf("FRAME_LEGEND").h, slotOf("RARITY_EPIC")], [256, 256, 928, 1248, null]);
  assert.deepEqual([slotOf("CARD_FRAME").w, slotOf("CARD_ART_C01").group], [800, "카드 일러스트"], "티어 프레임만 928×1248(기획지시 프레임여백)");
  checkUpload("slot", { w: 928, h: 1248 }, 10, slotOf("FRAME_GOLD"));
  assert.throws(() => checkUpload("slot", { w: 800, h: 1120 }, 10, slotOf("FRAME_GOLD")), /asset_spec/);
  assert.deepEqual([slotOf("TIER_GOLD").w, slotOf("STATUS_BURN").w, slotOf("CARD_BACK").h, slotOf("BG_LOBBY").w], [512, 256, 1120, 2560]);
  assert.equal(slotOf("BG_BATTLE").alpha, false);
  assert.ok(SLOTS.every((s) => s.w % 4 === 0 && s.h % 4 === 0), "모두 4의 배수");
});

test("업로드 규격 검사: 전신 9:16·1080~1440·4의 배수, 축소본·얼굴·슬롯은 정확한 크기", () => {
  checkUpload("full", webpInfo(f("full_1080.webp")), 10000);
  assert.throws(() => checkUpload("full", webpInfo(f("full_bad.webp")), 10000), (e) => e.message === "asset_spec" && /9:16/.test(e.extra.detail));
  assert.throws(() => checkUpload("full", { w: 2160, h: 3840 }, 10), (e) => /1080~1440/.test(e.extra.detail));
  checkUpload("thumb", webpInfo(f("thumb.webp")), 10);
  checkUpload("face", webpInfo(f("face.webp")), 10);
  checkUpload("slot", webpInfo(f("tier_vp8.webp")), 10, slotOf("TIER_GOLD"));
  assert.throws(() => checkUpload("slot", webpInfo(f("tier_vp8.webp")), 10, slotOf("CARD_BACK")), /asset_spec/);
  assert.throws(() => checkUpload("face", null, 10), /asset_not_webp/);
  assert.throws(() => checkUpload("face", webpInfo(f("face.webp")), 3e6), /asset_too_large/);
});

test("영역: 카드는 5:7(크기·위치 자유, 기획지시 2026-11-06 카드영역5대7), 얼굴은 1:1·이미지 안, 512px 미만이면 경고", () => {
  const full = { w: 1440, h: 2560 };
  const r = checkRegions(full, { x: 0, y: 0.1, w: 1, h: 0.7875 }, { x: 0.3, y: 0.05, w: 0.4, h: 0.225 });
  assert.deepEqual(r.warnings, []);
  assert.match(checkRegions(full, { x: 0, y: 0, w: 1, h: 0.7875 }, { x: 0.3, y: 0.05, w: 0.2, h: 0.1125 }).warnings[0], /288px/);
  const small = checkRegions(full, { x: 0, y: 0, w: 0.5, h: 0.39375 }, { x: 0.3, y: 0.05, w: 0.4, h: 0.225 });
  assert.match(small.warnings[0], /카드 영역 720×1008px — 출력 800×1120px/);  // 800×1120 미만이면 경고만
  assert.throws(() => checkRegions(full, { x: 0, y: 0, w: 1, h: 0.75 }, { x: 0, y: 0, w: 0.4, h: 0.225 }), (e) => /5:7/.test(e.extra.detail));  // 옛 3:4는 저장 불가
  assert.throws(() => checkRegions(full, { x: 0.5, y: 0, w: 0.6, h: 0.4725 }, { x: 0, y: 0, w: 0.4, h: 0.225 }), (e) => /밖/.test(e.extra.detail));
  assert.throws(() => checkRegions(full, { x: 0, y: 0.3, w: 1, h: 0.7875 }, { x: 0, y: 0, w: 0.4, h: 0.225 }), (e) => /밖/.test(e.extra.detail));
  assert.throws(() => checkRegions(full, { x: 0, y: 0, w: 1, h: 0.7875 }, { x: 0, y: 0, w: 0.4, h: 0.4 }), (e) => /1:1/.test(e.extra.detail));
  // 옛 3:4 → 5:7: 같은 중심·가로폭, 이미지 밖이면 안쪽으로(위가 0이면 머리 그대로)
  assert.deepEqual(cardTo57({ x: 0.08843, y: 0, w: 0.79, h: 0.5925 }, 1440, 2560), { x: 0.08843, y: 0, w: 0.79, h: 0.62213 });
  assert.deepEqual(cardTo57({ x: 0, y: 0.25, w: 1, h: 0.75 }, 1440, 2560), { x: 0, y: 0.2125, w: 1, h: 0.7875 });
  const ok = { x: 0, y: 0, w: 1, h: 0.7875 };
  assert.equal(cardTo57(ok, 1440, 2560), ok);
});

test("합본 규격: 5:7·4의 배수·800×1120까지(기획지시 2026-11-06 합본규격변경), 옛 9:16 합본은 쓰지 않음", () => {
  checkUpload("combined", { w: 800, h: 1120 }, 10);
  checkUpload("combined", { w: 400, h: 560 }, 10);
  assert.throws(() => checkUpload("combined", { w: 1440, h: 2560 }, 10), (e) => /5:7/.test(e.extra.detail));
  assert.throws(() => checkUpload("combined", { w: 1000, h: 1400 }, 10), (e) => /800×1120까지/.test(e.extra.detail));
  const rows = { "art:AU:000:full": { cur: { path: "f", w: 1440, h: 2560 } }, "slot:ART_AU_000_COMBINED": { cur: { path: "c", w: 1440, h: 2560 } } };
  const sh = shapeAssets(rows).art.AU["000"];
  assert.equal(sh.combined, undefined);
  assert.equal(sh.combinedOld.path, "c");
  assert.equal(bgOf(sh, "CARD_BG_FIRE").bg, "CARD_BG_FIRE", "다시 올릴 때까지 진영 기본 배경");
});

test("클라이언트 목록: 공개 주소 + 해시 이름, 없는 슬롯은 빠짐(내장 기본 이미지), 표 asset_files 키 → 모양", () => {
  const rows = { "slot:TIER_GOLD": { cur: { path: "slots/TIER_GOLD.abc.webp", w: 512, h: 512, bytes: 10 }, prev: null },
    "slot:CARD_BACK": { cur: null, prev: { path: "slots/CARD_BACK.old.webp" } },
    "art:AU:000:full": { cur: { path: "art/AU_000_full.x.webp", w: 1440, h: 2560, bytes: 9 } },
    "art:AU:000:regions": { cur: { card: { x: 0, y: 0, w: 1, h: 0.75 }, faceRect: { x: 0.3, y: 0.1, w: 0.2, h: 0.1125 } } },
    "art:AU:001:regions": { cur: { card: { x: 0, y: 0, w: 1, h: 0.75 } } } };
  const shaped = shapeAssets(rows);
  assert.deepEqual(Object.keys(shaped.slots), ["TIER_GOLD"]);
  assert.equal(shapeAssets(rows, "prev").slots.CARD_BACK.path, "slots/CARD_BACK.old.webp");
  const m = assetManifest(shaped, { SUPABASE_URL: "https://p.supabase.co/" });
  assert.equal(m.slots.TIER_GOLD.url, "https://p.supabase.co/storage/v1/object/public/assets/slots/TIER_GOLD.abc.webp");
  assert.equal(m.art.AU["000"].face, null);
  assert.deepEqual(m.art.AU["000"].card, { x: 0, y: 0, w: 1, h: 0.7875 }, "옛 3:4 영역은 5:7로 바꿔 내보냄");
  assert.equal(m.art.AU["001"], undefined, "전신 없는 스킨은 내보내지 않음");
  assert.equal(m.art.AU["000"].bg, "CARD_BG_NEUTRAL", "진영 모르면 중립 배경");
  // 합본(기본 배경 사용 안 함): slot:ART_AU_000_COMBINED → art.AU.000.combined, bg = combined. 슬롯 목록엔 안 나옴
  const rows2 = { ...rows, "slot:ART_AU_000_COMBINED": { cur: { path: "art/AU_000_combined.c.webp", w: 800, h: 1120, bytes: 7 } } };
  const sh2 = shapeAssets(rows2);
  assert.equal(sh2.slots.ART_AU_000_COMBINED, undefined);
  const m2 = assetManifest(sh2, { SUPABASE_URL: "https://p.supabase.co" }, { AU: "불" });
  assert.deepEqual([m2.art.AU["000"].bg, m2.art.AU["000"].combined.path], ["combined", "art/AU_000_combined.c.webp"]);
  assert.equal(assetManifest(shaped, { SUPABASE_URL: "x" }, { AU: "물" }).art.AU["000"].bg, "CARD_BG_WATER");
  assert.equal(artKey("SE", "001", "combined"), "slot:ART_SE_001_COMBINED");
  // 배경 3가지(기획지시 배경방식): 방식 값 없는 옛 스킨은 합본 있으면 combined, 고른 방식 파일·색이 없으면 진영 배경으로 대체
  assert.deepEqual(bgOf({}, "CARD_BG_FIRE"), { bg: "CARD_BG_FIRE", bgMode: "faction", bgColor: null, bgSlot: "CARD_BG_FIRE" });
  assert.deepEqual(bgOf({ bgOpt: { mode: "color", color: "#112233" } }, "S"), { bg: "color", bgMode: "color", bgColor: "#112233", bgSlot: "S" });
  assert.equal(bgOf({ bgOpt: { mode: "combined" } }, "S").bg, "S", "합본 없으면 진영");
  assert.equal(bgOf({ combined: { path: "x" }, bgOpt: { mode: "faction" } }, "S").bg, "S", "합본이 있어도 기본을 고르면 진영");
  assert.equal(shapeAssets({ "slot:ART_AU_000_BG": { cur: { mode: "color", color: "#ABCDEF" } } }).art.AU["000"].bgOpt.color, "#ABCDEF");
  assert.throws(() => checkBg("color", "red"), /value_invalid/);
  assert.deepEqual(checkBg("color", "#abcdef"), { mode: "color", color: "#ABCDEF" });
  assert.throws(() => checkUpload("combined", webpInfo(f("full_1080.webp")), 10000), /asset_spec/);  // 9:16 합본은 이제 안 받음(5:7)
});
