// 랭크·시즌·이탈 규칙 (순수 함수). RP 계산은 서버에서 이 파일 한 곳에서만 한다.
// 근거: 총괄 8장(AI 랭킹전 배율·하루 5판·다이아 이상 없음·MMR 미반영), 9장(RP·연승·하락 보호·하한선·시즌 리셋·초반 배율·레전드),
//      10장(이탈·닷지·누적 단계), 시트 `랭크_승점`(단계표·RP 계산기)·`이탈패널티`·`설정값`.

const roundHalfAway = (v) => Math.sign(v) * Math.round(Math.abs(v));  // 시트 ROUND와 같은 반올림
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (settings, key, fallback) => (Number.isFinite(Number(settings?.[key])) ? Number(settings[key]) : fallback);

export const DODGE_BLOCK_MIN = 5;    // 총괄 10장: 닷지 5분 매칭 제한
export const ELO_K = 32;             // 숨은 MMR 갱신 폭 기본값. 시트 `설정값` mmr_k 우선 (기획답변 3차 A1)
export const PROTECT_GAMES = 3;      // 총괄 9장: 새 티어 진입 직후 3판 강등 없음

export function tiersOf(data) {
  const t = data?.tables?.rank_tiers;
  if (!t?.tiers?.length) throw new Error("rank_tiers_missing");
  return t;
}

export function tierForRp(tiers, rp) {
  let no = 1;
  for (const t of tiers) if (rp >= t.rp_start) no = t.no;
  return no;
}

const tierRow = (tiers, no) => tiers.find((t) => t.no === no) ?? tiers[0];

// 시즌 첫 판: 지난 시즌 최종 단계 → 리셋 단계(시트 "리셋 후 시작 단계"), 지난 시즌 최고 단계까지 승리 RP 배율
export function seasonStart(data, previous) {
  const { tiers } = tiersOf(data);
  if (!previous) return { rp: 0, tier: 1, state: blankState(1, 0), version: 0 };
  const resetNo = tierRow(tiers, previous.tier_no).reset_to ?? 1;
  const rp = tierRow(tiers, resetNo).rp_start;
  const prevBest = Number(previous.state?.best ?? previous.tier_no);
  return { rp, tier: resetNo, state: blankState(resetNo, prevBest), version: 0 };
}

function blankState(tier, earlyUntil) {
  return { streak: 0, best: tier, floor: 0, protect: 0, protectTier: tier, earlyUntil, aiDay: "", aiGames: 0, games: 0, wins: 0 };
}

// 네트워크 면책(총괄 10장, 기획답변 3차 A3): 연결이 비정상으로 끊겨 60초 안에 못 돌아온 경우(drop),
// 한국 날짜 기준 하루 첫 1회는 패배는 그대로 두고 이탈 누적·추가 감점은 빼 준다.
export function netExemptAvailable(recent, now = Date.now()) {
  const day = (t) => new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
  return !recent.some((e) => e.exempt && day(Date.parse(e.at)) === day(now));
}

// 한 판 결과 반영. result: win | loss | draw | leave | drop(비정상 끊김 이탈) | dodge
// mode: ranked(사람) | ranked_ai. opponentMmr는 사람 판에서만 의미.
// 부계정(상세 13): 사람 랭킹전 누적 판수가 적은데 승률이 높으면 숨은 MMR 갱신 폭(K)을 키워 빨리 제 구간으로. 제재 대상 아님
export function smurfKMult(data, stats) {
  const s = data?.settings ?? {};
  const games = Number(stats?.games ?? 0), wins = Number(stats?.wins ?? 0);
  if (games < num(s, "smurf_min_games", 5) || games > num(s, "smurf_games", 19)) return 1;  // 5~19판 사이(양끝 포함, 기획답변 23차)
  return wins / games >= num(s, "smurf_winrate", 0.7) ? num(s, "smurf_k_mult", 2) : 1;
}

export function settle({ data, row, result: rawResult, mode, mmr, opponentMmr = mmr, now = Date.now(), exemptAvailable = false, kMult = 1 }) {
  let result = rawResult;
  const exempt = rawResult === "drop" && exemptAvailable;
  if (rawResult === "drop") result = exempt ? "loss" : "leave";
  const s = data.settings ?? {};
  const { tiers } = tiersOf(data);
  const state = { ...blankState(row.tier, 0), ...row.state };
  const tierBefore = row.tier;
  const t = tierRow(tiers, tierBefore);
  const isAi = mode === "ranked_ai";
  const aiMult = isAi ? 1 - num(s, "ai_rp_penalty_pct", 0.4) : 1;
  const adj = clamp(roundHalfAway((mmr - t.mmr) / num(s, "mmr_adj_per", 20)), -num(s, "mmr_adj_max", 8), num(s, "mmr_adj_max", 8));
  const detail = { mmrAdj: adj, aiMult, tierBefore, ...(exempt ? { netExempt: true } : {}) };

  // AI 랭킹전 하루 반영 한도(초과분은 RP 0, 총괄 8장)
  const day = new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);  // 한국 날짜 기준
  if (isAi) {
    if (state.aiDay !== day) { state.aiDay = day; state.aiGames = 0; }
    state.aiGames += 1;
  }
  const aiCapped = isAi && state.aiGames > num(s, "ai_daily_rp_games", 5);

  let delta = 0;
  if (result === "win") {
    state.streak += 1;
    const start = num(s, "streak_start", 3);
    const bonus = state.streak >= start ? Math.min(num(s, "streak_rp_max", 10), num(s, "streak_rp_step", 5) * (state.streak - start + 1)) : 0;
    let v = num(s, "win_rp_base", 25) + adj + bonus;
    if (state.best < state.earlyUntil) v *= num(s, "season_early_win_mult", 1.5);  // 지난 시즌 최고 단계 재도달 전까지
    delta = roundHalfAway(v * aiMult);
    Object.assign(detail, { streakBonus: bonus });
    state.wins += 1;
  } else if (result === "loss" || result === "leave") {
    state.streak = 0;
    delta = -roundHalfAway((num(s, "loss_rp_base", 20) - adj) * t.loss_mult * aiMult);  // 브론즈 0, 실버 50%
    if (result === "leave") delta -= num(s, "leave_rp_penalty", 10);
  } else if (result === "dodge") {
    delta = -num(s, "dodge_rp_penalty", 5);
  }  // draw: 변동 없음, 연승 유지
  if (aiCapped) { delta = 0; detail.aiCapped = true; }
  if (result !== "dodge") state.games += 1;

  let rp = Math.max(0, row.rp + delta);
  // 승급 시 AI 판 인정 끔: AI 판 RP로는 다음 단계에 못 올라감
  if (isAi && delta > 0 && num(s, "promo_ai_counts", 1) === 0) {
    const next = tiers.find((x) => x.no === tierBefore + 1);
    if (next && rp >= next.rp_start) { rp = next.rp_start - 1; detail.promoBlocked = true; }
  }
  // 하한선(골드·다이아 진입 후 그 시즌 동안) / 새 티어 진입 직후 3판 강등 없음
  // 패배 감점이 없는 단계(브론즈)는 이탈 감점으로도 단계 시작점 아래로 안 내려감 (기획답변 3차 A2)
  if (delta < 0) {
    if (t.loss_mult === 0) rp = Math.max(rp, t.rp_start);
    if (state.floor) rp = Math.max(rp, tierRow(tiers, state.floor).rp_start);
    if (state.protect > 0 && state.protectTier === tierBefore) rp = Math.max(rp, t.rp_start);
  }
  const tier = tierForRp(tiers, rp);
  if (result !== "dodge" && state.protect > 0) state.protect -= 1;
  if (tier > tierBefore) { state.protect = PROTECT_GAMES; state.protectTier = tier; }
  for (const x of tiers) if (x.floor && x.no <= tier) state.floor = Math.max(state.floor, x.no);
  state.best = Math.max(state.best, tier);

  // 숨은 MMR: 사람 랭킹전만(AI 판·닷지 미반영)
  let mmrDelta = 0;
  if (!isAi && ["win", "loss", "leave", "draw"].includes(result)) {
    const expected = 1 / (1 + 10 ** ((opponentMmr - mmr) / 400));
    const score = result === "win" ? 1 : result === "draw" ? 0.5 : 0;
    mmrDelta = Math.round(num(s, "mmr_k", ELO_K) * kMult * (score - expected));
  }
  return { rp, tier, state, rpDelta: rp - row.rp, mmrDelta, detail };
}

// 다이아 이상(설정 ai_off_from_tier_no)은 AI 대체 없음
export function aiAllowed(data, tier) {
  const off = num(data.settings, "ai_off_from_tier_no", 13);
  const row = tierRow(tiersOf(data).tiers, tier);
  return tier < off && row.ai !== false;
}

// 대체 AI 난이도·차선 확률 (상세 03: 브론즈~실버 보통, 골드~플래티넘 어려움). 설정 키가 있으면 우선
export function aiProfileForTier(data, tier) {
  const s = data.settings ?? {};
  if (tier <= 6) return { difficulty: "normal", subopt: num(s, "ai_subopt_bronze_silver", 0.15) };
  return { difficulty: "hard", subopt: num(s, "ai_subopt_gold_plat", 0.05) };
}

// 레전드: 마스터 중 시즌 RP 상위 N%, 인원 상한 M명 (총괄 9장, 설정 legend_top_pct·legend_cap)
export function legendCount(data, masters) {
  const pct = num(data.settings, "legend_top_pct", 0.1);
  return Math.min(num(data.settings, "legend_cap", 100), Math.floor(masters * pct));
}

// 이탈 누적 상태 (총괄 10장, 시트 `이탈패널티`). recent: 최근 기간의 rank_events [{kind, at}]
export function leaverStatus(data, recent, now = Date.now()) {
  const L = data?.tables?.leaver ?? { window_days: 7, reduce_per_games: 5, steps: [] };
  const windowStart = now - L.window_days * 86400000;
  const events = recent.map((e) => ({ kind: e.kind, at: Date.parse(e.at) })).filter((e) => e.at >= windowStart).sort((a, b) => a.at - b.at);
  const leaves = events.filter((e) => e.kind === "leave");
  const out = { leaves: leaves.length, effective: 0, step: null, lockedUntil: null, delayMin: 0, rewardMult: 1, dodgeUntil: null };
  const lastDodge = events.filter((e) => e.kind === "dodge").at(-1);
  if (lastDodge && lastDodge.at + DODGE_BLOCK_MIN * 60000 > now) out.dodgeUntil = lastDodge.at + DODGE_BLOCK_MIN * 60000;
  if (!leaves.length) return out;
  const firstLeave = leaves[0].at, lastLeave = leaves.at(-1).at;
  const normal = events.filter((e) => ["win", "loss", "draw"].includes(e.kind) && e.at > firstLeave).length;
  out.effective = Math.max(0, leaves.length - Math.floor(normal / L.reduce_per_games));  // 정상 완료 M판마다 1회 감면
  if (!out.effective) return out;
  const steps = [...L.steps].sort((a, b) => a.count - b.count);
  const step = steps.filter((x) => x.count <= out.effective).at(-1);
  if (!step) return out;
  out.step = step;
  if (step.lock_h > 0 && lastLeave + step.lock_h * 3600000 > now) out.lockedUntil = lastLeave + step.lock_h * 3600000;
  const gamesSince = events.filter((e) => ["win", "loss", "draw", "leave"].includes(e.kind) && e.at > lastLeave).length;
  if (step.games > 0 && gamesSince < step.games) {
    out.delayMin = step.delay_min;
    out.rewardMult = step.reward_mult;
  }
  return out;
}
