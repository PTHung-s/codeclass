import prisma from "../utils/prisma";
import { JwtPayload } from "../utils/jwt";

/**
 * Peer Chat (global + per-arena) — state, anti-spam and handlers.
 * Extracted from gameWebSocket.ts so the transport layer only routes
 * `chat_*` messages here. Broadcast/profile lookups are injected via
 * initChat() to avoid a circular import with gameWebSocket.
 */

export interface ChatMessage {
  id: string;
  userId: string;
  fullName: string;
  role: string;
  avatarUrl?: string | null;
  text: string;
  stickerUrl?: string | null; // Hiển thị sticker trong chat (ảnh / emoji)
  isSticker?: boolean;        // true nếu tin nhắn là sticker, không phải text
  imageUrl?: string | null;   // Ảnh user upload (chỉ /uploads/*)
  isImage?: boolean;
  timestamp: string;
  scope: "global" | "arena";
  arenaId?: string | null;
  hearts?: string[]; // Array of userIds who reacted with heart
  heartUsers?: { id: string; fullName: string }[]; // resolved names for reaction tooltip
}

export interface ChatWSMessage {
  type: string;
  payload?: any;
}

export interface ChatDeps {
  sendToUser(userId: string, message: ChatWSMessage): void;
  broadcastToAll(message: ChatWSMessage): void;
  broadcastToArena(arenaId: string, message: ChatWSMessage): void;
  resolveUserProfile(userId: string): Promise<{ fullName: string; role: string; avatarUrl: string | null }>;
  canAccessArena(user: JwtPayload, arenaId: string): Promise<boolean>;
}

let deps: ChatDeps | null = null;

export function initChat(injected: ChatDeps): void {
  deps = injected;
}

function requireDeps(): ChatDeps {
  if (!deps) throw new Error("chatService not initialized — call initChat() first");
  return deps;
}

// ── History buffers (in-memory, last N per room) ──
const CHAT_HISTORY_LIMIT = 50;
const globalChatBuffer: ChatMessage[] = [];
const arenaChatBuffers = new Map<string, ChatMessage[]>();

export function getChatHistory(scope: "global" | "arena", arenaId: string | null): ChatMessage[] {
  return scope === "arena" && arenaId
    ? (arenaChatBuffers.get(arenaId) || [])
    : globalChatBuffer;
}

// ── Anti-spam ──
/** Anti-spam: tối đa 3 tin / giây / user — quá thì bắt đợi. */
const CHAT_RATE_LIMIT_MAX = 3;
const CHAT_RATE_LIMIT_WINDOW_MS = 1_000;
/** Stricter cap for image uploads so one student can't flood the room with photos. */
const CHAT_IMAGE_RATE_LIMIT_MAX = 3;
const CHAT_IMAGE_RATE_LIMIT_WINDOW_MS = 60_000;
const chatSendTimestamps = new Map<string, number[]>();
const chatImageTimestamps = new Map<string, number[]>();

function pruneTimestamps(list: number[], now: number, windowMs: number): number[] {
  return list.filter((t) => now - t < windowMs);
}

function checkChatRateLimit(userId: string, isImage: boolean): { ok: true } | { ok: false; message: string } {
  const now = Date.now();
  const sends = pruneTimestamps(chatSendTimestamps.get(userId) || [], now, CHAT_RATE_LIMIT_WINDOW_MS);
  if (sends.length >= CHAT_RATE_LIMIT_MAX) {
    chatSendTimestamps.set(userId, sends);
    return { ok: false, message: "Thao tác quá nhanh, vui lòng chậm lại." };
  }
  if (isImage) {
    const images = pruneTimestamps(chatImageTimestamps.get(userId) || [], now, CHAT_IMAGE_RATE_LIMIT_WINDOW_MS);
    if (images.length >= CHAT_IMAGE_RATE_LIMIT_MAX) {
      chatImageTimestamps.set(userId, images);
      return { ok: false, message: "Bạn đã gửi quá nhiều ảnh. Tối đa 3 ảnh / phút." };
    }
    images.push(now);
    chatImageTimestamps.set(userId, images);
  }
  sends.push(now);
  chatSendTimestamps.set(userId, sends);
  return { ok: true };
}

// ── URL sanitizers ──

/** Only allow same-origin upload paths for chat images (blocks javascript: / data: / external hotlink). */
function sanitizeChatImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url || url.length > 500) return null;
  if (!url.startsWith("/uploads/")) return null;
  if (url.includes("..") || url.includes("\\") || url.includes("\0")) return null;
  if (!/\.(png|jpe?g|gif|webp)$/i.test(url)) return null;
  return url;
}

/** Stickers: local upload path, absolute http(s) image, or a short emoji glyph. */
function sanitizeChatStickerUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url || url.length > 500) return null;
  // Sticker seed nằm ở /stickers/..., ảnh do người dùng tải lên ở /uploads/...
  if (url.startsWith("/uploads/") || url.startsWith("/stickers/")) {
    if (url.includes("..") || url.includes("\\")) return null;
    return url;
  }
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.toString();
    } catch {
      return null;
    }
  }
  // Emoji / short glyph stickers (no path separators)
  if (url.length <= 16 && !/[\/\\<>]/.test(url)) return url;
  return null;
}

// ── Gacha emoji gate ──
// Emoji "xịn" mở từ Gacha — ai không sở hữu (không nằm trong User.unlockedEmojis) không được gửi,
// kể cả khi tự copy-paste ký tự vào ô nhập. (Khớp BASE_VIRTUAL_POOL trong gachaEngine.ts)
const GACHA_XIN_CHARS = ["😎", "✨", "🔥", "🎉", "🚀", "💎", "👑", "🦄"];

/** Loại bỏ các emoji xịn user không sở hữu khỏi text. */
function filterUnownedGachaEmojis(text: string, unlockedEmojis: string[]): { text: string; removed: number } {
  if (!text) return { text, removed: 0 };
  let result = text;
  let removed = 0;
  const owned = new Set(unlockedEmojis || []);
  for (const ch of GACHA_XIN_CHARS) {
    if (owned.has(ch)) continue;
    if (result.includes(ch)) {
      const count = result.split(ch).length - 1;
      result = result.split(ch).join("");
      removed += count;
    }
  }
  return { text: result, removed };
}

// ── Handlers ──

export async function chatSend(user: JwtPayload, payload: any): Promise<void> {
  const d = requireDeps();
  let text = String(payload?.text || "").trim();
  const stickerUrl = sanitizeChatStickerUrl(payload?.stickerUrl);
  const imageUrl = sanitizeChatImageUrl(payload?.imageUrl);
  if (!text && !stickerUrl && !imageUrl) return;
  // Prefer a single attachment type per message (image wins over sticker).
  const effectiveSticker = imageUrl ? null : stickerUrl;
  const scope: "global" | "arena" = payload?.scope === "arena" ? "arena" : "global";
  const arenaId: string | null = scope === "arena" ? (payload?.arenaId || null) : null;
  if (scope === "arena" && !arenaId) return;
  if (scope === "arena" && !(await d.canAccessArena(user, arenaId!))) return;

  const rate = checkChatRateLimit(user.userId, !!imageUrl);
  if (!rate.ok) {
    d.sendToUser(user.userId, { type: "chat_notice", payload: { message: rate.message } });
    return;
  }

  // Chặn copy-paste emoji xịn không sở hữu (chỉ áp tin text, không phải sticker/ảnh)
  if (text && !effectiveSticker && !imageUrl) {
    let unlockedEmojis: string[] = [];
    try {
      const u = await prisma.user.findUnique({ where: { id: user.userId }, select: { unlockedEmojis: true } });
      unlockedEmojis = JSON.parse(u?.unlockedEmojis || "[]");
    } catch { unlockedEmojis = []; }
    const filtered = filterUnownedGachaEmojis(text, unlockedEmojis);
    if (filtered.removed > 0) {
      d.sendToUser(user.userId, {
        type: "chat_notice",
        payload: { message: "Bạn chưa sở hữu một số emoji xịn, nên chúng đã bị lọc khỏi tin nhắn. Hãy mở Gói Thẻ may mắn để sưu tầm! ✦" },
      });
    }
    text = filtered.text;
    if (!text && !effectiveSticker && !imageUrl) return;
  }

  const info = await d.resolveUserProfile(user.userId);
  const message: ChatMessage = {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    userId: user.userId,
    fullName: info.fullName,
    role: info.role,
    avatarUrl: info.avatarUrl,
    text: text ? text.slice(0, 1000) : "",
    stickerUrl: effectiveSticker,
    isSticker: !!effectiveSticker,
    imageUrl,
    isImage: !!imageUrl,
    timestamp: new Date().toISOString(),
    scope,
    arenaId,
    hearts: [],
    heartUsers: [],
  };
  if (scope === "arena" && arenaId) {
    const buf = arenaChatBuffers.get(arenaId) || [];
    buf.push(message);
    if (buf.length > CHAT_HISTORY_LIMIT) buf.splice(0, buf.length - CHAT_HISTORY_LIMIT);
    arenaChatBuffers.set(arenaId, buf);
    d.broadcastToArena(arenaId, { type: "chat_message", payload: message });
  } else {
    globalChatBuffer.push(message);
    if (globalChatBuffer.length > CHAT_HISTORY_LIMIT) {
      globalChatBuffer.splice(0, globalChatBuffer.length - CHAT_HISTORY_LIMIT);
    }
    d.broadcastToAll({ type: "chat_message", payload: message });
  }
}

export async function chatReact(user: JwtPayload, payload: any): Promise<void> {
  const d = requireDeps();
  const messageId = typeof payload?.messageId === "string" ? payload.messageId : "";
  if (!messageId) return;
  const scope: "global" | "arena" = payload?.scope === "arena" ? "arena" : "global";
  const arenaId: string | null = scope === "arena" ? (payload?.arenaId || null) : null;

  const targetList = getChatHistory(scope, arenaId);
  const targetMsg = targetList.find((m) => m.id === messageId);
  if (!targetMsg) return;

  if (!Array.isArray(targetMsg.hearts)) targetMsg.hearts = [];
  const userIdx = targetMsg.hearts.indexOf(user.userId);
  if (userIdx >= 0) {
    targetMsg.hearts.splice(userIdx, 1);
  } else {
    targetMsg.hearts.push(user.userId);
  }

  // Resolve reactor names once per react so clients can show "who reacted".
  let heartUsers: { id: string; fullName: string }[] = [];
  if (targetMsg.hearts.length > 0) {
    try {
      const rows = await prisma.user.findMany({
        where: { id: { in: targetMsg.hearts } },
        select: { id: true, fullName: true },
      });
      heartUsers = rows.map((r: any) => ({ id: r.id, fullName: r.fullName }));
    } catch {
      heartUsers = [];
    }
  }
  targetMsg.heartUsers = heartUsers;

  const reactPayload = { messageId, hearts: targetMsg.hearts, heartUsers, scope, arenaId };
  if (scope === "arena" && arenaId) {
    d.broadcastToArena(arenaId, { type: "chat_react", payload: reactPayload });
  } else {
    d.broadcastToAll({ type: "chat_react", payload: reactPayload });
  }
}
