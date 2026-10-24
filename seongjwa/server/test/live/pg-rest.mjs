// 통합 테스트용 PostgREST 대역: RPC를 실제 Postgres 함수로 그대로 실행한다(마이그레이션을 적용한 로컬·CI DB).
// 게임 데이터(data_live)만 테스트 픽스처를 내려주고(설정 일부 단축), 판 결과(match_results)는 메모리에 둔다.
// 연결: PGHOST·PGPORT·PGUSER·PGPASSWORD·PGDATABASE 환경 변수(pg 기본 규칙).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";

export const pool = new pg.Pool({ max: 4 });
const snapshot = JSON.parse(readFileSync(new URL("../fixtures/data_v1.json", import.meta.url)));
snapshot.settings.ai_fallback_sec = Number(process.env.FAKE_AI_FALLBACK_SEC ?? 3);
const sha = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
export const saved = [];

let fns = null;
async function functions() {
  if (fns) return fns;
  const { rows } = await pool.query(`
    select p.proname, p.proretset, p.proargnames, (select array_agg(format_type(t, null) order by i) from unnest(p.proargtypes) with ordinality u(t, i)) as types,
           t.typtype = 'c' as composite, format_type(p.prorettype, null) as ret
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
     where n.nspname = 'public'`);
  fns = Object.fromEntries(rows.map((r) => [r.proname, r]));
  return fns;
}

const lit = (v, type) => {
  if (v === null || v === undefined) return null;
  if (type.endsWith("[]")) return `{${v.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(",")}}`;
  if (type === "jsonb" || type === "json") return JSON.stringify(v);
  return typeof v === "object" ? JSON.stringify(v) : String(v);
};

async function callRpc(name, body) {
  const f = (await functions())[name];
  if (!f) return { status: 404, body: { message: `function ${name} not found` } };
  const names = f.proargnames ?? [];
  const args = [], vals = [];
  names.forEach((n, i) => {
    if (!(n in body)) return;  // 기본값 있는 인자는 생략 가능
    vals.push(lit(body[n], f.types[i]));
    args.push(`${n} => $${vals.length}::${f.types[i]}`);
  });
  const call = `public.${name}(${args.join(", ")})`;
  try {
    if (f.proretset) return { status: 200, body: (await pool.query(`select * from ${call}`, vals)).rows };
    if (f.composite) return { status: 200, body: (await pool.query(`select to_jsonb(x) v from ${call} x`, vals)).rows[0]?.v ?? null };
    const v = (await pool.query(`select ${call} v`, vals)).rows[0]?.v;
    return { status: 200, body: f.ret === "bigint" && v !== null ? Number(v) : v ?? null };
  } catch (error) {
    return { status: 400, body: { message: error.message, code: error.code } };
  }
}

function reply(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

export function startPgRest(port) {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", async () => {
      const url = new URL(req.url, "http://x");
      const body = raw ? JSON.parse(raw) : {};
      const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
      if (m) { const r = await callRpc(m[1], body); return reply(res, r.status, r.body); }
      if (url.pathname === "/rest/v1/data_live") return reply(res, 200, [{ version_id: 1, data_versions: { id: 1, snapshot, snapshot_sha256: sha } }]);
      if (url.pathname === "/rest/v1/match_results" && req.method === "POST") {
        if (saved.some((r) => r.id === body.id)) return reply(res, 409, { message: "duplicate" });
        saved.push(body);
        return reply(res, 201);
      }
      return reply(res, 404, { message: "not found" });
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
