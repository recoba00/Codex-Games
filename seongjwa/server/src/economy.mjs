// 경제 규칙(순수 함수): 판 보상·일일 첫 승·미션·출석. DB 반영은 econ-db.mjs.
// 근거: 상세 05(미션 종류·개수·갱신 05:00·인정 범위·하루 1회 교체·출석), 상세 06(골드 획득처·상한),
//       시트 `경제`(승리 30·하루 10승·미션 300/1,000·출석 1,400+1,000), 시트 `랭크보상`(첫 승 100 × 티어 배율).
// 데이터 settings(econ_* 키)·tables.missions가 있으면 그 값을 쓴다(상세 14 원격 데이터 원칙).

export const ECON_DEFAULTS = Object.freeze({
  econ_win_gold: 30,              // 시트 경제: 승리 골드
  econ_win_gold_daily_wins: 10,   // 하루 10승까지
  econ_first_win_gold: 100,       // 시트 랭크보상: 일일 첫 승 기본
  econ_ai_daily_count: 3,         // 상세 05: AI 대전은 하루 3판까지 인정
  econ_attend_daily_gold: 200,    // 시트 경제: 출석 7일 합 1,400
  econ_attend_day7_bonus: 1000,   // 7일째 보너스
  econ_attend_total_days: 28,     // 상세 05: 누적 28일 보상
  econ_attend_total_gold: 3000,
  econ_daily_reroll: 1,           // 일일 미션 하루 1개 무료 교체
  econ_name_change_gold: 4000,    // 상세 05: 닉네임 2회째부터
  econ_mail_days: 30,             // 우편 보관 30일
  econ_reset_hour_kst: 5          // 매일 05:00, 주간은 월요일 05:00
});

// 첫 승 배율(시트 랭크보상): 티어 이름 앞부분으로 찾는다
export const FIRST_WIN_MULT = Object.freeze({ "브론즈": 1.0, "실버": 1.1, "골드": 1.2, "플래티넘": 1.3, "다이아": 1.4, "마스터": 1.5, "레전드": 1.5 });

// 미션 기본표(상세 05 예시 기반, 개발 가정값 → 기획 확인 요청 13차). scope: ranked=랭킹전만, counted=랭킹전+AI 대전(하루 3판)
//   metric: play 판수, win 승리, exclusive 전용 카드 사용 장수, spell 스펠 사용, faction_win 서로 다른 진영으로 승리,
//           friend_play 친구방 판, tier_reach 티어 도달(target=티어 번호), char_wins 캐릭터 N명으로 각 per승
export const MISSION_DEFAULTS = Object.freeze({
  daily_count: 3,
  daily: [
    { id: "D_RANKED3", name: "랭킹전 3판", metric: "play", scope: "ranked", target: 3, gold: 100 },
    { id: "D_WIN2", name: "2승", metric: "win", scope: "counted", target: 2, gold: 100 },
    { id: "D_EXCL5", name: "전용 카드 5장 사용", metric: "exclusive", scope: "counted", target: 5, gold: 100 },
    { id: "D_SPELL3", name: "스펠 3회 사용", metric: "spell", scope: "counted", target: 3, gold: 100 },
    { id: "D_PLAY4", name: "4판 플레이", metric: "play", scope: "counted", target: 4, gold: 100 }
  ],
  weekly: [
    { id: "W_RANKED15", name: "랭킹전 15판", metric: "play", scope: "ranked", target: 15, gold: 200 },
    { id: "W_FACTION3", name: "진영 3개 모두로 1승", metric: "faction_win", scope: "counted", target: 3, gold: 200 },
    { id: "W_FRIEND1", name: "친구와 1판", metric: "friend_play", scope: "friend", target: 1, gold: 200 },
    { id: "W_WIN10", name: "10승", metric: "win", scope: "counted", target: 10, gold: 200 },
    { id: "W_EXCL30", name: "전용 카드 30장 사용", metric: "exclusive", scope: "counted", target: 30, gold: 200 }
  ],
  season: [
    { id: "S_TIER_GOLD", name: "골드 티어 도달", metric: "tier_reach", scope: "ranked", target: 7, gold: 500 },
    { id: "S_CHARS5", name: "캐릭터 5명으로 각 3승", metric: "char_wins", scope: "counted", target: 5, per: 3, gold: 500 },
    { id: "S_WIN30", name: "30승", metric: "win", scope: "counted", target: 30, gold: 500 },
    { id: "S_RANKED60", name: "랭킹전 60판", metric: "play", scope: "ranked", target: 60, gold: 500 },
    { id: "S_FACTION3", name: "진영 3개 모두로 각 5승", metric: "faction_win", scope: "counted", target: 3, per: 5, gold: 500 },
    { id: "S_FRIEND5", name: "친구와 5판", metric: "friend_play", scope: "friend", target: 5, gold: 500 },
    { id: "S_EXCL100", name: "전용 카드 100장 사용", metric: "exclusive", scope: "counted", target: 100, gold: 500 },
    { id: "S_SPELL60", name: "스펠 60회 사용", metric: "spell", scope: "counted", target: 60, gold: 500 },
    { id: "S_CHARS9", name: "캐릭터 9명으로 각 1승", metric: "char_wins", scope: "counted", target: 9, per: 1, gold: 500 },
    { id: "S_TIER_PLAT", name: "플래티넘 티어 도달", metric: "tier_reach", scope: "ranked", target: 10, gold: 500 }
  ]
});

export function econConfig(data) {
  const s = data?.settings ?? {};
  const cfg = { ...ECON_DEFAULTS };
  for (const k of Object.keys(cfg)) if (s[k] !== undefined && Number.isFinite(Number(s[k]))) cfg[k] = Number(s[k]);
  cfg.missions = data?.tables?.missions ?? MISSION_DEFAULTS;
  return cfg;
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

// 계정·날짜로 정해지는 일일 미션 3개(같은 날 다시 불러도 같음)
function pickDaily(account, day, cfg) {
  const pool = cfg.missions.daily;
  const n = Math.min(cfg.missions.daily_count ?? 3, pool.length);
  const order = pool.map((m) => ({ id: m.id, k: hash(`${account}|${day}|${m.id}`) })).sort((a, b) => a.k - b.k);
  return order.slice(0, n).map((x) => ({ id: x.id, p: 0, done: false, claimed: false }));
}

const fresh = (list) => list.map((m) => ({ id: m.id, p: 0, done: false, claimed: false }));

// 기간이 바뀌었으면 새 미션·카운터로. 순수 함수: 새 상태를 돌려준다
export function roll(state, { account, now, seasonId, cfg }) {
  const k = periodKeys(now, cfg);
  const s = structuredClone(state ?? {});
  if (s.day !== k.day) {
    s.day = k.day;
    s.today = { wins: 0, ai: 0, firstWin: false };
    s.daily = { list: pickDaily(account, k.day, cfg), rerolls: 0 };
  }
  if (s.week !== k.week) {
    s.week = k.week;
    s.weekly = { list: fresh(cfg.missions.weekly), factions: [] };
  }
  if (seasonId != null && s.season !== seasonId) {
    s.season = seasonId;
    s.seasonM = { list: fresh(cfg.missions.season), chars: {}, factions: {} };
  }
  s.att ??= { last: null, count: 0 };
  return s;
}

const defOf = (cfg, kind, id) => cfg.missions[kind].find((m) => m.id === id);

// ---------- 판 결과 반영 ----------
// match: { mode: ranked|ranked_ai|practice|friend, result: win|loss|draw|leave|drop, character, faction, exclusive, spells, tier }
export function applyMatch(state, match, cfg) {
  const s = structuredClone(state);
  const ranked = match.mode === "ranked" || match.mode === "ranked_ai";
  const ai = match.mode === "practice";
  const friend = match.mode === "friend";
  let counted = ranked;
  if (ai) { s.today.ai += 1; counted = s.today.ai <= cfg.econ_ai_daily_count; }
  const win = match.result === "win";
  const out = { gold: 0, parts: [], counted };

  if (counted && win) {  // 승리 골드(하루 10승까지) + 일일 첫 승(티어 배율)
    s.today.wins += 1;
    if (s.today.wins <= cfg.econ_win_gold_daily_wins) { out.gold += cfg.econ_win_gold; out.parts.push({ kind: "win", gold: cfg.econ_win_gold }); }
    if (!s.today.firstWin) {
      s.today.firstWin = true;
      const g = Math.round(cfg.econ_first_win_gold * (match.tierMult ?? 1));
      out.gold += g; out.parts.push({ kind: "first_win", gold: g });
    }
  }
  if (win && counted) {
    s.weekly.factions = [...new Set([...(s.weekly.factions ?? []), match.faction])];
    s.seasonM.chars[match.character] = (s.seasonM.chars[match.character] ?? 0) + 1;
    s.seasonM.factions[match.faction] = (s.seasonM.factions[match.faction] ?? 0) + 1;
  }
  const scopeOk = (sc) => (sc === "ranked" ? ranked : sc === "friend" ? friend : counted);
  for (const kind of ["daily", "weekly", "season"]) {
    const bucket = kind === "season" ? s.seasonM : s[kind];
    for (const m of bucket.list) {
      const d = defOf(cfg, kind, m.id);
      if (!d || m.done || !scopeOk(d.scope)) continue;
      switch (d.metric) {
        case "play": m.p += 1; break;
        case "friend_play": m.p += 1; break;
        case "win": if (win) m.p += 1; break;
        case "exclusive": m.p += match.exclusive ?? 0; break;
        case "spell": m.p += match.spells ?? 0; break;
        case "faction_win":
          m.p = d.per ? Object.values(s.seasonM.factions).filter((n) => n >= d.per).length : s.weekly.factions.length; break;
        case "char_wins": m.p = Object.values(s.seasonM.chars).filter((n) => n >= (d.per ?? 1)).length; break;
        case "tier_reach": m.p = (match.tier ?? 0) >= d.target ? d.target : 0; break;
        default: break;
      }
      m.p = Math.min(m.p, d.target);
      if (m.p >= d.target) m.done = true;
    }
  }
  return { state: s, ...out };
}

// 티어 도달 미션은 판이 아니어도(랭크 화면 진입 등) 현재 티어로 갱신
export function applyTier(state, tier, cfg) {
  const s = structuredClone(state);
  for (const m of s.seasonM?.list ?? []) {
    const d = defOf(cfg, "season", m.id);
    if (d?.metric === "tier_reach" && !m.done && (tier ?? 0) >= d.target) { m.p = d.target; m.done = true; }
  }
  return s;
}

export function firstWinMult(tierName) {
  const key = Object.keys(FIRST_WIN_MULT).find((k) => String(tierName ?? "").startsWith(k));
  return key ? FIRST_WIN_MULT[key] : 1;
}

// ---------- 미션 받기·교체 ----------
export function claimMissions(state, kind, id, cfg) {
  if (!["daily", "weekly", "season"].includes(kind)) throw new Error("mission_invalid");
  const s = structuredClone(state);
  const bucket = kind === "season" ? s.seasonM : s[kind];
  const targets = bucket.list.filter((m) => (id === "all" ? m.done && !m.claimed : m.id === id));
  if (!targets.length) throw new Error(id === "all" ? "nothing_to_claim" : "mission_invalid");
  let gold = 0;
  for (const m of targets) {
    if (!m.done) throw new Error("mission_not_done");
    if (m.claimed) throw new Error("mission_claimed");
    m.claimed = true;
    gold += defOf(cfg, kind, m.id)?.gold ?? 0;
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
  s.daily.list[i] = { id: pick.id, p: 0, done: false, claimed: false };
  s.daily.rerolls += 1;
  return { state: s, id: pick.id };
}

// ---------- 출석: 7일 순환(빠져도 이어서), 7일째 보너스, 누적 28일마다 보상 ----------
export function claimAttendance(state, cfg) {
  const s = structuredClone(state);
  if (s.att.last === s.day) throw new Error("attendance_done");
  s.att.last = s.day;
  s.att.count += 1;
  const cycleDay = ((s.att.count - 1) % 7) + 1;
  let gold = cfg.econ_attend_daily_gold;
  const parts = [{ kind: "attend", gold }];
  if (cycleDay === 7) { gold += cfg.econ_attend_day7_bonus; parts.push({ kind: "attend_day7", gold: cfg.econ_attend_day7_bonus }); }
  if (s.att.count % cfg.econ_attend_total_days === 0) { gold += cfg.econ_attend_total_gold; parts.push({ kind: "attend_total", gold: cfg.econ_attend_total_gold }); }
  return { state: s, gold, cycleDay, parts };
}

// 클라이언트에 보여줄 모양(이름·목표·보상 포함)
export function econView(state, cfg, now) {
  const k = periodKeys(now, cfg);
  const show = (kind, list) => list.map((m) => {
    const d = defOf(cfg, kind, m.id) ?? {};
    return { id: m.id, name: d.name, progress: m.p, target: d.target, gold: d.gold, done: m.done, claimed: m.claimed };
  });
  const count = state.att?.count ?? 0;
  return {
    day: state.day, nextReset: k.nextReset, nextWeekly: k.nextWeekly,
    daily: show("daily", state.daily?.list ?? []), rerollLeft: Math.max(0, cfg.econ_daily_reroll - (state.daily?.rerolls ?? 0)),
    weekly: show("weekly", state.weekly?.list ?? []), season: show("season", state.seasonM?.list ?? []),
    attendance: { claimedToday: state.att?.last === state.day, count, nextCycleDay: (count % 7) + 1, untilTotal: cfg.econ_attend_total_days - (count % cfg.econ_attend_total_days) },
    today: { wins: state.today?.wins ?? 0, winGoldLeft: Math.max(0, cfg.econ_win_gold_daily_wins - (state.today?.wins ?? 0)), firstWinDone: Boolean(state.today?.firstWin), aiCounted: Math.min(state.today?.ai ?? 0, cfg.econ_ai_daily_count) },
    claimable: ["daily", "weekly"].reduce((n, kd) => n + (state[kd]?.list ?? []).filter((m) => m.done && !m.claimed).length, 0) + (state.seasonM?.list ?? []).filter((m) => m.done && !m.claimed).length
  };
}
