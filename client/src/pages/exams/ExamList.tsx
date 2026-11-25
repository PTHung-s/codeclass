import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import api from "../../lib/api";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";
import {
  BookOpen,
  ChevronRight,
  ClipboardList,
  Clock,
  Plus,
  Search,
  Shield,
  Users,
} from "lucide-react";

type ExamItem = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  durationMinutes: number;
  scale?: number;
  questionCount?: number;
  attemptCount?: number;
  openAt?: string | null;
  closeAt?: string | null;
  antiCheatMode?: string;
};

const statusLabel: Record<string, string> = {
  draft: "Nháp",
  ready: "Sẵn sàng",
  published: "Đang mở",
  closed: "Đã đóng",
  archived: "Lưu trữ",
};

const statusClass: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  ready: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  published: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  closed: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  archived: "bg-muted text-muted-foreground",
};

const STAFF_FILTERS = [
  { value: "all", label: "Tất cả" },
  { value: "published", label: "Đang mở" },
  { value: "ready", label: "Sẵn sàng" },
  { value: "draft", label: "Nháp" },
  { value: "closed", label: "Đã đóng" },
] as const;

export default function ExamList() {
  const { user } = useAuthContext();
  const staff = isStaff(user?.role);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const q = useQuery<ExamItem[]>({
    queryKey: ["exams"],
    queryFn: () => api.get("/exams").then((r) => r.data),
  });

  const exams = q.data ?? [];
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return exams.filter((exam) => {
      if (staff && statusFilter !== "all" && exam.status !== statusFilter) return false;
      if (keyword && !exam.title.toLowerCase().includes(keyword) && !(exam.description || "").toLowerCase().includes(keyword)) {
        return false;
      }
      return true;
    });
  }, [exams, search, staff, statusFilter]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        eyebrow="Phòng thi"
        title="Bài kiểm tra"
        description={
          staff
            ? "Tạo đề JSON, sinh testcase, mở thi và giám sát học sinh."
            : "Danh sách đề đang mở. Mỗi đề chỉ có một lượt làm (có thể vào lại trong giờ)."
        }
        actions={
          staff ? (
            <Button size="sm" onClick={() => navigate("/exams/new")}>
              <Plus className="size-3.5" /> Tạo đề từ JSON
            </Button>
          ) : undefined
        }
      />

      {!q.isLoading && exams.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              data-slot="exam-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm đề kiểm tra..."
              className="h-8 w-full rounded-[7px] border border-border bg-card pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none"
            />
          </div>

          {staff && (
            <div className="inline-flex h-8 flex-wrap items-center rounded-[7px] border border-border bg-muted/50 p-0.5">
              {STAFF_FILTERS.map((f) => {
                const active = statusFilter === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setStatusFilter(f.value)}
                    className={cn(
                      "relative h-7 rounded-[5px] px-2.5 text-xs font-medium transition-colors",
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="exams-status-pill"
                        transition={{ type: "spring", stiffness: 450, damping: 35 }}
                        className="absolute inset-0 rounded-[5px] bg-card shadow-sm"
                      />
                    )}
                    <span className="relative z-10">{f.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {q.isLoading && (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
          ))}
        </div>
      )}

      {q.isError && <p className="text-xs text-destructive">Không tải được danh sách đề.</p>}

      {!q.isLoading && !q.isError && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <ClipboardList className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-2.5 text-sm font-medium">
            {exams.length > 0 ? "Không có đề nào khớp bộ lọc" : "Chưa có đề thi"}
          </p>
          {staff && exams.length === 0 && (
            <Button className="mt-3" size="sm" variant="outline" onClick={() => navigate("/exams/new")}>
              Upload JSON đề mẫu
            </Button>
          )}
        </div>
      )}

      <div className="stagger-in space-y-2.5">
        {filtered.map((exam) => (
          <button
            key={exam.id}
            type="button"
            onClick={() => navigate(staff ? `/exams/${exam.id}/edit` : `/exams/${exam.id}`)}
            className="surface-interactive group flex w-full items-center gap-3.5 rounded-xl border border-border bg-card p-3.5 text-left shadow-card hover:border-primary/40"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold">{exam.title}</h2>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass[exam.status] || statusClass.draft}`}>
                  {statusLabel[exam.status] || exam.status}
                </span>
              </div>
              {exam.description && (
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{exam.description}</p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" /> {exam.durationMinutes} phút
                </span>
                {exam.scale != null && <span>thang {exam.scale}</span>}
                {exam.questionCount != null && <span>{exam.questionCount} câu</span>}
                {staff && exam.attemptCount != null && (
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3" /> {exam.attemptCount} lượt
                  </span>
                )}
                {exam.openAt && <span>mở {new Date(exam.openAt).toLocaleString("vi-VN")}</span>}
                {exam.closeAt && <span>đóng {new Date(exam.closeAt).toLocaleString("vi-VN")}</span>}
                {exam.antiCheatMode === "nghiem" && (
                  <span className="inline-flex items-center gap-1">
                    <Shield className="size-3" /> Chống gian lận
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
