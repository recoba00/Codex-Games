import assert from "node:assert/strict";
import { test } from "node:test";
import { matchTick, nextWake, pairKey, searchRange } from "../src/queue-logic.mjs";

const cfg = { aiFallbackSec: 30 };
const T0 = 1_000_000;
const e = (acc, mmr, waitSec, extra = {}) => ({ acc, mmr, since: T0 - waitSec * 1000, notBefore: 0, aiOk: true, humanOnly: false, ...extra });

test("탐색 범위: 0~10초 ±100, 10~20초 ±200, 20초~ ±350, AI 없는 구간은 30초 뒤 더 넓힘 (총괄 8장)", () => {
  assert.deepEqual([5, 15, 25].map((w) => searchRange(w, { aiFallbackSec: 30 })), [100, 200, 350]);
  assert.equal(searchRange(40, { aiFallbackSec: 30, wideAfterFallback: true }), 500);
  assert.equal(searchRange(100, { aiFallbackSec: 30, wideAfterFallback: true }), 1200);
});

test("가까운 MMR은 바로, 먼 MMR은 범위가 넓어진 뒤 매칭", () => {
  assert.equal(matchTick([e("a", 1000, 1), e("b", 1080, 1)], T0, cfg).pairs.length, 1);
  assert.equal(matchTick([e("a", 1000, 1), e("b", 1300, 1)], T0, cfg).pairs.length, 0);
  assert.equal(matchTick([e("a", 1000, 25), e("b", 1300, 1)], T0, cfg).pairs.length, 1);
});

test("30초: 사람 우선, 없으면 AI 랭킹전. 다이아 이상·사람만은 AI 없이 120초 후 취소", () => {
  const both = matchTick([e("a", 1000, 30), e("b", 1340, 0)], T0, cfg);
  assert.deepEqual([both.pairs.length, both.ai.length], [1, 0], "전환 시점에 잡히는 사람이 있으면 사람");
  assert.equal(matchTick([e("a", 1000, 30)], T0, cfg).ai.length, 1);
  assert.equal(matchTick([e("a", 1000, 50, { aiOk: false })], T0, cfg).ai.length, 0);
  assert.equal(matchTick([e("a", 1000, 50, { humanOnly: true })], T0, cfg).ai.length, 0);
  assert.equal(matchTick([e("a", 1000, 120, { aiOk: false })], T0, cfg).timeout.length, 1);
});

test("이탈 대기(notBefore) 중엔 매칭 안 됨, 다음 깨울 시각 계산", () => {
  const waiting = e("a", 1000, 1, { notBefore: T0 + 60000 });
  assert.equal(matchTick([waiting, e("b", 1000, 1)], T0, cfg).pairs.length, 0);
  assert.equal(nextWake([waiting], T0, cfg), T0 + 60000);
  assert.equal(nextWake([e("a", 1000, 3)], T0, cfg), T0 + 7000);
});

test("몰아주기 방지: 같은 두 계정은 24시간 안에 2번까지, 3번째는 다른 상대·AI (상세 13)", () => {
  const es = [e("a", 1000, 5), e("b", 1000, 4), e("c", 1050, 3)];
  const history = { [pairKey("a", "b")]: [T0 - 3600e3, T0 - 7200e3] };
  const r = matchTick(es, T0, { ...cfg, history });
  assert.deepEqual(r.pairs.map(([x, y]) => [x.acc, y.acc]), [["a", "c"]]);
  const old = { [pairKey("a", "b")]: [T0 - 25 * 3600e3, T0 - 3600e3] };
  assert.deepEqual(matchTick([e("a", 1000, 5), e("b", 1000, 4)], T0, { ...cfg, history: old }).pairs.length, 1, "24시간 지난 기록은 안 셈");
});

test("몰아주기 기준은 설정값 pair_window_hours·pair_limit (기획답변 17차 Q5)", async () => {
  const { pairRule, pairBlocked, pairKey: k } = await import("../src/queue-logic.mjs");
  const now = Date.now(), h = { [k("a", "b")]: [now - 3 * 3600e3, now - 5 * 3600e3] };
  assert.equal(pairBlocked(h, "a", "b", now, pairRule({ pair_window_hours: 24, pair_limit: 2 })), true);
  assert.equal(pairBlocked(h, "a", "b", now, pairRule({ pair_window_hours: 4, pair_limit: 2 })), false, "4시간 창이면 1판만 셈");
  assert.equal(pairBlocked(h, "a", "b", now, pairRule({ pair_window_hours: 24, pair_limit: 3 })), false);
  assert.deepEqual(pairRule({}), { windowMs: 24 * 3600e3, limit: 2 });
});
