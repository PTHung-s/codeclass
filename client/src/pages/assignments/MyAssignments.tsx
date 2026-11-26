import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../../lib/api";
import { PageHeader } from "../../components/ui/page-header";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import {
  AlarmClock,
  Award,
  BookOpen,
  CheckCircle2,
  Circle,
  Code,
  ExternalLink,
  FileText,
  HelpCircle,
  ListChecks,
  Lock,
  PenLine,
} from "lucide-react";

type ItemType = "problem" | "quiz" | "lesson";

interface MyAssignmentItem {
  id: string;
  itemType: ItemType;
  problemId: string | null;
  quizId: string | null;
  lessonId: string | null;
  title: string;
  difficulty: string | null;
  courseTitle: string | null;
  linkPath: string;
  status: "not_started" | "attempting" | "passed";
  attempts: number;
  passed: boolean;
  isLate: boolean;
  closedAfterDeadline: boolean;
  scoreLabel: string | null;
}

interface MyAssignment {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  createdAt: string;
  submissionType: string;
  strictDeadline: boolean;
  rewardOnTime: boolean;
  expectedTokens: number;
  expectedXp: number;
  rewardedAt: string | null;
  completedAt: string | null;
  problem: { id: string; title: string; difficulty: string } | null;
  course: { id: string; title: string } | null;
  items: MyAssignmentItem[];
  completedItems: number;
  totalItems: number;
  attempts: number;
  firstAttemptAt: string | null;
  lastAttemptAt: string | null;
  status: "not_started" | "attempting" | "passed";
  isLate: boolean;
  overdue: boolean;
  locked: boolean;
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

function difficultyLabel(d?: string | null) {
  if (!d) return "";
  const map: Record<string, string> = { easy: "Dễ", medium: "Trung bình", hard: "Khó" };
  return map[d] ?? d;
}

function ItemTypeIcon({ type, className = "size-3.5" }: { type: ItemType; className?: string }) {
  if (type === "quiz") return <HelpCircle className={className} />;
  if (type === "lesson") return <FileText className={className} />;
  return <Code className={className} />;
}

function singleItemActionLabel(item: MyAssignmentItem, status: MyAssignment["status"], locked: boolean) {
  if (locked) return "Luyện thêm";
  if (status === "passed") {
    if (item.itemType === "quiz") return "Xem lại quiz";
    if (item.itemType === "lesson") return "Xem lại bài";
    return "Xem đề";
  }
  if (status === "attempting") return "Làm tiếp";
  if (item.itemType === "quiz") return "Làm quiz";
  if (item.itemType === "lesson") return "Học bài";
  return "Vào làm bài";
}

function StatusChip({ a }: { a: MyAssignment }) {
  if (a.status === "passed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3.5" /> Đã đạt{a.isLate ? " (muộn)" : ""}
      </span>
    );
  }
  if (a.status === "attempting") {
    const label = a.totalItems > 1 ? `Đang làm · ${a.completedItems}/${a.totalItems} mục` : `Đang làm · ${a.attempts} lượt`;
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
        <PenLine className="size-3.5" /> {label}
        {a.isLate ? " (muộn)" : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <Circle className="size-3.5" /> Chưa làm
    </span>
  );
}

export default function MyAssignments() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"todo" | "done" | "all">("todo");

  const { data, isLoading, isError } = useQuery<MyAssignment[]>({
    queryKey: ["assignments", "mine"],
    queryFn: () => api.get("/assignments/mine").then((r) => asArray<MyAssignment>(r.data)),
  });

  const counts = useMemo(() => {
    const all = data ?? [];
    return {
      todo: all.filter((a) => a.status !== "passed").length,
      done: all.filter((a) => a.status === "passed").length,
      all: all.length,
    };
  }, [data]);

  const rows = useMemo(() => {
    const all = data ?? [];
    if (filter === "todo") return all.filter((a) => a.status !== "passed");
    if (filter === "done") return all.filter((a) => a.status === "passed");
    return all;
  }, [data, filter]);

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-5xl space-y-4">
        <PageHeader
          eyebrow="Bài tập"
          title="Bài tập của tôi"
          description="Các bài tập code, quiz và bài học giáo viên giao cho bạn. Hoàn thành đúng hạn để nhận thêm thưởng."
        />

        {isLoading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="p-8 text-center text-xs text-muted-foreground">Không tải được bài tập. Vui lòng thử lại sau.</CardContent>
          </Card>
        ) : !data?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2.5 p-8 text-center">
              <ListChecks className="size-8 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">Hiện bạn chưa được giao bài tập nào. Bài mới sẽ xuất hiện ở đây khi giáo viên giao.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="inline-flex h-8 items-center rounded-[7px] border border-border bg-muted/50 p-0.5">
              {(
                [
                  ["todo", `Cần làm (${counts.todo})`],
                  ["done", `Đã đạt (${counts.done})`],
                  ["all", `Tất cả (${counts.all})`],
                ] as const
              ).map(([key, label]) => {
                const active = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={cn(
                      "relative h-7 rounded-[5px] px-3 text-xs font-medium transition-colors",
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="my-assignments-filter-pill"
                        transition={{ type: "spring", stiffness: 450, damping: 35 }}
                        className="absolute inset-0 rounded-[5px] bg-card shadow-sm"
                      />
                    )}
                    <span className="relative z-10">{label}</span>
                  </button>
                );
              })}
            </div>

            <div className="stagger-in space-y-2.5">
              {rows.map((a) => {
                const singleItem = a.items?.length <= 1 ? a.items[0] : null;
                const fallbackLink = singleItem?.linkPath || (a.problem ? `/problems/${a.problem.id}` : null);
                return (
                  <Card key={a.id} className={cn("surface-interactive group", a.overdue && "border-destructive/40")}>
                    <CardContent className="space-y-2.5 p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-[13px] font-semibold">{a.title}</p>
                            <StatusChip a={a} />
                            {a.locked ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                                <Lock className="size-3" /> Đã đóng sau hạn
                              </span>
                            ) : a.overdue ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                                <AlarmClock className="size-3" /> Quá hạn
                              </span>
                            ) : null}
                            {a.rewardOnTime && (a.expectedTokens > 0 || a.expectedXp > 0) && (
                              a.rewardedAt ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                  <Award className="size-3" /> Đã nhận thưởng đúng hạn
                                </span>
                              ) : !a.isLate && !a.locked && a.status !== "passed" ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                  <Award className="size-3" /> +{a.expectedTokens}T · +{a.expectedXp} XP đúng hạn
                                </span>
                              ) : null
                            )}
                          </div>
                          {a.description && <p className="line-clamp-2 text-xs text-muted-foreground">{a.description}</p>}
                          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-muted-foreground">
                            {singleItem && (
                              <span className="inline-flex items-center gap-1">
                                <ItemTypeIcon type={singleItem.itemType} className="size-3" /> {singleItem.title}
                                {difficultyLabel(singleItem.difficulty) && (
                                  <span className="opacity-70">· {difficultyLabel(singleItem.difficulty)}</span>
                                )}
                              </span>
                            )}
                            {!singleItem && a.items?.length > 1 && (
                              <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                                <ListChecks className="size-3" /> {a.completedItems}/{a.totalItems} mục hoàn thành
                              </span>
                            )}
                            {a.course && (
                              <span className="inline-flex items-center gap-1">
                                <BookOpen className="size-3" /> {a.course.title}
                              </span>
                            )}
                            <span className={cn("inline-flex items-center gap-1", a.overdue && "font-medium text-destructive")}>
                              <AlarmClock className="size-3" /> Hạn: {a.deadline ? fmtDate(a.deadline) : "Không có"}
                            </span>
                            {a.attempts > 0 && <span>Lần gần nhất: {fmtDate(a.lastAttemptAt)}</span>}
                          </div>
                        </div>

                        {singleItem && fallbackLink && (
                          <Button
                            variant={a.status === "passed" || a.locked ? "outline" : "default"}
                            size="sm"
                            onClick={() => navigate(fallbackLink)}
                          >
                            {singleItemActionLabel(singleItem, a.status, a.locked)}
                            <ExternalLink className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                          </Button>
                        )}
                      </div>

                      {a.locked && (
                        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive">
                          Đã quá hạn khóa chấm — bạn vẫn có thể mở để luyện tập thêm nhưng hệ thống không tính hoàn thành bài tập.
                        </div>
                      )}

                      {a.items && a.items.length > 1 && (
                        <div className="divide-y rounded-lg border bg-muted/20">
                          {a.items.map((it, idx) => (
                            <div key={it.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                              <div className="flex min-w-0 items-center gap-2">
                                {it.passed ? (
                                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                                ) : it.status === "attempting" ? (
                                  <PenLine className="size-3.5 shrink-0 text-amber-500" />
                                ) : (
                                  <Circle className="size-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="text-[11px] text-muted-foreground tabular-nums">{idx + 1}.</span>
                                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  <ItemTypeIcon type={it.itemType} className="size-3" />
                                  {it.itemType === "quiz" ? "Quiz" : it.itemType === "lesson" ? "Bài học" : "Code"}
                                </span>
                                <span className={cn("truncate font-medium", it.passed && "text-muted-foreground")}>{it.title}</span>
                                {it.scoreLabel && (
                                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                    {it.scoreLabel}
                                  </span>
                                )}
                                {it.isLate && (
                                  <span className="text-[10px] text-amber-600 dark:text-amber-400">(muộn)</span>
                                )}
                              </div>
                              <Button
                                variant={it.passed || a.locked ? "ghost" : "outline"}
                                size="xs"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => navigate(it.linkPath)}
                              >
                                {it.passed ? "Xem lại" : it.status === "attempting" ? "Làm tiếp" : "Làm"}
                                <ExternalLink className="ml-1 size-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
