import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../../lib/api";
import { BookOpen, AlertTriangle, Code, Keyboard, Timer, TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, Zap, ChevronDown, CalendarCheck, Radar, Copy, KeyRound, ClipboardCheck, FileText, Target, ListChecks, Lock, Video, Share2, RefreshCw, Trash2, ExternalLink } from "lucide-react";
import { SkeletonCard } from "../../components/ui/skeletons";
import { DifficultyBadge } from "../../components/ui/Badges";
import { useAuthContext } from "../../contexts/AuthContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { Avatar } from "../../components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { RadarChart, groupSkillsByTopic, topicsForLanguage, skillsForLanguage, type SkillLanguage } from "../../components/skills/RadarChart";
import type { SkillState, TopicGroup } from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { useConfirmContext } from "../../hooks/useConfirm";
import { StudentName } from "../../components/ui/StudentName";
import { StreakHistoryManagePanel } from "../../components/streak/StreakHistory";

interface PracticeLog {
  id: string;
  problemId: string;
  problemTitle: string;
  difficulty: string;
  typingSpeed: number | null;
  activeTimeSeconds: number | null;
  totalTimeSeconds: number | null;
  codeLength: number;
  createdAt: string;
}

interface PracticeAnalytics {
  totalProblemsSolved: number;
  avgTypingSpeed: number | null;
  avgTimePerProblem: number | null;
  totalActiveTimeSeconds: number;
  heatmapDays: { date: string; count: number }[];
  timeHeatmapDays: { date: string; seconds: number }[];
  practiceLogs: PracticeLog[];
}

export default function StudentProfile() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const toast = useToast();
  const confirm = useConfirmContext();
  const isStaff = user?.role === "teacher" || user?.role === "teaching_assistant" || user?.role === "admin";
  const isAdmin = user?.role === "admin";
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [parentLinkOpen, setParentLinkOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["student", studentId],
    queryFn: () => api.get(`/students/${studentId}`).then((r) => r.data),
    enabled: !!studentId,
  });

  // Teacher-visible: quiz attempts
  // Heavy staff queries wait for the base profile (`data`) so mount doesn't
  // fan out 6–8 parallel requests at once.
  const quizQ = useQuery({
    queryKey: ["student-quizzes", studentId],
    queryFn: () => api.get(`/students/${studentId}/quizzes`).then((r) => r.data),
    enabled: !!studentId && isStaff && !!data,
    staleTime: 60 * 1000,
  });

  // Teacher-visible: adaptive test attempts
  const adaptiveQ = useQuery({
    queryKey: ["student-adaptive-tests", studentId],
    queryFn: () => api.get(`/students/${studentId}/adaptive-tests`).then((r) => r.data),
    enabled: !!studentId && isStaff && !!data,
    staleTime: 60 * 1000,
  });

  // Attendance stats (teacher view)
  const attQ = useQuery({
    queryKey: ["student-attendance", studentId],
    queryFn: () => api.get(`/students/${studentId}/attendance`).then((r) => r.data),
    enabled: !!studentId && isStaff && !!data,
    staleTime: 60 * 1000,
  });

  // Time tracking stats (teacher view)
  const trackQ = useQuery({
    queryKey: ["student-tracking", studentId],
    queryFn: () => api.get(`/tracking/stats?userId=${studentId}&days=30`).then((r) => r.data),
    enabled: !!studentId && isStaff && !!data,
    staleTime: 60 * 1000,
  });

  // Skill evidence is shared with the student dashboard; staff can view it for any student.
  const skillsQ = useQuery({
    queryKey: ["student-skills", studentId],
    queryFn: () => api.get(`/skills/${studentId}`).then((r) => r.data as SkillState[]),
    enabled: !!studentId && isStaff && !!data,
    staleTime: 60 * 1000,
  });

  const skillTopicsQ = useQuery({
    queryKey: ["skill-topics"],
    queryFn: () => api.get("/skills").then((r) => r.data as TopicGroup[]),
    enabled: isStaff,
    staleTime: 5 * 60 * 1000,
  });

  const examsQ = useQuery<any[]>({
    queryKey: ["student-exams", studentId],
    queryFn: () => api.get(`/students/${studentId}/exams`).then((r) => r.data),
    enabled: !!studentId && !!data,
    staleTime: 60 * 1000,
  });

  const meetingsQ = useQuery<{
    attendances: Array<{
      id: string;
      roomId: string;
      roomTitle: string;
      courseTitle?: string | null;
      hostName: string;
      joinedAt: string;
      durationSeconds: number;
      points: number;
      violations: number;
    }>;
    quizSubmissions: Array<{
      id: string;
      sessionId: string;
      roomId: string;
      roomTitle: string;
      courseTitle?: string | null;
      title: string;
      kind: string;
      score: number;
      totalQuestions: number;
      accuracy: number;
      timeTaken: number;
      rank?: number | null;
      completedAt: string;
    }>;
  }>({
    queryKey: ["student-meetings", studentId],
    queryFn: () => api.get(`/students/${studentId}/meetings`).then((r) => r.data),
    enabled: !!studentId && !!data,
    staleTime: 60 * 1000,
  });

  const assignmentsQ = useQuery<{
    summary: { total: number; passed: number; attempting: number; notStarted: number; late: number; overdue: number; locked: number; completionRate: number };
    assignments: Array<{
      id: string;
      title: string;
      deadline: string | null;
      course: { id: string; title: string } | null;
      status: "not_started" | "attempting" | "passed";
      completedItems: number;
      totalItems: number;
      attempts: number;
      isLate: boolean;
      overdue: boolean;
      locked: boolean;
    }>;
  }>({
    queryKey: ["student-assignments", studentId],
    queryFn: () => api.get(`/students/${studentId}/assignments`).then((r) => r.data),
    enabled: !!studentId && !!data,
    staleTime: 60 * 1000,
  });
  const attStats = attQ.data?.stats;

  const resetPassword = useMutation({
    mutationFn: () => api.post(`/students/${studentId}/reset-password`).then((r) => r.data),
    onSuccess: (result) => {
      setTemporaryPassword(result.temporaryPassword);
      toast.success({ title: "Đã tạo mật khẩu tạm", message: "Chỉ hiển thị tại đây một lần. Học sinh phải đổi lại sau khi đăng nhập." });
    },
    onError: (err: any) => toast.error({ title: "Không thể đặt lại mật khẩu", message: err.response?.data?.error || "Vui lòng thử lại." }),
  });

  if (isLoading) return <div className="max-w-5xl mx-auto space-y-6"><SkeletonCard /></div>;
  if (error) {
    const message = (error as any)?.response?.data?.error || "Không tải được tổng quan của học viên";
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-700 dark:text-red-400">
        {message}
      </div>
    );
  }
  if (!data) return <div className="text-muted-foreground">Không tìm thấy học viên</div>;

  const { user: student, enrolledCourses, courseProgress, chapterProgress, clearedModuleIds, badges, practiceAnalytics } = data;
  const pa: PracticeAnalytics = practiceAnalytics || { totalProblemsSolved: 0, avgTypingSpeed: null, avgTimePerProblem: null, totalActiveTimeSeconds: 0, heatmapDays: [], timeHeatmapDays: [], practiceLogs: [] };
  const quizAttempts = quizQ.data || [];
  const adaptiveAttempts = adaptiveQ.data || [];
  const trackData = trackQ.data || { totalActiveHours: 0, totalTabOuts: 0, daysTracked: 0, daily: [] };
  const quizPassed = quizAttempts.filter((a: any) => a.passed).length;
  const adaptivePassed = adaptiveAttempts.filter((a: any) => a.passed || a.partialPass).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-6 dark:bg-card dark:border-border">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
            {student?.fullName?.charAt(0) || "H"}
          </div>
          <div className="flex-1">
            <StudentName fullName={student?.fullName || "Học sinh"} nickname={student?.nickname} primaryClassName="text-2xl font-bold text-foreground" secondaryClassName="text-xs font-medium text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{student?.email}</p>
            {student?.bio && <p className="text-sm text-muted-foreground mt-2 dark:text-muted-foreground">{student.bio}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            {student?.lastLoginAt && (
              <div className="text-right text-xs text-muted-foreground">
                <p>Đăng nhập lần cuối</p>
                <p className="font-semibold text-muted-foreground">{new Date(student.lastLoginAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            )}
            {isStaff && studentId && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setParentLinkOpen(true)}>
                  <Share2 className="mr-1.5 h-3.5 w-3.5" /> Cổng phụ huynh
                </Button>
                <Button size="sm" variant="outline" onClick={() => setReportOpen(true)}>
                  <FileText className="mr-1.5 h-3.5 w-3.5" /> Báo cáo tuần (Zalo)
                </Button>
                <Button size="sm" variant="default" onClick={() => navigate(`/assignments?remedialStudent=${encodeURIComponent(studentId)}`)}>
                  <Target className="mr-1.5 h-3.5 w-3.5" /> Giao bài khắc phục
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isStaff && studentId && (
        <>
          <WeeklyReportDialog open={reportOpen} studentId={studentId} onClose={() => setReportOpen(false)} />
          <ParentPortalLinkDialog open={parentLinkOpen} studentId={studentId} onClose={() => setParentLinkOpen(false)} />
        </>
      )}

      {isAdmin && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-5 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-amber-950 dark:text-amber-100"><KeyRound className="h-4 w-4" />Khôi phục tài khoản</h2>
              <p className="mt-1 max-w-2xl text-sm text-amber-900 dark:text-amber-200">Không thể xem mật khẩu hiện tại vì hệ thống chỉ lưu hash. Tạo mật khẩu tạm mới để gửi cho học sinh; học sinh sẽ được yêu cầu đổi mật khẩu sau khi đăng nhập.</p>
            </div>
            <Button
              variant="secondary"
              disabled={resetPassword.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: "Tạo mật khẩu tạm",
                  message: `Tạo mật khẩu tạm mới cho ${student?.fullName || "học sinh này"}? Mật khẩu cũ sẽ không còn dùng được.`,
                  confirmLabel: "Tạo mật khẩu",
                  variant: "danger",
                });
                if (ok) resetPassword.mutate();
              }}
            >
              {resetPassword.isPending ? "Đang tạo..." : "Tạo mật khẩu tạm"}
            </Button>
          </div>
          {temporaryPassword && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-card px-4 py-3 dark:border-amber-800 dark:bg-background">
              <div className="min-w-0 flex-1"><p className="text-xs text-amber-800 dark:text-amber-300">Mật khẩu tạm — chỉ hiển thị trong phiên này</p><code className="mt-1 block break-all text-lg font-bold tracking-wide text-foreground dark:text-foreground">{temporaryPassword}</code></div>
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(temporaryPassword).then(() => toast.success({ title: "Đã sao chép mật khẩu tạm" })).catch(() => toast.error({ title: "Không thể sao chép" }))}><Copy className="mr-1.5 h-3.5 w-3.5" />Sao chép</Button>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBadge icon={<BookOpen />} label="Khóa học" value={enrolledCourses?.length ?? 0} color="blue" />
        <StatBadge icon={<Code />} label="Bài đã giải" value={pa.totalProblemsSolved} color="indigo" />
        <StatBadge icon={<Keyboard />} label="Tốc độ gõ TB" value={pa.avgTypingSpeed ? `${pa.avgTypingSpeed} CPM` : "N/A"} color="teal" />
        <StatBadge icon={<Timer />} label="Tổng giờ code" value={formatSeconds(pa.totalActiveTimeSeconds)} color="green" />
        <StatBadge icon={<TrendingUp />} label="TB mỗi bài" value={pa.avgTimePerProblem ? formatSeconds(pa.avgTimePerProblem) : "N/A"} color="amber" />
        {isStaff && isStaff && (
          <StatBadge icon={<Timer />} label="Giờ học trên web" value={`${trackData.totalActiveHours}h`} color="green" />
        )}
        {isStaff && isStaff && (
          <StatBadge icon={<AlertTriangle />} label="Lần out tab" value={trackData.totalTabOuts} color="orange" />
        )}
      </div>

      {isStaff && studentId && (
        <StreakHistoryManagePanel userId={studentId} days={84} />
      )}

      {isStaff && (
        <StudentSkillAssessment
          skills={skillsQ.data || []}
          topics={skillTopicsQ.data || []}
          loading={skillsQ.isLoading || skillTopicsQ.isLoading}
        />
      )}

      {/* Time tracking card (teacher view) */}
      {isStaff && (
        <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
          <h2 className="text-sm font-semibold text-foreground mb-3 dark:text-foreground">
            <Timer className="inline h-4 w-4 mr-1.5 text-primary" />
            Thời gian học trên web (30 ngày) — {trackData.daysTracked > 0 ? "đang theo dõi" : "chưa có dữ liệu"}
          </h2>
          <div className="flex items-center gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-black text-primary tabular-nums">{trackData.totalActiveHours}</p>
              <p className="text-xs text-muted-foreground">tổng số giờ</p>
            </div>
            <div className="h-8 w-px bg-border dark:bg-muted" />
            <div className="text-center">
              <p className="text-2xl font-black text-amber-600 tabular-nums">{trackData.totalTabOuts}</p>
              <p className="text-xs text-muted-foreground">lần out tab</p>
            </div>
            <div className="h-8 w-px bg-border dark:bg-muted" />
            <div className="text-center">
              <p className="text-2xl font-black text-foreground/90 tabular-nums">{trackData.daysTracked}</p>
              <p className="text-xs text-muted-foreground">ngày có học</p>
            </div>
          </div>
          {/* 30-day dual bar charts — minutes & tab-outs */}
          {(() => {
            const dailyMap: Record<string, { minutes: number; tabOuts: number }> = {};
            (trackData.daily || []).forEach((d: any) => {
              dailyMap[d.date] = { minutes: d.minutes || 0, tabOuts: d.tabOuts || 0 };
            });
            const vnDateKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(date);
            interface DayItem { date: string; label: string; minutes: number; tabOuts: number }
            const days: DayItem[] = [];
            for (let i = 29; i >= 0; i--) {
              const d = new Date();
              d.setDate(d.getDate() - i);
              const key = vnDateKey(d);
              const label = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
              days.push({ date: key, label, minutes: dailyMap[key]?.minutes || 0, tabOuts: dailyMap[key]?.tabOuts || 0 });
            }
            const CHART_H = 80;
            const maxMins = Math.max(1, ...days.map(d => d.minutes));
            const maxOuts = Math.max(1, ...days.map(d => d.tabOuts));

            const BarChart = ({ getValue, max, color, unit }: {
              getValue: (d: DayItem) => number;
              max: number;
              color: string;
              unit: string;
            }) => (
              <div className="flex-1 flex flex-col">
                <div className="flex items-end gap-px" style={{ height: CHART_H }}>
                  {days.map((d) => {
                    const val = getValue(d);
                    const barH = val > 0 ? Math.max(3, Math.round((val / max) * CHART_H)) : 2;
                    return (
                      <div key={d.date} className="flex-1 flex items-end justify-center group" title={`${d.date}: ${val} ${unit}`}>
                        <div
                          className={`w-full rounded-t-[1px] transition-colors ${val > 0 ? color : 'bg-muted dark:bg-muted'}`}
                          style={{ height: barH }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex text-[9px] text-muted-foreground mt-1">
                  {days.map((d, i) => (
                    <div key={d.date} className="flex-1 text-center">
                      {i % 7 === 0 ? d.label.slice(0, 2) : ""}
                    </div>
                  ))}
                </div>
              </div>
            );

            return (
              <div className="flex gap-4">
                <div className="flex-1">
                  <p className="text-[10px] font-medium text-primary mb-1">Phút học</p>
                  <BarChart getValue={d => d.minutes} max={maxMins} color="bg-primary/100 hover:bg-primary" unit="phút" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-medium text-amber-600 mb-1">Lần out tab</p>
                  <BarChart getValue={d => d.tabOuts} max={maxOuts} color="bg-amber-500 hover:bg-amber-600" unit="lần out" />
                </div>
              </div>
            );
          })()}
          <p className="mt-2 text-xs text-muted-foreground text-right">30 ngày gần nhất</p>
        </div>
      )}

      {/* Contribution Heatmap */}
      {pa.heatmapDays && pa.heatmapDays.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
          <h2 className="text-sm font-semibold text-foreground mb-3 dark:text-foreground">Số bài tập mỗi ngày (12 tuần)</h2>
          <ActivityHeatmap days={pa.heatmapDays} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Typing Speed Chart */}
        <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
          <h2 className="text-sm font-semibold text-foreground mb-3 dark:text-foreground">Tốc độ gõ (CPM)</h2>
          {pa.practiceLogs && pa.practiceLogs.filter(l => l.typingSpeed).length > 0 ? (
            <LineChart data={pa.practiceLogs.filter(l => l.typingSpeed).slice(0, 30).reverse().map(l => ({
              label: new Date(l.createdAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
              value: l.typingSpeed || 0,
            }))} color="#0066cc" />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center dark:text-muted-foreground">Chưa có dữ liệu tốc độ gõ</p>
          )}
        </div>

        {/* Daily Coding Time Chart */}
        <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
          <h2 className="text-sm font-semibold text-foreground mb-3 dark:text-foreground">Thời gian code mỗi ngày</h2>
          {pa.timeHeatmapDays && pa.timeHeatmapDays.filter(d => d.seconds > 0).length > 0 ? (
            <BarChart data={pa.timeHeatmapDays.slice(-30).map(d => ({
              label: new Date(d.date + "T00:00:00").toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
              value: Math.round(d.seconds / 60),
            }))} color="#10b981" unit="phút" />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center dark:text-muted-foreground">Chưa có dữ liệu thời gian code</p>
          )}
        </div>
      </div>

      {/* Practice Logs Table */}
      {pa.practiceLogs && pa.practiceLogs.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
          <h2 className="text-sm font-semibold text-foreground mb-3 dark:text-foreground">
            Nhật ký luyện tập ({pa.practiceLogs.length} bài)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border dark:text-muted-foreground dark:border-border">
                  <th className="pb-2 font-medium">Bài tập</th>
                  <th className="pb-2 font-medium">Độ khó</th>
                  <th className="pb-2 font-medium">Tốc độ gõ</th>
                  <th className="pb-2 font-medium">Thời gian</th>
                  <th className="pb-2 font-medium">Số ký tự</th>
                  <th className="pb-2 font-medium text-right">Ngày làm</th>
                </tr>
              </thead>
              <tbody>
                {pa.practiceLogs.slice(0, 50).map((log) => (
                  <tr key={log.id} className="border-b border-border hover:bg-muted">
                    <td className="py-2 pr-4 max-w-[200px] truncate text-foreground">{log.problemTitle}</td>
                    <td className="py-2">
                      <DifficultyBadge difficulty={log.difficulty} />
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {log.typingSpeed ? `${log.typingSpeed} CPM` : "—"}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {log.activeTimeSeconds ? formatSeconds(log.activeTimeSeconds) : "—"}
                    </td>
                    <td className="py-2 text-muted-foreground text-xs dark:text-muted-foreground">{log.codeLength} ký tự</td>
                    <td className="py-2 text-right text-muted-foreground text-xs dark:text-muted-foreground">
                      {new Date(log.createdAt).toLocaleDateString("vi-VN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Weakness Tags (teacher view) ── */}
      {isStaff && studentId && <WeaknessTagSection studentId={studentId} fullName={data?.fullName} />}

      {/* ── Course Progress + Badges + Chapters (teacher view) ── */}
      {isStaff && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Course progress */}
          <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
            <h2 className="text-sm font-semibold text-foreground mb-3 dark:text-foreground">Tiến độ khóa học</h2>
            {!enrolledCourses?.length ? (
              <p className="text-sm text-muted-foreground">Chưa đăng ký khóa học nào.</p>
            ) : (
              <div className="space-y-2">
                {enrolledCourses.map((ec: any) => {
                  const cp = courseProgress?.[ec.courseId];
                  const pct = cp?.percent ?? 0;
                  return (
                    <div key={ec.courseId} className="flex items-center gap-3">
                      <span className="flex-1 min-w-0 text-sm text-foreground/90 truncate">{ec.course?.title}</span>
                      <div className="flex items-center gap-2 w-32">
                        <div className="h-2 flex-1 rounded-full bg-muted dark:bg-muted overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums text-muted-foreground w-10 text-right">{cp ? `${cp.completed}/${cp.total}` : "—"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Badges + Chapters */}
          <div className="space-y-4">
            {badges?.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
                <h2 className="text-sm font-semibold text-foreground mb-3 dark:text-foreground">Huy hiệu ({badges.length})</h2>
                <div className="flex flex-wrap gap-2">
                  {badges.map((b: any, i: number) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300" title={b.description}>
                      {b.icon} {b.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {chapterProgress?.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
                <h2 className="text-sm font-semibold text-foreground mb-3 dark:text-foreground">Chương đã vượt ({chapterProgress.length})</h2>
                <div className="flex flex-wrap gap-2">
                  {chapterProgress.map((cp: any, i: number) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                      <Zap className="h-3 w-3" /> {cp.moduleId?.slice(-8)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Course list */}
      <div>
        <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
          <h2 className="text-sm font-semibold text-foreground mb-3 dark:text-foreground">Khóa học đã đăng ký</h2>
          {!enrolledCourses?.length ? (
            <p className="text-sm text-muted-foreground">Chưa đăng ký khóa học nào.</p>
          ) : (
            <div className="space-y-2">
              {enrolledCourses.map((ec: any) => (
                <div key={ec.courseId} className="text-sm text-foreground/90 py-1 dark:text-muted-foreground">{ec.course?.title}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bài tập được giao */}
      {assignmentsQ.data && (
        <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ListChecks className="h-4 w-4 text-primary" />
              Bài tập được giao ({assignmentsQ.data.summary.passed}/{assignmentsQ.data.summary.total})
            </h2>
            {assignmentsQ.data.summary.total > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                  Hoàn thành {assignmentsQ.data.summary.completionRate}%
                </span>
                {assignmentsQ.data.summary.overdue > 0 && (
                  <span className="rounded-full bg-destructive/15 px-2 py-0.5 font-medium text-destructive">
                    {assignmentsQ.data.summary.overdue} quá hạn
                  </span>
                )}
                {assignmentsQ.data.summary.late > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                    {assignmentsQ.data.summary.late} nộp muộn
                  </span>
                )}
              </div>
            )}
          </div>
          {!assignmentsQ.data.assignments.length ? (
            <p className="text-sm text-muted-foreground">Chưa có bài tập nào được giao.</p>
          ) : (
            <div className="divide-y divide-border">
              {assignmentsQ.data.assignments.map((asg) => (
                <Link
                  key={asg.id}
                  to={isStaff ? "/assignments" : "/my-assignments"}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm transition-colors hover:bg-muted/40 rounded-lg px-2 -mx-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{asg.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {asg.course?.title ? `${asg.course.title} · ` : ""}
                      {asg.totalItems > 1 ? `${asg.completedItems}/${asg.totalItems} mục · ` : ""}
                      {asg.deadline
                        ? `Hạn: ${new Date(asg.deadline).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                        : "Không có hạn"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {asg.locked && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                        <Lock className="h-2.5 w-2.5" /> Khóa hạn
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        asg.status === "passed"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : asg.overdue
                            ? "bg-destructive/15 text-destructive"
                            : asg.status === "attempting"
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {asg.status === "passed"
                        ? `Đã đạt${asg.isLate ? " (muộn)" : ""}`
                        : asg.overdue
                          ? "Quá hạn"
                          : asg.status === "attempting"
                            ? "Đang làm"
                            : "Chưa làm"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lịch sử phòng thi */}
      {(examsQ.data?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <ClipboardCheck className="h-4 w-4 text-amber-500" />
            Lịch sử phòng thi ({examsQ.data!.length})
          </h2>
          <div className="divide-y divide-border">
            {examsQ.data!.map((ex: any) => {
              const targetUrl = isStaff ? `/exams/${ex.examId}/grading` : `/exams/${ex.examId}/result`;
              const graded = ex.gradeStatus === "graded";
              const review = ex.gradeStatus === "needs_review";
              const canShowScore = isStaff || ex.showResults;
              return (
                <Link
                  key={ex.id}
                  to={targetUrl}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm transition-colors hover:bg-muted/40 rounded-lg px-2 -mx-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{ex.examTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {ex.subject} · {new Date(ex.submittedAt || ex.startedAt).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        graded
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : review
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {graded ? "Đã chấm" : review ? "Chờ duyệt" : ex.status === "in_progress" ? "Đang làm" : "Chưa chấm"}
                    </span>
                    {canShowScore && ex.totalScore != null && (
                      <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                        {Math.round(ex.totalScore * 10) / 10}
                        {ex.maxScore != null ? `/${Math.round(ex.maxScore * 10) / 10}` : ""}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Lịch sử Quiz trong Meeting */}
      {(meetingsQ.data?.quizSubmissions?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Video className="h-4 w-4 text-primary" />
            Lịch sử Quiz trong Meeting ({meetingsQ.data!.quizSubmissions.length})
          </h2>
          <div className="divide-y divide-border">
            {meetingsQ.data!.quizSubmissions.map((mq) => (
              <Link
                key={mq.id}
                to="/meet"
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm transition-colors hover:bg-muted/40 rounded-lg px-2 -mx-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        mq.kind === "adaptive"
                          ? "bg-violet-500/15 text-violet-600 dark:text-violet-300"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {mq.kind === "adaptive" ? "Adaptive" : "Quiz"}
                    </span>
                    <p className="truncate font-medium text-foreground">{mq.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Phòng: {mq.roomTitle}
                    {mq.courseTitle ? ` · ${mq.courseTitle}` : ""} ·{" "}
                    {new Date(mq.completedAt).toLocaleDateString("vi-VN")}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  {mq.rank != null && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Hạng #{mq.rank}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                      mq.accuracy >= 70
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : mq.accuracy >= 45
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : "bg-red-500/15 text-red-600 dark:text-red-400"
                    }`}
                  >
                    {mq.score}/{mq.totalQuestions} ({mq.accuracy}%)
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Teacher-only: Quiz & Adaptive Test History ── */}
      {isStaff && (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {attStats && (
              <div className="rounded-xl border border-border bg-card p-4 dark:bg-card dark:border-border flex items-center gap-3">
                <CalendarCheck className="h-8 w-8 text-emerald-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Chuyên cần</p>
                  <p className="text-lg font-bold tabular-nums text-foreground">
                    {attStats.rate !== null ? `${attStats.rate}%` : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{attStats.held} buổi · {attStats.present} có mặt</p>
                </div>
              </div>
            )}
            <div className="rounded-xl border border-border bg-card p-4 dark:bg-card dark:border-border flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Quiz đã làm</p>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {quizPassed}/{quizAttempts.length} <span className="text-xs font-normal text-muted-foreground">passed</span>
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 dark:bg-card dark:border-border flex items-center gap-3">
              <Zap className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-xs text-muted-foreground">Test vượt chương</p>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {adaptivePassed}/{adaptiveAttempts.length} <span className="text-xs font-normal text-muted-foreground">passed</span>
                </p>
              </div>
            </div>
          </div>

          {/* Quiz attempts per lesson */}
          {quizQ.data && quizQ.data.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
              <h2 className="text-sm font-semibold text-foreground mb-3 dark:text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Bài kiểm tra từng bài ({quizQ.data.length} lần làm)
              </h2>
              <div className="space-y-2">
                {quizQ.data.map((a: any) => (
                  <QuizAttemptRow key={a.id} attempt={a} />
                ))}
              </div>
            </div>
          )}
          {quizQ.data && quizQ.data.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
              <h2 className="text-sm font-semibold text-foreground mb-3 dark:text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground/40" /> Bài kiểm tra từng bài
              </h2>
              <p className="text-sm text-muted-foreground">Chưa có lần làm quiz nào.</p>
            </div>
          )}

          {/* Adaptive test attempts */}
          {adaptiveQ.data && adaptiveQ.data.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
              <h2 className="text-sm font-semibold text-foreground mb-3 dark:text-foreground flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" /> Test vượt chương ({adaptiveQ.data.length} lần làm)
              </h2>
              <div className="space-y-2">
                {adaptiveQ.data.map((a: any) => (
                  <AdaptiveAttemptRow key={a.id} attempt={a} />
                ))}
              </div>
            </div>
          )}
          {adaptiveQ.data && adaptiveQ.data.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
              <h2 className="text-sm font-semibold text-foreground mb-3 dark:text-foreground flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground/40" /> Test vượt chương
              </h2>
              <p className="text-sm text-muted-foreground">Chưa có lần test vượt chương nào.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StudentSkillAssessment({
  skills,
  topics,
  loading,
}: {
  skills: SkillState[];
  topics: TopicGroup[];
  loading: boolean;
}) {
  const [lang, setLang] = useState<SkillLanguage>("py");
  const [langTouched, setLangTouched] = useState(false);
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);

  // Default tab = language/domain the student has more evidence for (once), unless teacher switched.
  useEffect(() => {
    if (langTouched || loading || skills.length === 0) return;
    const counts: Record<SkillLanguage, number> = {
      py: skills.filter((s) => s.skillId.startsWith("py.") && s.hasEvidence).length,
      cpp: skills.filter((s) => s.skillId.startsWith("cpp.") && s.hasEvidence).length,
      algo: skills.filter((s) => s.skillId.startsWith("algo.") && s.hasEvidence).length,
    };
    const best = (Object.keys(counts) as SkillLanguage[]).reduce((a, b) => (counts[b] > counts[a] ? b : a), "py");
    setLang(best);
  }, [skills, loading, langTouched]);

  if (loading) {
    return <div className="rounded-xl border border-border bg-card p-5"><div className="h-56 animate-pulse rounded-lg bg-muted" /></div>;
  }

  const scopedTopics = topicsForLanguage(topics, lang);
  const scopedSkills = skillsForLanguage(skills, lang);
  const knownSkills = scopedSkills.filter((skill) => skill.hasEvidence);
  const radarData = groupSkillsByTopic(
    scopedSkills.map((skill) => ({
      skillId: skill.skillId,
      name: skill.name,
      mastery: skill.hasEvidence ? skill.mastery : 0,
      trend: skill.trend,
      hasEvidence: skill.hasEvidence,
    })),
    scopedTopics.map((topic) => ({
      topicId: topic.topicId,
      topicName: topic.topicName,
      skillIds: topic.skills.map((skill) => skill.skillId),
    })),
    lang,
  );
  const average = knownSkills.length > 0
    ? Math.round((knownSkills.reduce((sum, skill) => sum + skill.mastery, 0) / knownSkills.length) * 100)
    : null;
  const lowest = [...knownSkills].sort((a, b) => a.mastery - b.mastery).slice(0, 3);
  const dueCount = knownSkills.filter((s) => s.dueForReview).length;
  const TrendIcon = { up: TrendingUp, down: TrendingDown, flat: Minus };
  const CONFIDENCE_TEXT: Record<string, string> = {
    low: "Ít bằng chứng",
    forming: "Đang hình thành",
    medium: "Khá chắc",
    high: "Chắc chắn",
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-card-foreground">
            <Radar className="size-5 text-primary" /> Hồ sơ kỹ năng (BKT-IRT &amp; Trí nhớ)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tổng hợp từ bài tập code, bài thi, quiz và adaptive test có skill tag đã duyệt. Nhấp vào kỹ năng để xem lý do điểm.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Chọn ngôn ngữ">
          {(
            [
              { id: "py", label: "Python" },
              { id: "cpp", label: "C++" },
              { id: "algo", label: "Thuật toán" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={lang === tab.id}
              onClick={() => { setLangTouched(true); setLang(tab.id); setExpandedSkillId(null); }}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                lang === tab.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="rounded-lg bg-muted px-3 py-2 text-right">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Điểm trung bình</p>
          <p className="text-xl font-black tabular-nums">{average === null ? "—" : `${average}%`}</p>
        </div>
      </div>

      {scopedSkills.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Học sinh chưa có dữ liệu đánh giá kỹ năng.</p>
      ) : (
        <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.15fr)] xl:items-start">
          <div className="rounded-lg border bg-muted/20 p-3">
            {radarData.length >= 3 ? (
              <RadarChart data={radarData} size={300} />
            ) : (
              <div className="flex min-h-[250px] items-center justify-center px-5 text-center text-sm text-muted-foreground">
                Cần evidence ở ít nhất 3 nhóm kỹ năng để hiển thị bản đồ radar.
              </div>
            )}
            <p className="mt-1 text-center text-xs text-muted-foreground">
              {knownSkills.length}/{scopedSkills.length} kỹ năng đã có evidence
              {radarData.length > 0 ? ` · ${radarData.filter((d) => d.hasEvidence).length}/${radarData.length} nhóm trên radar` : ""}
              {dueCount > 0 ? ` · ${dueCount} kỹ năng cần ôn lại` : ""}
            </p>
          </div>

          <div className="min-w-0">
            {lowest.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                <span className="font-bold">Cần chú ý:</span> {lowest.map((skill) => skill.name).join(", ")}
              </div>
            )}
            <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
              {scopedSkills.map((skill) => {
                const Trend = TrendIcon[skill.trend];
                const value = Math.round(skill.mastery * 100);
                const bar = value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-red-500";
                const isOpen = expandedSkillId === skill.skillId;
                const confLabel = skill.confidenceLevel ? CONFIDENCE_TEXT[skill.confidenceLevel] : null;
                return (
                  <div
                    key={skill.skillId}
                    className={`rounded-lg border transition-colors ${
                      isOpen ? "border-primary/40 bg-muted/20" : "border-border hover:border-border/80"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedSkillId(isOpen ? null : skill.skillId)}
                      className="w-full p-3 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={skill.name}>{skill.name}</p>
                        {skill.hasEvidence ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            {skill.dueForReview && (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                Cần ôn · {Math.round(skill.daysSinceLastPractice ?? 0)} ngày
                              </span>
                            )}
                            {confLabel && (
                              <span className="hidden sm:inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {confLabel}
                              </span>
                            )}
                            <span className="text-sm font-bold tabular-nums">{value}%</span>
                          </div>
                        ) : (
                          <span className="shrink-0 text-xs font-medium text-muted-foreground">
                            {skill.estimatedPrior != null ? `Sơ bộ ~${Math.round(skill.estimatedPrior * 100)}%` : "Chưa đánh giá"}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          {skill.hasEvidence && <div className={`h-full rounded-full ${bar}`} style={{ width: `${value}%` }} />}
                        </div>
                        {skill.hasEvidence ? <Trend className={`size-3.5 ${skill.trend === "up" ? "text-emerald-500" : skill.trend === "down" ? "text-red-500" : "text-muted-foreground"}`} /> : null}
                      </div>
                      {skill.hasEvidence && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {skill.evidenceCount || 0} phiên đánh giá
                          {skill.lowerBound != null && skill.upperBound != null
                            ? ` · khoảng ${Math.round(skill.lowerBound * 100)}–${Math.round(skill.upperBound * 100)}%`
                            : ""}
                          {skill.retentionRate != null && skill.retentionRate < 0.99
                            ? ` · trí nhớ ${Math.round(skill.retentionRate * 100)}%`
                            : ""}
                        </p>
                      )}
                    </button>

                    {isOpen && (
                      <div className="border-t border-border/70 px-3 py-2.5 text-xs space-y-2 bg-muted/10">
                        {skill.weakPrerequisites && skill.weakPrerequisites.length > 0 && (
                          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                            <span className="font-semibold">Gốc cần củng cố trước:</span>{" "}
                            {skill.weakPrerequisites.map((wp) => `${wp.name} (${Math.round(wp.mastery * 100)}%)`).join(", ")}
                          </div>
                        )}
                        {skill.hasEvidence && skill.breakdown && skill.breakdown.length > 0 ? (
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Biến động gần đây
                            </p>
                            {skill.breakdown.map((item, idx) => {
                              const pctDelta = Math.round(item.delta * 100);
                              const deltaSign = pctDelta > 0 ? `+${pctDelta}%` : `${pctDelta}%`;
                              const deltaCls =
                                item.delta > 0.005
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : item.delta < -0.005
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-muted-foreground";
                              return (
                                <div key={`${item.ts}-${idx}`} className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className="min-w-0 flex-1 truncate text-foreground/90">
                                    {item.label}
                                    {item.total ? ` (${item.correct ?? 0}/${item.total})` : ""}
                                    {item.hintCount ? ` · ${item.hintCount} gợi ý` : ""}
                                  </span>
                                  <span className={`shrink-0 font-semibold tabular-nums ${deltaCls}`}>
                                    {deltaSign}
                                  </span>
                                  <span className="shrink-0 text-muted-foreground tabular-nums">
                                    → {Math.round(item.valueAfter * 100)}%
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            {skill.estimatedPrior != null
                              ? `Chưa có bài làm trực tiếp; ước lượng mềm ~${Math.round(skill.estimatedPrior * 100)}% dựa trên các kỹ năng liên quan.`
                              : "Chưa có hoạt động nào được gắn skill tag đã duyệt cho kỹ năng này."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function StatBadge({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-primary/10 text-primary", indigo: "bg-primary/10 text-primary",
    green: "bg-green-50 text-green-700", teal: "bg-teal-500/10 text-teal-700",
    orange: "bg-orange-500/10 text-orange-700", purple: "bg-primary/10 text-primary",
    amber: "bg-amber-500/10 text-amber-700", rose: "bg-rose-50 text-rose-700",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 dark:bg-card dark:border-border">
      <div className={`p-2 rounded-lg ${colors[color] || "bg-muted/40 text-foreground/90"}`}>{icon}</div>
      <div>
        <p className="text-xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ── GitHub-style Activity Heatmap ──
function ActivityHeatmap({ days }: { days: { date: string; count: number }[] }) {
  const maxCount = Math.max(1, ...days.map(d => d.count));
  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  function getColor(count: number): string {
    if (count === 0) return "bg-muted";
    const ratio = count / maxCount;
    if (ratio <= 0.25) return "bg-green-200";
    if (ratio <= 0.5) return "bg-green-400";
    if (ratio <= 0.75) return "bg-green-600";
    return "bg-green-800";
  }

  return (
    <div className="flex gap-1 overflow-x-auto pb-2">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {week.map((day, di) => (
            <div
              key={di}
              className={`w-3.5 h-3.5 rounded-sm ${getColor(day.count)}`}
              title={`${day.date}: ${day.count} bài`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Simple SVG Line Chart ──
function LineChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  if (!data.length) return null;
  const W = 300, H = 120, PAD = 20;
  const maxVal = Math.max(1, ...data.map(d => d.value));
  const points = data.map((d, i) => {
    const x = PAD + (i / Math.max(1, data.length - 1)) * (W - 2 * PAD);
    const y = H - PAD - (d.value / maxVal) * (H - 2 * PAD);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32">
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => {
          const x = PAD + (i / Math.max(1, data.length - 1)) * (W - 2 * PAD);
          const y = H - PAD - (d.value / maxVal) * (H - 2 * PAD);
          return <circle key={i} cx={x} cy={y} r="2.5" fill={color} />;
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground px-5 dark:text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

// ── Simple SVG Bar Chart ──
function BarChart({ data, color, unit }: { data: { label: string; value: number }[]; color: string; unit: string }) {
  if (!data.length) return null;
  const W = 300, H = 120, PAD = 20;
  const maxVal = Math.max(1, ...data.map(d => d.value));
  const barWidth = Math.max(4, (W - 2 * PAD) / data.length - 1);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32">
        {data.map((d, i) => {
          const x = PAD + i * ((W - 2 * PAD) / data.length);
          const barH = (d.value / maxVal) * (H - 2 * PAD);
          const y = H - PAD - barH;
          return <rect key={i} x={x} y={y} width={barWidth} height={barH} fill={color} rx="2" />;
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground px-5 dark:text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function formatSeconds(s: number): string {
  if (!s || s <= 0) return "0 phút";
  if (s < 60) return `${s} giây`;
  const mins = Math.floor(s / 60);
  if (mins < 60) return `${mins} phút`;
  const hrs = Math.floor(mins / 60);
  const rm = mins % 60;
  return rm > 0 ? `${hrs}h ${rm}m` : `${hrs}h`;
}

/* ── Quiz attempt accordion row ── */
function QuizAttemptRow({ attempt: a }: { attempt: any }) {
  const [open, setOpen] = useState(false);
  const answers: any[] = a.answers || [];
  const correctCount = answers.filter((r: any) => r.isCorrect).length;

  return (
    <div className={`rounded-xl border transition ${a.passed ? "border-emerald-100 dark:border-emerald-900/40" : "border-red-500/20 dark:border-red-900/40"} ${open ? "shadow-sm" : ""}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${a.passed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:text-red-400 dark:bg-red-900/40 dark:text-red-300"}`}>
          {a.passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{a.quizTitle}</p>
          <p className="text-xs text-muted-foreground">{a.moduleTitle} · {a.lessonTitle} · {new Date(a.createdAt).toLocaleDateString("vi-VN")}</p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold tabular-nums ${a.passed ? "text-emerald-600" : "text-red-500"}`}>{a.percent}%</p>
          <p className="text-xs text-muted-foreground">{a.score}/{a.totalQuestions} · {correctCount} đúng</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && answers.length > 0 && (
        <div className="border-t border-border px-4 pb-3 pt-2 dark:border-border space-y-1.5">
          {answers.map((r: any, i: number) => (
            <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${r.isCorrect ? "bg-emerald-500/10 dark:bg-emerald-950/20" : "bg-red-500/10 dark:bg-red-950/20"}`}>
              {r.isCorrect ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
              <span className="flex-1 min-w-0 text-foreground/90 truncate">{r.question || `Câu ${i + 1}`}</span>
              <span className="shrink-0 text-muted-foreground">{String.fromCharCode(65 + (r.selectedIndex ?? 0))}</span>
              {/* correctIndex is null when the server sealed the key (student has
                  not passed this quiz yet) — do not fall back to 0 and print "A". */}
              {!r.isCorrect && (r.correctIndex != null
                ? <span className="shrink-0 text-emerald-600 font-semibold">→ {String.fromCharCode(65 + r.correctIndex)}</span>
                : <span className="shrink-0 text-amber-500" title="Đáp án mở khi qua bài">→ 🔒</span>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Adaptive test accordion row ── */
function AdaptiveAttemptRow({ attempt: a }: { attempt: any }) {
  const [open, setOpen] = useState(false);
  const answers: any[] = a.answers || [];
  const breakdown = a.lessonBreakdown || {};

  return (
    <div className={`rounded-xl border transition ${a.passed ? "border-emerald-100 dark:border-emerald-900/40" : a.partialPass ? "border-amber-100 dark:border-amber-900/40" : "border-red-500/20 dark:border-red-900/40"} ${open ? "shadow-sm" : ""}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${a.passed ? "bg-emerald-100 text-emerald-700" : a.partialPass ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700 dark:text-red-400"} dark:bg-opacity-20`}>
          <Zap className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{a.moduleTitle || "Chương"}</p>
          <p className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("vi-VN")} · {a.totalQuestions} câu · Năng lực {a.abilityEnd}</p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold tabular-nums ${a.passed ? "text-emerald-600" : a.partialPass ? "text-amber-600" : "text-red-500"}`}>
            {a.accuracyPercent}%
          </p>
          <p className="text-xs text-muted-foreground">{a.correctCount}/{a.totalQuestions} · {a.passed ? "Đạt" : a.partialPass ? "Một phần" : "Chưa đạt"}</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-3 pt-2 dark:border-border space-y-3">
          {/* Lesson breakdown */}
          {Object.keys(breakdown).length > 0 && (
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(breakdown).map(([lid, perf]: [string, any]) => (
                <div key={lid} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-1.5 text-xs dark:bg-card">
                  <span className="text-muted-foreground dark:text-muted-foreground truncate">{lid.slice(-8)}</span>
                  <span className={`font-semibold tabular-nums ${perf.percent >= 60 ? "text-emerald-600" : "text-red-500"}`}>{perf.correct}/{perf.total} ({perf.percent}%)</span>
                </div>
              ))}
            </div>
          )}
          {/* Per-question answers */}
          {answers.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Chi tiết câu trả lời:</p>
              {answers.map((r: any, i: number) => (
                <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${r.isCorrect ? "bg-emerald-500/10 dark:bg-emerald-950/20" : "bg-red-500/10 dark:bg-red-950/20"}`}>
                  {r.isCorrect ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                  <span className="flex-1 min-w-0 text-foreground/90 truncate">{r.question || `Câu ${i + 1}`}</span>
                  <span className="shrink-0 text-muted-foreground">Độ khó {r.difficulty}</span>
                  <span className="shrink-0 text-muted-foreground">{String.fromCharCode(65 + (r.selectedIndex ?? 0))}</span>
                  {!r.isCorrect && <span className="shrink-0 text-emerald-600 font-semibold">→ {String.fromCharCode(65 + (r.correctIndex ?? 0))}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Weakness Tag Section ──
function WeaknessTagSection({ studentId, fullName }: { studentId: string; fullName?: string }) {
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const tagsQ = useQuery({
    queryKey: ["weakness-tags", studentId],
    queryFn: () => api.get(`/students/${studentId}/weakness-tags`).then((r) => r.data),
  });

  const tags: any[] = tagsQ.data || [];
  const activeTags = tags.filter((t: any) => t.status === "active");
  const improvedTags = tags.filter((t: any) => t.status === "improved");

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      await api.post(`/students/${studentId}/weakness-tags/analyze`);
      tagsQ.refetch();
    } catch { /* ignore */ }
    finally { setAnalyzing(false); }
  };

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    try {
      await api.post(`/students/${studentId}/weakness-tags`, { tag: newTag.trim(), status: "active" });
      setNewTag("");
      setAdding(false);
      tagsQ.refetch();
    } catch { /* ignore */ }
  };

  const handleDelete = async (tagId: string) => {
    try {
      await api.delete(`/students/${studentId}/weakness-tags/${tagId}`);
      tagsQ.refetch();
    } catch { /* ignore */ }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          🏷️ Điểm yếu {fullName && `của ${fullName}`}
          {activeTags.length > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-950/40 dark:text-red-400">{activeTags.length}</span>
          )}
        </h2>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={handleAnalyze} disabled={analyzing} className="text-xs">
            {analyzing ? "Đang phân tích..." : "🤖 AI phân tích"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(!adding)} className="text-xs">+ Thêm</Button>
        </div>
      </div>

      {adding && (
        <div className="flex gap-1 mb-3">
          <Input placeholder="Tag mới..." value={newTag} onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTag()} />
          <Button size="sm" onClick={handleAddTag}>Thêm</Button>
        </div>
      )}

      {tags.length === 0 && !tagsQ.isLoading && (
        <p className="text-xs text-muted-foreground">Chưa có tag nào. Bấm "🤖 AI phân tích" để quét hoạt động gần đây.</p>
      )}

      {activeTags.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-red-600 mb-1.5">🔴 Đang yếu ({activeTags.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {activeTags.map((t: any) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-400 dark:bg-red-950/30 dark:text-red-300"
                title={`Severity: ${t.severity}/5 | Nguồn: ${t.source || "AI"} | Lần cuối: ${new Date(t.lastSeenAt).toLocaleDateString("vi-VN")}`}>
                #{t.tag}
                {t.severity > 1 && <span className="text-[10px] opacity-60">×{t.severity}</span>}
                <button onClick={() => handleDelete(t.id)} className="ml-0.5 hover:text-red-900 dark:hover:text-red-100">×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {improvedTags.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-emerald-600 mb-1.5">🟢 Đã cải thiện ({improvedTags.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {improvedTags.map((t: any) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                title={`Cải thiện: ${t.improvedAt ? new Date(t.improvedAt).toLocaleDateString("vi-VN") : "?"}`}>
                #{t.tag}
                <button onClick={() => handleDelete(t.id)} className="ml-0.5 hover:text-emerald-900 dark:hover:text-emerald-100">×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {tagsQ.isLoading && <div className="animate-pulse h-8 bg-muted rounded" />}
    </div>
  );
}

function WeeklyReportDialog({
  open,
  studentId,
  onClose,
}: {
  open: boolean;
  studentId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [days, setDays] = useState<7 | 14 | 30>(7);
  const [draft, setDraft] = useState("");

  const reportQ = useQuery<{ reportText: string; days: number }>({
    queryKey: ["student-weekly-report", studentId, days],
    queryFn: () => api.get(`/students/${studentId}/weekly-report`, { params: { days } }).then((r) => r.data),
    enabled: open && !!studentId,
  });

  useEffect(() => {
    if (reportQ.data?.reportText !== undefined) {
      setDraft(reportQ.data.reportText);
    }
  }, [reportQ.data?.reportText]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      toast.success({ title: "Đã sao chép báo cáo", message: "Bạn có thể dán thẳng vào Zalo cho phụ huynh." });
    } catch {
      toast.error({ title: "Không thể sao chép tự động" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Báo cáo học tập gửi phụ huynh (Zalo)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
              {([7, 14, 30] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    days === d ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d} ngày qua
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground">Có thể chỉnh sửa nội dung trước khi gửi</span>
          </div>

          {reportQ.isFetching && !draft ? (
            <div className="h-56 animate-pulse rounded-lg bg-muted" />
          ) : (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={11}
              className="w-full rounded-lg border border-input bg-background p-3 text-xs leading-relaxed text-foreground focus:border-primary focus:outline-none"
            />
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Đóng
            </Button>
            <Button type="button" onClick={handleCopy} disabled={!draft.trim()}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Sao chép gửi Zalo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ParentPortalLinkDialog({
  open,
  studentId,
  onClose,
}: {
  open: boolean;
  studentId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const linkQ = useQuery<{ token: string | null; urlPath: string | null }>({
    queryKey: ["student-parent-link", studentId],
    queryFn: () => api.get(`/students/${studentId}/parent-link`).then((r) => r.data),
    enabled: open && !!studentId,
  });

  const createMut = useMutation({
    mutationFn: (rotate: boolean) =>
      api.post(`/students/${studentId}/parent-link`, { rotate }).then((r) => r.data),
    onSuccess: () => void linkQ.refetch(),
  });

  const revokeMut = useMutation({
    mutationFn: () => api.delete(`/students/${studentId}/parent-link`).then((r) => r.data),
    onSuccess: () => {
      toast.success({ title: "Đã thu hồi liên kết phụ huynh" });
      void linkQ.refetch();
    },
  });

  const urlPath = linkQ.data?.urlPath;
  const fullUrl = urlPath ? `${window.location.origin}${urlPath}` : "";

  const handleCopy = async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success({ title: "Đã sao chép link Cổng Phụ huynh", message: "Gửi thẳng cho phụ huynh xem tiến độ, điểm thi, điểm danh & học phí." });
    } catch {
      toast.error({ title: "Không sao chép được" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cổng thông tin Phụ huynh (Link riêng bảo mật)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <p className="text-muted-foreground">
            Phụ huynh không cần đăng nhập vẫn xem được bảng chuyên cần, bài tập, điểm thi, kỹ năng nổi bật/cần ôn và học phí của con trên giao diện tối ưu cho điện thoại.
          </p>

          {linkQ.isLoading ? (
            <div className="h-12 animate-pulse rounded-lg bg-muted" />
          ) : urlPath ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
                <code className="min-w-0 flex-1 truncate text-[11px] text-foreground">{fullUrl}</code>
                <Button type="button" size="xs" onClick={handleCopy}>
                  <Copy className="mr-1 h-3 w-3" /> Chép
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => window.open(fullUrl, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="mr-1 h-3 w-3" /> Mở xem thử
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={createMut.isPending}
                  onClick={() => createMut.mutate(true)}
                >
                  <RefreshCw className="mr-1 h-3 w-3" /> Đổi token mới
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="text-rose-600 hover:text-rose-700"
                  disabled={revokeMut.isPending}
                  onClick={() => revokeMut.mutate()}
                >
                  <Trash2 className="mr-1 h-3 w-3" /> Thu hồi link
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <p className="mb-3 text-muted-foreground">Học sinh này chưa có liên kết cổng phụ huynh.</p>
              <Button type="button" size="sm" disabled={createMut.isPending} onClick={() => createMut.mutate(false)}>
                <Share2 className="mr-1.5 h-3.5 w-3.5" /> Tạo link Cổng phụ huynh
              </Button>
            </div>
          )}

          <div className="flex justify-end border-t pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
