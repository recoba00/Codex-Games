// 백오피스 반응형 점검(태블릿 세로 등): 화면마다 가로 넘침 검사 + 스크린샷. 실행: PGHOST=… node test/live/bo_layout.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
process.env.PGREST_REAL_LIVE = "1";
const { pool, startPgRest } = await import("./pg-rest.mjs");
const DB_PORT = 54396, API_PORT = 8876;
const API = `http://127.0.0.1:${API_PORT}`;
const here = new URL("../../", import.meta.url).pathname;
const fx = (n) => new URL(`../fixtures/assets/${n}`, import.meta.url).pathname;
const XLSX = readFileSync(new URL("../../../data/balance_v8.xlsx", import.meta.url));
const db = await startPgRest(DB_PORT);
writeFileSync(`${here}.dev.vars`, `SUPABASE_URL=http://127.0.0.1:${DB_PORT}\nSUPABASE_SERVICE_KEY=sb_secret_local\nTOKEN_SECRET=local-test-secret-local-test-secret-123\nLIVE_TTL_MS=500\n`);
const PERSIST = `${here}.wrangler/live-${process.pid}`;
const wr = spawn("npx", ["wrangler", "dev", "--persist-to", PERSIST, "--port", String(API_PORT), "--ip", "127.0.0.1", "--var", "DEV_LOGIN:1"], { cwd: here, stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q, v) => pool.query(q, v).then((r) => r.rows);
async function call(path, body, token, raw, type) {
  const res = await fetch(API + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": type ?? (raw ? "application/octet-stream" : "application/json"), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 && r.body?.ok !== false, `${r.status} ${JSON.stringify(r.body)?.slice(0, 300)}`); return r.body; };
const OUT = process.env.SHOT_DIR ?? "/tmp";
const SIZES = (process.env.SIZES ?? "768x1024,834x1194,1024x1366,390x844").split(",").map((s) => s.split("x").map(Number));
const ROUTES = ["dashboard", "metrics", "data", "characters", "cards", "spells", "settings", "assets", "assetChar", "assetSlot", "cardPreview", "shop", "events", "users", "reports", "words", "suspects", "audit", "staff"];
let browser, bad = [];
try {
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* */ } await sleep(500); }
  const tag = Date.now().toString(36), boot = `BOOT-${tag}`;
  await sql("insert into public.staff_invites (code_hash, role, expires_at) values ($1, 'admin', now() + interval '1 day')", [createHash("sha256").update(boot).digest("hex")]);
  await ok(call("/bo/v1/register", { code: boot, login: `ly${tag}`, name: "레이아웃", password: "pw-layout-0123456789" }));
  const admin = (await ok(call("/bo/v1/login", { login: `ly${tag}`, password: "pw-layout-0123456789" }))).token;
  if (!(await sql("select version_id from public.data_live"))[0]?.version_id) {
    await ok(call("/bo/v1/settings", { key: "solo_mode", value: true, reason: "레이아웃" }, admin));
    const up = await ok(call("/bo/v1/data/import?note=seed", XLSX, admin, true));
    await ok(call("/bo/v1/data/review", { version: up.version, action: "request" }, admin));
    await ok(call("/bo/v1/data/review", { version: up.version, action: "approve" }, admin));
    await ok(call("/bo/v1/data/publish", { version: up.version, reason: "seed" }, admin));
  }
  const put = (q, f) => call(`/bo/v1/assets/upload?${q}`, readFileSync(fx(f)), admin, true, "image/webp");
  await put("kind=full&char=AU&skin=000", "full_1080.webp"); await put("kind=thumb&char=AU&skin=000", "thumb.webp");
  await ok(call("/bo/v1/assets/regions", { char: "AU", skin: "000", card: { x: 0, y: 0.1, w: 1, h: 0.75 }, face: { x: 0.3, y: 0.05, w: 0.4, h: 0.225 } }, admin));
  const { chromium } = await import("playwright").catch(() => createRequire("/usr/lib/node_modules/")("playwright"));
  browser = await chromium.launch();
  for (const [w, h] of SIZES) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 1100 })).newPage();
    const perr = [];
    page.on("pageerror", (e) => perr.push(e.message));
    await page.goto(`${API}/bo`);
    await page.evaluate((t) => { sessionStorage.setItem("bo_tok", t); sessionStorage.setItem("bo_ach", "AU"); sessionStorage.setItem("bo_aslot", "CARD_FRAME"); }, admin);
    for (const r of ROUTES) {
      await page.goto(`${API}/bo#${r}`); await page.reload();
      await page.waitForFunction(() => document.querySelector("#view")?.innerText.trim().length > 20, null, { timeout: 8000 }).catch(() => {});
      await sleep(250);
      const m = await page.evaluate(() => {
        const W = document.documentElement.clientWidth, over = [];
        for (const el of document.querySelectorAll("#view *")) { const r = el.getBoundingClientRect(); if (r.width && r.right > W + 1 && getComputedStyle(el).position !== "fixed") over.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} ${Math.round(r.right)}`); }
        return { sw: document.documentElement.scrollWidth, W, over: over.slice(0, 4) };
      });
      if (m.sw > m.W + 1 || m.over.length) bad.push(`${w}x${h} ${r}: scroll ${m.sw}/${m.W} ${m.over.join(" | ")} :: ` + await page.evaluate(() => [...document.querySelectorAll(".tw")].map((x) => `${x.className}/${x.clientWidth}/${x.querySelector("table")?.scrollWidth}`).join(",")));
      await page.screenshot({ path: `${OUT}/ly_${w}_${r}.png`, fullPage: false });
    }
    if (perr.length) bad.push(`${w}x${h} pageerror: ${perr.join(" | ")}`);
  }
  console.log(bad.length ? "넘침:\n" + bad.join("\n") : "넘침 없음");
} catch (e) { console.error("FAIL:", e.message); process.exitCode = 1; }
finally {
  await browser?.close().catch(() => {}); wr.kill("SIGTERM"); db.close(); await pool.end().catch(() => {});
  rmSync(`${here}.dev.vars`, { force: true });
  setTimeout(() => { try { rmSync(PERSIST, { recursive: true, force: true }); } catch { /* */ } }, 300);
  setTimeout(() => process.exit(), 500);
}
