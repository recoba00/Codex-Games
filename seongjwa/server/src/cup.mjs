// 주말 챔피언스 컵(상세 08): 플래티넘 III 이상, 토 05:00 ~ 월 05:00(한국 시간), 캐릭터 3명 등록, 7승 또는 3패까지, 랭크 영향 없음.
export const CUP = Object.freeze({
  minTier: 10,          // 플래티넘 III(랭크_승점 순번)
  wins: 7, losses: 3,
  widenAfterSec: 30,    // 같은 승패끼리 우선, 30초 넘으면 ±1승
  waitSec: 300,         // 최대 대기(설정값 cup_wait_sec)
  specialWeek: 3,       // 시즌 3주차 = 특별 주간(상세 11), 골드만 cup_special_mult배
  // 시트 `챔피언스컵`이 없을 때 기본값(기획답변 23차와 같음)
  tiers: [{ no: 1, min: 0, max: 2, gold: 1000, emote: false, frame: false }, { no: 2, min: 3, max: 4, gold: 2000, emote: false, frame: false },
    { no: 3, min: 5, max: 6, gold: 3000, emote: true, frame: false }, { no: 4, min: 7, max: 7, gold: 3000, emote: true, frame: true }]
});
const KST = 9 * 3600 * 1000;
const DAY = 86400000;

// 그 주의 컵 기간. 지금이 기간 안이면 open, 아니면 다음 기간. week = 그 토요일(한국 날짜)
export function cupWindow(now = Date.now()) {
  const k = new Date(now + KST);                       // 한국 시각을 UTC 필드로 읽음
  const dow = k.getUTCDay();                           // 0=일 … 6=토
  const day0 = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());  // 한국 날짜 00:00(가상 UTC)
  const back = (dow + 1) % 7;                          // 지난(또는 오늘) 토요일까지 며칠
  let sat = day0 - back * DAY;
  let start = sat + 5 * 3600000 - KST;                 // 토 05:00 KST → 실제 UTC
  if (now < start) { sat -= 7 * DAY; start -= 7 * DAY; }  // 토요일 05:00 전이면 지난주 기간
  let end = start + 2 * DAY;                           // 월 05:00
  if (now >= end) { sat += 7 * DAY; start += 7 * DAY; end += 7 * DAY; }
  return { week: new Date(sat).toISOString().slice(0, 10), start, end, open: now >= start && now < end };
}

// 등록: 서로 다른 캐릭터 3명 + 각 덱 프리셋(1~3)
export function validRoster(data, roster) {
  if (!Array.isArray(roster) || roster.length !== 3) throw new Error("cup_roster_invalid");
  const out = roster.map((r) => ({ char: String(r?.char ?? ""), preset: Number(r?.preset ?? 2) }));
  if (new Set(out.map((r) => r.char)).size !== 3 || !out.every((r) => data.characters?.[r.char])) throw new Error("cup_roster_invalid");
  for (const r of out) {
    const n = (data.presets?.[r.char] ?? []).length || 3;
    if (!Number.isInteger(r.preset) || r.preset < 1 || r.preset > n) throw new Error("cup_roster_invalid");
  }
  return out;
}

// 매칭: 같은 승패 기록끼리, 30초가 넘은 사람은 ±1승까지. 몰아주기 기록·AI 없음
export function cupMatchTick(entries, now, { maxWaitSec = 300 } = {}) {
  const ready = entries.filter((e) => now >= (e.notBefore ?? 0)).sort((a, b) => a.since - b.since);
  const used = new Set(), pairs = [], timeout = [];
  const wide = (e) => (now - e.since) / 1000 >= CUP.widenAfterSec;
  for (const a of ready) {
    if (used.has(a.acc)) continue;
    let best = null;
    for (const b of ready) {
      if (b === a || used.has(b.acc)) continue;
      const same = a.wins === b.wins && a.losses === b.losses;
      const near = Math.abs(a.wins - b.wins) <= 1 && (wide(a) || wide(b));
      if (same) { best = b; break; }
      if (near && !best) best = b;
    }
    if (best) { used.add(a.acc); used.add(best.acc); pairs.push([a, best]); }
  }
  for (const a of ready) if (!used.has(a.acc) && (now - a.since) / 1000 >= maxWaitSec) timeout.push(a);
  return { pairs, ai: [], timeout };
}
export function cupNextWake(entries, now, { maxWaitSec = 300 } = {}) {
  const times = [];
  for (const e of entries) for (const t of [CUP.widenAfterSec, maxWaitSec]) { const at = e.since + t * 1000; if (at > now) times.push(at); }
  return times.length ? Math.min(...times) : null;
}

const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : d);
export const cupTiers = (data) => data?.tables?.cup?.tiers?.length ? data.tables.cup.tiers : CUP.tiers;
export const cupWaitSec = (data) => Math.max(30, num(data?.settings?.cup_wait_sec, CUP.waitSec));
// 추가 참가권 미션: 설정값은 숫자 번호(1 = W01, 0 = 없음, 기획답변 23차). 문자 "W01"도 받는다
export function cupBonusMission(data) {
  const v = data?.settings?.cup_bonus_mission;
  if (typeof v === "string" && /^W\d{2,}$/.test(v.trim())) return v.trim();
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? `W${String(n).padStart(2, "0")}` : null;
}
// 그 주가 시즌 몇 주차인지(시즌 시작일 기준, 한국 날짜). week = 컵 토요일 YYYY-MM-DD
export function cupSeasonWeek(seasonStartsAt, week) {
  const start = Date.parse(new Date(Date.parse(seasonStartsAt) + KST).toISOString().slice(0, 10));
  return Math.floor((Date.parse(week) - start) / (7 * DAY)) + 1;
}
// 보상 설정(DB 함수 cup_finish로 넘김). 특별 주간 판단은 DB가 참가 기록의 시즌 시작일로 한다
export const cupRewardCfg = (data) => ({ tiers: cupTiers(data), emote_item: data?.settings?.cup_emote_item || null,
  special_week: CUP.specialWeek, special_mult: num(data?.settings?.cup_special_mult, 1) });
