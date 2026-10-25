// 수치 테이블 xlsx(시트 행 배열) → 데이터 초안 내용 + 자동 검증. tools/import_balance.py를 옮긴 것(백오피스 업로드가 같은 규칙을 쓴다).
// 근거: 기획답변_20261023(Q1~Q6), 상세 14(ID·키 규칙, 자동 검증), 상세 15(추천덱), 기획답변 10차(스킬 수치 열), 총괄 6장(처리 단계).
// 결과: { data, errors, blocks, warnings }
//   errors   — 형식·ID·구조 오류. 하나라도 있으면 초안을 만들지 않는다.
//   blocks   — 상세 14 자동 검증 중 검수 요청을 막는 것(스탯 예산·범위). 초안 저장은 된다.
//   warnings — 알림만(스킬 문구 숫자 불일치, 스펠 개수 등).
import { CHARACTER_PARAM_DEFAULTS, toSnake } from "../engine/rules.mjs";
import { METRICS, SCOPES } from "../economy.mjs";

const OFFER = { "본편 포함": "included", "유료 추가": "addon" };
const KIND = { "면역": "immune", "방어": "defense", "반격": "counter", "침묵": "silence", "방해": "disrupt", "스킬": "skill", "공격": "attack" };
const KIND_PHASE = { immune: 1, defense: 1, counter: 1, silence: 2, disrupt: 2, skill: 3, attack: 4 };
const DEFAULT_STAT_RANGE = { hp: [600, 1500], atk: [60, 140], def: [20, 70], spd: [60, 140], crit: [0, 30] };
const STYLE = { "공세": "aggro", "균형": "balance", "수비": "defense" };
const DIFFICULTY = { "쉬움": "easy", "보통": "normal", "어려움": "hard" };  // 캐릭터 난이도 뱃지(기획지시 2026-10-25 숙련도, 등급 폐지)

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

  // ---------- 경제: E열 키(설정값과 같은 방식) + 미션 표 (기획답변 13차) ----------
  const tables = {};
  if (!sheets["경제"]) warnings.push("시트 `경제` 없음 → 경제 수치·미션은 서버 기본값");
  else {
    const rows = sheets["경제"];
    const hr = rows.findIndex((row) => ["종류", "ID", "이름", "조건 종류", "목표"].every((x) => (row ?? []).map(norm).includes(x)));
    // E열 키: 미션 표 위쪽에서 영문 키 모양인 칸만(같은 열의 한글 비고는 건너뜀)
    for (let r = 0; r < (hr < 0 ? rows.length : hr); r += 1) {
      const row = rows[r] ?? [];
      const raw = cell(row, 4);
      if (typeof raw !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw.trim())) continue;
      const key = raw.trim();
      const where = `경제 ${r + 1}행 '${norm(cell(row, 0))}'`;
      if (!/^[a-z][a-z0-9_]{1,63}$/.test(key)) { err(`${where}: 키 형식 오류(영문 소문자 snake_case) → '${key}'`); continue; }
      if (key in settings) { err(`${where}: 키 중복 ${key} (설정값 시트와 겹침)`); continue; }
      const val = cell(row, 1);
      if (!isNum(val)) { err(`${where} ${key}: 값이 숫자가 아님 → ${JSON.stringify(val)}`); continue; }
      settings[key] = { value: val, unit: norm(cell(row, 2)), desc: [norm(cell(row, 0)), norm(cell(row, 3))].filter(Boolean).join(" ") };
    }
    if (hr < 0) warnings.push("경제: 미션 표 헤더(종류·ID·이름·조건 종류·목표)를 찾지 못함 → 서버 기본 미션");
    else {
      const h = {};
      rows[hr].map(norm).forEach((x, i) => { if (x && !(x in h)) h[x] = i; });
      const KINDS = { "일일": "daily", "주간": "weekly", "시즌": "season" };
      const TIERS = ["bronze", "silver", "gold", "platinum", "diamond", "master"];
      const missions = { daily: [], weekly: [], season: [] };
      const ids = new Set();
      for (let r = hr + 1; r < rows.length; r += 1) {
        const row = rows[r] ?? [];
        const kind = KINDS[norm(cell(row, h["종류"]))];
        if (!kind) { if (/^[DWS]\d{2}$/.test(norm(cell(row, h.ID)))) err(`경제 ${r + 1}행: 미션 종류 오류 → '${norm(cell(row, h["종류"]))}'`); continue; }  // 검산 행 등은 ID 칸이 비어 건너뜀
        const id = norm(cell(row, h.ID)), where = `경제 ${r + 1}행 미션 ${id}`;
        if (!/^[DWS]\d{2}$/.test(id) || id[0] !== { daily: "D", weekly: "W", season: "S" }[kind]) err(`${where}: ID 형식 오류(일일 Dnn·주간 Wnn·시즌 Snn)`);
        if (ids.has(id)) err(`${where}: ID 중복`);
        ids.add(id);
        const metric = norm(cell(row, h["조건 종류"])), scope = norm(cell(row, h["범위"]));
        if (!METRICS.includes(metric)) err(`${where}: 조건 종류 '${metric}' (가능: ${METRICS.join(", ")})`);
        if (!SCOPES.includes(scope)) err(`${where}: 범위 '${scope}' (가능: ${SCOPES.join(", ")})`);
        const target = cell(row, h["목표"]), gold = cell(row, h["골드"]);
        if (!isInt(target) || target < 1) err(`${where}: 목표가 1 이상 정수가 아님 → ${JSON.stringify(target)}`);
        if (!isInt(gold) || gold < 0) err(`${where}: 골드가 0 이상 정수가 아님 → ${JSON.stringify(gold)}`);
        const aux = {};
        for (const part of norm(cell(row, h["보조값"])).split(/[;,]/).map((x) => x.trim()).filter(Boolean)) {
          const m = part.match(/^([a-z_]+)\s*=\s*([a-z0-9_]+)$/);
          if (!m) { err(`${where}: 보조값 형식 오류 '${part}' (키=값)`); continue; }
          aux[m[1]] = /^\d+$/.test(m[2]) ? Number(m[2]) : m[2];
        }
        if (metric === "faction_wins" && !isInt(aux.factions)) err(`${where}: faction_wins는 보조값 factions=N 필요`);
        if (metric === "char_wins" && !isInt(aux.chars)) err(`${where}: char_wins는 보조값 chars=N 필요`);
        if (metric === "tier_reach" && !TIERS.includes(aux.tier)) err(`${where}: tier_reach는 보조값 tier=${TIERS.join("|")} 필요`);
        missions[kind].push({ id, name: norm(cell(row, h["이름"])), metric, target, aux, scope, gold });
      }
      const dailyCount = settings.econ_daily_count?.value ?? 3;
      if (missions.daily.length < dailyCount) err(`경제 미션: 일일 후보 ${missions.daily.length}개 < 하루 ${dailyCount}개`);
      if (missions.daily.length === dailyCount) warnings.push("경제 미션: 일일 후보가 하루 개수와 같아 '하루 1개 교체'를 할 수 없음");
      if (!missions.weekly.length || !missions.season.length) warnings.push("경제 미션: 주간 또는 시즌 미션이 없음");
      tables.missions = missions;
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
      const diffRaw = "난이도" in h ? norm(cell(row, h["난이도"])) : "";
      const difficulty = DIFFICULTY[diffRaw] ?? null;
      if ("난이도" in h && !difficulty) err(`${where}: 난이도 값 오류 → '${diffRaw}' (쉬움/보통/어려움)`);
      if (cid in chars) err(`${where}: ID 중복 ${cid}`);
      chars[cid] = {
        id: cid, name, job: norm(cell(row, h["직업"])), role: norm(cell(row, h["역할"])), faction: norm(cell(row, h["진영"])), rarity: "등급" in h ? norm(cell(row, h["등급"])) || null : null, difficulty, offer,
        hp: cell(row, h.HP), atk: cell(row, h.ATK), def: cell(row, h.DEF), spd: cell(row, h.SPD), crit: cell(row, h["CRIT(%)"]),
        passive_name: pName, passive_text: pText, active_name: aName, active_text: aText,
        passive_params: readKit(cell(row, h["패시브 수치"]), cid, "passive", `${where} 패시브 수치`, pText, "패시브 수치" in h),
        active_params: readKit(cell(row, h["액티브 수치"]), cid, "active", `${where} 액티브 수치`, aText, "액티브 수치" in h)
      };
    }
    if (!("난이도" in h)) warnings.push("시트 `캐릭터`에 `난이도` 열 없음 → 난이도 뱃지 없음(등급 열은 폐지 예정, 기획지시 2026-10-25)");
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

  // ---------- 랭크보상(상세 08): 시즌 보상·일일 첫 승 배율 ----------
  if (!sheets["랭크보상"]) warnings.push("시트 `랭크보상` 없음 → 시즌 보상·첫 승 배율은 서버 기본값");
  else {
    const rows = sheets["랭크보상"];
    const [r0, h] = headerIndex(rows, ["티어", "시즌 골드", "일일 첫 승 배율"], "랭크보상");
    const base = rows.slice(0, r0).find((r) => norm(r?.[0]) === "일일 첫 승 기본 골드");
    const TIER_KEY = { "브론즈": "bronze", "실버": "silver", "골드": "gold", "플래티넘": "platinum", "다이아": "diamond", "마스터": "master", "레전드": "legend" };
    const has = (v) => { const t = norm(v); return Boolean(t) && t !== "-"; };
    const list = [];
    for (let r = r0 + 1; r < rows.length; r += 1) {
      const row = rows[r] ?? [];
      const key = TIER_KEY[norm(cell(row, h["티어"]))];
      if (!key) continue;
      const where = `랭크보상 ${r + 1}행 ${norm(cell(row, h["티어"]))}`;
      const gold = cell(row, h["시즌 골드"]), mult = cell(row, h["일일 첫 승 배율"]);
      if (!isInt(gold) || gold < 0) err(`${where}: 시즌 골드가 0 이상 정수가 아님 → ${JSON.stringify(gold)}`);
      if (!isNum(mult) || mult < 1 || mult > 3) err(`${where}: 일일 첫 승 배율 1~3 밖 → ${JSON.stringify(mult)}`);
      const gradeRaw = norm(cell(row, h["프레임 연출 등급"]));
      list.push({ tier: key, label: norm(cell(row, h["티어"])), gold, first_win_mult: mult,
        frame: has(cell(row, h["시즌 한정 카드 프레임"])), title: has(cell(row, h["칭호"])),
        grade: /^\d/.test(gradeRaw) ? Number(gradeRaw.match(/^\d+/)[0]) : null,
        skin: norm(cell(row, h["시즌 이벤트 스킨"])) === "지급" });
    }
    if (list.length !== 7) err(`랭크보상: 티어 ${list.length}행 (브론즈~레전드 7행이어야 함)`);
    const firstWin = base ? base.slice(1).find(isNum) : undefined;
    if (firstWin !== undefined && !(isInt(firstWin) && firstWin >= 0)) err(`랭크보상: 일일 첫 승 기본 골드 오류 → ${JSON.stringify(firstWin)}`);
    tables.rank_rewards = { first_win_gold: firstWin ?? 100, tiers: list };
  }

  // ---------- 랭크로드(상세 08): 단계마다 첫 도달 1회, 골드 + 상품(비어 있으면 골드만) ----------
  const ITEM_ID = /^[A-Z][A-Z0-9_]{1,47}$/;
  const itemsOf = (v, where) => {
    const ids = norm(v).split(/[,\s·]+/).filter(Boolean);
    for (const id of ids) if (!ITEM_ID.test(id)) err(`${where}: 상품 ID 형식 오류 → ${JSON.stringify(id)}`);
    return ids;
  };
  if (!sheets["랭크로드"]) warnings.push("시트 `랭크로드` 없음 → 랭크 로드는 서버 기본값(단계 100골드, 티어 경계 300골드)");
  else {
    const rows = sheets["랭크로드"];
    const [r0, h] = headerIndex(rows, ["단계 번호", "골드"], "랭크로드");
    const tierCount = tables.rank_tiers?.tiers?.length ?? 16;
    const steps = [];
    for (let r = r0 + 1; r < rows.length; r += 1) {
      const row = rows[r] ?? [];
      const no = cell(row, h["단계 번호"]);
      if (!isInt(no)) continue;  // 합계·메모 행은 건너뜀
      const where = `랭크로드 ${r + 1}행 단계 ${no}`;
      const gold = cell(row, h["골드"]);
      if (!isInt(gold) || gold < 0) err(`${where}: 골드가 0 이상 정수가 아님 → ${JSON.stringify(gold)}`);
      if (no < 1 || no > tierCount) err(`${where}: 단계 번호가 1~${tierCount} 밖`);
      steps.push({ no, name: norm(cell(row, h["단계"])), gold, extra: norm(cell(row, h["추가 보상 종류"])),
        items: h["상품 ID"] === undefined ? [] : itemsOf(cell(row, h["상품 ID"]), where) });
    }
    const nos = steps.map((x) => x.no);
    if (new Set(nos).size !== nos.length) err("랭크로드: 단계 번호 중복");
    if (steps.length !== tierCount) err(`랭크로드: ${steps.length}단계 (랭크_승점 ${tierCount}단계와 같아야 함)`);
    tables.rank_road = { steps: steps.sort((a, b) => a.no - b.no) };
  }

  // ---------- 시즌스킨(상세 08): 플래티넘 이상 시즌 이벤트 스킨. 상품 ID가 빈 시즌은 지급 없음 ----------
  if (sheets["시즌스킨"]) {
    const rows = sheets["시즌스킨"];
    const [r0, h] = headerIndex(rows, ["시즌", "상품 ID"], "시즌스킨");
    const seasons = [];
    for (let r = r0 + 1; r < rows.length; r += 1) {
      const row = rows[r] ?? [];
      const no = cell(row, h["시즌"]);
      if (!isInt(no)) continue;
      const ids = itemsOf(cell(row, h["상품 ID"]), `시즌스킨 ${r + 1}행 시즌 ${no}`);
      if (ids.length > 1) err(`시즌스킨 ${r + 1}행: 상품 ID는 시즌당 1개`);
      seasons.push({ no, item: ids[0] ?? null, note: norm(cell(row, h["비고"])) });
    }
    if (new Set(seasons.map((x) => x.no)).size !== seasons.length) err("시즌스킨: 시즌 번호 중복");
    tables.season_skins = { seasons };
  }

  // ---------- 챔피언스컵(상세 08, 기획답변 23차): 승수 구간별 골드·감정표현·컵 프레임·칭호 ----------
  if (!sheets["챔피언스컵"]) warnings.push("시트 `챔피언스컵` 없음 → 컵 보상은 서버 기본값(0~2승 1,000 / 3~4승 2,000 / 5~6승 3,000+감정표현 / 7승 3,000+감정표현+프레임·칭호)");
  else {
    const rows = sheets["챔피언스컵"];
    const [r0, h] = headerIndex(rows, ["최소 승", "최대 승", "골드"], "챔피언스컵");
    const colOf = (prefix) => Object.entries(h).find(([k]) => k.startsWith(prefix))?.[1];
    const cEmote = colOf("감정표현"), cFrame = colOf("컵 프레임"), cName = colOf("승수 구간");
    const flag = (v, where) => {
      const t = norm(v);
      if (["지급", "있음", "O", "o", "예", "1", "true", "TRUE"].includes(t) || v === true) return true;
      if (["", "없음", "-", "X", "x", "아니오", "0", "false", "FALSE"].includes(t) || v === false) return false;
      err(`${where}: 지급/없음 중 하나 → ${JSON.stringify(v)}`);
      return false;
    };
    const tiers = [];
    for (let r = r0 + 1; r < rows.length; r += 1) {
      const row = rows[r] ?? [];
      const min = cell(row, h["최소 승"]), max = cell(row, h["최대 승"]), gold = cell(row, h["골드"]);
      if (min === null && max === null) continue;
      const where = `챔피언스컵 ${r + 1}행`;
      if (!isInt(min) || !isInt(max) || min < 0 || max < min || max > 7) { err(`${where}: 최소·최대 승은 0~7 정수(최소 ≤ 최대)`); continue; }
      if (!isInt(gold) || gold < 0) err(`${where}: 골드는 0 이상 정수 → ${JSON.stringify(gold)}`);
      tiers.push({ no: tiers.length + 1, name: norm(cell(row, cName)) || `${min}~${max}승`, min, max, gold: isInt(gold) ? gold : 0,
        emote: flag(cell(row, cEmote), `${where} 감정표현`), frame: flag(cell(row, cFrame), `${where} 컵 프레임·칭호`) });
    }
    tiers.sort((a, b) => a.min - b.min);
    let next = 0;
    for (const t of tiers) { if (t.min !== next) err(`챔피언스컵: ${next}승 구간이 비었거나 겹침`); next = t.max + 1; }
    if (next !== 8) err("챔피언스컵: 0승부터 7승까지 빈틈없이 채워야 함");
    tiers.forEach((t, i) => { t.no = i + 1; });
    tables.cup = { tiers };
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
