import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bug,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Code,
  Coins,
  Flame,
  Gift,
  HelpCircle,
  ListChecks,
  Minus,
  Radar,
  Search,
  Terminal,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import type { SkillState, Recommendation, TopicGroup } from "../../lib/api";
import {
  RadarChart,
  groupSkillsByTopic,
  topicsForLanguage,
  skillsForLanguage,
  type SkillLanguage,
} from "../../components/skills/RadarChart";
import { ErrorState } from "../../components/ui/StateViews";
import { useAuthContext } from "../../contexts/AuthContext";
import { useMascot, msgGreet } from "../../components/mascot";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { cn, getAnimalAvatarUrl, getAvatarBgColor } from "../../lib/utils";
import { DailyStudyPlanCard } from "../../components/skills/DailyStudyPlanCard";
import { StudentName } from "../../components/ui/StudentName";

export default function Dashboard() {
  const { user } = useAuthContext();
  const isStaff = user?.role === "teacher" || user?.role === "teaching_assistant" || user?.role === "admin";
  if (isStaff) return <TeacherDashboard />;
  return <StudentDashboard />;
}

function StudentDashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="skeleton-shimmer h-3 w-20 rounded bg-muted" />
            <div className="skeleton-shimmer h-6 w-44 rounded bg-muted" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton-shimmer h-16 w-32 rounded-lg bg-muted/70" />
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="skeleton-shimmer h-72 rounded-xl border border-border bg-card lg:col-span-8" />
        <div className="skeleton-shimmer h-72 rounded-xl border border-border bg-card lg:col-span-4" />
      </div>
    </div>
  );
}

function StudentDashboard() {
  const { user } = useAuthContext();
  const { say } = useMascot();
  const [showRewardInfo, setShowRewardInfo] = useState(false);

  const dashQ = useQuery({
    queryKey: ["dashboard-gamification"],
    queryFn: () => api.get("/dashboard").then((r) => r.data),
  });
  const lbQ = useQuery<{ leaderboard: LeaderboardEntry[] }>({
    queryKey: ["leaderboard", "all"],
    queryFn: () => api.get("/leaderboard?period=all&limit=10").then((r) => r.data),
  });

  const greetedRef = useRef(false);
  useEffect(() => {
    if (greetedRef.current) return;
    if (dashQ.data) {
      greetedRef.current = true;
      say("idle", msgGreet({ name: user?.nickname || user?.fullName, streak: dashQ.data?.streak }), { holdMs: 9000 });
    }
  }, [dashQ.data, user?.fullName, user?.nickname, say]);

  if (dashQ.isLoading) return <StudentDashboardSkeleton />;

  const leaderboard = lbQ.data?.leaderboard || [];
  const streak = dashQ.data?.streak ?? 0;
  const longestStreak = dashQ.data?.longestStreak ?? 0;
  const streakReward = Math.min(3 + (streak - 1) * 2, 30);
  const currentUserId = user?.id;
  const myRank = leaderboard.findIndex((e) => e.userId === currentUserId);
  const inTop3 = myRank >= 0 && myRank < 3;
  const pendingAssignments: Array<{
    id: string;
    title: string;
    problemId: string;
    problemTitle: string;
    difficulty: string;
    deadline: string | null;
  }> = dashQ.data?.pendingAssignments || [];
  const activeExams: Array<{
    id: string;
    title: string;
    subject: string;
    durationMinutes: number;
    closeAt: string | null;
    attemptStatus: string | null;
  }> = dashQ.data?.activeExams || [];

  return (
    <div className="stagger-in mx-auto max-w-6xl space-y-4">
      {/* Compact Hero + KPI Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Xin chào,</p>
              <h1 className="truncate text-lg font-semibold tracking-tight text-card-foreground">
                {user?.nickname || user?.fullName || "Học viên"}
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">Theo dõi tiến độ và kế hoạch học tập hôm nay.</p>
            </div>

            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
              <div
                className="bg-card px-3 py-2"
                title={streak > 0 ? `Kỷ lục: ${longestStreak} ngày · +${streakReward} tokens/ngày` : undefined}
              >
                <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <Flame className={cn("size-3", streak > 0 && "text-orange-500")} /> Streak
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">{streak} ngày</p>
              </div>
              <div className="bg-card px-3 py-2">
                <p className="text-[11px] font-medium text-muted-foreground">Cấp độ</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">Lv.{dashQ.data?.level ?? "—"}</p>
                {dashQ.data?.leagueName && (
                  <p className="truncate text-[10px] text-muted-foreground">{dashQ.data.leagueName}</p>
                )}
              </div>
              <div className="bg-card px-3 py-2 sm:min-w-36">
                <p className="text-[11px] font-medium text-muted-foreground">Kinh nghiệm</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">
                  {(dashQ.data?.xp ?? 0).toLocaleString("vi-VN")} XP
                </p>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                    style={{ width: `${dashQ.data?.levelProgress ?? 0}%` }}
                  />
                </div>
              </div>
              <Link to="/tokens" className="bg-card px-3 py-2 transition-colors hover:bg-muted/60">
                <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <Coins className="size-3 text-amber-500" /> Tokens
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">
                  {(dashQ.data?.tokenBalance ?? 0).toLocaleString("vi-VN")}
                </p>
              </Link>
            </div>
          </div>

          <DailyStudyPlanCard compact />
        </CardContent>
      </Card>

      {/* 2-Column Main Grid */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Left: Skill Profile */}
        <div className="space-y-4 lg:col-span-8">
          <SkillProfileSection userId={user?.id || ""} />
        </div>

        {/* Right: Quick Launch + Compact Leaderboard */}
        <div className="space-y-4 lg:col-span-4">
          {/* Quick Launch */}
          <Card>
            <CardContent className="p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Truy cập nhanh
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                <Link
                  to="/code-lab"
                  className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background/70 px-2 py-2 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Terminal className="size-4 text-primary" />
                  <span>Code Lab</span>
                </Link>
                <Link
                  to="/problems"
                  className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background/70 px-2 py-2 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Code className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Luyện tập</span>
                </Link>
                <Link
                  to="/exams"
                  className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background/70 px-2 py-2 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <ClipboardList className="size-4 text-amber-600 dark:text-amber-400" />
                  <span>Phòng thi</span>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Pending Assignments & Open Exams */}
          {(pendingAssignments.length > 0 || activeExams.length > 0) && (
            <Card>
              <CardContent className="p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Việc cần làm
                  </p>
                  <Link
                    to={pendingAssignments.length > 0 ? "/my-assignments" : "/exams"}
                    className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
                  >
                    Xem tất cả <ArrowRight className="size-3" />
                  </Link>
                </div>
                <div className="space-y-1.5">
                  {activeExams.slice(0, 3).map((ex) => (
                    <Link
                      key={`ex-${ex.id}`}
                      to={`/exams/${ex.id}`}
                      className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-2.5 py-1.5 text-xs transition-colors hover:bg-amber-500/10"
                    >
                      <ClipboardCheck className="size-3.5 shrink-0 text-amber-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{ex.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {ex.subject} · {ex.durationMinutes}p
                        </p>
                      </div>
                      <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        {ex.attemptStatus === "in_progress" ? "Đang thi" : ex.attemptStatus ? "Đã nộp" : "Mở"}
                      </span>
                    </Link>
                  ))}
                  {pendingAssignments.slice(0, 4).map((asg) => {
                    const isOverdue = asg.deadline ? new Date(asg.deadline).getTime() < Date.now() : false;
                    return (
                      <Link
                        key={`asg-${asg.id}`}
                        to={`/problems/${asg.problemId}`}
                        className="flex items-center gap-2 rounded-lg border border-border bg-background/70 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/70"
                      >
                        <ListChecks className="size-3.5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">{asg.title}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{asg.problemTitle}</p>
                        </div>
                        {asg.deadline ? (
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                              isOverdue
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {new Date(asg.deadline).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Leaderboard */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold">
                  <Trophy className="size-3.5 text-amber-500" /> Bảng xếp hạng
                </h3>
                <div className="flex items-center gap-1.5">
                  <span
                    title={inTop3 ? "Bạn đang trong top 3!" : "Vào top 3 để nhận thưởng"}
                    className="inline-flex items-center"
                  >
                    <Gift className={cn("size-3.5", inTop3 ? "text-primary" : "text-muted-foreground/35")} />
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowRewardInfo(true)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Xem thông tin thưởng"
                  >
                    <HelpCircle className="size-3.5" />
                  </button>
                  <Link to="/leaderboard" className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline">
                    Tất cả <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
              {leaderboard.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">Chưa có dữ liệu.</p>
              ) : (
                <div className="divide-y divide-border">
                  {leaderboard.slice(0, 8).map((entry, i) => (
                    <div
                      key={entry.userId}
                      className={cn(
                        "flex items-center gap-2.5 px-3.5 py-2",
                        entry.userId === currentUserId ? "bg-primary/5" : i === 0 ? "bg-muted/40" : "",
                      )}
                    >
                      <span
                        className={cn(
                          "w-5 text-center text-[11px] font-semibold tabular-nums",
                          i < 3 ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                      <img
                        src={entry.avatarUrl || getAnimalAvatarUrl(entry.fullName)}
                        alt=""
                        className="size-6 rounded-full object-cover"
                        style={{ backgroundColor: getAvatarBgColor(entry.fullName) }}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{entry.fullName}</span>
                      <span className="text-[11px] text-muted-foreground">Lv.{entry.level}</span>
                      <span className="w-14 text-right text-[11px] font-semibold tabular-nums text-foreground">
                        {entry.xp.toLocaleString("vi-VN")} XP
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Reward info popup */}
      <Dialog open={showRewardInfo} onOpenChange={(open) => setShowRewardInfo(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Gift className="size-4 text-primary" /> Thưởng Bảng Xếp Hạng
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5 text-sm">
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <CalendarDays className="size-3.5 text-muted-foreground" /> Mỗi ngày
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Hạng 1: <b>5</b> · Hạng 2: <b>4</b> · Hạng 3: <b>3</b> tokens
              </p>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Trophy className="size-3.5 text-muted-foreground" /> Mỗi tuần
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Hạng 1: <b>50</b> · Hạng 2: <b>40</b> · Hạng 3: <b>30</b> tokens (trao Chủ Nhật)
              </p>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Flame className="size-3.5 text-muted-foreground" /> Streak điểm danh
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Điểm danh mỗi ngày để tăng thưởng tokens (tối đa <b>30</b>/ngày)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setShowRewardInfo(false)}>
              Đã hiểu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface LeaderboardEntry {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  xp: number;
  level: number;
}

function TeacherDashboard() {
  const [studentQuery, setStudentQuery] = useState("");
  const dashQ = useQuery({
    queryKey: ["dashboard-staff"],
    queryFn: () => api.get("/dashboard").then((r) => r.data),
  });
  const { data: courses = [] } = useQuery<any[]>({
    queryKey: ["courses"],
    queryFn: () => api.get("/courses").then((r) => (Array.isArray(r.data) ? r.data : r.data?.courses ?? [])),
  });
  const studentsQ = useQuery<
    Array<{ id: string; fullName: string; nickname?: string | null; email: string; avatarUrl: string | null; status?: string }>
  >({
    queryKey: ["students", "all"],
    queryFn: () => api.get("/students").then((r) => r.data),
  });
  const students = studentsQ.data || [];

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        (s.nickname && s.nickname.toLowerCase().includes(q)) ||
        s.email.toLowerCase().includes(q),
    );
  }, [studentQuery, students]);

  const activeCourseCount = courses.filter((c: any) => c.status === "active").length;
  const actionItems = dashQ.data?.actionItems as
    | { examsNeedsReview: number; openBugReports: number; pendingRedemptions: number; pendingHackTests: number }
    | undefined;
  const hasActionItems = Boolean(
    actionItems &&
      (actionItems.examsNeedsReview > 0 ||
        actionItems.openBugReports > 0 ||
        actionItems.pendingRedemptions > 0 ||
        actionItems.pendingHackTests > 0),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Compact Header + Quick Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Bảng tin giáo viên</h1>
          <p className="text-xs text-muted-foreground">Tổng quan lớp học, học viên và công cụ giảng dạy.</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to="/attendance"
            className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <CalendarCheck className="size-3.5" /> Điểm danh
          </Link>
          <Link
            to="/code-lab"
            className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Terminal className="size-3.5 text-primary" /> Code Lab
          </Link>
          <Link
            to="/courses"
            className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <BookOpen className="size-3.5 text-muted-foreground" /> Khóa học
          </Link>
          <Link
            to="/exams"
            className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <ClipboardList className="size-3.5 text-muted-foreground" /> Phòng thi
          </Link>
        </div>
      </div>

      {/* Compact KPI Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-3.5">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Tổng khóa học</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{courses.length}</p>
            </div>
            <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="size-4" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-3.5">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Đang hoạt động</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{activeCourseCount}</p>
            </div>
            <div className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="size-4" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-3.5">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Tổng học viên</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{students.length}</p>
            </div>
            <div className="grid size-8 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Users className="size-4" />
            </div>
          </CardContent>
        </Card>
        <Link to="/monitor" className="block">
          <Card className="h-full transition-colors hover:border-primary/40">
            <CardContent className="flex items-center justify-between p-3.5">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Giám sát lớp</p>
                <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  Mở màn hình <ArrowRight className="size-3" />
                </p>
              </div>
              <div className="grid size-8 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Radar className="size-4" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Pending Action Items Strip */}
      {hasActionItems && actionItems && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Cần xử lý
          </span>
          {actionItems.examsNeedsReview > 0 && (
            <Link
              to="/exams"
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
            >
              <ClipboardCheck className="size-3.5" />
              <span>{actionItems.examsNeedsReview} bài thi chờ chấm</span>
            </Link>
          )}
          {actionItems.openBugReports > 0 && (
            <Link
              to="/bug-reports"
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-500/20 dark:text-rose-300"
            >
              <Bug className="size-3.5" />
              <span>{actionItems.openBugReports} báo lỗi đang mở</span>
            </Link>
          )}
          {actionItems.pendingRedemptions > 0 && (
            <Link
              to="/tokens"
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <Gift className="size-3.5" />
              <span>{actionItems.pendingRedemptions} đổi thưởng chờ duyệt</span>
            </Link>
          )}
          {actionItems.pendingHackTests > 0 && (
            <Link
              to="/problems"
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-500/20 dark:text-sky-300"
            >
              <Code className="size-3.5" />
              <span>{actionItems.pendingHackTests} hacktest chờ duyệt</span>
            </Link>
          )}
        </div>
      )}

      {/* Student Directory */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Danh sách học viên</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {filteredStudents.length}
              </span>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                data-slot="dashboard-search"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                placeholder="Tìm theo tên hoặc email..."
                className="h-8 w-full rounded-[7px] border border-border bg-background pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none"
              />
            </div>
          </div>

          {studentsQ.isLoading ? (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton-shimmer h-14 rounded-lg border border-border bg-muted/40" />
              ))}
            </div>
          ) : studentsQ.isError ? (
            <ErrorState title="Không thể tải danh sách học sinh" />
          ) : filteredStudents.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {studentQuery ? "Không tìm thấy học viên khớp từ khóa." : "Chưa có học viên nào."}
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filteredStudents.map((student) => (
                <Link
                  key={student.id}
                  to={`/students/${student.id}`}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-primary/30 hover:bg-muted/50"
                >
                  <img
                    src={student.avatarUrl || getAnimalAvatarUrl(student.fullName)}
                    alt=""
                    className="size-8 shrink-0 rounded-full object-cover"
                    style={{ backgroundColor: getAvatarBgColor(student.fullName) }}
                  />
                  <span className="min-w-0 flex-1">
                    <StudentName fullName={student.fullName} nickname={student.nickname} primaryClassName="text-xs font-semibold" />
                    <span className="block truncate text-[11px] text-muted-foreground">{student.email}</span>
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/70" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Skill Profile Section (Student Dashboard) ──

function SkillProfileSection({ userId }: { userId: string }) {
  const [skills, setSkills] = useState<SkillState[]>([]);
  const [topics, setTopics] = useState<TopicGroup[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<SkillLanguage>("py");
  const [langTouched, setLangTouched] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/skills/${userId}`).then((r) => r.data).catch(() => []),
      api.get(`/skills/${userId}/recommendations`).then((r) => r.data).catch(() => []),
      api.get(`/skills`).then((r) => r.data).catch(() => []),
    ])
      .then(([s, r, t]) => {
        setSkills(s);
        setRecs(r);
        setTopics(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

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

  if (loading || skills.length === 0) return null;

  const scopedTopics = topicsForLanguage(topics, lang);
  const scopedSkills = skillsForLanguage(skills, lang);
  const radarData = groupSkillsByTopic(
    scopedSkills.map((s) => ({
      skillId: s.skillId,
      name: s.name,
      mastery: s.hasEvidence ? s.mastery : 0,
      trend: s.trend,
      hasEvidence: s.hasEvidence,
    })),
    scopedTopics.map((t) => ({ topicId: t.topicId, topicName: t.topicName, skillIds: t.skills.map((sk) => sk.skillId) })),
    lang,
  );

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Radar className="size-4 text-primary" />
          <h3 className="text-xs font-semibold">Hồ sơ kỹ năng</h3>
          <div className="ml-auto flex items-center gap-0.5 rounded-[7px] border border-border bg-muted/60 p-0.5" role="tablist" aria-label="Chọn ngôn ngữ">
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
                onClick={() => { setLangTouched(true); setLang(tab.id); }}
                className={cn(
                  "rounded-[5px] px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                  lang === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:items-center">
          {radarData.length >= 3 ? (
            <div className="flex justify-center py-1">
              <RadarChart data={radarData} size={235} />
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">Chưa đủ dữ liệu để vẽ radar.</p>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Chi tiết theo kỹ năng</p>
            <SkillDetailList skills={scopedSkills} topics={scopedTopics} />
          </div>
        </div>

        {recs.length > 0 && (
          <div className="space-y-1.5 border-t border-border pt-2.5">
            {recs.slice(0, 2).map((rec) => (
              <div key={rec.id} className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                <p className="font-semibold">{rec.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{rec.reason}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SkillDetailList({
  skills,
  topics,
}: {
  skills: SkillState[];
  topics: TopicGroup[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const toggle = (topicId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const skillToTopic = new Map<string, { topicId: string; topicName: string }>();
  for (const t of topics) {
    for (const sk of t.skills) {
      skillToTopic.set(sk.skillId, { topicId: t.topicId, topicName: t.topicName });
    }
  }

  const groups: { topicId: string; topicName: string; items: SkillState[] }[] = [];
  for (const t of topics) {
    const items = skills.filter((s) => skillToTopic.get(s.skillId)?.topicId === t.topicId);
    if (items.length > 0) groups.push({ topicId: t.topicId, topicName: t.topicName, items });
  }
  const mapped = new Set(groups.flatMap((g) => g.items.map((i) => i.skillId)));
  const others = skills.filter((s) => !mapped.has(s.skillId));
  if (others.length > 0) groups.push({ topicId: "_other", topicName: "Khác", items: others });

  const TrendIcon = { up: TrendingUp, down: TrendingDown, flat: Minus };
  const trendColor = { up: "text-emerald-500", down: "text-red-500", flat: "text-muted-foreground" };
  const barColor = (m: number) => (m >= 0.75 ? "bg-emerald-500" : m >= 0.5 ? "bg-amber-500" : "bg-red-500");

  return (
    <div className="space-y-1">
      {groups.map((g) => {
        const known = g.items.filter((x) => x.hasEvidence);
        const avg = known.length > 0 ? known.reduce((s, x) => s + x.mastery, 0) / known.length : 0;
        const isOpen = expanded.has(g.topicId);
        return (
          <div key={g.topicId} className="rounded-md">
            <button
              type="button"
              onClick={() => toggle(g.topicId)}
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60"
            >
              {isOpen ? (
                <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 truncate text-[11px] font-semibold text-foreground/85">{g.topicName}</span>
              <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                {known.length > 0 && (
                  <div className={`h-full rounded-full ${barColor(avg)}`} style={{ width: `${Math.round(avg * 100)}%` }} />
                )}
              </div>
              <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground/85">
                {known.length > 0 ? `${Math.round(avg * 100)}%` : "—"}
              </span>
            </button>

            {isOpen && (
              <div className="space-y-1 pb-1 pl-1">
                {g.items.map((s) => {
                  const TI = TrendIcon[s.trend];
                  const hasInterval = s.hasEvidence && s.lowerBound != null && s.upperBound != null;
                  const lower = hasInterval ? s.lowerBound! : s.mastery;
                  const upper = hasInterval ? s.upperBound! : s.mastery;
                  const intervalLabel = hasInterval ? `${Math.round(lower * 100)}–${Math.round(upper * 100)}%` : "—";
                  const isDetailOpen = selectedSkillId === s.skillId;
                  return (
                    <div key={s.skillId} className="rounded-md pl-3">
                      <button
                        type="button"
                        onClick={() => setSelectedSkillId(isDetailOpen ? null : s.skillId)}
                        className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs transition-colors hover:bg-muted/50"
                      >
                        <span className="w-28 shrink-0 truncate text-muted-foreground" title={s.name}>
                          {s.name}
                        </span>
                        <div
                          className="relative h-1.5 flex-1 rounded-full bg-muted"
                          title={hasInterval ? `Ước lượng ${Math.round(s.mastery * 100)}%, khoảng ${intervalLabel}` : undefined}
                        >
                          {s.hasEvidence && hasInterval && (
                            <>
                              <div
                                className={`absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-35 ${barColor(s.mastery)}`}
                                style={{ left: `${lower * 100}%`, width: `${Math.max(1, (upper - lower) * 100)}%` }}
                              />
                              <span
                                className={`absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 ${barColor(s.mastery)}`}
                                style={{ left: `${lower * 100}%` }}
                              />
                              <span
                                className={`absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 ${barColor(s.mastery)}`}
                                style={{ left: `${upper * 100}%` }}
                              />
                              <span
                                className={`absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background ${barColor(s.mastery)}`}
                                style={{ left: `${s.mastery * 100}%` }}
                              />
                            </>
                          )}
                        </div>
                        {s.dueForReview && (
                          <span className="shrink-0 rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300">
                            Cần ôn
                          </span>
                        )}
                        <span className="w-8 shrink-0 text-right font-medium tabular-nums">
                          {s.hasEvidence ? `${Math.round(s.mastery * 100)}%` : "—"}
                        </span>
                        {s.hasEvidence ? (
                          <TI className={`size-3 shrink-0 ${trendColor[s.trend]}`} />
                        ) : (
                          <span className="size-3 shrink-0 text-center text-[10px] text-muted-foreground">?</span>
                        )}
                      </button>

                      {isDetailOpen && (
                        <div className="mb-1.5 mt-0.5 rounded-md border border-border/70 bg-muted/30 px-2.5 py-2 text-[11px] space-y-1.5">
                          {s.hasEvidence ? (
                            <>
                              <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                                <span>
                                  Khoảng tin cậy: <strong className="text-foreground">{intervalLabel}</strong>
                                </span>
                                {s.retentionRate != null && (
                                  <span>
                                    Lưu giữ: <strong className="text-foreground">{Math.round(s.retentionRate * 100)}%</strong>
                                    {s.daysSinceLastPractice != null && s.daysSinceLastPractice >= 1
                                      ? ` (${Math.round(s.daysSinceLastPractice)} ngày trước)`
                                      : " (gần đây)"}
                                  </span>
                                )}
                              </div>
                              {s.weakPrerequisites && s.weakPrerequisites.length > 0 && (
                                <p className="text-amber-700 dark:text-amber-300">
                                  Nền tảng cần củng cố: {s.weakPrerequisites.map((wp) => `${wp.name} (${Math.round(wp.mastery * 100)}%)`).join(", ")}
                                </p>
                              )}
                              {s.breakdown && s.breakdown.length > 0 && (
                                <div className="space-y-0.5 border-t border-border/50 pt-1">
                                  {s.breakdown.map((b, idx) => {
                                    const dPct = Math.round(b.delta * 100);
                                    return (
                                      <div key={`${b.ts}-${idx}`} className="flex items-center justify-between gap-2">
                                        <span className="min-w-0 flex-1 truncate text-foreground/85">
                                          {b.label}
                                          {b.total ? ` (${b.correct ?? 0}/${b.total})` : ""}
                                        </span>
                                        <span className={cn(
                                          "shrink-0 font-semibold tabular-nums",
                                          b.delta > 0.005 ? "text-emerald-600 dark:text-emerald-400" : b.delta < -0.005 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
                                        )}>
                                          {dPct > 0 ? `+${dPct}%` : `${dPct}%`}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="text-muted-foreground">
                              {s.estimatedPrior != null
                                ? `Ước lượng sơ bộ ~${Math.round(s.estimatedPrior * 100)}% từ kỹ năng liên quan (chưa có bài làm trực tiếp).`
                                : "Chưa có dữ liệu bài làm cho kỹ năng này."}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
