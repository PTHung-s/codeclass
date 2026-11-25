// @ts-nocheck -- legacy game-message branches remain inert while shared arena/chat sockets are retained.
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import prisma from "../utils/prisma";
import { wsAuthenticate } from "../middleware/wsAuth";
import { JwtPayload } from "../utils/jwt";
import { setActiveWsCount } from "../utils/metrics";
import { publishCentrifugo, realtimeChannel } from "./centrifugo";
import { chatReact, chatSend, getChatHistory, initChat } from "./chatService";
import {
  startInteractiveSession,
  stopInteractiveSession,
  stopUserSessions,
  writeInteractiveInput,
} from "../utils/interactiveRunner";
import {
  addParticipant,
  endRecording,
  getActiveRecording,
  isParticipant,
  isRecording,
  recordEvent,
  reconcileOrphanedRecordings,
  startRecording,
  type RecordingEventType,
} from "./recordingService";

interface WSMessage {
  type: string;
  payload: any;
}

// ── Client tracking ──
interface ConnectedClient {
  sockets: Set<WebSocket>;
  matchIds: Set<string>;
  arenaIds: Set<string>;
  role?: string;
}
const clients = new Map<string, ConnectedClient>();
const matchRooms = new Map<string, Set<string>>();
const matchTimers = new Map<string, ReturnType<typeof setInterval>>();
const STAFF_ROLES = new Set(["teacher", "admin", "teaching_assistant"]);
const PANEL_BROADCAST_INTERVAL_MS = 1_000;
const panelLastBroadcastAt = new Map<string, number>();
const arenaPanelAuthorizations = new Set<string>();
// Track player teams (userId:matchId -> team)
const playerTeams = new Map<string, string>();

// ── Arena (Code Debug Arena) rooms ──
const arenaRooms = new Map<string, Set<string>>();

// ── Code Duel (speed-coding) rooms ──
const codeDuelRooms = new Map<string, Set<string>>();
// Ephemeral lobby-ready state. It is reset when a teacher opens a new lobby.
const codeDuelReadyUsers = new Map<string, Set<string>>();
// Anti-cheat lock expiry (epoch ms) per "matchId:userId". Written on tab_back,
// re-sent on join so a student can't F5 to clear the countdown mid-round.
const codeDuelTabLocks = new Map<string, number>();

// Latest live code buffers sent via code_duel_panel (matchId:userId -> {code, language, updatedAt})
const codeDuelLiveBuffers = new Map<string, { code: string; language: string; updatedAt: number }>();

export function getCodeDuelLiveBuffer(matchId: string, userId: string): { code: string; language: string } | null {
  const buf = codeDuelLiveBuffers.get(`${matchId}:${userId}`);
  return buf ? { code: buf.code, language: buf.language } : null;
}

export function clearCodeDuelReadyUsers(matchId: string) {
  codeDuelReadyUsers.delete(matchId);
}

/** Reset every in-memory anti-cheat overlay for a match. Used when the teacher
 * starts a fresh replay, so an old 5-minute lock cannot leak into it. */
export function clearCodeDuelTabLocks(matchId: string) {
  const prefix = `${matchId}:`;
  for (const key of codeDuelTabLocks.keys()) {
    if (key.startsWith(prefix)) codeDuelTabLocks.delete(key);
  }
}

// ── Peer Chat state lives in services/chatService.ts (buffers, rate limit, handlers) ──
const userProfiles = new Map<string, { fullName: string; realName: string; nickname: string | null; role: string; avatarUrl: string | null }>();

/** Clear the cached public name immediately when a user updates their profile. */
export function invalidateUserProfile(userId: string) {
  userProfiles.delete(userId);
}

function updateActiveWsMetric() {
  let total = 0;
  for (const client of clients.values()) total += client.sockets.size;
  setActiveWsCount(total);
}

function roomMemberKey(roomId: string, userId: string) {
  return `${roomId}:${userId}`;
}

function removeRoomMember(rooms: Map<string, Set<string>>, roomId: string, userId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.delete(userId);
  if (room.size === 0) rooms.delete(roomId);
}

function canBroadcastPanel(roomId: string, userId: string) {
  const key = roomMemberKey(roomId, userId);
  const now = Date.now();
  const previous = panelLastBroadcastAt.get(key) ?? 0;
  if (now - previous < PANEL_BROADCAST_INTERVAL_MS) return false;
  panelLastBroadcastAt.set(key, now);
  return true;
}

async function resolveUserProfile(userId: string): Promise<{ fullName: string; realName: string; nickname: string | null; role: string; avatarUrl: string | null }> {
  const cached = userProfiles.get(userId);
  if (cached) return cached;
  let info: { fullName: string; realName: string; nickname: string | null; role: string; avatarUrl: string | null };
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, nickname: true, role: true, avatarUrl: true },
    });
    const realName = u?.fullName || "Người dùng";
    info = { fullName: u?.role === "student" ? u.nickname?.trim() || realName : realName, realName, nickname: u?.nickname ?? null, role: u?.role || "student", avatarUrl: u?.avatarUrl ?? null };
  } catch {
    info = { fullName: "Người dùng", realName: "Người dùng", nickname: null, role: "student", avatarUrl: null };
  }
  userProfiles.set(userId, info);
  return info;
}

function registerClient(userId: string, ws: WebSocket, role?: string): ConnectedClient {
  let client = clients.get(userId);
  if (!client) {
    client = { sockets: new Set(), matchIds: new Set(), arenaIds: new Set(), role };
    clients.set(userId, client);
  }
  // Centrifugo RPC uses a virtual reply socket. It participates in room state
  // but must never be retained as a legacy `/ws` connection (otherwise room
  // publications would be delivered twice through the personal channel).
  if (!(ws as any).__centrifugoVirtual) client.sockets.add(ws);
  if (role) client.role = role;
  updateActiveWsMetric();
  return client;
}

export async function canAccessArena(user: JwtPayload, arenaId: string): Promise<boolean> {
  const arena = await prisma.debugArenaMatch.findUnique({
    where: { id: arenaId },
    select: {
      status: true,
      mode: true,
      createdById: true,
      players: { where: { userId: user.userId }, select: { userId: true } },
      kicks: { where: { userId: user.userId }, select: { userId: true } },
    },
  });
  if (!arena || arena.status === "hidden" || arena.kicks.length) return false;
  const staff = ["teacher", "admin", "teaching_assistant"].includes(user.role);
  return staff || arena.createdById === user.userId || arena.players.length > 0 || arena.status !== "lobby" || arena.mode === "versus";
}

function ensureArenaMembership(userId: string, ws: WebSocket, arenaId: string) {
  const client = registerClient(userId, ws);
  client.arenaIds.add(arenaId);
  if (!arenaRooms.has(arenaId)) arenaRooms.set(arenaId, new Set());
  arenaRooms.get(arenaId)!.add(userId);
}

// ── Code Duel access / membership ──
export async function canAccessCodeDuel(user: JwtPayload, matchId: string): Promise<boolean> {
  const match = await prisma.codeDuelMatch.findUnique({
    where: { id: matchId },
    select: {
      status: true,
      createdById: true,
      players: { where: { userId: user.userId }, select: { userId: true, kicked: true } },
    },
  });
  if (!match || match.status === "hidden") return false;
  const staff = ["teacher", "admin", "teaching_assistant"].includes(user.role);
  // A kicked student is denied access (can't rejoin or lurk in the room).
  if (match.players.length > 0 && match.players[0].kicked && !staff) return false;
  return staff || match.createdById === user.userId || match.players.length > 0 || match.status !== "draft";
}

function ensureCodeDuelMembership(userId: string, ws: WebSocket, matchId: string) {
  const client = registerClient(userId, ws);
  client.matchIds.add(matchId);
  if (!codeDuelRooms.has(matchId)) codeDuelRooms.set(matchId, new Set());
  codeDuelRooms.get(matchId)!.add(userId);
}

function broadcastCodeDuelPresence(matchId: string, userId: string, online: boolean) {
  broadcastToCodeDuelStaff(matchId, { type: "code_duel_presence", payload: { matchId, userId, online } });
}

/** Remove a kicked student from the live room immediately. The socket itself
 * stays available for the rest of the app; an unlock can join this room again. */
export function evictCodeDuelMember(matchId: string, userId: string) {
  removeRoomMember(codeDuelRooms, matchId, userId);
  codeDuelReadyUsers.get(matchId)?.delete(userId);
  codeDuelLiveBuffers.delete(`${matchId}:${userId}`);
  const client = clients.get(userId);
  if (client) client.matchIds.delete(matchId);
  broadcastCodeDuelPresence(matchId, userId, false);
}

// ── Presence (teacher live-monitoring) ──
interface PresenceInfo {
  userId: string;
  fullName: string;
  nickname: string | null;
  role: string;
  avatarUrl: string | null;
  status: "online" | "idle" | "away" | "offline";
  activityType: string;
  activityLabel: string;
  lastActiveAt: number;
}
const presence = new Map<string, PresenceInfo>();
const PRESENCE_TTL_MS = 90_000;
let presenceDirty = false;
let presenceFlushTimer: ReturnType<typeof setInterval> | null = null;

function markPresenceDirty() {
  presenceDirty = true;
  schedulePresenceFlush();
}

function computeStatus(hidden: boolean, idle: boolean): PresenceInfo["status"] {
  if (hidden) return "away";
  if (idle) return "idle";
  return "online";
}

/** Snapshot of currently-connected students, for the teacher monitor. */
function presenceSnapshot(): PresenceInfo[] {
  const out: PresenceInfo[] = [];
  const staleBefore = Date.now() - PRESENCE_TTL_MS;
  for (const p of presence.values()) {
    if (p.lastActiveAt < staleBefore) {
      presence.delete(p.userId);
      continue;
    }
    if (p.role === "student") out.push(p);
  }
  return out.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

let presenceFlushPending = false;

/**
 * Student user ids with a live socket, for features that must only fire when a
 * particular student is actually present (weekly honour cards).
 *
 * Reads `clients`, not `presence`: the presence map is only populated once a
 * client sends a `presence_update` message, so a student who just connected and
 * has not reported yet would look offline. Having an open socket is the honest
 * definition of present.
 *
 * A student who switched tabs still counts — they are in the room and will see
 * the card when they come back. Only a closed socket means absent.
 */
export function onlineStudentIds(): Set<string> {
  const ids = new Set<string>();
  for (const [userId, client] of clients) {
    if (client.sockets.size === 0) continue;
    // `role` is set at registration; presence is consulted only as a fallback
    // for a client that connected before roles were tracked.
    const role = client.role ?? presence.get(userId)?.role;
    if (role === "student") ids.add(userId);
  }
  // Centrifugo connections do not use the legacy socket registry. A recent
  // authenticated presence heartbeat is the equivalent liveness signal.
  const staleBefore = Date.now() - PRESENCE_TTL_MS;
  for (const p of presence.values()) {
    if (p.lastActiveAt >= staleBefore && p.role === "student") ids.add(p.userId);
  }
  return ids;
}

export function isUserOnline(userId: string): boolean {
  const client = clients.get(userId);
  if (client && client.sockets.size > 0) return true;
  const entry = presence.get(userId);
  return Boolean(entry && entry.lastActiveAt >= Date.now() - PRESENCE_TTL_MS);
}

function broadcastPresenceToStaff() {
  // Expire clients whose Centrifugo connection disappeared without a final
  // browser command; Centrifugo intentionally has no disconnect web-hook.
  const staleBefore = Date.now() - PRESENCE_TTL_MS;
  let expired = false;
  for (const [userId, entry] of presence) {
    if (entry.lastActiveAt < staleBefore) { presence.delete(userId); expired = true; }
  }
  if (expired) presenceDirty = true;
  if (!presenceDirty) return;
  presenceDirty = false;
  presenceFlushPending = false;
  const payload = { students: presenceSnapshot() };
  broadcastToStaff({ type: "presence_list", payload });
}

/** Debounced flush: fires immediately on the first change, then at most every 500ms */
function schedulePresenceFlush() {
  if (presenceFlushPending) return; // already scheduled
  presenceFlushPending = true;
  // Fire immediately — captures the change right away, no polling overhead
  setImmediate?.(broadcastPresenceToStaff) ?? setTimeout(broadcastPresenceToStaff, 0);
}

export function broadcastToStaff(message: WSMessage) {
  void publishCentrifugo(realtimeChannel.staff, message);
  for (const client of clients.values()) {
    if (client.role && STAFF_ROLES.has(client.role)) {
      sendClient(client, message);
    }
  }
}

// ── Lesson recording (teacher presses Start / End) ──
//
// Live updates are BATCHED and throttled: 30 students each pushing their own
// message would mean ~30 socket writes/second on a 1-vCPU box. Instead we
// coalesce every change into one message every RECORDING_FLUSH_MS.
const RECORDING_FLUSH_MS = 5000;
interface LiveCell {
  userId: string;
  code?: string | null;
  label?: string | null;
  passed?: boolean | null;
  tabbedOut?: boolean;
  lastEventAt: number;
  lastEventType: string;
}
const recordingLive = new Map<string, LiveCell>();
let recordingFlushTimer: ReturnType<typeof setInterval> | null = null;

function flushRecordingLive() {
  if (recordingLive.size === 0) return;
  const cells = [...recordingLive.values()];
  recordingLive.clear();
  broadcastToStaff({ type: "recording_live", payload: { cells } });
}

function startRecordingFlush() {
  if (recordingFlushTimer) return;
  recordingFlushTimer = setInterval(flushRecordingLive, RECORDING_FLUSH_MS);
}

function stopRecordingFlush() {
  if (recordingFlushTimer) {
    clearInterval(recordingFlushTimer);
    recordingFlushTimer = null;
  }
  flushRecordingLive();
}

/** Tell one student to start or stop collecting events. */
function sendRecordingState(userId: string, recording: boolean) {
  sendToUser(userId, { type: "recording_state", payload: { recording } });
}

function queueLiveUpdate(userId: string, ev: { type: string; at: number; code?: string | null; label?: string | null; passed?: boolean | null }) {
  const prev = recordingLive.get(userId);
  const cell: LiveCell = {
    userId,
    code: ev.code ?? prev?.code ?? null,
    label: ev.label ?? prev?.label ?? null,
    passed: ev.passed ?? prev?.passed ?? null,
    tabbedOut: ev.type === "tab_out" ? true : ev.type === "tab_back" ? false : prev?.tabbedOut,
    lastEventAt: ev.at,
    lastEventType: ev.type,
  };
  recordingLive.set(userId, cell);

  // Tab-outs are the whole point of the red marker — push them immediately
  // instead of waiting up to 5s.
  if (ev.type === "tab_out" || ev.type === "tab_back") flushRecordingLive();
}

function ensurePresenceFlush() {
  // Kept for compatibility — presence now flushes on mark dirty, no timer needed
  if (presenceFlushTimer) return;
  // light 5s fallback in case a dirty flag is missed
  presenceFlushTimer = setInterval(broadcastPresenceToStaff, 5000);
}

// ── Helpers ──
//
// Editor peeks and timer ticks can be recreated from the next message/snapshot.
// Dropping those for a slow browser prevents its ws send queue from consuming
// unbounded RAM, while state changes and direct responses always go through.
const DROPPABLE_MESSAGE_TYPES = new Set([
  "arena_panel", "code_duel_panel", "presence_list", "recording_live",
  "arena_timer", "code_duel_timer", "timer_sync",
]);
const MAX_SOCKET_BUFFER_BYTES = 512 * 1024;

function sendRaw(ws: WebSocket, raw: string, droppable: boolean) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (droppable && ws.bufferedAmount > MAX_SOCKET_BUFFER_BYTES) return;
  try { ws.send(raw); } catch { /* close/error handler owns cleanup */ }
}

function send(ws: WebSocket, message: WSMessage) {
  sendRaw(ws, JSON.stringify(message), DROPPABLE_MESSAGE_TYPES.has(message.type));
}

function sendClientRaw(client: ConnectedClient, raw: string, droppable: boolean) {
  for (const ws of client.sockets) sendRaw(ws, raw, droppable);
}

function sendClient(client: ConnectedClient, message: WSMessage) {
  const raw = JSON.stringify(message);
  sendClientRaw(client, raw, DROPPABLE_MESSAGE_TYPES.has(message.type));
}

export function broadcastToMatch(matchId: string, message: WSMessage) {
  void publishCentrifugo(`match:${matchId}`, message);
  const room = matchRooms.get(matchId);
  if (!room) return;
  const raw = JSON.stringify(message);
  const droppable = DROPPABLE_MESSAGE_TYPES.has(message.type);
  for (const userId of room) {
    const client = clients.get(userId);
    if (client) sendClientRaw(client, raw, droppable);
  }
}

export function broadcastToAll(message: WSMessage) {
  void publishCentrifugo(realtimeChannel.global, message);
  const raw = JSON.stringify(message);
  const droppable = DROPPABLE_MESSAGE_TYPES.has(message.type);
  for (const [userId, client] of clients) {
    sendClientRaw(client, raw, droppable);
  }
}

export function broadcastToArena(arenaId: string, message: WSMessage) {
  void publishCentrifugo(realtimeChannel.arena(arenaId), message);
  const room = arenaRooms.get(arenaId);
  if (!room) return;
  const raw = JSON.stringify(message);
  const droppable = DROPPABLE_MESSAGE_TYPES.has(message.type);
  for (const userId of room) {
    const client = clients.get(userId);
    if (client) sendClientRaw(client, raw, droppable);
  }
}

export function broadcastToCodeDuel(matchId: string, message: WSMessage) {
  void publishCentrifugo(realtimeChannel.duel(matchId), message);
  const room = codeDuelRooms.get(matchId);
  if (!room) return;
  const raw = JSON.stringify(message);
  const droppable = DROPPABLE_MESSAGE_TYPES.has(message.type);
  for (const userId of room) {
    const client = clients.get(userId);
    if (client) sendClientRaw(client, raw, droppable);
  }
}

/** Editor peeks belong only to staff; sending them to students leaks opponents' code. */
export function broadcastToArenaStaff(arenaId: string, message: WSMessage) {
  void publishCentrifugo(realtimeChannel.arenaStaff(arenaId), message);
  const room = arenaRooms.get(arenaId);
  if (!room) return;
  const raw = JSON.stringify(message);
  const droppable = DROPPABLE_MESSAGE_TYPES.has(message.type);
  for (const userId of room) {
    const client = clients.get(userId);
    if (client?.role && STAFF_ROLES.has(client.role)) sendClientRaw(client, raw, droppable);
  }
}

export function broadcastToCodeDuelStaff(matchId: string, message: WSMessage) {
  void publishCentrifugo(realtimeChannel.duelStaff(matchId), message);
  const room = codeDuelRooms.get(matchId);
  if (!room) return;
  const raw = JSON.stringify(message);
  const droppable = DROPPABLE_MESSAGE_TYPES.has(message.type);
  for (const userId of room) {
    const client = clients.get(userId);
    if (client?.role && STAFF_ROLES.has(client.role)) sendClientRaw(client, raw, droppable);
  }
}

/** True when at least one staff/creator is currently connected to the room.
 *  `advanceFromReveal` uses this to avoid auto-advancing the round while the
 *  teacher is still watching — the teacher advances manually via /skip. */
export function codeDuelHasStaff(matchId: string): boolean {
  const room = codeDuelRooms.get(matchId);
  if (!room) return false;
  for (const userId of room) {
    const client = clients.get(userId);
    if (client && client.role && ["teacher", "admin", "teaching_assistant"].includes(client.role) && isUserOnline(userId)) return true;
  }
  return false;
}

function sendToUser(userId: string, message: WSMessage) {
  void publishCentrifugo(realtimeChannel.user(userId), message);
  const client = clients.get(userId);
  if (client) sendClient(client, message);
}
/** Send one WebSocket message to a single user (realtime per-test judge pushes). */
export { sendToUser };

function addEventFeed(matchId: string, type: string, message: string) {
  broadcastToMatch(matchId, {
    type: "event_feed",
    payload: {
      id: Math.random().toString(36).slice(2, 10),
      type,
      message,
      timestamp: new Date().toISOString(),
    },
  });
}

// ── Timer ──

function startMatchTimer(matchId: string, durationMinutes: number, createdAt: Date) {
  stopMatchTimer(matchId);
  const endTime = createdAt.getTime() + durationMinutes * 60000;

  const interval = setInterval(async () => {
    const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
    broadcastToMatch(matchId, { type: "timer_sync", payload: { remainingSeconds: remaining } });
    if (remaining <= 0) {
      stopMatchTimer(matchId);
      try {
        const { endMatch } = await import("./gameService");
        await endMatch(matchId);
        broadcastToMatch(matchId, { type: "match_status_change", payload: { status: "finished" } });
        addEventFeed(matchId, "match_ended", "Trận đấu kết thúc!");
        const state = await getFullState(matchId);
        broadcastToMatch(matchId, { type: "match_state", payload: state });
      } catch (e) {
        console.error("Auto-end match error:", e);
      }
    }
  }, 1000);

  matchTimers.set(matchId, interval);
}

function stopMatchTimer(matchId: string) {
  const existing = matchTimers.get(matchId);
  if (existing) { clearInterval(existing); matchTimers.delete(matchId); }
}

// ── Connection handler ──

async function handleMessage(user: JwtPayload, ws: WebSocket, raw: string) {
  let msg: WSMessage;
  try { msg = JSON.parse(raw); } catch { return; }

  switch (msg.type) {
    // ── Code Lab interactive terminal ──
    case "terminal_start": {
      const requestId = typeof msg.payload?.requestId === "string" ? msg.payload.requestId : "";
      const language = msg.payload?.language;
      const code = msg.payload?.code;
      if (!requestId || requestId.length > 100 || (language !== "python" && language !== "cpp") || typeof code !== "string") {
        send(ws, { type: "terminal_error", payload: { requestId, message: "Yêu cầu chạy code không hợp lệ." } });
        return;
      }

      const started = await startInteractiveSession({
        userId: user.userId,
        language,
        code,
        onOutput: (sessionId, stream, data) => {
          sendToUser(user.userId, { type: "terminal_output", payload: { sessionId, stream, data } });
        },
        onExit: (sessionId, info) => {
          sendToUser(user.userId, { type: "terminal_exit", payload: { sessionId, ...info } });
        },
        onStarted: (session) => {
          send(ws, {
            type: "terminal_started",
            payload: { requestId, sessionId: session.id, language: session.language },
          });
        },
      });

      if ("error" in started) {
        send(ws, {
          type: "terminal_error",
          payload: { requestId, message: started.error, status: started.status || "error" },
        });
        return;
      }

      break;
    }

    case "terminal_input": {
      const sessionId = typeof msg.payload?.sessionId === "string" ? msg.payload.sessionId : "";
      const data = msg.payload?.data;
      if (!sessionId || typeof data !== "string") return;
      const written = writeInteractiveInput(sessionId, user.userId, data);
      if ("error" in written) {
        send(ws, { type: "terminal_error", payload: { sessionId, message: written.error } });
      }
      break;
    }

    case "terminal_stop": {
      const sessionId = typeof msg.payload?.sessionId === "string" ? msg.payload.sessionId : "";
      if (!sessionId) return;
      const stopped = await stopInteractiveSession(sessionId, user.userId, "stopped");
      if ("error" in stopped) {
        send(ws, { type: "terminal_error", payload: { sessionId, message: stopped.error } });
      }
      break;
    }

    case "join_match": {
      const matchId = msg.payload?.matchId;
      if (!matchId) return;

      // Look up player's team from DB
      try {
        const player = await prisma.gamePlayer.findUnique({
          where: { matchId_userId: { matchId, userId: user.userId } },
          select: { team: true },
        });
        if (player) {
          playerTeams.set(`${user.userId}:${matchId}`, player.team);
        }
      } catch { /* ignore */ }

      // Track client
      const client = registerClient(user.userId, ws, user.role);
      client.matchIds.add(matchId);

      // Join room
      if (!matchRooms.has(matchId)) matchRooms.set(matchId, new Set());
      matchRooms.get(matchId)!.add(user.userId);

      // Send full state to this client
      try {
        const state = await getFullState(matchId);
        sendToUser(user.userId, { type: "match_state", payload: state });

        if (state.match.status === "in_progress") {
          startMatchTimer(matchId, state.match.durationMinutes, new Date(state.match.createdAt));
        }
      } catch (e) {
        console.error("join_match state error:", e);
      }

      // Notify others
      const playerInfo = await prisma.user.findUnique({ where: { id: user.userId }, select: { fullName: true, nickname: true, role: true } });
      const fullName = (playerInfo?.role === "student" ? playerInfo.nickname?.trim() || playerInfo.fullName : playerInfo?.fullName) || user.userId;
      const team = playerTeams.get(`${user.userId}:${matchId}`) || "unknown";
      broadcastToMatch(matchId, {
        type: "player_joined",
        payload: { userId: user.userId, fullName, team },
      });
      addEventFeed(matchId, "player_joined", `${fullName} (${team === "defender" ? "Defender" : team === "attacker" ? "Attacker" : ""}) đã tham gia`);
      break;
    }

    case "leave_match": {
      const matchId = msg.payload?.matchId;
      if (!matchId) return;
      removeRoomMember(matchRooms, matchId, user.userId);
      playerTeams.delete(`${user.userId}:${matchId}`);
      const client = clients.get(user.userId);
      if (client) client.matchIds.delete(matchId);
      const playerInfo = await prisma.user.findUnique({ where: { id: user.userId }, select: { fullName: true, nickname: true, role: true } });
      broadcastToMatch(matchId, {
        type: "player_left",
        payload: { userId: user.userId },
      });
      addEventFeed(matchId, "player_left", `${(playerInfo?.role === "student" ? playerInfo.nickname?.trim() || playerInfo.fullName : playerInfo?.fullName) || user.userId} đã rời đi`);
      break;
    }

    case "target_fortress": {
      const matchId = msg.payload?.matchId;
      const fortressId = msg.payload?.fortressId || null;
      if (!matchId) return;
      const team = playerTeams.get(`${user.userId}:${matchId}`) || "unknown";
      broadcastToMatch(matchId, {
        type: "player_target",
        payload: {
          userId: user.userId,
          fullName: (user as any).fullName || user.userId,
          team,
          fortressId,
        },
      });
      break;
    }

    // Teacher peek: student sends their current panel state (with code)
    case "panel_state": {
      const matchId = msg.payload?.matchId;
      if (!matchId) return;
      broadcastToMatch(matchId, {
        type: "panel_state",
        payload: {
          userId: user.userId,
          fortressId: msg.payload.fortressId || null,
          coreId: msg.payload.coreId || null,
          hasCode: !!msg.payload.hasCode,
          language: msg.payload.language || "python",
          code: msg.payload.code || "", // current editor content (for teacher peek)
        },
      });
      break;
    }

    case "ping": {
      send(ws, { type: "pong", payload: {} });
      break;
    }

    // ── Code Debug Arena ──
    case "arena_join": {
      const arenaId = msg.payload?.arenaId;
      if (!arenaId) return;
      if (!(await canAccessArena(user, arenaId))) {
        send(ws, { type: "arena_error", payload: { message: "Access denied" } });
        return;
      }
      const client = registerClient(user.userId, ws, user.role);
      client.arenaIds.add(arenaId);
      if (!arenaRooms.has(arenaId)) arenaRooms.set(arenaId, new Set());
      arenaRooms.get(arenaId)!.add(user.userId);

      try {
        const { getArenaState } = await import("./debugArenaService");
        const state = await getArenaState(arenaId, user.userId);
        sendToUser(user.userId, { type: "arena_state", payload: state });
      } catch (e) {
        console.error("arena_join state error:", e);
      }
      break;
    }

    case "arena_leave": {
      const arenaId = msg.payload?.arenaId;
      if (!arenaId) return;
      removeRoomMember(arenaRooms, arenaId, user.userId);
      const key = roomMemberKey(arenaId, user.userId);
      arenaPanelAuthorizations.delete(key);
      panelLastBroadcastAt.delete(key);
      const client = clients.get(user.userId);
      if (client) client.arenaIds.delete(arenaId);
      break;
    }

    // Player broadcasts their current editor state so teacher/guests can peek live
    case "arena_panel": {
      const arenaId = msg.payload?.arenaId;
      if (!arenaId) return;
      // A joined room has already passed access control. Cache the one player
      // lookup per (arena, user) so typing never queues SQLite reads.
      if (!arenaRooms.get(arenaId)?.has(user.userId)) return;
      const authorizationKey = roomMemberKey(arenaId, user.userId);
      if (!arenaPanelAuthorizations.has(authorizationKey)) {
        const participant = await prisma.debugArenaPlayer.findUnique({
          where: { matchId_userId: { matchId: arenaId, userId: user.userId } },
          select: { userId: true },
        });
        if (!participant) return;
        arenaPanelAuthorizations.add(authorizationKey);
      }
      if (!canBroadcastPanel(arenaId, user.userId)) return;
      const code = typeof msg.payload?.code === "string" ? msg.payload.code.slice(0, 20_000) : "";
      broadcastToArenaStaff(arenaId, {
        type: "arena_panel",
        payload: {
          userId: user.userId,
          arenaId,
          hasCode: !!msg.payload?.hasCode,
          language: msg.payload?.language || "python",
          code,
          highlighted: Array.isArray(msg.payload?.highlighted) ? msg.payload.highlighted : [],
        },
      });
      break;
    }

    case "arena_ping": {
      send(ws, { type: "arena_pong", payload: {} });
      break;
    }

    // ── Code Duel (speed-coding) ──
    case "code_duel_join": {
      const matchId = msg.payload?.matchId;
      if (!matchId) return;
      if (!(await canAccessCodeDuel(user, matchId))) {
        send(ws, { type: "code_duel_error", payload: { message: "Access denied" } });
        return;
      }
      // Students join the waiting room freely — register them as a player on
      // entering (teacher no longer needs to pre-add anyone).
      if (!["teacher", "admin", "teaching_assistant"].includes(user.role)) {
        try {
          const { ensurePlayer } = await import("./codeDuelService");
          await ensurePlayer(matchId, user.userId);
        } catch { /* non-fatal */ }
      }
      ensureCodeDuelMembership(user.userId, ws, matchId);
      broadcastCodeDuelPresence(matchId, user.userId, true);
      sendToUser(user.userId, {
        type: "code_duel_ready",
        payload: { matchId, userIds: [...(codeDuelReadyUsers.get(matchId) || [])] },
      });
      try {
        const { getCodeDuelState } = await import("./codeDuelService");
        const state = await getCodeDuelState(matchId, user.userId);
        sendToUser(user.userId, { type: "code_duel_state", payload: state });
        // Re-apply any still-active anti-cheat lock while the shared clock runs,
        // so a fresh page load (F5) can't skip the remaining countdown.
        if (state?.match?.status === "in_progress") {
          const lkUntil = codeDuelTabLocks.get(`${matchId}:${user.userId}`);
          if (lkUntil && lkUntil > Date.now()) {
            sendToUser(user.userId, {
              type: "code_duel_tab_lock",
              payload: { seconds: Math.ceil((lkUntil - Date.now()) / 1000), lockUntil: lkUntil },
            });
          }
        }
      } catch (e) {
        console.error("code_duel_join state error:", e);
      }
      break;
    }

    case "code_duel_ready": {
      const matchId = msg.payload?.matchId;
      if (!matchId || ["teacher", "admin", "teaching_assistant"].includes(user.role)) return;
      if (!(await canAccessCodeDuel(user, matchId))) return;
      const ready = Boolean(msg.payload?.ready);
      const readyUsers = codeDuelReadyUsers.get(matchId) || new Set<string>();
      if (ready) readyUsers.add(user.userId);
      else readyUsers.delete(user.userId);
      codeDuelReadyUsers.set(matchId, readyUsers);
      broadcastToCodeDuel(matchId, {
        type: "code_duel_ready",
        payload: { matchId, userId: user.userId, ready },
      });
      break;
    }

    case "code_duel_leave": {
      const matchId = msg.payload?.matchId;
      if (!matchId) return;
      removeRoomMember(codeDuelRooms, matchId, user.userId);
      panelLastBroadcastAt.delete(roomMemberKey(matchId, user.userId));
      const client = clients.get(user.userId);
      if (client) client.matchIds.delete(matchId);
      broadcastCodeDuelPresence(matchId, user.userId, false);
      break;
    }

    // Student broadcasts current editor code so the teacher can watch live.
    case "code_duel_panel": {
      const matchId = msg.payload?.matchId;
      if (!matchId) return;
      // Joining performed the access and player checks. Never repeat a DB read
      // on every code edit; silently reject panels from non-members instead.
      if (!codeDuelRooms.get(matchId)?.has(user.userId) || STAFF_ROLES.has(user.role)) return;
      const codeStr = typeof msg.payload?.code === "string" ? msg.payload.code.slice(0, 50_000) : "";
      const langStr = msg.payload?.language || "python";
      codeDuelLiveBuffers.set(`${matchId}:${user.userId}`, {
        code: codeStr,
        language: langStr,
        updatedAt: Date.now(),
      });
      if (!canBroadcastPanel(matchId, user.userId)) return;
      broadcastToCodeDuelStaff(matchId, {
        type: "code_duel_panel",
        payload: {
          userId: user.userId,
          matchId,
          hasCode: !!msg.payload?.hasCode,
          language: langStr,
          code: codeStr.slice(0, 20_000),
        },
      });
      break;
    }

    // Tab out / back: server records the count (no point penalty), notifies the
    // room (teacher badge), and on return hands the student their lock duration.
    case "code_duel_tab_out":
    case "code_duel_tab_back": {
      const matchId = msg.payload?.matchId;
      if (!matchId) return;
      let player = await prisma.codeDuelPlayer.findUnique({
        where: { matchId_userId: { matchId, userId: user.userId } },
        select: { id: true, outTabCount: true },
      });
      if (!player) {
        const isStaff = ["teacher", "admin", "teaching_assistant"].includes(user.role);
        if (isStaff) return;
        try {
          const { ensurePlayer } = await import("./codeDuelService");
          await ensurePlayer(matchId, user.userId);
          player = await prisma.codeDuelPlayer.findUnique({
            where: { matchId_userId: { matchId, userId: user.userId } },
            select: { id: true, outTabCount: true },
          });
          if (!player) return;
        } catch { return; }
      }
      const isOut = msg.type === "code_duel_tab_out";
      if (isOut) {
        const count = player.outTabCount + 1;
        await prisma.codeDuelPlayer.update({ where: { id: player.id }, data: { outTabCount: count } });
      }
      broadcastToCodeDuel(matchId, {
        type: "code_duel_tab",
        payload: {
          userId: user.userId,
          out: isOut,
          outTabCount: player.outTabCount + (isOut ? 1 : 0),
        },
      });
      // On return, lock the screen for 10s × 1.5^(prior out-tabs) (anti-cheat,
      // no point loss). First offense = 10s; count is already incremented by the
      // preceding tab_out, so subtract one from the exponent. The expiry is
      // stored so a page reload (F5) re-applies the lock instead of clearing it.
      if (!isOut) {
        const lockSeconds = Math.round(10 * Math.pow(1.5, Math.max(0, player.outTabCount - 1)));
        const lockUntil = Date.now() + lockSeconds * 1000;
        codeDuelTabLocks.set(`${matchId}:${user.userId}`, lockUntil);
        sendToUser(user.userId, { type: "code_duel_tab_lock", payload: { seconds: lockSeconds, lockUntil } });
      }
      break;
    }

    // ── Peer Chat (global + per-arena) — logic lives in services/chatService.ts ──
    case "chat_join": {
      const scope: "global" | "arena" = msg.payload?.scope === "arena" ? "arena" : "global";
      const arenaId: string | null = msg.payload?.arenaId || null;
      if (scope === "arena") {
        if (!arenaId) return;
        if (!(await canAccessArena(user, arenaId))) return;
        ensureArenaMembership(user.userId, ws, arenaId);
      }
      sendToUser(user.userId, { type: "chat_history", payload: { scope, messages: getChatHistory(scope, arenaId) } });
      break;
    }

    case "chat_send": {
      await chatSend(user, msg.payload);
      break;
    }

    case "chat_react": {
      await chatReact(user, msg.payload);
      break;
    }


    // ── Lesson recording ──
    case "recording_start": {
      if (!["teacher", "admin", "teaching_assistant"].includes(user.role)) return;
      if (isRecording()) {
        send(ws, { type: "recording_error", payload: { message: "Đã có buổi ghi đang chạy." } });
        return;
      }
      // Everyone online right now, per the presence map.
      const online = presenceSnapshot().map((p) => p.userId);
      const started = await startRecording({
        startedById: user.userId,
        userIds: online,
        courseId: typeof msg.payload?.courseId === "string" ? msg.payload.courseId : null,
        title: typeof msg.payload?.title === "string" ? msg.payload.title.slice(0, 200) : null,
      });
      startRecordingFlush();
      for (const uid of started.userIds) sendRecordingState(uid, true);
      broadcastToStaff({
        type: "recording_started",
        payload: { sessionId: started.sessionId, userIds: started.userIds, startedAt: Date.now() },
      });
      break;
    }

    case "recording_add": {
      if (!["teacher", "admin", "teaching_assistant"].includes(user.role)) return;
      const uid = typeof msg.payload?.userId === "string" ? msg.payload.userId : "";
      if (!uid) return;
      const result = await addParticipant(uid);
      if ("error" in result) {
        send(ws, { type: "recording_error", payload: { message: result.error } });
        return;
      }
      sendRecordingState(uid, true);
      broadcastToStaff({ type: "recording_participant_added", payload: { userId: uid } });
      break;
    }

    case "recording_end": {
      if (!["teacher", "admin", "teaching_assistant"].includes(user.role)) return;
      const activeBefore = getActiveRecording();
      const result = await endRecording();
      if ("error" in result) {
        send(ws, { type: "recording_error", payload: { message: result.error } });
        return;
      }
      stopRecordingFlush();
      for (const uid of activeBefore?.userIds || []) sendRecordingState(uid, false);
      broadcastToStaff({
        type: "recording_ended",
        payload: { sessionId: result.sessionId, purgedSessions: result.purgedSessions },
      });
      break;
    }

    case "recording_event": {
      if (!isParticipant(user.userId)) return;
      const type = String(msg.payload?.type || "") as RecordingEventType;
      const allowed: RecordingEventType[] = ["code_snapshot", "tab_out", "tab_back", "run", "idle_start", "paste", "activity"];
      if (!allowed.includes(type)) return;

      const stored = await recordEvent(user.userId, {
        type,
        code: typeof msg.payload?.code === "string" ? msg.payload.code : undefined,
        label: typeof msg.payload?.label === "string" ? msg.payload.label : undefined,
        passed: msg.payload?.passed === true ? true : msg.payload?.passed === false ? false : null,
        meta: msg.payload?.meta && typeof msg.payload.meta === "object" ? msg.payload.meta : undefined,
      });
      if (stored) queueLiveUpdate(user.userId, stored);
      break;
    }

    // ── Presence (teacher live-monitoring) ──
    case "presence_update": {
      const profile = await resolveUserProfile(user.userId);
      const hidden = !!msg.payload?.hidden;
      const idle = !!msg.payload?.idle;
      presence.set(user.userId, {
        userId: user.userId,
        fullName: profile.realName,
        nickname: profile.nickname,
        role: profile.role,
        avatarUrl: profile.avatarUrl,
        status: computeStatus(hidden, idle),
        activityType: String(msg.payload?.activityType || "browsing"),
        activityLabel: String(msg.payload?.activityLabel || "Đang duyệt web"),
        lastActiveAt: Date.now(),
      });
      ensurePresenceFlush();
      markPresenceDirty();
      break;
    }
  }
}

/**
 * Execute a client command received through Centrifugo RPC. The virtual socket
 * retains the established command handler while returning direct replies via
 * the user's Centrifugo channel instead of the old `/ws` connection.
 */
export async function handleCentrifugoCommand(user: JwtPayload, message: WSMessage) {
  const virtualSocket = {
    __centrifugoVirtual: true,
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send(raw: string) {
      try { sendToUser(user.userId, JSON.parse(raw)); } catch { /* ignore malformed internal reply */ }
    },
  } as unknown as WebSocket;
  await handleMessage(user, virtualSocket, JSON.stringify(message));
}

// ── Init ──

export function initWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 60 * 1024 });
  const heartbeat = setInterval(() => {
    for (const candidate of wss.clients) {
      const ws = candidate as WebSocket & { isAlive?: boolean };
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch { ws.terminate(); }
    }
  }, 30_000);
  heartbeat.unref();
  wss.on("close", () => clearInterval(heartbeat));

  // A recording only lives in memory, so any session left "recording" after a
  // restart can never receive events again — close it out.
  reconcileOrphanedRecordings().catch(() => {});

  wss.on("connection", (ws, request) => {
    const user = wsAuthenticate(request);
    if (!user) {
      ws.close(4001, "Unauthorized");
      return;
    }

    // Register client for global broadcasts (chat, etc.)
    // Update ws reference if user already has a client (e.g. reconnection)
    const client = registerClient(user.userId, ws, user.role);
    const heartbeatSocket = ws as WebSocket & { isAlive?: boolean };
    heartbeatSocket.isAlive = true;
    heartbeatSocket.on("pong", () => { heartbeatSocket.isAlive = true; });

    // Send current presence snapshot immediately to staff (no 2s wait)
    if (["teacher", "admin", "teaching_assistant"].includes(user.role)) {
      const snap = presenceSnapshot();
      send(ws, { type: "presence_list", payload: { students: snap } });
      const activeRec = getActiveRecording();
      if (activeRec) {
        send(ws, {
          type: "recording_started",
          payload: { sessionId: activeRec.sessionId, userIds: activeRec.userIds, startedAt: activeRec.startedAt },
        });
      }
    }

    // A student reconnecting mid-recording (refresh, flaky wifi) must resume
    // collecting events, otherwise the rest of their session is lost.
    if (user.role === "student" && isParticipant(user.userId)) {
      send(ws, { type: "recording_state", payload: { recording: true } });
    }

    // Register live presence for this user
    ensurePresenceFlush();
    resolveUserProfile(user.userId).then((profile) => {
      presence.set(user.userId, {
        userId: user.userId,
        fullName: profile.realName,
        nickname: profile.nickname,
        role: profile.role,
        avatarUrl: profile.avatarUrl,
        status: "online",
        activityType: "browsing",
        activityLabel: "Vừa vào web",
        lastActiveAt: Date.now(),
      });
      markPresenceDirty();
    });

    ws.on("message", (raw) => {
      handleMessage(user, ws, raw.toString());
    });

    ws.on("close", () => {
      const client = clients.get(user.userId);
      if (!client) return;
      client.sockets.delete(ws);
      updateActiveWsMetric();
      // Keep rooms, presence, and terminal sessions alive while another tab is open.
      if (client.sockets.size > 0) return;

      void stopUserSessions(user.userId, "disconnected");
      for (const matchId of client.matchIds) {
        const room = matchRooms.get(matchId);
        if (room) {
          removeRoomMember(matchRooms, matchId, user.userId);
          broadcastToMatch(matchId, { type: "player_left", payload: { userId: user.userId } });
        }
        playerTeams.delete(`${user.userId}:${matchId}`);
      }
      // Arena cleanup
      for (const arenaId of client.arenaIds) {
        removeRoomMember(arenaRooms, arenaId, user.userId);
        const key = roomMemberKey(arenaId, user.userId);
        arenaPanelAuthorizations.delete(key);
        panelLastBroadcastAt.delete(key);
      }
      // Code Duel rooms are tracked in client.matchIds; clean them from the
      // code-duel room map separately (matchRooms is the legacy game lobby).
      for (const matchId of client.matchIds) {
        removeRoomMember(codeDuelRooms, matchId, user.userId);
        panelLastBroadcastAt.delete(roomMemberKey(matchId, user.userId));
        broadcastCodeDuelPresence(matchId, user.userId, false);
      }
      clients.delete(user.userId);
      // Presence cleanup
      presence.delete(user.userId);
      markPresenceDirty();
    });
  });

  console.log("WebSocket server initialized on /ws");
}

export { addEventFeed, startMatchTimer, stopMatchTimer };

// Wire the extracted peer-chat module to this transport's broadcast/profile
// helpers (all hoisted function declarations above, safe at module load).
initChat({
  sendToUser,
  broadcastToAll,
  broadcastToArena,
  resolveUserProfile,
  canAccessArena,
});
