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
  await err(call(`/bo/v1/assets/upload?kind=full&char=AU&skin=000`, Buffer.from("not a webp file at all ............"), admin, true, "image/webp"), "asset_not_webp");
  await err(put("kind=face&char=AU&skin=000", "face.webp"), "asset_kind_invalid");  // 얼굴 파일 폐지(기획지시 2026-11-06 캐릭터등록단순화)
  await ok(put("kind=full&char=AU&skin=000", "full_1080.webp"));
  await ok(put("kind=thumb&char=AU&skin=000", "thumb.webp"));
  await err(call("/bo/v1/assets/regions", { char: "AU", skin: "000", faceC: { x: 0.25, y: 0.1, w: 0.5, h: 0.35714 } }, admin), "asset_combined_missing");  // 얼굴은 합본에서만
  const view = await ok(call("/bo/v1/assets", undefined, admin));
  assert.equal(view.editable, true);
  assert.deepEqual(Object.keys(view.art.AU["000"]).sort(), ["full", "thumb"]);
  assert.deepEqual(view.spec.lineSlots, ["ACTIVE_01", "ACTIVE_02", "PICK", "WIN", "LOSE"]);
  assert.equal(typeof view.characters.find((c) => c.id === "AU").stats.hp, "number", "라이브 수치 읽기 전용");
  step("슬롯·전신·축소본 업로드(크기·비율·WebP 검사, 해시 이름), 얼굴 파일 폐지, 얼굴 영역은 합본이 있어야 — 초안 없이 바로 반영");

  // 2) 게임 목록(/v1/assets) 바로 반영·ETag, 데이터 버전 배포·롤백·xlsx 업로드와 무관, 이전 파일로 되돌리기, 감사 로그
  const man = await ok(call("/v1/assets"));
  assert.match(man.rev, /^[0-9a-f]{16}$/);
  assert.ok(man.slots.TIER_GOLD.url.endsWith(tier.path));
  assert.deepEqual([man.art.AU["000"].combined, man.art.AU["000"].faceRectC, man.art.AU["000"].skillAnim, man.art.AU["000"].lines.length], [null, null, null, 5]);
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
  // 합본(필수, 5:7·800×1120): 올리면 게임 목록 combined, 빼면 null(게임은 전신 임시), 되돌리기
  await err(put("kind=combined&char=AU&skin=000", "full_1080.webp"), "asset_spec");  // 9:16 합본은 안 받음(백오피스가 5:7로 잘라 올림)
  await ok(put("kind=combined&char=AU&skin=000", "comb_800.webp"));
  let mm = await ok(call("/v1/assets"));
  assert.equal(mm.art.AU["000"].combined.w, 800);
  await err(put("kind=combined&char=AU&skin=000", "thumb.webp"), "asset_spec");
  await ok(call("/bo/v1/assets/remove", { char: "AU", skin: "000", kind: "combined" }, admin));
  assert.equal((await ok(call("/v1/assets"))).art.AU["000"].combined, null, "빼기 바로 반영");
  await ok(call("/bo/v1/assets/revert", { char: "AU", skin: "000", kind: "combined" }, admin));
  assert.ok((await ok(call("/v1/assets"))).art.AU["000"].combined, "빼기도 되돌림");
  // 얼굴 영역 = 합본 기준 1:1(faceRectC). 옛 값(card·faceRect)은 표에 남김
  await sql("update public.asset_files set cur = $1 where key = 'art:AU:000:regions'", [{ card: { x: 0, y: 0, w: 1, h: 0.7875 }, faceRect: { x: 0.3, y: 0.05, w: 0.4, h: 0.225 } }]).catch(() => null);
  await err(call("/bo/v1/assets/regions", { char: "AU", skin: "000", faceC: { x: 0, y: 0, w: 0.5, h: 0.5 } }, admin), "asset_region");
  await ok(call("/bo/v1/assets/regions", { char: "AU", skin: "000", faceC: { x: 0.25, y: 0.1, w: 0.5, h: 0.35714 } }, admin));
  mm = await ok(call("/v1/assets"));
  assert.equal(mm.art.AU["000"].faceRectC.x, 0.25);
  assert.equal(mm.art.AU["000"].card, undefined, "옛 카드 영역은 안 내보냄");
  // 대사(텍스트)·음성(ogg·mp3)·스킬 애니메이션(투명 WebM)
  await ok(call("/bo/v1/assets/line", { char: "AU", skin: "000", slot: "PICK", text: "Let the stars decide." }, admin));
  await err(call("/bo/v1/assets/line", { char: "AU", skin: "000", slot: "TAUNT", text: "x" }, admin), "value_invalid");
  const media = (q, file, type) => call(`/bo/v1/assets/upload?${q}`, readFileSync(fx(file)), admin, true, type);
  const vo = await ok(media("kind=voice&char=AU&skin=000&line=PICK&sec=1.4", "voice.ogg", "audio/ogg"));
  assert.match(vo.path, /^voice\/AU_000_PICK\.[0-9a-f]{16}\.ogg$/);
  assert.equal(storage.get(vo.path).type, "audio/ogg");
  await err(media("kind=voice&char=AU&skin=000&line=PICK", "anim.webm", "video/webm"), "asset_spec");
  await err(media("kind=voice&char=AU&skin=000&line=NOPE", "voice.ogg", "audio/ogg"), "value_invalid");
  const an = await ok(media("kind=anim&char=AU&skin=000&sec=2.4", "anim.webm", "video/webm"));
  assert.match(an.warnings[0], /2\.4초/, "길이 권장 넘으면 경고만");
  mm = await ok(call("/v1/assets"));
  assert.deepEqual(mm.art.AU["000"].lines.find((l) => l.slot === "PICK"), { slot: "PICK", text: "Let the stars decide.", voice: mm.base + vo.path });
  assert.equal(mm.art.AU["000"].skillAnim.url, mm.base + an.path);
  await ok(call("/bo/v1/assets/remove", { char: "AU", skin: "000", kind: "voice_PICK" }, admin));
  assert.equal((await ok(call("/v1/assets"))).art.AU["000"].lines.find((l) => l.slot === "PICK").voice, null);
  await ok(call("/bo/v1/assets/revert", { char: "AU", skin: "000", kind: "voice_PICK" }, admin));
  const audit = await sql("select action from public.audit_log where target like '에셋 %' order by id desc limit 20");
  assert.ok(audit.some((a) => a.action === "이전 파일로 되돌리기") && audit.some((a) => a.action === "슬롯 파일 교체"));
  step("게임 목록 바로 반영(ETag 304), xlsx 배포와 무관, 직전 파일 되돌리기, 합본(필수) 빼기·되돌리기, 합본 얼굴 영역, 대사·음성·스킬 애니메이션 업로드, 감사 로그");

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
  // 합본이 있는 아우렐: 합본 위 얼굴 영역 끌기 → 저장 → 게임 목록 faceRectC. 대사 저장·음성 재생 칸·스킬 영상
  await page.click('[data-ach="AU"]');
  await page.waitForSelector("#rcFull");
  assert.match(await page.textContent("#view"), /등록 검사.*✓ 전신.*✓ 합본\(필수\).*✓ 합본 얼굴 영역/s);
  await page.locator("#rcFull").scrollIntoViewIfNeeded();
  const cb = await page.locator("#rcFull").boundingBox();
  await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height * 0.2);
  await page.click("#aRegSave");
  for (let i = 0; i < 20 && Math.abs(((await ok(call("/v1/assets"))).art.AU["000"].faceRectC?.y ?? 0) - 0.1) < 0.001; i += 1) await sleep(200);
  const auF = (await ok(call("/v1/assets"))).art.AU["000"];
  assert.ok(Math.abs(auF.faceRectC.y + auF.faceRectC.h / 2 - 0.2) < 0.04, JSON.stringify(auF.faceRectC));
  await page.waitForSelector("#lt_WIN");
  await page.fill("#lt_WIN", "The stars were with me."); await page.click('[data-lsave="WIN"]');
  for (let i = 0; i < 20 && (await ok(call("/v1/assets"))).art.AU["000"].lines.find((l) => l.slot === "WIN").text === ""; i += 1) await sleep(200);
  assert.equal((await ok(call("/v1/assets"))).art.AU["000"].lines.find((l) => l.slot === "WIN").text, "The stars were with me.");
  await page.waitForSelector("#lt_WIN");
  await page.setInputFiles('[data-lvoice="WIN"]', fx("voice.ogg"));
  for (let i = 0; i < 30 && !(await ok(call("/v1/assets"))).art.AU["000"].lines.find((l) => l.slot === "WIN").voice; i += 1) await sleep(200);
  assert.ok((await ok(call("/v1/assets"))).art.AU["000"].lines.find((l) => l.slot === "WIN").voice, "음성 올리기(압축 없이 그대로)");
  await page.waitForSelector('audio[src*="voice/AU_000_WIN"]');
  assert.ok(await page.$('video[src*="anim/AU_000"]'), "스킬 애니메이션 미리보기");
  await page.waitForSelector("#rcFull"); await page.locator("#aRegC").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "/tmp"}/bo_face_combined.png` });
  await page.click("#aBack"); await page.waitForSelector('[data-ach="SE"]');
  await page.evaluate(() => sessionStorage.setItem("bo_wasm_webp", "1"));  // iPhone Safari처럼 브라우저 WebP 저장이 없을 때 → libwebp 인코더(/bo/vendor)
  await page.click('[data-ach="SE"]');
  await page.waitForSelector("#aFull", { state: "attached" });
  await page.setInputFiles("#aFull", fx("full_1620.png"));
  await page.waitForSelector("#aOk");
  assert.match(await page.textContent("#aPrep"), /1620×2880 .* → WebP 1440×2560/);
  await page.click("#aOk");
  await page.waitForFunction(() => document.body.textContent.includes("합본을 올려 주세요"), null, { timeout: 15000 });  // 합본 없는 스킨 안내(게임은 전신 임시)
  // 합본 영역 선택 창(기획지시 2026-11-06 합본영역선택): 9:16 PNG → 5:7 틀 cover·가운데 시작, 끌기·슬라이더·두 손가락 확대, 격자·카드 미리보기, 저장 = 800×1120
  await sleep(1000); await page.setInputFiles("#aComb", fx("full_1620.png"));
  await page.waitForSelector("#ccF canvas");
  await page.waitForSelector("#ccP .pvc");
  assert.match(await page.textContent("#ccW"), /선택 영역 1620×2268px → 800×1120/, "처음엔 꽉 채움(가로 전체)");
  await page.locator("#ccF").scrollIntoViewIfNeeded();
  const fb = await page.locator("#ccF").boundingBox();
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2); await page.mouse.down(); await page.mouse.move(fb.x + fb.width / 2 + 80, fb.y + fb.height / 2 + 400, { steps: 4 }); await page.mouse.up();  // 틀 밖으로 못 나감
  assert.match(await page.textContent("#ccW"), /1620×2268/);
  { // 두 손가락 벌리기(휴대폰 핀치) → 확대
    const cdp = await page.context().newCDPSession(page), cx = fb.x + fb.width / 2, cy = fb.y + fb.height / 2;
    const tp = (d) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(20) });
    for (const d of [30, 45, 60]) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(d) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const zv = Number(await page.inputValue("#ccZ"));
    assert.ok(zv >= 150, `핀치 확대 ${zv}%`);
  }
  await page.fill("#ccZ", "300"); await page.dispatchEvent("#ccZ", "input");
  assert.match(await page.textContent("#ccW"), /선택 영역 540×756px — 출력 800×1120보다 작아/, "작으면 경고만");
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "/tmp"}/bo_comb_crop.png` });
  await page.fill("#ccZ", "100"); await page.dispatchEvent("#ccZ", "input");
  await page.click("#ccS");
  for (let i = 0; i < 30 && !(await ok(call("/v1/assets"))).art.SE?.["000"]?.combined; i += 1) await sleep(200);
  assert.deepEqual([(await ok(call("/v1/assets"))).art.SE["000"].combined.w, (await ok(call("/v1/assets"))).art.SE["000"].combined.h], [800, 1120]);
  await page.waitForSelector("#faceNext");  // 저장 뒤 바로 얼굴 영역 지정(건너뛰기 가능)
  await page.waitForSelector("#rcFull"); await page.click("#faceSkip"); assert.equal(await page.$("#faceNext"), null);
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "/tmp"}/bo_char_simple.png`, fullPage: true });
  await page.click('[data-askin="000"]');
  await page.fill("#aSkinNew", "001"); await page.click("#aSkinAdd");
  await page.waitForSelector('[data-askin="001"].pri');
  const art = (await ok(call("/bo/v1/assets", undefined, admin))).art;
  assert.equal(art.SE["000"].full.w, 1440);
  assert.equal(art.SE["000"].thumb.h, 1024);
  assert.equal(art.SE["000"].combined.w, 800);
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
  step("브라우저(400px 폭): 목록 → 슬롯 상세(압축 확인·승인, 같은 묶음 다음 슬롯 이동) → 캐릭터 상세: PNG 슬롯 압축 확인·승인 → 비율 틀린 파일 거부 → 큰 전신 PNG를 1440×2560 WebP로(브라우저 WebP 없을 때 libwebp 인코더) → 합본 9:16 PNG 자동 5:7 자르기, 합본 얼굴 영역 끌기 저장, 대사 저장·음성 올리기·영상 미리보기, 확인 창(빼기·되돌리기·데이터 배포)");

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
