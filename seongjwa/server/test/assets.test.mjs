import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { artKey, assetManifest, cardTo57, checkMedia, checkRegions, checkUpload, LINE_SLOTS, mediaInfo, shapeAssets, SLOTS, slotOf, webpInfo } from "../src/assets.mjs";

const f = (n) => readFileSync(new URL(`./fixtures/assets/${n}`, import.meta.url));

test("WebP 헤더: 손실(VP8)·무손실(VP8L)·확장(VP8X, 알파) 크기 읽기, WebP 아니면 null", () => {
  assert.deepEqual(webpInfo(f("full_1080.webp")), { w: 1080, h: 1920, alpha: true, format: "VP8X" });
  assert.deepEqual(webpInfo(f("face.webp")), { w: 512, h: 512, alpha: true, format: "VP8L" });
  assert.deepEqual(webpInfo(f("tier_vp8.webp")), { w: 512, h: 512, alpha: false, format: "VP8" });
  assert.equal(webpInfo(new TextEncoder().encode("‰PNG not webp at all, padding padding")), null);
});

test("슬롯 67개(상세 14 표 + 티어 프레임 7 + 카드 일러스트 16 + 진영 문양 3, 종류 아이콘 7·진영 카드 배경 3 폐지), 규격: 엠블럼 512, 아이콘·숙련도 뱃지 256, 카드 관련 800×1120, 배경 2560×1440", () => {
  assert.equal(SLOTS.length, 67);  // KIND_* 7종 폐지(유형에너지텍스트), CARD_BG_불·물·바람 폐지(캐릭터등록단순화)
  assert.equal(new Set(SLOTS.map((s) => s.id)).size, 67);
  assert.deepEqual([slotOf("CARD_BG_FIRE"), slotOf("CARD_BG_NEUTRAL").w], [null, 800]);
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
  assert.equal(assetManifest({ art: { AU: { "000": sh } } }, { SUPABASE_URL: "x" }).art.AU["000"].combined, null, "다시 올릴 때까지 게임은 전신 임시");
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
  // 캐릭터등록단순화(2026-11-06): 스킨마다 full·thumb·combined·faceRectC·lines·skillAnim만. 옛 카드 영역·faceRect·얼굴 파일·배경 방식은 안 내보냄
  assert.deepEqual(Object.keys(m.art.AU["000"]).sort(), ["combined", "faceRectC", "full", "lines", "skillAnim", "thumb"]);
  assert.deepEqual([m.art.AU["000"].combined, m.art.AU["000"].faceRectC, m.art.AU["000"].skillAnim], [null, null, null], "합본 없으면 얼굴 영역도 없음(게임은 전신 임시)");
  assert.deepEqual(m.art.AU["000"].lines.map((l) => l.slot), LINE_SLOTS);
  assert.equal(m.art.AU["001"], undefined, "전신 없는 스킨은 내보내지 않음");
  // 합본: slot:ART_AU_000_COMBINED → art.AU.000.combined(슬롯 목록엔 안 나옴), 얼굴 영역 faceRectC는 합본이 있을 때만
  const rows2 = { ...rows, "slot:ART_AU_000_COMBINED": { cur: { path: "art/AU_000_combined.c.webp", w: 800, h: 1120, bytes: 7 } },
    "art:AU:000:regions": { cur: { card: { x: 0, y: 0, w: 1, h: 0.75 }, faceRect: { x: 0.3, y: 0.1, w: 0.2, h: 0.1125 }, faceRectC: { x: 0.25, y: 0.1, w: 0.5, h: 0.35714 } } },
    "art:AU:000:line_PICK": { cur: { text: "Let's dance." } }, "art:AU:000:voice_PICK": { cur: { path: "voice/AU_000_PICK.v.ogg", bytes: 9, format: "ogg" } },
    "art:AU:000:anim": { cur: { path: "anim/AU_000.a.webm", bytes: 99, format: "webm" } }, "slot:CARD_BG_FIRE": { cur: { path: "slots/CARD_BG_FIRE.x.webp" } } };
  const sh2 = shapeAssets(rows2);
  assert.equal(sh2.slots.ART_AU_000_COMBINED, undefined);
  const a2 = assetManifest(sh2, { SUPABASE_URL: "https://p.supabase.co" }).art.AU["000"];
  assert.deepEqual([a2.combined.path, a2.faceRectC.x], ["art/AU_000_combined.c.webp", 0.25]);
  assert.deepEqual(a2.lines.find((l) => l.slot === "PICK"), { slot: "PICK", text: "Let's dance.", voice: "https://p.supabase.co/storage/v1/object/public/assets/voice/AU_000_PICK.v.ogg" });
  assert.deepEqual(a2.lines.find((l) => l.slot === "WIN"), { slot: "WIN", text: "", voice: null }, "음성 없는 슬롯은 무음");
  assert.equal(a2.skillAnim.url, "https://p.supabase.co/storage/v1/object/public/assets/anim/AU_000.a.webm");
  assert.equal(assetManifest(sh2, { SUPABASE_URL: "x" }).slots.CARD_BG_FIRE, undefined, "폐지 슬롯은 표에 남아도 안 내보냄");
  assert.equal(artKey("SE", "001", "combined"), "slot:ART_SE_001_COMBINED");
  assert.throws(() => checkUpload("combined", webpInfo(f("full_1080.webp")), 10000), /asset_spec/);  // 9:16 합본은 이제 안 받음(5:7)
});

test("대사 음성·스킬 애니메이션 파일 검사(기획지시 2026-11-06 캐릭터등록단순화): ogg·mp3 / 투명 WebM, 권장 넘으면 경고만", () => {
  const pad = (head) => { const b = new Uint8Array(64); b.set(head); return b; };
  const ogg = mediaInfo(pad([...new TextEncoder().encode("OggS")])), mp3 = mediaInfo(pad([...new TextEncoder().encode("ID3")])), mp3b = mediaInfo(pad([0xff, 0xfb, 0x90]));
  const webm = mediaInfo(pad([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84, ...new TextEncoder().encode("webm")]));
  assert.deepEqual([ogg.format, mp3.format, mp3b.format, webm.format], ["ogg", "mp3", "mp3", "webm"]);
  assert.equal(mediaInfo(pad([0x1a, 0x45, 0xdf, 0xa3, ...new TextEncoder().encode("matroska")])), null, "webm 아닌 mkv");
  assert.equal(mediaInfo(f("face.webp")), null);
  assert.deepEqual(checkMedia("voice", ogg, 200 * 1024), []);
  assert.match(checkMedia("voice", mp3, 400 * 1024)[0], /권장 300KB/);
  assert.throws(() => checkMedia("voice", webm, 10), /asset_spec/);
  assert.throws(() => checkMedia("voice", ogg, 2 * 1024 * 1024), /asset_too_large/);
  assert.deepEqual(checkMedia("anim", webm, 2 * 1024 * 1024), []);
  assert.match(checkMedia("anim", webm, 5 * 1024 * 1024)[0], /권장 3072KB/);
  assert.throws(() => checkMedia("anim", webm, 9 * 1024 * 1024), /asset_too_large/);
  assert.throws(() => checkMedia("anim", ogg, 10), /asset_spec/);
  assert.equal(shapeAssets({ "art:AU:000:line_WIN": { cur: { text: "Gg" } }, "art:AU:000:voice_WIN": { cur: { path: "v.mp3" } } }).art.AU["000"].lines.WIN.voice.path, "v.mp3");
});
