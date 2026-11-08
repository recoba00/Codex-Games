// 캐릭터 보유·이번 주 무료(기획지시 2026-11-07 캐릭터입수·가격, 기획답변 88-89차, 총괄 11장 "캐릭터 입수")
// - 고정 6명: 계정에 영구 지급(인벤토리 CHAR_xx, ref base_characters). 튜토리얼이 생기기 전까지는 첫 조회 때 지급(= 튜토리얼 완료로 간주)
// - 로테이션 3명: 매주 월요일 05:00(KST) 바뀌는 무료 2명. 3주 순환 A/B/C, BO 설정(bo_config.char_rotation)의 시작 주차·주차별 지정이 우선
// - 픽 = 보유 + 이번 주 무료, 컵 등록 = 보유만, 밴 = 전체
import { rpc } from "./db.mjs";

export const ROTATION_DEFAULT = Object.freeze({
  start_week: "2026-11-02",  // A 주의 월요일(KST 날짜). 출시 주로 BO에서 바꾼다(기본 "출시 주 = A", 88-89차)
  cycle: [["IG", "TE"], ["TE", "SL"], ["SL", "IG"]],
  overrides: {}              // { "2026-11-16": ["SL", "TE"] } 주차별 지정(BO 예약)
});
const DAY = 864e5, WEEK = 7 * DAY, SHIFT = 4 * 3600e3;  // 월 05:00 KST = 월 00:00 UTC+4

const dayMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
// 그 시각이 속한 주의 키(월요일 KST 날짜)와 시작·끝 시각
export function weekOf(now) {
  const s = new Date(now + SHIFT);
  const mon = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - ((s.getUTCDay() + 6) % 7) * DAY;
  return { key: new Date(mon).toISOString().slice(0, 10), start: mon - SHIFT, end: mon - SHIFT + WEEK };
}

export function validRotation(v) {
  const ok = v && typeof v === "object" && /^\d{4}-\d{2}-\d{2}$/.test(v.start_week ?? "") && new Date(dayMs(v.start_week)).getUTCDay() === 1
    && Array.isArray(v.cycle) && v.cycle.length >= 1 && v.cycle.length <= 12 && v.cycle.every((w) => Array.isArray(w) && w.length <= 9 && w.every((c) => /^[A-Z]{2,3}$/.test(c)))
    && (v.overrides == null || (typeof v.overrides === "object" && Object.entries(v.overrides).every(([k, w]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && new Date(dayMs(k)).getUTCDay() === 1 && Array.isArray(w) && w.every((c) => /^[A-Z]{2,3}$/.test(c)))));
  if (!ok) throw new Error("value_invalid");
  return { start_week: v.start_week, cycle: v.cycle, overrides: v.overrides ?? {} };
}

const enabledIds = (data) => Object.keys(data.characters ?? {}).filter((id) => data.characters[id].enabled !== false);
export const rotationPool = (cfg) => [...new Set([...cfg.cycle.flat(), ...Object.values(cfg.overrides ?? {}).flat()])];
// 고정 지급 대상: 사용 중이고 유료 추가가 아니며 로테이션 풀에 없는 캐릭터
export function baseIds(data, cfg = ROTATION_DEFAULT) {
  const pool = rotationPool(cfg);
  return enabledIds(data).filter((id) => data.characters[id].offer !== "paid" && !pool.includes(id));
}

// 이번 주 무료: BO 주차 지정 → 순환. 데이터 설정값 rotation_free_count(기본 2)만큼, 사용 중인 캐릭터만
export function freeOf(data, cfg = ROTATION_DEFAULT, now = Date.now()) {
  const w = weekOf(now);
  const n = Number(data.settings?.rotation_free_count);
  const count = Number.isFinite(n) && n >= 0 ? n : 2;
  let list = cfg.overrides?.[w.key];
  if (!list) {
    const i = Math.round((dayMs(w.key) - dayMs(cfg.start_week)) / WEEK), len = cfg.cycle.length;
    list = cfg.cycle[((i % len) + len) % len];
  }
  const ok = enabledIds(data);
  return { week: w.key, until: new Date(w.end).toISOString(), free: list.filter((id) => ok.includes(id)).slice(0, count) };
}

let cfgCache = { at: 0, v: null };
export async function rotationCfg(env) {
  if (cfgCache.v && Date.now() - cfgCache.at < 60e3) return cfgCache.v;
  let v = ROTATION_DEFAULT;
  try { const c = await rpc(env, "bo_config_get", {}); if (c?.char_rotation?.value) v = validRotation(c.char_rotation.value); } catch { /* 기본 순환 */ }
  cfgCache = { at: Date.now(), v };
  return v;
}

// 계정별 보유(고정 6명은 없으면 지급) + 이번 주 무료. DB가 없거나 실패하면 null(= 제한 없음, 판 진행을 막지 않음)
export async function charsOf(env, accs, data, now = Date.now()) {
  const cfg = await rotationCfg(env);
  const f = freeOf(data, cfg, now);
  if (!accs.length || !env.SUPABASE_URL) return { ...f, owned: null };
  try { return { ...f, owned: await rpc(env, "characters_owned", { p_accounts: accs, p_base: baseIds(data, cfg) }) }; } catch { return { ...f, owned: null }; }
}

// 픽 가능 = 보유 + 이번 주 무료(사용 중인 캐릭터만)
export function availOf(data, owned, free) {
  if (!owned) return null;
  const ok = enabledIds(data);
  return ok.filter((id) => owned.includes(id) || free.includes(id));
}
