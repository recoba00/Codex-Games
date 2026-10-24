// 시즌 보상·랭크 로드(상세 08). 순수 함수 + 크론에서 쓰는 지급 설정 만들기.
// 시즌 보상 수량은 시트 `랭크보상`(tables.rank_rewards). 랭크 로드 수량은 시트에 아직 없어 개발 가정값(기획확인요청 17차).
import { legendCount, tiersOf } from "./rank.mjs";

export const RANK_REWARDS_DEFAULT = Object.freeze({
  first_win_gold: 100,
  tiers: [
    { tier: "bronze", label: "브론즈", gold: 500, first_win_mult: 1, frame: false, title: false, grade: null, skin: false },
    { tier: "silver", label: "실버", gold: 1000, first_win_mult: 1.1, frame: true, title: false, grade: 0, skin: false },
    { tier: "gold", label: "골드", gold: 2000, first_win_mult: 1.2, frame: true, title: false, grade: 1, skin: false },
    { tier: "platinum", label: "플래티넘", gold: 3500, first_win_mult: 1.3, frame: true, title: true, grade: 1, skin: true },
    { tier: "diamond", label: "다이아", gold: 5000, first_win_mult: 1.4, frame: true, title: true, grade: 2, skin: true },
    { tier: "master", label: "마스터", gold: 8000, first_win_mult: 1.5, frame: true, title: true, grade: 3, skin: true },
    { tier: "legend", label: "레전드", gold: 12000, first_win_mult: 1.5, frame: true, title: true, grade: 4, skin: true }
  ]
});
// 시즌 이벤트 스킨 상품 ID(시트 `시즌스킨`). 없으면 null
export const seasonSkin = (data, season) => data?.tables?.season_skins?.seasons?.find((x) => Number(x.no) === Number(season))?.item ?? null;
export const rankRewards = (data) => data?.tables?.rank_rewards ?? RANK_REWARDS_DEFAULT;

// 단계 번호 범위: 티어 이름 앞부분(브론즈 III·II·I = 1~3 …)으로 묶는다
export function tierGroups(data) {
  const tiers = data?.tables?.rank_tiers?.tiers ?? [];
  const groups = {};
  for (const t of tiers) {
    const label = String(t.name).split(" ")[0];
    const g = (groups[label] ??= { min: t.no, max: t.no });
    g.min = Math.min(g.min, t.no); g.max = Math.max(g.max, t.no);
  }
  return groups;
}

// 크론: 끝난 시즌의 지급 설정. masters = 마스터 계정(RP 내림차순, 시즌 기록 처리 제외)
export function payoutConfig(data, masters, { skinItem = null } = {}) {
  const rr = rankRewards(data);
  const groups = tierGroups(data);
  const pick = (r) => ({ key: r.tier, label: r.label, gold: r.gold, frame: r.frame, title: r.title, grade: r.grade ?? 0, skin: r.skin });
  const legendRow = rr.tiers.find((r) => r.tier === "legend");
  const legends = masters.slice(0, legendCount(data, masters.length)).map((m) => m.account);
  return {
    groups: rr.tiers.filter((r) => r.tier !== "legend" && groups[r.label]).map((r) => ({ ...pick(r), ...groups[r.label] })),
    legend: legendRow ? pick(legendRow) : pick(rr.tiers[rr.tiers.length - 1]),
    legends, skin_item: skinItem, days: 30
  };
}

// ---------- 랭크 로드: 16단계 각 첫 도달 1회, 매 시즌 다시(상세 08) ----------
const BOUNDARY = new Set(["실버", "골드", "플래티넘", "다이아", "마스터"]);
export function rankRoadSteps(data) {
  const custom = data?.tables?.rank_road?.steps;
  if (custom?.length) return custom.map((s) => ({ tier: Number(s.no ?? s.tier), gold: Number(s.gold ?? 0), items: s.items ?? [], extra: s.extra ?? "" }));
  // 개발 가정값: 단계마다 100골드, 티어 경계(실버 III·골드 III·플래티넘 III·다이아 III·마스터)는 300골드(+ 시즌별 감정표현·카드 뒷면은 기획이 상품 ID를 정하면 추가)
  const tiers = tiersOf(data).tiers;
  return tiers.map((t, i) => {
    const label = String(t.name).split(" ")[0];
    const first = i === 0 || String(tiers[i - 1].name).split(" ")[0] !== label;
    return { tier: t.no, gold: first && BOUNDARY.has(label) ? 300 : 100, items: [] };
  });
}

export function rankRoadView(state, data, { best, rp }) {
  const claimed = new Set(state?.seasonM?.road ?? []);
  const tiers = tiersOf(data).tiers;
  const steps = rankRoadSteps(data).map((s) => ({ ...s, name: tiers.find((t) => t.no === s.tier)?.name, reached: (best ?? 0) >= s.tier, claimed: claimed.has(s.tier) }));
  const next = tiers.find((t) => t.no > (best ?? 0));
  return { best: best ?? 0, steps, claimable: steps.filter((s) => s.reached && !s.claimed).length,
    nextRewardTier: next?.name ?? null, rpToNext: next ? Math.max(0, next.rp_start - (rp ?? 0)) : 0 };
}

export function claimRankRoad(state, data, { best }) {
  const s = structuredClone(state);
  s.seasonM ??= { list: [], fw: {}, cw: {} };
  const claimed = new Set(s.seasonM.road ?? []);
  const take = rankRoadSteps(data).filter((x) => (best ?? 0) >= x.tier && !claimed.has(x.tier));
  if (!take.length) throw new Error("nothing_to_claim");
  s.seasonM.road = [...claimed, ...take.map((x) => x.tier)].sort((a, b) => a - b);
  return { state: s, gold: take.reduce((a, x) => a + x.gold, 0), items: take.flatMap((x) => x.items), tiers: take.map((x) => x.tier) };
}
