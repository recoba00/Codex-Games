// 랭크 DB 연동: 시즌·상태 읽기 → rank.mjs로 계산 → 판 단위 1회 반영(rank_commit). 판 DO와 큐에서 쓴다.
import { rpc } from "./db.mjs";
import { leaverStatus, netExemptAvailable, seasonStart, settle, tierForRp, tiersOf } from "./rank.mjs";

export async function currentSeason(env) {
  const s = await rpc(env, "season_current", { p_length_days: 28 });
  return Array.isArray(s) ? s[0] : s;
}

// 계정의 이번 시즌 상태(없으면 시즌 시작값), 숨은 MMR, 이탈 상태
export async function loadRank(env, data, account, seasonId) {
  const st = await rpc(env, "rank_state", { p_account: account, p_season: seasonId, p_window_days: data.tables?.leaver?.window_days ?? 7 });
  const cur = st.current;
  const row = cur
    ? { rp: cur.rp, tier: cur.tier_no, state: cur.state ?? {}, version: cur.version }
    : seasonStart(data, st.previous);
  return { row, mmr: Number(st.mmr ?? 800), recent: st.recent ?? [], leaver: leaverStatus(data, st.recent ?? []) };
}

// 판 결과 반영. players: [{acc, result}] (AI 자리는 넣지 않음). 반환: 자리별 {rpDelta, rp, tier}
export async function settleMatch(env, data, { matchId, seasonId, mode, players }) {
  const loaded = await Promise.all(players.map((p) => loadRank(env, data, p.acc, seasonId)));
  const out = [];
  for (let i = 0; i < players.length; i += 1) {
    const p = players[i];
    const opp = loaded[1 - i];
    let r = loaded[i];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = settle({ data, row: r.row, result: p.result, mode, mmr: r.mmr, opponentMmr: opp?.mmr ?? r.mmr, exemptAvailable: netExemptAvailable(r.recent) });
      const kind = p.result === "drop" ? (res.detail.netExempt ? "loss" : "leave") : p.result;
      try {
        const status = await rpc(env, "rank_commit", {
          p_match: matchId, p_account: p.acc, p_season: seasonId, p_expected_version: r.row.version,
          p_rp: res.rp, p_tier: res.tier, p_state: res.state, p_mmr_delta: res.mmrDelta,
          p_event: { kind, mode, rp_delta: res.rpDelta, detail: res.detail }
        });
        out.push({ acc: p.acc, result: kind, netExempt: Boolean(res.detail.netExempt), rpDelta: res.rpDelta, rp: res.rp, tier: res.tier, duplicate: status === "duplicate" });
        break;
      } catch (error) {
        if (error.message !== "rank_conflict" || attempt === 2) throw error;  // 버전 충돌 → 다시 읽고 재계산
        r = await loadRank(env, data, p.acc, seasonId);
      }
    }
  }
  return out;
}

export function tierName(data, no) {
  return tiersOf(data).tiers.find((t) => t.no === no)?.name ?? String(no);
}

export { tierForRp };
