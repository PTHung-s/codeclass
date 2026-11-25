import { useState, useEffect, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, X, Sparkles, FileQuestion, Code2, Wand2, CheckCheck,
  RefreshCw, Tag, ChevronDown, Trash2, AlertTriangle,
} from "lucide-react";
import api from "../../lib/api";
import { SKILL_OPTIONS } from "../../lib/skillOptions";
import { cn } from "../../lib/utils";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { useConfirmContext } from "../../hooks/useConfirm";

interface ReviewItem {
  id: string;
  type: "quiz" | "problem";
  title: string;
  content: string;
  aiSkillSuggest: string | null;
  context: string;
  details: {
    statement?: string | null;
    shortDescription?: string | null;
    sampleInput?: string | null;
    sampleOutput?: string | null;
    requirementsText?: string | null;
    testCases?: string | null;
    explanation?: string | null;
    options?: string[];
    correctIndex?: number;
  };
}

interface TagStats {
  quiz: { untagged: number; pending: number; approved: number; rejected: number };
  problem: { untagged: number; pending: number; approved: number; rejected: number };
}

function cleanPreview(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export default function SkillTagReviewPage() {
  const confirm = useConfirmContext();
  const [stats, setStats] = useState<TagStats | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "quiz" | "problem">("all");
  const [enriching, setEnriching] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
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
    const [s, i] = await Promise.all([
      api.get("/skill-tags/stats").then((r) => r.data).catch(() => null),
      api.get(`/skill-tags/pending?type=${filter === "all" ? "" : filter}&limit=30`).then((r) => r.data).catch(() => []),
    ]);
    setStats(s);
    setItems(Array.isArray(i) ? i : []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleEnrich = async () => {
    setEnriching(true);
    setMsg("Đang tạo đề xuất kỹ năng bằng AI. Danh sách sẽ tự làm mới sau khoảng 30 giây...");
    try {
      await api.post("/skill-tags/enrich");
      setTimeout(() => {
        refresh();
        setEnriching(false);
        setMsg("");
      }, 30000);
    } catch {
      setEnriching(false);
      setMsg("Không thể tạo đề xuất lúc này.");
    }
  };

  const handleApprove = async (item: ReviewItem, skillId: string) => {
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    try {
      await api.post(`/skill-tags/${item.type}/${item.id}/approve`, { skillId });
    } catch {
      setItems((prev) => [...prev, item]);
    }
    refresh();
  };

  const handleReject = async (item: ReviewItem) => {
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    try {
      await api.post(`/skill-tags/${item.type}/${item.id}/reject`);
    } catch {
      setItems((prev) => [...prev, item]);
    }
    refresh();
  };

  const handleDelete = async (item: ReviewItem) => {
    const kind = item.type === "quiz" ? "câu hỏi quiz" : "bài tập code (sẽ được lưu ở trạng thái lưu trữ)";
    const ok = await confirm({
      title: "Xóa nội dung",
      message: `Bạn có chắc muốn xóa ${kind} “${item.title}”?`,
      confirmLabel: "Xóa",
      variant: "danger",
    });
    if (!ok) return;
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    try {
      await api.delete(`/skill-tags/${item.type}/${item.id}`);
      setMsg(item.type === "problem" ? "Đã đưa bài tập vào kho lưu trữ." : "Đã xóa câu hỏi khỏi hệ thống.");
    } catch {
      setMsg("Không thể xóa nội dung. Vui lòng thử lại.");
    }
    refresh();
  };

  const handleBulkApprove = async () => {
    setBulkLoading(true);
    try {
      const r = await api.post("/skill-tags/bulk-approve");
      setMsg(`Đã duyệt ${r.data.approved} mục theo đề xuất AI.`);
      refresh();
    } catch {
      setMsg("Không thể duyệt hàng loạt lúc này.");
    } finally {
      setBulkLoading(false);
    }
  };

  const totalPending = stats ? stats.quiz.pending + stats.problem.pending : 0;
  const totalApproved = stats ? stats.quiz.approved + stats.problem.approved : 0;
  const totalUntagged = stats ? stats.quiz.untagged + stats.problem.untagged : 0;
  const totalRejected = stats ? stats.quiz.rejected + stats.problem.rejected : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            <Tag className="h-6 w-6 text-primary" /> Duyệt kỹ năng
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kiểm tra đề xuất của AI trước khi kỹ năng được dùng để đánh giá học sinh.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleEnrich} disabled={enriching} className="gap-1.5">
            {enriching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {enriching ? "Đang tạo đề xuất..." : "Chạy AI phân loại"}
          </Button>
          {totalPending > 0 && (
            <Button onClick={handleBulkApprove} disabled={bulkLoading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
              {bulkLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Duyệt đề xuất hợp lệ ({totalPending})
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Chưa phân loại" value={totalUntagged} color="text-muted-foreground" icon={<Sparkles className="h-4 w-4" />} />
          <StatCard label="Chờ giáo viên duyệt" value={totalPending} color="text-amber-600" icon={<FileQuestion className="h-4 w-4" />} highlight />
          <StatCard label="Đã duyệt" value={totalApproved} color="text-emerald-600" icon={<Check className="h-4 w-4" />} />
          <StatCard label="Đã bỏ qua" value={totalRejected} color="text-red-500" icon={<X className="h-4 w-4" />} />
        </div>
      )}

      {msg && <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary dark:border-primary/30 dark:bg-primary/15 dark:text-primary">{msg}</div>}

      <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {(["all", "quiz", "problem"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", filter === f ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {f === "all" ? "Tất cả" : f === "quiz" ? "Câu hỏi quiz" : "Bài tập code"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <Check className="mx-auto h-12 w-12 text-emerald-500" />
          <p className="mt-3 font-semibold">{totalUntagged > 0 ? "Chưa có đề xuất kỹ năng" : "Đã hoàn tất"}</p>
          <p className="text-sm text-muted-foreground">
            {totalUntagged > 0 ? `Có ${totalUntagged} mục chưa phân loại. Hãy chạy AI phân loại để bắt đầu.` : "Không còn nội dung nào cần giáo viên duyệt."}
          </p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{items.length} mục đang hiển thị</span>
            <span>Chỉ tag đã duyệt mới ảnh hưởng đến mastery</span>
          </div>
          <AnimatePresence>
            {items.map((item) => (
              <ReviewCard key={`${item.type}-${item.id}`} item={item} skillOptions={skillOptions} onApprove={(skillId) => handleApprove(item, skillId)} onReject={() => handleReject(item)} onDelete={() => handleDelete(item)} />
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

function ReviewCard({ item, skillOptions, onApprove, onReject, onDelete }: {
  item: ReviewItem;
  skillOptions: { skillId: string; shortName: string; topicName: string }[];
  onApprove: (skillId: string) => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const suggested = item.aiSkillSuggest;
  const [override, setOverride] = useState(false);
  const [picked, setPicked] = useState(suggested || skillOptions[0]?.skillId || "");
  const skillLabel = Object.fromEntries(skillOptions.map((s) => [s.skillId, s.shortName]));
  const preview = cleanPreview(item.content);

  return <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className="rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40">
    <div className="flex items-start gap-3">
      <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", item.type === "quiz" ? "bg-blue-100 text-blue-600 dark:bg-blue-950/40" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40")}>
        {item.type === "quiz" ? <FileQuestion className="h-5 w-5" /> : <Code2 className="h-5 w-5" />}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{item.type === "quiz" ? "Câu hỏi quiz" : "Bài tập code"}</Badge>
          <span className="min-w-0 truncate text-sm font-semibold">{item.title}</span>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Nội dung cần phân loại</p>
          <p className="line-clamp-3 text-sm leading-6">{preview || "Chưa có nội dung xem trước."}</p>
          {item.context && <p className="mt-2 truncate border-t pt-2 text-xs text-muted-foreground">Ngữ cảnh: {cleanPreview(item.context)}</p>}
        </div>

        <ContentDetails item={item} />

        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 dark:border-primary/30 dark:bg-primary/10">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="size-4 text-primary dark:text-primary" />
              <span className="text-xs font-bold text-primary dark:text-primary">Đề xuất của AI</span>
              <Badge className="bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary">{suggested ? skillLabel[suggested] || suggested : "Chưa có đề xuất"}</Badge>
            </div>
            <p className="mt-1 text-[11px] text-primary/80 dark:text-primary/80">Chưa ảnh hưởng đến mastery cho đến khi giáo viên duyệt.</p>
          </div>

          {!override ? <Button variant="outline" size="sm" onClick={() => setOverride(true)} className="gap-1.5"><Tag className="size-3.5" /> Chọn kỹ năng khác</Button> :
            <label className="flex items-center gap-2 text-xs text-muted-foreground">Kỹ năng xác nhận
              <select aria-label="Chọn kỹ năng xác nhận" value={picked} onChange={(e) => setPicked(e.target.value)} className="max-w-[210px] rounded-md border bg-background px-2 py-1.5 text-xs text-foreground">
                {skillOptions.map((s) => <option key={s.skillId} value={s.skillId}>{s.shortName}</option>)}
              </select>
            </label>}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-1.5">
        <Button size="sm" onClick={() => onApprove(override ? picked : suggested || picked)} disabled={!suggested && !picked} className="gap-1 bg-emerald-600 hover:bg-emerald-700"><Check className="h-4 w-4" /><span className="hidden sm:inline">Duyệt tag</span></Button>
        <Button size="sm" variant="outline" onClick={onReject} className="gap-1 text-muted-foreground" title="Bỏ qua và không dùng nội dung này làm evidence"><X className="h-4 w-4" /><span className="hidden sm:inline">Bỏ qua</span></Button>
        <Button size="sm" variant="outline" onClick={onDelete} className="gap-1 border-red-200 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950/40" title="Xóa nội dung khỏi hệ thống"><Trash2 className="h-4 w-4" /><span className="hidden sm:inline">Xóa</span></Button>
      </div>
    </div>
  </motion.div>;
}

function ContentDetails({ item }: { item: ReviewItem }) {
  const [open, setOpen] = useState(false);
  const details = item.details || {};
  const hasDetails = item.type === "quiz"
    ? Boolean(details.options?.length || details.explanation)
    : Boolean(details.statement || details.sampleInput || details.sampleOutput || details.requirementsText || details.testCases);

  if (!hasDetails) {
    return <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-500/10 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><AlertTriangle className="size-4 shrink-0" /> Nội dung này đang thiếu dữ liệu chi tiết để kiểm tra.</div>;
  }

  return <div className="rounded-lg border bg-background">
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-semibold hover:bg-muted/50">
      <span>{open ? "Thu gọn nội dung đầy đủ" : item.type === "quiz" ? "Xem câu hỏi và đáp án đầy đủ" : "Xem toàn bộ đề bài và dữ liệu chấm"}</span>
      <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
    </button>
    {open && <div className="space-y-3 border-t p-3 text-sm">
      {item.type === "quiz" ? <QuizDetails details={details} /> : <ProblemDetails details={details} />}
    </div>}
  </div>;
}

function QuizDetails({ details }: { details: ReviewItem["details"] }) {
  return <>
    <DetailBlock label="Các đáp án">
      <ol className="list-[upper-alpha] space-y-1 pl-5">
        {(details.options || []).map((option, index) => <li key={`${index}-${option}`} className={cn(index === details.correctIndex && "font-semibold text-emerald-700 dark:text-emerald-300")}>{option}{index === details.correctIndex && " — Đáp án đúng"}</li>)}
      </ol>
    </DetailBlock>
    {details.explanation && <DetailBlock label="Giải thích đáp án"><RichText value={details.explanation} /></DetailBlock>}
  </>;
}

function ProblemDetails({ details }: { details: ReviewItem["details"] }) {
  return <>
    {details.statement && <DetailBlock label="Đề bài"><RichText value={details.statement} /></DetailBlock>}
    {details.requirementsText && <DetailBlock label="Ràng buộc"><RichText value={details.requirementsText} /></DetailBlock>}
    {(details.sampleInput || details.sampleOutput) && <div className="grid gap-3 md:grid-cols-2"><CodeBlock label="Sample input" value={details.sampleInput} /><CodeBlock label="Sample output" value={details.sampleOutput} /></div>}
    {details.testCases && <DetailBlock label="Testcase"><CodeBlock value={details.testCases} /></DetailBlock>}
  </>;
}

function DetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return <section><h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</h4><div className="leading-6">{children}</div></section>;
}

function CodeBlock({ label, value }: { label?: string; value?: string | null }) {
  if (!value) return null;
  return <div>{label && <p className="mb-1 text-xs font-semibold text-muted-foreground">{label}</p>}<pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-xs text-slate-100">{value}</pre></div>;
}

function RichText({ value }: { value: string }) {
  return <div className="whitespace-pre-wrap">{cleanPreview(value)}</div>;
}
