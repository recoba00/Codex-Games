// 친구 비밀방 = 판 1개를 소유하는 Durable Object (서버 권위, 연결 절전).
// 근거: 총괄 3장(재매칭: 친구방은 방 유지), 7장(밴 10초·픽 15초·스펠·덱 15초, 시간 초과 처리, 방장이 밴 on/off),
//      8장(6자리 코드, 턴 타이머 20/30초), 10장(60초 유예·자동 방어·AFK), 12장(친구방 이탈 = 결과 없음·방 유지, 0.5초 여유),
//      상세 12(판 종료 때 한 번에 저장). 전작 soullink/server의 방·티켓 구조를 따른다.
// 모드: friend(친구 비밀방) · practice(AI 대전 연습, 밴 없음) · ranked(유저 랭킹전) · ranked_ai(AI 랭킹전, 총괄 8장)
// AI 자리는 members[1].ai 로 표시하고, 사람과 같은 공개 정보로만 행동한다(상세 03).
import { DurableObject } from "cloudflare:workers";
import { autoAction, concede, createBattle, presetDeck, buildDeck, resolveTurn, submit, view } from "./engine/battle.mjs";
import { pinLive } from "./gamedata.mjs";
import { chooseAction, chooseBan, chooseLoadout, choosePick, remember } from "./engine/ai.mjs";
import { aiProfileForTier } from "./rank.mjs";
import { currentSeason, settleMatch } from "./ranking.mjs";
import { settleEconomy } from "./econ-db.mjs";
import { sha256Hex } from "./tokens.mjs";
import { rpc } from "./db.mjs";

export const PREP = Object.freeze({ ban_sec: 10, pick_sec: 15, loadout_sec: 15, grace_ms: 500 });
const LOBBY_TTL_MS = 30 * 60 * 1000;
const TICKET_TTL_MS = 45 * 1000;
const SAVE_RETRY_MS = 30 * 1000;
const SAVE_MAX_TRIES = 10;
const RANKED = ["ranked", "ranked_ai"];
// 감정표현(상세 05): 장착 4칸(없으면 기본 4종), 3초에 1회, 판당 10회, 상대 감정표현 끄기
const DEFAULT_EMOTES = ["EMOTE_HELLO", "EMOTE_NICE", "EMOTE_OOPS", "EMOTE_THINK"];
const EMOTE_GAP_MS = 3000;
const EMOTE_MAX = 10;

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export class FriendRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));  // 핑은 DO를 깨우지 않음
    this.ctx.blockConcurrencyWhile(async () => { this.room = (await this.ctx.storage.get("room")) ?? null; });
  }

  async save() {
    await this.ctx.storage.put("room", this.room);
    await this.schedule();
  }

  seatOf(acc) { return this.room?.members.findIndex((m) => m.acc === acc) ?? -1; }
  sockets(seat, except = null) {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState === 1 && ws.deserializeAttachment()?.seat === seat);
  }
  connected(seat, except = null) { return Boolean(this.room?.members[seat]?.ai) || this.sockets(seat, except).length > 0; }
  isAi(seat) { return Boolean(this.room?.members[seat]?.ai); }
  thinkMs() {  // AI 확정 시간 3~12초 무작위(상세 03). 테스트 환경은 AI_THINK_MS="최소,최대"로 줄인다
    const [lo, hi] = String(this.env.AI_THINK_MS ?? "3000,12000").split(",").map(Number);
    return lo + Math.floor(Math.random() * Math.max(1, hi - lo));
  }

  // ---------- HTTP (Worker → DO) ----------
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/ws") return await this.openSocket(request, url.searchParams.get("ticket") ?? "");
      const body = await request.json();
      const now = Date.now();
      if (url.pathname === "/create") {
        if (this.room) return json({ ok: false, error: "room_exists" }, 409);
        const turnSec = [20, 30].includes(Number(body.options?.turnSec)) ? Number(body.options.turnSec) : 20;
        this.room = {
          code: body.code, host: body.acc, createdAt: now, expiresAt: now + LOBBY_TTL_MS,
          options: { bans: body.options?.bans !== false, turnSec },
          members: [{ acc: body.acc, ready: false, defaults: sanitizeDefaults(body.defaults) }],
          phase: "lobby", game: null, last: null, saves: [], games: 0
        };
        await this.save();
        return json({ ok: true, code: this.room.code, seat: 0 });
      }
      if (url.pathname === "/create-match") {  // 큐(랭킹전) 또는 Worker(AI 연습)가 만든다
        if (this.room) return json({ ok: false, error: "room_exists" }, 409);
        const mode = ["ranked", "ranked_ai", "practice"].includes(body.mode) ? body.mode : "practice";
        const members = body.players.map((p) => ({ acc: p.acc, ready: true, tier: p.tier ?? 1, mmr: p.mmr ?? 800, since: p.since ?? now, defaults: sanitizeDefaults(p.defaults) }));
        if (mode !== "ranked") members.push({ acc: null, ready: true, ai: { difficulty: body.difficulty ?? null }, defaults: sanitizeDefaults({}) });
        this.room = {
          code: body.code, mode, host: members[0].acc, createdAt: now, expiresAt: now + LOBBY_TTL_MS, seasonId: body.seasonId ?? null,
          options: { bans: mode !== "practice", turnSec: 20 },
          members, phase: "lobby", game: null, last: null, saves: [], ranks: [], games: 0
        };
        await this.startPrep(now);
        await this.save();
        return json({ ok: true, code: this.room.code, mode });
      }
      if (!this.room) return json({ ok: false, error: "room_not_found" }, 404);
      if (url.pathname === "/join") {
        if ((this.room.mode ?? "friend") !== "friend") return json({ ok: false, error: "room_full" }, 409);
        let seat = this.seatOf(body.acc);
        if (seat < 0) {
          if (this.room.members.length >= 2) return json({ ok: false, error: "room_full" }, 409);
          this.room.members.push({ acc: body.acc, ready: false, defaults: sanitizeDefaults(body.defaults) });
          seat = 1;
          this.room.expiresAt = now + LOBBY_TTL_MS;
          await this.save();
          this.broadcast();
        }
        return json({ ok: true, code: this.room.code, seat });
      }
      if (url.pathname === "/ticket") {
        const seat = this.seatOf(body.acc);
        if (seat < 0) return json({ ok: false, error: "not_member" }, 403);
        const ticket = crypto.randomUUID() + crypto.randomUUID();
        const tickets = ((await this.ctx.storage.get("tickets")) ?? []).filter((t) => t.exp > now);
        tickets.push({ hash: await sha256Hex(ticket), acc: body.acc, sid: body.sid, exp: now + TICKET_TTL_MS });
        await this.ctx.storage.put("tickets", tickets);
        return json({ ok: true, ticket, expiresIn: TICKET_TTL_MS / 1000 });
      }
      return json({ ok: false, error: "not_found" }, 404);
    } catch (error) {
      return json({ ok: false, error: error.message }, 400);
    }
  }

  async openSocket(request, ticket) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ ok: false, error: "websocket_required" }, 426);
    const hash = await sha256Hex(ticket);
    const now = Date.now();
    const tickets = (await this.ctx.storage.get("tickets")) ?? [];
    const t = tickets.find((x) => x.hash === hash && x.exp > now);
    await this.ctx.storage.put("tickets", tickets.filter((x) => x.hash !== hash && x.exp > now));  // 일회용
    if (!t || !this.room) return json({ ok: false, error: "ticket_invalid" }, 401);
    const seat = this.seatOf(t.acc);
    if (seat < 0) return json({ ok: false, error: "not_member" }, 403);
    // 같은 계정의 기존 연결(다른 기기)은 끊는다: 새 기기에서 이어서 하기 = 재접속(상세 09)
    for (const old of this.sockets(seat)) try { old.close(4001, "replaced"); } catch { /* closing */ }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat, acc: t.acc, sid: t.sid });
    const g = this.room.game;
    if (g?.away?.[seat]) {
      g.away[seat] = null;
      g.log.push({ t: "reconnect", seat, at: now });
      await this.save();
    }
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------- 메시지 ----------
  async webSocketMessage(ws, raw) {
    const att = ws.deserializeAttachment();
    if (typeof raw !== "string" || raw.length > 4096) return send(ws, { type: "error", error: "message_invalid" });
    let msg;
    try { msg = JSON.parse(raw); } catch { return send(ws, { type: "error", error: "json_invalid" }); }
    try {
      if (msg.type === "emote" || msg.type === "mute_emotes") { await this.emote(att.seat, msg, Date.now()); await this.save(); return; }
      await this.handle(att.seat, msg, Date.now());
      await this.save();
      this.broadcast();
    } catch (error) {
      send(ws, { type: "error", error: error.message, about: msg.type });
    }
  }

  async webSocketClose(ws, code) {
    const att = ws.deserializeAttachment();
    try { ws.close(1000, "bye"); } catch { /* already closed */ }
    if (!this.room || att?.seat === undefined || this.connected(att.seat, ws)) return;
    const g = this.room.game;
    const now = Date.now();
    if (g && ["ban", "pick", "loadout"].includes(this.room.phase)) {
      g.log.push({ t: "prep_disconnect", seat: att.seat, at: now });  // 준비 단계: 스펠·덱 마감 때까지 안 돌아오면 닷지(랭킹전)·판 취소(친구방)
    } else if (g && this.room.phase === "battle") {
      g.away[att.seat] = now;  // 60초 유예 시작
      g.awayAbnormal = g.awayAbnormal ?? [false, false];
      g.awayAbnormal[att.seat] = code !== 1000;  // 정상 종료(1000)가 아니면 네트워크 끊김으로 봄(면책 대상)
      g.log.push({ t: "disconnect", seat: att.seat, at: now });
    }
    await this.save();
    this.broadcast();
  }

  // ---------- 감정표현(전체 상태 방송 없이 상대에게만 보냄) ----------
  async emote(seat, msg, now) {
    const g = this.room.game;
    if (!g || this.room.phase !== "battle") throw new Error("phase_invalid");
    g.emote ??= { sets: [null, null], used: [0, 0], last: [0, 0], muted: [false, false] };
    const e = g.emote;
    if (msg.type === "mute_emotes") {  // 이 판 내내 상대 감정표현 끔
      e.muted[seat] = true;
      for (const ws of this.sockets(seat)) send(ws, { type: "emote_muted" });
      return;
    }
    if (!e.sets[seat]) e.sets[seat] = await this.emoteSet(seat);
    const id = String(msg.id ?? "");
    if (!e.sets[seat].includes(id)) throw new Error("emote_not_equipped");
    if (e.used[seat] >= EMOTE_MAX) throw new Error("emote_limit");
    if (now - e.last[seat] < EMOTE_GAP_MS) throw new Error("emote_cooldown");
    e.used[seat] += 1; e.last[seat] = now;
    for (const ws of this.sockets(seat)) send(ws, { type: "emote", seat, id, left: EMOTE_MAX - e.used[seat] });
    if (!e.muted[1 - seat]) for (const ws of this.sockets(1 - seat)) send(ws, { type: "emote", seat, id });
  }

  async emoteSet(seat) {
    const acc = this.room.members[seat]?.acc;
    if (!acc || !this.env.SUPABASE_URL) return DEFAULT_EMOTES;
    try {
      const inv = await rpc(this.env, "inventory_list", { p_account: acc });
      const eq = inv?.equipped?.emotes;
      return Array.isArray(eq) && eq.length ? eq.slice(0, 4) : DEFAULT_EMOTES;
    } catch { return DEFAULT_EMOTES; }
  }

  // 친구 목록의 "게임 중" 표시(상세 05). 실패해도 판 진행과 무관
  presence(room) {
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_KEY) return;
    const accs = (this.room.members ?? []).filter((m) => m.acc && !m.ai).map((m) => m.acc);
    this.ctx.waitUntil(Promise.all(accs.map((acc) => rpc(this.env, "presence_touch", { p_account: acc, p_away: null, p_room: room, p_hidden: null }).catch(() => null))));
  }

  async handle(seat, msg, now) {
    const room = this.room;
    const g = room.game;
    switch (msg.type) {
      case "ready": {
        if (!["lobby", "result"].includes(room.phase)) throw new Error("phase_invalid");
        if (RANKED.includes(room.mode)) throw new Error("requeue_required");  // 랭킹전 재매칭은 매칭부터(총괄 3장)
        room.members[seat].ready = msg.ready !== false;
        if (msg.defaults) room.members[seat].defaults = sanitizeDefaults(msg.defaults);
        if (room.members.length === 2 && room.members.every((m) => m.ready)) await this.startPrep(now);
        return;
      }
      case "options": {
        if (seat !== 0 || room.phase !== "lobby" || (room.mode ?? "friend") !== "friend") throw new Error("host_only");
        if (typeof msg.bans === "boolean") room.options.bans = msg.bans;
        if ([20, 30].includes(Number(msg.turnSec))) room.options.turnSec = Number(msg.turnSec);
        room.members.forEach((m) => { m.ready = false; });
        return;
      }
      case "ban": {
        if (room.phase !== "ban") throw new Error("phase_invalid");
        const id = msg.characterId ? String(msg.characterId) : null;
        if (id && !g.data.characters[id]) throw new Error("character_unavailable");
        g.bans[seat] = { id, done: true };
        if (g.bans.every((b) => b?.done)) this.toPick(now);
        return;
      }
      case "pick": {
        if (room.phase !== "pick") throw new Error("phase_invalid");
        const id = String(msg.characterId ?? "");
        if (!this.pickable(g).includes(id)) throw new Error("character_unavailable");
        g.picks[seat] = id;
        if (g.picks.every(Boolean)) this.toLoadout(now);
        return;
      }
      case "loadout": {
        if (room.phase !== "loadout") throw new Error("phase_invalid");
        g.loadouts[seat] = this.validLoadout(g, g.picks[seat], msg);
        if (g.loadouts.every(Boolean)) this.startBattle(now);
        return;
      }
      case "act": {
        if (room.phase !== "battle") throw new Error("phase_invalid");
        if (g.battle.turn !== Number(msg.turn ?? g.battle.turn)) throw new Error("turn_mismatch");
        const both = submit(g.battle, seat, { cards: msg.cards ?? [], spell: msg.spell ?? null, active: Boolean(msg.active) });
        if (both) await this.resolve(now);
        return;
      }
      case "timebank": {
        if (room.phase !== "battle") throw new Error("phase_invalid");
        if (g.timebank[seat] || g.battle.players[seat].submitted) throw new Error("timebank_used");
        g.timebank[seat] = g.battle.turn;
        g.deadline[seat] += g.battle.rules.timebank_sec * 1000;  // 판당 1회 추가 시간
        return;
      }
      case "surrender": {
        if (room.phase !== "battle") throw new Error("phase_invalid");
        concede(g.battle, seat, "surrender");
        await this.finishGame(now);
        return;
      }
      case "leave": {
        if (room.phase === "battle") throw new Error("leave_in_battle");  // 전투 중엔 항복으로
        if ((room.mode ?? "friend") !== "friend") {
          if (["ban", "pick", "loadout"].includes(room.phase)) await this.dodge([seat], now);
          for (const ws of this.sockets(seat)) try { ws.close(1000, "left"); } catch { /* */ }
          return;
        }
        if (room.phase !== "lobby" && room.phase !== "result") this.cancelPrep(`left_${seat}`);
        room.members.splice(seat, 1);
        for (const ws of this.sockets(seat)) try { ws.close(1000, "left"); } catch { /* */ }
        for (const ws of this.ctx.getWebSockets()) {  // 남은 사람은 0번 자리로
          const a = ws.deserializeAttachment();
          if (a && a.seat > seat) ws.serializeAttachment({ ...a, seat: a.seat - 1 });
        }
        if (seat === 0 && room.members.length) room.host = room.members[0].acc;
        room.members.forEach((m) => { m.ready = false; });
        room.phase = "lobby";
        return;
      }
      default:
        throw new Error("message_type_invalid");
    }
  }

  // ---------- 준비 단계 (총괄 7장) ----------
  async startPrep(now) {
    const room = this.room;
    const pinned = await pinLive(this.env);  // 이 판의 데이터 버전 고정(상세 14)
    if (RANKED.includes(room.mode) && !room.seasonId) room.seasonId = (await currentSeason(this.env)).id;  // 시작 시각 기준 시즌
    room.members.forEach((m) => {
      m.ready = Boolean(m.ai);
      if (m.ai && room.mode === "ranked_ai") Object.assign(m.ai, aiProfileForTier(pinned.snapshot, room.members[0].tier ?? 1));
      if (m.ai && !m.ai.difficulty) m.ai.difficulty = "normal";
    });
    room.game = {
      id: crypto.randomUUID(), startedAt: now, dataVersion: pinned.version, data: pinned.snapshot,
      bans: [null, null], picks: [null, null], loadouts: [null, null],
      battle: null, deadline: [0, 0], timebank: [0, 0], away: [null, null], warned: [0, 0], log: []
    };
    room.expiresAt = now + LOBBY_TTL_MS;
    if (room.options.bans) {
      room.phase = "ban";
      room.phaseDeadline = now + this.prepSec("ban_sec") * 1000 + PREP.grace_ms;
    } else this.toPick(now);
    this.aiPrep(now);
  }

  // AI 자리의 밴·픽·스펠·덱(상세 03 밴픽 AI). 사람의 공개 정보(직전 픽)만 참고
  aiPrep(now) {
    const room = this.room;
    const g = room.game;
    const seat = room.members.findIndex((m) => m.ai);
    if (seat < 0 || !g) return;
    const human = room.members[1 - seat];
    const fav = human.lastPick ?? human.defaults.preferred[0] ?? null;
    if (room.phase === "ban" && !g.bans[seat]) {
      g.bans[seat] = { id: chooseBan(g.data, { playerFavorite: fav }), done: true };
      if (g.bans.every((b) => b?.done)) this.toPick(now);
    }
    if (room.phase === "pick" && !g.picks[seat]) {
      g.picks[seat] = choosePick(g.data, this.pickable(g), { playerFaction: fav ? g.data.characters[fav]?.faction : null });
      if (g.picks.every(Boolean)) this.toLoadout(now);
    }
    if (room.phase === "loadout" && !g.loadouts[seat]) {
      g.loadouts[seat] = this.validLoadout(g, g.picks[seat], chooseLoadout(g.data, g.picks[seat], g.picks[1 - seat]));
      if (g.loadouts.every(Boolean)) this.startBattle(now);
    }
  }

  // 준비 단계 시간: 데이터의 설정값(시트 `설정값` ban_sec·pick_sec·loadout_sec)이 있으면 그 값, 없으면 총괄 7장 기본값
  prepSec(key) {
    const v = Number(this.room.game?.data?.settings?.[key]);
    return Number.isFinite(v) && v > 0 ? v : PREP[key];
  }

  banned(g) { return [...new Set(g.bans.map((b) => b?.id).filter(Boolean))]; }  // 같은 캐릭터를 둘이 밴하면 1명만
  pickable(g) { return Object.keys(g.data.characters).filter((id) => !this.banned(g).includes(id)); }

  toPick(now) {
    const g = this.room.game;
    g.bans = g.bans.map((b) => b ?? { id: null, done: true });  // 밴 시간 초과: 밴 없음
    this.room.phase = "pick";
    this.room.phaseDeadline = now + this.prepSec("pick_sec") * 1000 + PREP.grace_ms;
    this.aiPrep(now);
  }

  toLoadout(now) {
    const g = this.room.game;
    const pool = this.pickable(g);
    g.picks = g.picks.map((p, seat) => {  // 픽 시간 초과: 선호 1·2·3순위 → 직전 사용 캐릭터 → 목록 첫 번째 (총괄 7장, 기획답변 2차 8)
      if (p) return p;
      const m = this.room.members[seat];
      const pref = m.defaults.preferred.find((id) => pool.includes(id));
      if (pref) return pref;
      if (m.lastPick && pool.includes(m.lastPick)) return m.lastPick;
      return pool[0];
    });
    this.room.phase = "loadout";
    this.room.phaseDeadline = now + this.prepSec("loadout_sec") * 1000 + PREP.grace_ms;
    this.aiPrep(now);
  }

  validLoadout(g, charId, msg) {
    const spells = Array.isArray(msg.spells) ? msg.spells.map(String) : [];
    if (spells.length !== 2 || spells[0] === spells[1] || !spells.every((s) => g.data.spells[s])) throw new Error("spells_invalid");
    const deck = Array.isArray(msg.commonCards) ? buildDeck(g.data, charId, msg.commonCards.map(String)) : presetDeck(g.data, charId, msg.preset ?? 2);
    return { spells, deck, preset: Array.isArray(msg.commonCards) ? null : Number(msg.preset ?? 2) };
  }

  startBattle(now) {
    const room = this.room;
    const g = room.game;
    g.pendingDodge = null;
    const absent = [0, 1].filter((s) => !this.connected(s));
    if (absent.length && room.mode !== "practice" && !g.allowAbsent) {  // 스펠·덱 마감까지 접속 없음 → 닷지/판 취소
      g.pendingDodge = absent;
      return;
    }
    g.loadouts = g.loadouts.map((l, seat) => {  // 스펠·덱 시간 초과: 그 캐릭터로 직전에 쓴 것 → 클라이언트 기본값 → 수호·거울 + 균형 덱 (기획답변 2차 8)
      if (l) return l;
      const m = room.members[seat];
      const tries = [m.lastLoadout?.[g.picks[seat]], { spells: m.defaults.spells, preset: m.defaults.preset }, { spells: ["SP01", "SP02"], preset: 2 }];
      for (const t of tries) {
        if (!t) continue;
        try { return this.validLoadout(g, g.picks[seat], t); } catch { /* 다음 후보 */ }
      }
      throw new Error("loadout_fallback_failed");
    });
    room.members.forEach((m, seat) => {  // 직전 사용 기록(이 방 안에서 유지)
      m.lastPick = g.picks[seat];
      m.lastLoadout = { ...(m.lastLoadout ?? {}), [g.picks[seat]]: { spells: g.loadouts[seat].spells, preset: g.loadouts[seat].preset ?? 2 } };
    });
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    g.battle = createBattle({
      seed, data: g.data, rules: { turn_select_sec: room.options.turnSec },
      players: g.picks.map((characterId, seat) => ({ characterId, spells: g.loadouts[seat].spells, deck: g.loadouts[seat].deck }))
    });
    g.battleStartedAt = now;
    this.presence(room.code);
    room.phase = "battle";
    room.phaseDeadline = 0;
    g.aiMemory = { oppKinds: [] };
    this.openTurn(now);
  }

  openTurn(now) {
    const g = this.room.game;
    const ms = g.battle.rules.turn_select_sec * 1000 + PREP.grace_ms;
    g.deadline = [now + ms, now + ms];
    const ai = this.room.members.findIndex((m) => m.ai);
    g.aiAt = ai >= 0 ? now + Math.min(this.thinkMs(), ms - 1000) : 0;
    for (const seat of [0, 1]) {  // AFK 2턴째 경고(총괄 10장)
      if (g.battle.players[seat].idle === g.battle.rules.afk_turns_leave - 1 && g.warned[seat] !== g.battle.turn) {
        g.warned[seat] = g.battle.turn;
        for (const ws of this.sockets(seat)) send(ws, { type: "afk_warning", turn: g.battle.turn });
      }
    }
  }

  resolve(now) {
    const g = this.room.game;
    resolveTurn(g.battle);
    g.log.push({ t: "turn", turn: g.battle.log[0]?.turn, at: now });
    g.stats ??= [{ exclusive: 0, spells: 0 }, { exclusive: 0, spells: 0 }];  // 미션용: 전용 카드·스펠 사용(상세 05)
    for (const e of g.battle.log) {
      if (e.t === "card" && g.data.cards?.[e.id]?.owner_character) g.stats[e.seat].exclusive += 1;
      if (e.t === "spell" && !e.void) g.stats[e.seat].spells += 1;
    }
    const ai = this.room.members.findIndex((m) => m.ai);
    if (ai >= 0) remember(g.battle, ai, g.aiMemory);
    if (g.battle.result) return this.finishGame(now);
    this.openTurn(now);
    return null;
  }

  cancelPrep(reason) {
    const room = this.room;
    room.game = null;
    room.phase = "lobby";
    room.phaseDeadline = 0;
    room.members.forEach((m) => { m.ready = false; });
    room.notice = reason;
  }

  // 닷지(밴픽 중 이탈, 총괄 10장): 랭킹전은 −5RP + 5분 매칭 제한, 상대는 대기열 맨 앞으로. 친구방은 판 취소·대기실
  async dodge(seats, now) {
    const room = this.room;
    if ((room.mode ?? "friend") === "friend") { this.cancelPrep(`left_${seats[0]}`); return; }
    const g = room.game;
    if (RANKED.includes(room.mode)) {
      const humans = seats.filter((s) => !this.isAi(s));
      room.ranks.push({ tries: 0, next: now, job: { matchId: g.id, seasonId: room.seasonId, mode: room.mode, dataVersion: g.dataVersion, players: humans.map((s) => ({ seat: s, acc: room.members[s].acc, result: "dodge" })) } });
      if (room.mode === "ranked") {
        for (const s of [0, 1].filter((x) => !seats.includes(x))) {
          try {
            await this.env.QUEUE.get(this.env.QUEUE.idFromName("global")).fetch("https://queue/priority", { method: "POST", body: JSON.stringify({ acc: room.members[s].acc, since: room.members[s].since }) });
          } catch { /* 우선권 실패해도 진행 */ }
        }
      }
    }
    room.game = null;
    room.phase = "closed";
    room.phaseDeadline = 0;
    room.notice = `dodge_${seats.join("_")}`;
    room.expiresAt = now + 5 * 60000;
    await this.flushSaves(now);
  }

  async finishGame(now, voidReason = null) {
    const room = this.room;
    const g = room.game;
    const b = g.battle;
    const outcome = voidReason ? "void" : b.result.outcome;
    const reason = voidReason ?? b.result.reason;
    const mode = room.mode ?? "friend";
    room.games += 1;
    room.last = { id: g.id, outcome, reason, turn: b.turn, picks: g.picks, hp: b.players.map((p) => [p.hp, p.maxHp]) };
    room.saves.push({
      tries: 0, next: now,
      row: {
        id: g.id, mode, room_code: room.code, data_version: g.dataVersion,
        player_a: room.members[0]?.acc ?? null, player_b: room.members[1]?.acc ?? null,
        outcome, finish_reason: reason, turns: b.turn,
        started_at: new Date(g.startedAt).toISOString(), ended_at: new Date(now).toISOString(),
        summary: {
          bans: g.bans.map((x) => x?.id ?? null), picks: g.picks,
          spells: g.loadouts.map((l) => l.spells), presets: g.loadouts.map((l) => l.preset),
          hp: b.players.map((p) => p.hp), dealt: b.players.map((p) => p.dealt),
          battle_sec: Math.round((now - (g.battleStartedAt ?? now)) / 1000), options: room.options,
          ai: room.members.find((m) => m.ai)?.ai ?? null
        }
      }
    });
    if (RANKED.includes(mode) && outcome !== "void") {  // 랭크 반영(총괄 9·10장): 이탈·AFK는 패배 + 이탈 감점
      const loserLeft = ["leave", "afk"].includes(reason);
      const players = [0, 1].filter((s) => !this.isAi(s)).map((s) => {
        const mine = s === 0 ? "a" : "b";
        const left = reason === "leave" && g.dropped?.includes(s) ? "drop" : "leave";  // 비정상 끊김은 면책 판정 대상(기획답변 3차 A3)
        let result = outcome === "draw" ? (loserLeft ? left : "draw") : outcome === mine ? "win" : loserLeft ? left : "loss";
        return { seat: s, acc: room.members[s].acc, result };
      });
      room.ranks.push({ tries: 0, next: now, job: { matchId: g.id, seasonId: room.seasonId, mode, dataVersion: g.dataVersion, players } });
    }
    if (outcome !== "void") {  // 골드·미션(상세 05·06): 친구방은 소셜 미션만, AI 대전은 하루 3판까지(econ에서 판단)
      const players = [0, 1].filter((s) => !this.isAi(s) && room.members[s]?.acc).map((s) => {
        const mine = s === 0 ? "a" : "b";
        return { seat: s, acc: room.members[s].acc, character: g.picks[s], stats: g.stats?.[s] ?? { exclusive: 0, spells: 0 },
          result: outcome === "draw" ? "draw" : outcome === mine ? "win" : "loss" };
      });
      if (players.length) { room.econs ??= []; room.econs.push({ tries: 0, next: now, job: { matchId: g.id, mode, players } }); }
    }
    this.presence("");
    room.lastBattle = view(b, 0);  // 결과 화면용 마지막 로그(0번 시점; 공개 정보만 쓴다)
    room.lastData = g.data;
    room.game = null;
    room.phase = "result";
    room.phaseDeadline = 0;
    room.expiresAt = now + LOBBY_TTL_MS;
    room.members.forEach((m) => { m.ready = Boolean(m.ai); });
    await this.flushSaves(now);
  }

  // 판 결과 저장: 판 ID가 키라 재시도해도 중복 없음. 실패하면 30초 뒤 다시(최대 10회)
  async flushSaves(now) {
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_KEY) return;
    const keep = [];
    for (const s of this.room.saves) {
      if (s.next > now) { keep.push(s); continue; }
      let ok = false;
      try {
        const key = this.env.SUPABASE_SERVICE_KEY;
        const headers = { apikey: key, "content-type": "application/json", prefer: "return=minimal,resolution=ignore-duplicates" };
        if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`;
        const res = await fetch(`${String(this.env.SUPABASE_URL).replace(/\/$/, "")}/rest/v1/match_results`, { method: "POST", headers, body: JSON.stringify(s.row) });
        ok = res.ok || res.status === 409;
      } catch { ok = false; }
      if (!ok && s.tries + 1 < SAVE_MAX_TRIES) keep.push({ ...s, tries: s.tries + 1, next: now + SAVE_RETRY_MS });
    }
    this.room.saves = keep;
    const keepRanks = [];
    for (const r of this.room.ranks ?? []) {
      if (r.next > now) { keepRanks.push(r); continue; }
      try {
        const data = this.room.game?.data ?? this.room.lastData ?? (await pinLive(this.env)).snapshot;
        const res = await settleMatch(this.env, data, r.job);
        this.room.last = { ...(this.room.last ?? {}), rank: Object.fromEntries(r.job.players.map((p, i) => [p.seat, { result: p.result, ...res[i] }])) };
      } catch {
        if (r.tries + 1 < SAVE_MAX_TRIES) keepRanks.push({ ...r, tries: r.tries + 1, next: now + SAVE_RETRY_MS });
      }
    }
    this.room.ranks = keepRanks;
    const keepEcon = [];
    for (const r of this.room.econs ?? []) {
      if (r.next > now) { keepEcon.push(r); continue; }
      try {
        const data = this.room.game?.data ?? this.room.lastData ?? (await pinLive(this.env)).snapshot;
        const res = await settleEconomy(this.env, data, r.job);
        if (this.room.last?.id === r.job.matchId) this.room.last.econ = Object.fromEntries(r.job.players.map((p, i) => [p.seat, { gold: res[i].gold, parts: res[i].parts }]));
      } catch {
        if (r.tries + 1 < SAVE_MAX_TRIES) keepEcon.push({ ...r, tries: r.tries + 1, next: now + SAVE_RETRY_MS });
      }
    }
    this.room.econs = keepEcon;
  }

  // ---------- 알람: 단계 마감·턴 마감·재접속 유예·저장 재시도·방 만료 ----------
  async schedule() {
    const r = this.room;
    if (!r) return;
    const times = [r.expiresAt, r.phaseDeadline || Infinity, ...r.saves.map((s) => s.next), ...(r.ranks ?? []).map((x) => x.next), ...(r.econs ?? []).map((x) => x.next)];
    const g = r.game;
    if (g && r.phase === "battle") {
      times.push(...g.deadline);
      if (g.aiAt && !g.battle.players[r.members.findIndex((m) => m.ai)]?.submitted) times.push(g.aiAt);
      const grace = g.battle.rules.reconnect_grace_sec * 1000;
      for (const t of g.away) if (t) times.push(t + grace);
    }
    const next = Math.min(...times.filter(Number.isFinite));
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(Math.max(next, Date.now() + 50));
  }

  async alarm() {
    const r = this.room;
    if (!r) return;
    const now = Date.now();
    const g = r.game;
    if (r.phaseDeadline && now >= r.phaseDeadline) {
      if (r.phase === "ban") this.toPick(now);
      else if (r.phase === "pick") this.toLoadout(now);
      else if (r.phase === "loadout") this.startBattle(now);
    } else if (g && r.phase === "battle") {
      const grace = g.battle.rules.reconnect_grace_sec * 1000;
      const gone = [0, 1].filter((s) => g.away[s] && now >= g.away[s] + grace);
      if (gone.length) {
        if (RANKED.includes(r.mode)) {  // 랭킹전: 60초 안에 못 돌아오면 이탈 패배(총괄 10장)
          g.dropped = gone.filter((s) => g.awayAbnormal?.[s]);
          if (gone.length === 1) concede(g.battle, gone[0], "leave");
          else g.battle.result = { outcome: "draw", reason: "leave", turn: g.battle.turn };
          await this.finishGame(now);
        } else await this.finishGame(now, "leave");  // 친구방·연습: 결과 없음, 방 유지(총괄 12장)
      } else {
        const ai = r.members.findIndex((m) => m.ai);
        if (ai >= 0 && !g.battle.players[ai].submitted && now >= g.aiAt) {
          const { action } = chooseAction(g.battle, ai, { difficulty: r.members[ai].ai.difficulty, subopt: r.members[ai].ai.subopt, memory: g.aiMemory });
          submit(g.battle, ai, action);
        }
        for (const seat of [0, 1]) {
          if (!g.battle.players[seat].submitted && now >= g.deadline[seat]) {
            const disc = Boolean(g.away[seat]) || !this.connected(seat);
            submit(g.battle, seat, autoAction(g.battle, seat, { disconnected: disc }), { auto: disc ? "disconnect" : true });
          }
        }
        if (r.game?.battle && g.battle.players.every((p) => p.submitted)) await this.resolve(now);
      }
    }
    if (r.game?.pendingDodge) await this.dodge(r.game.pendingDodge, now);
    if (r.saves.length) await this.flushSaves(now);
    if (now >= r.expiresAt && !["ban", "pick", "loadout", "battle"].includes(r.phase) && !r.saves.length && !(r.ranks ?? []).length) {
      for (const ws of this.ctx.getWebSockets()) try { ws.close(1000, "room_expired"); } catch { /* */ }
      this.room = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.save();
    this.broadcast();
  }

  // ---------- 상태 전송: 자리별 시야 ----------
  roomView(seat) {
    const r = this.room;
    const g = r.game;
    const base = {
      type: "room", code: r.code, mode: r.mode ?? "friend", phase: r.phase, you: seat, options: r.options, now: Date.now(),
      members: r.members.map((m, s) => ({ seat: s, host: s === 0, ready: m.ready, connected: this.connected(s), away: Boolean(g?.away?.[s]), ai: m.ai ? { difficulty: m.ai.difficulty } : null })),
      phaseDeadline: r.phaseDeadline || null, last: r.last, notice: r.notice ?? null
    };
    if (r.phase === "result" && r.lastBattle) base.lastLog = r.lastBattle.log;
    if (!g) return base;
    base.dataVersion = g.dataVersion;
    base.prep = {
      characters: Object.keys(g.data.characters),
      banned: r.phase === "ban" ? [] : this.banned(g),
      myBan: g.bans[seat]?.id ?? null, oppBanDone: Boolean(g.bans[1 - seat]?.done),
      myPick: g.picks[seat], oppPickDone: Boolean(g.picks[1 - seat]),
      oppPick: ["loadout", "battle"].includes(r.phase) ? g.picks[1 - seat] : null,  // 픽은 동시·비공개, 스펠·덱 단계에서 공개
      myLoadout: g.loadouts[seat] ? { spells: g.loadouts[seat].spells, preset: g.loadouts[seat].preset } : null,
      oppLoadoutDone: Boolean(g.loadouts[1 - seat])
    };
    if (g.battle) {
      base.battle = view(g.battle, seat);
      base.deadline = g.deadline[seat];
      base.oppDeadline = g.deadline[1 - seat];
      base.timebankUsed = Boolean(g.timebank[seat]);
      base.emotes = { left: EMOTE_MAX - (g.emote?.used?.[seat] ?? 0), mutedOpp: Boolean(g.emote?.muted?.[seat]), set: g.emote?.sets?.[seat] ?? null };
    }
    return base;
  }

  broadcast() {
    if (!this.room) return;
    for (const ws of this.ctx.getWebSockets().filter((w) => w.readyState === 1)) {
      const a = ws.deserializeAttachment();
      if (a) send(ws, this.roomView(a.seat));
    }
  }
}

function send(ws, value) {
  try { ws.send(JSON.stringify(value)); } catch { /* closing */ }
}

function sanitizeDefaults(d = {}) {
  const ids = (list, max) => (Array.isArray(list) ? list.map(String).filter((x) => /^[A-Z0-9]{2,8}$/.test(x)).slice(0, max) : []);
  return { preferred: ids(d.preferred, 3), spells: ids(d.spells, 2), preset: [1, 2, 3].includes(Number(d.preset)) ? Number(d.preset) : 2 };
}
