// 엔진 스킬 수치 키 목록 → tools/kit_keys.json (가져오기 도구가 읽는다). kit.test.mjs가 동기화를 확인한다.
// 사용: node tools/kit-keys.mjs > ../tools/kit_keys.json
import { CHARACTER_PARAM_DEFAULTS, toSnake } from "../src/engine/rules.mjs";

export function kitKeys() {
  const out = {};
  for (const [id, params] of Object.entries(CHARACTER_PARAM_DEFAULTS)) {
    out[id] = { passive: {}, active: {} };
    for (const [k, v] of Object.entries(params)) out[id][k.startsWith("passive") ? "passive" : "active"][toSnake(k)] = v;
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(kitKeys(), null, 2));
