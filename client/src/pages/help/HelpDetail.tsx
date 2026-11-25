import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuthContext } from "../../contexts/AuthContext";
import api from "../../lib/api";
import { isStaff } from "../../lib/roles";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import StudentAvatar from "../../components/ui/StudentAvatar";
import { cn } from "../../lib/utils";
import {
  ArrowLeft,
  Send,
  Loader2,
  Star,
  UserPlus,
  Flag,
  Eye,
  MessageCircle,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Hash,
  Ticket,
  UserCheck,
} from "lucide-react";

interface HelpReply {
  id: string;
  content: string;
  isSolution: boolean;
  upvotes: number;
  createdAt: string;
  author: { id: string; fullName: string; avatarUrl: string | null; role: string };
}

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
  resolvedAt: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string; avatarUrl: string | null; role: string };
  claimedBy: { id: string; fullName: string; avatarUrl: string | null; role?: string } | null;
  problem: { id: string; title: string; difficulty: string } | null;
  replies: HelpReply[];
}

function fmtTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

const statusCfg: Record<string, { label: string; className: string; icon: typeof AlertCircle }> = {
  open: { label: "Đang mở", className: "border-red-200/60 bg-red-500/10 text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400", icon: AlertCircle },
  in_progress: { label: "Đang xử lý", className: "border-blue-200/60 bg-primary/10 text-blue-600 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-400", icon: Clock },
  resolved: { label: "Đã xong", className: "border-emerald-200/60 bg-emerald-500/10 text-emerald-600 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400", icon: CheckCircle2 },
  closed: { label: "Đã đóng", className: "border-border bg-muted text-muted-foreground", icon: CheckCircle2 },
};

export default function HelpDetail() {
  const { id } = useParams();
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [replyContent, setReplyContent] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isTeacher = isStaff(user?.role);

  const { data, isLoading } = useQuery<HelpRequest>({
    queryKey: ["help-request", id],
    queryFn: () => api.get(`/help-requests/${id}`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: 5000,
  });

  const replyMutation = useMutation({
    mutationFn: (content: string) => api.post(`/help-requests/${id}/replies`, { content }),
    onSuccess: () => { setReplyContent(""); qc.invalidateQueries({ queryKey: ["help-request", id] }); qc.invalidateQueries({ queryKey: ["help-requests"] }); },
  });

  const markSolutionMutation = useMutation({
    mutationFn: (replyId: string) => api.patch(`/help-requests/${id}/replies/${replyId}`, { isSolution: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["help-request", id] }); qc.invalidateQueries({ queryKey: ["help-requests"] }); },
  });

  const claimMutation = useMutation({
    mutationFn: () => api.patch(`/help-requests/${id}`, { claimedById: user?.id, status: "in_progress" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["help-request", id] }); qc.invalidateQueries({ queryKey: ["help-requests"] }); },
  });

  const closeMutation = useMutation({
    mutationFn: () => api.patch(`/help-requests/${id}`, { status: "closed" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["help-request", id] }); qc.invalidateQueries({ queryKey: ["help-requests"] }); },
  });

  const reopenMutation = useMutation({
    mutationFn: () => api.patch(`/help-requests/${id}`, { status: "open" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["help-request", id] }); qc.invalidateQueries({ queryKey: ["help-requests"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/help-requests/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["help-requests"] }); navigate("/help"); },
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [data?.replies.length]);

  const handleReply = () => {
    if (!replyContent.trim() || replyMutation.isPending) return;
    replyMutation.mutate(replyContent.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(); }
  };

  if (isLoading)
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  if (!data) return <div className="flex h-full items-center justify-center text-muted-foreground">Không tìm thấy yêu cầu</div>;

  const isOwn = (authorId: string) => authorId === user?.id;
  const isAuthor = data.createdById === user?.id;
  const isClaimedByMe = data.claimedById === user?.id;
  const canClose = isAuthor || isTeacher;
  const canDelete = isTeacher || (isAuthor && data.status === "open");
  const solutionReply = data.replies.find((r) => r.isSolution);
  const otherReplies = data.replies.filter((r) => !r.isSolution);
  const cfg = statusCfg[data.status] || statusCfg.open;
  const StatusIcon = cfg.icon;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden -m-4 md:-m-6">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card/50 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6 max-w-4xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate("/help")} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {data.type === "help" ? (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary">
                  <Ticket className="h-4 w-4" />
                </div>
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary">
                  <MessageCircle className="h-4 w-4" />
                </div>
              )}
              <h1 className="truncate text-sm font-bold text-foreground">{data.type === "help" ? data.title : "Tin nhắn"}</h1>
              {data.type === "help" && (
                <Badge variant="outline" className={cn("gap-1 text-[10px]", cfg.className)}>
                  <StatusIcon className="h-3 w-3" />{cfg.label}
                </Badge>
              )}
              {data.priority === "high" && <Flag className="h-3.5 w-3.5 text-red-500" />}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <StudentAvatar studentId={data.createdBy.id} fullName={data.createdBy.fullName} avatarUrl={data.createdBy.avatarUrl} size="sm" showName={false} clickable={data.createdBy.role === "student"} />
              <span className="font-medium">{data.createdBy.fullName}</span>
              <span>·</span>
              <span>{new Date(data.createdAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}</span>
              {data.type === "help" && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />{data.viewCount}</span>
                  <span>·</span>
                  <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{data.replyCount}</span>
                </>
              )}
              {data.claimedBy && (
                <>
                  <span>·</span>
                  <UserCheck className="h-3 w-3 text-blue-500" />
                  <span className="text-blue-600 dark:text-blue-400">{data.claimedBy.fullName}</span>
                </>
              )}
            </p>
          </div>

          {/* Actions */}
          {data.type === "help" && (
            <div className="flex shrink-0 items-center gap-1.5">
              {data.status === "open" && !data.claimedById && !isAuthor && (
                <Button variant="default" size="xs" onClick={() => claimMutation.mutate()} disabled={claimMutation.isPending} className="gap-1">
                  <UserPlus className="h-3 w-3" /> Nhận hỗ trợ
                </Button>
              )}
              {(canClose || isClaimedByMe) && data.status !== "closed" && (
                <Button variant="outline" size="xs" onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>Đóng</Button>
              )}
              {canClose && data.status === "closed" && (
                <Button variant="outline" size="xs" onClick={() => reopenMutation.mutate()}>Mở lại</Button>
              )}
              {canDelete && (
                <Button variant="ghost" size="icon-sm" className="text-red-500 hover:bg-red-500/10 dark:hover:bg-red-950/30" onClick={() => { if (confirm("Xóa?")) deleteMutation.mutate(); }} disabled={deleteMutation.isPending}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
        {/* Tags */}
        {data.type === "help" && data.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2 sm:px-6 max-w-4xl mx-auto">
            {data.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Hash className="h-2.5 w-2.5" />{tag}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Conversation */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 py-6 sm:px-6 max-w-4xl mx-auto">
          {/* Original message */}
          <div className={cn("flex gap-2.5", isOwn(data.createdById) && "flex-row-reverse")}>
            <StudentAvatar studentId={data.createdBy.id} fullName={data.createdBy.fullName} avatarUrl={data.createdBy.avatarUrl} size="md" showName={false} clickable={data.createdBy.role === "student"} className="shrink-0 mt-auto" />
            <div className={cn("flex flex-col min-w-0 max-w-[75%]", isOwn(data.createdById) && "items-end")}>
              <div className={cn("mb-1 flex items-center gap-2", isOwn(data.createdById) && "flex-row-reverse")}>
                <span className="text-[11px] font-semibold text-foreground/70">{isOwn(data.createdById) ? "Bạn" : data.createdBy.fullName}</span>
                <span className="text-[10px] text-muted-foreground/40">{fmtTime(data.createdAt)}</span>
              </div>
              <div className={cn(
                "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                isOwn(data.createdById)
                  ? "rounded-br-md bg-primary text-white shadow-sm"
                  : "rounded-bl-md border border-border/60 bg-card text-foreground"
              )}>
                <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_p]:m-0 [&_p+p]:mt-1.5 [&_pre]:text-xs [&_code]:text-[13px]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.description}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>

          {/* Solution banner */}
          {solutionReply && (
            <div className="mt-4 rounded-2xl border border-emerald-200/60 bg-emerald-500/10/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/100 text-white">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Giải pháp được chấp nhận</span>
              </div>
              <div className={cn("flex gap-2.5")}>
                <StudentAvatar studentId={solutionReply.author.id} fullName={solutionReply.author.fullName} avatarUrl={solutionReply.author.avatarUrl} size="sm" showName={false} clickable={solutionReply.author.role === "student"} className="shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{solutionReply.author.fullName}</span>
                    <span className="text-[10px] text-emerald-600/50">{fmtTime(solutionReply.createdAt)}</span>
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none break-words text-sm [&_p]:m-0 [&_p+p]:mt-1.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{solutionReply.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Replies as chat bubbles */}
          <div className="mt-4 space-y-3">
            {otherReplies.map((reply) => (
              <div key={reply.id} className={cn("flex gap-2.5 group", isOwn(reply.author.id) && "flex-row-reverse")}>
                <StudentAvatar studentId={reply.author.id} fullName={reply.author.fullName} avatarUrl={reply.author.avatarUrl} size="md" showName={false} clickable={reply.author.role === "student"} className="shrink-0 mt-auto" />
                <div className={cn("flex flex-col min-w-0 max-w-[75%]", isOwn(reply.author.id) && "items-end")}>
                  <div className={cn("mb-1 flex items-center gap-2", isOwn(reply.author.id) && "flex-row-reverse")}>
                    <span className="text-[11px] font-semibold text-foreground/70">{isOwn(reply.author.id) ? "Bạn" : reply.author.fullName}</span>
                    {(reply.author.role === "teacher" || reply.author.role === "admin" || reply.author.role === "teaching_assistant") && (
                      <Badge variant="outline" className="border-0 bg-primary/10 px-1.5 text-[9px] text-primary dark:bg-primary/10 dark:text-primary">
                        {reply.author.role === "admin" ? "Admin" : "GV"}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground/40">{fmtTime(reply.createdAt)}</span>
                  </div>
                  <div className={cn(
                    "rounded-2xl px-3.5 py-2 text-sm leading-relaxed transition-shadow group-hover:shadow-sm",
                    isOwn(reply.author.id)
                      ? "rounded-br-md bg-primary text-white shadow-sm"
                      : "rounded-bl-md border border-border/60 bg-card text-foreground"
                  )}>
                    <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_p]:m-0 [&_p+p]:mt-1.5 [&_pre]:text-xs [&_code]:text-[13px]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{reply.content}</ReactMarkdown>
                    </div>
                  </div>
                  {isAuthor && data.status !== "closed" && (
                    <button
                      onClick={() => markSolutionMutation.mutate(reply.id)}
                      disabled={markSolutionMutation.isPending}
                      className="mt-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-amber-500"
                    >
                      <Star className="h-3 w-3" /> Đánh dấu là giải pháp
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {otherReplies.length === 0 && !solutionReply && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
                <MessageCircle className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">Chưa có phản hồi. Hãy là người đầu tiên!</p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Reply input */}
      {(data.type === "chat" || data.status !== "closed") && (
        <footer className="shrink-0 border-t border-border bg-card/50 backdrop-blur-xl">
          <div className="px-4 py-3 sm:px-6 max-w-4xl mx-auto">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Viết phản hồi... (Enter = gửi)"
                  rows={1}
                  className="w-full resize-none rounded-2xl border border-border bg-muted/40 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-ring/30/15"
                  style={{ minHeight: "44px", maxHeight: "120px" }}
                  onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; }}
                />
              </div>
              <Button
                size="icon"
                disabled={!replyContent.trim() || replyMutation.isPending}
                onClick={handleReply}
                className="h-[44px] w-[44px] shrink-0 rounded-2xl shadow-sm"
              >
                {replyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
