import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Code,
  ExternalLink,
  Plus,
  Search,
  SquarePen,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

interface StaffAssignment {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  status: string;
  createdAt: string;
  problem: { id: string; title: string; difficulty: string } | null;
  course: { id: string; title: string } | null;
  createdBy: { id: string; fullName: string };
  stats: { assigned: number; done: number; passed: number; notStarted: number; late: number };
}

interface AssignmentDetail {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  status: string;
  problem: { id: string; title: string; difficulty: string } | null;
  course: { id: string; title: string } | null;
  stats: { assigned: number; done: number; passed: number; notStarted: number; late: number };
  rows: {
    student: { id: string; fullName: string; nickname: string | null; email: string; avatarUrl: string | null };
    status: "not_started" | "attempting" | "passed";
    attempts: number;
    passed: boolean;
    firstAttemptAt: string | null;
    lastAttemptAt: string | null;
    late: boolean;
  }[];
}

interface StudentLite {
  id: string;
  fullName: string;
  nickname: string | null;
  email: string;
  avatarUrl: string | null;
}

interface ProblemLite {
  id: string;
  title: string;
  difficulty?: string;
}

/** API trả mảng thuần khi không gửi page/limit; trả envelope {problems: [...]} khi có — unwrap cả hai. */
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
  return new Date(value).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function difficultyLabel(d?: string) {
  if (!d) return "";
  const map: Record<string, string> = { easy: "Dễ", medium: "Trung bình", hard: "Khó" };
  return map[d] ?? d;
}

function difficultyClass(d?: string) {
  switch (d) {
    case "easy":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "hard":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
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

export default function Assignments() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffAssignment | null>(null);

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
      done: all.reduce((s, a) => s + a.stats.done, 0),
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
        (a.course?.title && a.course.title.toLowerCase().includes(q)),
    );
  }, [assignments, searchQuery]);

  return (
    <ErrorBoundary>
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        eyebrow="Lớp học"
        title="Bài tập"
        description="Giao bài từ thư viện đề cho học sinh và theo dõi tiến độ làm bài."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" /> Giao bài tập
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Bài đang mở", value: totals.count, icon: ClipboardList, tone: "bg-primary/10 text-primary" },
          { label: "Lượt giao", value: totals.assigned, icon: Users, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
          { label: "Đã làm", value: totals.done, icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
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

        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            data-slot="assignments-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm bài tập, đề bài..."
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
          </CardContent>
        </Card>
      ) : (
        <div className="stagger-in space-y-2.5">
          {filteredAssignments.map((a) => {
            const overdue = a.deadline && new Date(a.deadline) < new Date();
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
                      {overdue && a.stats.notStarted > 0 && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">Quá hạn</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-muted-foreground">
                      {a.problem && (
                        <span className="inline-flex items-center gap-1">
                          <Code className="size-3" /> {a.problem.title}
                          {a.problem.difficulty && (
                            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", difficultyClass(a.problem.difficulty))}>
                              {difficultyLabel(a.problem.difficulty)}
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
                      <Progress value={a.stats.done} total={a.stats.assigned} />
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Đã đạt <span className="font-medium text-emerald-600 dark:text-emerald-400">{a.stats.passed}</span>
                        {a.stats.late > 0 && <> · Nộp muộn {a.stats.late}</>}
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

      <CreateAssignmentDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <AssignmentDetailDialog detailId={detailId} onClose={() => setDetailId(null)} onArchive={(id, status) => archiveMutation.mutate({ id, status })} />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Xóa bài tập?"
        message={`Bài tập "${deleteTarget?.title}" sẽ bị xóa vĩnh viễn khỏi danh sách của học sinh. Lịch sử nộp bài trên đề không bị ảnh hưởng.`}
        confirmLabel="Xóa"
        variant="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
    </ErrorBoundary>
  );
}

// ───────────────────────── Dialog tạo bài tập ─────────────────────────

function CreateAssignmentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [problem, setProblem] = useState<ProblemLite | null>(null);
  const [courseId, setCourseId] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [deadline, setDeadline] = useState("");
  const [description, setDescription] = useState("");

  const { data: problems } = useQuery<ProblemLite[]>({
    queryKey: ["assignments", "problem-options", search],
    // /api/search chỉ trả field nhẹ (id/title/difficulty/tags) — tránh kéo statement + testCases
      // (~MB/bài, 50 bài ≈ 23MB) và né envelope phân trang của /api/problems.
      // Search rỗng → không có đề, hiện hint gõ để tìm.
      queryFn: () => api.get("/search", { params: { q: search, limit: 20 } }).then((r) => asArray<ProblemLite>(r.data, "problems")),
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
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post("/assignments", payload).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      toast.success({ title: "Đã giao bài tập", message: `Đã thông báo cho ${res.assignedCount} học sinh.` });
      setTitle("");
      setSearch("");
      setProblem(null);
      setCourseId("");
      setSelectedStudents(new Set());
      setDeadline("");
      setDescription("");
      onClose();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error({ title: "Không tạo được bài tập", message: err.response?.data?.error });
    },
  });

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectCourse = (id: string) => {
    setCourseId(id);
    if (!id) return;
    api.get("/students", { params: { courseId: id } }).then((r) => {
      setSelectedStudents((prev) => {
        const next = new Set(prev);
        (r.data as StudentLite[]).forEach((s) => next.add(s.id));
        return next;
      });
    });
  };

  const filteredProblems = (problems ?? []).filter((p) => p.id !== problem?.id);
  const selectedList = (students ?? []).filter((s) => selectedStudents.has(s.id));

  const submit = () => {
    if (!title.trim()) {
      toast.error({ title: "Cần tiêu đề bài tập" });
      return;
    }
    if (!problem) {
      toast.error({ title: "Cần chọn đề bài từ thư viện" });
      return;
    }
    if (!selectedStudents.size) {
      toast.error({ title: "Cần chọn ít nhất một học sinh" });
      return;
    }
    createMutation.mutate({
      title: title.trim(),
      problemId: problem.id,
      description,
      courseId: courseId || undefined,
      studentIds: [...selectedStudents],
      deadline: deadline ? new Date(deadline).toISOString() : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Giao bài tập mới</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tiêu đề</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Bài tập tuần 3 — vòng lặp" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Đề bài (từ thư viện đề)</label>
            {problem ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <Code className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{problem.title}</span>
                  {problem.difficulty && (
                    <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium", difficultyClass(problem.difficulty))}>
                      {difficultyLabel(problem.difficulty)}
                    </span>
                  )}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setProblem(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm đề theo tên..." className="pl-8" />
                </div>
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-1.5">
                  {!problems?.length ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">
                      {search.trim() ? "Không tìm thấy đề phù hợp." : "Gõ vài chữ để tìm đề trong thư viện..."}
                    </p>
                  ) : (
                    filteredProblems.map((p) => (
                      <button
                        key={p.id}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setProblem(p);
                          setSearch("");
                        }}
                      >
                        <span className="truncate">{p.title}</span>
                        {p.difficulty && (
                          <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium", difficultyClass(p.difficulty))}>
                            {difficultyLabel(p.difficulty)}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Khóa học (không bắt buộc)</label>
            <select
                data-slot="assignment-course-select"
                value={courseId}
                onChange={(e) => selectCourse(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs"
              >
                <option value="">— Chọn nhanh theo khóa —</option>
                {(courses ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Hạn chót (không bắt buộc)</label>
              <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Học sinh nhận bài</label>
              <span className="text-xs text-muted-foreground">Đã chọn {selectedStudents.size}</span>
            </div>
            {!!selectedList.length && (
              <div className="flex flex-wrap gap-1.5 rounded-lg border bg-muted/40 p-2">
                {selectedList.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {s.nickname || s.fullName}
                    <button onClick={() => toggleStudent(s.id)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border p-1.5">
              {students?.length ? (
                students.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <input type="checkbox" checked={selectedStudents.has(s.id)} onChange={() => toggleStudent(s.id)} className="accent-primary" />
                    <StudentAvatar fullName={s.fullName} nickname={s.nickname} avatarUrl={s.avatarUrl} size="sm" />
                    <span className="truncate">{s.fullName}</span>
                    <span className="truncate text-xs text-muted-foreground">{s.email}</span>
                  </label>
                ))
              ) : (
                <p className="p-3 text-center text-xs text-muted-foreground">Đang tải danh sách học sinh...</p>
              )}
            </div>
          </div>

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
            <Button variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button onClick={submit} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Plus className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              Giao bài tập
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Dialog chi tiết ─────────────────────────

function AssignmentDetailDialog({ detailId, onClose, onArchive }: { detailId: string | null; onClose: () => void; onArchive: (id: string, status: string) => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [addStudentId, setAddStudentId] = useState("");

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

  const addMutation = useMutation({
    mutationFn: (studentIds: string[]) => api.patch(`/assignments/${detailId}`, { studentIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignment-detail", detailId] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      setAddStudentId("");
      toast.success({ title: "Đã thêm học sinh vào bài tập" });
    },
    onError: () => toast.error({ title: "Không thêm được học sinh" }),
  });

  const assignedIds = new Set((detail?.rows ?? []).map((r) => r.student.id));
  const remainingStudents = (allStudents ?? []).filter((s) => !assignedIds.has(s.id));

  return (
    <Dialog open={!!detailId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        {isLoading || !detail ? (
          <div className="flex items-center justify-center py-10">
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{detail.title}</DialogTitle>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {detail.problem && (
                <Link to={`/problems/${detail.problem.id}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                  <Code className="h-3.5 w-3.5" /> {detail.problem.title}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
              {detail.course && (
                <span className="inline-flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" /> {detail.course.title}
                </span>
              )}
              <span>Hạn chót: {detail.deadline ? fmtDate(detail.deadline) : "Không có"}</span>
              <span>
                Đã đạt <span className="font-medium text-emerald-600 dark:text-emerald-400">{detail.stats.passed}</span> · Đã làm {detail.stats.done}/
                {detail.stats.assigned}
              </span>
            </div>
            {detail.description && <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{detail.description}</p>}

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Học sinh</th>
                    <th className="px-3 py-1.5 font-medium">Trạng thái</th>
                    <th className="px-3 py-1.5 text-center font-medium">Lượt nộp</th>
                    <th className="px-3 py-1.5 font-medium">Lần đầu nộp</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {detail.rows.map((r) => (
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
                        {r.status === "passed" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Đã đạt{r.late ? " (muộn)" : ""}
                          </span>
                        ) : r.status === "attempting" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                            <SquarePen className="h-3 w-3" /> Đã làm{r.late ? " (muộn)" : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Chưa làm</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{r.attempts}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.firstAttemptAt ? fmtDate(r.firstAttemptAt) : "—"}</td>
                    </tr>
                  ))}
                  {!detail.rows.length && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">
                        Chưa có học sinh nào được giao bài này.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <UserPlus className="h-4 w-4 text-muted-foreground" />
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
                <Button variant="outline" size="sm" disabled={!addStudentId || addMutation.isPending} onClick={() => addMutation.mutate([addStudentId])}>
                  Thêm
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => detail && onArchive(detail.id, detail.status === "archived" ? "published" : "archived")}
              >
                {detail.status === "archived" ? <ArchiveRestore className="mr-1.5 h-4 w-4" /> : <Archive className="mr-1.5 h-4 w-4" />}
                {detail.status === "archived" ? "Mở lại" : "Lưu trữ"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
