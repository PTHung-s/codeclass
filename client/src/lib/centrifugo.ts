import { Centrifuge, Subscription } from "centrifuge";
import api, { onUnauthorized } from "./api";

type EventHandler = (event: any) => void;
type QueuedCommand = { type: string; payload: any };

const handlers = new Set<EventHandler>();
const subscriptions = new Map<string, Subscription>();
const queuedCommands: QueuedCommand[] = [];
const MAX_QUEUED_COMMANDS = 100;

let client: Centrifuge | null = null;
let starting: Promise<void> | null = null;
let connected = false;
let staff = false;

let transportMode: "unknown" | "centrifugo" | "native_ws" = "unknown";
let nativeWs: WebSocket | null = null;
let nativeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;

function centrifugoEndpoint() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/connection/websocket`;
}

function nativeWsEndpoint(token: string) {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`;
}

function emit(event: any) {
  for (const handler of handlers) {
    try {
      handler(event);
    } catch {
      /* one subscriber must not break the others */
    }
  }
}

async function getToken() {
  return api.get("/realtime/token").then((response) => response.data as { token: string; channels: string[] });
}

async function getSubscriptionToken(channel: string) {
  return api
    .get("/realtime/subscription-token", { params: { channel } })
    .then((response) => response.data.token as string);
}

async function flushCommands() {
  while (connected && client && queuedCommands.length) {
    const command = queuedCommands.shift()!;
    try {
      await client.rpc("realtime", command);
    } catch {
      /* next state/event will reconcile the UI */
    }
  }
}

function flushNativeCommands() {
  while (nativeWs && nativeWs.readyState === WebSocket.OPEN && queuedCommands.length) {
    const command = queuedCommands.shift()!;
    try {
      nativeWs.send(JSON.stringify(command));
    } catch {
      break;
    }
  }
}

function clearNativeReconnectTimer() {
  if (nativeReconnectTimer) {
    clearTimeout(nativeReconnectTimer);
    nativeReconnectTimer = null;
  }
}

function connectNativeWs() {
  const token = localStorage.getItem("token");
  if (!token) return;
  if (nativeWs && (nativeWs.readyState === WebSocket.OPEN || nativeWs.readyState === WebSocket.CONNECTING)) {
    return;
  }
  clearNativeReconnectTimer();

  let ws: WebSocket;
  try {
    ws = new WebSocket(nativeWsEndpoint(token));
  } catch {
    return;
  }
  nativeWs = ws;

  ws.onopen = () => {
    if (nativeWs !== ws) return;
    connected = true;
    reconnectAttempt = 0;
    emit({ type: "__socket_open", payload: {} });
    flushNativeCommands();
  };

  ws.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      emit(parsed);
    } catch {
      /* ignore non-JSON frames */
    }
  };

  ws.onclose = (event) => {
    if (nativeWs === ws) nativeWs = null;
    const wasConnected = connected;
    connected = false;
    if (wasConnected) {
      emit({ type: "__socket_close", payload: {} });
    }
    if (event.code !== 4001 && localStorage.getItem("token") && handlers.size > 0 && transportMode === "native_ws") {
      const delay = Math.min(15_000, 1000 * 2 ** reconnectAttempt);
      reconnectAttempt += 1;
      clearNativeReconnectTimer();
      nativeReconnectTimer = setTimeout(() => {
        nativeReconnectTimer = null;
        connectNativeWs();
      }, delay);
    }
  };
}

function resetRealtimeState() {
  clearNativeReconnectTimer();
  if (nativeWs) {
    try {
      nativeWs.close();
    } catch {
      /* ignore */
    }
    nativeWs = null;
  }
  if (client) {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
    client = null;
  }
  subscriptions.clear();
  queuedCommands.length = 0;
  connected = false;
  staff = false;
  transportMode = "unknown";
  reconnectAttempt = 0;
}

onUnauthorized(resetRealtimeState);

export async function startCentrifugo(): Promise<void> {
  if (transportMode === "native_ws") {
    connectNativeWs();
    return;
  }
  if (client) return;
  if (starting) return starting;

  starting = (async () => {
    let initial: { token: string; channels: string[] };
    try {
      initial = await getToken();
    } catch {
      transportMode = "native_ws";
      connectNativeWs();
      return;
    }

    transportMode = "centrifugo";
    staff = initial.channels.includes("staff:events");
    const next = new Centrifuge(centrifugoEndpoint(), {
      token: initial.token,
      getToken: async () => (await getToken()).token,
    });
    // JWT channels create server-side subscriptions for global, personal and
    // staff events. Dynamic rooms use the per-channel tokens below.
    next.on("publication", (ctx) => emit(ctx.data));
    next.on("connected", () => {
      connected = true;
      emit({ type: "__socket_open", payload: {} });
      void flushCommands();
    });
    next.on("disconnected", () => {
      connected = false;
      emit({ type: "__socket_close", payload: {} });
    });
    client = next;
    next.connect();
  })().finally(() => {
    starting = null;
  });
  return starting;
}

async function subscribe(instance: Centrifuge, channel: string) {
  if (subscriptions.has(channel)) return;
  const sub = instance.newSubscription(channel, {
    getToken: async () => getSubscriptionToken(channel),
  });
  sub.on("publication", (ctx) => emit(ctx.data));
  sub.subscribe();
  subscriptions.set(channel, sub);
}

export async function subscribeCentrifugo(channel: string) {
  await startCentrifugo();
  if (transportMode === "native_ws") return;
  if (client) await subscribe(client, channel);
}

function subscribeRoomsForCommand(type: string, payload: any) {
  if (transportMode === "native_ws") return;
  const arenaId = typeof payload?.arenaId === "string" ? payload.arenaId : "";
  const matchId = typeof payload?.matchId === "string" ? payload.matchId : "";
  if ((type === "arena_join" || type === "chat_join") && arenaId) {
    void subscribeCentrifugo(`arena:${arenaId}`);
    if (staff) void subscribeCentrifugo(`arena_staff:${arenaId}`);
  }
  if (type === "code_duel_join" && matchId) {
    void subscribeCentrifugo(`duel:${matchId}`);
    if (staff) void subscribeCentrifugo(`duel_staff:${matchId}`);
  }
  if (type === "join_match" && matchId) void subscribeCentrifugo(`match:${matchId}`);
}

export function sendCentrifugoCommand(type: string, payload: any, queue = true): boolean {
  const command = { type, payload };

  if (transportMode === "native_ws") {
    if (nativeWs && nativeWs.readyState === WebSocket.OPEN) {
      try {
        nativeWs.send(JSON.stringify(command));
        return true;
      } catch {
        return false;
      }
    }
    if (!queue) return false;
    if (queuedCommands.length >= MAX_QUEUED_COMMANDS) queuedCommands.shift();
    queuedCommands.push(command);
    connectNativeWs();
    return true;
  }

  subscribeRoomsForCommand(type, payload);
  if (!connected || !client) {
    if (!queue) return false;
    if (queuedCommands.length >= MAX_QUEUED_COMMANDS) queuedCommands.shift();
    queuedCommands.push(command);
    void startCentrifugo().catch(() => {});
    return true;
  }
  void client.rpc("realtime", command).catch(() => {});
  return true;
}

export function centrifugoIsOpen() {
  return connected;
}

export function onCentrifugoEvent(handler: EventHandler) {
  handlers.add(handler);
  void startCentrifugo().catch(() => {});
  return () => handlers.delete(handler);
}
