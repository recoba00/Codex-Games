// 통합 테스트(웹 전투 프로토타입 /play): 실제 Workers 런타임(wrangler 로컬) + 가짜 Supabase + 실제 브라우저(Playwright).
// 실행: node test/live/play.mjs  (npm run test:live:play)
// 시나리오: 시작(보통) → 픽 → 스펠·덱 준비 완료 → 전투 3턴(카드 내고 확정 → 공개 연출) → 항복 → 결과 → 다시 하기로 새 판
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync, writeFileSync } from "node:fs";
import { startFakeSupabase } from "./fake-supabase.mjs";

const DB_PORT = 54337, API_PORT = 8807;
const API = `http://127.0.0.1:${API_PORT}`;
const here = new URL("../../", import.meta.url).pathname;
const db = await startFakeSupabase(DB_PORT);
writeFileSync(`${here}.dev.vars`, `SUPABASE_URL=http://127.0.0.1:${DB_PORT}\nSUPABASE_SERVICE_KEY=sb_secret_local\nTOKEN_SECRET=local-test-secret-local-test-secret-123\nDEV_LOGIN=1\nAI_THINK_MS=150,300\n`);
const PERSIST = `${here}.wrangler/live-${process.pid}`;
const wr = spawn("npx", ["wrangler", "dev", "--persist-to", PERSIST, "--port", String(API_PORT), "--ip", "127.0.0.1", "--var", "DEV_LOGIN:1", "--var", "AI_THINK_MS:150,300"], { cwd: here, stdio: ["ignore", "pipe", "pipe"] });
let wlog = "";
wr.stdout.on("data", (d) => { wlog += d; });
wr.stderr.on("data", (d) => { wlog += d; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (m) => console.log(`✔ ${m}`);
let browser;
try {
  for (let i = 0; ; i += 1) {
    try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* starting */ }
    if (i > 80) throw new Error(`wrangler did not start\n${wlog}`);
    await sleep(500);
  }
  const { chromium } = await import("playwright").catch(() => createRequire("/usr/lib/node_modules/")("playwright"));
  browser = await chromium.launch();
  for (const vp of [{ width: 1280, height: 800, name: "데스크톱" }, { width: 390, height: 844, name: "휴대폰 세로" }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${API}/play`);
    await page.click("#go");
    await page.waitForSelector("[data-pick]", { timeout: 15000 });
    await page.click("[data-pick]", { force: true });
    await page.waitForSelector("[data-sp]", { timeout: 15000 });
    step(`${vp.name}: 시작 → 픽 → 스펠·덱 화면`);
    await page.click("#ok");
    await page.waitForSelector("#side_me .face", { timeout: 15000 });
    for (let t = 1; t <= 3; t += 1) {
      await page.waitForFunction(() => { const b = document.querySelector("#ok"); return b && !b.disabled; }, null, { timeout: 20000 });
      const before = await page.$$eval(".hand .bc", (x) => x.length);
      assert.ok(before >= 3, `손패 ${before}`);
      const playable = await page.$(".hand .bc:not(.cant):not(.lock)");
      if (playable) { await playable.click(); assert.equal(await page.$$eval(".slot.mine .bc", (x) => x.length), 1, "내 슬롯에 카드"); }
      await page.click("#ok");
      await page.waitForSelector(".skip", { timeout: 15000 });  // 공개 연출 시작
      await page.waitForFunction((n) => /턴 (\d+)/.test(document.querySelector(".turn")?.textContent ?? "") && !document.querySelector(".skip") && Number(document.querySelector(".turn").textContent.match(/턴 (\d+)/)[1]) === n, t + 1, { timeout: 20000 });
    }
    step(`${vp.name}: 전투 3턴(카드 선택·확정 → 공개 연출 → 다음 턴)`);
    const shot = `/tmp/play_${vp.width}.png`;
    await page.screenshot({ path: shot });
    const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1);
    assert.ok(!over, "화면 밖 넘침");
    await page.click("#menu");
    await page.click("#dY");
    await page.waitForSelector(".res h2", { timeout: 20000 });
    assert.equal((await page.textContent(".res h2")).trim(), "패배");
    step(`${vp.name}: 항복 → 결과 화면(패배)`);
    await page.click("#again");
    await page.waitForSelector("[data-pick]", { timeout: 15000 });
    step(`${vp.name}: 다시 하기 → 새 판 픽 화면`);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("play live OK");
} catch (e) {
  console.error(e);
  console.error(wlog.slice(-3000));
  process.exitCode = 1;
} finally {
  await browser?.close();
  wr.kill("SIGINT");
  await db.close?.();
  await sleep(500);
  rmSync(PERSIST, { recursive: true, force: true });
  rmSync(`${here}.dev.vars`, { force: true });
  process.exit(process.exitCode ?? 0);
}
