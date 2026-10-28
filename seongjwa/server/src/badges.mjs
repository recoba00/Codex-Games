// 카드 프레임 = 현재 티어(LoL식 정리 2026-10-29, 총괄 4·13장): 브론즈~레전드 7종 자동, 장착·판매 없음. 홀로 연출 = 지난 시즌 최고 티어로 정해진 계정 속성(0~4).
// 슬롯 FRAME_BRONZE … FRAME_LEGEND(상세 10). 상대에게는 픽 공개 뒤에만 보낸다(숙련도 뱃지와 같은 규칙).
import { legendCount, seasonStart, tiersOf } from "./rank.mjs";

const GROUP = { "브론즈": "BRONZE", "실버": "SILVER", "골드": "GOLD", "플래티넘": "PLATINUM", "다이아": "DIAMOND", "마스터": "MASTER" };
export const FRAME_KEYS = ["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "MASTER", "LEGEND"];

export function masterTierNo(data) {
  try { return tiersOf(data).tiers.find((t) => String(t.name).startsWith("마스터"))?.no ?? 16; } catch { return 16; }
}

// b = badges_get 한 계정 값 { cur, prev, masterRank, masters, holo }. 반환 { frame: "GOLD", tier, holo }
export function frameOf(data, b) {
  let tiers = [];
  try { tiers = tiersOf(data).tiers; } catch { /* 랭크 표 없음 → 브론즈 */ }
  const tier = Number(b?.cur?.tier_no ?? (tiers.length ? seasonStart(data, b?.prev ?? null).tier : 1));
  const name = String(tiers.find((t) => t.no === tier)?.name ?? "브론즈");
  const legend = tier >= masterTierNo(data) && Number(b?.masterRank ?? 0) > 0 && Number(b.masterRank) <= legendCount(data, Number(b.masters ?? 0));
  return { frame: legend ? "LEGEND" : GROUP[name.split(" ")[0]] ?? "BRONZE", tier, holo: b?.holo ?? null };
}
