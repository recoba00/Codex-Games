// 주말 챔피언스 컵(상세 08): 플래티넘 III 이상, 토 05:00 ~ 월 05:00(한국 시간), 캐릭터 3명 등록, 7승 또는 3패까지, 랭크 영향 없음.
export const CUP = Object.freeze({
  minTier: 10,          // 플래티넘 III(랭크_승점 순번)
  wins: 7, losses: 3,
  widenAfterSec: 30,    // 같은 승패끼리 우선, 30초 넘으면 ±1승
  rewards: { gold_0: 1000, gold_3: 2000, gold_5: 3000 }  // 0~2승 / 3~4승 / 5~6승(+감정표현), 7승 = + 컵 프레임 + 컵 우승자 칭호
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

export const cupRewardCfg = (data) => ({ ...CUP.rewards, emote_item: data?.settings?.cup_emote_item || null });
