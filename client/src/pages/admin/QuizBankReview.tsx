// Admin / Teacher page: quản lý và duyệt Quiz Bank.
// - Liệt kê câu hỏi theo trạng thái (draft / chờ duyệt / bị QC loại / đã duyệt)
// - Hiện phân phối trọng số kỹ năng từ AI (argmax + các khả năng khác kèm %)
// - Duyệt / bỏ qua / chạy pipeline / duyệt hàng loạt
// - Chỉ tag được duyệt (status='approved') mới ảnh hưởng mastery (xem docs/architecture/skill-assessment.md)
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, X, Sparkles, FileQuestion, Wand2, CheckCheck,
  RefreshCw, Tag, ChevronDown, AlertTriangle, Database,
} from "lucide-react";
import api from "../../lib/api";
import { SKILL_OPTIONS } from "../../lib/skillOptions";
import { cn } from "../../lib/utils";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { useConfirmContext } from "../../hooks/useConfirm";

interface BankItem {
  id: string;
  status: "draft" | "ai_pending" | "approved" | "rejected";
  stem: string;
  options: string[];
  answerIndex: number;
  explanation: string | null;
  source: string;
  sourceFile: string | null;
  sourceSkillId: string | null;
  testsSkill: string | null;
  testsSkillWeights: Record<string, number>;
  secondarySkillIds: string[];
  requiresSkills: string[];
  questionType: string | null;
  cognitiveLevel: string | null;
  difficultyAuthored: number;
  difficultyBand: string;
  qcStatus: string;
  qcIssues: string[];
  qualityScores: { accuracy: number; clarity: number; engagement: number; style: number; presentation: number };
  qualityScore: number | null;
  qcNotes: string | null;
  qcSuggestion: string | null;
  needsReview: boolean;
}

interface BankStats {
  draft: number;
  aiPending: number;
  approved: number;
  rejected: number;
  needsReview: number;
  pipelineVersion: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Chưa chạy AI",
  ai_pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Bị QC loại",
};

const QUESTION_TYPE_LABELS: Record<string, string> = {
  output_prediction: "đoán output",
  code_tracing: "trace code",
  concept_recall: "nhớ khái niệm",
  fill_blank: "điền chỗ trống",
  error_spotting: "tìm lỗi",
  best_practice: "best practice",
  api_usage: "api/hàm",
  math_evaluation: "tính biểu thức",
};

function cleanPreview(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Text ngoài code block: inline code, bold, newline → <br/> */
function textToHtml(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/`([^`\n]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-pink-600 dark:text-pink-400">$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  t = t.replace(/\n/g, "<br/>");
  return t;
}

/**
 * Render markdown-lite GIỮ NGUYÊN code block (đề bài quiz thường chứa code —
 * không được strip như cleanPreview). Code fence → <pre>, phần còn lại qua textToHtml.
 */
function renderRich(s: string): string {
  const parts: string[] = [];
  const fence = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(s)) !== null) {
    parts.push(textToHtml(s.slice(lastIndex, m.index)));
    parts.push(
      `<pre class="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[13px] leading-6 text-slate-100 dark:bg-black/60"><code>${escapeHtml(m[2].replace(/\n+$/, ""))}</code></pre>`,
    );
    lastIndex = m.index + m[0].length;
  }
  parts.push(textToHtml(s.slice(lastIndex)));
  return parts.join("");
}

export default function QuizBankReviewPage() {
  const confirm = useConfirmContext();
  const [stats, setStats] = useState<BankStats | null>(null);
  const [items, setItems] = useState<BankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"ai_pending" | "rejected" | "approved" | "draft" | "all">("ai_pending");
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [skillFilter, setSkillFilter] = useState<string>("");
  const [qcFilter, setQcFilter] = useState<"" | "pass" | "flag" | "reject">("");
  const [hasIssuesOnly, setHasIssuesOnly] = useState(false);
  const [running, setRunning] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [courseFilter, setCourseFilter] = useState<"" | "C++" | "Python" | "Tư Duy Thuật Toán">("");
  const [runLimit, setRunLimit] = useState<number>(50);
  const [msg, setMsg] = useState("");
  const [skillOptions, setSkillOptions] = useState(SKILL_OPTIONS);

  useEffect(() => {
    api.get("/skills").then((response) => {
      const options = (response.data || []).flatMap((group: {
        topicName: string;
        skills: { skillId: string; name: string }[];
      }) => group.skills.map((skill) => ({
        skillId: skill.skillId,
        shortName: skill.name.split(" — ")[0],
        topicName: group.topicName,
      })));
      if (options.length > 0) setSkillOptions(options);
    }).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (needsReviewOnly) params.set("needsReview", "1");
    if (skillFilter) params.set("skill", skillFilter);
    if (qcFilter) params.set("qc", qcFilter);
    if (hasIssuesOnly) params.set("hasIssues", "1");
    params.set("limit", "30");
    const [s, i] = await Promise.all([
      api.get("/quiz-bank/stats").then((r) => r.data).catch(() => null),
      api.get(`/quiz-bank/items?${params.toString()}`).then((r) => r.data).catch(() => []),
    ]);
    setStats(s);
    setItems(Array.isArray(i) ? i : []);
    setLoading(false);
  }, [statusFilter, needsReviewOnly, skillFilter, qcFilter, hasIssuesOnly]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleRunPipeline = async () => {
    const safeLimit = Math.max(1, Math.min(5000, Number(runLimit) || 50));
    setRunning(true);
    setMsg(courseFilter
      ? `Đang gọi LLM phân loại ${safeLimit} câu draft khóa "${courseFilter}". Trang sẽ tự làm mới sau ~45 giây...`
      : `Đang gọi LLM phân loại ${safeLimit} câu draft. Trang sẽ tự làm mới sau ~45 giây...`);
    try {
      await api.post("/quiz-bank/run-pipeline", { limit: safeLimit, sourceFilePrefix: courseFilter || undefined });
      setTimeout(() => {
        refresh();
        setRunning(false);
        setMsg("Pipeline chạy xong. Đã tải lại danh sách. (Câu đã phân loại sẽ không bị chạy lại.)");
      }, 45000);
    } catch {
      setRunning(false);
      setMsg("Không chạy được pipeline. Kiểm tra API key LLM trong .env.");
    }
  };

  const handleBulkReject = async () => {
    const label = courseFilter ? `tất cả câu chờ duyệt của khóa "${courseFilter}"` : "tất cả câu chờ duyệt";
    const ok = await confirm({
      title: "Bỏ qua hàng loạt",
      message: `Bạn có chắc muốn bỏ qua ${label}? Các câu sẽ chuyển sang trạng thái "rejected" và không dùng làm evidence mastery.`,
      confirmLabel: "Bỏ qua tất cả",
      variant: "danger",
    });
    if (!ok) return;
    setBulkLoading(true);
    try {
      const r = await api.post("/quiz-bank/bulk-reject", { sourceFilePrefix: courseFilter || undefined });
      setMsg(`Đã bỏ qua ${r.data.rejected} câu.`);
      refresh();
    } catch {
      setMsg("Không bỏ qua hàng loạt được.");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleApprove = async (item: BankItem, skillId: string) => {
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    try {
      await api.post(`/quiz-bank/items/${item.id}/approve`, { testsSkill: skillId });
      setMsg(`Đã duyệt câu "${cleanPreview(item.stem).slice(0, 40)}...".`);
    } catch {
      setItems((prev) => [...prev, item]);
      setMsg("Không duyệt được. Vui lòng thử lại.");
    }
    refresh();
  };

  const handleReject = async (item: BankItem) => {
    const ok = await confirm({
      title: "Bỏ qua câu hỏi",
      message: `Câu này sẽ được đánh dấu "rejected" và không dùng làm evidence mastery. Có thể chạy lại pipeline sau nếu muốn.`,
      confirmLabel: "Bỏ qua",
      variant: "danger",
    });
    if (!ok) return;
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    try {
      await api.post(`/quiz-bank/items/${item.id}/reject`);
    } catch {
      setItems((prev) => [...prev, item]);
    }
    refresh();
  };

  const handleBulkApprove = async () => {
    setBulkLoading(true);
    try {
      const r = await api.post("/quiz-bank/bulk-approve");
      setMsg(`Đã duyệt hàng loạt ${r.data.approved} câu (chỉ những câu có testsSkill hợp lệ).`);
      refresh();
    } catch {
      setMsg("Không duyệt hàng loạt được.");
    } finally {
      setBulkLoading(false);
    }
  };

  const totalPending = stats?.aiPending ?? 0;
  const totalNeedsReview = stats?.needsReview ?? 0;
  const totalDraft = stats?.draft ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            <Database className="h-6 w-6 text-primary" /> Quiz Bank
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý và duyệt các câu hỏi trắc nghiệm. Chỉ tag được duyệt mới ảnh hưởng đến mastery của học sinh.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value as typeof courseFilter)}
            className="rounded-md border bg-background px-2 py-1.5 text-xs"
            title="Chỉ chạy pipeline / bỏ qua cho khóa này"
          >
            <option value="">Tất cả khóa</option>
            <option value="C++">C++ Cơ Bản</option>
            <option value="Python">Python Cơ Bản</option>
            <option value="Tư Duy Thuật Toán">Tư Duy Thuật Toán</option>
          </select>
          <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-1" title="Số câu draft xử lý mỗi lượt (câu đã phân loại sẽ không chạy lại)">
            <input
              type="number"
              min={1}
              max={5000}
              value={runLimit}
              onChange={(e) => setRunLimit(Number(e.target.value))}
              className="w-16 bg-transparent text-xs tabular-nums outline-none"
              aria-label="Số câu mỗi lượt"
            />
            <span className="text-[10px] text-muted-foreground">câu</span>
          </div>
          <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
            {[50, 100, 500].map((n) => (
              <button
                key={n}
                onClick={() => setRunLimit(n)}
                className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors", runLimit === n ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setRunLimit(totalDraft || 5000)}
              className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors", runLimit === totalDraft && totalDraft > 0 ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
              title="Chạy hết queue còn lại (mọi khóa nếu chưa chọn khóa)"
            >
              Hết queue
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={handleRunPipeline} disabled={running || totalDraft === 0} className="gap-1.5">
            {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {running ? "Đang chạy..." : `Chạy pipeline${courseFilter ? ` (${courseFilter})` : ""}`}
          </Button>
          {totalPending > 0 && (
            <>
              <Button onClick={handleBulkApprove} disabled={bulkLoading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                {bulkLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                Duyệt hợp lệ ({totalPending})
              </Button>
              <Button onClick={handleBulkReject} disabled={bulkLoading} variant="outline" className="gap-1.5 border-red-200 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950/40">
                <X className="h-4 w-4" />
                Bỏ qua tất cả
              </Button>
            </>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Chưa chạy AI" value={totalDraft} color="text-muted-foreground" icon={<Sparkles className="h-4 w-4" />} />
          <StatCard label="Chờ duyệt" value={totalPending} color="text-amber-600" icon={<FileQuestion className="h-4 w-4" />} highlight />
          <StatCard label="Cần xem kỹ" value={totalNeedsReview} color="text-purple-600" icon={<AlertTriangle className="h-4 w-4" />} />
          <StatCard label="Đã duyệt" value={stats.approved} color="text-emerald-600" icon={<Check className="h-4 w-4" />} />
          <StatCard label="Bị QC loại" value={stats.rejected} color="text-red-500" icon={<X className="h-4 w-4" />} />
        </div>
      )}

      {msg && <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary dark:border-primary/30 dark:bg-primary/15 dark:text-primary">{msg}</div>}

      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-2">
        <div className="flex gap-1 rounded-md bg-background p-0.5">
          {(["ai_pending", "rejected", "approved", "draft", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", statusFilter === f ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {f === "all" ? "Tất cả" : STATUS_LABELS[f]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={needsReviewOnly} onChange={(e) => setNeedsReviewOnly(e.target.checked)} className="rounded" />
          Chỉ câu cần xem kỹ
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={hasIssuesOnly} onChange={(e) => setHasIssuesOnly(e.target.checked)} className="rounded" />
          Có issues QC
        </label>
        <select
          value={qcFilter}
          onChange={(e) => setQcFilter(e.target.value as typeof qcFilter)}
          className="rounded-md border bg-background px-2 py-1.5 text-xs"
          title="Lọc theo kết luận QC của LLM"
        >
          <option value="">Mọi kết luận QC</option>
          <option value="pass">QC: pass (ổn)</option>
          <option value="flag">QC: flag (có cảnh báo)</option>
          <option value="reject">QC: reject (nên loại)</option>
        </select>
        <select
          value={skillFilter}
          onChange={(e) => setSkillFilter(e.target.value)}
          className="ml-auto rounded-md border bg-background px-2 py-1.5 text-xs"
        >
          <option value="">Mọi kỹ năng</option>
          {skillOptions.map((s) => <option key={s.skillId} value={s.skillId}>{s.shortName}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <Check className="mx-auto h-12 w-12 text-emerald-500" />
          <p className="mt-3 font-semibold">{totalPending > 0 ? `Còn ${totalPending} câu chưa pipeline` : "Không có câu nào trong bộ lọc"}</p>
          <p className="text-sm text-muted-foreground">{totalDraft > 0 ? `Có ${totalDraft} draft — chạy pipeline để bắt đầu.` : "Thử chọn bộ lọc khác."}</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{items.length} câu đang hiển thị</span>
            <span>Pipeline: <code className="rounded bg-muted px-1 py-0.5">{stats?.pipelineVersion}</code></span>
          </div>
          <AnimatePresence>
            {items.map((item) => (
              <ReviewCard
                key={item.id}
                item={item}
                skillOptions={skillOptions}
                onApprove={(skillId) => handleApprove(item, skillId)}
                onReject={() => handleReject(item)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon, highlight }: { label: string; value: number; color: string; icon: ReactNode; highlight?: boolean }) {
  return <Card className={cn(highlight && value > 0 && "border-amber-300 dark:border-amber-800")}><CardContent className="p-3">
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{icon}{label}</div>
    <p className={cn("text-2xl font-black tabular-nums", color)}>{value}</p>
  </CardContent></Card>;
}

function ReviewCard({ item, skillOptions, onApprove, onReject }: {
  item: BankItem;
  skillOptions: { skillId: string; shortName: string; topicName: string }[];
  onApprove: (skillId: string) => void;
  onReject: () => void;
}) {
  const weights = item.testsSkillWeights || {};
  const sortedWeights = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const suggested = item.testsSkill;
  const [override, setOverride] = useState(false);
  const [picked, setPicked] = useState(suggested || skillOptions[0]?.skillId || "");
  const skillLabel = Object.fromEntries(skillOptions.map((s) => [s.skillId, s.shortName]));
  const preview = cleanPreview(item.stem);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/40">
          <FileQuestion className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("text-[10px]",
              item.status === "approved" && "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40",
              item.status === "ai_pending" && "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40",
              item.status === "rejected" && "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40",
              item.status === "draft" && "border-gray-300 bg-gray-50 text-gray-700 dark:bg-gray-900/40",
            )}>
              {STATUS_LABELS[item.status] || item.status}
            </Badge>
            <Badge variant="outline" className={cn("text-[10px]",
              item.qcStatus === "pass" && "border-emerald-300 text-emerald-700",
              item.qcStatus === "flag" && "border-amber-300 text-amber-700",
              item.qcStatus === "reject" && "border-red-300 text-red-700",
            )}>
              QC: {item.qcStatus}{item.qualityScore ? ` · ${Number(item.qualityScore).toFixed(1)}` : ""}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              Độ khó {item.difficultyAuthored}/5 · {item.difficultyBand}
            </Badge>
            {item.needsReview && (
              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-950/40 text-[10px]">
                <AlertTriangle className="mr-0.5 size-3" /> Cần xem kỹ
              </Badge>
            )}
            {item.questionType && (
              <Badge variant="outline" className="text-[10px]">
                {QUESTION_TYPE_LABELS[item.questionType] || item.questionType}
              </Badge>
            )}
            {item.cognitiveLevel && (
              <Badge variant="outline" className="text-[10px]">{item.cognitiveLevel}</Badge>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            {item.stem
              ? <div className="text-sm leading-6" dangerouslySetInnerHTML={{ __html: renderRich(item.stem) }} />
              : <p className="text-sm leading-6 text-muted-foreground">Chưa có đề bài.</p>}
          </div>

          <ContentDetails item={item} />

          {item.requiresSkills && item.requiresSkills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-bold text-amber-800 dark:text-amber-300">🎓 Phải học trước:</span>
              {item.requiresSkills.map((s) => (
                <span key={s} className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  {skillLabel[s] || s}
                </span>
              ))}
            </div>
          )}

          {item.qcIssues && item.qcIssues.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs dark:border-red-900 dark:bg-red-950/30">
              <span className="font-bold text-red-700 dark:text-red-300">🚩 QC bắt được:</span>{" "}
              <span className="text-red-600 dark:text-red-300">{item.qcIssues.join(", ")}</span>
              {item.qcNotes && <p className="mt-1 text-red-700 dark:text-red-300">{item.qcNotes}</p>}
            </div>
          )}

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 dark:border-primary/30 dark:bg-primary/10">
            <div className="flex items-center gap-2 text-xs">
              <Sparkles className="size-4 text-primary" />
              <span className="font-bold text-primary">Phân phối kỹ năng từ AI</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {sortedWeights.length === 0 ? (
                <Badge variant="outline">Chưa có phân phối</Badge>
              ) : (
                sortedWeights.map(([skillId, weight], idx) => (
                  <span key={skillId} className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold",
                    idx === 0 ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary dark:bg-primary/20",
                  )}>
                    {skillLabel[skillId] || skillId} · {(weight * 100).toFixed(0)}%
                  </span>
                ))
              )}
            </div>
            <p className="mt-2 text-[11px] text-primary/80">
              Skill được chọn (argmax): <b>{suggested ? skillLabel[suggested] || suggested : "(chưa có)"}</b> · Chưa ảnh hưởng đến mastery cho đến khi giáo viên duyệt.
            </p>
          </div>

          {item.status === "ai_pending" && (
            <div className="flex flex-wrap items-center gap-2">
              {!override ? (
                <Button variant="outline" size="sm" onClick={() => setOverride(true)} className="gap-1.5">
                  <Tag className="size-3.5" /> Chọn kỹ năng khác
                </Button>
              ) : (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Kỹ năng duyệt:
                  <select aria-label="Chọn kỹ năng duyệt" value={picked} onChange={(e) => setPicked(e.target.value)} className="max-w-[260px] rounded-md border bg-background px-2 py-1.5 text-xs text-foreground">
                    {skillOptions.map((s) => <option key={s.skillId} value={s.skillId}>{s.shortName}</option>)}
                  </select>
                </label>
              )}
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" onClick={() => onApprove(override ? picked : suggested || picked)} disabled={!suggested && !picked} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                  <Check className="h-4 w-4" /> Duyệt
                </Button>
                <Button size="sm" variant="outline" onClick={onReject} className="gap-1 text-muted-foreground">
                  <X className="h-4 w-4" /> Bỏ qua
                </Button>
              </div>
            </div>
          )}

          {item.sourceFile && (
            <p className="text-[11px] text-muted-foreground">📂 {item.sourceFile}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ContentDetails({ item }: { item: BankItem }) {
  const [open, setOpen] = useState(false);
  const hasOptions = item.options && item.options.length > 0;

  if (!hasOptions && !item.explanation) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <AlertTriangle className="size-4 shrink-0" /> Câu này thiếu dữ liệu chi tiết.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-background">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-semibold hover:bg-muted/50"
      >
        <span>{open ? "Thu gọn" : "Xem đáp án đầy đủ"}</span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t p-3 text-sm">
          {item.options && item.options.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Các đáp án</p>
              <ol className="list-[upper-alpha] space-y-1 pl-5">
                {item.options.map((option, index) => (
                  <li key={`${index}-${option}`} className={cn(index === item.answerIndex && "font-semibold text-emerald-700 dark:text-emerald-300")}>
                    <span dangerouslySetInnerHTML={{ __html: renderRich(option) }} />
                    {index === item.answerIndex && " — Đáp án đúng"}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {item.explanation && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Giải thích</p>
              <div className="text-sm leading-6" dangerouslySetInnerHTML={{ __html: renderRich(item.explanation) }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}