import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { PageHeader } from "../../components/ui/page-header";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import StudentAvatar from "../../components/ui/StudentAvatar";
import { cn } from "../../lib/utils";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Award,
  BellRing,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardList,
  Code,
  ExternalLink,
  Eye,
  FileText,
  HelpCircle,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  SquarePen,
  Target,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

type ItemType = "problem" | "quiz" | "lesson";

interface AssignmentItemDTO {
  id: string;
  itemType: ItemType;
  problemId: string | null;
  quizId: string | null;
  lessonId: string | null;
  title: string;
  difficulty: string | null;
  courseTitle: string | null;
  linkPath: string;
  passedCount?: number;
}

interface StaffAssignment {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  status: string;
  submissionType: string;
  strictDeadline: boolean;
  autoAssignNewStudents: boolean;
  rewardOnTime: boolean;
  bonusTokens: number;
  bonusXp: number;
  reminderSentAt: string | null;
  createdAt: string;
  courseId: string | null;
  problem: { id: string; title: string; difficulty: string } | null;
  course: { id: string; title: string } | null;
  createdBy: { id: string; fullName: string };
  items: AssignmentItemDTO[];
  stats: { assigned: number; done: number; passed: number; notStarted: number; late: number; locked?: number };
}

interface AssignmentDetail extends StaffAssignment {
  rows: {
    student: { id: string; fullName: string; nickname: string | null; email: string; avatarUrl: string | null };
    status: "not_started" | "attempting" | "passed";
    attempts: number;
    passed: boolean;
    completedItems: number;
    totalItems: number;
    firstAttemptAt: string | null;
    lastAttemptAt: string | null;
    completedAt: string | null;
    late: boolean;
    locked: boolean;
    rewardedAt: string | null;
    itemStatuses: {
      id: string;
      itemType: ItemType;
      title: string;
      status: "not_started" | "attempting" | "passed";
      passed: boolean;
      attempts: number;
      scoreLabel: string | null;
      isLate: boolean;
    }[];
  }[];
}

interface CatalogItem {
  id: string;
  itemType: ItemType;
  problemId?: string;
  quizId?: string;
  lessonId?: string;
  title: string;
  difficulty?: string | null;
  courseTitle?: string | null;
  lessonTitle?: string | null;
  moduleTitle?: string | null;
  questionCount?: number;
}

interface SelectedItem {
  key: string;
  itemType: ItemType;
  problemId: string | null;
  quizId: string | null;
  lessonId: string | null;
  title: string;
  difficulty?: string | null;
  subtitle?: string | null;
}

interface StudentLite {
  id: string;
  fullName: string;
  nickname: string | null;
  email: string;
  avatarUrl: string | null;
  status?: string;
}

interface StudentSubmissionsResponse {
  assignmentId: string;
  assignmentTitle: string;
  deadline: string | null;
  student: StudentLite;
  items: Array<
    AssignmentItemDTO & {
      problemSubmissions: Array<{
        id: string;
        code: string | null;
        language: string;
        answer: string | null;
        note: string | null;
        passed: boolean;
        status: string;
        totalTests: number;
        judgedTests: number;
        createdAt: string;
      }>;
      quizAttempts: Array<{
        id: string;
        score: number;
        totalQuestions: number;
        passed: boolean;
        createdAt: string;
      }>;
      lessonCompletedAt: string | null;
    }
  >;
}

function asArray<T>(data: unknown, key?: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && key) {
    const inner = (data as Record<string, unknown>)[key];
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function difficultyLabel(d?: string | null) {
  if (!d) return "";
  const map: Record<string, string> = { easy: "Dễ", medium: "Trung bình", hard: "Khó" };
  return map[d] ?? d;
}

function difficultyClass(d?: string | null) {
  switch (d) {
    case "easy":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "hard":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
}

function itemTypeLabel(type: ItemType) {
  if (type === "quiz") return "Quiz";
  if (type === "lesson") return "Bài học";
  return "Code";
}

function ItemTypeIcon({ type, className = "size-3.5" }: { type: ItemType; className?: string }) {
  if (type === "quiz") return <HelpCircle className={className} />;
  if (type === "lesson") return <FileText className={className} />;
  return <Code className={className} />;
}

function itemKey(itemType: ItemType, targetId: string) {
  return `${itemType}:${targetId}`;
}

function summarizeAssignmentItems(items: AssignmentItemDTO[]): string {
  if (!items.length) return "";
  if (items.length === 1) return items[0].title;
  const counts = { problem: 0, quiz: 0, lesson: 0 };
  for (const it of items) counts[it.itemType] = (counts[it.itemType] || 0) + 1;
  const parts: string[] = [];
  if (counts.problem) parts.push(`${counts.problem} bài code`);
  if (counts.quiz) parts.push(`${counts.quiz} quiz`);
  if (counts.lesson) parts.push(`${counts.lesson} bài học`);
  return parts.join(" · ");
}

function Progress({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
        {value}/{total}
      </span>
    </div>
  );
}

interface FormPrefill {
  title?: string;
  description?: string;
  items?: SelectedItem[];
  studentIds?: string[];
}

export default function Assignments() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [formState, setFormState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    initial: StaffAssignment | null;
    prefill: FormPrefill | null;
  }>({
    open: false,
    mode: "create",
    initial: null,
    prefill: null,
  });
  const [remedialState, setRemedialState] = useState<{
    open: boolean;
    skillId: string | null;
    studentId: string | null;
  }>({ open: false, skillId: null, studentId: null });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffAssignment | null>(null);

  // Support 1-click quick-assign & remedial deep-links from ProblemDetail, LessonView, SkillHeatmap, StudentProfile
  useEffect(() => {
    const quickType = searchParams.get("quickType") as ItemType | null;
    const quickId = searchParams.get("quickId");
    const quickTitle = searchParams.get("quickTitle") || "";
    const remedialSkill = searchParams.get("remedialSkill");
    const remedialStudent = searchParams.get("remedialStudent");

    if (quickType && quickId && (quickType === "problem" || quickType === "quiz" || quickType === "lesson")) {
      const targetKey = itemKey(quickType, quickId);
      setFormState({
        open: true,
        mode: "create",
        initial: null,
        prefill: {
          title: quickTitle ? `Bài tập: ${quickTitle}` : "",
          items: [
            {
              key: targetKey,
              itemType: quickType,
              problemId: quickType === "problem" ? quickId : null,
              quizId: quickType === "quiz" ? quickId : null,
              lessonId: quickType === "lesson" ? quickId : null,
              title: quickTitle || "Nội dung đã chọn",
            },
          ],
        },
      });
      setSearchParams({}, { replace: true });
    } else if (remedialSkill || remedialStudent) {
      setRemedialState({
        open: true,
        skillId: remedialSkill || null,
        studentId: remedialStudent || null,
      });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: assignments, isLoading } = useQuery<StaffAssignment[]>({
    queryKey: ["assignments", showArchived ? "archived" : "active"],
    queryFn: () => api.get(`/assignments?status=${showArchived ? "archived" : "active"}`).then((r) => asArray<StaffAssignment>(r.data)),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/assignments/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-detail"] });
      toast.success({ title: "Đã cập nhật bài tập" });
    },
    onError: () => toast.error({ title: "Không cập nhật được bài tập" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/assignments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      setDeleteTarget(null);
      setDetailId(null);
      toast.success({ title: "Đã xóa bài tập" });
    },
    onError: () => toast.error({ title: "Không xóa được bài tập" }),
  });

  const totals = useMemo(() => {
    const all = assignments ?? [];
    return {
      count: all.length,
      assigned: all.reduce((s, a) => s + a.stats.assigned, 0),
      passed: all.reduce((s, a) => s + a.stats.passed, 0),
      notStarted: all.reduce((s, a) => s + a.stats.notStarted, 0),
    };
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    const all = assignments ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.problem?.title && a.problem.title.toLowerCase().includes(q)) ||
        (a.course?.title && a.course.title.toLowerCase().includes(q)) ||
        a.items?.some((it) => it.title.toLowerCase().includes(q)),
    );
  }, [assignments, searchQuery]);

  const openCreate = (prefill: FormPrefill | null = null) => setFormState({ open: true, mode: "create", initial: null, prefill });
  const openEdit = (assignment: StaffAssignment) => setFormState({ open: true, mode: "edit", initial: assignment, prefill: null });

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader
          eyebrow="Lớp học"
          title="Bài tập"
          description="Giao phiếu bài code, quiz hoặc bài học cho học sinh, theo dõi tiến độ và chấm thưởng tự động."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setRemedialState({ open: true, skillId: null, studentId: null })}>
                <Sparkles className="size-3.5 text-amber-500" /> Giao bài khắc phục
              </Button>
              <Button size="sm" onClick={() => openCreate()}>
                <Plus className="size-3.5" /> Giao bài tập
              </Button>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Bài đang mở", value: totals.count, icon: ClipboardList, tone: "bg-primary/10 text-primary" },
            { label: "Lượt giao", value: totals.assigned, icon: Users, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
            { label: "Đã đạt", value: totals.passed, icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
            { label: "Chưa làm", value: totals.notStarted, icon: SquarePen, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
          ].map((s) => (
            <Card key={s.label} className="surface-interactive">
              <CardContent className="flex items-center justify-between p-3">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">{s.label}</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums leading-none">{s.value}</p>
                </div>
                <div className={cn("grid size-8 place-items-center rounded-lg", s.tone)}>
                  <s.icon className="size-4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex h-8 items-center rounded-[7px] border border-border bg-muted/50 p-0.5">
            {(
              [
                [false, "Đang mở"],
                [true, "Đã lưu trữ"],
              ] as const
            ).map(([key, label]) => {
              const active = showArchived === key;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setShowArchived(key)}
                  className={cn(
                    "relative h-7 rounded-[5px] px-3 text-xs font-medium transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="assignments-tab-pill"
                      transition={{ type: "spring", stiffness: 450, damping: 35 }}
                      className="absolute inset-0 rounded-[5px] bg-card shadow-sm"
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              data-slot="assignments-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm bài tập, nội dung, khóa học..."
              className="h-8 w-full rounded-[7px] border border-border bg-card pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
            ))}
          </div>
        ) : !filteredAssignments.length ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2.5 p-8 text-center">
              <ClipboardList className="size-8 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">
                {searchQuery.trim()
                  ? "Không tìm thấy bài tập khớp từ khóa."
                  : showArchived
                    ? "Chưa có bài tập nào được lưu trữ."
                    : "Chưa giao bài tập nào. Bấm “Giao bài tập” để tạo bài đầu tiên."}
              </p>
              {!showArchived && !searchQuery.trim() && (
                <Button size="sm" onClick={() => openCreate()} className="mt-1">
                  <Plus className="size-3.5" /> Giao bài tập
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="stagger-in space-y-2.5">
            {filteredAssignments.map((a) => {
              const overdue = !!a.deadline && new Date(a.deadline) < new Date();
              const summaryText = summarizeAssignmentItems(a.items ?? []);
              const firstItem = a.items?.[0];
              return (
                <Card key={a.id} className="surface-interactive hover:border-primary/40">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailId(a.id)}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-[13px] font-semibold text-foreground hover:underline">{a.title}</p>
                        {a.course && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            <BookOpen className="size-3" /> {a.course.title}
                          </span>
                        )}
                        {a.strictDeadline && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                            <Lock className="size-2.5" /> Khóa sau hạn
                          </span>
                        )}
                        {a.autoAssignNewStudents && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                            Tự giao HS mới
                          </span>
                        )}
                        {overdue && a.stats.passed < a.stats.assigned && (
                          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">Quá hạn</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-muted-foreground">
                        {summaryText && (
                          <span className="inline-flex items-center gap-1">
                            <ItemTypeIcon type={firstItem?.itemType ?? "problem"} className="size-3" />
                            <span className="truncate max-w-[260px]">{summaryText}</span>
                            {a.items?.length === 1 && firstItem?.difficulty && (
                              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", difficultyClass(firstItem.difficulty))}>
                                {difficultyLabel(firstItem.difficulty)}
                              </span>
                            )}
                          </span>
                        )}
                        <span>Hạn: {a.deadline ? fmtDate(a.deadline) : "Không có"}</span>
                        <span>Giao lúc: {fmtDate(a.createdAt)}</span>
                        <span>bởi {a.createdBy.fullName}</span>
                      </div>
                    </button>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-right">
                        <Progress value={a.stats.passed} total={a.stats.assigned} />
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Đạt <span className="font-medium text-emerald-600 dark:text-emerald-400">{a.stats.passed}</span>
                          {" · "}Đang làm {Math.max(0, a.stats.done - a.stats.passed)}
                          {a.stats.late > 0 && <> · Muộn {a.stats.late}</>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="xs" className="h-7 px-2.5" onClick={() => setDetailId(a.id)}>
                          Chi tiết
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          title="Chỉnh sửa"
                          onClick={() => openEdit(a)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          title={showArchived ? "Mở lại" : "Lưu trữ"}
                          onClick={() => archiveMutation.mutate({ id: a.id, status: showArchived ? "published" : "archived" })}
                        >
                          {showArchived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          title="Xóa"
                          onClick={() => setDeleteTarget(a)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <AssignmentFormDialog
          open={formState.open}
          mode={formState.mode}
          initial={formState.initial}
          prefill={formState.prefill}
          onClose={() => setFormState((prev) => ({ ...prev, open: false }))}
        />

        <RemedialRecommendDialog
          open={remedialState.open}
          initialSkillId={remedialState.skillId}
          initialStudentId={remedialState.studentId}
          onClose={() => setRemedialState({ open: false, skillId: null, studentId: null })}
          onApply={(prefill) => {
            setRemedialState({ open: false, skillId: null, studentId: null });
            openCreate(prefill);
          }}
        />

        <AssignmentDetailDialog
          detailId={detailId}
          onClose={() => setDetailId(null)}
          onArchive={(id, status) => archiveMutation.mutate({ id, status })}
          onEdit={(detail) => openEdit(detail)}
        />

        <ConfirmDialog
          open={!!deleteTarget}
          title="Xóa bài tập?"
          message={`Bài tập "${deleteTarget?.title}" sẽ bị xóa vĩnh viễn khỏi danh sách của học sinh. Lịch sử nộp bài không bị ảnh hưởng.`}
          confirmLabel="Xóa"
          variant="danger"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        />
      </div>
    </ErrorBoundary>
  );
}

// ───────────────────────── Dialog tạo / sửa bài tập ─────────────────────────

function AssignmentFormDialog({
  open,
  mode,
  initial,
  prefill,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial: StaffAssignment | null;
  prefill?: FormPrefill | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [catalogTab, setCatalogTab] = useState<ItemType>("problem");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [courseId, setCourseId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [description, setDescription] = useState("");
  const [strictDeadline, setStrictDeadline] = useState(false);
  const [autoAssignNewStudents, setAutoAssignNewStudents] = useState(false);
  const [rewardOnTime, setRewardOnTime] = useState(true);
  const [bonusTokens, setBonusTokens] = useState(0);
  const [bonusXp, setBonusXp] = useState(0);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setTitle(initial.title);
      setDescription(initial.description || "");
      setCourseId(initial.courseId || initial.course?.id || "");
      setDeadline(toDatetimeLocalValue(initial.deadline));
      setStrictDeadline(!!initial.strictDeadline);
      setAutoAssignNewStudents(!!initial.autoAssignNewStudents);
      setRewardOnTime(initial.rewardOnTime !== false);
      setBonusTokens(initial.bonusTokens || 0);
      setBonusXp(initial.bonusXp || 0);
      setSelectedItems(
        (initial.items ?? []).map((it) => {
          const targetId = it.problemId || it.quizId || it.lessonId || it.id;
          return {
            key: itemKey(it.itemType, targetId),
            itemType: it.itemType,
            problemId: it.problemId,
            quizId: it.quizId,
            lessonId: it.lessonId,
            title: it.title,
            difficulty: it.difficulty,
            subtitle: it.courseTitle,
          };
        }),
      );
      setCatalogSearch("");
      setStudentSearch("");
      setSelectedStudents(new Set());
    } else {
      setTitle(prefill?.title || "");
      setDescription(prefill?.description || "");
      setCourseId("");
      setDeadline("");
      setStrictDeadline(false);
      setAutoAssignNewStudents(false);
      setRewardOnTime(true);
      setBonusTokens(0);
      setBonusXp(0);
      setSelectedItems(prefill?.items ?? []);
      setCatalogSearch("");
      setStudentSearch("");
      setSelectedStudents(new Set(prefill?.studentIds ?? []));
    }
  }, [open, mode, initial, prefill]);

  const { data: catalogItems, isFetching: catalogLoading } = useQuery<CatalogItem[]>({
    queryKey: ["assignments", "catalog", catalogTab, catalogSearch, courseId],
    queryFn: () =>
      api
        .get("/assignments/catalog", {
          params: {
            type: catalogTab,
            q: catalogSearch.trim() || undefined,
            courseId: catalogTab !== "problem" && courseId ? courseId : undefined,
            limit: 30,
          },
        })
        .then((r) => asArray<CatalogItem>(r.data)),
    enabled: open,
  });

  const { data: courses } = useQuery<{ id: string; title: string }[]>({
    queryKey: ["assignments", "course-options"],
    queryFn: () => api.get("/courses", { params: { status: "current" } }).then((r) => asArray(r.data)),
    enabled: open,
  });

  const { data: students } = useQuery<StudentLite[]>({
    queryKey: ["assignments", "student-options"],
    queryFn: () => api.get("/students").then((r) => asArray<StudentLite>(r.data)),
    enabled: open && mode === "create",
  });

  const activeStudents = useMemo(
    () => (students ?? []).filter((s) => !s.status || s.status === "active"),
    [students],
  );

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return activeStudents;
    return activeStudents.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        (s.nickname && s.nickname.toLowerCase().includes(q)) ||
        s.email.toLowerCase().includes(q),
    );
  }, [activeStudents, studentSearch]);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      if (mode === "edit" && initial) {
        return api.patch(`/assignments/${initial.id}`, payload).then((r) => r.data);
      }
      return api.post("/assignments", payload).then((r) => r.data);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-detail"] });
      if (mode === "edit") {
        toast.success({ title: "Đã cập nhật bài tập" });
      } else {
        toast.success({ title: "Đã giao bài tập", message: `Đã thông báo cho ${res.assignedCount} học sinh.` });
      }
      onClose();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error({
        title: mode === "edit" ? "Không cập nhật được bài tập" : "Không tạo được bài tập",
        message: err.response?.data?.error,
      });
    },
  });

  const addCatalogItem = (c: CatalogItem) => {
    const targetId = c.problemId || c.quizId || c.lessonId || c.id;
    const key = itemKey(c.itemType, targetId);
    if (selectedItems.some((it) => it.key === key)) return;
    setSelectedItems((prev) => [
      ...prev,
      {
        key,
        itemType: c.itemType,
        problemId: c.itemType === "problem" ? targetId : null,
        quizId: c.itemType === "quiz" ? targetId : null,
        lessonId: c.itemType === "lesson" ? targetId : c.lessonId || null,
        title: c.title,
        difficulty: c.difficulty,
        subtitle: c.courseTitle || c.lessonTitle || null,
      },
    ]);
  };

  const removeItem = (key: string) => setSelectedItems((prev) => prev.filter((it) => it.key !== key));

  const moveItem = (idx: number, dir: -1 | 1) => {
    setSelectedItems((prev) => {
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[nextIdx]] = [copy[nextIdx], copy[idx]];
      return copy;
    });
  };

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectCourse = async (id: string) => {
    setCourseId(id);
    if (!id || mode === "edit") return;
    try {
      const r = await api.get<{ studentIds: string[]; source: string; count: number }>("/assignments/course-students", {
        params: { courseId: id },
      });
      const ids = r.data?.studentIds ?? [];
      setSelectedStudents((prev) => {
        const next = new Set(prev);
        ids.forEach((sid) => next.add(sid));
        return next;
      });
      const sourceLabel =
        r.data?.source === "course_members"
          ? "thành viên khóa"
          : r.data?.source === "course_activity"
            ? "học sinh đang học khóa"
            : "toàn bộ học sinh đang học";
      toast.info({ title: `Đã thêm ${ids.length} học sinh`, message: `Nguồn: ${sourceLabel}.` });
    } catch {
      toast.error({ title: "Không lấy được danh sách học sinh theo khóa" });
    }
  };

  const selectedKeySet = new Set(selectedItems.map((it) => it.key));

  const submit = () => {
    if (!title.trim()) {
      toast.error({ title: "Cần tiêu đề bài tập" });
      return;
    }
    if (!selectedItems.length) {
      toast.error({ title: "Cần chọn ít nhất một bài code, quiz hoặc bài học" });
      return;
    }
    if (mode === "create" && !selectedStudents.size) {
      toast.error({ title: "Cần chọn ít nhất một học sinh" });
      return;
    }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      description,
      courseId: courseId || null,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      strictDeadline,
      autoAssignNewStudents,
      rewardOnTime,
      bonusTokens: Math.max(0, Number(bonusTokens) || 0),
      bonusXp: Math.max(0, Number(bonusXp) || 0),
      items: selectedItems.map((it) => ({
        itemType: it.itemType,
        problemId: it.problemId,
        quizId: it.quizId,
        lessonId: it.lessonId,
      })),
    };
    if (mode === "create") {
      payload.studentIds = [...selectedStudents];
    }
    saveMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Chỉnh sửa bài tập" : "Giao bài tập mới"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tiêu đề</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: BTVN Tuần 4 — Vòng lặp & Hàm" />
          </div>

          {/* Multi-item Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Nội dung bài tập ({selectedItems.length} mục đã chọn)</label>
              <span className="text-[11px] text-muted-foreground">Có thể gộp nhiều bài code, quiz, bài học</span>
            </div>

            {selectedItems.length > 0 && (
              <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
                {selectedItems.map((it, idx) => (
                  <div key={it.key} className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid size-5 shrink-0 place-items-center rounded bg-muted text-[10px] font-semibold tabular-nums">
                        {idx + 1}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        <ItemTypeIcon type={it.itemType} className="size-3" /> {itemTypeLabel(it.itemType)}
                      </span>
                      <span className="truncate font-medium">{it.title}</span>
                      {it.difficulty && (
                        <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium", difficultyClass(it.difficulty))}>
                          {difficultyLabel(it.difficulty)}
                        </span>
                      )}
                      {it.subtitle && <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">· {it.subtitle}</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button type="button" variant="ghost" size="icon-xs" className="size-6" disabled={idx === 0} onClick={() => moveItem(idx, -1)}>
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="size-6"
                        disabled={idx === selectedItems.length - 1}
                        onClick={() => moveItem(idx, 1)}
                      >
                        <ArrowDown className="size-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-xs" className="size-6 text-muted-foreground hover:text-destructive" onClick={() => removeItem(it.key)}>
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border p-2 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex h-7 items-center rounded-md border bg-muted/50 p-0.5">
                  {(
                    [
                      ["problem", "Bài code"],
                      ["quiz", "Quiz"],
                      ["lesson", "Bài học"],
                    ] as const
                  ).map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setCatalogTab(tab)}
                      className={cn(
                        "h-6 rounded px-2.5 text-[11px] font-medium transition-colors",
                        catalogTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder={`Tìm ${catalogTab === "problem" ? "đề bài code" : catalogTab === "quiz" ? "quiz" : "bài học"}...`}
                    className="h-7 pl-8 text-xs"
                  />
                </div>
              </div>

              <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                {catalogLoading && !catalogItems?.length ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">Đang tải danh sách...</p>
                ) : !catalogItems?.length ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">Không có mục phù hợp.</p>
                ) : (
                  catalogItems.map((c) => {
                    const targetId = c.problemId || c.quizId || c.lessonId || c.id;
                    const already = selectedKeySet.has(itemKey(c.itemType, targetId));
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={already}
                        onClick={() => addCatalogItem(c)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                          already ? "bg-primary/5 text-muted-foreground" : "hover:bg-muted",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <ItemTypeIcon type={c.itemType} className="size-3.5 shrink-0 text-primary" />
                          <span className="truncate font-medium">{c.title}</span>
                          {(c.courseTitle || c.lessonTitle) && (
                            <span className="truncate text-[11px] text-muted-foreground">
                              ({[c.courseTitle, c.lessonTitle].filter(Boolean).join(" · ")})
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {c.difficulty && (
                            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", difficultyClass(c.difficulty))}>
                              {difficultyLabel(c.difficulty)}
                            </span>
                          )}
                          {typeof c.questionCount === "number" && (
                            <span className="text-[10px] text-muted-foreground">{c.questionCount} câu</span>
                          )}
                          {already ? <Check className="size-3.5 text-emerald-600" /> : <Plus className="size-3.5 text-muted-foreground" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Khóa học (không bắt buộc)</label>
              <select
                data-slot="assignment-course-select"
                value={courseId}
                onChange={(e) => selectCourse(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs"
              >
                <option value="">{mode === "create" ? "— Chọn nhanh theo khóa —" : "— Không gắn khóa học —"}</option>
                {(courses ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Hạn chót (không bắt buộc)</label>
              <div className="flex items-center gap-1.5">
                <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="h-8 text-xs" />
                {deadline && (
                  <Button type="button" variant="ghost" size="icon-xs" className="size-8 shrink-0" onClick={() => setDeadline("")} title="Xóa hạn chót">
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Policies */}
          <div className="grid gap-2.5 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={strictDeadline}
                onChange={(e) => setStrictDeadline(e.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <span>
                <span className="font-medium text-foreground">Khóa chấm sau hạn</span>
                <span className="block text-[11px] text-muted-foreground">HS vẫn xem/luyện được nhưng bài làm sau hạn không tính Đạt.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={autoAssignNewStudents}
                onChange={(e) => setAutoAssignNewStudents(e.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <span>
                <span className="font-medium text-foreground">Tự giao cho học sinh mới</span>
                <span className="block text-[11px] text-muted-foreground">Học sinh đăng ký mới trước hạn sẽ tự nhận bài này.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-xs sm:col-span-2">
              <input
                type="checkbox"
                checked={rewardOnTime}
                onChange={(e) => setRewardOnTime(e.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <span className="flex-1">
                <span className="font-medium text-foreground">Thưởng hoàn thành đúng hạn</span>
                <span className="block text-[11px] text-muted-foreground">
                  Tự động cộng thưởng bài tập mặc định của hệ thống + bonus riêng dưới đây khi xong đủ mục trước hạn.
                </span>
              </span>
            </label>
            {rewardOnTime && (
              <div className="flex flex-wrap items-center gap-3 pl-5 sm:col-span-2">
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Bonus Token:</span>
                  <Input
                    type="number"
                    min={0}
                    max={10000}
                    value={bonusTokens}
                    onChange={(e) => setBonusTokens(Math.max(0, Number(e.target.value) || 0))}
                    className="h-7 w-20 text-xs"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Bonus XP:</span>
                  <Input
                    type="number"
                    min={0}
                    max={10000}
                    value={bonusXp}
                    onChange={(e) => setBonusXp(Math.max(0, Number(e.target.value) || 0))}
                    className="h-7 w-20 text-xs"
                  />
                </label>
              </div>
            )}
          </div>

          {mode === "create" && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium">Học sinh nhận bài ({selectedStudents.size} đã chọn)</label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setSelectedStudents(new Set(activeStudents.map((s) => s.id)))}
                  >
                    Chọn tất cả HS
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setSelectedStudents(new Set())}
                  >
                    Bỏ chọn
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Lọc học sinh theo tên, nickname hoặc email..."
                  className="h-7 pl-8 text-xs"
                />
              </div>
              <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border p-1.5">
                {!students ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">Đang tải danh sách học sinh...</p>
                ) : !filteredStudents.length ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">Không tìm thấy học sinh phù hợp.</p>
                ) : (
                  filteredStudents.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1 text-xs hover:bg-muted">
                      <input type="checkbox" checked={selectedStudents.has(s.id)} onChange={() => toggleStudent(s.id)} className="accent-primary" />
                      <StudentAvatar fullName={s.fullName} nickname={s.nickname} avatarUrl={s.avatarUrl} size="sm" />
                      <span className="truncate font-medium">{s.fullName}</span>
                      {s.nickname && <span className="truncate text-[11px] text-muted-foreground">({s.nickname})</span>}
                      <span className="ml-auto truncate text-[11px] text-muted-foreground">{s.email}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Yêu cầu / ghi chú (không bắt buộc)</label>
            <textarea
              data-slot="assignment-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Ghi chú thêm cho học sinh..."
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="button" onClick={submit} disabled={saveMutation.isPending}>
              {mode === "edit" ? "Lưu thay đổi" : "Giao bài tập"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Dialog chi tiết bài tập ─────────────────────────

function AssignmentDetailDialog({
  detailId,
  onClose,
  onArchive,
  onEdit,
}: {
  detailId: string | null;
  onClose: () => void;
  onArchive: (id: string, status: string) => void;
  onEdit: (detail: AssignmentDetail) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [addStudentId, setAddStudentId] = useState("");
  const [rowFilter, setRowFilter] = useState<"all" | "not_started" | "attempting" | "passed" | "late">("all");
  const [inspectStudentId, setInspectStudentId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: detail, isLoading } = useQuery<AssignmentDetail>({
    queryKey: ["assignment-detail", detailId],
    queryFn: () => api.get(`/assignments/${detailId}`).then((r) => r.data),
    enabled: !!detailId,
  });

  const { data: allStudents } = useQuery<StudentLite[]>({
    queryKey: ["assignments", "student-options"],
    queryFn: () => api.get("/students").then((r) => asArray<StudentLite>(r.data)),
    enabled: !!detailId,
  });

  const patchStudentsMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch(`/assignments/${detailId}`, payload).then((r) => r.data),
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: ["assignment-detail", detailId] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      if ("studentIds" in vars) {
        setAddStudentId("");
        toast.success({ title: "Đã thêm học sinh vào bài tập" });
      } else if ("removeStudentIds" in vars) {
        setRemoveTarget(null);
        toast.success({ title: "Đã gỡ học sinh khỏi bài tập" });
      } else if ("syncRoster" in vars) {
        toast.success({
          title: res.addedCount > 0 ? `Đã đồng bộ thêm ${res.addedCount} học sinh` : "Danh sách học sinh đã đầy đủ",
        });
      }
    },
    onError: () => toast.error({ title: "Thao tác không thành công" }),
  });

  const remindMutation = useMutation({
    mutationFn: () => api.post(`/assignments/${detailId}/remind`, {}).then((r) => r.data),
    onSuccess: (res) => {
      toast.success({
        title: res.remindedCount > 0 ? `Đã gửi nhắc hạn tới ${res.remindedCount} học sinh` : "Tất cả học sinh đã hoàn thành",
      });
    },
    onError: () => toast.error({ title: "Không gửi được nhắc hạn" }),
  });

  const assignedIds = new Set((detail?.rows ?? []).map((r) => r.student.id));
  const remainingStudents = (allStudents ?? []).filter((s) => (!s.status || s.status === "active") && !assignedIds.has(s.id));

  const filteredRows = useMemo(() => {
    const rows = detail?.rows ?? [];
    if (rowFilter === "all") return rows;
    if (rowFilter === "late") return rows.filter((r) => r.late && r.status !== "not_started");
    return rows.filter((r) => r.status === rowFilter);
  }, [detail, rowFilter]);

  return (
    <>
      <Dialog open={!!detailId} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
          {isLoading || !detail ? (
            <div className="flex items-center justify-center py-10">
              <Skeleton className="h-44 w-full rounded-xl" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-start justify-between gap-2 pr-6">
                  <DialogTitle className="text-base">{detail.title}</DialogTitle>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button variant="outline" size="xs" className="h-7" onClick={() => onEdit(detail)}>
                      <Pencil className="mr-1 size-3" /> Sửa
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      className="h-7"
                      disabled={remindMutation.isPending}
                      onClick={() => remindMutation.mutate()}
                    >
                      <BellRing className="mr-1 size-3" /> Nhắc hạn
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      className="h-7"
                      disabled={patchStudentsMutation.isPending}
                      onClick={() => patchStudentsMutation.mutate({ syncRoster: true })}
                    >
                      <RefreshCw className="mr-1 size-3" /> Đồng bộ HS lớp
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                {detail.course && (
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="size-3.5" /> {detail.course.title}
                  </span>
                )}
                <span>Hạn chót: {detail.deadline ? fmtDate(detail.deadline) : "Không có"}</span>
                <span>
                  Đạt <span className="font-medium text-emerald-600 dark:text-emerald-400">{detail.stats.passed}</span>/{detail.stats.assigned}
                </span>
                {detail.strictDeadline && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    <Lock className="size-3" /> Khóa sau hạn
                  </span>
                )}
                {detail.rewardOnTime && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    <Award className="size-3" /> Thưởng đúng hạn
                    {(detail.bonusTokens > 0 || detail.bonusXp > 0) &&
                      ` (+${detail.bonusTokens}T / +${detail.bonusXp}XP)`}
                  </span>
                )}
              </div>

              {detail.description && <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{detail.description}</p>}

              {detail.items?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {detail.items.map((it, idx) => (
                    <Link
                      key={it.id}
                      to={it.linkPath}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs transition-colors hover:border-primary/50 hover:bg-muted/40"
                    >
                      <span className="text-[10px] font-semibold text-muted-foreground">#{idx + 1}</span>
                      <ItemTypeIcon type={it.itemType} className="size-3.5 text-primary" />
                      <span className="font-medium text-foreground">{it.title}</span>
                      {typeof it.passedCount === "number" && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                          {it.passedCount}/{detail.stats.assigned}
                        </span>
                      )}
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              )}

              {/* Row filters */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ["all", "Tất cả"],
                    ["not_started", "Chưa làm"],
                    ["attempting", "Đang làm"],
                    ["passed", "Đã đạt"],
                    ["late", "Nộp muộn"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setRowFilter(k)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                      rowFilter === k ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left text-[11px] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Học sinh</th>
                      <th className="px-3 py-1.5 font-medium">Trạng thái</th>
                      <th className="px-3 py-1.5 text-center font-medium">Tiến độ / Lượt</th>
                      <th className="px-3 py-1.5 font-medium">Thời gian</th>
                      <th className="px-3 py-1.5 text-right font-medium">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredRows.map((r) => (
                      <tr key={r.student.id}>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <StudentAvatar fullName={r.student.fullName} nickname={r.student.nickname} avatarUrl={r.student.avatarUrl} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{r.student.fullName}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{r.student.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex flex-wrap items-center gap-1">
                            {r.status === "passed" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="size-3" /> Đã đạt{r.late ? " (muộn)" : ""}
                              </span>
                            ) : r.status === "attempting" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                <SquarePen className="size-3" /> Đang làm{r.late ? " (muộn)" : ""}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Chưa làm</span>
                            )}
                            {r.locked && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                                <Lock className="size-2.5" /> Khóa hạn
                              </span>
                            )}
                            {r.rewardedAt && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400" title="Đã thưởng hoàn thành đúng hạn">
                                <Award className="size-2.5" /> Thưởng
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {r.totalItems > 1 ? (
                            <span>
                              {r.completedItems}/{r.totalItems} mục · {r.attempts} lượt
                            </span>
                          ) : (
                            <span>{r.attempts} lượt</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground">
                          {r.completedAt ? `Xong: ${fmtDate(r.completedAt)}` : r.lastAttemptAt ? `Cuối: ${fmtDate(r.lastAttemptAt)}` : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="xs"
                              className="h-7 px-2 text-xs"
                              onClick={() => setInspectStudentId(r.student.id)}
                            >
                              <Eye className="mr-1 size-3" /> Xem bài
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              title="Gỡ học sinh khỏi bài tập"
                              onClick={() => setRemoveTarget({ id: r.student.id, name: r.student.fullName })}
                            >
                              <UserMinus className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredRows.length && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">
                          Không có học sinh nào trong mục này.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <UserPlus className="size-4 text-muted-foreground" />
                  <select
                    value={addStudentId}
                    onChange={(e) => setAddStudentId(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">Thêm học sinh...</option>
                    {remainingStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} ({s.email})
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!addStudentId || patchStudentsMutation.isPending}
                    onClick={() => patchStudentsMutation.mutate({ studentIds: [addStudentId] })}
                  >
                    Thêm
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => detail && onArchive(detail.id, detail.status === "archived" ? "published" : "archived")}
                >
                  {detail.status === "archived" ? <ArchiveRestore className="mr-1.5 size-4" /> : <Archive className="mr-1.5 size-4" />}
                  {detail.status === "archived" ? "Mở lại" : "Lưu trữ"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <StudentSubmissionInspectorDialog
        assignmentId={detailId}
        studentId={inspectStudentId}
        onClose={() => setInspectStudentId(null)}
      />

      <ConfirmDialog
        open={!!removeTarget}
        title="Gỡ học sinh khỏi bài tập?"
        message={`Học sinh "${removeTarget?.name}" sẽ không còn thấy bài tập này trong danh sách cần làm. Lịch sử nộp bài trên đề vẫn được giữ nguyên.`}
        confirmLabel="Gỡ học sinh"
        variant="danger"
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && patchStudentsMutation.mutate({ removeStudentIds: [removeTarget.id] })}
      />
    </>
  );
}

// ───────────────────────── Dialog xem bài nộp của học sinh ─────────────────────────

function StudentSubmissionInspectorDialog({
  assignmentId,
  studentId,
  onClose,
}: {
  assignmentId: string | null;
  studentId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<StudentSubmissionsResponse>({
    queryKey: ["assignment-student-submissions", assignmentId, studentId],
    queryFn: () => api.get(`/assignments/${assignmentId}/students/${studentId}/submissions`).then((r) => r.data),
    enabled: !!assignmentId && !!studentId,
  });

  return (
    <Dialog open={!!assignmentId && !!studentId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {data ? `Bài làm của ${data.student.fullName}` : "Chi tiết bài làm"}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <Skeleton className="h-44 w-full rounded-xl" />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 p-2.5 text-xs">
              <StudentAvatar
                fullName={data.student.fullName}
                nickname={data.student.nickname}
                avatarUrl={data.student.avatarUrl}
                size="sm"
              />
              <div>
                <p className="font-semibold text-foreground">{data.student.fullName}</p>
                <p className="text-muted-foreground">{data.student.email}</p>
              </div>
            </div>

            {data.items.map((item, idx) => (
              <div key={item.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <span className="text-muted-foreground">#{idx + 1}</span>
                    <ItemTypeIcon type={item.itemType} className="size-3.5 text-primary" />
                    <span>{item.title}</span>
                  </div>
                  <Link to={item.linkPath} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                    Mở gốc <ExternalLink className="size-3" />
                  </Link>
                </div>

                {item.itemType === "problem" && (
                  item.problemSubmissions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Chưa có lượt nộp code nào.</p>
                  ) : (
                    <div className="space-y-2">
                      {item.problemSubmissions.map((sub) => (
                        <div key={sub.id} className="rounded-md border bg-muted/20 p-2.5 text-xs space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                  sub.passed ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                                )}
                              >
                                {sub.passed ? "Đạt (AC)" : "Chưa đạt"}
                              </span>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                                {sub.language}
                              </span>
                              {sub.totalTests > 0 && (
                                <span className="text-[11px] text-muted-foreground">
                                  {sub.judgedTests}/{sub.totalTests} tests
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground">{fmtDate(sub.createdAt)}</span>
                          </div>
                          {sub.code && (
                            <pre className="max-h-56 overflow-auto rounded border bg-background p-2.5 font-mono text-[11px] leading-relaxed text-foreground">
                              {sub.code}
                            </pre>
                          )}
                          {sub.note && <p className="whitespace-pre-wrap text-[11px] text-muted-foreground">{sub.note}</p>}
                        </div>
                      ))}
                    </div>
                  )
                )}

                {item.itemType === "quiz" && (
                  item.quizAttempts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Chưa có lượt làm quiz nào.</p>
                  ) : (
                    <div className="space-y-1">
                      {item.quizAttempts.map((qa) => (
                        <div key={qa.id} className="flex items-center justify-between rounded border bg-muted/20 px-2.5 py-1.5 text-xs">
                          <span className={qa.passed ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                            {qa.score}/{qa.totalQuestions} câu · {qa.passed ? "Đạt" : "Chưa đạt"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{fmtDate(qa.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {item.itemType === "lesson" && (
                  <p className="text-xs text-muted-foreground">
                    {item.lessonCompletedAt ? (
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">
                        Đã hoàn thành bài học lúc {fmtDate(item.lessonCompletedAt)}
                      </span>
                    ) : (
                      "Chưa hoàn thành bài học."
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Dialog gợi ý giao bài khắc phục ─────────────────────────

interface RemedialResponse {
  mode: "overview" | "skill" | "student";
  weakClassSkills?: Array<{
    skillId: string;
    name: string;
    topicName: string;
    weakStudentCount: number;
    evaluatedCount: number;
    avgMastery: number;
  }>;
  skill?: { skillId: string; name: string; topicName: string };
  prerequisiteSkills?: Array<{ skillId: string; name: string }>;
  student?: { id: string; fullName: string; nickname: string | null; email: string };
  weakSkills?: Array<{ skillId: string; name: string; mastery: number; dueForReview: boolean }>;
  suggestedTitle?: string;
  suggestedStudents?: Array<{
    id: string;
    fullName: string;
    nickname: string | null;
    email: string;
    mastery: number;
    dueForReview: boolean;
  }>;
  suggestedItems?: Array<{
    itemType: ItemType;
    problemId: string | null;
    quizId: string | null;
    lessonId: string | null;
    title: string;
    difficulty: string | null;
    courseTitle: string | null;
    skillId: string;
    skillName: string;
    reason: string;
  }>;
}

function RemedialRecommendDialog({
  open,
  initialSkillId,
  initialStudentId,
  onClose,
  onApply,
}: {
  open: boolean;
  initialSkillId: string | null;
  initialStudentId: string | null;
  onClose: () => void;
  onApply: (prefill: FormPrefill) => void;
}) {
  const [skillId, setSkillId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [pickedItemKeys, setPickedItemKeys] = useState<Set<string>>(new Set());
  const [pickedStudentIds, setPickedStudentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSkillId(initialSkillId || "");
    setStudentId(initialStudentId || "");
  }, [open, initialSkillId, initialStudentId]);

  const { data: students } = useQuery<StudentLite[]>({
    queryKey: ["assignments", "student-options"],
    queryFn: () => api.get("/students").then((r) => asArray<StudentLite>(r.data)),
    enabled: open,
  });

  const recQ = useQuery<RemedialResponse>({
    queryKey: ["assignments", "recommend-remedial", skillId, studentId],
    queryFn: () =>
      api
        .get("/assignments/recommend-remedial", {
          params: {
            skillId: !studentId && skillId ? skillId : undefined,
            studentId: studentId || undefined,
            limit: 8,
          },
        })
        .then((r) => r.data),
    enabled: open,
  });

  useEffect(() => {
    if (!recQ.data) return;
    const itemKeys = new Set<string>();
    for (const it of (recQ.data.suggestedItems ?? []).slice(0, 4)) {
      const targetId = it.problemId || it.quizId || it.lessonId || "";
      if (targetId) itemKeys.add(itemKey(it.itemType, targetId));
    }
    setPickedItemKeys(itemKeys);
    setPickedStudentIds(new Set((recQ.data.suggestedStudents ?? []).map((s) => s.id)));
  }, [recQ.data]);

  const activeStudents = useMemo(
    () => (students ?? []).filter((s) => !s.status || s.status === "active"),
    [students],
  );

  const handleApply = () => {
    const rec = recQ.data;
    if (!rec) return;
    const items: SelectedItem[] = [];
    for (const it of rec.suggestedItems ?? []) {
      const targetId = it.problemId || it.quizId || it.lessonId || "";
      const key = itemKey(it.itemType, targetId);
      if (!pickedItemKeys.has(key)) continue;
      items.push({
        key,
        itemType: it.itemType,
        problemId: it.problemId,
        quizId: it.quizId,
        lessonId: it.lessonId,
        title: it.title,
        difficulty: it.difficulty,
        subtitle: it.skillName,
      });
    }
    onApply({
      title: rec.suggestedTitle || "Bài tập củng cố kỹ năng",
      items,
      studentIds: [...pickedStudentIds],
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[86vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-amber-500" />
            Gợi ý giao bài khắc phục theo lỗ hổng kỹ năng
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(skillId || studentId) && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setSkillId("");
                  setStudentId("");
                }}
              >
                ← Xem toàn lớp
              </Button>
            )}
            <select
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                if (e.target.value) setSkillId("");
              }}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs"
            >
              <option value="">— Hoặc chọn 1 học sinh để gợi ý riêng —</option>
              {activeStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} {s.nickname ? `(${s.nickname})` : ""}
                </option>
              ))}
            </select>
          </div>

          {recQ.isLoading || !recQ.data ? (
            <Skeleton className="h-44 w-full rounded-xl" />
          ) : recQ.data.mode === "overview" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Chọn 1 kỹ năng lớp đang yếu hoặc sắp quên để xem danh sách bài tập &amp; học sinh cần củng cố:
              </p>
              {!recQ.data.weakClassSkills?.length ? (
                <p className="rounded-lg border p-6 text-center text-xs text-muted-foreground">
                  Chưa đủ dữ liệu mastery của học sinh. Hãy thử chọn trực tiếp một học sinh ở trên.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {recQ.data.weakClassSkills.map((sk) => (
                    <button
                      key={sk.skillId}
                      type="button"
                      onClick={() => setSkillId(sk.skillId)}
                      className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3 text-left text-xs transition-colors hover:border-primary/50 hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-foreground">{sk.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {sk.topicName} · TB lớp {Math.round(sk.avgMastery * 100)}%
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                        {sk.weakStudentCount}/{sk.evaluatedCount} HS yếu
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {recQ.data.skill && (
                <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                  <p className="font-semibold text-foreground">
                    Kỹ năng: {recQ.data.skill.name} ({recQ.data.skill.topicName})
                  </p>
                  {!!recQ.data.prerequisiteSkills?.length && (
                    <p className="text-[11px] text-muted-foreground">
                      Kỹ năng tiền đề liên quan: {recQ.data.prerequisiteSkills.map((p) => p.name).join(", ")}
                    </p>
                  )}
                </div>
              )}

              {recQ.data.student && (
                <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1.5">
                  <p className="font-semibold text-foreground">
                    Học sinh: {recQ.data.student.fullName}
                  </p>
                  {recQ.data.weakSkills?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {recQ.data.weakSkills.map((w) => (
                        <span key={w.skillId} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          {w.name}: {Math.round(w.mastery * 100)}%{w.dueForReview ? " (cần ôn)" : ""}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Học sinh chưa có kỹ năng yếu rõ rệt.</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-foreground">
                  Nội dung đề xuất ({pickedItemKeys.size}/{recQ.data.suggestedItems?.length ?? 0} đã chọn)
                </p>
                {!recQ.data.suggestedItems?.length ? (
                  <p className="rounded-lg border p-4 text-center text-xs text-muted-foreground">
                    Chưa tìm thấy đề bài hoặc quiz nào đã gắn tag kỹ năng này.
                  </p>
                ) : (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-1.5">
                    {recQ.data.suggestedItems.map((it) => {
                      const targetId = it.problemId || it.quizId || it.lessonId || "";
                      const key = itemKey(it.itemType, targetId);
                      const checked = pickedItemKeys.has(key);
                      return (
                        <label key={key} className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs hover:bg-muted">
                          <div className="flex min-w-0 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setPickedItemKeys((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                })
                              }
                              className="accent-primary"
                            />
                            <ItemTypeIcon type={it.itemType} className="size-3.5 shrink-0 text-primary" />
                            <span className="truncate font-medium">{it.title}</span>
                          </div>
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {it.reason}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-foreground">
                  Học sinh nên giao ({pickedStudentIds.size}/{recQ.data.suggestedStudents?.length ?? 0} đã chọn)
                </p>
                {!recQ.data.suggestedStudents?.length ? (
                  <p className="rounded-lg border p-3 text-center text-xs text-muted-foreground">
                    Không có học sinh nào dưới ngưỡng 70% ở kỹ năng này (bạn vẫn có thể chọn thủ công ở bước tạo phiếu).
                  </p>
                ) : (
                  <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border p-1.5">
                    {recQ.data.suggestedStudents.map((s) => (
                      <label key={s.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted">
                        <div className="flex min-w-0 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pickedStudentIds.has(s.id)}
                            onChange={() =>
                              setPickedStudentIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(s.id)) next.delete(s.id);
                                else next.add(s.id);
                                return next;
                              })
                            }
                            className="accent-primary"
                          />
                          <span className="truncate font-medium">{s.fullName}</span>
                          {s.nickname && <span className="text-[11px] text-muted-foreground">({s.nickname})</span>}
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium tabular-nums text-amber-700 dark:text-amber-300">
                          {Math.round(s.mastery * 100)}%{s.dueForReview ? " · cần ôn" : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={onClose}>
                  Đóng
                </Button>
                <Button type="button" onClick={handleApply}>
                  <Target className="mr-1.5 size-3.5" /> Tạo phiếu giao bài
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
