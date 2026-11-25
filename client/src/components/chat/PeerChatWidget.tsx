import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { usePeerChat } from "../../hooks/usePeerChat";
import { useAuthContext } from "../../contexts/AuthContext";
import { getAnimalAvatarUrl, getAvatarBgColor } from "../../lib/utils";
import { socketSubscribe } from "../../lib/socket";
import api from "../../lib/api";
import { Smile, Lock, Info, ImagePlus, MessageCircle, X } from "lucide-react";

const BASE_EMOJIS = ["😀", "😂", "🥰", "👍", "👏", "🎉", "🔥", "💯", "🤔", "💡", "🚀", "❤️"];
const SPECIAL_GACHA_EMOJIS = [
  { code: "😎", name: "Kính Đen Ngầu", rarity: "Common" },
  { code: "✨", name: "Lấp Lánh", rarity: "Common" },
  { code: "🎉", name: "Pháo Hoa", rarity: "Rare" },
  { code: "🔥", name: "Lửa Chiến", rarity: "Rare" },
  { code: "🚀", name: "Tên Lửa", rarity: "Epic" },
  { code: "💎", name: "Kim Cương", rarity: "Epic" },
  { code: "👑", name: "Vương Miện", rarity: "Legendary" },
  { code: "🦄", name: "Kỳ Lân Thần Thoại", rarity: "Mythic" },
];

interface ChatSticker {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  rarity: string;
  isGachaReward: boolean;
  unlocked: boolean;
}

interface PendingImage {
  id: string;
  file: File;
  url: string;
}

// Hào quang theo emoji xịn trong tin: chỉ Mythic (🦄) và Legendary (👑)
function getAuraForText(text?: string | null): "" | "msg-aura-mythic" | "msg-aura-legendary" {
  if (!text) return "";
  if (text.includes("🦄")) return "msg-aura-mythic";
  if (text.includes("👑")) return "msg-aura-legendary";
  return "";
}

export default function PeerChatWidget() {
  const { user } = useAuthContext();
  const location = useLocation();
  const isIdeRoute = location.pathname.startsWith("/code-lab");
  const { messages, send, toggleHeart, unread, markRead } = usePeerChat("global", null);

  const [collapsed, setCollapsed] = useState(true);
  const [input, setInput] = useState("");
  const [idleDimmed, setIdleDimmed] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiTab, setEmojiTab] = useState<"emoji" | "sticker">("emoji");
  const [unlockedEmojis, setUnlockedEmojis] = useState<string[]>([]);
  const [stickers, setStickers] = useState<ChatSticker[]>([]);
  const [notice, setNotice] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [hoverReact, setHoverReact] = useState<string | null>(null);
  const [pinnedReact, setPinnedReact] = useState<string | null>(null);

  const chatBodyRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMsgCountRef = useRef(messages.length);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => setNotice(""), 4000);
  }, []);

  // Đưa ảnh (chọn file hoặc paste) vào hàng chờ preview trước khi gửi.
  const stageFiles = useCallback((files: File[]) => {
    const next = [...pendingImages];
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        showNotice("Chỉ được gửi file ảnh (PNG, JPG, GIF, WEBP).");
        continue;
      }
      if (file.size > 3 * 1024 * 1024) {
        showNotice("Ảnh tối đa 3MB.");
        continue;
      }
      if (next.length >= 3) {
        showNotice("Tối đa 3 ảnh mỗi lần gửi.");
        break;
      }
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        url: URL.createObjectURL(file),
      });
    }
    setPendingImages(next);
  }, [pendingImages, showNotice]);

  const removePending = useCallback((id: string) => {
    setPendingImages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  // Tải danh sách emoji + sticker đã mở khóa từ Gacha
  const loadUserEmojis = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get("/gacha/info");
      setUnlockedEmojis(res.data.unlockedEmojis || []);
      const stickerList: ChatSticker[] = (res.data.stickers || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        imageUrl: s.imageUrl,
        rarity: s.rarity,
        isGachaReward: s.isGachaReward,
        unlocked: !!s.unlocked,
      }));
      setStickers(stickerList.filter((s) => s.isGachaReward));
    } catch {
      const parsed = JSON.parse(user.unlockedEmojis || "[]");
      setUnlockedEmojis(parsed);
    }
  }, [user]);

  useEffect(() => {
    loadUserEmojis();
  }, [loadUserEmojis]);

  // Nhận thông báo từ server (vd: bị lọc emoji xịn chưa sở hữu)
  useEffect(() => {
    const unsub = socketSubscribe((msg) => {
      if (msg.type === "chat_notice") {
        setNotice(msg.payload?.message || "");
        if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = setTimeout(() => setNotice(""), 4000);
      }
    });
    return unsub;
  }, []);

  // 1. Tự động chuyển sang trong suốt 70% (opacity 30%) sau 30s không tương tác
  const resetActivity = useCallback(() => {
    setIdleDimmed(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setIdleDimmed(true);
    }, 30000);
  }, []);

  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    const handleEvent = () => resetActivity();
    events.forEach((evt) => window.addEventListener(evt, handleEvent, { passive: true }));
    resetActivity();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach((evt) => window.removeEventListener(evt, handleEvent));
    };
  }, [resetActivity]);

  // 2. Thẻ preview mini chỉ hiện 6s khi có tin nhắn mới ở trạng thái thu gọn rồi tự ẩn
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current && collapsed) {
      setPreviewVisible(true);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(() => {
        setPreviewVisible(false);
      }, 6000);
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length, collapsed]);

  // Auto-scroll: chỉ kéo xuống khi người dùng đang ở gần đáy, khi tin mới là
  // của chính mình, hoặc khi vừa mở chat — để việc kéo lên đọc tin cũ không bị giật.
  const prevCollapsedRef = useRef(collapsed);
  useEffect(() => {
    const el = chatBodyRef.current;
    if (!el) return;
    const justOpened = prevCollapsedRef.current && !collapsed;
    prevCollapsedRef.current = collapsed;
    const last = messages[messages.length - 1];
    const isMine = !!last && last.userId === user?.id;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (justOpened || isMine || nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, collapsed, user?.id]);

  // Xóa badge chưa đọc khi mở khung chat
  useEffect(() => {
    if (!collapsed) {
      markRead();
    }
  }, [collapsed, markRead, messages.length]);

  // ESC đóng lightbox xem ảnh
  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

  // Tin nhắn gần nhất
  const lastMessage = messages[messages.length - 1];

  const lastMessagePreview = lastMessage
    ? lastMessage.isImage || lastMessage.imageUrl
      ? "📷 Đã gửi một ảnh"
      : lastMessage.isSticker || lastMessage.stickerUrl
        ? "🎨 Sticker"
        : lastMessage.text
    : "";

  const handleOpen = () => {
    setCollapsed(false);
    setPreviewVisible(false);
    markRead();
    resetActivity();
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text && pendingImages.length === 0) return;
    if (uploadingImage) return;
    if (text) {
      send(text);
      setInput("");
    }
    if (pendingImages.length > 0) {
      setUploadingImage(true);
      const toSend = pendingImages;
      setPendingImages([]);
      try {
        for (const p of toSend) {
          const form = new FormData();
          form.append("file", p.file);
          const res = await api.post("/upload/chat-image", form, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          const fileUrl = res.data?.fileUrl as string | undefined;
          if (!fileUrl) throw new Error("missing url");
          send(undefined, undefined, fileUrl);
          URL.revokeObjectURL(p.url);
        }
      } catch (err: any) {
        showNotice(err?.response?.data?.error || "Không gửi được ảnh. Thử lại sau.");
      } finally {
        setUploadingImage(false);
      }
    }
    resetActivity();
  };

  const handleQuickSend = (text: string) => {
    send(text);
    resetActivity();
  };

  const handleSendSticker = (sticker: ChatSticker) => {
    send(undefined, sticker.imageUrl);
    setShowEmojiPicker(false);
    resetActivity();
  };

  const examActive = () => {
    try {
      return sessionStorage.getItem("cc-exam-active") === "1";
    } catch {
      return false;
    }
  };

  const handlePickImage = () => {
    if (uploadingImage) return;
    if (examActive()) {
      alert("Đang trong giờ thi — không thể gửi ảnh.");
      return;
    }
    // Dialog chọn file làm window mất focus — báo anti-cheat miễn trừ tim cho lần này.
    window.dispatchEvent(new CustomEvent("cc-native-dialog"));
    imageInputRef.current?.click();
  };

  const handleImageSelected = (e: { target: HTMLInputElement }) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length) stageFiles(files);
  };

  return (
    <>
      {/* 1. COMPACT BOTTOM-RIGHT CHAT LAUNCHER PILL */}
      <AnimatePresence>
        {collapsed && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className={`fixed right-3 z-[9998] flex items-center gap-2 transition-opacity duration-300 ${
              isIdeRoute ? "bottom-8" : "bottom-3.5"
            } ${idleDimmed ? "opacity-45 hover:opacity-100" : "opacity-100"}`}
          >
            {/* Preview tin nhắn mới */}
            <AnimatePresence>
              {lastMessage && previewVisible && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, x: 10, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 10, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  onClick={handleOpen}
                  className="flex max-w-[205px] items-center gap-2 rounded-full border border-border bg-card/95 px-2.5 py-1 shadow-lg backdrop-blur-md transition-colors hover:border-primary/40 dark:bg-[#161922]/95"
                  title="Mở hộp thoại chat"
                >
                  <div
                    className="relative grid size-5 shrink-0 place-items-center overflow-hidden rounded-full text-[9px] font-bold text-white"
                    style={{ backgroundColor: getAvatarBgColor(lastMessage.fullName) }}
                  >
                    <img
                      src={lastMessage.avatarUrl || getAnimalAvatarUrl(lastMessage.fullName)}
                      alt={lastMessage.fullName}
                      className="relative z-10 size-full rounded-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className="absolute inset-0 z-0 flex items-center justify-center">
                      {lastMessage.fullName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-col text-left">
                    <span className="truncate text-[10px] font-semibold text-primary">
                      {lastMessage.fullName}
                    </span>
                    <span className="truncate text-[11px] text-foreground">
                      {lastMessagePreview}
                    </span>
                  </div>
                </motion.button>
              )}
            </AnimatePresence>

            <button
              type="button"
              onClick={handleOpen}
              className="relative inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card/95 px-2.5 text-xs font-medium text-foreground shadow-md backdrop-blur-md transition-all hover:border-primary/40 hover:shadow-lg dark:bg-[#161922]/95"
              title="Mở Live Chat"
              aria-label="Mở Live Chat"
            >
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <MessageCircle className="size-3.5 text-primary" />
              <span>Chat</span>
              {unread > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 font-mono text-[9px] font-bold text-destructive-foreground">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. KHUNG CHAT COMPACT (SPRING POPUP FROM BOTTOM-RIGHT) */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 10 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            style={{ transformOrigin: "bottom right" }}
            className={`fixed right-3 z-[9998] flex h-[350px] max-h-[calc(100vh-48px)] w-[295px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#121216]/95 text-[#f5f5f7] shadow-2xl backdrop-blur-2xl transition-opacity duration-300 ${
              isIdeRoute ? "bottom-8" : "bottom-3.5"
            } ${idleDimmed ? "opacity-45 hover:opacity-100" : "opacity-100"}`}
          >
        {/* Header */}
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/10 px-3 select-none">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold tracking-tight">Live Chat</span>
            <span className="rounded bg-[#30D158]/15 px-1.5 py-0.2 text-[8.5px] font-bold text-[#30D158]">
              LIVE
            </span>
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="grid h-6 w-6 place-items-center rounded text-[#86868b] hover:bg-white/10 hover:text-white"
            title="Thu gọn"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {/* Thông báo từ server (emoji xịn bị lọc) */}
        {notice && (
          <div className="flex items-start gap-1.5 border-b border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-amber-300 animate-[fadeIn_0.3s]">
            <Info className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
            <span>{notice}</span>
          </div>
        )}

        {/* Chat Feed */}
        <div ref={chatBodyRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-2 text-xs">
          {messages.length === 0 ? (
            <p className="my-auto text-center text-[11px] text-[#86868b]">
              Chưa có tin nhắn. Hãy bắt đầu trò chuyện!
            </p>
          ) : (
            messages.map((m, idx) => {
              const isMe = m.userId === user?.id;
              const heartsList = Array.isArray(m.hearts) ? m.hearts : [];
              const heartCount = heartsList.length;
              const hasHearted = user?.id ? heartsList.includes(user.id) : false;
              const avatarSrc = m.avatarUrl || getAnimalAvatarUrl(m.fullName);
              const avatarBg = getAvatarBgColor(m.fullName);
              const aura = !m.isSticker && m.text ? getAuraForText(m.text) : "";

              return (
                <div
                  key={m.id || idx}
                  className={`group relative flex items-start gap-1.5 ${
                    isMe ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  {/* Animal Avatar Icon */}
                  <div
                    className="relative grid h-6 w-6 shrink-0 overflow-hidden place-items-center rounded-full text-[10px] font-bold text-white shadow-sm"
                    style={{ backgroundColor: avatarBg }}
                  >
                    <img
                      src={avatarSrc}
                      alt={m.fullName}
                      className="relative z-10 size-full rounded-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className="absolute inset-0 z-0 flex items-center justify-center font-bold text-[9px]">
                      {m.fullName.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  <div className={`flex max-w-[82%] flex-col ${isMe ? "items-end" : "items-start"}`}>
                    <span className="text-[9.5px] font-semibold text-[#86868b] px-1 mb-0.5">
                      {isMe ? "Bạn" : m.fullName}
                    </span>

                    <div className="relative group/bubble">
                      {m.isImage || m.imageUrl ? (
                        <button
                          type="button"
                          onClick={() => m.imageUrl && setLightboxUrl(m.imageUrl)}
                          className={`block overflow-hidden rounded-xl border border-white/10 bg-black/30 shadow-sm transition hover:ring-2 hover:ring-[#0A84FF]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] ${
                            isMe ? "rounded-tr-sm" : "rounded-tl-sm"
                          }`}
                          title="Xem ảnh lớn"
                        >
                          <img
                            src={m.imageUrl || ""}
                            alt={m.text || "Ảnh chat"}
                            className="max-h-40 max-w-[200px] object-cover"
                            loading="lazy"
                          />
                          {m.text ? (
                            <div className="border-t border-white/10 px-2 py-1 text-left text-[10px] text-[#f5f5f7]/90">
                              {m.text}
                            </div>
                          ) : null}
                        </button>
                      ) : m.isSticker || m.stickerUrl ? (
                        /* ── Tin nhắn Sticker: hiển thị hình/emoji to + bounce ── */
                        <div className={`flex items-center justify-center w-24 h-24 ${isMe ? "justify-end" : "justify-start"}`}>
                          {m.stickerUrl && (m.stickerUrl.startsWith("/") || m.stickerUrl.startsWith("http")) ? (
                            <img
                              src={m.stickerUrl}
                              alt="sticker"
                              className="w-24 h-24 object-contain drop-shadow-lg animate-[stickerPop_0.35s_cubic-bezier(0.16,1,0.3,1)] selection:hidden"
                            />
                          ) : (
                            <span className="text-6xl drop-shadow-xl animate-[stickerPop_0.35s_cubic-bezier(0.16,1,0.3,1)]">
                              {m.stickerUrl}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div
                          className={`relative rounded-2xl px-2.5 py-1 text-[11.5px] leading-snug break-words shadow-sm ${
                            isMe
                              ? "rounded-tr-none bg-[#0A84FF] text-white font-normal"
                              : "rounded-tl-none border border-white/10 bg-white/10 text-[#f5f5f7]"
                          } ${aura}`}
                        >
                          {m.text}
                        </div>
                      )}

                      {/* Reaction: hover để thả tim (kiểu Messenger); badge hiện ai đã thả */}
                      {heartCount === 0 ? (
                        <button
                          onClick={() => toggleHeart(m.id)}
                          className={`absolute -top-2 ${
                            isMe ? "-left-3" : "-right-3"
                          } grid h-5 w-5 place-items-center rounded-full border border-white/10 bg-[#1e1e24]/95 text-[9px] opacity-0 shadow-md backdrop-blur-md transition hover:scale-110 group-hover/bubble:opacity-100 focus-visible:opacity-100`}
                          title="Thả tim"
                        >
                          ❤️
                        </button>
                      ) : (
                        <div
                          className={`absolute -bottom-2 ${isMe ? "-left-2" : "-right-2"}`}
                          onMouseEnter={() => setHoverReact(m.id)}
                          onMouseLeave={() => setHoverReact(null)}
                        >
                          <button
                            onClick={() => setPinnedReact((prev) => (prev === m.id ? null : m.id))}
                            className={`flex items-center gap-0.5 rounded-full border px-1 py-0.2 text-[8px] shadow-md backdrop-blur-md transition hover:scale-105 ${
                              hasHearted
                                ? "border-[#ff453a]/40 bg-[#ff453a]/25 text-[#ff453a]"
                                : "border-white/10 bg-[#1e1e24]/90 text-[#f5f5f7]"
                            }`}
                            title="Xem ai đã thả tim"
                          >
                            <span>❤️</span>
                            <span className="font-mono font-bold">{heartCount}</span>
                          </button>
                          {(hoverReact === m.id || pinnedReact === m.id) && (
                            <div
                              className={`absolute bottom-full z-30 mb-1 w-40 rounded-lg border border-white/15 bg-[#1a1a22] p-1.5 shadow-2xl backdrop-blur-xl ${
                                isMe ? "right-0" : "left-0"
                              }`}
                            >
                              <div className="max-h-24 space-y-0.5 overflow-y-auto no-scrollbar">
                                {(m.heartUsers && m.heartUsers.length > 0
                                  ? m.heartUsers.map((u) => u.fullName)
                                  : Array.from({ length: heartCount }, () => "Một bạn")
                                ).map((name, i) => (
                                  <p key={i} className="truncate text-[9px] text-[#f5f5f7]/90">
                                    ❤️ {name}
                                  </p>
                                ))}
                              </div>
                              <button
                                onClick={() => {
                                  toggleHeart(m.id);
                                  setPinnedReact(null);
                                }}
                                className="mt-1 w-full rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[9px] font-semibold text-[#f5f5f7] hover:bg-white/15"
                              >
                                {hasHearted ? "Bỏ tim" : "Thả tim"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Quick Action Chips */}
        <div className="flex shrink-0 gap-1 overflow-x-auto px-2 pb-1.5 no-scrollbar">
          {["👋 Chào lớp", "📚 Học thôi", "💡 Cần giúp?", "🙌 Cảm ơn"].map((chip) => (
            <button
              key={chip}
              onClick={() => handleQuickSend(chip)}
              className="shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9.5px] font-medium text-[#f5f5f7] transition-colors hover:bg-white/15"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Emoji / Sticker Picker Popover */}
        <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-12 left-2 right-2 z-50 rounded-xl border border-white/15 bg-[#1a1a22] p-2.5 shadow-2xl backdrop-blur-2xl max-h-[240px] overflow-y-auto no-scrollbar"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-2">
              {/* Tabs Emoji / Sticker */}
              <div className="flex gap-1">
                <button
                  onClick={() => setEmojiTab("emoji")}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                    emojiTab === "emoji" ? "bg-amber-500 text-black" : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  Emoji
                </button>
                <button
                  onClick={() => setEmojiTab("sticker")}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                    emojiTab === "sticker" ? "bg-amber-500 text-black" : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  Sticker
                </button>
              </div>
              <span className="text-[9px] text-amber-400 font-bold">Mở khóa từ Gói Thẻ ✦</span>
            </div>

            {/* ── Tab EMOJI ── */}
            {emojiTab === "emoji" && (
              <>
                <div className="mb-2">
                  <div className="text-[9px] font-semibold text-slate-400 mb-1">Cơ bản</div>
                  <div className="grid grid-cols-6 gap-1">
                    {BASE_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => {
                          setInput((prev) => prev + emoji);
                          setShowEmojiPicker(false);
                          resetActivity();
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-base hover:bg-white/10 active:scale-95 transition-all"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[9px] font-semibold text-slate-400 mb-1">Độc quyền Gacha ({unlockedEmojis.length}/{SPECIAL_GACHA_EMOJIS.length})</div>
                  <div className="grid grid-cols-4 gap-1">
                    {SPECIAL_GACHA_EMOJIS.map((item) => {
                      const isUnlocked = unlockedEmojis.includes(item.code);
                      return (
                        <button
                          key={item.code}
                          disabled={!isUnlocked}
                          onClick={() => {
                            if (!isUnlocked) return;
                            setInput((prev) => prev + item.code);
                            setShowEmojiPicker(false);
                            resetActivity();
                          }}
                          title={isUnlocked ? item.name : `${item.name} (Khóa - Mở từ Gacha)`}
                          className={`relative flex h-8 items-center justify-center rounded-lg border text-base transition-all ${
                            isUnlocked
                              ? "border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 shadow-sm"
                              : "border-white/5 bg-black/40 opacity-40 cursor-not-allowed"
                          }`}
                        >
                          <span>{item.code}</span>
                          {!isUnlocked && (
                            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/90 border border-white/20">
                              <Lock className="h-2 w-2 text-slate-400" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ── Tab STICKER ── */}
            {emojiTab === "sticker" && (
              <div>
                <div className="text-[9px] font-semibold text-slate-400 mb-1">
                  Meme Sticker ({stickers.filter((s) => s.unlocked).length}/{stickers.length})
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {stickers.map((st) => {
                    const isUnlocked = st.unlocked;
                    const isImage = st.imageUrl.startsWith("/") || st.imageUrl.startsWith("http");
                    return (
                      <button
                        key={st.id}
                        disabled={!isUnlocked}
                        onClick={() => {
                          if (!isUnlocked) return;
                          handleSendSticker(st);
                        }}
                        title={isUnlocked ? st.name : `${st.name} (Khóa - Mở từ Gói Thẻ)`}
                        className={`relative flex h-14 items-center justify-center rounded-xl border transition-all ${
                          isUnlocked
                            ? "border-amber-400/40 bg-white/5 hover:bg-amber-500/15 active:scale-95 shadow-sm"
                            : "border-white/5 bg-black/40 opacity-35 cursor-not-allowed"
                        }`}
                      >
                        {isImage ? (
                          <img src={st.imageUrl} alt={st.name} className="w-9 h-9 object-contain drop-shadow" />
                        ) : (
                          <span className="text-3xl drop-shadow">{st.imageUrl}</span>
                        )}
                        {!isUnlocked && (
                          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/90 border border-white/20">
                            <Lock className="h-2 w-2 text-slate-400" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {stickers.length === 0 && (
                    <div className="col-span-4 py-3 text-center text-[10px] text-slate-500">
                      Chưa có sticker nào. Quay gói thẻ để sưu tầm!
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
        </AnimatePresence>

        {/* Preview ảnh chờ gửi (paste hoặc chọn file) */}
        {pendingImages.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 border-t border-white/10 bg-white/5 px-2 py-1.5">
            {pendingImages.map((p) => (
              <div key={p.id} className="relative">
                <img
                  src={p.url}
                  alt="Ảnh chờ gửi"
                  className="h-11 w-11 rounded-lg border border-white/15 object-cover"
                />
                <button
                  onClick={() => removePending(p.id)}
                  className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-[#ff453a] text-white shadow hover:scale-110"
                  title="Bỏ ảnh này"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
            <span className="ml-auto text-[9px] font-medium text-[#86868b]">
              {pendingImages.length}/3 ảnh sẵn sàng
            </span>
          </div>
        )}

        {/* Input Bar */}
        <div className="flex shrink-0 items-center gap-1.5 border-t border-white/10 p-1.5">
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
            className="hidden"
            onChange={handleImageSelected}
          />
          <button
            type="button"
            onClick={() => {
              setShowEmojiPicker((prev) => !prev);
              resetActivity();
            }}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded text-sm transition ${
              showEmojiPicker
                ? "bg-amber-500 text-black shadow"
                : "text-slate-400 hover:bg-white/10 hover:text-white"
            }`}
            title="Chọn Emoji"
          >
            <Smile className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handlePickImage}
            disabled={uploadingImage}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded text-sm transition ${
              uploadingImage
                ? "cursor-wait text-slate-500"
                : "text-slate-400 hover:bg-white/10 hover:text-white"
            }`}
            title={uploadingImage ? "Đang tải ảnh..." : "Chọn ảnh (xem trước khi gửi)"}
          >
            <ImagePlus className="h-4 w-4" />
          </button>

          <input
            data-slot="peerchat-input"
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              resetActivity();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            onPaste={(e) => {
              const items = Array.from(e.clipboardData?.items || []);
              const files = items
                .filter((i) => i.type.startsWith("image/"))
                .map((i) => i.getAsFile())
                .filter((f): f is File => !!f);
              if (files.length > 0 && !examActive()) {
                e.preventDefault();
                stageFiles(files);
              }
            }}
            placeholder={uploadingImage ? "Đang gửi ảnh..." : "Nhắn tin... (Ctrl+V dán ảnh)"}
            disabled={uploadingImage}
            className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-[#f5f5f7] outline-none placeholder:text-[#55555d] focus:border-[#0A84FF] focus:bg-white/10 disabled:opacity-60"
          />
          <button
            onClick={handleSend}
            disabled={uploadingImage}
            className="grid h-6 w-6 shrink-0 place-items-center rounded bg-[#0A84FF] text-white transition hover:bg-[#0071e3] active:scale-95 disabled:opacity-50"
            title="Gửi"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox xem ảnh giữa màn hình */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh"
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            title="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Ảnh chat phóng to"
            className="max-h-[90vh] max-w-[min(960px,94vw)] rounded-xl object-contain shadow-2xl ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}