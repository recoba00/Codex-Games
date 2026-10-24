// 경제 규칙(순수 함수): 판 보상·일일 첫 승·미션·출석. DB 반영은 econ-db.mjs.
// 근거: 상세 05(미션·갱신 05:00·인정 범위·하루 1회 교체·출석), 상세 06(골드 획득처·상한), 총괄 8장(모드별 보상),
//       시트 `경제`(E열 키, 미션 표 40~65행), 시트 `랭크보상`(첫 승 100 × 티어 배율), 기획답변 13차.
// 데이터 settings(econ_* 키)·tables.missions가 있으면 그 값을 쓴다(재배포 없이 변경).

export const ECON_DEFAULTS = Object.freeze({
  econ_win_gold: 30,               // 시트 경제 E열
  econ_win_daily_cap: 10,          // 하루 10승까지(랭킹전·AI 대전 승리 합산)
  econ_first_win_gold: 100,        // 시트 랭크보상: 일일 첫 승 기본(랭킹전만, 기획답변 13차 A4)
  econ_practice_win_gold: 15,      // AI 대전 승리 골드(30의 절반, 총괄 8장 "소량")
  econ_practice_daily_games: 3,    // AI 대전 하루 인정 판수(4판째부터 골드·미션 미인정)
  econ_attend_week_sum: 1400,      // 출석 7일 합(하루 200)
  econ_attend_day7_bonus: 1000,    // 7일째 보너스
  econ_attend_cum28_gold: 3000,    // 누적 28일 출석 보상, 1회만(기획답변 13차 A5)
  econ_attend_cum_days: 28,
  econ_daily_count: 3,             // 일일 미션 개수(상세 05)
  econ_daily_reroll: 1,            // 일일 미션 하루 1개 무료 교체
  econ_name_change_gold: 4000,     // 닉네임 2회째부터
  econ_mail_days: 30,              // 우편 보관 30일
  econ_reset_hour_kst: 5           // 매일 05:00, 주간은 월요일 05:00
});

// 첫 승 배율(시트 랭크보상): 티어 이름 앞부분으로 찾는다
export const FIRST_WIN_MULT = Object.freeze({ "브론즈": 1.0, "실버": 1.1, "골드": 1.2, "플래티넘": 1.3, "다이아": 1.4, "마스터": 1.5, "레전드": 1.5 });
const TIER_WORD = Object.freeze({ bronze: "브론즈", silver: "실버", gold: "골드", platinum: "플래티넘", diamond: "다이아", master: "마스터" });
const TIER_NO_DEFAULT = Object.freeze({ bronze: 1, silver: 4, gold: 7, platinum: 10, diamond: 13, master: 16 });

// 미션 표(시트 `경제` 40~65행과 같은 기본값). 조건 종류(metric)·범위(scope)는 시트 키 그대로.
//   scope: ranked = 랭킹전·AI 랭킹전 / ranked_ai = + AI 대전(하루 3판) / friend = 친구방 / any = 모든 모드
//   aux: faction_wins → factions(진영 수), char_wins → chars(캐릭터 수), tier_reach → tier(티어 이름)
export const METRICS = Object.freeze(["games", "wins", "signature_cards", "spells", "faction_wins", "friend_games", "tier_reach", "char_wins"]);
export const SCOPES = Object.freeze(["ranked", "ranked_ai", "friend", "any"]);
const M = (id, name, metric, target, aux, scope, gold) => ({ id, name, metric, target, aux, scope, gold });
export const MISSION_DEFAULTS = Object.freeze({
  daily: [M("D01", "랭킹전 3판", "games", 3, {}, "ranked", 100), M("D02", "2승", "wins", 2, {}, "ranked_ai", 100),
    M("D03", "전용 카드 5장 사용", "signature_cards", 5, {}, "ranked_ai", 100), M("D04", "스펠 3회 사용", "spells", 3, {}, "ranked_ai", 100),
    M("D05", "4판 플레이", "games", 4, {}, "ranked_ai", 100)],
  weekly: [M("W01", "랭킹전 15판", "games", 15, {}, "ranked", 200), M("W02", "진영 3개 모두로 1승", "faction_wins", 1, { factions: 3 }, "ranked_ai", 200),
    M("W03", "친구와 1판", "friend_games", 1, {}, "friend", 200), M("W04", "10승", "wins", 10, {}, "ranked_ai", 200),
    M("W05", "전용 카드 30장 사용", "signature_cards", 30, {}, "ranked_ai", 200)],
  season: [M("S01", "골드 티어 도달", "tier_reach", 1, { tier: "gold" }, "any", 500), M("S02", "캐릭터 5명으로 각 3승", "char_wins", 3, { chars: 5 }, "ranked_ai", 500),
    M("S03", "30승", "wins", 30, {}, "ranked_ai", 500), M("S04", "랭킹전 60판", "games", 60, {}, "ranked", 500),
    M("S05", "진영 3개 모두로 각 5승", "faction_wins", 5, { factions: 3 }, "ranked_ai", 500), M("S06", "친구와 5판", "friend_games", 5, {}, "friend", 500),
    M("S07", "전용 카드 100장 사용", "signature_cards", 100, {}, "ranked_ai", 500), M("S08", "스펠 60회 사용", "spells", 60, {}, "ranked_ai", 500),
    M("S09", "캐릭터 9명으로 각 1승", "char_wins", 1, { chars: 9 }, "ranked_ai", 500), M("S10", "플래티넘 도달", "tier_reach", 1, { tier: "platinum" }, "any", 500)]
});

export function econConfig(data) {
  const s = data?.settings ?? {};
  const cfg = { ...ECON_DEFAULTS };
  for (const k of Object.keys(cfg)) if (s[k] !== undefined && Number.isFinite(Number(s[k]))) cfg[k] = Number(s[k]);
  cfg.missions = data?.tables?.missions ?? MISSION_DEFAULTS;
  const rr = data?.tables?.rank_rewards;  // 시트 랭크보상: 첫 승 기본 골드·티어 배율
  if (rr && s.econ_first_win_gold === undefined && Number.isFinite(Number(rr.first_win_gold))) cfg.econ_first_win_gold = Number(rr.first_win_gold);
  cfg.firstWin = rr?.tiers?.length ? Object.fromEntries(rr.tiers.map((t) => [t.label, Number(t.first_win_mult)])) : { ...FIRST_WIN_MULT };
  const tiers = data?.tables?.rank_tiers?.tiers ?? [];
  cfg.tierNo = Object.fromEntries(Object.entries(TIER_WORD).map(([en, ko]) => [en, tiers.find((t) => String(t.name).startsWith(ko))?.no ?? TIER_NO_DEFAULT[en]]));
  return cfg;
}

// 미션의 완료 기준(진행 표시의 분모)
export function goalOf(d) {
  if (d.metric === "faction_wins") return Number(d.aux?.factions ?? 3);
  if (d.metric === "char_wins") return Number(d.aux?.chars ?? 1);
  if (d.metric === "tier_reach") return 1;
  return Number(d.target);
}

// ---------- 기간: 매일 05:00 KST, 주간 월요일 05:00 KST ----------
const DAY = 86400000;
export function periodKeys(now, cfg = ECON_DEFAULTS) {
  const shifted = new Date(now + (9 - cfg.econ_reset_hour_kst) * 3600000);  // KST−5h 의 날짜 = 게임 날짜
  const day = shifted.toISOString().slice(0, 10);
  const dow = (shifted.getUTCDay() + 6) % 7;  // 월=0
  const week = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - dow * DAY).toISOString().slice(0, 10);
  const next = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) + DAY - (9 - cfg.econ_reset_hour_kst) * 3600000;
  return { day, week, nextReset: next, nextWeekly: next + ((6 - dow) * DAY) };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// 계정·날짜로 정해지는 일일 미션(같은 날 다시 불러도 같음)
function pickDaily(account, day, cfg) {
  const pool = cfg.missions.daily;
  const n = Math.min(cfg.econ_daily_count, pool.length);
  return pool.map((m) => ({ id: m.id, k: hash(`${account}|${day}|${m.id}`) })).sort((a, b) => a.k - b.k).slice(0, n)
    .map((x) => ({ id: x.id, p: 0, done: false, claimed: false }));
}
const fresh = (id) => ({ id, p: 0, done: false, claimed: false });
const newBucket = (ids) => ({ list: ids.map(fresh), fw: {}, cw: {} });
// 미션 표가 바뀌었으면(배포로 ID 추가·삭제) 진행은 같은 ID만 이어 간다
function syncList(bucket, defs) {
  const old = Object.fromEntries((bucket.list ?? []).map((m) => [m.id, m]));
  bucket.list = defs.map((d) => old[d.id] ?? fresh(d.id));
  bucket.fw ??= {}; bucket.cw ??= {};
}

// 기간이 바뀌었으면 새 미션·카운터로. 순수 함수: 새 상태를 돌려준다
export function roll(state, { account, now, seasonId, cfg }) {
  const k = periodKeys(now, cfg);
  const s = structuredClone(state ?? {});
  const known = (kind) => new Set(cfg.missions[kind].map((m) => m.id));
  const sameDay = s.day === k.day;
  if (!sameDay || !s.daily || s.daily.list.some((m) => !known("daily").has(m.id))) {
    if (!sameDay) s.today = { wins: 0, ai: 0, firstWin: false };
    s.daily = { ...newBucket([]), list: pickDaily(account, k.day, cfg), rerolls: sameDay ? s.daily?.rerolls ?? 0 : 0 };
    s.day = k.day;
  }
  s.daily.fw ??= {}; s.daily.cw ??= {};
  if (s.week !== k.week || !s.weekly) { s.week = k.week; s.weekly = newBucket(cfg.missions.weekly.map((m) => m.id)); } else syncList(s.weekly, cfg.missions.weekly);
  if (seasonId != null && (s.season !== seasonId || !s.seasonM)) { s.season = seasonId; s.seasonM = newBucket(cfg.missions.season.map((m) => m.id)); } else if (s.seasonM) syncList(s.seasonM, cfg.missions.season);
  s.today ??= { wins: 0, ai: 0, firstWin: false };
  s.att ??= { last: null, count: 0 };
  return s;
}

const BUCKETS = [["daily", "daily"], ["weekly", "weekly"], ["season", "seasonM"]];
const bucketOf = (s, kind) => s[BUCKETS.find(([k]) => k === kind)[1]];
const defOf = (cfg, kind, id) => cfg.missions[kind].find((m) => m.id === id);

function progressOf(d, m, bucket, match) {
  switch (d.metric) {
    case "games": case "friend_games": return m.p + 1;
    case "wins": return m.p + (match.result === "win" ? 1 : 0);
    case "signature_cards": return m.p + (match.exclusive ?? 0);
    case "spells": return m.p + (match.spells ?? 0);
    case "faction_wins": return Object.values(bucket.fw).filter((n) => n >= d.target).length;
    case "char_wins": return Object.values(bucket.cw).filter((n) => n >= d.target).length;
    default: return m.p;
  }
}

// ---------- 판 결과 반영 ----------
// match: { mode: ranked|ranked_ai|practice|friend, result: win|loss|draw|leave|drop, character, faction, exclusive, spells, tier, tierMult }
export function applyMatch(state, match, cfg) {
  const s = structuredClone(state);
  const ranked = match.mode === "ranked" || match.mode === "ranked_ai";
  const practice = match.mode === "practice";
  const friend = match.mode === "friend";
  let practiceCounted = false;
  if (practice) { s.today.ai += 1; practiceCounted = s.today.ai <= cfg.econ_practice_daily_games; }
  const counted = ranked || practiceCounted;
  const win = match.result === "win";
  const out = { gold: 0, parts: [], counted };

  // 승리 골드(랭킹전 30·AI 대전 15, 합쳐서 하루 10승까지) + 일일 첫 승(랭킹전만, 티어 배율) — 기획답변 13차 A4
  if (win && counted) {
    s.today.wins += 1;
    const g = ranked ? cfg.econ_win_gold : cfg.econ_practice_win_gold;
    if (s.today.wins <= cfg.econ_win_daily_cap && g > 0) { out.gold += g; out.parts.push({ kind: ranked ? "win" : "practice_win", gold: g }); }
    if (ranked && !s.today.firstWin) {
      s.today.firstWin = true;
      const fg = Math.round(cfg.econ_first_win_gold * (match.tierMult ?? 1));
      out.gold += fg; out.parts.push({ kind: "first_win", gold: fg });
    }
  }
  const scopeOk = (sc) => (sc === "ranked" ? ranked : sc === "ranked_ai" ? counted : sc === "friend" ? friend : true);
  for (const [kind] of BUCKETS) {
    const bucket = bucketOf(s, kind);
    if (!bucket) continue;
    if (win && counted) {  // 진영·캐릭터별 승리(기간마다 따로)
      bucket.fw[match.faction] = (bucket.fw[match.faction] ?? 0) + 1;
      bucket.cw[match.character] = (bucket.cw[match.character] ?? 0) + 1;
    }
    for (const m of bucket.list) {
      const d = defOf(cfg, kind, m.id);
      if (!d || m.done || !scopeOk(d.scope)) continue;
      m.p = d.metric === "tier_reach" ? ((match.tier ?? 0) >= (cfg.tierNo[d.aux?.tier] ?? 99) ? 1 : 0) : progressOf(d, m, bucket, match);
      m.p = Math.min(m.p, goalOf(d));
      if (m.p >= goalOf(d)) m.done = true;
    }
  }
  return { state: s, ...out };
}

// 티어 도달 미션은 판이 아니어도(로비 진입 등) 현재 티어로 갱신
export function applyTier(state, tier, cfg) {
  const s = structuredClone(state);
  for (const [kind] of BUCKETS) {
    for (const m of bucketOf(s, kind)?.list ?? []) {
      const d = defOf(cfg, kind, m.id);
      if (d?.metric === "tier_reach" && !m.done && (tier ?? 0) >= (cfg.tierNo[d.aux?.tier] ?? 99)) { m.p = 1; m.done = true; }
    }
  }
  return s;
}

export function firstWinMult(tierName, cfg) {
  const table = cfg?.firstWin ?? FIRST_WIN_MULT;
  const key = Object.keys(table).find((k) => String(tierName ?? "").startsWith(k));
  return key ? table[key] : 1;
}

// ---------- 미션 받기·교체 ----------
export function claimMissions(state, kind, id, cfg) {
  if (!["daily", "weekly", "season"].includes(kind)) throw new Error("mission_invalid");
  const s = structuredClone(state);
  const bucket = bucketOf(s, kind);
  const targets = bucket.list.filter((m) => (id === "all" ? m.done && !m.claimed : m.id === id));
  if (!targets.length) throw new Error(id === "all" ? "nothing_to_claim" : "mission_invalid");
  let gold = 0;
  for (const m of targets) {
    if (!m.done) throw new Error("mission_not_done");
    if (m.claimed) throw new Error("mission_claimed");
    m.claimed = true;
    gold += Number(defOf(cfg, kind, m.id)?.gold ?? 0);
  }
  return { state: s, gold, ids: targets.map((m) => m.id) };
}

export function rerollDaily(state, id, account, cfg) {
  const s = structuredClone(state);
  if (s.daily.rerolls >= cfg.econ_daily_reroll) throw new Error("reroll_used");
  const i = s.daily.list.findIndex((m) => m.id === id);
  if (i < 0) throw new Error("mission_invalid");
  if (s.daily.list[i].claimed) throw new Error("mission_claimed");
  const have = new Set(s.daily.list.map((m) => m.id));
  const pool = cfg.missions.daily.filter((m) => !have.has(m.id));
  if (!pool.length) throw new Error("reroll_empty");
  const pick = pool[hash(`${account}|${s.day}|reroll`) % pool.length];
  s.daily.list[i] = fresh(pick.id);
  s.daily.rerolls += 1;
  return { state: s, id: pick.id };
}

// ---------- 출석: 7일 순환(빠져도 이어서), 7일째 보너스, 누적 28일째 1회 ----------
export function claimAttendance(state, cfg) {
  const s = structuredClone(state);
  if (s.att.last === s.day) throw new Error("attendance_done");
  s.att.last = s.day;
  s.att.count += 1;
  const cycleDay = ((s.att.count - 1) % 7) + 1;
  const daily = Math.round(cfg.econ_attend_week_sum / 7);
  let gold = daily;
  const parts = [{ kind: "attend", gold: daily }];
  if (cycleDay === 7) { gold += cfg.econ_attend_day7_bonus; parts.push({ kind: "attend_day7", gold: cfg.econ_attend_day7_bonus }); }
  if (s.att.count === cfg.econ_attend_cum_days) { gold += cfg.econ_attend_cum28_gold; parts.push({ kind: "attend_cum", gold: cfg.econ_attend_cum28_gold }); }
  return { state: s, gold, cycleDay, parts };
}

// 클라이언트에 보여줄 모양(이름·목표·보상 포함)
export function econView(state, cfg, now) {
  const k = periodKeys(now, cfg);
  const show = (kind) => (bucketOf(state, kind)?.list ?? []).map((m) => {
    const d = defOf(cfg, kind, m.id) ?? {};
    return { id: m.id, name: d.name, progress: m.p, target: d.metric ? goalOf(d) : null, gold: d.gold, done: m.done, claimed: m.claimed };
  });
  const count = state.att?.count ?? 0;
  const v = {
    day: state.day, nextReset: k.nextReset, nextWeekly: k.nextWeekly,
    daily: show("daily"), rerollLeft: Math.max(0, cfg.econ_daily_reroll - (state.daily?.rerolls ?? 0)),
    weekly: show("weekly"), season: show("season"),
    attendance: { claimedToday: state.att?.last === state.day, count, nextCycleDay: (count % 7) + 1, untilCumulative: Math.max(0, cfg.econ_attend_cum_days - count) },
    today: { wins: state.today?.wins ?? 0, winGoldLeft: Math.max(0, cfg.econ_win_daily_cap - (state.today?.wins ?? 0)), firstWinDone: Boolean(state.today?.firstWin), aiCounted: Math.min(state.today?.ai ?? 0, cfg.econ_practice_daily_games) }
  };
  v.claimable = [...v.daily, ...v.weekly, ...v.season].filter((m) => m.done && !m.claimed).length;
  return v;
}
