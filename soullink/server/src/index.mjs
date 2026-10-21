import { DurableObject } from "cloudflare:workers";
import { applyMove, commitTurn, createMatch, forfeit, timeoutTurn, useSkill } from "./engine.mjs";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const ROOM_CODE = /^[346789ABCDEFGHJKMNPQRTUVWXY]{8}$/;
const MAX_BODY = 16 * 1024;
const LOBBY_TTL_MS = 10 * 60 * 1000;
const FINISHED_TTL_MS = 60 * 60 * 1000;
const TICKET_TTL_MS = 45 * 1000;

function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function errorResponse(error, status = 400) {
  return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, status);
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) throw new Error("body_too_large");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error("body_too_large");
  return text ? JSON.parse(text) : {};
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = new Set(String(env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  return allowed.has(origin) ? origin : false;
}

function cors(origin) {
  return origin ? {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "vary": "origin"
  } : {};
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  const alphabet = "346789ABCDEFGHJKMNPQRTUVWXY";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join("");
}

async function authenticate(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error("auth_not_configured");
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new Error("auth_required");
  const response = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, "")}/auth/v1/user`, {
    headers: { authorization, apikey: env.SUPABASE_PUBLISHABLE_KEY }
  });
  if (!response.ok) throw new Error("auth_invalid");
  const user = await response.json();
  if (!user?.id) throw new Error("auth_invalid");
  return { id: user.id, token: authorization.slice(7) };
}

async function loadCatalog(env, token) {
  const response = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, "")}/rest/v1/game_catalog?id=eq.published&select=schema_version,revision,document`, {
    headers: { authorization: `Bearer ${token}`, apikey: env.SUPABASE_PUBLISHABLE_KEY, accept: "application/json" }
  });
  if (!response.ok) throw new Error("catalog_unavailable");
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("catalog_not_published");
  return rows[0];
}

async function admission(env, request, kind) {
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const key = await sha256(`soullink-rate-v1:${ip}`);
  const id = env.GATE.idFromName("global-v1");
  const response = await env.GATE.get(id).fetch("https://gate/allow", {
    method: "POST",
    body: JSON.stringify({ key, kind, now: Date.now() })
  });
  if (!response.ok) throw new Error(response.status === 429 ? "rate_limited" : "admission_unavailable");
}

function roomStub(env, code) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

async function roomRequest(env, code, path, body) {
  return roomStub(env, code).fetch(`https://room${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);
    if (origin === false) return errorResponse("origin_forbidden", 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "soullink-match", authConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) }, 200, cors(origin));
    }
    try {
      const user = await authenticate(request, env);
      if (request.method === "POST" && url.pathname === "/v1/rooms") {
        await admission(env, request, "create");
        const input = await readJson(request);
        const catalog = await loadCatalog(env, user.token);
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const code = randomCode();
          const response = await roomRequest(env, code, "/create", { userId: user.id, input, catalog, now: Date.now(), code });
          if (response.status === 409) continue;
          return new Response(response.body, { status: response.status, headers: { ...Object.fromEntries(response.headers), ...cors(origin) } });
        }
        throw new Error("room_code_exhausted");
      }
      const match = url.pathname.match(/^\/v1\/rooms\/([^/]+)\/(join|ticket|snapshot|ws)$/);
      if (!match || !ROOM_CODE.test(match[1])) return errorResponse("not_found", 404);
      const code = match[1];
      const action = match[2];
      if (action === "ws") {
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") throw new Error("websocket_required");
        const ticket = url.searchParams.get("ticket") ?? "";
        return roomStub(env, code).fetch(`https://room/ws?ticket=${encodeURIComponent(ticket)}`, request);
      }
      await admission(env, request, action === "join" ? "join" : "access");
      const input = action === "join" ? await readJson(request) : {};
      const response = await roomRequest(env, code, `/${action}`, { userId: user.id, input, now: Date.now() });
      return new Response(response.body, { status: response.status, headers: { ...Object.fromEntries(response.headers), ...cors(origin) } });
    } catch (error) {
      const code = error instanceof SyntaxError ? "json_invalid" : error.message;
      const status = code === "auth_required" || code === "auth_invalid" ? 401 : code === "rate_limited" ? 429 : code === "not_found" ? 404 : code === "auth_not_configured" ? 503 : 400;
      return json({ ok: false, error: code }, status, cors(origin));
    }
  }
};

export class AdmissionGate extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS attempts (key TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS attempts_lookup ON attempts (key, kind, at);
      CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, rooms INTEGER NOT NULL);
    `);
  }

  async fetch(request) {
    if (new URL(request.url).pathname !== "/allow" || request.method !== "POST") return errorResponse("not_found", 404);
    const { key, kind, now } = await readJson(request);
    if (!/^[a-f0-9]{64}$/.test(key) || !["create", "join", "access"].includes(kind) || !Number.isFinite(now)) return errorResponse("request_invalid");
    const windowStart = now - 10 * 60 * 1000;
    this.ctx.storage.sql.exec("DELETE FROM attempts WHERE at < ?", windowStart);
    const count = this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM attempts WHERE key = ? AND kind = ? AND at >= ?", key, kind, windowStart).one().count;
    const limit = kind === "create" ? 6 : kind === "join" ? 20 : 60;
    if (count >= limit) return errorResponse("rate_limited", 429);
    if (kind === "create") {
      const day = new Date(now).toISOString().slice(0, 10);
      this.ctx.storage.sql.exec("INSERT INTO daily(day, rooms) VALUES(?, 0) ON CONFLICT(day) DO NOTHING", day);
      const rooms = this.ctx.storage.sql.exec("SELECT rooms FROM daily WHERE day = ?", day).one().rooms;
      if (rooms >= 200) return errorResponse("daily_room_cap", 429);
      this.ctx.storage.sql.exec("UPDATE daily SET rooms = rooms + 1 WHERE day = ?", day);
    }
    this.ctx.storage.sql.exec("INSERT INTO attempts(key, kind, at) VALUES(?, ?, ?)", key, kind, now);
    return json({ ok: true });
  }
}

export class MatchRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_state (id INTEGER PRIMARY KEY CHECK(id = 1), document TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tickets (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
    `);
  }

  load() {
    const row = this.ctx.storage.sql.exec("SELECT document FROM room_state WHERE id = 1").toArray()[0];
    return row ? JSON.parse(row.document) : null;
  }

  save(room) {
    this.ctx.storage.sql.exec("INSERT INTO room_state(id, document, updated_at) VALUES(1, ?, ?) ON CONFLICT(id) DO UPDATE SET document = excluded.document, updated_at = excluded.updated_at", JSON.stringify(room), Date.now());
  }

  seat(room, userId) {
    return room.players.findIndex((player) => player.userId === userId);
  }

  publicState(room, viewerSeat) {
    return {
      type: "state",
      roomCode: room.code,
      phase: room.phase,
      version: room.version,
      youSeat: viewerSeat,
      players: room.players.map((player, seat) => ({ seat, ready: player.ready, connected: this.connected(room, player.userId), characterId: player.characterId, skinId: player.skinId })),
      match: room.match,
      expiresAt: room.expiresAt
    };
  }

  connected(_room, userId) {
    return this.ctx.getWebSockets().some((ws) => ws.deserializeAttachment()?.userId === userId);
  }

  send(ws, value) {
    try { ws.send(JSON.stringify(value)); } catch { /* connection is already closing */ }
  }

  broadcast(room, event = null) {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (!attachment) continue;
      if (event) this.send(ws, event);
      this.send(ws, this.publicState(room, this.seat(room, attachment.userId)));
    }
  }

  async schedule(room) {
    const next = room.match?.turnDeadline || room.expiresAt;
    if (next > Date.now()) await this.ctx.storage.setAlarm(next);
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/ws") return this.openSocket(request, url.searchParams.get("ticket") ?? "");
      if (request.method !== "POST") return errorResponse("not_found", 404);
      const body = await readJson(request);
      let room = this.load();
      if (url.pathname === "/create") {
        if (room) return errorResponse("room_exists", 409);
        const characterId = String(body.input?.characterId ?? "");
        const skinId = String(body.input?.skinId ?? "base");
        if (!body.catalog?.document?.characters?.[characterId]?.enabled) throw new Error("character_unavailable");
        room = {
          code: body.code,
          phase: "lobby",
          version: 1,
          createdAt: body.now,
          expiresAt: body.now + LOBBY_TTL_MS,
          catalog: body.catalog,
          dimensions: body.input?.dimensions ?? { cols: 6, rows: 5 },
          players: [{ userId: body.userId, characterId, skinId, ready: false }],
          match: null,
          persisted: false,
          processed: []
        };
        this.save(room);
        await this.schedule(room);
        return json({ ok: true, roomCode: room.code, expiresAt: room.expiresAt });
      }
      if (!room) return errorResponse("room_not_found", 404);
      if (url.pathname === "/join") {
        let seat = this.seat(room, body.userId);
        if (seat < 0) {
          if (room.phase !== "lobby" || room.players.length >= 2) throw new Error("room_full");
          const characterId = String(body.input?.characterId ?? "");
          const skinId = String(body.input?.skinId ?? "base");
          if (!room.catalog.document?.characters?.[characterId]?.enabled) throw new Error("character_unavailable");
          room.players.push({ userId: body.userId, characterId, skinId, ready: false });
          room.version += 1;
          seat = 1;
          this.save(room);
        }
        return json({ ok: true, roomCode: room.code, seat });
      }
      const seat = this.seat(room, body.userId);
      if (seat < 0) return errorResponse("not_participant", 403);
      if (url.pathname === "/snapshot") return json({ ok: true, state: this.publicState(room, seat) });
      if (url.pathname === "/ticket") {
        const ticket = crypto.randomUUID() + crypto.randomUUID();
        const hash = await sha256(ticket);
        this.ctx.storage.sql.exec("DELETE FROM tickets WHERE expires_at < ?", body.now);
        this.ctx.storage.sql.exec("INSERT INTO tickets(hash, user_id, expires_at) VALUES(?, ?, ?)", hash, body.userId, body.now + TICKET_TTL_MS);
        return json({ ok: true, ticket, expiresIn: TICKET_TTL_MS / 1000 });
      }
      return errorResponse("not_found", 404);
    } catch (error) {
      return errorResponse(error);
    }
  }

  async openSocket(request, ticket) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return errorResponse("websocket_required", 426);
    if (!ticket || ticket.length > 128) return errorResponse("ticket_invalid", 401);
    const hash = await sha256(ticket);
    const row = this.ctx.storage.sql.exec("SELECT user_id, expires_at FROM tickets WHERE hash = ?", hash).toArray()[0];
    this.ctx.storage.sql.exec("DELETE FROM tickets WHERE hash = ?", hash);
    if (!row || row.expires_at < Date.now()) return errorResponse("ticket_invalid", 401);
    const room = this.load();
    const seat = room ? this.seat(room, row.user_id) : -1;
    if (!room || seat < 0) return errorResponse("not_participant", 403);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId: row.user_id, seat });
    this.send(server, { type: "welcome", protocol: 1, seat });
    this.send(server, this.publicState(room, seat));
    this.broadcast(room, { type: "presence", seat, connected: true });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > 8192) return this.send(ws, { type: "error", error: "message_invalid" });
    const attachment = ws.deserializeAttachment();
    let message;
    try { message = JSON.parse(raw); } catch { return this.send(ws, { type: "error", error: "json_invalid" }); }
    if (message.type === "ping") return this.send(ws, { type: "pong", at: Date.now() });
    let room = this.load();
    if (!room || !attachment) return this.send(ws, { type: "error", error: "room_unavailable" });
    const seat = this.seat(room, attachment.userId);
    if (seat < 0) return this.send(ws, { type: "error", error: "not_participant" });
    const actionId = String(message.actionId ?? "");
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(actionId)) return this.send(ws, { type: "error", error: "action_id_invalid" });
    if (room.processed.includes(actionId)) return this.send(ws, this.publicState(room, seat));
    try {
      let receipt = null;
      if (message.type === "ready") {
        if (room.phase !== "lobby") throw new Error("phase_invalid");
        room.players[seat].ready = true;
        room.version += 1;
        if (room.players.length === 2 && room.players.every((player) => player.ready)) {
          const seed = crypto.getRandomValues(new Uint32Array(1))[0];
          const selections = room.players.map((player) => ({ characterId: player.characterId, skinId: player.skinId, catalogRevision: room.catalog.revision }));
          room.match = createMatch(seed, selections, room.catalog.document, room.dimensions, Date.now());
          room.phase = "battle";
          room.expiresAt = Date.now() + 30 * 60 * 1000;
        }
      } else if (message.type === "move") {
        if (room.phase !== "battle") throw new Error("phase_invalid");
        room.match = applyMove(room.match, seat, message.path, false, Date.now());
      } else if (message.type === "skill") {
        if (room.phase !== "battle") throw new Error("phase_invalid");
        const result = useSkill(room.match, seat);
        room.match = result.match;
        receipt = result.receipt;
      } else if (message.type === "commit") {
        if (room.phase !== "battle") throw new Error("phase_invalid");
        const result = commitTurn(room.match, seat, Date.now());
        room.match = result.match;
        receipt = result.receipt;
      } else if (message.type === "forfeit") {
        if (room.phase !== "battle") throw new Error("phase_invalid");
        room.match = forfeit(room.match, seat);
      } else {
        throw new Error("message_type_invalid");
      }
      room.processed.push(actionId);
      room.processed = room.processed.slice(-64);
      if (room.match?.result) {
        room.phase = "finished";
        room.expiresAt = Date.now() + FINISHED_TTL_MS;
      }
      room.version += 1;
      this.save(room);
      await this.schedule(room);
      this.broadcast(room, receipt ? { type: "receipt", receipt } : null);
      if (room.phase === "finished") await this.persistResult(room);
    } catch (error) {
      this.send(ws, { type: "error", actionId, error: error.message });
    }
  }

  async webSocketClose(ws, code, reason) {
    const attachment = ws.deserializeAttachment();
    const room = this.load();
    if (room && attachment) this.broadcast(room, { type: "presence", seat: this.seat(room, attachment.userId), connected: false });
    try { ws.close(code, reason); } catch { /* runtime may already have acknowledged close */ }
  }

  async alarm() {
    let room = this.load();
    if (!room) return;
    const now = Date.now();
    if (room.phase === "battle" && room.match?.turnDeadline && room.match.turnDeadline <= now) {
      const result = timeoutTurn(room.match, now);
      room.match = result.match;
      if (room.match.result) {
        room.phase = "finished";
        room.expiresAt = now + FINISHED_TTL_MS;
      }
      room.version += 1;
      this.save(room);
      this.broadcast(room, { type: "timeout", receipt: result.receipt });
      if (room.phase === "finished") await this.persistResult(room);
      await this.schedule(room);
      return;
    }
    if (room.phase === "finished" && !room.persisted) await this.persistResult(room);
    if (room.expiresAt <= now) {
      for (const ws of this.ctx.getWebSockets()) try { ws.close(1000, "room_expired"); } catch { /* closing */ }
      this.ctx.storage.sql.exec("DELETE FROM tickets");
      this.ctx.storage.sql.exec("DELETE FROM room_state");
      return;
    }
    await this.schedule(room);
  }

  async persistResult(room) {
    if (room.persisted || !this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_ROLE_KEY || !room.match?.result) return;
    const winnerSeat = room.match.result.winnerSeat;
    const response = await fetch(`${String(this.env.SUPABASE_URL).replace(/\/$/, "")}/rest/v1/match_results`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
        "content-type": "application/json",
        prefer: "return=minimal"
      },
      body: JSON.stringify({
        room_id: room.code,
        player_one_id: room.players[0].userId,
        player_two_id: room.players[1].userId,
        winner_id: winnerSeat == null ? null : room.players[winnerSeat].userId,
        finish_reason: room.match.result.finishReason,
        final_state: { fighters: room.match.fighters, round: room.match.round, catalogRevision: room.catalog.revision },
        started_at: new Date(room.match.startedAt).toISOString(),
        ended_at: new Date(room.match.result.endedAt).toISOString()
      })
    });
    if (response.ok || response.status === 409) {
      room.persisted = true;
      this.save(room);
    }
  }
}
