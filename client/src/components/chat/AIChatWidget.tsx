import { useState, useRef, useEffect } from "react";
import api from "../../lib/api";
import { usePageContext } from "../../hooks/usePageContext";
import { useTextSelection } from "../../hooks/useTextSelection";
import { MessageCircle, X, Minimize2, Maximize2, Send, Sparkles, Pin, MousePointerClick } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { SyntaxHighlighter, oneDark } from "../ui/CodeHighlighter";
import "katex/dist/katex.min.css";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** Lesson id from the current URL, so the AI knows which lesson's skill the
 *  student is on. Matches /lessons/:id and /session-course/course/:c/lesson/:id. */
function currentLessonId(): string | undefined {
  const path = window.location.pathname;
  const m = path.match(/\/lessons\/([^/]+)/) || path.match(/\/lesson\/([^/]+)/);
  return m?.[1];
}

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pinnedText, setPinnedText] = useState<string | null>(null);
  const [selectionChatEnabled, setSelectionChatEnabled] = useState(() => {
    return localStorage.getItem("codeclass_selection_chat") === "true";
  });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pageContextSent = useRef(false);
  const prevSelectionRef = useRef("");

  const { getPageContext } = usePageContext();
  const { selection, clearSelection } = useTextSelection();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, pinnedText]);

  useEffect(() => {
    if (selection && selection.text && selection.text !== prevSelectionRef.current) {
      prevSelectionRef.current = selection.text;
      if (selectionChatEnabled) {
        setPinnedText(selection.text);
        setOpen(true);
        setMinimized(false);
      }
    }
    if (selection) {
      clearSelection();
    }
  }, [selection]);

  const sendToAI = async (msgs: Message[], isNewContext: boolean) => {
    setLoading(true);
    try {
      let pageContext: string | undefined;
      if (isNewContext && !pageContextSent.current) {
        const ctx = getPageContext();
        if (ctx?.isNew) {
          pageContext = ctx.context;
          pageContextSent.current = true;
        }
      }

      const formatted = msgs.map((m) => ({ role: m.role, content: m.content }));

      const res = await api.post("/ai/chat", {
        messages: formatted,
        pageContext,
        lessonId: currentLessonId(),
      });

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.data.reply,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Xin lỗi, có lỗi xảy ra. Em thử lại nhé!",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    if ((!input.trim() && !pinnedText) || loading) return;

    let fullContent: string;

    if (pinnedText && input.trim()) {
      fullContent = `[Đoạn được chọn]: ${pinnedText}\n\nCâu hỏi: ${input.trim()}`;
    } else if (pinnedText) {
      fullContent = `Giải thích đoạn này giúp tôi:\n[Đoạn được chọn]: ${pinnedText}`;
    } else {
      fullContent = input.trim();
    }

    const msg: Message = { id: crypto.randomUUID(), role: "user", content: fullContent };
    const updated = [...messages, msg];
    setMessages(updated);
    setInput("");
    setPinnedText(null);
    prevSelectionRef.current = "";
    sendToAI(updated, !pageContextSent.current);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearPinned = () => {
    setPinnedText(null);
    prevSelectionRef.current = "";
  };

  const handleOpen = () => {
    setOpen(true);
    setMinimized(false);
    pageContextSent.current = false;
  };

  const handleClose = () => {
    setOpen(false);
    setMinimized(false);
  };

  const handleMinimize = () => {
    setMinimized(!minimized);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-drag-handle]")) {
      setDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y,
      };
    }
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = dragStart.current.x - e.clientX;
      const dy = dragStart.current.y - e.clientY;
      setPosition({
        x: dragStart.current.posX - dx,
        y: dragStart.current.posY - dy,
      });
    };
    const handleMouseUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  const chatStyle: React.CSSProperties = open
    ? {
        position: "fixed",
        right: position.x ? `${position.x}px` : "24px",
        bottom: position.y ? `${position.y}px` : "24px",
        zIndex: 9999,
      }
    : {};

  const pinnedPreview = pinnedText
    ? pinnedText.length > 120
      ? pinnedText.slice(0, 120) + "..."
      : pinnedText
    : "";

  return (
    <>
      {!open && (
        <button
          onClick={handleOpen}
          data-chat-ignore
          className="fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
          title="Trợ lý học tập AI"
        >
          <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white animate-pulse" />
        </button>
      )}

      {open && (
        <div
          data-chat-ignore
          style={chatStyle}
          className={`bg-white border border-gray-200 shadow-2xl flex flex-col transition-all duration-200 ${minimized ? "w-72 h-12 rounded-lg" : "w-[420px] h-[560px] rounded-2xl"}`}
        >
          <div
            data-drag-handle
            onMouseDown={handleMouseDown}
            className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-brand-50 shrink-0 select-none ${minimized ? "rounded-lg" : "rounded-t-2xl"} ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-brand-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Trợ lý học tập</p>
                {!minimized && <p className="text-xs text-gray-400">Hỏi tôi bất cứ điều gì về Python!</p>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const next = !selectionChatEnabled;
                  setSelectionChatEnabled(next);
                  localStorage.setItem("codeclass_selection_chat", String(next));
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  selectionChatEnabled
                    ? "bg-brand-100 text-brand-600 hover:bg-brand-200"
                    : "hover:bg-white/80 text-gray-400 hover:text-gray-600"
                }`}
                title={selectionChatEnabled ? "Bôi đen để hỏi AI: BẬT" : "Bôi đen để hỏi AI: TẮT"}
              >
                <MousePointerClick className="w-4 h-4" />
              </button>
              <button
                onClick={handleMinimize}
                className="p-1.5 rounded-lg hover:bg-white/80 text-gray-400 hover:text-gray-600 transition-colors"
                title={minimized ? "Mở rộng" : "Thu nhỏ"}
              >
                {minimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg hover:bg-white/80 text-gray-400 hover:text-gray-600 transition-colors"
                title="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              <div className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50">
                {messages.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <Sparkles className="w-10 h-10 text-brand-300 mb-3" />
                    <p className="text-sm font-medium text-gray-600 mb-1">Chào em! Tôi là trợ lý học tập AI</p>
                    <p className="text-xs text-gray-400 mb-3">Hỏi tôi về Python, bài tập, hoặc bôi đen nội dung trên trang để tôi giải thích nhé!</p>
                    <div className="grid grid-cols-1 gap-1.5 w-full">
                      {[
                        "Giải thích vòng lặp for là gì?",
                        "Sự khác nhau giữa list và tuple?",
                        "Làm sao để debug code Python?",
                      ].map((s, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setInput(s);
                            inputRef.current?.focus();
                          }}
                          className="text-left text-xs text-gray-500 bg-white hover:bg-brand-50 hover:text-brand-700 border border-gray-200 rounded-lg px-3 py-2 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-brand-600 text-white rounded-br-md"
                          : "bg-white border border-gray-200 text-gray-700 rounded-bl-md shadow-sm"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-strong:text-gray-900 prose-code:text-brand-600 prose-code:bg-brand-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-a:text-brand-600 prose-li:text-gray-700 prose-blockquote:border-l-brand-400 prose-blockquote:text-gray-600">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                              code({ node, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || "");
                                const inline = !match;
                                return !inline ? (
                                  <SyntaxHighlighter
                                    style={oneDark}
                                    language={match[1]}
                                    PreTag="div"
                                    customStyle={{ margin: 0, borderRadius: "0.5rem", fontSize: "0.75rem" }}
                                  >
                                    {String(children).replace(/\n$/, "")}
                                  </SyntaxHighlighter>
                                ) : (
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                );
                              },
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-gray-100 bg-white shrink-0">
                {pinnedText && (
                  <div className="mx-3 mt-2 px-3 py-2 bg-brand-50 border border-brand-200 rounded-xl flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2">
                    <Pin className="w-3.5 h-3.5 text-brand-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-brand-800 flex-1 line-clamp-2 leading-relaxed">
                      {pinnedPreview}
                    </p>
                    <button
                      onClick={clearPinned}
                      className="p-0.5 rounded-full hover:bg-brand-100 text-brand-400 hover:text-brand-600 transition-colors shrink-0"
                      title="Bỏ ghim"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        pinnedText
                          ? "Nhập câu hỏi về đoạn đã chọn..."
                          : "Nhập câu hỏi... (Shift+Enter xuống dòng)"
                      }
                      rows={1}
                      disabled={loading}
                      className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent disabled:opacity-50 placeholder:text-gray-400 max-h-24"
                      style={{ minHeight: "40px" }}
                      onInput={(e) => {
                        const el = e.target as HTMLTextAreaElement;
                        el.style.height = "auto";
                        el.style.height = Math.min(el.scrollHeight, 96) + "px";
                      }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={loading || (!input.trim() && !pinnedText)}
                      className="p-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white transition-colors shrink-0"
                      title="Gửi"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1.5 text-center">
                    Bôi đen nội dung trên trang → ghim vào chat → gửi kèm câu hỏi
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
