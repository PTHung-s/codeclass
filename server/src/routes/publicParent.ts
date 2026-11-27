import { Router, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import prisma from "../utils/prisma";
import { param } from "../utils/routeHelpers";
import { buildStudentWeeklyReport } from "../services/weeklyReportService";

const router = Router();

const parentPortalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Quá nhiều lượt truy cập. Vui lòng thử lại sau 1 phút." },
});

router.get("/:token", parentPortalLimiter, async (req: Request, res: Response) => {
  try {
    const token = param(req, "token").trim();
    if (!token || token.length < 12) {
      res.status(404).json({ error: "Liên kết báo cáo phụ huynh không hợp lệ." });
      return;
    }

    const student = await prisma.user.findFirst({
      where: { parentPortalToken: token, role: "student", status: "active" },
      select: { id: true, fullName: true, nickname: true, avatarUrl: true },
    });

    if (!student) {
      res.status(404).json({ error: "Liên kết không tồn tại hoặc đã bị thu hồi." });
      return;
    }

    const daysParam = Number(req.query.days);
    const days = daysParam === 14 || daysParam === 30 ? daysParam : 7;

    const [report, recentAttendance, recentExams, tuitionRows, solvedProblems] = await Promise.all([
      buildStudentWeeklyReport(student.id, days),
      prisma.attendanceRecord.findMany({
        where: { studentId: student.id },
        include: {
          session: {
            select: {
              sessionDate: true,
              classGroup: { select: { name: true } },
            },
          },
        },
        orderBy: { session: { sessionDate: "desc" } },
        take: 10,
      }),
      prisma.examAttempt.findMany({
        where: { studentId: student.id, status: { in: ["submitted", "graded"] } },
        include: { exam: { select: { title: true, scale: true } } },
        orderBy: { submittedAt: "desc" },
        take: 5,
      }),
      prisma.globalTuitionPayment.findMany({
        where: { userId: student.id },
        orderBy: { period: "desc" },
        take: 6,
      }),
      prisma.problemSubmission.findMany({
        where: { studentId: student.id, passed: true },
        select: { problemId: true },
        distinct: ["problemId"],
      }),
    ]);

    if (!report) {
      res.status(404).json({ error: "Không tìm thấy dữ liệu học sinh." });
      return;
    }

    // Strip email/internal PII from public parent payload.
    res.json({
      student: {
        id: student.id,
        fullName: student.fullName,
        nickname: student.nickname,
        avatarUrl: student.avatarUrl,
      },
      days: report.days,
      fromDate: report.fromDate,
      toDate: report.toDate,
      metrics: report.metrics,
      reportText: report.reportText,
      problemsSolvedAllTime: solvedProblems.length,
      recentAttendance: recentAttendance.map((a) => ({
        date: a.session.sessionDate,
        courseTitle: a.session.classGroup?.name || "Lớp học",
        status: a.status,
        note: a.note || null,
      })),
      recentExams: recentExams.map((e) => ({
        title: e.exam.title,
        totalScore: e.totalScore,
        maxScore: e.maxScore,
        gradeStatus: e.gradeStatus,
        submittedAt: e.submittedAt,
      })),
      tuition: tuitionRows.map((t) => ({
        period: t.period,
        status: t.status,
        amount: t.amount,
        paidAt: t.paidAt,
      })),
    });
  } catch (err) {
    console.error("public parent portal error:", err);
    res.status(500).json({ error: "Không tải được báo cáo phụ huynh." });
  }
});

export default router;
