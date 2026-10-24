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
const wr = spawn("npx", ["wrangler", "dev", "--port", String(API_PORT), "--ip", "127.0.0.1", "--var", "DEV_LOGIN:1"], { cwd: here, stdio: ["ignore", "pipe", "pipe"] });
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

  // 1) API: 에셋 초안 → 슬롯·전신·축소본·얼굴 업로드(규격 검사) → 영역 → 저장소에 해시 이름
  const v = (await ok(call("/bo/v1/assets/draft", { note: "에셋 시험" }, admin))).version;
  const put = (q, file) => call(`/bo/v1/assets/upload?version=${v}&${q}`, readFileSync(fx(file)), admin, true, "image/webp");
  const tier = await ok(put("kind=slot&slot=TIER_GOLD", "tier_vp8.webp"));
  assert.match(tier.path, /^slots\/TIER_GOLD\.[0-9a-f]{16}\.webp$/);
  assert.ok(storage.has(tier.path));
  await err(put("kind=slot&slot=CARD_BACK", "tier_vp8.webp"), "asset_spec");
  await err(put("kind=full&char=AU&skin=000", "full_bad.webp"), "asset_spec");
  await err(put("kind=full&char=ZZ&skin=000", "full_1080.webp"), "asset_char_invalid");
  await err(call(`/bo/v1/assets/upload?version=${v}&kind=face&char=AU&skin=000`, Buffer.from("not a webp file at all ............"), admin, true, "image/webp"), "asset_not_webp");
  await ok(put("kind=full&char=AU&skin=000", "full_1080.webp"));
  await ok(put("kind=thumb&char=AU&skin=000", "thumb.webp"));
  await ok(put("kind=face&char=AU&skin=000", "face.webp"));
  await err(call("/bo/v1/assets/regions", { version: v, char: "AU", skin: "000", card: { x: 0, y: 0.5, w: 1, h: 0.75 }, face: { x: 0, y: 0, w: 0.5, h: 0.28125 } }, admin), "asset_region");
  const reg = await ok(call("/bo/v1/assets/regions", { version: v, char: "AU", skin: "000", card: { x: 0, y: 0.1, w: 1, h: 0.75 }, face: { x: 0.3, y: 0.05, w: 0.4, h: 0.225 } }, admin));
  assert.match(reg.warnings[0], /432px/);
  const view = await ok(call(`/bo/v1/assets?version=${v}`, undefined, admin));
  assert.equal(view.editable, true);
  assert.deepEqual(Object.keys(view.art.AU["000"]).sort(), ["card", "face", "faceRect", "full", "thumb"]);
  step("에셋 초안 → 슬롯·전신·축소본·얼굴 업로드(크기·비율·WebP 검사, 해시 이름), 영역 저장(카드 너비 전체 3:4·얼굴 1:1, 512px 미만 경고)");

  // 2) 검수 → 배포 → 게임 목록(/v1/assets)·파일 내려받기, 검수 요청 뒤엔 못 고침, xlsx 업로드가 에셋을 이어받음, 롤백
  await ok(call("/bo/v1/data/review", { version: v, action: "request" }, admin));
  await err(put("kind=slot&slot=TIER_SILVER", "tier_vp8.webp"), "state_invalid");
  await ok(call("/bo/v1/data/review", { version: v, action: "approve" }, admin));
  await ok(call("/bo/v1/data/publish", { version: v, reason: "에셋" }, admin));
  await sleep(700);
  const man = await ok(call("/v1/assets"));
  assert.equal(man.version, v);
  assert.ok(man.slots.TIER_GOLD.url.endsWith(tier.path));
  assert.deepEqual(man.art.AU["000"].card, { x: 0, y: 0.1, w: 1, h: 0.75 });
  const file = await fetch(man.art.AU["000"].full.url);
  assert.equal(file.status, 200);
  assert.equal((await file.arrayBuffer()).byteLength, readFileSync(fx("full_1080.webp")).length);
  const up = await ok(call("/bo/v1/data/import?note=xlsx", XLSX, admin, true));
  const vd = await sql("select name from public.data_tables where version_id = $1 order by name", [up.version]);
  assert.ok(vd.some((x) => x.name === "assets") && vd.some((x) => x.name === "art"), "xlsx 초안이 에셋을 이어받음");
  assert.ok(!up.diff.some((x) => /^(assets|art)\./.test(x.id)), "변경표에 에셋 변경 없음");
  await ok(call("/bo/v1/data/review", { version: up.version, action: "discard" }, admin));
  step(`검수 요청 뒤 잠김 → 승인·배포(v${v}) → 게임 목록·파일 내려받기, xlsx 업로드 초안이 에셋을 이어받음(변경표 0건)`);

  // 3) 실제 브라우저(휴대폰 크기)로 백오피스 화면: 초안 만들기 → PNG 슬롯 올리기(압축 확인 → 승인) → 전신 PNG(큰 것 → 1440×2560 축소) → 영역 지정 저장 → 불투명 배경 검사
  const { chromium } = await import("playwright").catch(() => createRequire("/usr/lib/node_modules/")("playwright"));  // CI는 npm i --no-save playwright
  browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 400, height: 900 } })).newPage();
  const perr = [];
  page.on("pageerror", (e) => perr.push(e.message));
  page.on("dialog", (dlg) => dlg.accept(dlg.type() === "prompt" ? "브라우저 시험" : undefined));
  await page.goto(`${API}/bo`);
  await page.evaluate((t) => sessionStorage.setItem("bo_tok", t), admin);
  await page.goto(`${API}/bo#assets`);
  await page.reload();
  await page.waitForSelector("#aVer", { timeout: 10000 }).catch(async (e) => { console.error("PAGE", (await page.textContent("body")).slice(0, 500), perr); throw e; });
  await page.click("#aNew");
  await page.waitForFunction(() => document.querySelector("#aVer option:checked")?.textContent.includes("초안"));
  await page.click('[data-atab="slots"]');
  await page.click('[data-aslot="TIER_SILVER"]');
  await page.waitForSelector("#aSlotFile", { state: "attached" });
  await page.setInputFiles("#aSlotFile", fx("tier.png"));
  await page.waitForSelector("#aOk");
  assert.match(await page.textContent("#aPrep"), /WebP 512×512/);
  await page.click("#aOk");
  await page.waitForFunction(() => [...document.querySelectorAll("img")].some((i) => i.src.includes("TIER_SILVER")));
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
  await page.click('[data-askin="000"]');
  await page.fill("#aSkinNew", "001"); await page.click("#aSkinAdd");
  await page.waitForFunction(() => document.body.textContent.includes("스킨 001 이미지"));
  const draft = Number(await page.$eval("#aVer", (s) => s.value));
  const art = (await sql("select body from public.data_tables where version_id = $1 and name = 'art'", [draft]))[0].body;
  assert.equal(art.SE["000"].full.w, 1440);
  assert.equal(art.SE["000"].thumb.h, 1024);
  const cd = art.SE["000"].card;
  assert.ok(Math.abs(cd.w - 0.6) < 0.01 && Math.abs(cd.x + cd.w / 2 - 0.5) < 0.02 && Math.abs(cd.y + cd.h / 2 - 0.4) < 0.04, JSON.stringify(cd));
  assert.ok(Math.abs(cd.h * 2560 - (cd.w * 1440 * 4) / 3) < 3, "카드 3:4 유지");
  assert.ok(Math.abs(art.SE["000"].faceRect.x + art.SE["000"].faceRect.w / 2 - 0.5) < 0.02);
  assert.deepEqual(perr, []);
  step("브라우저(400px 폭): 목록 → 슬롯 상세(압축 확인·승인, 같은 묶음 다음 슬롯 이동) → 캐릭터 상세: 에셋 초안 → PNG 슬롯 압축 확인·승인 → 비율 틀린 파일 거부 → 큰 전신 PNG를 1440×2560 WebP로 → 영역 편집기(카드 위아래·얼굴 끌기) 저장");

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
  setTimeout(() => process.exit(), 500);
}
