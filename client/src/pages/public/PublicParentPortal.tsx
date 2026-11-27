import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Award,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  CreditCard,
  Flame,
  Printer,
  TrendingUp,
} from "lucide-react";
import api from "../../lib/api";
import { cn } from "../../lib/utils";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

interface ParentPortalData {
  student: {
    id: string;
    fullName: string;
    nickname: string | null;
    avatarUrl: string | null;
  };
  days: number;
  fromDate: string;
  toDate: string;
  metrics: {
    streak: number;
    attendance: {
      held: number;
      present: number;
      late: number;
      absent: number;
      excused: number;
      rate: number | null;
    };
    assignments: {
      total: number;
      passed: number;
      lateCount: number;
      overdueCount: number;
      overdueTitles: string[];
    };
    practice: {
      problemsSolvedInPeriod: number;
      lessonsCompletedInPeriod: number;
      quizzesAttemptedInPeriod: number;
      quizzesPassedInPeriod: number;
      latestExam: { title: string; scoreText: string } | null;
    };
    skills: {
      strongest: Array<{ skillId: string; name: string; mastery: number }>;
      weakest: Array<{ skillId: string; name: string; mastery: number; dueForReview: boolean }>;
    };
  };
  reportText: string;
  problemsSolvedAllTime: number;
  recentAttendance: Array<{ date: string; courseTitle: string; status: string; note: string | null }>;
  recentExams: Array<{
    title: string;
    totalScore: number | null;
    maxScore: number | null;
    gradeStatus: string | null;
    submittedAt: string | null;
  }>;
  tuition: Array<{ period: string; status: string; amount: number | null; paidAt: string | null }>;
}

const ATT_LABEL: Record<string, { label: string; cls: string }> = {
  present: { label: "Có mặt", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  late: { label: "Muộn", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  absent: { label: "Vắng", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  excused: { label: "Có phép", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtMoney(v?: number | null) {
  if (v == null) return "—";
  return `${Math.round(v).toLocaleString("vi-VN")} đ`;
}

export default function PublicParentPortal() {
  const { token } = useParams<{ token: string }>();
  const [days, setDays] = useState<7 | 14 | 30>(7);

  const { data, isLoading, isError } = useQuery<ParentPortalData>({
    queryKey: ["public-parent-portal", token, days],
    queryFn: () => api.get(`/public/parent/${token}`, { params: { days } }).then((r) => r.data),
    enabled: Boolean(token),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-muted-foreground">
        Đang tải cổng thông tin phụ huynh...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
        <AlertTriangle className="mb-3 h-10 w-10 text-amber-500" />
        <h1 className="text-lg font-bold text-foreground">Liên kết không hợp lệ hoặc đã hết hạn</h1>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          Vui lòng liên hệ giáo viên lớp học để được cấp lại đường dẫn theo dõi học tập của con.
        </p>
      </div>
    );
  }

  const { student, metrics } = data;
  const assignPct =
    metrics.assignments.total > 0
      ? Math.round((metrics.assignments.passed / metrics.assignments.total) * 100)
      : 100;

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-6 print:bg-white">
      <div className="mx-auto max-w-4xl space-y-5">
        {/* Header */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
                {student.fullName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  Cổng thông tin Phụ huynh · CodeClass
                </p>
                <h1 className="text-xl font-bold text-foreground">
                  {student.fullName}
                  {student.nickname ? (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">({student.nickname})</span>
                  ) : null}
                </h1>
                <p className="text-xs text-muted-foreground">
                  Kỳ báo cáo: {fmtDate(data.fromDate)} – {fmtDate(data.toDate)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
                {([7, 14, 30] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(d)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      days === d ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {d} ngày
                  </button>
                ))}
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" /> In / Lưu PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarCheck className="h-4 w-4 text-emerald-500" /> Chuyên cần
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                {metrics.attendance.rate != null ? `${metrics.attendance.rate}%` : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {metrics.attendance.present}/{metrics.attendance.held} buổi có mặt
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ClipboardCheck className="h-4 w-4 text-blue-500" /> Bài tập giao
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                {metrics.assignments.passed}/{metrics.assignments.total}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Đạt {assignPct}% {metrics.assignments.overdueCount > 0 ? `· ${metrics.assignments.overdueCount} quá hạn` : ""}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Code2 className="h-4 w-4 text-primary" /> Bài code đạt
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                +{metrics.practice.problemsSolvedInPeriod}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Tổng lũy kế: {data.problemsSolvedAllTime} bài
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Flame className="h-4 w-4 text-amber-500" /> Chuỗi học tập
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                {metrics.streak} ngày
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {metrics.practice.quizzesPassedInPeriod}/{metrics.practice.quizzesAttemptedInPeriod} quiz đạt
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Overdue warning */}
        {metrics.assignments.overdueCount > 0 && (
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-200">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Còn {metrics.assignments.overdueCount} bài tập quá hạn cần hoàn thành:
            </p>
            <p className="mt-1">{metrics.assignments.overdueTitles.join(", ")}</p>
          </div>
        )}

        {/* Skills Breakdown */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <TrendingUp className="h-4 w-4 text-emerald-500" /> Điểm mạnh nổi bật
              </h2>
              {metrics.skills.strongest.length === 0 ? (
                <p className="text-xs text-muted-foreground">Chưa đủ dữ liệu đánh giá kỹ năng.</p>
              ) : (
                metrics.skills.strongest.map((sk) => (
                  <div key={sk.skillId} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-foreground">{sk.name}</span>
                      <span className="font-semibold tabular-nums text-emerald-600">
                        {Math.round(sk.mastery * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.round(sk.mastery * 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Kỹ năng cần củng cố
              </h2>
              {metrics.skills.weakest.length === 0 ? (
                <p className="text-xs text-muted-foreground">Các kỹ năng đã đánh giá đều đang ở mức ổn định.</p>
              ) : (
                metrics.skills.weakest.map((sk) => (
                  <div key={sk.skillId} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-foreground">{sk.name}</span>
                      <span className="font-semibold tabular-nums text-amber-600">
                        {Math.round(sk.mastery * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${Math.round(sk.mastery * 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Exams & Attendance */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-2.5 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Award className="h-4 w-4 text-primary" /> Bài kiểm tra gần đây
              </h2>
              {data.recentExams.length === 0 ? (
                <p className="text-xs text-muted-foreground">Chưa có bài kiểm tra nào.</p>
              ) : (
                <div className="divide-y">
                  {data.recentExams.map((ex, i) => (
                    <div key={i} className="flex items-center justify-between py-2 text-xs">
                      <div className="min-w-0 pr-2">
                        <p className="truncate font-medium text-foreground">{ex.title}</p>
                        {ex.submittedAt && (
                          <p className="text-[10px] text-muted-foreground">{fmtDate(ex.submittedAt)}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className="shrink-0 tabular-nums">
                        {ex.totalScore != null
                          ? `${Math.round(ex.totalScore * 10) / 10}${ex.maxScore != null ? `/${Math.round(ex.maxScore * 10) / 10}` : ""}`
                          : "Chờ chấm"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2.5 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <CalendarCheck className="h-4 w-4 text-emerald-500" /> Lịch sử điểm danh gần đây
              </h2>
              {data.recentAttendance.length === 0 ? (
                <p className="text-xs text-muted-foreground">Chưa có dữ liệu điểm danh.</p>
              ) : (
                <div className="divide-y">
                  {data.recentAttendance.slice(0, 6).map((att, i) => {
                    const meta = ATT_LABEL[att.status] || { label: att.status, cls: "bg-muted text-muted-foreground" };
                    return (
                      <div key={i} className="flex items-center justify-between py-2 text-xs">
                        <div className="min-w-0 pr-2">
                          <p className="truncate font-medium text-foreground">{att.courseTitle}</p>
                          <p className="text-[10px] text-muted-foreground">{fmtDate(att.date)}</p>
                        </div>
                        <Badge variant="secondary" className={cn("shrink-0 text-[10px]", meta.cls)}>
                          {meta.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tuition */}
        {data.tuition.length > 0 && (
          <Card>
            <CardContent className="space-y-2.5 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <CreditCard className="h-4 w-4 text-primary" /> Tình trạng học phí
              </h2>
              <div className="grid gap-2 sm:grid-cols-3">
                {data.tuition.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-foreground">Kỳ {t.period}</p>
                      <p className="text-[11px] text-muted-foreground">{fmtMoney(t.amount)}</p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px]",
                        t.status === "paid"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                      )}
                    >
                      {t.status === "paid" ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Đã đóng
                        </span>
                      ) : (
                        "Chưa đóng"
                      )}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Teacher Summary Text */}
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-2 text-sm font-bold text-foreground">Tổng kết từ Giáo viên</h2>
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-sans text-xs leading-relaxed text-foreground">
              {data.reportText}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
