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
async function noScroll(page, name) {  // 총괄 5장: 스크롤 없음(문서·내부 상자 모두)
  const bad = await page.evaluate(() => {
    const out = [];
    if (document.scrollingElement.scrollHeight > innerHeight + 1 || document.scrollingElement.scrollWidth > innerWidth + 1) out.push("document");
    for (const e of document.querySelectorAll("body *")) {
      const s = getComputedStyle(e);
      if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)) out.push(e.className || e.id || e.tagName);
      const r = e.getBoundingClientRect();
      if (e.matches("button,.bc,.pvc,.side,.ctl") && r.width && s.visibility !== "hidden" && !e.closest(".backs") && (r.bottom > innerHeight + 2 || r.right > innerWidth + 2)) out.push("밖:" + (e.id || e.className));
    }
    return out.slice(0, 5);
  });
  assert.deepEqual(bad, [], `${name} 화면 넘침`);
}
let browser;
try {
  for (let i = 0; ; i += 1) {
    try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* starting */ }
    if (i > 80) throw new Error(`wrangler did not start\n${wlog}`);
    await sleep(500);
  }
  const { chromium } = await import("playwright").catch(() => createRequire("/usr/lib/node_modules/")("playwright"));
  browser = await chromium.launch();
  // PWA(기획지시 PWA테스트빌드): 매니페스트·워커·아이콘
  const mf = await (await fetch(`${API}/manifest.webmanifest`)).json();
  assert.deepEqual([mf.start_url, mf.display, mf.orientation, mf.icons.length], ["/play", "fullscreen", "landscape", 3]);
  assert.match(await (await fetch(`${API}/sw.js`)).text(), /shell-/);
  assert.equal((await fetch(`${API}/icons/maskable-512.png`)).headers.get("content-type"), "image/png");
  step("PWA: 매니페스트(전체 화면·가로·시작 /play)·서비스 워커·아이콘");
  for (const vp of [{ width: 1280, height: 800, name: "데스크톱" }, { width: 830, height: 366, name: "휴대폰 가로", touch: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, ...(vp.touch ? { isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => { errors.push(String(e)); console.log("PAGEERR", String(e)); });
    await page.goto(`${API}/play`);
    await page.waitForSelector("#go");
    assert.equal(await page.inputValue("#dev"), "", "처음 열면 아이디를 묻는다");
    await page.click("#go");
    await page.waitForSelector(".toast");  // 아이디 없으면 시작 안 함
    await page.fill("#dev", `play-${vp.width}-${process.pid}`);
    await page.click("#go");
    await page.waitForSelector("[data-pick]", { timeout: 15000 });
    await noScroll(page, "픽");
    assert.equal(await page.$$eval("[data-pick]", (x) => new Set(x.map((e) => Math.round(e.getBoundingClientRect().top))).size), 2, "픽 5+4 두 줄");
    await page.click("[data-pick]", { force: true });
    await page.waitForSelector("[data-sp]", { timeout: 15000 });
    await page.screenshot({ path: `/tmp/play_lo_${vp.width}.png` });
    await noScroll(page, "스펠·덱");
    step(`${vp.name}: 시작 → 픽 → 스펠·덱 화면(스크롤 없음)`);
    await page.click("#ok");
    await page.waitForSelector("#side_me .face", { timeout: 15000 });
    await page.waitForSelector("#guide", { timeout: 5000 });  // 첫 턴 안내 3장(계정 첫 3판)
    for (let i = 0; i < 3; i += 1) await page.click("#gnext");
    assert.equal(await page.$("#guide"), null);
    await noScroll(page, "전투");
    const [opp, me] = await page.evaluate(() => ["#side_opp", "#side_me"].map((q) => document.querySelector(q).getBoundingClientRect().left));
    await page.screenshot({ path: `/tmp/play_t1_${vp.width}.png` });
    assert.ok(opp > me + 100, `상대 프로필 우상단, 내 프로필 좌하단 ${opp} ${me}`);
    step(`${vp.name}: 첫 턴 안내 3장 → 전투 화면(상대 프로필 우상단, 스크롤 없음)`);
    for (let t = 1; t <= 3; t += 1) {
      await page.waitForFunction(() => { const b = document.querySelector("#ok"); return b && !b.disabled; }, null, { timeout: 20000 });
      const before = await page.$$eval(".hand .bc", (x) => x.length);
      assert.ok(before >= 3, `손패 ${before}`);
      const playable = await page.$(".hand .bc:not(.cant):not(.lock)");
      if (playable) {
        await playable.click();
        assert.equal(await page.$$eval(".slot.mine .bc", (x) => x.length), 1, "내 슬롯에 카드");
        assert.match(await page.textContent(".slot.mine .lab"), /^[0-5] /, "슬롯 처리 단계 라벨");
      }
      if (t === 1 && !vp.touch) {  // 카드 상세(호버 0.2초)
        await page.mouse.move(0, 0);
        await page.hover(".hand .bc:not(.picked)", { force: true });
        await page.waitForSelector("#peek .pinfo", { timeout: 3000 });
        assert.match(await page.textContent("#peek .pinfo"), /처리 단계 [0-5]/);
        await page.mouse.move(0, 0);
      }
      await page.click("#ok");
      if (!playable) await page.click("#dY");  // 빈 확정 확인
      await page.waitForSelector(".skip", { timeout: 15000 });  // 공개 연출 시작(확정 버튼 자리에 건너뛰기)
      assert.equal(await page.$("#ok"), null, "공개 중 확정 버튼 없음");
      await page.waitForSelector("#cap.show", { timeout: 8000 });  // 효과 자막
      if (t === 2) { await sleep(900); await page.screenshot({ path: `/tmp/play_rev_${vp.width}.png` }); }
      await page.waitForFunction((n) => /턴 (\d+)/.test(document.querySelector(".turn")?.textContent ?? "") && !document.querySelector(".skip") && Number(document.querySelector(".turn").textContent.match(/턴 (\d+)/)[1]) === n, t + 1, { timeout: 20000 });
    }
    step(`${vp.name}: 전투 3턴(카드 선택·확정 → 공개 연출 → 다음 턴)`);
    const shot = `/tmp/play_${vp.width}.png`;
    await page.screenshot({ path: shot });
    const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1);
    assert.ok(!over, "화면 밖 넘침");
    await page.click("#menu");
    await page.click("#mSur");
    await page.click("#dY");
    await page.waitForSelector(".res h2", { timeout: 20000 });
    assert.equal((await page.textContent(".res h2")).trim(), "패배");
    await page.screenshot({ path: `/tmp/play_res_${vp.width}.png` });
    await noScroll(page, "결과");
    step(`${vp.name}: 항복 → 결과 화면(패배)`);
    await page.click("#again");
    await page.waitForSelector("[data-pick]", { timeout: 15000 });
    step(`${vp.name}: 다시 하기 → 새 판 픽 화면`);
    if (vp.touch) {  // 세로로 돌리면 안내 화면
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.isVisible("#rot"), "세로 안내");
      step("휴대폰 세로: '가로로 돌려 주세요' 안내");
    } else assert.ok(!(await page.isVisible("#rot")));
    assert.ok(await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => Boolean(r))), "서비스 워커 등록");
    assert.deepEqual(errors, []);
    await ctx.close();
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
