// 매칭 규칙(순수 함수). 근거는 queue.mjs 머리말과 같음(총괄 8장).
export const QUEUE_RULES = Object.freeze({ maxWaitSec: 120, humanFirstSec: 1, steps: [[10, 100], [20, 200], [Infinity, 350]], wideSteps: [[60, 500], [90, 800], [Infinity, 1200]] });

// 대기 시간에 따른 MMR 탐색 범위. AI 없는 구간(다이아 이상·사람만)은 NN초 뒤에도 계속 넓힌다
export function searchRange(waitSec, { aiFallbackSec, wideAfterFallback }) {
  if (wideAfterFallback && waitSec >= aiFallbackSec) return QUEUE_RULES.wideSteps.find(([t]) => waitSec < t)[1];
  return QUEUE_RULES.steps.find(([t]) => waitSec < t)[1];
}

// 승점 몰아주기 방지(상세 13): 같은 두 계정은 24시간 안에 2번까지만 맺고, 3번째부터 피한다
export const PAIR_WINDOW_MS = 24 * 3600 * 1000;
export const PAIR_LIMIT = 2;
export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export function pairBlocked(history, a, b, now) {
  return (history?.[pairKey(a, b)] ?? []).filter((t) => now - t < PAIR_WINDOW_MS).length >= PAIR_LIMIT;
}
export function prunePairs(history, now) {
  const out = {};
  for (const [k, ts] of Object.entries(history ?? {})) { const keep = ts.filter((t) => now - t < PAIR_WINDOW_MS); if (keep.length) out[k] = keep; }
  return out;
}

// 순수 매칭 함수: entries → { pairs:[[a,b]], ai:[a], timeout:[a] }
export function matchTick(entries, now, { aiFallbackSec, history = {} }) {
  const ready = entries.filter((e) => now >= e.notBefore).sort((a, b) => a.since - b.since);  // 오래 기다린 사람 먼저
  const used = new Set();
  const pairs = [], ai = [], timeout = [];
  const wait = (e) => (now - e.since) / 1000;
  const range = (e) => searchRange(wait(e), { aiFallbackSec, wideAfterFallback: !e.aiOk || e.humanOnly });
  for (const a of ready) {
    if (used.has(a.acc)) continue;
    let best = null;
    for (const b of ready) {
      if (b === a || used.has(b.acc) || pairBlocked(history, a.acc, b.acc, now)) continue;
      const diff = Math.abs(a.mmr - b.mmr);
      if (diff <= Math.max(range(a), range(b)) && (!best || diff < Math.abs(a.mmr - best.mmr))) best = b;
    }
    if (best) { used.add(a.acc); used.add(best.acc); pairs.push([a, best]); }
  }
  for (const a of ready) {
    if (used.has(a.acc)) continue;
    const w = wait(a);
    if (a.aiOk && !a.humanOnly && w >= aiFallbackSec) ai.push(a);  // 이 틱에서 사람을 먼저 찾았으므로 "전환 직전 사람 우선"
    else if (w >= QUEUE_RULES.maxWaitSec) timeout.push(a);
  }
  return { pairs, ai, timeout };
}

// 다음에 결과가 바뀔 수 있는 시각(범위 확장·AI 전환·대기 해제·시간 초과)
export function nextWake(entries, now, { aiFallbackSec }) {
  const times = [];
  for (const e of entries) {
    if (now < e.notBefore) { times.push(e.notBefore); continue; }
    for (const t of [10, 20, aiFallbackSec - QUEUE_RULES.humanFirstSec, aiFallbackSec, 60, 90, QUEUE_RULES.maxWaitSec]) {
      const at = e.since + t * 1000;
      if (at > now) times.push(at);
    }
  }
  return times.length ? Math.min(...times) : null;
}
