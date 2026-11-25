import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuthContext } from "../../contexts/AuthContext";
import api from "../../lib/api";
import StudentAvatar from "../../components/ui/StudentAvatar";
import { useChatLive } from "../../hooks/useChatUnread";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Separator } from "../../components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";
import {
  Send,
  Ticket,
  MessageCircle,
  X,
  Tags,
  Trash2,
  UserCheck,
  AlertCircle,
  Clock,
  CheckCircle2,
  Flag,
  Hash,
  Loader2,
  Sparkles,
  ArrowDown,
  Plus,
} from "lucide-react";

interface HelpRequest {
  id: string;
  type: string;
  title: string | null;
  description: string;
  status: string;
  priority: string;
  tags: string[];
  viewCount: number;
  replyCount: number;
  createdById: string;
  claimedById: string | null;
  problemId: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string; avatarUrl: string | null; role: string };
  claimedBy: { id: string; fullName: string; avatarUrl: string | null; role?: string } | null;
  problem: { id: string; title: string } | null;
}

function fmtTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateLabel(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hôm nay";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Hôm qua";
  return d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });
}

const statusCfg: Record<string, { label: string; className: string }> = {
  open: { label: "Đang mở", className: "border-red-200/60 bg-red-500/10 text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400" },
  in_progress: { label: "Đang xử lý", className: "border-blue-200/60 bg-primary/10 text-blue-600 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-400" },
  resolved: { label: "Đã xong", className: "border-emerald-200/60 bg-emerald-500/10 text-emerald-600 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400" },
  closed: { label: "Đã đóng", className: "border-border bg-muted text-muted-foreground" },
};

export default function ChatPage() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketTags, setTicketTags] = useState<string[]>([]);
  const [ticketPriority, setTicketPriority] = useState("medium");
  const [tagInput, setTagInput] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const typeParam = filter === "all" ? undefined : filter;

  const { data: items = [], isLoading } = useQuery<HelpRequest[]>({
    queryKey: ["help-requests", typeParam],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeParam) params.set("type", typeParam);
      const qs = params.toString();
      const res = await api.get(`/help-requests${qs ? `?${qs}` : ""}`);
      return res.data;
    },
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => api.post("/help-requests", { description: content, type: "chat" }),
    onSuccess: () => { setMessage(""); qc.invalidateQueries({ queryKey: ["help-requests"] }); setAutoScroll(true); setTimeout(() => inputRef.current?.focus(), 50); },
  });

  const ticketMutation = useMutation({
    mutationFn: (data: { title: string; description: string; tags: string[]; priority: string }) =>
      api.post("/help-requests", { ...data, type: "help" }),
    onSuccess: (res) => {
      setTicketOpen(false); setTicketTitle(""); setTicketDesc(""); setTicketTags([]); setTicketPriority("medium");
      qc.invalidateQueries({ queryKey: ["help-requests"] });
      navigate(`/help/${res.data.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/help-requests/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["help-requests"] }),
  });

  const scrollToBottom = useCallback(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), []);

  useEffect(() => {
    if (!autoScroll || items.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [items.length, autoScroll]);

  // ── Real-time WebSocket: refetch on new message ──
  useChatLive(() => {
    qc.invalidateQueries({ queryKey: ["help-requests"] });
    setAutoScroll(true);
  });

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setAutoScroll(nearBottom);
    setShowScrollBtn(!nearBottom);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sendMutation.isPending) return;
    sendMutation.mutate(message.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); }
  };

  const handleTicketSubmit = () => {
    if (!ticketTitle.trim() || !ticketDesc.trim()) return;
    ticketMutation.mutate({ title: ticketTitle.trim(), description: ticketDesc.trim(), tags: ticketTags, priority: ticketPriority });
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !ticketTags.includes(t)) { setTicketTags([...ticketTags, t]); setTagInput(""); }
  };

  const isOwn = (authorId: string) => authorId === user?.id;
  const isStaff = user?.role === "teacher" || user?.role === "admin" || user?.role === "teaching_assistant";

  // ── Reverse order: oldest → newest (chat convention) ──
  const ordered = [...items].reverse();

  const grouped = ordered.reduce<{ date: string; label: string; items: HelpRequest[] }[]>((acc, item) => {
    const label = fmtDateLabel(item.createdAt);
    const last = acc[acc.length - 1];
    if (last && last.label === label) last.items.push(item);
    else acc.push({ date: item.createdAt, label, items: [item] });
    return acc;
  }, []);

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden -m-4 md:-m-6">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card/50 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6 max-w-4xl mx-auto">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold tracking-tight text-foreground">Trao đổi chung</h1>
            <p className="text-[12px] text-muted-foreground">{items.length} tin nhắn · thầy cô & bạn học</p>
          </div>
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList className="h-9 bg-muted/50">
              <TabsTrigger value="all" className="text-xs px-3">Tất cả</TabsTrigger>
              <TabsTrigger value="chat" className="text-xs px-3 gap-1.5"><MessageCircle className="h-3.5 w-3.5" />Chat</TabsTrigger>
              <TabsTrigger value="help" className="text-xs px-3 gap-1.5"><Ticket className="h-3.5 w-3.5" />Ticket</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {/* Messages */}
      <main ref={listRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto">
        <div className="min-h-full px-4 py-6 sm:px-6 max-w-4xl mx-auto">
          {isLoading && items.length === 0 ? (
            <div className="space-y-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={cn("flex gap-3", i % 2 === 0 && "flex-row-reverse")}>
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className={cn("space-y-2", i % 2 === 0 && "items-end")}>
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className={cn("h-16 rounded-2xl", i % 2 === 0 ? "w-48" : "w-64")} />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 dark:bg-primary/15 mb-5">
                <Sparkles className="h-10 w-10 text-primary/60" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1.5">Chưa có tin nhắn nào</h3>
              <p className="text-sm text-muted-foreground max-w-sm">Hãy gửi lời chào đầu tiên để bắt đầu cuộc trò chuyện cùng thầy cô và bạn học!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.date}>
                  <div className="sticky top-0 z-10 mb-4 flex justify-center">
                    <span className="rounded-full bg-muted/80 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">{group.label}</span>
                  </div>
                  <div className="space-y-3">
                    {group.items.map((item) => (
                      <div key={item.id}>
                        {item.type === "help" ? (
                          /* Ticket Card */
                          <div
                            className="group cursor-pointer rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/30 dark:hover:border-primary/40"
                            onClick={() => navigate(`/help/${item.id}`)}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary">
                                <Ticket className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-bold text-foreground truncate">{item.title || "Ticket"}</span>
                                  {statusCfg[item.status] && (
                                    <Badge variant="outline" className={cn("text-[10px] gap-1", statusCfg[item.status].className)}>
                                      {statusCfg[item.status].label}
                                    </Badge>
                                  )}
                                  {item.priority === "high" && <Flag className="h-3 w-3 text-red-500" />}
                                </div>
                                <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">{item.description}</p>
                                {item.tags.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {item.tags.map((t) => (
                                      <span key={t} className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                        <Hash className="h-2.5 w-2.5" />{t}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <span className="font-semibold">{item.createdBy.fullName}</span>
                                  <span>·</span>
                                  <span>{fmtTime(item.createdAt)}</span>
                                  <span>·</span>
                                  <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{item.replyCount}</span>
                                  {item.claimedBy && (
                                    <>
                                      <span>·</span>
                                      <UserCheck className="h-3 w-3 text-blue-500" />
                                      <span className="text-blue-600 dark:text-blue-400 font-medium">{item.claimedBy.fullName}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              {isStaff && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (confirm("Xóa ticket?")) deleteMutation.mutate(item.id); }}
                                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500 dark:hover:bg-red-950/30"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* Chat Bubble */
                          <div className={cn("flex gap-2.5 group", isOwn(item.createdById) && "flex-row-reverse")}>
                            <StudentAvatar fullName={item.createdBy.fullName} avatarUrl={item.createdBy.avatarUrl} size="md" showName={false} className="shrink-0 mt-auto" />
                            <div className={cn("flex flex-col min-w-0 max-w-[75%]", isOwn(item.createdById) && "items-end")}>
                              <div className={cn("mb-1 flex items-center gap-2", isOwn(item.createdById) && "flex-row-reverse")}>
                                <span className="text-[11px] font-semibold text-foreground/70">{isOwn(item.createdById) ? "Bạn" : item.createdBy.fullName}</span>
                                <span className="text-[10px] text-muted-foreground/40">{fmtTime(item.createdAt)}</span>
                              </div>
                              <div className={cn(
                                "rounded-2xl px-3.5 py-2 text-sm leading-relaxed transition-shadow hover:shadow-sm",
                                isOwn(item.createdById)
                                  ? "rounded-br-md bg-primary text-white shadow-sm"
                                  : "rounded-bl-md border border-border/60 bg-card text-foreground"
                              )}>
                                <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_p]:m-0 [&_p+p]:mt-1.5 [&_pre]:text-xs [&_code]:text-[13px] [&_a]:text-inherit">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.description}</ReactMarkdown>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Scroll to bottom */}
        {showScrollBtn && (
          <button
            onClick={() => { setAutoScroll(true); scrollToBottom(); }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-lg transition-all hover:shadow-xl hover:bg-muted"
          >
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </main>

      {/* Input bar */}
      <footer className="shrink-0 border-t border-border bg-card/50 backdrop-blur-xl">
        <div className="px-4 py-3 sm:px-6 max-w-4xl mx-auto">
          <form onSubmit={handleSend} className="flex items-end gap-2">
            <Button type="button" variant="outline" size="icon" onClick={() => setTicketOpen(true)} className="shrink-0 h-[44px] w-[44px] rounded-2xl border-dashed">
              <Plus className="h-4 w-4" />
            </Button>
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nhập tin nhắn... (Enter = gửi)"
                rows={1}
                className="w-full resize-none rounded-2xl border border-border bg-muted/40 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-ring/30/15"
                style={{ minHeight: "44px", maxHeight: "120px" }}
                onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; }}
              />
            </div>
            <Button type="submit" size="icon" disabled={!message.trim() || sendMutation.isPending} className="shrink-0 h-[44px] w-[44px] rounded-2xl shadow-sm">
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </footer>

      {/* Create ticket dialog */}
      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent className="sm:max-w-lg gap-0 p-0 overflow-hidden">
          <div className="p-6 pb-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 dark:bg-primary/15 dark:text-primary dark:ring-primary/30">
              <Ticket className="h-6 w-6" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-center text-lg">Tạo ticket hỗ trợ</DialogTitle>
            </DialogHeader>
            <p className="mt-1.5 text-center text-[13px] text-muted-foreground">Giáo viên sẽ được thông báo và phản hồi sớm nhất</p>
          </div>
          <div className="space-y-4 px-6 pb-6">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground">Tiêu đề <span className="text-red-500">*</span></label>
              <Input value={ticketTitle} onChange={(e) => setTicketTitle(e.target.value)} placeholder="VD: Em không hiểu bài 4 chương 3" className="h-10" autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground">Mô tả <span className="text-red-500">*</span></label>
              <textarea
                value={ticketDesc}
                onChange={(e) => setTicketDesc(e.target.value)}
                placeholder="Mô tả chi tiết vấn đề..."
                rows={4}
                className="w-full resize-none rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground flex items-center gap-1.5"><Tags className="h-3.5 w-3.5" />Tags</label>
              {ticketTags.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {ticketTags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1.5 py-1 text-[11px]">{t}
                      <button onClick={() => setTicketTags(ticketTags.filter((x) => x !== t))} className="hover:text-red-500"><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="python, if-else, ..." className="h-9 text-sm" />
                <Button type="button" variant="outline" size="icon" onClick={addTag} className="h-9 w-9 shrink-0"><Hash className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground">Ưu tiên</label>
              <div className="flex rounded-xl border border-border bg-muted/30 p-1">
                {[{ value: "low", label: "Thấp" }, { value: "medium", label: "Vừa" }, { value: "high", label: "Cao" }].map((p) => (
                  <button
                    key={p.value} type="button" onClick={() => setTicketPriority(p.value)}
                    className={cn("flex-1 rounded-lg py-2 text-[13px] font-medium transition-all",
                      ticketPriority === p.value ? "bg-background text-foreground shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:text-foreground")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2.5 border-t border-border bg-muted/20 px-6 py-4">
            <Button variant="outline" onClick={() => setTicketOpen(false)} className="flex-1 sm:flex-none">Hủy</Button>
            <Button onClick={handleTicketSubmit} disabled={!ticketTitle.trim() || !ticketDesc.trim() || ticketMutation.isPending} className="flex-1 gap-2">
              {ticketMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
              {ticketMutation.isPending ? "Đang tạo..." : "Tạo ticket"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
