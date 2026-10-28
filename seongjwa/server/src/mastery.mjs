// 숙련도(기획지시 2026-10-25, 총괄 4장): 계정×캐릭터 점수 → 4단계. 능력치 영향 없음, 카드 테두리(슬롯 MASTERY_1~4)로만 보인다.
// 점수: 사람 상대 랭킹전 판당 +1, 승리 +mastery_win_bonus. AI 대전·친구방·컵·몰아주기 의심 판·이른 항복/이탈 판·이탈한 쪽은 0(DB mastery_add).
const num = (s, k, d) => (Number.isFinite(Number(s?.[k])) && s?.[k] !== null && s?.[k] !== "" ? Number(s[k]) : d);

export function masteryCfg(data) {
  const s = data?.settings ?? {};
  return { winBonus: num(s, "mastery_win_bonus", 1), t2: num(s, "mastery_t2", 40), t3: num(s, "mastery_t3", 150), t4: num(s, "mastery_t4", 400),
    t4Winrate: num(s, "mastery_t4_winrate", 0),
    // 단계 보상(LoL식 정리): emoteStage 처음 도달 → 공용 감정표현(상품 ID mastery_emote_item, 비면 없음), titleStage → '<캐릭터명> 장인' 칭호
    emoteStage: num(s, "mastery_emote_stage", 3), titleStage: num(s, "mastery_title_stage", 4), emoteItem: typeof s.mastery_emote_item === "string" && s.mastery_emote_item.trim() ? s.mastery_emote_item.trim() : null };
}

// 단계 1~4. 4단계는 점수 + 최소 승률(mastery_t4_winrate, 0이면 조건 없음)
export function masteryTier(m, cfg) {
  const p = Number(m?.points ?? 0), games = Number(m?.games ?? 0), wins = Number(m?.wins ?? 0);
  if (p >= cfg.t4 && (!cfg.t4Winrate || (games > 0 && wins / games >= cfg.t4Winrate))) return 4;
  if (p >= cfg.t3) return 3;
  if (p >= cfg.t2) return 2;
  return 1;
}

// 화면용: {캐릭터: {points, games, wins, tier, next}} next = 다음 단계 점수(4단계면 null)
export function masteryView(chars = {}, data) {
  const cfg = masteryCfg(data);
  const out = {};
  for (const [ch, m] of Object.entries(chars ?? {})) {
    const tier = masteryTier(m, cfg);
    out[ch] = { points: m.points, games: m.games, wins: m.wins, tier, next: tier === 1 ? cfg.t2 : tier === 2 ? cfg.t3 : tier === 3 ? cfg.t4 : null };
  }
  return out;
}

// 판 화면용 단계만 {캐릭터: 단계}(1단계는 생략 = 기본 테두리)
export function masteryTiers(chars = {}, data) {
  const cfg = masteryCfg(data);
  return Object.fromEntries(Object.entries(chars ?? {}).map(([ch, m]) => [ch, masteryTier(m, cfg)]).filter(([, t]) => t > 1));
}

export const MASTERY_PAIR = { days: 7, games: 3, early: 2 };  // 몰아주기 탐지와 같은 기준(상세 13, 백오피스 어뷰징 의심)

// DB mastery_add에 넘기는 설정(점수·단계·단계 보상)
export function masteryDbCfg(data) {
  const c = masteryCfg(data);
  return { win_bonus: c.winBonus, t2: c.t2, t3: c.t3, t4: c.t4, t4_winrate: c.t4Winrate, emote_stage: c.emoteStage, title_stage: c.titleStage, emote_item: c.emoteItem,
    pair_days: MASTERY_PAIR.days, pair_games: MASTERY_PAIR.games, pair_early: MASTERY_PAIR.early };
}
