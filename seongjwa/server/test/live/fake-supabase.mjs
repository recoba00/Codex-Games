// 통합 테스트용 가짜 Supabase(PostgREST). 실제 DB 함수와 같은 입출력 모양만 흉내 낸다.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const snapshot = JSON.parse(readFileSync(new URL("../fixtures/data_v1.json", import.meta.url)));
const sha = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
const accounts = new Map();   // provider_uid -> account_id
const sessions = new Map();   // session_id -> { account, revoked }
export const saved = [];

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
