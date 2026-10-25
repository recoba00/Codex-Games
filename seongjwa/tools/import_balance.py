#!/usr/bin/env python3
"""수치 테이블 xlsx → 게임 데이터 초안 버전 SQL.

근거: 기획답변_20261023(Q1~Q6), 상세 14(ID·키 규칙, 자동 검증), 총괄 6장(처리 단계),
      시트 `캐릭터`·`전투카드`·`스펠`·`설정값`.

사용:
  python3 import_balance.py TCG_밸런스테이블.xlsx -o seed.sql [--based-on N] [--note TEXT]
  python3 import_balance.py old.xlsx --legacy -o seed.sql   # 구버전 xlsx(ID·키 열 없음) 로컬 테스트용

출력 SQL은 data_create_draft()로 새 초안을 만들고 행을 채운다. 배포는 data_publish(버전)로 따로 한다.
오류가 하나라도 있으면 SQL을 쓰지 않고 종료 코드 1.
"""
import argparse
import json
import os
import re
import sys

import openpyxl

# 기획답변 1: 구버전 xlsx(ID 열 없음)에서만 쓰는 보완 표
LEGACY_CHARACTER_IDS = {
    "아우렐": "AU", "피로스": "PY", "이그니스": "IG", "셀레네": "SE", "테티스": "TE",
    "모르테": "MO", "실피": "SL", "움브라": "UM", "실렌티아": "SI",
}
# 기획답변 10차: 시트 `캐릭터`의 `패시브 수치`·`액티브 수치` 열(키=값;키=값). 키 목록·기본값은 엔진에서 뽑은 kit_keys.json
KIT_KEYS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "kit_keys.json"), encoding="utf-8"))
# 기획답변 3
OFFER = {"본편 포함": "included", "유료 추가": "addon"}
# 기획답변 5
KIND = {"면역": "immune", "방어": "defense", "반격": "counter", "침묵": "silence",
        "방해": "disrupt", "스킬": "skill", "공격": "attack"}
KIND_PHASE = {"immune": 1, "defense": 1, "counter": 1, "silence": 2, "disrupt": 2, "skill": 3, "attack": 4}
# 상세 14 자동 검증 (스탯 범위는 설정값에 키가 있으면 그 값을 우선)
DEFAULT_STAT_RANGE = {"hp": (600, 1500), "atk": (60, 140), "def": (20, 70), "spd": (60, 140), "crit": (0, 30)}

errors, warnings = [], []


def err(msg):
    errors.append(msg)


def norm(v):
    return str(v).strip() if v is not None else ""


def header_index(ws, required):
    """required 헤더가 모두 있는 첫 행을 찾아 {헤더: 열 번호} 반환."""
    for r in range(1, min(ws.max_row, 15) + 1):
        row = [norm(c.value) for c in ws[r]]
        if all(h in row for h in required):
            return r, {h: i for i, h in enumerate(row) if h}
    raise SystemExit(f"[{ws.title}] 헤더 행을 찾지 못함: {required}")


def rows_after(ws, r0, first_col):
    for r in range(r0 + 1, ws.max_row + 1):
        row = [c.value for c in ws[r]]
        if row[first_col] is None:
            continue
        yield r, row


def split_skill(text, where):
    name, sep, body = norm(text).partition(":")
    if not sep or not name.strip() or not body.strip():
        err(f"{where}: '이름: 설명' 형식이 아님 → {text!r}")
    return name.strip(), body.strip()


def read_settings(wb, legacy):
    ws = wb["설정값"]
    r0, h = header_index(ws, ["항목", "값"])
    out = {}
    for r, row in rows_after(ws, r0, h["항목"]):
        if row[h["값"]] is None:
            continue  # 하단 안내 문장
        key = norm(row[4]) if len(row) > 4 else ""  # 기획답변 6: 5번째 열
        if legacy and not key:
            key = f"legacy_row_{r:02d}"
        if not re.fullmatch(r"[a-z][a-z0-9_]{1,63}", key):
            err(f"설정값 {r}행 '{norm(row[h['항목']])}': 영문 키 없음/형식 오류 → {key!r}")
            continue
        if key in out:
            err(f"설정값 {r}행: 키 중복 {key}")
        val = row[h["값"]]
        if not isinstance(val, (int, float, bool)):
            err(f"설정값 {r}행 {key}: 값이 숫자가 아님 → {val!r}")
        out[key] = {"value": val, "unit": norm(row[h["단위"]]) if "단위" in h else "",
                    "desc": " ".join(filter(None, [norm(row[h["항목"]]), norm(row[h["설명"]]) if "설명" in h else ""]))}
    return out


def read_characters(wb, legacy):
    ws = wb["캐릭터"]
    r0, h = header_index(ws, ["캐릭터", "HP", "ATK", "DEF", "SPD", "CRIT(%)"])
    offer_col = h.get("제공 방식", h.get("해금"))
    out = {}
    for r, row in rows_after(ws, r0, h["캐릭터"]):
        name = norm(row[h["캐릭터"]])
        if "HP" not in h or not isinstance(row[h["HP"]], (int, float)):
            continue  # 하단 메모 행
        cid = norm(row[h["ID"]]) if "ID" in h else (LEGACY_CHARACTER_IDS.get(name, "") if legacy else "")
        where = f"캐릭터 {r}행 {name}"
        if not re.fullmatch(r"[A-Z]{2,3}", cid):
            err(f"{where}: ID 없음/형식 오류 → {cid!r}")
        offer_raw = norm(row[offer_col]) if offer_col is not None else ""
        offer = OFFER.get(offer_raw) or ("included" if legacy else None)
        if offer is None:
            err(f"{where}: 제공 방식 값 오류 → {offer_raw!r} (본편 포함/유료 추가)")
        p_name, p_text = split_skill(row[h["패시브"]], where + " 패시브")
        a_name, a_text = split_skill(row[h["액티브"]], where + " 액티브")
        if not 2 <= len(name) <= 8:
            err(f"{where}: 이름 2~8자 위반")
        kit = {slot: read_kit(row[h[col]] if col in h else MISSING, cid, slot, where + " " + col, txt)
               for slot, col, txt in (("passive", "패시브 수치", p_text), ("active", "액티브 수치", a_text))}
        out[cid] = dict(id=cid, name=name, job=norm(row[h["직업"]]), role=norm(row[h["역할"]]),
                        passive_params=kit["passive"], active_params=kit["active"],
                        faction=norm(row[h["진영"]]), rarity=norm(row[h["등급"]]) if "등급" in h else None, offer=offer,
                        hp=row[h["HP"]], atk=row[h["ATK"]], def_=row[h["DEF"]], spd=row[h["SPD"]], crit=row[h["CRIT(%)"]],
                        passive_name=p_name, passive_text=p_text, active_name=a_name, active_text=a_text)
    return out


MISSING = object()


def kit_number_forms(v):
    """문구에서 찾을 숫자 표기: 0.06 → 6%, 1.5 → 150%·1.5, 2 → 2"""
    forms = set()
    if v != int(v) or v < 1:
        forms.add(f"{round(v * 100):g}%")
    if v == int(v):
        forms.add(str(int(v)))
    else:
        forms.add(f"{v:g}")
    return forms


def read_kit(raw, cid, slot, where, text):
    """'active_turns=2;active_taken_up=0.15' → dict. 열이 없거나 비면 {} (엔진 기본값 사용)"""
    known = KIT_KEYS.get(cid, {}).get(slot, {})
    if raw is MISSING:
        return {}  # 열 자체가 없음(구버전 시트) → 엔진 기본값
    raw = norm(raw)
    if not raw:
        if known:
            warnings.append(f"{where} 비어 있음 → 엔진 기본값 {known}")
        return {}
    out = {}
    for part in filter(None, (x.strip() for x in raw.split(";"))):
        m = re.fullmatch(r"([a-z][a-z0-9_]*)\s*=\s*(-?[0-9]+(?:\.[0-9]+)?)", part)
        if not m:
            err(f"{where}: 형식 오류 '{part}' (키=값, 영문 snake_case 키, 숫자 값)")
            continue
        k, v = m.group(1), float(m.group(2))
        if k not in known:
            other = KIT_KEYS.get(cid, {}).get("active" if slot == "passive" else "passive", {})
            err(f"{where}: 알 수 없는 키 '{k}'" + (" (다른 열의 키)" if k in other else f" (가능: {', '.join(known) or '없음'})"))
            continue
        if k in out:
            err(f"{where}: 키 '{k}' 중복")
        out[k] = int(v) if v == int(v) else v
        if not any(re.search(r"(?<![0-9.])" + re.escape(f) + r"(?![0-9])", text or "") for f in kit_number_forms(v)) and v != known[k]:
            warnings.append(f"{where}: {k}={out[k]} 이 스킬 문구에 없음 (수치 열이 기준) → '{text}'")
    for k in known:
        if k not in out:
            warnings.append(f"{where}: '{k}' 없음 → 엔진 기본값 {known[k]}")
    return out


def read_cards(wb, chars):
    ws = wb["전투카드"]
    r0, h = header_index(ws, ["ID", "카드명", "종류", "처리 단계", "공용/전용", "비용(E)"])
    by_name = {c["name"]: cid for cid, c in chars.items()}
    out = {}
    for r, row in rows_after(ws, r0, h["ID"]):
        cid = norm(row[h["ID"]])
        if not re.fullmatch(r"(C\d{2}|[A-Z]{2,3}\d{2})", cid):
            continue  # 하단 설명 행
        where = f"전투카드 {r}행 {cid}"
        kind = KIND.get(norm(row[h["종류"]]))
        phase = row[h["처리 단계"]]
        if kind is None:
            err(f"{where}: 종류 값 오류 → {row[h['종류']]!r}")
        elif phase != KIND_PHASE[kind]:
            err(f"{where}: 처리 단계 {phase} ≠ {kind} 기준 {KIND_PHASE[kind]}")
        scope = norm(row[h["공용/전용"]])
        owner = None if scope == "공용" else (scope if scope in chars else by_name.get(scope))
        if scope != "공용" and owner is None:
            err(f"{where}: 전용 카드 주인 '{scope}'를 캐릭터에서 찾지 못함")
        if (owner is None) != cid.startswith("C") or (owner and not cid.startswith(owner)):
            err(f"{where}: ID와 공용/전용·주인이 맞지 않음 (owner={owner})")
        cost = row[h["비용(E)"]]
        if not isinstance(cost, int) or not 0 <= cost <= 3:
            err(f"{where}: 비용 0~3 위반 → {cost!r}")
        out[cid] = dict(id=cid, name=norm(row[h["카드명"]]), kind=kind, phase=phase, owner=owner, cost=cost,
                        coef=row[h["계수"]], hits=row[h["타수"]] or 1, pierce=row[h["관통"]] or 0,
                        effect=norm(row[h["효과"]]))
    for cid, c in chars.items():
        n = sum(1 for k in out.values() if k["owner"] == cid)
        if n != 2:
            err(f"캐릭터 {cid}: 전용카드 {n}장 (2장이어야 함, 상세 14)")
    return out


def read_spells(wb, legacy):
    ws = wb["스펠"]
    r0, h = header_index(ws, ["스펠", "효과", "효과값", "쿨다운(턴)"])
    out, order = {}, 0
    for r, row in rows_after(ws, r0, h["스펠"]):
        if not isinstance(row[h["쿨다운(턴)"]], (int, float)):
            continue
        order += 1
        sid = norm(row[h["ID"]]) if "ID" in h else (f"SP{order:02d}" if legacy else "")
        if not re.fullmatch(r"SP\d{2}", sid):
            err(f"스펠 {r}행: ID 없음/형식 오류 → {sid!r}")
        val = row[h["효과값"]]
        out[sid] = dict(id=sid, name=norm(row[h["스펠"]]), effect=norm(row[h["효과"]]),
                        value=val if isinstance(val, (int, float)) else None, cooldown=int(row[h["쿨다운(턴)"]]))
    return out


STYLE = {"공세": "aggro", "균형": "balance", "수비": "defense"}


def read_presets(wb, chars, cards):
    """시트 `추천덱`: 캐릭터×유형 행, 공용 카드 열(헤더 'C01 베기')에 장수. 상세 15 검증 규칙."""
    if "추천덱" not in wb.sheetnames:
        err("시트 `추천덱` 없음")
        return []
    ws = wb["추천덱"]
    r0, h = header_index(ws, ["캐릭터", "유형"])
    card_cols = {}
    for name, i in h.items():
        m = re.match(r"(C\d{2})\b", name)
        if m:
            card_cols[m.group(1)] = i
    by_name = {c["name"]: cid for cid, c in chars.items()}
    out, seen = [], {}
    for r, row in rows_after(ws, r0, h["캐릭터"]):
        style = STYLE.get(norm(row[h["유형"]]))
        cname = norm(row[h["캐릭터"]])
        cid = cname if cname in chars else by_name.get(cname)
        where = f"추천덱 {r}행 {cname}"
        if style is None or cid is None:
            err(f"{where}: 캐릭터·유형을 읽지 못함")
            continue
        deck = []
        for card_id, i in card_cols.items():
            n = row[i] or 0
            if not isinstance(n, int) or not 0 <= n <= 2:
                err(f"{where}: {card_id} 장수 {n!r} (0~2)")
                continue
            if card_id not in cards or cards[card_id]["owner"] is not None:
                err(f"{where}: {card_id}는 공용 카드가 아님")
            deck += [card_id] * n
        if len(deck) != 10:
            err(f"{where}: 공용 카드 {len(deck)}장 (10장이어야 함)")
        seen.setdefault(cid, []).append(style)
        out.append(dict(character=cid, slot=list(STYLE.values()).index(style) + 1, style=style, cards=deck))
    for cid in chars:
        if sorted(seen.get(cid, [])) != sorted(STYLE.values()):
            err(f"추천덱: {cid} 공세·균형·수비 3개가 아님 → {seen.get(cid)}")
    return out


def read_tables(wb):
    """시트 `랭크_승점`(단계표)·`이탈패널티`(단계·기간)를 표 단위 JSON으로. 열 위치는 헤더 이름으로 찾는다."""
    out = {}
    ws = wb["랭크_승점"]
    r0, h = header_index(ws, ["순번", "단계", "누적 RP 시작", "기준 MMR", "패배 감소 배율", "하한선", "AI 대체"])
    reset_col = next((i for n, i in h.items() if n.startswith("리셋 후")), None)
    tiers, names = [], {}
    for r, row in rows_after(ws, r0, h["순번"]):
        if not isinstance(row[h["순번"]], int):
            continue
        names[norm(row[h["단계"]])] = row[h["순번"]]
        tiers.append(dict(no=row[h["순번"]], name=norm(row[h["단계"]]), rp_start=row[h["누적 RP 시작"]], mmr=row[h["기준 MMR"]],
                          loss_mult=row[h["패배 감소 배율"]], floor=norm(row[h["하한선"]]) == "하한선", ai=norm(row[h["AI 대체"]]) == "있음",
                          reset_to=norm(row[reset_col]) if reset_col is not None else ""))
    for t in tiers:
        if t["reset_to"] not in names:
            err(f"랭크_승점: {t['name']} 리셋 후 단계 '{t['reset_to']}'를 찾지 못함")
        t["reset_to"] = names.get(t["reset_to"], 1)
    if [t["no"] for t in tiers] != list(range(1, len(tiers) + 1)) or any(b["rp_start"] <= a["rp_start"] for a, b in zip(tiers, tiers[1:])):
        err("랭크_승점: 순번·누적 RP가 순서대로가 아님")
    params = {}
    for row in ws.iter_rows(min_row=1, max_row=r0, values_only=True):
        vals = [v for v in row]
        for i, v in enumerate(vals):
            if norm(v) == "기준 MMR 시작":
                params["mmr_start"] = next(x for x in vals[i + 1:] if isinstance(x, (int, float)))
    out["rank_tiers"] = {"tiers": tiers, **params}

    ws = wb["이탈패널티"]
    lp = {}
    keys = {"누적 집계 기간(일)": "window_days", "감면에 필요한 정상 완료 판수": "reduce_per_games", "네트워크 면책(하루 횟수)": "net_exempt_per_day"}
    for row in ws.iter_rows(min_row=1, max_row=8, values_only=True):
        k = keys.get(norm(row[0]))
        if k:
            lp[k] = next(x for x in row[1:] if isinstance(x, (int, float)))
    r0, h = header_index(ws, ["누적 이탈", "제재", "매칭 전 대기(분)", "적용 판수", "판 보상 배율", "랭킹전 잠금(시간)"])
    steps = []
    for r, row in rows_after(ws, r0, h["누적 이탈"]):
        if not isinstance(row[h["누적 이탈"]], int):
            break
        steps.append(dict(count=row[h["누적 이탈"]], label=norm(row[h["제재"]]), delay_min=row[h["매칭 전 대기(분)"]],
                          games=row[h["적용 판수"]], reward_mult=row[h["판 보상 배율"]], lock_h=row[h["랭킹전 잠금(시간)"]]))
    if len(lp) != 3 or not steps:
        err(f"이탈패널티: 기간·감면·단계를 읽지 못함 ({lp}, {len(steps)}단계)")
    out["leaver"] = {**lp, "steps": steps}
    return out


def lit(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(int(v)) if float(v).is_integer() else repr(float(v))
    return "'" + str(v).replace("'", "''") + "'"


def emit(chars, cards, spells, settings, presets, tables, based_on, note):
    q = "$imp$"
    out = [f"-- generated by tools/import_balance.py · {note}", f"do {q}", "declare v bigint;", "begin",
           f"  v := public.data_create_draft({lit(based_on)}, {lit(note)}, null);"]
    if based_on is not None:  # 기준 버전 위에 덮어쓰기: 시트에 있는 행만 교체
        out += ["  delete from public.data_tables where version_id = v;", "  delete from public.deck_presets where version_id = v;", "  delete from public.cards where version_id = v;", "  delete from public.characters where version_id = v;",
                "  delete from public.spells where version_id = v;", "  delete from public.settings where version_id = v;"]
    for c in chars.values():
        out.append("  insert into public.characters (version_id,id,name,job,role,faction,rarity,offer,hp,atk,def,spd,crit,"
                   "passive_name,passive_text,active_name,active_text,passive_params,active_params) values (v," + ",".join(lit(c[k]) for k in (
                       "id", "name", "job", "role", "faction", "rarity", "offer", "hp", "atk", "def_", "spd", "crit",
                       "passive_name", "passive_text", "active_name", "active_text"))
                   + f",{lit(json.dumps(c['passive_params'], ensure_ascii=False))}::jsonb,{lit(json.dumps(c['active_params'], ensure_ascii=False))}::jsonb);")
    for k in cards.values():
        out.append("  insert into public.cards (version_id,id,name,kind,phase,owner_character,cost,coef,hits,pierce,effect_text)"
                   " values (v," + ",".join(lit(k[x]) for x in (
                       "id", "name", "kind", "phase", "owner", "cost", "coef", "hits", "pierce", "effect")) + ");")
    for s in spells.values():
        out.append("  insert into public.spells (version_id,id,name,effect_text,value,cooldown) values (v," +
                   ",".join(lit(s[x]) for x in ("id", "name", "effect", "value", "cooldown")) + ");")
    for key, s in settings.items():
        out.append(f"  insert into public.settings (version_id,key,value,unit,description) values (v,{lit(key)},"
                   f"to_jsonb({lit(s['value'])}::numeric),{lit(s['unit'])},{lit(s['desc'])});")
    for p in presets:
        arr = "array[" + ",".join(lit(c) for c in p["cards"]) + "]::text[]"
        out.append(f"  insert into public.deck_presets (version_id,character_id,slot,style,cards) values (v,{lit(p['character'])},{p['slot']},{lit(p['style'])},{arr});")
    for name, body in tables.items():
        import json as _json
        out.append(f"  insert into public.data_tables (version_id,name,body) values (v,{lit(name)},{lit(_json.dumps(body, ensure_ascii=False))}::jsonb);")
    out += ["  raise notice 'draft version %', v;", "end", f"{q};", ""]
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--based-on", type=int)
    ap.add_argument("--note", default="xlsx import")
    ap.add_argument("--legacy", action="store_true", help="ID·키 열 없는 구버전 xlsx (로컬 테스트 전용)")
    a = ap.parse_args()

    wb = openpyxl.load_workbook(a.xlsx, data_only=True)
    settings = read_settings(wb, a.legacy)
    chars = read_characters(wb, a.legacy)
    cards = read_cards(wb, chars)
    spells = read_spells(wb, a.legacy)
    presets = read_presets(wb, chars, cards)
    tables = read_tables(wb)

    # 상세 14 자동 검증: 스탯 범위·예산 (경고 → 검수 단계에서 차단, 가져오기는 허용)
    ws = wb["캐릭터"]
    _, hc = header_index(ws, ["HP", "ATK", "DEF", "SPD", "CRIT(%)"])
    wrow = next((r for r in ws.iter_rows(min_row=1, max_row=6, values_only=True) if norm(r[0]) == "가중치"), None)
    weights = [wrow[hc[k]] for k in ("HP", "ATK", "DEF", "SPD", "CRIT(%)")] if wrow else None
    if weights and not all(isinstance(x, (int, float)) for x in weights):
        warnings.append(f"가중치 행을 읽지 못함 → 스탯 예산 검사 생략 ({weights})")
        weights = None
    target = settings.get("stat_budget_target", {}).get("value", 320)
    tol = settings.get("stat_budget_tol", {}).get("value", 0.03)
    for c in chars.values():
        stats = {"hp": c["hp"], "atk": c["atk"], "def": c["def_"], "spd": c["spd"], "crit": c["crit"]}
        for s, (lo, hi) in DEFAULT_STAT_RANGE.items():
            if not lo <= stats[s] <= hi:
                warnings.append(f"{c['id']} {s.upper()} {stats[s]} 범위 {lo}~{hi} 밖")
        if weights:
            budget = sum(v * w for v, w in zip(stats.values(), weights))
            if abs(budget / target - 1) > tol:
                warnings.append(f"{c['id']} 스탯 예산 {budget:g} (목표 {target}±{tol:.0%} 밖)")
    if len(spells) != 8:
        warnings.append(f"스펠 {len(spells)}종 (기획 8종)")

    for w in warnings:
        print("경고:", w, file=sys.stderr)
    if errors:
        for e in errors:
            print("오류:", e, file=sys.stderr)
        print(f"오류 {len(errors)}건 → SQL을 만들지 않음", file=sys.stderr)
        sys.exit(1)
    if a.legacy:
        warnings.append("legacy 모드: 설정값 키가 임시(legacy_row_NN)라 배포 금지")
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(emit(chars, cards, spells, settings, presets, tables, a.based_on, a.note + (" [LEGACY TEST]" if a.legacy else "")))
    print(f"캐릭터 {len(chars)} · 카드 {len(cards)} · 스펠 {len(spells)} · 설정 {len(settings)} · 추천덱 {len(presets)} · 표 {",".join(tables)} → {a.out}")


if __name__ == "__main__":
    main()
