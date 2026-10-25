// 에셋 등록(상세 14 '에셋 등록'·'이미지 업로드·압축', 상세 10 규격, 기획답변 18·19차).
// 저장소: Supabase Storage 공개 버킷 `assets`(결제 수단 없는 무료 플랜). 파일명에 내용 해시를 붙여 바뀐 파일만 내려받는다.
// 데이터: 표 asset_files(키 slot:ID / art:캐릭터:스킨:full|thumb|face|regions). 데이터 버전과 분리 — 사람이 승인하면 바로 반영,
// 파일마다 직전 1개 보관·되돌리기(기획지시 2026-10-25 에셋분리).

export const BUCKET = "assets";
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;  // 서버 하드 상한(버킷 상한과 같음). 권장 상한은 설정값 asset_full_max_kb·asset_face_max_kb(경고)

// 전신(9:16, 권장 1440×2560·최소 1080×1920, 가로·세로 4의 배수), 밴픽용 축소본(긴 변 1024), 얼굴 파일(선택, 512×512)
export const ART = Object.freeze({
  full: { ratio: [9, 16], min: [1080, 1920], max: [1440, 2560], mult: 4, alpha: true },
  thumb: { exact: [576, 1024], alpha: true },
  face: { exact: [512, 512], alpha: true },
  card: { ratio: [3, 4] },        // 카드 그림 창 영역: 3:4, 크기·위치는 얼굴처럼 자유(사용자 결정 2026-10-24)
  faceRect: { ratio: [1, 1], minPx: 512 },
  cardRect: { ratio: [3, 4], minPx: 720 }  // 카드 그림 창 출력 720×960(기획답변 22차, 가정값). 작으면 경고만
});

// 슬롯 목록(상세 14 표, 규격은 상세 10 '슬롯 이미지 규격'·기획답변 18차). alpha: true = 투명 필요, false = 불투명, "corners" = 모서리만 투명
const S = (id, group, name, w, h, alpha) => ({ id, group, name, w, h, alpha });
const CARD = [800, 1120];
export const SLOTS = Object.freeze([
  ...["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "MASTER", "LEGEND"].map((t, i) =>
    S(`TIER_${t}`, "티어", `티어 엠블럼 ${["브론즈", "실버", "골드", "플래티넘", "다이아", "마스터", "레전드"][i]}`, 512, 512, true)),
  ...[["COMMON", "일반"], ["RARE", "희귀"], ["EPIC", "영웅"], ["LEGEND", "전설"]].map(([k, n]) => S(`RARITY_${k}`, "카드", `등급 테두리 ${n}`, ...CARD, true)),
  ...[["IMMUNE", "면역"], ["DEFENSE", "방어"], ["COUNTER", "반격"], ["SILENCE", "침묵"], ["DISRUPT", "방해"], ["SKILL", "스킬"], ["ATTACK", "공격"]]
    .map(([k, n]) => S(`KIND_${k}`, "카드", `카드 종류 아이콘 ${n}`, 256, 256, true)),
  ...[["FIRE", "불"], ["WATER", "물"], ["WIND", "바람"], ["NEUTRAL", "중립"]].map(([k, n]) => S(`CARD_BG_${k}`, "카드", `카드 배경 ${n}`, ...CARD, "corners")),
  S("CARD_FRAME", "카드", "전투카드 틀", ...CARD, true), S("CARD_BACK", "카드", "카드 뒷면", ...CARD, "corners"),
  S("SKILL_FRAME_PASSIVE", "카드", "스킬 아이콘 프레임 패시브", 256, 256, true), S("SKILL_FRAME_ACTIVE", "카드", "스킬 아이콘 프레임 액티브", 256, 256, true),
  ...[["BANNED", "밴됨"], ["LOCKED", "잠긴 스킨"], ["OPP_PICK", "상대 선택"]].map(([k, n]) => S(`OVERLAY_${k}`, "카드", `상태 오버레이 ${n}`, ...CARD, true)),
  ...[["SHIELD", "실드"], ["SILENCE", "침묵"], ["IMMUNE", "면역"], ["WEAKEN", "약화"], ["ATK_UP", "공격 강화"], ["BURN", "작열"], ["MARK", "표식"],
    ["HAND_SEAL", "손패 봉인"], ["TIDE", "조류"], ["SKILL_LOCK", "스킬 봉쇄"], ["ENERGY_DOWN", "에너지 감소"]].map(([k, n]) => S(`STATUS_${k}`, "아이콘", `상태 아이콘 ${n}`, 256, 256, true)),
  ...["SP01", "SP02", "SP03", "SP04", "SP05", "SP06", "SP07", "SP08"].map((id) => S(`SPELL_${id}`, "아이콘", `스펠 아이콘 ${id}`, 256, 256, true)),
  S("CURRENCY_GOLD", "아이콘", "재화 골드", 256, 256, true),
  S("BG_LOBBY", "배경", "로비 배경", 2560, 1440, false), S("BG_BATTLE", "배경", "전투 배경", 2560, 1440, false)
]);
export const slotOf = (id) => SLOTS.find((s) => s.id === id) ?? null;

// WebP 헤더에서 크기·알파 읽기(VP8 손실, VP8L 무손실, VP8X 확장). 아니면 null
export function webpInfo(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const str = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  if (b.length < 30 || str(0, 4) !== "RIFF" || str(8, 4) !== "WEBP") return null;
  const chunk = str(12, 4);
  const u24 = (o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
  if (chunk === "VP8X") return { w: u24(24) + 1, h: u24(27) + 1, alpha: Boolean(b[20] & 0x10), format: "VP8X" };
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1, alpha: Boolean((bits >>> 28) & 1), format: "VP8L" };
  }
  if (chunk === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff, alpha: false, format: "VP8" };
  }
  return null;
}

// 업로드한 파일이 그 자리 규격에 맞는지(서버 쪽 최종 검사. 투명·화질은 백오피스 화면이 먼저 본다)
export function checkUpload(kind, info, bytes, slot = null) {
  if (!info) throw new Error("asset_not_webp");
  if (bytes > MAX_UPLOAD_BYTES) throw new Error("asset_too_large");
  const bad = (msg) => Object.assign(new Error("asset_spec"), { extra: { detail: msg } });
  if (kind === "slot") {
    if (!slot) throw new Error("asset_slot_invalid");
    if (info.w !== slot.w || info.h !== slot.h) throw bad(`${slot.id}: ${slot.w}×${slot.h}이어야 함 (올린 파일 ${info.w}×${info.h})`);
    return;
  }
  if (kind === "full") {
    const s = ART.full;
    if (info.w * s.ratio[1] !== info.h * s.ratio[0]) throw bad(`전신은 9:16 (올린 파일 ${info.w}×${info.h})`);
    if (info.w < s.min[0] || info.w > s.max[0]) throw bad(`전신 너비 ${s.min[0]}~${s.max[0]} (올린 파일 ${info.w})`);
    if (info.w % s.mult || info.h % s.mult) throw bad("전신 가로·세로는 4의 배수");
    return;
  }
  const ex = ART[kind]?.exact;
  if (!ex) throw new Error("asset_kind_invalid");
  if (info.w !== ex[0] || info.h !== ex[1]) throw bad(`${kind}: ${ex[0]}×${ex[1]}이어야 함 (올린 파일 ${info.w}×${info.h})`);
}

// 영역 좌표 검사(0~1 비율). 카드: 3:4·이미지 안(크기·위치 자유, 사용자 결정 2026-10-24), 얼굴: 1:1·이미지 안. 얼굴 영역이 512px 미만이면 경고
export function checkRegions(full, card, face) {
  const bad = (msg) => Object.assign(new Error("asset_region"), { extra: { detail: msg } });
  const num = (r) => r && ["x", "y", "w", "h"].every((k) => Number.isFinite(r[k]) && r[k] >= 0 && r[k] <= 1);
  if (!num(card) || !num(face)) throw bad("좌표는 0~1 비율 x·y·w·h");
  const eps = 0.002;
  const W = full.w, H = full.h;
  if (Math.abs(card.h * H - (card.w * W * 4) / 3) > 2) throw bad("카드 영역 비율 3:4");
  if (card.x + card.w > 1 + eps || card.y + card.h > 1 + eps) throw bad("카드 영역이 이미지 밖");
  if (Math.abs(face.w * W - face.h * H) > 2) throw bad("얼굴 영역 비율 1:1");
  if (face.x + face.w > 1 + eps || face.y + face.h > 1 + eps) throw bad("얼굴 영역이 이미지 밖");
  const round = (r) => Object.fromEntries(["x", "y", "w", "h"].map((k) => [k, Math.round(r[k] * 1e5) / 1e5]));
  const warnings = [];
  if (card.w * W < ART.cardRect.minPx) warnings.push(`카드 영역 ${Math.round(card.w * W)}×${Math.round(card.h * H)}px — 출력 720×960px보다 작아 흐릴 수 있음(상세 10)`);
  if (face.w * W < ART.faceRect.minPx) warnings.push(`얼굴 영역 ${Math.round(face.w * W)}px — 출력 512px보다 작아 흐릴 수 있음(상세 10)`);
  return { card: round(card), face: round(face), warnings };
}

export const assetPath = (prefix, hashHex) => `${prefix}.${hashHex.slice(0, 16)}.webp`;
export const publicBase = (env) => `${String(env.SUPABASE_URL ?? "").replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/`;

// Supabase Storage 업로드(서비스 키, 서버 전용). 같은 이름이면 덮어씀(이름이 내용 해시라 내용도 같음)
export async function storagePut(env, path, bytes, fetcher = fetch) {
  const key = String(env.SUPABASE_SERVICE_KEY ?? "");
  const headers = { apikey: key, "content-type": "image/webp", "x-upsert": "true", "cache-control": "max-age=31536000" };
  if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`;  // 새 비밀 키(sb_secret_)는 apikey 헤더만(db.mjs와 같음)
  const res = await fetcher(`${String(env.SUPABASE_URL).replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers, body: bytes });
  if (!res.ok) throw Object.assign(new Error("storage_failed"), { extra: { status: res.status, detail: (await res.text().catch(() => "")).slice(0, 200) } });
}

export const slotKey = (id) => `slot:${id}`;
export const artKey = (ch, skin, kind) => `art:${ch}:${skin}:${kind}`;

// asset_list() 결과 → { slots: {ID: 파일}, art: {캐릭터: {스킨: {full, thumb, face, card, faceRect}}} } (pick = "cur" | "prev")
export function shapeAssets(rows = {}, pick = "cur") {
  const slots = {}, art = {};
  for (const [key, r] of Object.entries(rows)) {
    const v = r?.[pick];
    if (!v) continue;
    const p = key.split(":");
    if (p[0] === "slot") slots[p[1]] = v;
    else if (p[0] === "art") {
      const s = ((art[p[1]] ??= {})[p[2]] ??= {});
      if (p[3] === "regions") { if (v.card) s.card = v.card; if (v.faceRect) s.faceRect = v.faceRect; } else s[p[3]] = v;
    }
  }
  return { slots, art };
}

// 지금 쓰는 에셋(워커 안 60초 캐시, 백오피스에서 바꾸면 그 워커는 바로 비움)
let cache = null;
export async function loadAssets(env, rpcFn, { fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < Number(env.LIVE_TTL_MS ?? 60000)) return cache;
  const rows = await rpcFn(env, "asset_list", {});
  const shaped = shapeAssets(rows);
  const json = JSON.stringify(shaped);
  const rev = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json)))].slice(0, 8).map((x) => x.toString(16).padStart(2, "0")).join("");
  cache = { at: Date.now(), rows, shaped, rev };
  return cache;
}
export const dropAssetCache = () => { cache = null; };

// 게임 클라이언트용 목록(전체 주소 + 해시 이름). 없는 슬롯은 게임 내장 기본 이미지를 쓴다. rev = 목록 내용 해시
export function assetManifest(shaped, env) {
  const base = publicBase(env);
  const file = (f) => (f?.path ? { url: base + f.path, path: f.path, w: f.w, h: f.h, bytes: f.bytes } : null);
  const slots = Object.fromEntries(Object.entries(shaped?.slots ?? {}).map(([k, f]) => [k, file(f)]).filter(([, f]) => f));
  const art = {};
  for (const [ch, skins] of Object.entries(shaped?.art ?? {})) {
    for (const [skin, a] of Object.entries(skins)) {
      if (!a.full) continue;  // 전신이 없는 스킨은 내보내지 않음
      (art[ch] ??= {})[skin] = { full: file(a.full), thumb: file(a.thumb), face: file(a.face), card: a.card ?? null, faceRect: a.faceRect ?? null };
    }
  }
  return { base, slots, art };
}
