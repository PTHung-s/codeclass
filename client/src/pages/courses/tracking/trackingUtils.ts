/** Shared types + presentation helpers for the teacher tracking tab. */

export interface TrackingModule {
  id: string;
  title: string;
  orderIndex: number;
  lessonCount: number;
}

export interface TrackingLesson {
  id: string;
  title: string;
  moduleId: string;
  moduleTitle: string;
  orderIndex: number;
}

export interface TrackingStudent {
  userId: string;
  fullName: string;
  nickname?: string | null;
  email?: string;
  avatarUrl?: string | null;
  lessonsCompleted: number;
  totalLessons: number;
  percent: number;
  perModule: Record<string, { done: number; total: number }>;
  currentLesson: { id: string; title: string; moduleTitle: string } | null;
  quiz: { attempted: number; passed: number; total: number; avgBestPercent: number | null };
  challenge: { attempted: number; passed: number; stuck: number };
  lastActiveAt: string | null;
}

export interface TrackingWarning {
  userId: string;
  fullName: string;
  nickname?: string | null;
  type: "quiz_failing" | "inactive" | "challenge_stuck" | "behind";
  severity: "high" | "medium" | "low";
  detail: string;
}

export interface TrackingOverview {
  course: { id: string; title: string };
  modules: TrackingModule[];
  lessons: TrackingLesson[];
  students: TrackingStudent[];
  warnings: TrackingWarning[];
  totals: {
    students: number;
    lessons: number;
    modules: number;
    quizzes?: number;
    classMedianPercent?: number;
  };
}

/**
 * Same emerald / amber / red thresholds as the existing SkillHeatmap, so the
 * two teacher views read the same way.
 */
export function ratioColor(ratio: number, empty = false) {
  if (empty) return "bg-muted text-muted-foreground";
  const pct = Math.round(ratio * 100);
  if (pct >= 75) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
  if (pct >= 50) return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
  if (pct > 0) return "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400";
  return "bg-muted text-muted-foreground";
}

export function scoreColor(percent: number | null | undefined, passed?: boolean) {
  if (percent == null) return "bg-muted text-muted-foreground";
  if (passed) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
  if (percent >= 50) return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
  return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatRelativeDays(value?: string | Date | null) {
  if (!value) return "Chưa hoạt động";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "Chưa hoạt động";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  if (days < 30) return `${days} ngày trước`;
  return formatDate(d);
}

export function initialOf(name?: string | null) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}
