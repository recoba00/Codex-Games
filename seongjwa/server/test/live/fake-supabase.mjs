// 통합 테스트용 가짜 Supabase(PostgREST). 실제 DB 함수와 같은 입출력 모양만 흉내 낸다.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const snapshot = JSON.parse(readFileSync(new URL("../fixtures/data_v1.json", import.meta.url)));
snapshot.settings.ai_fallback_sec = Number(process.env.FAKE_AI_FALLBACK_SEC ?? 3);  // 테스트: AI 전환 대기 단축
const sha = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
const accounts = new Map();   // provider_uid -> account_id
const sessions = new Map();   // session_id -> { account, revoked }
export const saved = [];
export const rankEvents = [];
const ratings = new Map();  // acc|season -> row
const mmr = new Map();
const season = { id: 1, starts_at: new Date(Date.now() - 86400000).toISOString(), ends_at: new Date(Date.now() + 27 * 86400000).toISOString() };

function reply(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

export function startFakeSupabase(port) {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const body = raw ? JSON.parse(raw) : {};
      if (url.pathname === "/rest/v1/rpc/auth_login") {
        const key = `${body.p_provider}:${body.p_provider_uid}`;
        if (!accounts.has(key)) accounts.set(key, crypto.randomUUID());
        const account = accounts.get(key);
        let replaced = 0;
        for (const s of sessions.values()) if (s.account === account && !s.revoked) { s.revoked = true; replaced += 1; }
        const sid = crypto.randomUUID();
        sessions.set(sid, { account, revoked: false });
        return reply(res, 200, [{ account_id: account, session_id: sid, replaced_sessions: replaced, restored_from_deletion: false }]);
      }
      if (url.pathname === "/rest/v1/rpc/auth_session_active") {
        const s = sessions.get(body.p_session);
        return reply(res, 200, Boolean(s && !s.revoked));
      }
      if (url.pathname === "/rest/v1/rpc/season_current") return reply(res, 200, season);
      if (url.pathname === "/rest/v1/rpc/account_unban_expired") return reply(res, 200, false);
      if (url.pathname === "/rest/v1/rpc/sanction_status") return reply(res, 200, { warnings: [], rankUntil: null });
      if (url.pathname === "/rest/v1/rpc/rank_state") {
        const cur = ratings.get(`${body.p_account}|${body.p_season}`) ?? null;
        return reply(res, 200, { current: cur, previous: null, mmr: mmr.get(body.p_account) ?? 800,
          recent: rankEvents.filter((e) => e.account_id === body.p_account).map((e) => ({ kind: e.kind, at: e.created_at, mode: e.mode, exempt: e.exempt })) });
      }
      if (url.pathname === "/rest/v1/rpc/rank_commit") {
        if (rankEvents.some((e) => e.match_id === body.p_match && e.account_id === body.p_account)) return reply(res, 200, "duplicate");
        const key = `${body.p_account}|${body.p_season}`;
        const cur = ratings.get(key);
        if ((cur?.version ?? 0) !== body.p_expected_version) return reply(res, 400, { message: "rank_conflict" });
        rankEvents.push({ match_id: body.p_match, account_id: body.p_account, kind: body.p_event.kind, mode: body.p_event.mode, rp_delta: body.p_event.rp_delta, exempt: Boolean(body.p_event.detail?.netExempt), created_at: new Date().toISOString() });
        ratings.set(key, { account_id: body.p_account, season_id: body.p_season, rp: body.p_rp, tier_no: body.p_tier, state: body.p_state, version: (cur?.version ?? 0) + 1 });
        if (body.p_mmr_delta) mmr.set(body.p_account, (mmr.get(body.p_account) ?? 800) + body.p_mmr_delta);
        return reply(res, 200, "ok");
      }
      if (url.pathname === "/rest/v1/rpc/rank_board") {
        const rows = [...ratings.values()].filter((r) => r.season_id === body.p_season).sort((a, b) => b.rp - a.rp).map((r) => ({ account: r.account_id, name: "Player", rp: r.rp, tier: r.tier_no }));
        return reply(res, 200, { masters: rows.filter((r) => r.tier >= 16).length, rows });
      }
      if (url.pathname === "/_rank") return reply(res, 200, rankEvents);
      if (url.pathname === "/rest/v1/data_live") {
        return reply(res, 200, [{ version_id: 1, data_versions: { id: 1, snapshot, snapshot_sha256: sha } }]);
      }
      if (url.pathname === "/rest/v1/match_results" && req.method === "POST") {
        if (saved.some((r) => r.id === body.id)) return reply(res, 409, { message: "duplicate" });
        saved.push(body);
        return reply(res, 201);
      }
      if (url.pathname === "/_saved") return reply(res, 200, saved);
      return reply(res, 404, { message: "not found" });
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
