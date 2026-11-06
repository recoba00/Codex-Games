// 에셋 등록(상세 14 '에셋 등록'·'이미지 업로드·압축', 상세 10 규격, 기획답변 18·19차).
// 저장소: Supabase Storage 공개 버킷 `assets`(결제 수단 없는 무료 플랜). 파일명에 내용 해시를 붙여 바뀐 파일만 내려받는다.
// 데이터: 표 asset_files(키 slot:ID / art:캐릭터:스킨:full|thumb|face|regions). 데이터 버전과 분리 — 사람이 승인하면 바로 반영,
// 파일마다 직전 1개 보관·되돌리기(기획지시 2026-10-25 에셋분리).

export const BUCKET = "assets";
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;  // 이미지 서버 하드 상한(버킷 상한은 영상 때문에 8MB, 기획지시 2026-11-06 캐릭터등록단순화). 권장 상한은 설정값 asset_full_max_kb·asset_face_max_kb(경고)

// 전신(9:16, 권장 1440×2560·최소 1080×1920, 가로·세로 4의 배수), 밴픽용 축소본(긴 변 1024), 얼굴 파일(선택, 512×512)
export const ART = Object.freeze({
  full: { ratio: [9, 16], min: [1080, 1920], max: [1440, 2560], mult: 4, alpha: true },
  thumb: { exact: [576, 1024], alpha: true },
  face: { exact: [512, 512], alpha: true },
  card: { ratio: [5, 7] },        // 카드 영역 5:7 = 카드 본체 800×1120 전체(기획지시 2026-11-06 카드영역5대7, 이전 3:4 그림 창 폐기). 크기·위치 자유
  faceRect: { ratio: [1, 1], minPx: 512 },
  cardRect: { ratio: [5, 7], minPx: 800 },  // 출력 800×1120 미만이면 경고만
  combined: { ratio: [5, 7], size: [800, 1120], mult: 4 }  // 합본 = 진영 카드 배경과 같은 5:7·800×1120(기획지시 2026-11-06 합본규격변경, 이전 9:16 폐기)
});

// 슬롯 목록(상세 14 표, 규격은 상세 10 '슬롯 이미지 규격'·기획답변 18차). alpha: true = 투명 필요, false = 불투명, "corners" = 모서리만 투명
const S = (id, group, name, w, h, alpha) => ({ id, group, name, w, h, alpha });
const CARD = [800, 1120];
export const SLOTS = Object.freeze([
  ...["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "MASTER", "LEGEND"].map((t, i) =>
    S(`TIER_${t}`, "티어", `티어 엠블럼 ${["브론즈", "실버", "골드", "플래티넘", "다이아", "마스터", "레전드"][i]}`, 512, 512, true)),
  ...[1, 2, 3, 4].map((n) => S(`MASTERY_${n}`, "카드", `숙련도 뱃지 ${n}단계`, 256, 256, true)),  // 카드 우상단 뱃지 1:1(기획지시 숙련도뱃지)
  ...[["BRONZE", "브론즈"], ["SILVER", "실버"], ["GOLD", "골드"], ["PLATINUM", "플래티넘"], ["DIAMOND", "다이아"], ["MASTER", "마스터"], ["LEGEND", "레전드"]]
    .map(([k, n]) => S(`FRAME_${k}`, "카드", `티어 프레임 ${n}`, 928, 1248, true)),  // 카드 프레임 = 현재 티어(LoL식 정리). 본체보다 상하좌우 64px 큼(기획지시 프레임여백)
  // 카드 종류 아이콘 KIND_* 7종은 폐지(기획지시 2026-11-01 유형에너지텍스트): 유형·비용은 게임이 텍스트 뱃지로 그린다
  // 진영 카드 배경 불·물·바람은 폐지(기획지시 2026-11-06 캐릭터등록단순화: 캐릭터 카드는 합본만). 중립은 공용 전투카드 대체 배경으로 유지
  S("CARD_BG_NEUTRAL", "카드", "카드 배경 중립", ...CARD, "corners"),
  S("CARD_FRAME", "카드", "전투카드 틀", ...CARD, true), S("CARD_BACK", "카드", "카드 뒷면", ...CARD, "corners"),
  // 공용 전투카드 일러스트(기획지시 2026-10-29 전투카드일러): 카드 ID와 같은 번호, 불투명, 글자 없음. 없으면 게임이 CARD_BG_NEUTRAL + 유형 글자로 대체
  ...Array.from({ length: 16 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`).map((id) => S(`CARD_ART_${id}`, "카드 일러스트", `카드 일러스트 ${id}`, ...CARD, false)),  // 별도 묶음(기획답변 28차)
  S("SKILL_FRAME_PASSIVE", "카드", "스킬 아이콘 프레임 패시브", 256, 256, true), S("SKILL_FRAME_ACTIVE", "카드", "스킬 아이콘 프레임 액티브", 256, 256, true),
  ...[["BANNED", "밴됨"], ["LOCKED", "잠긴 스킨"], ["OPP_PICK", "상대 선택"]].map(([k, n]) => S(`OVERLAY_${k}`, "카드", `상태 오버레이 ${n}`, ...CARD, true)),
  ...[["SHIELD", "실드"], ["SILENCE", "침묵"], ["IMMUNE", "면역"], ["WEAKEN", "약화"], ["ATK_UP", "공격 강화"], ["BURN", "작열"], ["MARK", "표식"],
    ["HAND_SEAL", "손패 봉인"], ["TIDE", "조류"], ["SKILL_LOCK", "스킬 봉쇄"], ["ENERGY_DOWN", "에너지 감소"]].map(([k, n]) => S(`STATUS_${k}`, "아이콘", `상태 아이콘 ${n}`, 256, 256, true)),
  ...["SP01", "SP02", "SP03", "SP04", "SP05", "SP06", "SP07", "SP08"].map((id) => S(`SPELL_${id}`, "아이콘", `스펠 아이콘 ${id}`, 256, 256, true)),
  S("CURRENCY_GOLD", "아이콘", "재화 골드", 256, 256, true),
  // 진영 문양(아이콘): 패시브 스킬 아이콘 가운데·진영 필터 칩·진영 표시(기획지시 2026-10-30 진영문양). 홀로 키트의 '진영 문양 포일'(셰이더 재료)과 별개
  ...[["FIRE", "불"], ["WATER", "물"], ["WIND", "바람"]].map(([k, n]) => S(`FACTION_${k}`, "아이콘", `진영 문양(아이콘) ${n}`, 256, 256, true)),
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
  if (kind === "combined") {  // 합본 5:7, 가로·세로 4의 배수(백오피스가 800×1120으로 줄여 올림). 투명은 경고만(화면 쪽)
    const c = ART.combined;
    if (info.w * c.ratio[1] !== info.h * c.ratio[0]) throw bad(`합본은 5:7(800×1120) (올린 파일 ${info.w}×${info.h})`);
    if (info.w % c.mult || info.h % c.mult) throw bad("합본 가로·세로는 4의 배수");
    if (info.w > c.size[0]) throw bad(`합본은 ${c.size.join("×")}까지 (올린 파일 ${info.w}×${info.h})`);
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
const round = (r) => Object.fromEntries(["x", "y", "w", "h"].map((k) => [k, Math.round(r[k] * 1e5) / 1e5]));
// 합본에서 고른 얼굴 영역(1:1, 합본 이미지 기준 비율 좌표)
export function checkFaceOn(img, face, label = "합본") {
  const bad = (msg) => Object.assign(new Error("asset_region"), { extra: { detail: msg } });
  if (!(face && ["x", "y", "w", "h"].every((k) => Number.isFinite(face[k]) && face[k] >= 0 && face[k] <= 1))) throw bad("좌표는 0~1 비율 x·y·w·h");
  if (Math.abs(face.w * img.w - face.h * img.h) > 2) throw bad(`${label} 얼굴 영역 비율 1:1`);
  if (face.x + face.w > 1.002 || face.y + face.h > 1.002) throw bad(`${label} 얼굴 영역이 이미지 밖`);
  const px = Math.round(face.w * img.w);
  return { face: round(face), warnings: px < ART.faceRect.minPx ? [`${label} 얼굴 영역 ${px}px — 출력 512px보다 작아 흐릴 수 있음(상세 10)`] : [] };
}
export function checkRegions(full, card, face) {
  const bad = (msg) => Object.assign(new Error("asset_region"), { extra: { detail: msg } });
  const num = (r) => r && ["x", "y", "w", "h"].every((k) => Number.isFinite(r[k]) && r[k] >= 0 && r[k] <= 1);
  if (!num(card) || !num(face)) throw bad("좌표는 0~1 비율 x·y·w·h");
  const eps = 0.002;
  const W = full.w, H = full.h;
  if (Math.abs(card.h * H - (card.w * W * 7) / 5) > 2) throw bad("카드 영역 비율 5:7");
  if (card.x + card.w > 1 + eps || card.y + card.h > 1 + eps) throw bad("카드 영역이 이미지 밖");
  if (Math.abs(face.w * W - face.h * H) > 2) throw bad("얼굴 영역 비율 1:1");
  if (face.x + face.w > 1 + eps || face.y + face.h > 1 + eps) throw bad("얼굴 영역이 이미지 밖");
  const warnings = [];
  if (card.w * W < ART.cardRect.minPx) warnings.push(`카드 영역 ${Math.round(card.w * W)}×${Math.round(card.h * H)}px — 출력 800×1120px보다 작아 흐릴 수 있음(상세 10)`);
  if (face.w * W < ART.faceRect.minPx) warnings.push(`얼굴 영역 ${Math.round(face.w * W)}px — 출력 512px보다 작아 흐릴 수 있음(상세 10)`);
  return { card: round(card), face: round(face), warnings };
}

export const assetPath = (prefix, hashHex, ext = "webp") => `${prefix}.${hashHex.slice(0, 16)}.${ext}`;
export const publicBase = (env) => `${String(env.SUPABASE_URL ?? "").replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/`;

// Supabase Storage 업로드(서비스 키, 서버 전용). 같은 이름이면 덮어씀(이름이 내용 해시라 내용도 같음)
// 버킷 파일 지우기(서비스 키). 에셋 표가 가리키지 않는 파일 정리용(크론)
export async function storageDelete(env, names, fetcher = fetch) {
  if (!names.length) return 0;
  const key = String(env.SUPABASE_SERVICE_KEY ?? "");
  const headers = { apikey: key, "content-type": "application/json" };
  if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`;
  const res = await fetcher(`${String(env.SUPABASE_URL).replace(/\/$/, "")}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers, body: JSON.stringify({ prefixes: names }) });
  if (!res.ok) throw Object.assign(new Error("storage_failed"), { extra: { status: res.status } });
  return names.length;
}

export async function storagePut(env, path, bytes, fetcher = fetch, type = "image/webp") {
  const key = String(env.SUPABASE_SERVICE_KEY ?? "");
  const headers = { apikey: key, "content-type": type, "x-upsert": "true", "cache-control": "max-age=31536000" };
  if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`;  // 새 비밀 키(sb_secret_)는 apikey 헤더만(db.mjs와 같음)
  const res = await fetcher(`${String(env.SUPABASE_URL).replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers, body: bytes });
  if (!res.ok) throw Object.assign(new Error("storage_failed"), { extra: { status: res.status, detail: (await res.text().catch(() => "")).slice(0, 200) } });
}

// 대사 음성·스킬 애니메이션(기획지시 2026-11-06 캐릭터등록단순화). 대사 슬롯 5개, 텍스트는 영문(화면 표시 없음)
export const LINE_SLOTS = Object.freeze(["ACTIVE_01", "ACTIVE_02", "PICK", "WIN", "LOSE"]);
export const MEDIA = Object.freeze({
  voice: { maxBytes: 1024 * 1024, warnBytes: 300 * 1024, warnSec: 2, formats: { ogg: "audio/ogg", mp3: "audio/mpeg" } },  // 가안 ogg·모노·2초·300KB(초과 경고만), 하드 상한 1MB
  anim: { maxBytes: 8 * 1024 * 1024, warnBytes: 3 * 1024 * 1024, warnSec: 2, formats: { webm: "video/webm" } }      // 투명 WebM(VP9 알파), 하드 8MB·권장 3MB 이하
});
// 소리·영상 파일 머리 확인: ogg("OggS"), mp3(ID3 또는 프레임 동기 0xFFE), webm(EBML 1A45DFA3 + doctype webm). 아니면 null
export function mediaInfo(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length < 16) return null;
  const s4 = String.fromCharCode(...b.subarray(0, 4));
  if (s4 === "OggS") return { format: "ogg", mime: "audio/ogg" };
  if (String.fromCharCode(...b.subarray(0, 3)) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { format: "mp3", mime: "audio/mpeg" };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    const head = String.fromCharCode(...b.subarray(0, Math.min(64, b.length)));
    return head.includes("webm") ? { format: "webm", mime: "video/webm" } : null;
  }
  return null;
}
export function checkMedia(kind, info, bytes) {
  const m = MEDIA[kind];
  if (!m) throw new Error("asset_kind_invalid");
  if (!info || !m.formats[info.format]) throw Object.assign(new Error("asset_spec"), { extra: { detail: kind === "voice" ? "음성은 ogg 또는 mp3" : "스킬 애니메이션은 투명 WebM(VP9 알파)" } });
  if (bytes > m.maxBytes) throw new Error("asset_too_large");
  return bytes > m.warnBytes ? [`${kind === "voice" ? "음성" : "스킬 애니메이션"} ${Math.round(bytes / 1024)}KB — 권장 ${Math.round(m.warnBytes / 1024)}KB 이하(경고만)`] : [];
}

export const slotKey = (id) => `slot:${id}`;
// 표 키 규칙상 slot 이름공간에 두는 스킨별 값: 합본 이미지 slot:ART_<캐릭터>_<스킨>_COMBINED, 배경 방식 slot:ART_<캐릭터>_<스킨>_BG({mode, color})
export const artKey = (ch, skin, kind) => (kind === "combined" ? `slot:ART_${ch}_${skin}_COMBINED` : kind === "bg" ? `slot:ART_${ch}_${skin}_BG` : `art:${ch}:${skin}:${kind}`);
const ART_SLOT_RE = /^ART_([A-Z]{2,3})_(\d{3})_(COMBINED|BG)$/;
// 옛 3:4 카드 영역 → 5:7(기획지시 2026-11-06 카드영역5대7): 같은 중심·가로폭, 이미지 밖이면 안쪽으로 밀어 넣음(넘치면 폭을 줄임)
export function cardTo57(card, W, H) {
  if (!card || !W || !H) return card ?? null;
  if (Math.abs(card.h * H - (card.w * W * 7) / 5) <= 2) return card;  // 이미 5:7
  let w = card.w, h = (w * W * 7) / 5 / H;
  if (h > 1) { h = 1; w = (H * 5) / 7 / W; }
  const cx = card.x + card.w / 2, cy = card.y + card.h / 2;
  const cl = (v, hi) => Math.min(Math.max(v, 0), Math.max(0, hi));
  const r = (v) => Math.round(v * 1e5) / 1e5;
  return { x: r(cl(cx - w / 2, 1 - w)), y: r(cl(cy - h / 2, 1 - h)), w: r(w), h: r(h) };
}
const is57 = (f) => f && f.w && f.h && f.w * 7 === f.h * 5;

// asset_list() 결과 → { slots: {ID: 파일}, art: {캐릭터: {스킨: {full, thumb, face, card, faceRect}}} } (pick = "cur" | "prev")
export function shapeAssets(rows = {}, pick = "cur") {
  const slots = {}, art = {};
  for (const [key, r] of Object.entries(rows)) {
    const v = r?.[pick];
    if (!v) continue;
    const p = key.split(":");
    const cm = p[0] === "slot" ? p[1].match(ART_SLOT_RE) : null;
    if (cm) ((art[cm[1]] ??= {})[cm[2]] ??= {})[cm[3] === "BG" ? "bgOpt" : "combined"] = v;
    else if (p[0] === "slot") slots[p[1]] = v;
    else if (p[0] === "art") {
      const s = ((art[p[1]] ??= {})[p[2]] ??= {});
      if (p[3] === "regions") { if (v.card) s.card = v.card; if (v.faceRect) s.faceRect = v.faceRect; if (v.faceRectC) s.faceRectC = v.faceRectC; if (v.faceFrom) s.faceFrom = v.faceFrom; }
      else if (p[3].startsWith("line_")) (s.lines ??= {})[p[3].slice(5)] = { ...(s.lines?.[p[3].slice(5)] ?? {}), text: String(v.text ?? "") };
      else if (p[3].startsWith("voice_")) (s.lines ??= {})[p[3].slice(6)] = { ...(s.lines?.[p[3].slice(6)] ?? {}), voice: v };
      else s[p[3]] = v;
    }
  }
  for (const skins of Object.values(art)) for (const s of Object.values(skins)) {
    if (s.card && s.full) s.card = cardTo57(s.card, s.full.w, s.full.h);
    // 옛 9:16 합본은 쓰지 않음(다시 올릴 때까지 진영 기본 배경, 기획지시 합본규격변경 5). 백오피스 안내용으로 combinedOld에 둔다
    if (s.combined && !is57(s.combined)) { s.combinedOld = s.combined; delete s.combined; }
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
  const slots = Object.fromEntries(Object.entries(shaped?.slots ?? {}).filter(([k]) => slotOf(k)).map(([k, f]) => [k, file(f)]).filter(([, f]) => f));  // 폐지한 슬롯(진영 카드 배경 등)은 표에 남아도 내보내지 않음
  const art = {};
  for (const [ch, skins] of Object.entries(shaped?.art ?? {})) {
    for (const [skin, a] of Object.entries(skins)) {
      if (!a.full) continue;  // 전신이 없는 스킨은 내보내지 않음
      // 기획지시 2026-11-06 캐릭터등록단순화: 카드 그림 = 합본(없으면 게임이 전신을 임시로), 얼굴 = 합본 faceRectC만.
      // 옛 값(배경 방식·컬러·카드 영역·faceRect·faceFrom·얼굴 파일)은 표에 남겨 두고(되돌리기용) 내보내지 않는다
      (art[ch] ??= {})[skin] = { full: file(a.full), thumb: file(a.thumb), combined: file(a.combined), faceRectC: a.combined ? a.faceRectC ?? null : null,
        lines: LINE_SLOTS.map((slot) => ({ slot, text: a.lines?.[slot]?.text ?? "", voice: file(a.lines?.[slot]?.voice)?.url ?? null })),
        skillAnim: a.anim?.path ? { url: base + a.anim.path, bytes: a.anim.bytes, format: a.anim.format ?? "webm" } : null };
    }
  }
  return { base, slots, art };
}
