import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(fs.readFileSync(path.join(serverRoot, "wrangler.jsonc"), "utf8"));
const source = fs.readFileSync(path.join(serverRoot, "src/index.mjs"), "utf8");

test("Cloudflare config exposes only free SQLite Durable Object resources", () => {
  assert.equal(config.workers_dev, true);
  assert.equal(config.keep_vars, true);
  assert.deepEqual(Object.keys(config.exports).sort(), ["AdmissionGate", "MatchRoom"]);
  for (const value of Object.values(config.exports)) {
    assert.equal(value.type, "durable-object");
    assert.equal(value.storage, "sqlite");
  }
  assert.equal("r2_buckets" in config, false);
  assert.equal("d1_databases" in config, false);
  assert.equal("routes" in config, false);
});

test("credentials are runtime-only and WebSockets use hibernation", () => {
  const serialized = JSON.stringify(config);
  for (const name of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.equal(serialized.includes(name), false, `${name} must not be checked into Wrangler vars`);
  }
  assert.match(source, /ctx\.acceptWebSocket\(server\)/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /if \(room\.persisted \|\| !this\.env\.SUPABASE_URL/);
});

test("admission guardrails fail closed at bounded test limits", () => {
  assert.match(source, /rooms >= 200/);
  assert.match(source, /kind === "auth" \? 12/);
  assert.match(source, /kind === "create" \? 6/);
  assert.match(source, /rate_limited/);
});

test("anonymous sessions are proxied without exposing Supabase configuration", () => {
  assert.match(source, /url\.pathname === "\/v1\/auth\/anonymous"/);
  assert.match(source, /url\.pathname === "\/v1\/auth\/refresh"/);
  assert.match(source, /\/auth\/v1\/signup/);
  assert.match(source, /grant_type=refresh_token/);
  assert.match(source, /accessToken: session\.access_token/);
  assert.doesNotMatch(source, /service_role[^_]/i);
});
