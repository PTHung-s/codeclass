import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../../lib/api";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import { Button } from "../../components/ui/button";
import {
  ClipboardList, Plus, Clock, Users, ChevronRight, Shield, BookOpen,
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

export default function ExamList() {
  const { user } = useAuthContext();
  const staff = isStaff(user?.role);
  const navigate = useNavigate();

  const q = useQuery<ExamItem[]>({
    queryKey: ["exams"],
    queryFn: () => api.get("/exams").then((r) => r.data),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phòng thi</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">Bài kiểm tra</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {staff
              ? "Tạo đề JSON, sinh testcase, mở thi và giám sát học sinh."
              : "Danh sách đề đang mở. Mỗi đề chỉ có một lượt làm (có thể vào lại trong giờ)."}
          </p>
        </div>
        {staff && (
          <Button onClick={() => navigate("/exams/new")}>
            <Plus className="h-4 w-4" /> Tạo đề từ JSON
          </Button>
        )}
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
      {q.isError && <p className="text-sm text-destructive">Không tải được danh sách đề.</p>}

      {!q.isLoading && (q.data?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium">Chưa có đề thi</p>
          {staff && (
            <Button className="mt-4" variant="outline" onClick={() => navigate("/exams/new")}>
              Upload JSON đề mẫu
            </Button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {q.data?.map((exam) => (
          <button
            key={exam.id}
            type="button"
            onClick={() => navigate(staff ? `/exams/${exam.id}/edit` : `/exams/${exam.id}`)}
            className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left shadow-card transition hover:border-primary/40 hover:bg-muted/30"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-semibold">{exam.title}</h2>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass[exam.status] || statusClass.draft}`}>
                  {statusLabel[exam.status] || exam.status}
                </span>
              </div>
              {exam.description && (
                <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{exam.description}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {exam.durationMinutes} phút
                </span>
                {exam.scale != null && <span>thang {exam.scale}</span>}
                {exam.questionCount != null && (
                  <span>{exam.questionCount} câu</span>
                )}
                {staff && exam.attemptCount != null && (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {exam.attemptCount} lượt
                  </span>
                )}
                {exam.openAt && (
                  <span>mở {new Date(exam.openAt).toLocaleString()}</span>
                )}
                {exam.closeAt && (
                  <span>đóng {new Date(exam.closeAt).toLocaleString()}</span>
                )}
                {exam.antiCheatMode === "nghiem" && (
                  <span className="inline-flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5" /> Chống gian lận
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
