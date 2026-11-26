import prisma from "../utils/prisma";
import { getStreak } from "../utils/xpLedger";
import { getSkillStates } from "./skillMastery";
import {
  ACTIVE_SUBMISSION_TYPES,
  assignmentItemInclude,
  evaluateAssignmentsForStudents,
} from "./assignmentService";

export interface WeeklyReportPayload {
  days: number;
  fromDate: string;
  toDate: string;
  student: {
    id: string;
    fullName: string;
    nickname: string | null;
    email: string;
  };
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
}

function fmtShortDateVi(date: Date) {
  return date.toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Pure formatter returning a warm, concise Vietnamese parent summary suitable
 * for copying straight into Zalo.
 */
export function formatWeeklyParentReport(payload: Omit<WeeklyReportPayload, "reportText">): string {
  const { days, fromDate, toDate, student, metrics } = payload;
  const displayName = student.nickname ? `${student.fullName} (${student.nickname})` : student.fullName;
  const fromStr = fmtShortDateVi(new Date(fromDate));
  const toStr = fmtShortDateVi(new Date(toDate));

  const lines: string[] = [
    `📊 BÁO CÁO HỌC TẬP (${days} ngày: ${fromStr} – ${toStr})`,
    `Học viên: ${displayName}`,
    "",
  ];

  // 1. Chuyên cần
  if (metrics.attendance.held > 0) {
    const rateStr = metrics.attendance.rate !== null ? ` (${metrics.attendance.rate}%)` : "";
    const extra: string[] = [];
    if (metrics.attendance.late > 0) extra.push(`${metrics.attendance.late} muộn`);
    if (metrics.attendance.absent > 0) extra.push(`${metrics.attendance.absent} vắng`);
    if (metrics.attendance.excused > 0) extra.push(`${metrics.attendance.excused} có phép`);
    const extraStr = extra.length ? ` · ${extra.join(", ")}` : "";
    lines.push(
      `• Chuyên cần: có mặt ${metrics.attendance.present}/${metrics.attendance.held} buổi${rateStr}${extraStr}.`,
    );
  } else {
    lines.push("• Chuyên cần: chưa có buổi điểm danh trong kỳ.");
  }

  // 2. Bài tập được giao
  if (metrics.assignments.total > 0) {
    const pct = Math.round((metrics.assignments.passed / metrics.assignments.total) * 100);
    const notes: string[] = [];
    if (metrics.assignments.lateCount > 0) notes.push(`${metrics.assignments.lateCount} bài nộp muộn`);
    if (metrics.assignments.overdueCount > 0) {
      notes.push(
        `${metrics.assignments.overdueCount} bài quá hạn chưa xong (${metrics.assignments.overdueTitles.slice(0, 2).join(", ")}${metrics.assignments.overdueTitles.length > 2 ? ", ..." : ""})`,
      );
    }
    const suffix = notes.length ? ` (${notes.join("; ")})` : " (đúng hạn)";
    lines.push(
      `• Bài tập được giao: hoàn thành ${metrics.assignments.passed}/${metrics.assignments.total} bài (${pct}%)${suffix}.`,
    );
  } else {
    lines.push("• Bài tập được giao: hiện chưa có bài tập nào đang mở.");
  }

  // 3. Luyện tập & kiểm tra trong kỳ
  const practiceParts: string[] = [];
  practiceParts.push(`${metrics.practice.problemsSolvedInPeriod} bài code mới đạt`);
  if (metrics.practice.lessonsCompletedInPeriod > 0) {
    practiceParts.push(`${metrics.practice.lessonsCompletedInPeriod} bài học`);
  }
  if (metrics.practice.quizzesAttemptedInPeriod > 0) {
    practiceParts.push(`${metrics.practice.quizzesPassedInPeriod}/${metrics.practice.quizzesAttemptedInPeriod} quiz đạt`);
  }
  if (metrics.streak > 0) {
    practiceParts.push(`chuỗi học ${metrics.streak} ngày`);
  }
  lines.push(`• Tự luyện & tiến độ: ${practiceParts.join(", ")}.`);

  if (metrics.practice.latestExam) {
    lines.push(
      `• Bài kiểm tra gần nhất: "${metrics.practice.latestExam.title}" (${metrics.practice.latestExam.scoreText}).`,
    );
  }

  // 4. Kỹ năng
  if (metrics.skills.strongest.length > 0) {
    const topStr = metrics.skills.strongest
      .map((s) => `${s.name} (${Math.round(s.mastery * 100)}%)`)
      .join(", ");
    lines.push(`• Điểm mạnh: ${topStr}.`);
  }
  if (metrics.skills.weakest.length > 0) {
    const weakStr = metrics.skills.weakest
      .map((s) => `${s.name} (${Math.round(s.mastery * 100)}%${s.dueForReview ? ", cần ôn" : ""})`)
      .join(", ");
    lines.push(`• Cần củng cố thêm: ${weakStr}.`);
  }

  // 5. Nhận xét tổng kết ngắn
  lines.push("");
  if (metrics.assignments.overdueCount > 0) {
    lines.push("💬 Nhắn phụ huynh: Con chú ý hoàn thành nốt các bài tập quá hạn để theo kịp tiến độ lớp nhé ạ.");
  } else if (metrics.skills.weakest.length > 0) {
    lines.push(
      `💬 Nhắn phụ huynh: Con học đều và giữ tiến độ tốt, tuần tới nên luyện thêm phần ${metrics.skills.weakest[0].name} để vững hơn ạ.`,
    );
  } else {
    lines.push("💬 Nhắn phụ huynh: Con giữ phong độ học tập rất tốt, tiếp tục phát huy ạ!");
  }

  return lines.join("\n");
}

export async function buildStudentWeeklyReport(studentId: string, daysInput = 7): Promise<WeeklyReportPayload | null> {
  const days = Math.min(30, Math.max(1, Math.round(daysInput)));
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - days * 24 * 60 * 60 * 1000);

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { id: true, fullName: true, nickname: true, email: true },
  });
  if (!student) return null;

  const [
    attendanceRows,
    assignedLinks,
    solvedSubsInPeriod,
    lessonsInPeriod,
    quizzesInPeriod,
    latestExamAttempt,
    streak,
    skillStates,
  ] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: {
        studentId,
        session: { sessionDate: { gte: fromDate, lte: toDate } },
      },
      select: { status: true },
    }),
    prisma.assignmentStudent.findMany({
      where: {
        studentId,
        assignment: { status: "published", submissionType: { in: [...ACTIVE_SUBMISSION_TYPES] } },
      },
      include: {
        assignment: { include: assignmentItemInclude },
      },
    }),
    prisma.problemSubmission.findMany({
      where: { studentId, passed: true, createdAt: { gte: fromDate, lte: toDate } },
      select: { problemId: true },
      distinct: ["problemId"],
    }),
    prisma.lessonProgress.count({
      where: { userId: studentId, completedAt: { gte: fromDate, lte: toDate } },
    }),
    prisma.quizAttempt.findMany({
      where: { userId: studentId, createdAt: { gte: fromDate, lte: toDate } },
      select: { passed: true },
    }),
    prisma.examAttempt.findFirst({
      where: { studentId, status: { in: ["submitted", "graded"] } },
      include: { exam: { select: { title: true, scale: true } } },
      orderBy: { submittedAt: "desc" },
    }),
    getStreak(studentId).catch(() => 0),
    getSkillStates(studentId).catch(() => []),
  ]);

  let present = 0;
  let late = 0;
  let absent = 0;
  let excused = 0;
  for (const r of attendanceRows) {
    if (r.status === "present") present++;
    else if (r.status === "late") late++;
    else if (r.status === "absent") absent++;
    else if (r.status === "excused") excused++;
  }
  const held = present + late + absent + excused;
  const attendanceRate = held > 0 ? Math.round(((present + late) / held) * 100) : null;

  const assignments = assignedLinks.map((l) => l.assignment);
  const progressMap = await evaluateAssignmentsForStudents(assignments, [studentId], toDate);

  let passedAssignments = 0;
  let lateCount = 0;
  const overdueTitles: string[] = [];
  for (const a of assignments) {
    const p = progressMap.get(`${a.id}:${studentId}`);
    if (!p) continue;
    if (p.status === "passed") passedAssignments++;
    if (p.isLate && p.status !== "not_started") lateCount++;
    if (p.overdue) overdueTitles.push(a.title);
  }

  const evaluatedSkills = skillStates.filter((s) => s.evidenceCount > 0);
  const strongest = [...evaluatedSkills]
    .filter((s) => s.mastery >= 0.7)
    .sort((a, b) => b.mastery - a.mastery)
    .slice(0, 3)
    .map((s) => ({ skillId: s.skillId, name: s.name, mastery: s.mastery }));

  const weakest = [...evaluatedSkills]
    .filter((s) => s.mastery < 0.65 || s.dueForReview)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 3)
    .map((s) => ({ skillId: s.skillId, name: s.name, mastery: s.mastery, dueForReview: !!s.dueForReview }));

  const latestExam = latestExamAttempt
    ? {
        title: latestExamAttempt.exam.title,
        scoreText:
          latestExamAttempt.totalScore != null
            ? `${Math.round(latestExamAttempt.totalScore * 10) / 10}${latestExamAttempt.maxScore != null ? `/${Math.round(latestExamAttempt.maxScore * 10) / 10}` : ""}`
            : latestExamAttempt.gradeStatus === "needs_review"
              ? "chờ chấm"
              : "đã nộp",
      }
    : null;

  const basePayload: Omit<WeeklyReportPayload, "reportText"> = {
    days,
    fromDate: fromDate.toISOString(),
    toDate: toDate.toISOString(),
    student,
    metrics: {
      streak,
      attendance: { held, present, late, absent, excused, rate: attendanceRate },
      assignments: {
        total: assignments.length,
        passed: passedAssignments,
        lateCount,
        overdueCount: overdueTitles.length,
        overdueTitles,
      },
      practice: {
        problemsSolvedInPeriod: solvedSubsInPeriod.length,
        lessonsCompletedInPeriod: lessonsInPeriod,
        quizzesAttemptedInPeriod: quizzesInPeriod.length,
        quizzesPassedInPeriod: quizzesInPeriod.filter((q) => q.passed).length,
        latestExam,
      },
      skills: { strongest, weakest },
    },
  };

  return {
    ...basePayload,
    reportText: formatWeeklyParentReport(basePayload),
  };
}
