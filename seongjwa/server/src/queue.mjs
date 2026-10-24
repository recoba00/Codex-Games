// 랭킹전 공개 매칭 큐 (Durable Object 1개, 크로스 플레이 단일 풀). 연결 절전 + 필요한 시각에만 알람.
// 근거: 총괄 8장(탐색 범위 0~10초 ±100·10~20초 ±200·20초~NN초 ±350, NN초 AI 전환, 전환 직전 1초 사람 우선,
//      다이아 이상 AI 없음·최대 120초 후 취소, "사람 상대만 기다리기"), 10장(이탈 단계 대기·잠금, 닷지 당한 쪽 대기열 맨 앞).
import { DurableObject } from "cloudflare:workers";
import { sha256Hex } from "./tokens.mjs";

import { matchTick, nextWake, pairKey, prunePairs, PAIR_DEFAULT, searchRange } from "./queue-logic.mjs";

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const send = (ws, v) => { try { ws.send(JSON.stringify(v)); } catch { /* closing */ } };

export class MatchQueue extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  // 대기열 = 열린 소켓의 attachment(절전해도 유지)
  entries() {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === 1).map((ws) => ({ ws, ...ws.deserializeAttachment() })).filter((e) => e.acc);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    if (url.pathname === "/ticket") {  // Worker가 랭크·이탈 상태를 확인한 뒤 발급
      const body = await request.json();
      const ticket = crypto.randomUUID() + crypto.randomUUID();
      const tickets = ((await this.ctx.storage.get("tickets")) ?? []).filter((t) => t.exp > now);
      const prio = (await this.ctx.storage.get("priority")) ?? {};
      const since = prio[body.acc] && prio[body.acc].exp > now ? prio[body.acc].since : null;  // 닷지 당한 쪽은 원래 대기 시각 유지
      tickets.push({ hash: await sha256Hex(ticket), exp: now + 45000, entry: { ...body.entry, since } });
      await this.ctx.storage.put("tickets", tickets);
      return json({ ok: true, ticket });
    }
    if (url.pathname === "/priority") {
      const body = await request.json();
      const prio = (await this.ctx.storage.get("priority")) ?? {};
      prio[body.acc] = { since: body.since, exp: now + 5 * 60000 };
      await this.ctx.storage.put("priority", prio);
      return json({ ok: true });
    }
    if (url.pathname === "/ws") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ ok: false, error: "websocket_required" }, 426);
      const hash = await sha256Hex(url.searchParams.get("ticket") ?? "");
      const tickets = (await this.ctx.storage.get("tickets")) ?? [];
      const t = tickets.find((x) => x.hash === hash && x.exp > now);
      await this.ctx.storage.put("tickets", tickets.filter((x) => x.hash !== hash && x.exp > now));
      if (!t) return json({ ok: false, error: "ticket_invalid" }, 401);
      for (const e of this.entries()) if (e.acc === t.entry.acc) try { e.ws.close(4001, "replaced"); } catch { /* */ }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      const entry = { ...t.entry, since: t.entry.since ?? now };
      server.serializeAttachment(entry);
      send(server, { type: "queued", since: entry.since, notBefore: entry.notBefore, aiOk: entry.aiOk, humanOnly: entry.humanOnly, now });
      await this.tick(now);
      return new Response(null, { status: 101, webSocket: client });
    }
    return json({ ok: false, error: "not_found" }, 404);
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (m.type === "cancel") { try { ws.close(1000, "cancelled"); } catch { /* */ } }
  }

  async webSocketClose(ws) { try { ws.close(1000, "bye"); } catch { /* */ } }

  async alarm() { await this.tick(Date.now()); }

  async tick(now) {
    const entries = this.entries();
    const aiFallbackSec = Number(entries[0]?.aiFallbackSec ?? 30);
    const pair = entries[0]?.pair ?? PAIR_DEFAULT;  // 몰아주기 방지(상세 13): 기준은 발급 시점 데이터의 설정값
    const history = prunePairs((await this.ctx.storage.get("pairs")) ?? {}, now, pair);
    const { pairs, ai, timeout } = matchTick(entries, now, { aiFallbackSec, history, pair });
    for (const [a, b] of pairs) {
      await this.start("ranked", [a, b], now);
      (history[pairKey(a.acc, b.acc)] ??= []).push(now);
    }
    await this.ctx.storage.put("pairs", history);
    for (const a of ai) await this.start("ranked_ai", [a], now);
    for (const a of timeout) { send(a.ws, { type: "timeout" }); try { a.ws.close(1000, "timeout"); } catch { /* */ } }
    const left = this.entries();
    const wake = nextWake(left, now, { aiFallbackSec });
    if (wake) await this.ctx.storage.setAlarm(wake);
    for (const e of left) send(e.ws, { type: "waiting", waitSec: Math.floor((now - e.since) / 1000), range: searchRange((now - e.since) / 1000, { aiFallbackSec, wideAfterFallback: !e.aiOk || e.humanOnly }) });
  }

  async start(mode, list, now) {
    const ROOM_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = [...crypto.getRandomValues(new Uint8Array(6))].map((b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join("");
      const res = await this.env.ROOMS.get(this.env.ROOMS.idFromName(code)).fetch("https://room/create-match", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, mode, players: list.map((e) => ({ acc: e.acc, tier: e.tier, mmr: e.mmr, since: e.since, defaults: e.defaults })), seasonId: list[0].seasonId })
      });
      if (res.status === 409) continue;
      for (const e of list) {
        send(e.ws, { type: "matched", code, mode, ai: mode === "ranked_ai", waitSec: Math.floor((now - e.since) / 1000) });
        try { e.ws.close(1000, "matched"); } catch { /* */ }
      }
      return;
    }
  }
}
