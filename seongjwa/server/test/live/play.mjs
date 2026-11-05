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
      if (e.closest(".plist")) continue;  // 픽 목록만 세로 스크롤 예외(총괄 5장, 기획지시 밴픽화면재배치)
      if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)) out.push(e.className || e.id || e.tagName);
      const r = e.getBoundingClientRect(), sf = window.__SAFE || { t: 0, r: 0, b: 0, l: 0 };  // 안전 영역 안(기획지시 픽5열안전영역)
      if (e.matches("button,.bc,.pvc,.side,.ctl,.pk,.qcard,.emp,.rr h2,.stats") && r.width && s.visibility !== "hidden" && !e.closest(".backs,#rot") && (r.bottom > innerHeight - sf.b + 2 || r.right > innerWidth - sf.r + 2 || r.left < sf.l - 2 || r.top < sf.t - 2)) out.push("밖:" + (e.id || e.className));
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
  for (const vp of [{ width: 1280, height: 800, name: "데스크톱" }, { width: 2000, height: 1080, name: "4K(배율 2 화면)" }, { width: 932, height: 430, name: "큰 폰(아이폰 프로맥스)", touch: true, safe: { t: 0, r: 59, b: 21, l: 59 } }, { width: 1366, height: 1024, name: "태블릿(아이패드 프로)", touch: true, safe: { t: 0, r: 0, b: 20, l: 0 } }, { width: 830, height: 366, name: "휴대폰 가로", touch: true }, { width: 844, height: 390, name: "안전 영역 큰 휴대폰(좌우 47·아래 21)", touch: true, safe: { t: 0, r: 47, b: 21, l: 47 } }].filter((v) => !process.env.PLAY_VP || process.env.PLAY_VP.split(",").includes(String(v.width)))) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, ...(vp.touch ? { isMobile: true, hasTouch: true } : {}) });
    if (vp.safe) await ctx.addInitScript((sf) => { window.__SAFE = sf; }, vp.safe);
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
    await page.screenshot({ path: `/tmp/play_pick_${vp.width}${vp.safe ? 's' : ''}.png` });
    const rowsTop = await page.$$eval("[data-pick]", (x) => x.map((e) => Math.round(e.getBoundingClientRect().top)));
    assert.deepEqual([new Set(rowsTop).size, rowsTop.filter((t) => t === rowsTop[0]).length], [2, 5], "픽 목록 5열(5+4)");
    assert.ok(!(await page.$(".plist.scr2")), "9명일 때 스크롤 없음");
    const pw = await page.$eval("[data-pick]", (e) => e.getBoundingClientRect().width);
    console.log(`  픽 카드 폭 ${vp.name} ${Math.round(pw)}px`);
    const picked = await page.$eval("[data-pick]:nth-child(2)", (e) => e.dataset.pick);
    await page.click("[data-pick]:nth-child(2)");
    if (vp.touch) await page.click("#pok");  // 선택 확정
    else step("데스크톱: 눌러만 두고 시간 초과 기다림(15초)");
    await page.waitForSelector("[data-sp]", { timeout: 25000 });
    assert.equal(await page.evaluate(() => S.st.prep.myPick), picked, "확정한/눌러 둔 캐릭터로 픽");
    assert.equal(await page.$$eval(".deck2 .bc", (x) => x.length), 12, "덱 12장(프리셋 10 + 전용 2)");
    console.log(`  덱 카드 폭 ${vp.name} ${Math.round(await page.$eval(".deck2 .bc", (e) => e.getBoundingClientRect().width))}px`);
    await page.screenshot({ path: `/tmp/play_lo_${vp.width}${vp.safe ? 's' : ''}.png` });
    await noScroll(page, "스펠·덱");
    step(`${vp.name}: 시작 → 픽 → 스펠·덱 화면(스크롤 없음)`);
    await page.click("#ok");
    await page.waitForSelector("#side_me", { timeout: 15000 });
    await page.waitForSelector("#guide", { timeout: 5000 });  // 첫 턴 안내 3장(계정 첫 3판)
    for (let i = 0; i < 3; i += 1) await page.click("#gnext");
    assert.equal(await page.$("#guide"), null);
    await noScroll(page, "전투");
    const [opp, me] = await page.evaluate(() => ["#side_opp", "#side_me"].map((q) => document.querySelector(q).getBoundingClientRect().left));
    await page.screenshot({ path: `/tmp/play_t1_${vp.width}${vp.safe ? 's' : ''}.png` });
    assert.ok(opp > me + 100, `상대 프로필 우상단, 내 프로필 좌하단 ${opp} ${me}`);
    { const g = await page.evaluate(() => { const sf = window.__SAFE || { b: 0 }; let bot = 0; for (const e of document.querySelectorAll(".hand .bc,.ctl,.mec")) bot = Math.max(bot, e.getBoundingClientRect().bottom); return Math.round(innerHeight - sf.b - bot); });
      console.log(`  전투 하단 여백(안전 영역 제외) ${vp.name} ${g}px`); }
    step(`${vp.name}: 첫 턴 안내 3장 → 전투 화면(상대 프로필 우상단, 스크롤 없음)`);
    { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });  // 휴대폰 수준(CPU 4배 느리게)에서 전투 화면 다시 그리기 시간
      const ms = await page.evaluate(() => { const t = performance.now(); for (let i = 0; i < 5; i += 1) { render(); document.body.getBoundingClientRect(); } return (performance.now() - t) / 5; });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }); console.log(`  전투 화면 다시 그리기(CPU 4배 느림) ${vp.name} ${Math.round(ms)}ms`); assert.ok(ms < 250, `다시 그리기 ${ms}ms`); }
    for (let t = 1; t <= 3; t += 1) {
      await page.waitForFunction(() => { const b = document.querySelector("#ok"); return b && !b.disabled; }, null, { timeout: 20000 });
      const before = await page.$$eval(".hand .bc", (x) => x.length);
      assert.ok(before >= 3, `손패 ${before}`);
      await sleep(300);  // AI가 선택 시작 때 바로 확정 → 화면 갱신이 한 번 지나가도록
      const playable = await page.$(".hand .bc:not(.cant):not(.lock)");
      if (playable) {
        await page.locator(".hand .bc:not(.cant):not(.lock)").first().click();
        assert.equal(await page.$$eval(".slot.mine .bc", (x) => x.length), 1, "내 슬롯에 카드");
        assert.equal(await page.$$eval(".slot.mine .fl.flb", (x) => x.length), 2, "나머지 슬롯은 카드 뒷면(빈 칸 3장 기본)");
      }
      if (t === 1 && !vp.touch) {  // 카드 상세(호버 0.2초)
        await page.mouse.move(0, 0);
        // 전투카드 길게 누르기(사용자 요청 2026-11-05): 딤 + 왼쪽 카드·오른쪽 설명, 누르면 닫힘. 호버만으로는 안 뜸
        await page.hover(".hand .bc:not(.picked)", { force: true }); await sleep(400);
        assert.equal(await page.$("#peek"), null, "호버만으로 카드 상세 안 뜸");
        await page.mouse.down(); await sleep(500); await page.mouse.up();
        await page.waitForSelector("#peek.cdm", { timeout: 3000 });
        await page.screenshot({ path: `/tmp/play_card_${vp.width}.png` });
        await page.mouse.click(10, 10);
        await page.waitForFunction(() => !document.querySelector("#peek"), null, { timeout: 2000 });
        // 액티브 스킬 연출(시안): 2초, 오른쪽 아래 스킵
        await page.evaluate(() => skillCut(S.st.battle.me.char, "me", 2000));
        await sleep(700); await page.screenshot({ path: `/tmp/play_skill_${vp.width}.png` });
        await page.click(".scut .sskip");
        assert.equal(await page.$(".scut"), null, "스킵하면 바로 닫힘");
        const nSlot = await page.$$eval(".slot.mine", (x) => x.length);
        assert.equal(nSlot, 3, "빈 슬롯은 3칸(낸 만큼 늘어남)");
        await page.evaluate(() => { const id = Object.keys(S.st.battle.me.spells)[0]; S.sel.spell = id; render(); });
        await page.waitForSelector(".slot.mine .spcard"); assert.equal(await page.$$eval(".slot.mine", (x) => x.length), 3);
        await page.evaluate(() => { S.sel.spell = null; render(); });  // 스펠 = 카드 UI(시험용으로 쿨다운 무시하고 표시만 → 되돌림)
        const sp = await page.$("button[data-spell]:not([disabled])");
        if (sp) { await sp.click(); await page.waitForSelector(".slot.mine .spcard"); assert.equal(await page.$$eval(".slot.mine", (x) => x.length), (await page.$$eval(".slot.mine .bc", (x) => x.length)) > 2 ? 4 : 3);
          await page.screenshot({ path: `/tmp/play_spell_${vp.width}.png` }); await page.click("button[data-spell].on"); }
        await page.evaluate(() => { float("opp", "-128", ""); float("me", "-245", "crit"); setTimeout(() => float("opp", "+60", "heal"), 120); });
        await sleep(450); await page.screenshot({ path: `/tmp/play_fx_${vp.width}.png` });
        await page.mouse.move(0, 0);
      }
      await page.click("#ok");
      if (!playable) await page.click("#dY");  // 빈 확정 확인
      await page.waitForSelector(".skip", { timeout: 15000 }).catch(async (e) => { console.log("DBG", await page.evaluate(() => JSON.stringify({ ok: document.querySelector("#ok")?.textContent, toast: [...document.querySelectorAll(".toast,.dlg")].map((x) => x.textContent), sel: S.sel, sub: S.st?.battle?.me?.mySubmission, ws: S.ws?.readyState, q: S.outq, phase: S.st?.phase, anim: !!S.anim }))); throw e; });  // 공개 연출 시작(확정 버튼 자리에 건너뛰기)
      assert.equal(await page.$("#ok"), null, "공개 중 확정 버튼 없음");
      await page.waitForSelector("#bub", { timeout: 8000 });  // 효과 자막(슬롯 옆 말풍선)
      if (t === 1 && playable) await page.waitForSelector("#bt .zoom", { timeout: 10000 });  // 슬롯에서 커지는 확대(전투UX2차 1)
      assert.ok(await page.$(".obar i"), "처리 순서 막대");
      if (t === 2) { await sleep(1300); await page.screenshot({ path: `/tmp/play_rev_${vp.width}.png` }); }
      if (t >= 2) await page.click("#skip");  // 건너뛰기(연출 상한 20초라 시험 시간 단축)
      await page.waitForFunction((n) => (S.hlog?.[n] ?? []).length > 0, t);  // 전투로그(서랍)에 이번 턴 기록
      await page.waitForFunction((n) => Number(document.querySelector("#bt")?.dataset.turn) === n && !document.querySelector(".skip"), t + 1, { timeout: 20000 });
      await page.waitForSelector(".tban b", { timeout: 3000 }).catch(() => null);
      { const tb = await page.evaluate(() => { const e = document.querySelector(".tban b"), bt = document.getElementById("bt"); if (!e) return null; const r = e.getBoundingClientRect(); return { c: r.left + r.width / 2, bc: innerWidth / 2 }; });
        assert.ok(tb, "턴 시작 배너"); if (tb) { assert.ok(Math.abs(tb.c - tb.bc) < 14, `턴 배너 가운데 ${Math.round(tb.c)} / 화면 ${Math.round(tb.bc)}`); if (t === 1) await page.screenshot({ path: `/tmp/play_ban_${vp.width}.png` }); } }
      // 양쪽 연출이 끝나면(AI는 즉시) 남은 공개 시간을 버리고 선택 20초가 새로 시작
      // 타이머 = 확정 버튼(기획지시 타이머버튼): 글자 "확정 (N초 남음)" + 10초 넘으면 골드(#F5B93A)
      await page.waitForFunction(() => { const m = /확정 \((\d+)초 남음\)/.exec(document.querySelector("#ok")?.textContent ?? ""); return m && Number(m[1]) >= 18; }, null, { timeout: 4000 });
      await page.waitForFunction(() => { const e = document.querySelector("#ok"); return e && getComputedStyle(e).backgroundColor === "rgb(245, 185, 58)"; }, null, { timeout: 3000 });  // 확정 버튼 골드(10초 넘음)
    }
    step(`${vp.name}: 전투 3턴(카드 선택·확정 → 공개 연출 → 다음 턴)`);
    const shot = `/tmp/play_${vp.width}.png`;
    await page.screenshot({ path: shot });
    const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1);
    assert.ok(!over, "화면 밖 넘침");
    await page.click("#menu");
    await page.click("#mSur");
    await page.click("#dY");
    await page.waitForSelector(".rr h2", { timeout: 20000 });
    assert.equal((await page.textContent(".rr h2")).trim(), "패배");
    assert.equal(await page.$$eval(".stats .st", (x) => x.length), 5, "결과 통계 5가지");
    await page.screenshot({ path: `/tmp/play_res_${vp.width}${vp.safe ? 's' : ''}.png` });
    await noScroll(page, "결과");
    await page.screenshot({ path: `/tmp/play_res_${vp.width}${vp.safe ? 's' : ''}.png` });
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
  if (!process.env.PLAY_VP || process.env.PLAY_VP.includes("pvp")) {  // 유저 대전(랜덤 매칭) + 밴픽 닉네임(사용자 요청 2026-11-05)
    const pages = [];
    for (const [id, nick] of [[`pvpa${process.pid}`, `알파${process.pid % 1000}`], [`pvpb${process.pid}`, `베타${process.pid % 1000}`]]) {
      const c = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
      const pg = await c.newPage(); pg.on("pageerror", (e) => { throw e; });
      await pg.goto(`${API}/play`); await pg.fill("#dev", id); await pg.fill("#nick", nick); await pg.click("#pvp");
      pages.push([pg, nick]);
    }
    for (const [pg] of pages) await pg.waitForSelector("[data-pick],[data-ban]", { timeout: 30000 });
    for (const [pg] of pages) {  // 시간 보장: 두 사람 모두 접속한 때부터 밴 시간(로컬 데이터 10초)을 센다
      const leftMs = await pg.evaluate(() => S.st.phaseDeadline - now());
      assert.ok(leftMs > 7000, `매칭 뒤 밴 시간이 줄어 있음 ${leftMs}ms`);
    }
    const labs = await Promise.all(pages.map(([pg]) => pg.$$eval(".lab2", (x) => x.map((e) => e.textContent))));
    assert.ok(labs[0].join(" ").includes(pages[0][1]) && labs[0].join(" ").includes(pages[1][1]), `밴픽에 닉네임 ${labs[0]}`);
    assert.ok(labs[1].join(" ").includes(pages[1][1]) && labs[1].join(" ").includes(pages[0][1]), `밴픽에 닉네임 ${labs[1]}`);
    await pages[0][0].screenshot({ path: "/tmp/play_pvp_ban.png" });
    step("유저 대전: 두 사람 랜덤 매칭 → 밴픽 화면에 서로의 닉네임");
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
