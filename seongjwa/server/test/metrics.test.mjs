import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { clientEvents } from "../src/app.mjs";
import { characterWinRates } from "../src/bo/api.mjs";

const DATA = JSON.parse(readFileSync(new URL("./fixtures/data_v1.json", import.meta.url)));

test("클라이언트 이벤트: 상세 12 이름만, 공통 속성, 시각 범위, 50개 제한", () => {
  const now = Date.parse("2026-10-24T09:00:00Z");
  const r = clientEvents({ platform: "steam", device: "desktop", appVer: "0.1.0", events: [
    { name: "session_start", props: { res: "1920x1080", window: "max" } },
    { name: "tutorial_step", at: "2026-10-24T08:59:00Z", props: { step_id: "T1", sec: 30, skipped: false } },
    { name: "match_end", props: {} },             // 서버가 남기는 이벤트 → 버림
    { name: "currency_change", props: {} },       // 원본 표(gold_ledger) 기준 → 버림
    { name: "settings_change", at: "2020-01-01T00:00:00Z", props: { key: "reduce_sparkle", value: true } }
  ] }, "acc-1", now);
  assert.deepEqual(r.rows.map((x) => x.name), ["session_start", "tutorial_step", "settings_change"]);
  assert.equal(r.rows[1].at, "2026-10-24T08:59:00.000Z");
  assert.equal(r.rows[2].at, new Date(now).toISOString(), "7일 넘은 시각은 받은 시각으로");
  assert.deepEqual([r.rows[0].platform, r.rows[0].device, r.rows[0].app_ver], ["steam", "desktop", "0.1.0"]);
  assert.equal(clientEvents({ platform: "pc", events: [{ name: "session_end" }] }, "a", now).rows[0].platform, null);
  assert.throws(() => clientEvents({ events: Array(51).fill({ name: "session_end" }) }, "a", now), /events_invalid/);
  assert.throws(() => clientEvents({ events: [] }, "a", now), /events_invalid/);
});

test("캐릭터 승률: 티어 구간별로 묶음(상세 12 밸런스)", () => {
  const rows = [{ id: "AU", tier: 1, games: 3, wins: 2 }, { id: "AU", tier: 3, games: 1, wins: 0 }, { id: "AU", tier: 8, games: 4, wins: 3 }, { id: "SE", tier: 16, games: 2, wins: 1 }];
  const r = characterWinRates(DATA, rows);
  assert.deepEqual(r.map((x) => [x.group, x.id, x.games, x.winPct]), [["브론즈", "AU", 4, 50], ["골드", "AU", 4, 75], ["마스터", "SE", 2, 50]]);
  assert.equal(r[1].name, DATA.characters.AU.name);
});
