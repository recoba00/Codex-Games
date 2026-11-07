// 상점 판매 규칙(LoL식 정리 2026-10-29, 상세 06·07): 별도 유료 재화 없음.
// 스킨·홀로 업그레이드 = 현금 전용, 캐릭터 = 골드 전용, 감정표현·카드 뒷면 = 골드·현금(기획지시 2026-11-07 캐릭터입수·가격), 프레임 = 판매 안 함(현재 티어 자동 표시)
const CASH_ONLY = new Set(["skin", "skin_premium", "skin_limited", "holo"]);
const GOLD_ONLY = new Set(["character"]);
export function offerRule(kind, offer) {
  if (!kind) throw new Error("item_not_found");
  const gold = Number(offer?.price_gold) > 0, cash = Number(offer?.price_krw) > 0;
  if (kind === "frame") throw new Error("offer_frame_not_sold");
  if (CASH_ONLY.has(kind) && gold) throw new Error("offer_cash_only");
  if (GOLD_ONLY.has(kind) && cash) throw new Error("offer_gold_only");
  if (GOLD_ONLY.has(kind) && !gold) throw new Error("price_required");
  return true;
}
