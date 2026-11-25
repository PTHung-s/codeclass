import { useEffect, useRef, useState } from "react";
import { socketSubscribe } from "../lib/socket";

// ── Chat unread state (module-level, shared across hooks) ──
let unreadCount = 0;
let isOnChatPage = false;

type CountListener = () => void;
const countListeners = new Set<CountListener>();

function notifyCountListeners() {
  for (const fn of countListeners) fn();
}

// ── Public API ──

export function getLastChatRead(): string {
  return localStorage.getItem("codeclass_lastChatRead") || "";
}

export function touchLastChatRead(): void {
  localStorage.setItem("codeclass_lastChatRead", new Date().toISOString());
  unreadCount = 0;
  notifyCountListeners();
}

/**
 * Sidebar hook: returns unread chat count (real-time via the shared WS).
 */
export function useChatUnread(): number {
  const [count, setCount] = useState(unreadCount);

  useEffect(() => {
    const listener = () => setCount(unreadCount);
    countListeners.add(listener);

    // Subscribe to the shared socket and react only to chat messages
    const unsub = socketSubscribe((msg) => {
      if (msg.type !== "chat_new") return;
      const payload = msg.payload;

      if (!isOnChatPage) {
        unreadCount++;
        const senderName = payload.createdBy?.fullName || "Ai đó";
        const preview = (payload.description || "").slice(0, 80);
        window.dispatchEvent(
          new CustomEvent("codeclass:toast", {
            detail: {
              id: `chat-${payload.id}`,
              title: `💬 ${senderName}`,
              message: preview + ((payload.description || "").length > 80 ? "..." : ""),
              type: "info",
              duration: 4000,
            },
          }),
        );
      }
      notifyCountListeners();
    });

    return () => {
      countListeners.delete(listener);
      unsub();
    };
  }, []);

  return count;
}

/**
 * ChatPage hook: marks page as active, receives new messages in real-time.
 * Calls `onNewMessage` for each incoming chat message so the chat page can
 * insert it into the React Query cache.
 */
export function useChatLive(onNewMessage?: (msg: any) => void) {
  const cbRef = useRef(onNewMessage);
  cbRef.current = onNewMessage;

  useEffect(() => {
    isOnChatPage = true;
    touchLastChatRead();

    const unsub = socketSubscribe((msg) => {
      if (msg.type === "chat_new") cbRef.current?.(msg.payload);
    });

    return () => {
      isOnChatPage = false;
      unsub();
    };
  }, []);
}

