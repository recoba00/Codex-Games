// 통합 테스트(에셋 등록): Workers 런타임(wrangler 로컬) + 실제 Postgres + Storage 대역 + 실제 브라우저(Playwright)로 백오피스 화면 조작.
// 실행: PGHOST=… node test/live/assets.mjs  (npm run test:live:assets)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
process.env.PGREST_REAL_LIVE = "1";
const { pool, startPgRest, storage } = await import("./pg-rest.mjs");

const DB_PORT = 54395, API_PORT = 8875;
const API = `http://127.0.0.1:${API_PORT}`;
const here = new URL("../../", import.meta.url).pathname;
const fx = (n) => new URL(`../fixtures/assets/${n}`, import.meta.url).pathname;
const XLSX = readFileSync(new URL("../../../data/balance_v8.xlsx", import.meta.url));
const db = await startPgRest(DB_PORT);
writeFileSync(`${here}.dev.vars`, `SUPABASE_URL=http://127.0.0.1:${DB_PORT}\nSUPABASE_SERVICE_KEY=sb_secret_local\nTOKEN_SECRET=local-test-secret-local-test-secret-123\nLIVE_TTL_MS=500\n`);
// 시험마다 따로 둔 로컬 DO 저장소(앞 시험의 workerd가 늦게 끝나면 SQLITE_BUSY로 DO가 리셋되던 문제)
const PERSIST = `${here}.wrangler/live-${process.pid}`;
const wr = spawn("npx", ["wrangler", "dev", "--persist-to", PERSIST, "--port", String(API_PORT), "--ip", "127.0.0.1", "--var", "DEV_LOGIN:1"], { cwd: here, stdio: ["ignore", "pipe", "pipe"] });
let wlog = "";
wr.stdout.on("data", (d) => { wlog += d; });
wr.stderr.on("data", (d) => { wlog += d; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q, v) => pool.query(q, v).then((r) => r.rows);
async function call(path, body, token, raw, type) {
  const res = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": type ?? (raw ? "application/octet-stream" : "application/json"), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 && r.body?.ok !== false, `${r.status} ${JSON.stringify(r.body)?.slice(0, 400)}`); return r.body; };
const err = async (p, code) => { const r = await p; assert.equal(r.body?.error, code, JSON.stringify(r.body)); return r.body; };
const steps = [];
const step = (s) => { steps.push(s); console.log(`ok - ${s}`); };
let browser;
try {
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* */ } await sleep(500); }
  const tag = Date.now().toString(36);
  const boot = `BOOT-${tag}`;
  await sql("insert into public.staff_invites (code_hash, role, expires_at) values ($1, 'admin', now() + interval '1 day')", [createHash("sha256").update(boot).digest("hex")]);
  const pw = "pw-assets-0123456789";
  await ok(call("/bo/v1/register", { code: boot, login: `as${tag}`, name: "에셋", password: pw }));
  const admin = (await ok(call("/bo/v1/login", { login: `as${tag}`, password: pw }))).token;
  await ok(call("/bo/v1/settings", { key: "solo_mode", value: true, reason: "에셋 시험" }, admin));
  // 라이브 데이터가 없으면 xlsx로 하나 배포
  if (!(await sql("select version_id from public.data_live"))[0]?.version_id || (await sql("select status from public.data_versions where id = (select version_id from public.data_live)"))[0].status !== "published") {
    const up = await ok(call("/bo/v1/data/import?note=seed", XLSX, admin, true));
    await ok(call("/bo/v1/data/review", { version: up.version, action: "request" }, admin));
    await ok(call("/bo/v1/data/review", { version: up.version, action: "approve" }, admin));
    await ok(call("/bo/v1/data/publish", { version: up.version, reason: "seed" }, admin));
  }

  // 1) API: 슬롯·전신·축소본·얼굴 업로드(규격 검사) → 영역 → 저장소에 해시 이름. 초안 없이 바로 반영(기획지시 에셋분리)
  await sql("update public.asset_files set cur = null, prev = null");
  const put = (q, file) => call(`/bo/v1/assets/upload?${q}`, readFileSync(fx(file)), admin, true, "image/webp");
  const tier = await ok(put("kind=slot&slot=TIER_GOLD", "tier_vp8.webp"));
  assert.match(tier.path, /^slots\/TIER_GOLD\.[0-9a-f]{16}\.webp$/);
  assert.ok(storage.has(tier.path));
  await err(put("kind=slot&slot=CARD_BACK", "tier_vp8.webp"), "asset_spec");
  await err(put("kind=full&char=AU&skin=000", "full_bad.webp"), "asset_spec");
  await err(put("kind=full&char=ZZ&skin=000", "full_1080.webp"), "asset_char_invalid");
  await err(call(`/bo/v1/assets/upload?kind=face&char=AU&skin=000`, Buffer.from("not a webp file at all ............"), admin, true, "image/webp"), "asset_not_webp");
  await ok(put("kind=full&char=AU&skin=000", "full_1080.webp"));
  await ok(put("kind=thumb&char=AU&skin=000", "thumb.webp"));
  await ok(put("kind=face&char=AU&skin=000", "face.webp"));
  await err(call("/bo/v1/assets/regions", { char: "AU", skin: "000", card: { x: 0, y: 0.5, w: 1, h: 0.75 }, face: { x: 0, y: 0, w: 0.5, h: 0.28125 } }, admin), "asset_region");
  const reg = await ok(call("/bo/v1/assets/regions", { char: "AU", skin: "000", card: { x: 0, y: 0.1, w: 1, h: 0.75 }, face: { x: 0.3, y: 0.05, w: 0.4, h: 0.225 } }, admin));
  assert.match(reg.warnings[0], /432px/);
  const view = await ok(call("/bo/v1/assets", undefined, admin));
  assert.equal(view.editable, true);
  assert.deepEqual(Object.keys(view.art.AU["000"]).sort(), ["card", "face", "faceRect", "full", "thumb"]);
  assert.equal(typeof view.characters.find((c) => c.id === "AU").stats.hp, "number", "라이브 수치 읽기 전용");
  step("슬롯·전신·축소본·얼굴 업로드(크기·비율·WebP 검사, 해시 이름), 영역 저장(카드 3:4·얼굴 1:1, 512px 미만 경고) — 초안 없이 바로 반영");

  // 2) 게임 목록(/v1/assets) 바로 반영·ETag, 데이터 버전 배포·롤백·xlsx 업로드와 무관, 이전 파일로 되돌리기, 감사 로그
  const man = await ok(call("/v1/assets"));
  assert.match(man.rev, /^[0-9a-f]{16}$/);
  assert.ok(man.slots.TIER_GOLD.url.endsWith(tier.path));
  assert.deepEqual(man.art.AU["000"].card, { x: 0, y: 0.1, w: 1, h: 0.75 });
  const file = await fetch(man.art.AU["000"].full.url);
  assert.equal(file.status, 200);
  assert.equal((await file.arrayBuffer()).byteLength, readFileSync(fx("full_1080.webp")).length);
  const etag = (await fetch(`${API}/v1/assets`)).headers.get("etag");
  assert.ok(etag.includes(man.rev));
  assert.equal((await fetch(`${API}/v1/assets`, { headers: { "if-none-match": etag } })).status, 304);
  const up = await ok(call("/bo/v1/data/import?note=xlsx", XLSX, admin, true));
  assert.ok(!up.diff.some((x) => /^(assets|art)\./.test(x.id)), "변경표에 에셋 없음");
  await ok(call("/bo/v1/data/review", { version: up.version, action: "request" }, admin));
  await ok(call("/bo/v1/data/review", { version: up.version, action: "approve" }, admin));
  await ok(call("/bo/v1/data/publish", { version: up.version, reason: "xlsx" }, admin));
  await sleep(700);
  assert.ok((await ok(call("/v1/assets"))).slots.TIER_GOLD, "데이터 배포해도 에셋 그대로");
  await err(call("/bo/v1/assets/revert", { slot: "TIER_SILVER" }, admin), "asset_no_previous");
  const tier2 = await ok(put("kind=slot&slot=TIER_GOLD", "tier_alt.webp"));
  await ok(call("/bo/v1/assets/revert", { slot: "TIER_GOLD" }, admin));
  const back = (await ok(call("/bo/v1/assets", undefined, admin)));
  assert.equal(back.assets.slots.TIER_GOLD.path, tier.path, "직전 파일로 되돌림");
  assert.equal(back.prev.slots.TIER_GOLD.path, tier2.path, "되돌린 파일이 직전으로");
  await ok(call("/bo/v1/assets/remove", { char: "AU", skin: "000", kind: "face" }, admin));
  assert.equal((await ok(call("/v1/assets"))).art.AU["000"].face, null, "빼기 바로 반영");
  await ok(call("/bo/v1/assets/revert", { char: "AU", skin: "000", kind: "face" }, admin));
  assert.ok((await ok(call("/v1/assets"))).art.AU["000"].face, "빼기도 되돌림");
  // 합본(기본 배경 사용 안 함, 2026-10-29): 전신과 같은 규격, 게임 목록 bg = combined, 빼면 진영 기본 배경, 되돌리기
  await ok(put("kind=combined&char=AU&skin=000", "full_1080.webp"));
  let mm = await ok(call("/v1/assets"));
  assert.deepEqual([mm.art.AU["000"].bg, Boolean(mm.art.AU["000"].combined)], ["combined", true]);
  await err(put("kind=combined&char=AU&skin=000", "thumb.webp"), "asset_spec");
  await ok(call("/bo/v1/assets/remove", { char: "AU", skin: "000", kind: "combined" }, admin));
  mm = await ok(call("/v1/assets"));
  assert.deepEqual([mm.art.AU["000"].bg, mm.art.AU["000"].combined], ["CARD_BG_FIRE", null], "아우렐(불) 기본 배경");
  await ok(call("/bo/v1/assets/revert", { char: "AU", skin: "000", kind: "combined" }, admin));
  assert.equal((await ok(call("/v1/assets"))).art.AU["000"].bg, "combined");
  // 배경 방식(기획지시 배경방식): 컬러로 바꿔도 합본 파일은 그대로, 다시 합본으로 돌아오면 합본
  await err(call("/bo/v1/assets/bg", { char: "AU", skin: "000", mode: "color" }, admin), "value_invalid");
  await ok(call("/bo/v1/assets/bg", { char: "AU", skin: "000", mode: "color", color: "#1fa3a3" }, admin));
  mm = await ok(call("/v1/assets"));
  assert.deepEqual([mm.art.AU["000"].bg, mm.art.AU["000"].bgColor, Boolean(mm.art.AU["000"].combined)], ["color", "#1FA3A3", true]);
  await ok(call("/bo/v1/assets/bg", { char: "AU", skin: "000", mode: "combined" }, admin));
  mm = await ok(call("/v1/assets"));
  assert.deepEqual([mm.art.AU["000"].bg, mm.art.AU["000"].bgMode], ["combined", "combined"]);
  await ok(call("/bo/v1/assets/bg", { char: "AU", skin: "000", mode: "color" }, admin));  // 색을 안 보내면 전에 고른 색 유지
  assert.equal((await ok(call("/v1/assets"))).art.AU["000"].bgColor, "#1FA3A3");
  const audit = await sql("select action from public.audit_log where target like '에셋 %' order by id desc limit 20");
  assert.ok(audit.some((a) => a.action === "이전 파일로 되돌리기") && audit.some((a) => a.action === "슬롯 파일 교체"));
  step("게임 목록 바로 반영(ETag 304), xlsx 배포와 무관, 직전 파일 되돌리기(한 번 더 = 원복), 빼기 되돌리기, 합본(기본 배경 안 씀)·진영 기본 배경, 감사 로그");

  // 3) 실제 브라우저(휴대폰 크기)로 백오피스 화면: 초안 만들기 → PNG 슬롯 올리기(압축 확인 → 승인) → 전신 PNG(큰 것 → 1440×2560 축소) → 영역 지정 저장 → 불투명 배경 검사
  const { chromium } = await import("playwright").catch(() => createRequire("/usr/lib/node_modules/")("playwright"));  // CI는 npm i --no-save playwright
  browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 400, height: 900 } })).newPage();
  const perr = [];
  page.on("pageerror", (e) => perr.push(e.message));
  const reqs = [];
  page.on("request", (r) => reqs.push(new URL(r.url()).pathname));
  page.on("dialog", (dlg) => dlg.accept(dlg.type() === "prompt" ? "브라우저 시험" : undefined));
  await page.goto(`${API}/bo`);
  await page.evaluate((t) => sessionStorage.setItem("bo_tok", t), admin);
  await page.goto(`${API}/bo#assets`);
  await page.reload();
  await page.waitForSelector('[data-atab="slots"]', { timeout: 10000 }).catch(async (e) => { console.error("PAGE", (await page.evaluate(() => document.querySelector("#view")?.innerText ?? "")).slice(0, 800), perr); throw e; });
  await page.click('[data-atab="slots"]');
  assert.match(await page.textContent('[data-aslot="CARD_ART_C01"]'), /베기 · C01/, "카드 일러스트 슬롯 = 카드명 · ID(기획지시 카드명표시)");
  await page.click('[data-aslot="CARD_ART_C02"]');
  await page.waitForFunction(() => document.querySelector("h2")?.textContent.includes("강타 · C02"));
  assert.match(await page.textContent("#view"), /종류 공격 · 비용 2E/);
  await page.click("#aBack"); await page.waitForSelector('[data-aslot="TIER_SILVER"]');
  await page.click('[data-aslot="TIER_SILVER"]');
  await page.waitForSelector("#aSlotFile", { state: "attached" });
  await page.setInputFiles("#aSlotFile", fx("tier.png"));
  await page.waitForSelector("#aOk");
  assert.match(await page.textContent("#aPrep"), /WebP 512×512/);
  await page.click("#aOk");
  await page.waitForFunction(() => [...document.querySelectorAll("img")].some((i) => i.src.includes("TIER_SILVER")));
  // 확인 창은 페이지 안 창(일부 앱 내 브라우저가 confirm을 막아 버튼이 안 먹히던 문제): 빼기 → 확인 → 되돌리기 → 확인
  await page.click("#aSlotDel"); await page.click('.dlg [data-x="1"]');
  await page.waitForFunction(() => !document.querySelector("#aSlotDel") && document.querySelector("#aSlotRev"));
  await page.click("#aSlotRev"); await page.click('.dlg [data-x="1"]');
  await page.waitForSelector("#aSlotDel");
  // 투명 아닌 PNG도 올라감(경고만, 2026-10-29)
  await page.click('[data-anext="TIER_GOLD"]');
  await page.waitForFunction(() => document.querySelector("h2")?.textContent.includes("TIER_GOLD"));
  await page.setInputFiles("#aSlotFile", fx("opaque.png"));
  await page.waitForSelector("#aOk");
  assert.match(await page.textContent("#aPrep"), /참고: .*그대로 올려도 돼요/);
  await page.click("#aBack");
  await page.waitForSelector('[data-aslot="TIER_SILVER"] img');
  await page.locator('[data-aslot="TIER_SILVER"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "/tmp"}/bo_assets_slots.png` });
  await page.click('[data-aslot="BG_LOBBY"]');
  await page.waitForSelector("#aSlotFile", { state: "attached" });
  await page.setInputFiles("#aSlotFile", fx("tier.png"));
  await page.waitForSelector("#aPrep .note");
  assert.match(await page.textContent("#aPrep"), /비율이 달라요/);
  await page.click('[data-anext="BG_BATTLE"]');
  await page.waitForFunction(() => document.querySelector("h2")?.textContent.includes("BG_BATTLE"));
  await page.setInputFiles("#aSlotFile", fx("full_1620.png"));
  await page.waitForSelector("#aPrep .note");
  await page.click("#aBack");
  await page.click('[data-atab="chars"]');
  await page.waitForSelector('[data-ach="SE"]');
  await page.locator('[data-ach="AU"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "/tmp"}/bo_assets_list.png` });
  await page.evaluate(() => sessionStorage.setItem("bo_wasm_webp", "1"));  // iPhone Safari처럼 브라우저 WebP 저장이 없을 때 → libwebp 인코더(/bo/vendor)
  await page.click('[data-ach="SE"]');
  await page.waitForSelector("#aFull", { state: "attached" });
  await page.setInputFiles("#aFull", fx("full_1620.png"));
  await page.waitForSelector("#aOk");
  assert.match(await page.textContent("#aPrep"), /1620×2880 .* → WebP 1440×2560/);
  await page.click("#aOk");
  await page.waitForSelector("#rgFull", { timeout: 15000 });
  await page.fill("#rgC", "600"); await page.dispatchEvent("#rgC", "input");  // 카드 영역을 너비 60%로 줄이고
  const box = await page.locator("#rgFull").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.4);   // 가운데로 끌기
  await page.click('[data-rm="face"]');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.18);
  await page.click("#aRegSave");
  await page.waitForFunction(() => document.body.textContent.includes("카드 영역 지정됨"));
  await page.waitForSelector("#rgFull"); await page.locator("#aReg").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "/tmp"}/bo_regions.png` });
  // 카드 배경 3가지(기획지시 배경방식): 합본 → 업로드 칸, 컬러 → 칩 고르기 → 저장
  await page.check('input[name="aBgMode"][value="combined"]');
  await page.waitForSelector("#aComb", { state: "attached" });
  await page.check('input[name="aBgMode"][value="color"]');
  await page.click('[data-bgc="#8E44AD"]');
  await page.click("#aBgSave");
  for (let i = 0; i < 20 && (await ok(call("/v1/assets"))).art.SE?.["000"]?.bg !== "color"; i += 1) await sleep(200);
  await page.waitForSelector('[data-bgc="#8E44AD"]'); await page.locator("#aBgSave").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "/tmp"}/bo_card_bg.png` });
  const seBg = (await ok(call("/v1/assets"))).art.SE["000"];
  assert.deepEqual([seBg.bg, seBg.bgMode, seBg.bgColor, seBg.bgSlot], ["color", "color", "#8E44AD", "CARD_BG_WATER"], JSON.stringify(seBg));
  await page.click('[data-askin="000"]');
  await page.fill("#aSkinNew", "001"); await page.click("#aSkinAdd");
  await page.waitForFunction(() => document.body.textContent.includes("스킨 001 이미지"));
  const art = (await ok(call("/bo/v1/assets", undefined, admin))).art;
  assert.equal(art.SE["000"].full.w, 1440);
  assert.equal(art.SE["000"].thumb.h, 1024);
  const cd = art.SE["000"].card;
  assert.ok(Math.abs(cd.w - 0.6) < 0.01 && Math.abs(cd.x + cd.w / 2 - 0.5) < 0.02 && Math.abs(cd.y + cd.h / 2 - 0.4) < 0.04, JSON.stringify(cd));
  assert.ok(Math.abs(cd.h * 2560 - (cd.w * 1440 * 4) / 3) < 3, "카드 3:4 유지");
  assert.ok(Math.abs(art.SE["000"].faceRect.x + art.SE["000"].faceRect.w / 2 - 0.5) < 0.02);
  // 데이터 배포 버튼(사용자 보고 2026-10-29: 앱 안 브라우저에서 안 먹힘 → 페이지 안 확인 창): 승인된 초안 → 배포 → 확인 → 라이브
  const up2 = await ok(call("/bo/v1/data/import?note=browser", XLSX, admin, true));
  await ok(call("/bo/v1/data/review", { version: up2.version, action: "request" }, admin));
  await ok(call("/bo/v1/data/review", { version: up2.version, action: "approve" }, admin));
  await page.goto(`${API}/bo#data`); await page.reload();
  await page.click(`[data-act="publish"][data-v="${up2.version}"]`);
  await page.click('.dlg [data-x="1"]');
  for (let i = 0; i < 30 && Number((await sql("select version_id from public.data_live"))[0].version_id) !== up2.version; i += 1) await sleep(200);
  assert.equal(Number((await sql("select version_id from public.data_live"))[0].version_id), up2.version, "배포 버튼 → 라이브");
  // 카드 미리보기(홀로 0~4 · 티어 프레임 7)
  await page.goto(`${API}/bo#cardPreview`); await page.reload();
  await page.waitForSelector(".pvc");
  assert.equal(await page.locator(".pvc").count(), 12, "홀로 5 + 프레임 7");
  await page.click('[data-pv="ch"][data-v="SE"]'); await page.waitForSelector(".pvc.h4");
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "/tmp"}/bo_card_preview.png`, fullPage: true });
  await page.click('[data-pv="tab"][data-v="battle"]'); await page.waitForSelector(".bc");
  assert.equal(await page.locator(".bc").count(), 34, "전투카드 공용 16 + 전용 18");
  await page.click('[data-pv="bm"][data-v="hand"]'); await page.waitForSelector(".bc.hand"); await page.click('[data-pv="bm"][data-v="detail"]'); await page.waitForSelector(".bc .tx");
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "/tmp"}/bo_battle_preview.png`, fullPage: true });
  await page.click('[data-pv="tab"][data-v="char"]'); await page.waitForSelector(".pvc");
  assert.deepEqual(perr, []);
  assert.ok(reqs.includes("/bo/vendor/webp_enc.wasm"), "libwebp 인코더 사용");
  step("브라우저(400px 폭): 목록 → 슬롯 상세(압축 확인·승인, 같은 묶음 다음 슬롯 이동) → 캐릭터 상세: PNG 슬롯 압축 확인·승인 → 비율 틀린 파일 거부 → 큰 전신 PNG를 1440×2560 WebP로(브라우저 WebP 없을 때 libwebp 인코더) → 영역 편집기(카드 위아래·얼굴 끌기) 저장, 카드 배경 토글, 확인 창(빼기·되돌리기·데이터 배포)");

  console.log(`\n에셋 통합 테스트 ${steps.length}단계 통과`);
} catch (error) {
  console.error("FAIL:", error.message, error.stack?.split("\n").slice(1, 3).join(" "));
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=assets live test::${String(error.message).replace(/\n/g, " ").slice(0, 900)}`);
  console.error(wlog.split("\n").filter((l) => /error|Error|✘/.test(l)).slice(-20).join("\n"));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  wr.kill("SIGTERM");
  db.close();
  await pool.end().catch(() => {});
  rmSync(`${here}.dev.vars`, { force: true });
  setTimeout(() => { try { rmSync(PERSIST, { recursive: true, force: true }); } catch { /* */ } }, 300);
  setTimeout(() => process.exit(), 500);
}
