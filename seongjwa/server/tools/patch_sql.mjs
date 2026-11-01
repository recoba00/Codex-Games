// 수치 패치 CSV(개발/수치패치_vN.csv) → 라이브 버전을 복사한 새 데이터 버전을 만드는 SQL (사용자 요청 2026-11-01).
// CSV 열: 시트,셀,항목,이전,이후. '이전'이 기준 버전 값과 다르면 SQL을 만들지 않고 멈춘다(엉뚱한 칸을 고치는 사고 방지).
// 지원: 캐릭터(F~J 스탯, N 패시브 문구, O 액티브 문구, R 패시브 수치, S 액티브 수치), 전투카드(F 비용·G 계수·H 타수·I 관통·J 효과·M 효과_짧게),
//       스펠(B 효과·C 효과값·D 쿨다운, 항목에 스펠 이름), 설정값(항목에 키 이름 포함, 값만), 추천덱(B 유형 또는 카드 장수 칸: 항목에 '캐릭터 유형' 포함, 이후 = 공용 10장 목록 "C01,C01,…").
// 사용: node tools/patch_sql.mjs <patch.csv> <base_version.json> <base_id> <staff_uuid> "<메모>" > patch.sql
//   base_version.json = 기준 버전 스냅샷(data_versions.snapshot). 결과 SQL은 초안 생성 → 수정 → 검수 요청·승인(1인 운영 모드) → 배포까지 한 번에 한다.
import { readFileSync } from "node:fs";
import { kitKeys } from "../src/bo/importer.mjs";

const [csvPath, basePath, baseId, staff, note = ""] = process.argv.slice(2);
if (!csvPath || !basePath || !baseId || !/^[0-9a-f-]{36}$/.test(staff ?? "")) {
  console.error("사용: node tools/patch_sql.mjs <patch.csv> <base.json> <base_id> <staff_uuid> [메모]");
  process.exit(2);
}
const base = JSON.parse(readFileSync(basePath, "utf8"));

function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false; else cur += c; continue; }
    if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i += 1; row.push(cur); if (row.some((x) => x !== "")) rows.push(row); row = []; cur = ""; } else cur += c;
  }
  row.push(cur); if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}
const rows = parseCsv(readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
const head = rows.shift().map((x) => x.trim());
const col = (n) => { const i = head.indexOf(n); if (i < 0) throw new Error(`CSV 열 '${n}' 없음`); return i; };
const [cS, cC, cI, cB, cA] = ["시트", "셀", "항목", "이전", "이후"].map(col);

const KIT = kitKeys();
const errors = [];
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const num = (s, where) => { const v = Number(String(s).trim()); if (!Number.isFinite(v)) errors.push(`${where}: 숫자가 아님 '${s}'`); return v; };
const parseKit = (s, cid, slot, where) => {
  const out = {};
  for (const part of String(s).split(";").map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/^([a-z][a-z0-9_]*)\s*=\s*(-?[0-9]+(?:\.[0-9]+)?)$/);
    if (!m) { errors.push(`${where}: 형식 오류 '${part}'`); continue; }
    if (!(m[1] in (KIT[cid]?.[slot] ?? {}))) errors.push(`${where}: 알 수 없는 키 '${m[1]}'`);
    out[m[1]] = Number(m[2]);
  }
  return out;
};
const sameKit = (a, b) => { const ka = Object.keys(a).sort(), kb = Object.keys(b ?? {}).sort(); return ka.join() === kb.join() && ka.every((k) => Number(a[k]) === Number(b[k])); };
const splitSkill = (s, where) => { const i = s.indexOf(":"); if (i < 0) { errors.push(`${where}: '이름: 설명' 형식이 아님`); return ["", s]; } return [s.slice(0, i).trim(), s.slice(i + 1).trim()]; };
const byName = (obj, item) => Object.entries(obj).find(([id, x]) => item.includes(id) || (x.name && item.startsWith(x.name)))?.[0];

const CHAR_COL = { F: "hp", G: "atk", H: "def", I: "spd", J: "crit" };
const CARD_COL = { F: "cost", G: "coef", H: "hits", I: "pierce", J: "effect_text", M: "effect_short" };
const updates = []; const changed = [];
const chars = structuredClone(base.characters);

for (const r of rows) {
  const sheet = r[cS].trim(), cell = r[cC].trim().toUpperCase(), item = r[cI].trim(), before = r[cB], after = r[cA];
  const letter = cell.replace(/[0-9]+$/, ""), where = `${sheet} ${cell} ${item}`;
  if (sheet === "캐릭터") {
    const id = byName(base.characters, item);
    if (!id) { errors.push(`${where}: 캐릭터를 항목에서 찾지 못함`); continue; }
    const c = base.characters[id];
    if (CHAR_COL[letter]) {
      const f = CHAR_COL[letter];
      if (Number(c[f]) !== num(before, where)) errors.push(`${where}: 이전 값 ${before} ≠ 기준 ${c[f]}`);
      updates.push(`update public.characters set ${f} = ${num(after, where)} where version_id = v and id = ${lit(id)};`);
      chars[id][f] = Number(after);
    } else if (letter === "N" || letter === "O") {
      const p = letter === "N" ? "passive" : "active";
      const [bn, bt] = splitSkill(before.trim(), where), [an, at] = splitSkill(after.trim(), where);
      if (bn !== c[`${p}_name`] || bt !== c[`${p}_text`]) errors.push(`${where}: 이전 문구가 기준과 다름 → 기준 '${c[`${p}_name`]}: ${c[`${p}_text`]}'`);
      updates.push(`update public.characters set ${p}_name = ${lit(an)}, ${p}_text = ${lit(at)} where version_id = v and id = ${lit(id)};`);
    } else if (letter === "R" || letter === "S") {
      const p = letter === "R" ? "passive" : "active";
      const b = parseKit(before, id, p, where), a = parseKit(after, id, p, where);
      if (!sameKit(b, c[`${p}_params`])) errors.push(`${where}: 이전 수치 ${before} ≠ 기준 ${JSON.stringify(c[`${p}_params`])}`);
      updates.push(`update public.characters set ${p}_params = ${lit(JSON.stringify(a))}::jsonb where version_id = v and id = ${lit(id)};`);
    } else { errors.push(`${where}: 지원하지 않는 열 ${letter}`); continue; }
    changed.push(where);
  } else if (sheet === "전투카드") {
    const id = byName(base.cards, item);
    if (!id || !CARD_COL[letter]) { errors.push(`${where}: 카드 또는 열을 찾지 못함`); continue; }
    const f = CARD_COL[letter], k = base.cards[id];
    if (f === "effect_text" || f === "effect_short") { if (before.trim() !== (k[f] ?? "")) errors.push(`${where}: 이전 문구가 기준과 다름 → 기준 '${k[f] ?? ""}'`); if (f === "effect_short" && [...after.trim()].length > 20) errors.push(`${where}: 효과_짧게 20자 초과`); updates.push(`update public.cards set ${f} = ${lit(after.trim())} where version_id = v and id = ${lit(id)};`); }
    else { if (Number(k[f]) !== num(before, where)) errors.push(`${where}: 이전 값 ${before} ≠ 기준 ${k[f]}`); updates.push(`update public.cards set ${f} = ${num(after, where)} where version_id = v and id = ${lit(id)};`); }
    changed.push(where);
  } else if (sheet === "스펠") {
    const SP_COL = { B: "effect_text", C: "value", D: "cooldown" };
    const id = byName(base.spells, item), f = SP_COL[letter];
    if (!id || !f) { errors.push(`${where}: 스펠 또는 열을 찾지 못함`); continue; }
    const k = base.spells[id];
    if (f === "effect_text") { if (before.trim() !== k.effect_text) errors.push(`${where}: 이전 문구가 기준과 다름`); updates.push(`update public.spells set effect_text = ${lit(after.trim())} where version_id = v and id = ${lit(id)};`); }
    else { if (Number(k[f]) !== num(before, where)) errors.push(`${where}: 이전 값 ${before} ≠ 기준 ${k[f]}`); updates.push(`update public.spells set ${f} = ${num(after, where)} where version_id = v and id = ${lit(id)};`); }
    changed.push(where);
  } else if (sheet === "설정값") {
    const key = (item.match(/[a-z][a-z0-9_]{2,}/) ?? [])[0];
    if (!key || !(key in base.settings)) { errors.push(`${where}: 설정 키를 항목에서 찾지 못함`); continue; }
    if (Number(base.settings[key]) !== num(before, where)) errors.push(`${where}: 이전 값 ${before} ≠ 기준 ${base.settings[key]}`);
    updates.push(`update public.settings set value = ${lit(JSON.stringify(num(after, where)))}::jsonb where version_id = v and key = ${lit(key)};`);
    changed.push(where);
  } else if (sheet === "추천덱") {
    const id = byName(base.characters, item), STY = { 공세: ["aggro", 1], 균형: ["balance", 2], 수비: ["defense", 3], 변칙: ["variant", 3] };
    const tail = item.includes("→") ? item.slice(item.indexOf("→") + 1) : item;  // '수비→변칙'처럼 유형을 바꾸면 화살표 뒤가 새 유형
    const sty = Object.keys(STY).find((s) => tail.includes(s));
    if (!id || !sty) { errors.push(`${where}: 캐릭터·유형을 항목에서 찾지 못함`); continue; }
    const slot = STY[sty][1], cur = (base.presets[id] ?? []).find((p) => p.slot === slot);
    const list = (s) => String(s).split(/[,\s]+/).filter(Boolean).sort().join(",");
    if (!cur || list(before) !== [...cur.cards].sort().join(",")) errors.push(`${where}: 이전 카드 목록이 기준과 다름 → ${cur?.cards.join(",")}`);
    const cards = list(after).split(",");
    if (cards.length !== 10 || cards.some((x) => !base.cards[x] || base.cards[x].owner_character)) errors.push(`${where}: 공용 카드 10장이 아님`);
    const cnt = {}; for (const x of cards) cnt[x] = (cnt[x] ?? 0) + 1; if (Object.values(cnt).some((n) => n > 2)) errors.push(`${where}: 같은 카드 3장 이상`);
    updates.push(`update public.deck_presets set style = ${lit(STY[sty][0])}, cards = array[${cards.map(lit).join(",")}] where version_id = v and character_id = ${lit(id)} and slot = ${slot};`);
    changed.push(where);
  } else errors.push(`${where}: 지원하지 않는 시트`);
}

// 스탯 예산(시트 `캐릭터` 가중치, 설정 stat_budget_target·tol) — 스탯을 고친 캐릭터만
const W = { hp: 0.1, atk: 1, def: 1.25, spd: 0.1, crit: 2 }, target = Number(base.settings.stat_budget_target ?? 280), tol = Number(base.settings.stat_budget_tol ?? 0.03);
for (const [id, c] of Object.entries(chars)) {
  if (Object.keys(CHAR_COL).every((L) => c[CHAR_COL[L]] === base.characters[id][CHAR_COL[L]])) continue;
  const b = Object.entries(W).reduce((a, [k, w]) => a + Number(c[k]) * w, 0);
  if (Math.abs(b / target - 1) > tol) errors.push(`${id} 스탯 예산 ${b} (목표 ${target}±${tol * 100}% 밖)`);
}
if (errors.length) { console.error("오류 — SQL을 만들지 않음:\n- " + errors.join("\n- ")); process.exit(1); }

const memo = `${note || "수치 패치"} (${changed.length}건)`;
console.log(`do $$
declare v bigint; s uuid := ${lit(staff)};
begin
  if (select version_id from public.data_live) <> ${Number(baseId)} then raise exception 'live_changed'; end if;
  v := public.data_create_draft(${Number(baseId)}, ${lit(memo)}, s);
  ${updates.join("\n  ")}
  insert into public.data_reviews (version_id, editors, validation) values (v, array[s], ${lit(JSON.stringify({ errors: [], blocks: [], warnings: [], patch: changed }))}::jsonb);
  perform public.bo_review(v, s, 'request', null, null);
  perform public.bo_review(v, s, 'approve', ${lit("수치 패치 CSV 적용(개발)")}, null);
  perform public.bo_publish(v, s);
  perform public.audit_add(s, '데이터 v' || v, '수치 패치 적용(개발)', ${lit(JSON.stringify({ base: Number(baseId), changes: changed }))}::jsonb, ${lit(memo)});
  raise notice 'published v%', v;
end $$;`);
