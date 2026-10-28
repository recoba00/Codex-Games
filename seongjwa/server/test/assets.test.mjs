import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { artKey, assetManifest, checkRegions, checkUpload, shapeAssets, SLOTS, slotOf, webpInfo } from "../src/assets.mjs";

const f = (n) => readFileSync(new URL(`./fixtures/assets/${n}`, import.meta.url));

test("WebP 헤더: 손실(VP8)·무손실(VP8L)·확장(VP8X, 알파) 크기 읽기, WebP 아니면 null", () => {
  assert.deepEqual(webpInfo(f("full_1080.webp")), { w: 1080, h: 1920, alpha: true, format: "VP8X" });
  assert.deepEqual(webpInfo(f("face.webp")), { w: 512, h: 512, alpha: true, format: "VP8L" });
  assert.deepEqual(webpInfo(f("tier_vp8.webp")), { w: 512, h: 512, alpha: false, format: "VP8" });
  assert.equal(webpInfo(new TextEncoder().encode("‰PNG not webp at all, padding padding")), null);
});

test("슬롯 58개(상세 14 표 + 티어 프레임 7), 규격: 엠블럼 512, 아이콘·숙련도 뱃지 256, 카드 관련 800×1120, 배경 2560×1440", () => {
  assert.equal(SLOTS.length, 58);
  assert.equal(new Set(SLOTS.map((s) => s.id)).size, 58);
  assert.deepEqual([slotOf("MASTERY_3").w, slotOf("MASTERY_3").h, slotOf("FRAME_LEGEND").w, slotOf("FRAME_LEGEND").h, slotOf("RARITY_EPIC")], [256, 256, 800, 1120, null]);
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

test("영역: 카드는 3:4(크기·위치 자유), 얼굴은 1:1·이미지 안, 512px 미만이면 경고", () => {
  const full = { w: 1440, h: 2560 };
  const r = checkRegions(full, { x: 0, y: 0.1, w: 1, h: 0.75 }, { x: 0.3, y: 0.05, w: 0.4, h: 0.225 });
  assert.deepEqual(r.warnings, []);
  assert.match(checkRegions(full, { x: 0, y: 0, w: 1, h: 0.75 }, { x: 0.3, y: 0.05, w: 0.2, h: 0.1125 }).warnings[0], /288px/);
  const small = checkRegions(full, { x: 0, y: 0, w: 0.4, h: 0.3 }, { x: 0.3, y: 0.05, w: 0.4, h: 0.225 });
  assert.match(small.warnings[0], /카드 영역 576×768px/);  // 720×960 미만이면 경고만(기획답변 22차)
  checkRegions(full, { x: 0.1, y: 0.05, w: 0.6, h: 0.45 }, { x: 0, y: 0, w: 0.4, h: 0.225 });  // 카드도 크기·위치 자유(3:4만)
  assert.throws(() => checkRegions(full, { x: 0.1, y: 0, w: 0.6, h: 0.6 }, { x: 0, y: 0, w: 0.4, h: 0.225 }), (e) => /3:4/.test(e.extra.detail));
  assert.throws(() => checkRegions(full, { x: 0.5, y: 0, w: 0.6, h: 0.45 }, { x: 0, y: 0, w: 0.4, h: 0.225 }), (e) => /밖/.test(e.extra.detail));
  assert.throws(() => checkRegions(full, { x: 0, y: 0.3, w: 1, h: 0.75 }, { x: 0, y: 0, w: 0.4, h: 0.225 }), (e) => /밖/.test(e.extra.detail));
  assert.throws(() => checkRegions(full, { x: 0, y: 0, w: 1, h: 0.75 }, { x: 0, y: 0, w: 0.4, h: 0.4 }), (e) => /1:1/.test(e.extra.detail));
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
  assert.deepEqual(m.art.AU["000"].card, { x: 0, y: 0, w: 1, h: 0.75 });
  assert.equal(m.art.AU["001"], undefined, "전신 없는 스킨은 내보내지 않음");
  assert.equal(m.art.AU["000"].bg, "CARD_BG_NEUTRAL", "진영 모르면 중립 배경");
  // 합본(기본 배경 사용 안 함): slot:ART_AU_000_COMBINED → art.AU.000.combined, bg = combined. 슬롯 목록엔 안 나옴
  const rows2 = { ...rows, "slot:ART_AU_000_COMBINED": { cur: { path: "art/AU_000_combined.c.webp", w: 1440, h: 2560, bytes: 7 } } };
  const sh2 = shapeAssets(rows2);
  assert.equal(sh2.slots.ART_AU_000_COMBINED, undefined);
  const m2 = assetManifest(sh2, { SUPABASE_URL: "https://p.supabase.co" }, { AU: "불" });
  assert.deepEqual([m2.art.AU["000"].bg, m2.art.AU["000"].combined.path], ["combined", "art/AU_000_combined.c.webp"]);
  assert.equal(assetManifest(shaped, { SUPABASE_URL: "x" }, { AU: "물" }).art.AU["000"].bg, "CARD_BG_WATER");
  assert.equal(artKey("SE", "001", "combined"), "slot:ART_SE_001_COMBINED");
  checkUpload("combined", webpInfo(f("full_1080.webp")), 10000);
});
