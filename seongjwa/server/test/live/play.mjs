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
  for (const f of ["lobby", "battle"]) { const r = await fetch(`${API}/bgm/${f}.mp3`); assert.equal(r.status, 200, `배경음악 ${f}`); assert.match(r.headers.get("content-type") ?? "", /audio\/mpeg/); }
  assert.match(await (await fetch(`${API}/sw.js`)).text(), /shell-/);
  assert.equal((await fetch(`${API}/icons/maskable-512.png`)).headers.get("content-type"), "image/png");
  step("PWA: 매니페스트(전체 화면·가로·시작 /play)·서비스 워커·아이콘");
  for (const vp of [{ width: 1280, height: 800, name: "데스크톱" }, { width: 2000, height: 1080, name: "4K(배율 2 화면)" }, { width: 932, height: 430, name: "큰 폰(아이폰 프로맥스)", touch: true, safe: { t: 0, r: 59, b: 21, l: 59 } }, { width: 1366, height: 1024, name: "태블릿(아이패드 프로)", touch: true, safe: { t: 0, r: 0, b: 20, l: 0 } }, { width: 830, height: 366, name: "휴대폰 가로", touch: true }, { width: 844, height: 390, name: "안전 영역 큰 휴대폰(좌우 47·아래 21)", touch: true, safe: { t: 0, r: 47, b: 21, l: 47 } }].filter((v) => !process.env.PLAY_VP || process.env.PLAY_VP.split(",").includes(String(v.width)))) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: vp.touch ? "ko-KR" : "en-US", ...(vp.touch ? { isMobile: true, hasTouch: true } : {}) });  // 휴대폰은 한국어, 데스크톱은 영어(다국어 1차)
    if (vp.safe) await ctx.addInitScript((sf) => { window.__SAFE = sf; }, vp.safe);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => { errors.push(String(e)); console.log("PAGEERR", String(e)); });
    await page.goto(`${API}/play`);
    await page.waitForSelector("#lobby #play");  // 로비(Figma 로비 시안, 사용자 요청 2026-11-07)
    assert.equal(await page.inputValue("#dev"), "", "처음 열면 아이디를 묻는다");
    assert.equal(await page.getAttribute('[data-mode="ai"]', "class"), "on", "처음 모드는 AI 대전");
    await page.click("#play");
    await page.waitForSelector(".toast");  // 아이디 없으면 시작 안 함
    await page.fill("#dev", `play-${vp.width}-${process.pid}`);
    await page.click("#play");
    await page.waitForSelector("[data-pick]", { timeout: 25000 }).catch(async (e) => { console.log("START", vp.name, JSON.stringify(await page.evaluate(() => ({ q: document.querySelector("#qbox")?.textContent, toast: [...document.querySelectorAll(".toast")].map((t) => t.textContent), app: document.querySelector("#app")?.firstElementChild?.className, st: S.st && S.st.phase, tok: !!S.tok, room: sessionStorage.getItem("play_room") })))); throw e; });
    await noScroll(page, "픽");
    await page.screenshot({ path: `/tmp/play_pick_${vp.width}${vp.safe ? 's' : ''}.png` });
    const rowsTop = await page.$$eval("[data-pick]", (x) => x.map((e) => Math.round(e.getBoundingClientRect().top)));
    assert.deepEqual([new Set(rowsTop).size, rowsTop.filter((t) => t === rowsTop[0]).length], [2, 5], "픽 목록 5열(5+4)");
    { const L = await page.$$eval("[data-pick]", (x) => x.map((e) => Math.round(e.getBoundingClientRect().left))); assert.equal(L[5], L[0], "둘째 줄 왼쪽 정렬(픽스펠UI정돈2 5번)"); }
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
    const rc = (q) => page.evaluate((q) => { const b = document.querySelector(q)?.getBoundingClientRect(); return b && [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 10) / 10); }, q);
    const gearLo = await rc("#fSet");
    { const v = await page.evaluate(() => { const c = (q) => { const b = document.querySelector(q).getBoundingClientRect(); return b.top + b.height / 2; }; const r = (q) => document.querySelector(q).getBoundingClientRect();
        const ml = r(".lab4.me span"), mc = r(".cc4.me>*"), ol = r(".lab4.opp span"), oc = r(".cc4.opp>*"), k = S.L4 ? 1 : 1, z = (S.zs || 1) * prepGeo().k;
        return { cy: ["#fSet", "#fHelp", ".pk4 .chip", ".hlab", "#tm"].map(c), meGap: (mc.top - ml.bottom) / z, opGap: (oc.top - ol.bottom) / z, meCx: Math.abs((ml.left + ml.right) / 2 - (mc.left + mc.right) / 2), cols: new Set([...document.querySelectorAll(".deck2 .bc")].map((e) => Math.round(e.getBoundingClientRect().top))).size };
      });
      assert.ok(Math.max(...v.cy) - Math.min(...v.cy) <= 1, `위 줄 수직 중앙 ${v.cy}`);  // 픽스펠UI정돈2 1번
      assert.ok(Math.abs(v.meGap - 8) <= 1 && Math.abs(v.opGap - 8) <= 1 && v.meCx <= 1, `이름 뱃지 = 카드 8px 위 가운데 ${JSON.stringify(v)}`);  // 2·3번
    }
    step(`${vp.name}: 시작 → 픽 → 스펠·덱 화면(스크롤 없음)`);
    const meLo = await rc(".cc4.me>*"), opLo = await rc(".cc4.opp>*");
    await page.click("#ok");
    await page.waitForSelector("#side_me", { timeout: 15000 });
    await page.waitForSelector("#guide", { timeout: 5000 });  // 첫 턴 안내 3장(계정 첫 3판)
    for (let i = 0; i < 3; i += 1) await page.click("#gnext");
    assert.equal(await page.$("#guide"), null);
    await noScroll(page, "전투");
    { const gearBt = await rc("#menu"); console.log(`  ⚙ 좌표 ${vp.name} 스펠·덱 ${gearLo} / 전투 ${gearBt}`); assert.ok(gearLo.every((v, i) => Math.abs(v - gearBt[i]) <= 1), "⚙ 위치·크기 = 전투(세 화면 일치, 픽스펠UI정돈2 4번)");
      const meBt = await rc("#side_me"), opBt = await rc("#side_opp"); console.log(`  카드 전투 내 ${meBt} 상대 ${opBt} / 스펠·덱 내 ${meLo} 상대 ${opLo}`);
      assert.ok(meLo.every((v, i) => Math.abs(v - meBt[i]) <= 1.5) && opLo.every((v, i) => Math.abs(v - opBt[i]) <= 1.5), "내 카드·상대 카드 위치·크기 = 전투(4번)"); }
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
        await page.click("#side_opp");  // 프로필 누르면 패시브 보기(전신·속성 효과), 누르면 닫힘
        await page.waitForSelector(".pview"); await sleep(500); await page.screenshot({ path: `/tmp/play_passive_${vp.width}.png` });
        await page.click(".pview"); assert.equal(await page.$(".pview"), null, "패시브 보기 닫힘");
        // 액티브 스킬 연출(시안): 2초, 오른쪽 아래 스킵
        await page.evaluate(() => skillCut(S.st.battle.me.char, "me", 2000));
        await sleep(700); await page.screenshot({ path: `/tmp/play_skill_${vp.width}.png` });
        await page.click(".scut .sskip");
        assert.equal(await page.$(".scut"), null, "스킵하면 바로 닫힘");
        // 설정의 스킬 연출 보기: 1회 재생 후 정지·배경만 반복, 다시 보기, 방식 전환, 바깥 탭으로 닫기(기획지시 2026-11-06 결과텍스트·스킬보기 2)
        await page.evaluate(() => skPreview(S.st.battle.me.char));
        await page.waitForSelector(".skpv .skx"); await sleep(Math.round(2000 * 1) + 800);
        assert.ok(await page.$(".scut.pv"), "1회 재생 후 마지막 장면에서 정지(창 유지)");
        await page.click('.skpb [data-r]'); assert.ok(await page.$(".scut.pv"), "다시 보기");
        await page.click('.skpb [data-m="over"]'); await sleep(200);
        assert.ok(await page.$(".scut.over"), "오버레이로 바로 이어서");
        await page.mouse.click(vp.width / 2, vp.height / 2); await sleep(100);
        assert.equal(await page.$(".skpv"), null, "바깥 탭으로 닫힘"); assert.equal(await page.$(".scut"), null);
        await page.evaluate(() => { S.skm = "full"; lsSet("play_skm", "full"); });
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
        await page.evaluate(() => { emoteShow({ seat: S.st.you, id: "EMOTE_HELLO" }, true); emoteShow({ seat: 1 - S.st.you, id: "EMOTE_THINK" }, true); });
        await sleep(300); await page.screenshot({ path: `/tmp/play_emo_${vp.width}.png` });
        const au = await page.evaluate(() => ({ st: SND.ctx && SND.ctx.state, cur: SND.cur }));  // 소리: 첫 클릭 뒤 오디오 켜짐, 전투 곡
        assert.equal(au.cur, "battle", JSON.stringify(au));
        await page.mouse.move(0, 0);
      }
      await page.click("#ok");
      if (!playable) await page.click("#dY");  // 빈 확정 확인
      await page.waitForSelector(".skip", { timeout: 15000 }).catch(async (e) => { console.log("DBG", await page.evaluate(() => JSON.stringify({ ok: document.querySelector("#ok")?.textContent, toast: [...document.querySelectorAll(".toast,.dlg")].map((x) => x.textContent), sel: S.sel, sub: S.st?.battle?.me?.mySubmission, ws: S.ws?.readyState, q: S.outq, phase: S.st?.phase, anim: !!S.anim }))); throw e; });  // 공개 연출 시작(확정 버튼 자리에 건너뛰기)
      assert.equal(await page.$("#ok"), null, "공개 중 확정 버튼 없음");
      await page.waitForSelector("#bub", { timeout: 8000 });  // 효과 자막(슬롯 옆 말풍선)
      if (t === 1 && playable) await page.waitForSelector("#bt .zoom", { timeout: 10000 });  // 슬롯에서 커지는 확대(전투UX2차 1)
      assert.ok(!(await page.$(".obar")), "가운데 처리 순서 줄 없음(기획지시 2026-11-06)");
      if (t === 2) assert.ok(await page.$("#phk"), "공개 중 단계 칩 유지");
      if (t === 2) console.log("center", JSON.stringify(await page.evaluate(() => { const c = document.querySelector("#bt .center").getBoundingClientRect(), z = document.querySelector("#stg"), k = parseFloat(z.style.zoom) || 1; return { h: Math.round(c.height / (S.zs || 1)), design: Math.round(c.height / (S.zs || 1) / k), k }; })));
      if (t === 2) { await sleep(1300); await page.screenshot({ path: `/tmp/play_rev_${vp.width}.png` }); }
      if (t >= 2) await page.click("#skip");  // 건너뛰기(연출 상한 20초라 시험 시간 단축)
      await page.waitForFunction((n) => (S.hlog?.[n] ?? []).length > 0, t);  // 전투로그(서랍)에 이번 턴 기록
      await page.waitForFunction((n) => Number(document.querySelector("#bt")?.dataset.turn) === n && !document.querySelector(".skip"), t + 1, { timeout: 20000 });
      await page.waitForSelector(".tban b", { timeout: 3000 }).catch(() => null);
      { const tb = await page.evaluate(() => { const e = document.querySelector(".tban b"), bt = document.getElementById("bt"); if (!e) return null; for (const a of e.closest(".tbx").getAnimations()) { a.pause(); a.currentTime = a.effect.getComputedTiming().duration * 0.5; }  // 사선 슬라이드 중이 아니라 안착 뒤 위치(기획지시 배너폰트·임팩트)
          const r = e.getBoundingClientRect(); return { c: r.left + r.width / 2, bc: innerWidth / 2 }; });
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
    {  // HP 0 즉시 종료(상세 01): skip 로그 문구, K.O. 연출(영어 표기·쓰러짐·섬광)
      const sk = await page.evaluate(() => { const ob = S.st.battle, G = groupsOf([{ t: "skip", phases: [4, 5], cards: [{ seat: ob.you, id: ob.me.hand[0]?.id || "C01" }] }, { t: "end", outcome: "a", reason: "hp" }], ob.you); return G.map((g) => capOf(g, ob.you, ob).html).join(" / "); });
      assert.match(sk, /K\.O\. · 처리하지 않은 단계: 4 공격 · 5 종료 \(안 나간 카드: 나 /);
      const ko = await page.evaluate(() => { koShow({ me: 100, opp: 0 }); return !!document.querySelector("#side_opp.down") && !!document.querySelector("#bt .ko b"); });
      assert.ok(ko, "K.O. 쓰러진 프로필·표기");  // 화면 갱신(턴 시작)과 겹칠 수 있어 같은 틱에서 확인
      await sleep(500); await page.screenshot({ path: `/tmp/play_ko_${vp.width}.png` });
      // 상태 아이콘 탭 = 카드 상세와 같은 틀(사용자 요청 2026-11-06)
      await page.evaluate(() => { const i = document.createElement("i"); i.className = "bf"; i.id = "tstbf"; i.dataset.st = JSON.stringify([{ n: "작열 ×2", p: "2턴 남음", d: stDoc("burn")[1], c: "#e5533d", u: "", c1: "작", w: "opp" }, { n: "표식", p: "이번 턴", d: stDoc("mark")[1], c: "#c58bff", u: "", c1: "표", w: "opp" }]); document.body.appendChild(i); stModal(i); });
      assert.ok(await page.$("#peek.stm .sti.big"), "상태 상세 창");
      await sleep(450); await page.screenshot({ path: `/tmp/play_st_${vp.width}.png` });
      await page.evaluate(() => { peekHide(); document.getElementById("tstbf")?.remove(); });
      await page.evaluate(() => { document.querySelectorAll(".ko,.koflash").forEach((x) => x.remove()); document.querySelectorAll(".down").forEach((x) => x.classList.remove("down")); $("bt").classList.remove("koing"); });
    }
    { // 다국어 1차(기획지시 2026-11-07): 기기 언어로 시작, 연출 라벨 한/영 번역표, 폭주 배너 별 장식 없음
      const lg = await page.evaluate(() => ({ lang: S.lang, chip: T("ph.1"), turn: T("bn.turn"), rush: T("bn.rush"), shield: T("lb.shield", { n: 12 }), html: document.documentElement.lang }));
      if (vp.touch) assert.deepEqual([lg.lang, lg.chip, lg.turn, lg.rush, lg.shield], ["ko", "보호", "턴", "폭주 시작", "실드 +12"]);
      else assert.deepEqual([lg.lang, lg.chip, lg.turn, lg.rush, lg.shield], ["en", "GRD", "Turn", "RAMPAGE", "SHIELD +12"]);
      assert.equal(lg.html, lg.lang);
      // 상단 알약 약어(기획지시 2026-11-07 알약약어): 한 2글자·영 3글자, 칸 폭 고정, 글자가 칸·숫자 뱃지와 겹치지 않음
      const pl = await page.evaluate(() => [...document.querySelectorAll(".kp[data-k]")].map((e) => { const tn = [...e.childNodes].find((n) => n.nodeType === 3), rg = document.createRange(); rg.selectNodeContents(tn); const t = rg.getBoundingClientRect(), r = e.getBoundingClientRect();
        const hit = [...e.querySelectorAll("em")].some((m) => { const b = m.getBoundingClientRect(); return b.left < t.right && b.right > t.left && b.top < t.bottom && b.bottom > t.top; });
        return { tx: tn.textContent, w: Math.round(r.width), fit: t.left >= r.left - 0.5 && t.right <= r.right + 0.5, hit }; }));
      assert.deepEqual(pl.map((x) => x.tx), vp.touch ? ["스펠", "면역", "방어", "반격", "침묵", "방해", "스킬", "공격"] : ["SPL", "IMM", "SHD", "CTR", "SIL", "DIS", "SKL", "ATK"]);
      assert.equal(new Set(pl.map((x) => x.w)).size, 1, "알약 폭 고정"); assert.ok(pl.every((x) => x.fit && !x.hit), "알약 글자 겹침 " + JSON.stringify(pl));
      assert.ok(!(await page.content()).includes("★"), "별 장식 없음");
      // 설정 > 도움말: 목록 + 내용, 카드 도감(서버 데이터) → 카드 상세, 화면 짚어 보기(Coach)
      await page.evaluate(() => helpOpen("cards"));
      await page.waitForSelector("#help .hcard");
      assert.equal(await page.locator("#help nav button").count(), 9);
      assert.ok((await page.locator("#help .hcard").count()) >= 16, "카드 도감");
      await page.screenshot({ path: `/tmp/play_help_${vp.width}.png` });
      await page.click("#help .hcard"); await page.waitForSelector("#peek.cdm"); await page.evaluate(() => peekHide());
      await page.click('#help [data-hk="spells"]'); assert.ok(!/N%|[+−-]N\b/.test(await page.textContent("#hSec")), "스펠 N 치환");
      await page.click('#help [data-hk="view"]'); await page.click("#hTour");
      await page.waitForSelector("#coach .cbox"); assert.ok(await page.$("#coach .cring"), "대상 링");
      await page.click("#cNext"); await page.click("#cSkip"); assert.equal(await page.$("#coach"), null, "건너뛰기");
      // 언어 전환은 바로 반영
      await page.evaluate(() => { langNext(); render(); }); assert.notEqual(await page.evaluate(() => S.lang), lg.lang); await page.evaluate(() => { langNext(); render(); });
    }
    await page.click("#menu");
    // 설정 "캐릭터 음성"(기본 켜짐, 상세 01 캐릭터 보이스): 끄고 켜기, 음성 파일 없는 슬롯은 무음(오류 없음)
    assert.match(await page.textContent("#mVo"), /켜짐/);
    await page.click("#mVo"); await page.waitForFunction(() => /꺼짐/.test(document.querySelector("#mVo")?.textContent ?? ""));
    await page.click("#mVo"); await page.waitForFunction(() => /켜짐/.test(document.querySelector("#mVo")?.textContent ?? ""));
    await page.evaluate(() => { voice(S.st.battle.me.char, "ACTIVE"); voice(S.st.battle.me.char, "WIN"); });
    if (!(await page.$("#mSur"))) await page.click("#menu");
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
      await pg.goto(`${API}/play`); await pg.click('[data-mode="rank"]'); await pg.fill("#dev", id); await pg.fill("#nick", nick); await pg.click("#play");
      pages.push([pg, nick]);
    }
    for (const [pg] of pages) await pg.waitForSelector("[data-pick],[data-ban]", { timeout: 40000 }).catch(async (e) => {
      for (const [p2, n2] of pages) console.log("PVP", n2, JSON.stringify(await p2.evaluate(() => ({ q: document.querySelector("#qbox")?.textContent, toast: [...document.querySelectorAll(".toast")].map((t) => t.textContent), st: S.st && S.st.phase, qws: !!S.qws, tok: !!S.tok }))));
      throw e; });
    for (const [pg] of pages) {  // 시간 보장: 두 사람 모두 접속한 때부터 밴 시간(로컬 데이터 10초)을 센다
      const leftMs = await pg.evaluate(() => S.st.phaseDeadline - now());
      assert.ok(leftMs > 7000, `매칭 뒤 밴 시간이 줄어 있음 ${leftMs}ms`);
    }
    const labs = await Promise.all(pages.map(([pg]) => pg.$$eval(".lab4 span", (x) => x.map((e) => e.textContent))));
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
