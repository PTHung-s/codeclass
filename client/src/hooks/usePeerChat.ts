import { useCallback, useEffect, useRef, useState } from "react";
import { socketSend, socketSubscribe } from "../lib/socket";
import { useAuthContext } from "../contexts/AuthContext";

export interface ChatMessage {
  id: string;
  userId: string;
  fullName: string;
  role: string;
  avatarUrl?: string | null;
  text: string;
  stickerUrl?: string | null;
  isSticker?: boolean;
  imageUrl?: string | null;
  isImage?: boolean;
  timestamp: string;
  scope: "global" | "arena";
  arenaId?: string | null;
  hearts?: string[]; // userIds who gave heart
  heartUsers?: { id: string; fullName: string }[]; // resolved names for reaction tooltip
}

export type ChatScope = "global" | "arena";

export function usePeerChat(scope: ChatScope, arenaId: string | null) {
  const { user } = useAuthContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  // Guard against late messages from a previous scope (stale closure race)
  const scopeRef = useRef<string>(`${scope}:${arenaId || ""}`);

  // Reset when scope changes
  useEffect(() => {
    scopeRef.current = `${scope}:${arenaId || ""}`;
    setMessages([]);
    setUnread(0);
  }, [scope, arenaId]);

  useEffect(() => {
    const unsub = socketSubscribe((msg) => {
      const current = scopeRef.current;

      if (msg.type === "__socket_open") {
        // Re-join room on (re)connect
        socketSend("chat_join", { scope, arenaId });
        return;
      }

      if (msg.type === "chat_history") {
        if (`${msg.payload?.scope}:${scope === "arena" ? arenaId : ""}` !== current) return;
        setMessages(Array.isArray(msg.payload?.messages) ? msg.payload.messages : []);
        return;
      }

      if (msg.type === "chat_message") {
        const p = msg.payload || {};
        if (p.scope !== scope) return;
        if (scope === "arena" && p.arenaId !== arenaId) return;
        setMessages((prev) => [...prev, p as ChatMessage]);
        if (p.userId !== user?.id) setUnread((u) => u + 1);
      }

      if (msg.type === "chat_react") {
        const p = msg.payload || {};
        if (p.scope !== scope) return;
        if (scope === "arena" && p.arenaId !== arenaId) return;
        setMessages((prev) =>
          prev.map((m) => (m.id === p.messageId ? { ...m, hearts: p.hearts || [], heartUsers: p.heartUsers || [] } : m))
        );
      }
    });

    // Request history for the current room
    socketSend("chat_join", { scope, arenaId });

    return unsub;
  }, [scope, arenaId, user?.id]);

  const send = useCallback(
    (text?: string, stickerUrl?: string, imageUrl?: string) => {
      if (imageUrl) {
        socketSend("chat_send", {
          scope,
          arenaId,
          text: (text || "").trim().slice(0, 200),
          imageUrl,
          isImage: true,
        });
        return;
      }
      if (stickerUrl) {
        socketSend("chat_send", { scope, arenaId, text: "", stickerUrl, isSticker: true });
        return;
      }
      const t = (text || "").trim();
      if (!t) return;
      socketSend("chat_send", { scope, arenaId, text: t });
    },
    [scope, arenaId]
  );

  const toggleHeart = useCallback(
    (messageId: string) => {
      if (!messageId) return;
      socketSend("chat_react", { scope, arenaId, messageId });
    },
    [scope, arenaId]
  );

  const markRead = useCallback(() => setUnread(0), []);

  return { messages, send, toggleHeart, unread, markRead, currentUserId: user?.id || "" };
}
