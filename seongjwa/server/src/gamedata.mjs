// 게임 데이터 로딩 (상세 14 "다음 판부터 적용, 진행 중인 판은 시작 시점 데이터").
// - 라이브 포인터는 짧게 캐시(LIVE_TTL_MS), 버전별 스냅샷은 바뀌지 않으므로 무기한 캐시.
// - 판 시작 시 pinLive()로 받은 {version, snapshot}을 판 상태에 고정하고, 재시작 시 getVersion(version)으로 복원한다.
import { select } from "./db.mjs";

export const LIVE_TTL_MS = 60 * 1000;
const snapshots = new Map(); // version -> { version, sha256, snapshot }
let live = null;             // { version, fetchedAt }
let inflight = null;

export function _resetCache() {
  snapshots.clear();
  live = null;
  inflight = null;
}

async function fetchLive(env, fetcher) {
  const rows = await select(env, "data_live?select=version_id,data_versions(id,snapshot,snapshot_sha256)", fetcher);
  const row = rows?.[0];
  const v = row?.data_versions;
  if (!row || !v?.snapshot) throw new Error("data_not_published");
  snapshots.set(row.version_id, { version: row.version_id, sha256: v.snapshot_sha256, snapshot: v.snapshot });
  return row.version_id;
}

export async function getLive(env, fetcher = fetch, now = Date.now()) {
  const ttl = Number(env?.LIVE_TTL_MS ?? LIVE_TTL_MS);  // 시험 환경은 짧게(배포 직후 확인)
  if (live && now - live.fetchedAt < ttl && snapshots.has(live.version)) return snapshots.get(live.version);
  if (!inflight) {
    inflight = fetchLive(env, fetcher)
      .then((version) => { live = { version, fetchedAt: now }; return snapshots.get(version); })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export async function getVersion(env, version, fetcher = fetch) {
  const v = Number(version);
  if (!Number.isSafeInteger(v) || v < 1) throw new Error("data_version_invalid");
  if (snapshots.has(v)) return snapshots.get(v);
  const rows = await select(env, `data_versions?id=eq.${v}&status=eq.published&select=id,snapshot,snapshot_sha256`, fetcher);
  if (!rows?.[0]?.snapshot) throw new Error("data_version_not_found");
  const entry = { version: v, sha256: rows[0].snapshot_sha256, snapshot: rows[0].snapshot };
  snapshots.set(v, entry);
  return entry;
}

// 판 시작 시 호출: 이 판이 끝날 때까지 쓸 데이터 버전을 고정한다.
export async function pinLive(env, fetcher = fetch) {
  const entry = await getLive(env, fetcher);
  return { version: entry.version, snapshot: entry.snapshot };
}
