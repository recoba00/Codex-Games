// 수치 테이블 xlsx(시트 행 배열) → 데이터 초안 내용 + 자동 검증. tools/import_balance.py를 옮긴 것(백오피스 업로드가 같은 규칙을 쓴다).
// 근거: 기획답변_20261023(Q1~Q6), 상세 14(ID·키 규칙, 자동 검증), 상세 15(추천덱), 기획답변 10차(스킬 수치 열), 총괄 6장(처리 단계).
// 결과: { data, errors, blocks, warnings }
//   errors   — 형식·ID·구조 오류. 하나라도 있으면 초안을 만들지 않는다.
//   blocks   — 상세 14 자동 검증 중 검수 요청을 막는 것(스탯 예산·범위). 초안 저장은 된다.
//   warnings — 알림만(스킬 문구 숫자 불일치, 스펠 개수 등).
import { CHARACTER_PARAM_DEFAULTS, toSnake } from "../engine/rules.mjs";

const OFFER = { "본편 포함": "included", "유료 추가": "addon" };
const KIND = { "면역": "immune", "방어": "defense", "반격": "counter", "침묵": "silence", "방해": "disrupt", "스킬": "skill", "공격": "attack" };
const KIND_PHASE = { immune: 1, defense: 1, counter: 1, silence: 2, disrupt: 2, skill: 3, attack: 4 };
const DEFAULT_STAT_RANGE = { hp: [600, 1500], atk: [60, 140], def: [20, 70], spd: [60, 140], crit: [0, 30] };
const STYLE = { "공세": "aggro", "균형": "balance", "수비": "defense" };

export function kitKeys() {
  const out = {};
  for (const [id, params] of Object.entries(CHARACTER_PARAM_DEFAULTS)) {
    out[id] = { passive: {}, active: {} };
    for (const [k, v] of Object.entries(params)) out[id][k.startsWith("passive") ? "passive" : "active"][toSnake(k)] = v;
  }
  return out;
}

const norm = (v) => (v === null || v === undefined ? "" : String(v).trim());
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const fmtG = (v) => String(Number(v.toPrecision(6)));
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function importWorkbook(sheets) {
  const errors = [], blocks = [], warnings = [];
  const err = (m) => errors.push(m);
  const need = (name) => { if (!sheets[name]) throw Object.assign(new Error("sheet_missing"), { extra: { sheet: name } }); return sheets[name]; };

  function headerIndex(rows, required, title) {
    for (let r = 0; r < Math.min(rows.length, 15); r += 1) {
      const row = (rows[r] ?? []).map(norm);
      if (required.every((h) => row.includes(h))) {
        const h = {};
        row.forEach((x, i) => { if (x && !(x in h)) h[x] = i; });
        return [r, h];
      }
    }
    throw Object.assign(new Error("header_missing"), { extra: { sheet: title, required } });
  }
  function* rowsAfter(rows, r0, col) {
    for (let r = r0 + 1; r < rows.length; r += 1) {
      const row = rows[r] ?? [];
      if (row[col] === null || row[col] === undefined) continue;
      yield [r + 1, row];  // 엑셀 행 번호
    }
  }
  const cell = (row, i) => (i === undefined ? null : row[i] ?? null);
  function splitSkill(text, where) {
    const s = norm(text), i = s.indexOf(":");
    const name = i < 0 ? "" : s.slice(0, i).trim(), body = i < 0 ? "" : s.slice(i + 1).trim();
    if (i < 0 || !name || !body) err(`${where}: '이름: 설명' 형식이 아님 → ${JSON.stringify(text)}`);
    return [name, body];
  }

  // ---------- 설정값 ----------
  const settings = {};
  {
    const rows = need("설정값");
    const [r0, h] = headerIndex(rows, ["항목", "값"], "설정값");
    for (const [r, row] of rowsAfter(rows, r0, h["항목"])) {
      const val = cell(row, h["값"]);
      if (val === null) continue;
      const key = norm(cell(row, 4));
      if (!/^[a-z][a-z0-9_]{1,63}$/.test(key)) { err(`설정값 ${r}행 '${norm(cell(row, h["항목"]))}': 영문 키 없음/형식 오류 → '${key}'`); continue; }
      if (key in settings) err(`설정값 ${r}행: 키 중복 ${key}`);
      if (!(isNum(val) || typeof val === "boolean")) err(`설정값 ${r}행 ${key}: 값이 숫자가 아님 → ${JSON.stringify(val)}`);
      settings[key] = { value: val, unit: "단위" in h ? norm(cell(row, h["단위"])) : "",
        desc: [norm(cell(row, h["항목"])), "설명" in h ? norm(cell(row, h["설명"])) : ""].filter(Boolean).join(" ") };
    }
  }

  // ---------- 캐릭터 (+ 스킬 수치 열) ----------
  const KIT = kitKeys();
  const kitForms = (v) => {
    const f = new Set();
    if (v !== Math.trunc(v) || v < 1) f.add(`${Math.round(v * 100)}%`);
    f.add(v === Math.trunc(v) ? String(Math.trunc(v)) : fmtG(v));
    return f;
  };
  function readKit(raw, cid, slot, where, text, present) {
    const known = KIT[cid]?.[slot] ?? {};
    if (!present) return {};
    const s = norm(raw);
    if (!s) { if (Object.keys(known).length) warnings.push(`${where} 비어 있음 → 엔진 기본값 ${JSON.stringify(known)}`); return {}; }
    const out = {};
    for (const part of s.split(";").map((x) => x.trim()).filter(Boolean)) {
      const m = part.match(/^([a-z][a-z0-9_]*)\s*=\s*(-?[0-9]+(?:\.[0-9]+)?)$/);
      if (!m) { err(`${where}: 형식 오류 '${part}' (키=값, 영문 snake_case 키, 숫자 값)`); continue; }
      const k = m[1], v = Number(m[2]);
      if (!(k in known)) {
        const other = KIT[cid]?.[slot === "passive" ? "active" : "passive"] ?? {};
        err(`${where}: 알 수 없는 키 '${k}'` + (k in other ? " (다른 열의 키)" : ` (가능: ${Object.keys(known).join(", ") || "없음"})`));
        continue;
      }
      if (k in out) err(`${where}: 키 '${k}' 중복`);
      out[k] = v;
      const found = [...kitForms(v)].some((f) => new RegExp(`(?<![0-9.])${escRe(f)}(?![0-9])`).test(text ?? ""));
      if (!found && v !== known[k]) warnings.push(`${where}: ${k}=${v} 이 스킬 문구에 없음 (수치 열이 기준) → '${text}'`);
    }
    for (const k of Object.keys(known)) if (!(k in out)) warnings.push(`${where}: '${k}' 없음 → 엔진 기본값 ${known[k]}`);
    return out;
  }
  const chars = {};
  const charRows = need("캐릭터");
  {
    const [r0, h] = headerIndex(charRows, ["캐릭터", "HP", "ATK", "DEF", "SPD", "CRIT(%)"], "캐릭터");
    const offerCol = h["제공 방식"] ?? h["해금"];
    for (const [r, row] of rowsAfter(charRows, r0, h["캐릭터"])) {
      const name = norm(cell(row, h["캐릭터"]));
      if (!isNum(cell(row, h.HP))) continue;  // 하단 메모 행
      const cid = "ID" in h ? norm(cell(row, h.ID)) : "";
      const where = `캐릭터 ${r}행 ${name}`;
      if (!/^[A-Z]{2,3}$/.test(cid)) err(`${where}: ID 없음/형식 오류 → '${cid}'`);
      const offerRaw = norm(cell(row, offerCol));
      const offer = OFFER[offerRaw] ?? null;
      if (!offer) err(`${where}: 제공 방식 값 오류 → '${offerRaw}' (본편 포함/유료 추가)`);
      const [pName, pText] = splitSkill(cell(row, h["패시브"]), `${where} 패시브`);
      const [aName, aText] = splitSkill(cell(row, h["액티브"]), `${where} 액티브`);
      if (name.length < 2 || name.length > 8) err(`${where}: 이름 2~8자 위반`);
      if (cid in chars) err(`${where}: ID 중복 ${cid}`);
      chars[cid] = {
        id: cid, name, job: norm(cell(row, h["직업"])), role: norm(cell(row, h["역할"])), faction: norm(cell(row, h["진영"])), rarity: norm(cell(row, h["등급"])), offer,
        hp: cell(row, h.HP), atk: cell(row, h.ATK), def: cell(row, h.DEF), spd: cell(row, h.SPD), crit: cell(row, h["CRIT(%)"]),
        passive_name: pName, passive_text: pText, active_name: aName, active_text: aText,
        passive_params: readKit(cell(row, h["패시브 수치"]), cid, "passive", `${where} 패시브 수치`, pText, "패시브 수치" in h),
        active_params: readKit(cell(row, h["액티브 수치"]), cid, "active", `${where} 액티브 수치`, aText, "액티브 수치" in h)
      };
    }
    const names = Object.values(chars).map((c) => c.name);
    if (new Set(names).size !== names.length) err("캐릭터: 이름 중복");
  }

  // ---------- 전투카드 ----------
  const cards = {};
  {
    const rows = need("전투카드");
    const [r0, h] = headerIndex(rows, ["ID", "카드명", "종류", "처리 단계", "공용/전용", "비용(E)"], "전투카드");
    const byName = Object.fromEntries(Object.values(chars).map((c) => [c.name, c.id]));
    for (const [r, row] of rowsAfter(rows, r0, h.ID)) {
      const id = norm(cell(row, h.ID));
      if (!/^(C\d{2}|[A-Z]{2,3}\d{2})$/.test(id)) continue;  // 하단 설명 행
      const where = `전투카드 ${r}행 ${id}`;
      const kind = KIND[norm(cell(row, h["종류"]))] ?? null;
      const phase = cell(row, h["처리 단계"]);
      if (!kind) err(`${where}: 종류 값 오류 → ${JSON.stringify(cell(row, h["종류"]))}`);
      else if (phase !== KIND_PHASE[kind]) err(`${where}: 처리 단계 ${phase} ≠ ${kind} 기준 ${KIND_PHASE[kind]}`);
      const scope = norm(cell(row, h["공용/전용"]));
      const owner = scope === "공용" ? null : (scope in chars ? scope : byName[scope] ?? null);
      if (scope !== "공용" && owner === null) err(`${where}: 전용 카드 주인 '${scope}'를 캐릭터에서 찾지 못함`);
      if ((owner === null) !== id.startsWith("C") || (owner && !id.startsWith(owner))) err(`${where}: ID와 공용/전용·주인이 맞지 않음 (owner=${owner})`);
      const cost = cell(row, h["비용(E)"]);
      if (!isInt(cost) || cost < 0 || cost > 3) err(`${where}: 비용 0~3 위반 → ${JSON.stringify(cost)}`);
      cards[id] = { id, name: norm(cell(row, h["카드명"])), kind, phase, owner_character: owner, cost,
        coef: cell(row, h["계수"]), hits: cell(row, h["타수"]) || 1, pierce: cell(row, h["관통"]) || 0, effect_text: norm(cell(row, h["효과"])) };
    }
    for (const cid of Object.keys(chars)) {
      const n = Object.values(cards).filter((k) => k.owner_character === cid).length;
      if (n !== 2) err(`캐릭터 ${cid}: 전용카드 ${n}장 (2장이어야 함, 상세 14)`);
    }
  }

  // ---------- 스펠 ----------
  const spells = {};
  {
    const rows = need("스펠");
    const [r0, h] = headerIndex(rows, ["스펠", "효과", "효과값", "쿨다운(턴)"], "스펠");
    for (const [r, row] of rowsAfter(rows, r0, h["스펠"])) {
      if (!isNum(cell(row, h["쿨다운(턴)"]))) continue;
      const id = "ID" in h ? norm(cell(row, h.ID)) : "";
      if (!/^SP\d{2}$/.test(id)) err(`스펠 ${r}행: ID 없음/형식 오류 → '${id}'`);
      const val = cell(row, h["효과값"]);
      spells[id] = { id, name: norm(cell(row, h["스펠"])), effect_text: norm(cell(row, h["효과"])), value: isNum(val) ? val : null, cooldown: Math.trunc(cell(row, h["쿨다운(턴)"])) };
    }
  }

  // ---------- 추천덱 (상세 15) ----------
  const presets = [];
  if (!sheets["추천덱"]) err("시트 `추천덱` 없음");
  else {
    const rows = sheets["추천덱"];
    const [r0, h] = headerIndex(rows, ["캐릭터", "유형"], "추천덱");
    const cardCols = {};
    for (const [name, i] of Object.entries(h)) { const m = name.match(/^(C\d{2})\b/); if (m) cardCols[m[1]] = i; }
    const byName = Object.fromEntries(Object.values(chars).map((c) => [c.name, c.id]));
    const seen = {};
    for (const [r, row] of rowsAfter(rows, r0, h["캐릭터"])) {
      const style = STYLE[norm(cell(row, h["유형"]))];
      const cname = norm(cell(row, h["캐릭터"]));
      const cid = cname in chars ? cname : byName[cname];
      const where = `추천덱 ${r}행 ${cname}`;
      if (!style || !cid) { err(`${where}: 캐릭터·유형을 읽지 못함`); continue; }
      const deck = [];
      for (const [cardId, i] of Object.entries(cardCols)) {
        const n = cell(row, i) || 0;
        if (!isInt(n) || n < 0 || n > 2) { err(`${where}: ${cardId} 장수 ${JSON.stringify(n)} (0~2)`); continue; }
        if (!(cardId in cards) || cards[cardId].owner_character !== null) err(`${where}: ${cardId}는 공용 카드가 아님`);
        for (let k = 0; k < n; k += 1) deck.push(cardId);
      }
      if (deck.length !== 10) err(`${where}: 공용 카드 ${deck.length}장 (10장이어야 함)`);
      (seen[cid] ??= []).push(style);
      presets.push({ character_id: cid, slot: Object.values(STYLE).indexOf(style) + 1, style, cards: deck });
    }
    for (const cid of Object.keys(chars)) {
      if ([...(seen[cid] ?? [])].sort().join() !== Object.values(STYLE).sort().join()) err(`추천덱: ${cid} 공세·균형·수비 3개가 아님 → ${JSON.stringify(seen[cid] ?? null)}`);
    }
  }

  // ---------- 표: 랭크_승점, 이탈패널티 ----------
  const tables = {};
  {
    const rows = need("랭크_승점");
    const [r0, h] = headerIndex(rows, ["순번", "단계", "누적 RP 시작", "기준 MMR", "패배 감소 배율", "하한선", "AI 대체"], "랭크_승점");
    const resetCol = Object.entries(h).find(([n]) => n.startsWith("리셋 후"))?.[1];
    const tiers = [], names = {};
    for (const [, row] of rowsAfter(rows, r0, h["순번"])) {
      if (!isInt(cell(row, h["순번"]))) continue;
      names[norm(cell(row, h["단계"]))] = cell(row, h["순번"]);
      tiers.push({ no: cell(row, h["순번"]), name: norm(cell(row, h["단계"])), rp_start: cell(row, h["누적 RP 시작"]), mmr: cell(row, h["기준 MMR"]),
        loss_mult: cell(row, h["패배 감소 배율"]), floor: norm(cell(row, h["하한선"])) === "하한선", ai: norm(cell(row, h["AI 대체"])) === "있음",
        reset_to: resetCol !== undefined ? norm(cell(row, resetCol)) : "" });
    }
    for (const t of tiers) {
      if (!(t.reset_to in names)) err(`랭크_승점: ${t.name} 리셋 후 단계 '${t.reset_to}'를 찾지 못함`);
      t.reset_to = names[t.reset_to] ?? 1;
    }
    if (tiers.some((t, i) => t.no !== i + 1) || tiers.some((t, i) => i > 0 && t.rp_start <= tiers[i - 1].rp_start)) err("랭크_승점: 순번·누적 RP가 순서대로가 아님");
    const params = {};
    for (let r = 0; r <= r0; r += 1) {
      const vals = rows[r] ?? [];
      vals.forEach((v, i) => { if (norm(v) === "기준 MMR 시작") params.mmr_start = vals.slice(i + 1).find(isNum); });
    }
    tables.rank_tiers = { tiers, ...params };

    const lrows = need("이탈패널티");
    const lp = {};
    const keys = { "누적 집계 기간(일)": "window_days", "감면에 필요한 정상 완료 판수": "reduce_per_games", "네트워크 면책(하루 횟수)": "net_exempt_per_day" };
    for (let r = 0; r < Math.min(8, lrows.length); r += 1) {
      const row = lrows[r] ?? [];
      const k = keys[norm(row[0])];
      if (k) lp[k] = row.slice(1).find(isNum);
    }
    const [l0, lh] = headerIndex(lrows, ["누적 이탈", "제재", "매칭 전 대기(분)", "적용 판수", "판 보상 배율", "랭킹전 잠금(시간)"], "이탈패널티");
    const steps = [];
    for (let r = l0 + 1; r < lrows.length; r += 1) {
      const row = lrows[r] ?? [];
      if (row[lh["누적 이탈"]] === null || row[lh["누적 이탈"]] === undefined) continue;
      if (!isInt(row[lh["누적 이탈"]])) break;
      steps.push({ count: row[lh["누적 이탈"]], label: norm(row[lh["제재"]]), delay_min: row[lh["매칭 전 대기(분)"]] ?? null,
        games: row[lh["적용 판수"]] ?? null, reward_mult: row[lh["판 보상 배율"]] ?? null, lock_h: row[lh["랭킹전 잠금(시간)"]] ?? null });
    }
    if (Object.keys(lp).length !== 3 || !steps.length) err(`이탈패널티: 기간·감면·단계를 읽지 못함 (${JSON.stringify(lp)}, ${steps.length}단계)`);
    tables.leaver = { ...lp, steps };
  }

  // ---------- 상세 14 자동 검증: 스탯 범위·예산(검수 차단), 스펠 개수(알림) ----------
  {
    const [, hc] = headerIndex(charRows, ["HP", "ATK", "DEF", "SPD", "CRIT(%)"], "캐릭터");
    const wrow = charRows.slice(0, 6).find((r) => norm(r?.[0]) === "가중치");
    let weights = wrow ? ["HP", "ATK", "DEF", "SPD", "CRIT(%)"].map((k) => wrow[hc[k]]) : null;
    if (weights && !weights.every(isNum)) { warnings.push(`가중치 행을 읽지 못함 → 스탯 예산 검사 생략 (${JSON.stringify(weights)})`); weights = null; }
    const target = settings.stat_budget_target?.value ?? 320;
    const tol = settings.stat_budget_tol?.value ?? 0.03;
    for (const c of Object.values(chars)) {
      const stats = { hp: c.hp, atk: c.atk, def: c.def, spd: c.spd, crit: c.crit };
      for (const [s, [lo, hi]] of Object.entries(DEFAULT_STAT_RANGE)) if (!(stats[s] >= lo && stats[s] <= hi)) blocks.push(`${c.id} ${s.toUpperCase()} ${stats[s]} 범위 ${lo}~${hi} 밖`);
      if (weights) {
        const budget = Object.values(stats).reduce((a, v, i) => a + v * weights[i], 0);
        if (Math.abs(budget / target - 1) > tol) blocks.push(`${c.id} 스탯 예산 ${fmtG(budget)} (목표 ${target}±${Math.round(tol * 100)}% 밖)`);
      }
    }
    if (Object.keys(spells).length !== 8) warnings.push(`스펠 ${Object.keys(spells).length}종 (기획 8종)`);
  }

  return {
    data: { characters: chars, cards, spells, settings, presets, tables },
    errors, blocks, warnings,
    summary: { characters: Object.keys(chars).length, cards: Object.keys(cards).length, spells: Object.keys(spells).length, settings: Object.keys(settings).length, presets: presets.length, tables: Object.keys(tables) }
  };
}
