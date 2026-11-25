import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { PageHeader } from "../../components/ui/page-header";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import {
  AlarmClock,
  BookOpen,
  CheckCircle2,
  Circle,
  Code,
  ExternalLink,
  ListChecks,
  PenLine,
} from "lucide-react";

interface MyAssignment {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  createdAt: string;
  problem: { id: string; title: string; difficulty: string } | null;
  course: { id: string; title: string } | null;
  attempts: number;
  firstAttemptAt: string | null;
  lastAttemptAt: string | null;
  status: "not_started" | "attempting" | "passed";
  isLate: boolean;
  overdue: boolean;
}

/** API trả mảng thuần khi không gửi page/limit; trả envelope khi có — unwrap cả hai. */
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

function StatusChip({ a }: { a: MyAssignment }) {
  if (a.status === "passed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> Đã đạt{a.isLate ? " (muộn)" : ""}
      </span>
    );
  }
  if (a.status === "attempting") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
        <PenLine className="h-3.5 w-3.5" /> Đã làm · {a.attempts} lượt{a.isLate ? " (muộn)" : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <Circle className="h-3.5 w-3.5" /> Chưa làm
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Bài tập"
        title="Bài tập của tôi"
        description="Các bài tập giáo viên giao cho bạn. Vào đề, làm bài và nộp như khi luyện tập — kết quả chấm tự động cập nhật vào đây."
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">Không tải được bài tập. Vui lòng thử lại sau.</CardContent>
        </Card>
      ) : !data?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <ListChecks className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Hiện bạn chưa được giao bài tập nào. Bài mới sẽ xuất hiện ở đây khi giáo viên giao.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["todo", `Cần làm (${counts.todo})`],
                ["done", `Đã đạt (${counts.done})`],
                ["all", `Tất cả (${counts.all})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {rows.map((a) => (
              <Card key={a.id} className={cn("transition-colors", a.overdue && "border-destructive/40")}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{a.title}</p>
                      <StatusChip a={a} />
                      {a.overdue && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                          <AlarmClock className="h-3 w-3" /> Quá hạn
                        </span>
                      )}
                    </div>
                    {a.description && <p className="line-clamp-2 text-xs text-muted-foreground">{a.description}</p>}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {a.problem && (
                        <span className="inline-flex items-center gap-1">
                          <Code className="h-3.5 w-3.5" /> {a.problem.title}
                          {difficultyLabel(a.problem.difficulty) && <span className="opacity-70">· {difficultyLabel(a.problem.difficulty)}</span>}
                        </span>
                      )}
                      {a.course && (
                        <span className="inline-flex items-center gap-1">
                          <BookOpen className="h-3.5 w-3.5" /> {a.course.title}
                        </span>
                      )}
                      <span className={cn("inline-flex items-center gap-1", a.overdue && "font-medium text-destructive")}>
                        <AlarmClock className="h-3.5 w-3.5" /> Hạn: {a.deadline ? fmtDate(a.deadline) : "Không có"}
                      </span>
                      {a.attempts > 0 && <span>Lần nộp gần nhất: {fmtDate(a.lastAttemptAt)}</span>}
                    </div>
                  </div>
                  {a.problem && (
                    <Button
                      variant={a.status === "passed" ? "outline" : "default"}
                      size="sm"
                      onClick={() => navigate(`/problems/${a.problem!.id}`)}
                    >
                      {a.status === "not_started" ? "Vào làm bài" : a.status === "passed" ? "Xem đề" : "Làm tiếp"}
                      <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
    </ErrorBoundary>
  );
}
