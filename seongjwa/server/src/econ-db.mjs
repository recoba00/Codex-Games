// 경제 DB 연동: 상태 읽기 → economy.mjs 계산 → econ_commit(상태 + 골드, ref로 한 번만). 판 DO·라우트가 쓴다.
import { rpc } from "./db.mjs";
import { applyMatch, applyTier, econConfig, econView, firstWinMult, roll } from "./economy.mjs";
import { currentSeason, tierName } from "./ranking.mjs";

export async function econLoad(env, data, account, season) {
  season ??= await currentSeason(env);
  const raw = await rpc(env, "econ_get", { p_account: account, p_season: season.id });
  const cfg = econConfig(data);
  const tier = raw.tier ?? 1;
  let state = roll(raw.state, { account, now: Date.now(), seasonId: season.id, cfg });
  state = applyTier(state, raw.tier ?? 0, cfg);
  return { raw, cfg, season, tier, tierName: tierName(data, tier), state };
}

// fn(state, ctx) → { state, gold, reason, detail, result }. 버전 충돌이면 다시 읽고 다시 계산(최대 3회)
export async function econMutate(env, data, account, ref, fn, season) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ctx = await econLoad(env, data, account, season);
    const out = fn(ctx.state, ctx);
    try {
      const res = await rpc(env, "econ_commit", {
        p_account: account, p_ref: typeof ref === "function" ? ref(out, ctx.state) : ref, p_expected_version: ctx.raw.version, p_state: out.state,
        p_gold_delta: out.gold ?? 0, p_reason: out.reason, p_detail: out.detail ?? {}
      });
      return { ...out, duplicate: res.status === "duplicate", balance: res.gold ?? ctx.raw.gold, view: econView(out.state, ctx.cfg, Date.now()) };
    } catch (error) {
      if (error.message !== "econ_conflict" || attempt === 2) throw error;
    }
  }
  throw new Error("econ_conflict");
}

// 판 결과 → 골드·미션 (판 ID가 ref라 재시도해도 한 번만)
export async function settleEconomy(env, data, job) {
  const season = await currentSeason(env);
  const out = [];
  for (const p of job.players) {
    const ch = data.characters?.[p.character] ?? {};
    const r = await econMutate(env, data, p.acc, `match:${job.matchId}`, (state, ctx) => {
      const res = applyMatch(state, {
        mode: job.mode, result: p.result, character: p.character, faction: ch.faction,
        exclusive: p.stats?.exclusive ?? 0, spells: p.stats?.spells ?? 0, tier: ctx.tier, tierMult: firstWinMult(ctx.tierName)
      }, ctx.cfg);
      return { state: res.state, gold: res.gold, reason: "match", detail: { mode: job.mode, result: p.result, parts: res.parts, counted: res.counted }, result: res };
    }, season);
    out.push({ acc: p.acc, gold: r.duplicate ? 0 : r.gold, parts: r.duplicate ? [] : r.result.parts, balance: r.balance });
  }
  return out;
}
