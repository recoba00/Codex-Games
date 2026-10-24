import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assetManifest, checkRegions, checkUpload, SLOTS, slotOf, webpInfo } from "../src/assets.mjs";

const f = (n) => readFileSync(new URL(`./fixtures/assets/${n}`, import.meta.url));

test("WebP 헤더: 손실(VP8)·무손실(VP8L)·확장(VP8X, 알파) 크기 읽기, WebP 아니면 null", () => {
  assert.deepEqual(webpInfo(f("full_1080.webp")), { w: 1080, h: 1920, alpha: true, format: "VP8X" });
  assert.deepEqual(webpInfo(f("face.webp")), { w: 512, h: 512, alpha: true, format: "VP8L" });
  assert.deepEqual(webpInfo(f("tier_vp8.webp")), { w: 512, h: 512, alpha: false, format: "VP8" });
  assert.equal(webpInfo(new TextEncoder().encode("‰PNG not webp at all, padding padding")), null);
});

test("슬롯 51개(상세 14 표), 규격: 엠블럼 512, 아이콘 256, 카드 관련 800×1120, 배경 2560×1440", () => {
  assert.equal(SLOTS.length, 51);
  assert.equal(new Set(SLOTS.map((s) => s.id)).size, 51);
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
  checkRegions(full, { x: 0.1, y: 0.05, w: 0.6, h: 0.45 }, { x: 0, y: 0, w: 0.4, h: 0.225 });  // 카드도 크기·위치 자유(3:4만)
  assert.throws(() => checkRegions(full, { x: 0.1, y: 0, w: 0.6, h: 0.6 }, { x: 0, y: 0, w: 0.4, h: 0.225 }), (e) => /3:4/.test(e.extra.detail));
  assert.throws(() => checkRegions(full, { x: 0.5, y: 0, w: 0.6, h: 0.45 }, { x: 0, y: 0, w: 0.4, h: 0.225 }), (e) => /밖/.test(e.extra.detail));
  assert.throws(() => checkRegions(full, { x: 0, y: 0.3, w: 1, h: 0.75 }, { x: 0, y: 0, w: 0.4, h: 0.225 }), (e) => /밖/.test(e.extra.detail));
  assert.throws(() => checkRegions(full, { x: 0, y: 0, w: 1, h: 0.75 }, { x: 0, y: 0, w: 0.4, h: 0.4 }), (e) => /1:1/.test(e.extra.detail));
});

test("클라이언트 목록: 공개 주소 + 해시 이름, 없는 슬롯은 빠짐(내장 기본 이미지)", () => {
  const data = { tables: { assets: { slots: { TIER_GOLD: { path: "slots/TIER_GOLD.abc.webp", w: 512, h: 512, bytes: 10 } } },
    art: { AU: { "000": { full: { path: "art/AU_000_full.x.webp", w: 1440, h: 2560, bytes: 9 }, card: { x: 0, y: 0, w: 1, h: 0.75 } } } } } };
  const m = assetManifest(data, { SUPABASE_URL: "https://p.supabase.co/" });
  assert.equal(m.slots.TIER_GOLD.url, "https://p.supabase.co/storage/v1/object/public/assets/slots/TIER_GOLD.abc.webp");
  assert.equal(m.art.AU["000"].face, null);
  assert.deepEqual(m.art.AU["000"].card, { x: 0, y: 0, w: 1, h: 0.75 });
});
