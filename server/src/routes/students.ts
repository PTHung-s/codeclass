import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, query, isStaff } from "../utils/routeHelpers";
import { redactAnswerKey } from "../utils/quizReview";
import { safeOptionOrder, toDisplayFrame } from "../utils/quizOptionOrder";
import { hashPassword } from "../utils/jwt";
import crypto from "crypto";

const router = Router();

// Staff have full access to any course; membership is no longer gated.
async function checkCourseAccess(_userId: string, role: string, _courseId: string) {
  return isStaff(role);
}

/** One row of QuizAttempt.answers as it is written by POST /quizzes/:id/attempt. */
type StoredQuizAnswer = {
  questionId: string;
  correctIndex?: number | null;
  selectedIndex?: number | null;
  isCorrect: boolean;
  /** display→bank map of the attempt. Absent on attempts sat before shuffling. */
  optionOrder?: number[];
  [key: string]: any;
};

async function canViewStudentProfile(viewerId: string, role: string, studentId: string) {
  if (role === "admin") return true;
  if (role === "student") return viewerId === studentId;
  if (role === "teacher" || role === "teaching_assistant") return true;
  return false;
}

function createTemporaryPassword() {
  // Avoid ambiguous glyphs (O/0, l/1) because this value is relayed verbally.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

router.get("/students", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const courseId = query(req, "courseId");

    if (courseId) {
      if (req.user!.role !== "admin") {
        const access = await checkCourseAccess(req.user!.userId, req.user!.role, courseId);
        if (!access) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }

      const members = await prisma.courseMember.findMany({
        where: {
          courseId,
          roleInCourse: "student",
          status: "active",
        },
        include: {
          user: {
            select: { id: true, fullName: true, nickname: true, email: true, avatarUrl: true },
          },
        },
      });

      res.json(members.map(m => m.user));
    } else {
      const q = query(req, "q")?.trim();
      const users = await prisma.user.findMany({
        where: {
          role: "student",
          ...(q
            ? {
                OR: [
                  { fullName: { contains: q } },
                  { email: { contains: q } },
                ],
              }
            : {}),
        },
        select: { id: true, fullName: true, nickname: true, email: true, avatarUrl: true, status: true },
        orderBy: { fullName: "asc" },
        take: q ? 25 : undefined,
      });
      res.json(users);
    }
  } catch {
    res.status(500).json({ error: "Failed to fetch students" });
  }
});

/**
 * Admin-only recovery. Password hashes are deliberately never readable; this
 * creates a fresh temporary password and returns it exactly once to the admin.
 */
router.post("/students/:studentId/reset-password", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const studentId = param(req, "studentId");
    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, role: true, status: true } });
    if (!student || student.role !== "student") {
      res.status(404).json({ error: "Không tìm thấy học sinh" });
      return;
    }
    if (student.status !== "active") {
      res.status(400).json({ error: "Tài khoản học sinh đang không hoạt động" });
      return;
    }

    const temporaryPassword = createTemporaryPassword();
    const resetAt = new Date();
    await prisma.user.update({
      where: { id: studentId },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        passwordResetAt: resetAt,
        passwordResetById: req.user!.userId,
      },
    });
    // This is the sole response containing the temporary secret. It is not
    // stored in plaintext and will not be available after the page is closed.
    res.json({ temporaryPassword, resetAt, mustChangePassword: true });
  } catch (err) {
    console.error("admin student password reset error:", err);
    res.status(500).json({ error: "Không thể đặt lại mật khẩu" });
  }
});

router.get("/students/:studentId", authenticate, async (req: Request, res: Response) => {
  try {
    const studentId = param(req, "studentId");
    const { userId, role } = req.user!;

    const user = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true, fullName: true, nickname: true, email: true, avatarUrl: true,
        phone: true, bio: true, role: true, createdAt: true, lastLoginAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    if (user.role !== "student") {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    const allowed = await canViewStudentProfile(userId, role, studentId);
    if (!allowed) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const enrolledCourses = await prisma.courseMember.findMany({
      where: { userId: studentId, roleInCourse: "student", status: "active" },
      include: {
        course: { select: { id: true, title: true } },
      },
    });

    // ── Practice Analytics ──
    const problemSubs = await prisma.problemSubmission.findMany({
      where: { studentId },
      include: { problem: { select: { id: true, title: true, difficulty: true } } },
      orderBy: { createdAt: "desc" },
    });

    const df = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    function toDateKey(d: Date) { return df.format(d); }

    // Daily problems heatmap (last 12 weeks)
    const dailyCounts: Record<string, number> = {};
    const dailyActiveTime: Record<string, number> = {};
    for (const sub of problemSubs) {
      const key = toDateKey(sub.createdAt);
      dailyCounts[key] = (dailyCounts[key] || 0) + 1;
      dailyActiveTime[key] = (dailyActiveTime[key] || 0) + (sub.activeTimeSeconds || 0);
    }

    const heatmapDays: { date: string; count: number }[] = [];
    const timeHeatmapDays: { date: string; seconds: number }[] = [];
    for (let i = 12 * 7 - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = toDateKey(d);
      heatmapDays.push({ date: key, count: dailyCounts[key] || 0 });
      timeHeatmapDays.push({ date: key, seconds: dailyActiveTime[key] || 0 });
    }

    // Per-problem logs (with typing speed & time)
    const practiceLogs = problemSubs.map(s => ({
      id: s.id,
      problemId: s.problemId,
      problemTitle: s.problem.title,
      difficulty: s.problem.difficulty,
      typingSpeed: s.typingSpeed,
      activeTimeSeconds: s.activeTimeSeconds,
      totalTimeSeconds: s.totalTimeSeconds,
      codeLength: s.code?.length || 0,
      createdAt: s.createdAt,
    }));

    // Aggregated stats
    const speedSubs = problemSubs.filter(s => s.typingSpeed != null && s.typingSpeed > 0);
    const avgTypingSpeed = speedSubs.length > 0
      ? Math.round(speedSubs.reduce((a, s) => a + (s.typingSpeed || 0), 0) / speedSubs.length)
      : null;
    const timeSubs = problemSubs.filter(s => s.activeTimeSeconds != null && s.activeTimeSeconds > 0);
    const totalActiveTimeSeconds = timeSubs.reduce((a, s) => a + (s.activeTimeSeconds || 0), 0);
    const avgTimePerProblem = timeSubs.length > 0
      ? Math.round(totalActiveTimeSeconds / timeSubs.length)
      : null;
    const totalProblemsSolved = new Set(problemSubs.map(s => s.problemId)).size;

    // Course progress per enrolled course
    const courseIds = enrolledCourses.map((ec) => ec.courseId);
    const allLessons = await prisma.lesson.findMany({
      where: { courseId: { in: courseIds } },
      select: { id: true, courseId: true, moduleId: true },
    });
    const completedLessons = await prisma.lessonProgress.findMany({
      where: { userId: studentId, lessonId: { in: allLessons.map((l) => l.id) } },
      select: { lessonId: true },
    });
    const completedSet = new Set(completedLessons.map((l) => l.lessonId));
    const courseProgress: Record<string, { total: number; completed: number; percent: number }> = {};
    for (const ec of enrolledCourses) {
      const courseLessons = allLessons.filter((l) => l.courseId === ec.courseId);
      const completed = courseLessons.filter((l) => completedSet.has(l.id)).length;
      courseProgress[ec.courseId] = {
        total: courseLessons.length,
        completed,
        percent: courseLessons.length > 0 ? Math.round((completed / courseLessons.length) * 100) : 0,
      };
    }

    // Chapter progress (modules cleared via adaptive test)
    const chapterProgress = await prisma.chapterProgress.findMany({
      where: { userId: studentId },
      select: { moduleId: true, clearedAt: true },
    });
    const clearedModuleIds = new Set(chapterProgress.map((cp) => cp.moduleId));

    // Badges
    const userBadges = await prisma.userBadge.findMany({
      where: { userId: studentId },
      include: { badge: { select: { id: true, name: true, icon: true, description: true } } },
      orderBy: { earnedAt: "desc" },
    });

    res.json({
      user,
      enrolledCourses,
      courseProgress,
      chapterProgress,
      clearedModuleIds: [...clearedModuleIds],
      badges: userBadges.map((ub) => ({ name: ub.badge.name, icon: ub.badge.icon, description: ub.badge.description, earnedAt: ub.earnedAt })),
      practiceAnalytics: {
        totalProblemsSolved,
        avgTypingSpeed,
        avgTimePerProblem,
        totalActiveTimeSeconds,
        heatmapDays,
        timeHeatmapDays,
        practiceLogs,
      },
    });
  } catch (err) {
    console.error("student profile error:", err);
    res.status(500).json({ error: "Failed to fetch student profile" });
  }
});

router.post("/students/:studentId/notes", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const studentId = param(req, "studentId");
    const { courseId, note } = req.body;

    if (!courseId || !note) {
      res.status(400).json({ error: "Course ID and note are required" });
      return;
    }

    const teacherNote = await prisma.teacherNote.upsert({
      where: { studentId_courseId: { studentId, courseId } },
      update: { note, teacherId: req.user!.userId },
      create: { studentId, courseId, teacherId: req.user!.userId, note },
    });

    res.json(teacherNote);
  } catch {
    res.status(500).json({ error: "Failed to save note" });
  }
});

router.get("/students/:studentId/notes/:courseId", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const studentId = param(req, "studentId");
    const courseId = param(req, "courseId");

    const note = await prisma.teacherNote.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });

    res.json(note || { note: "" });
  } catch {
    res.status(500).json({ error: "Failed to fetch note" });
  }
});

/* ── GET /students/:studentId/quizzes?courseId= ── */
router.get("/students/:studentId/quizzes", authenticate, async (req: Request, res: Response) => {
  try {
    const studentId = param(req, "studentId");
    const { userId, role } = req.user!;
    if (!(await canViewStudentProfile(userId, role, studentId))) {
      res.status(403).json({ error: "Access denied" }); return;
    }
    const courseId = query(req, "courseId");

    const where: any = { userId: studentId };
    if (courseId) {
      where.quiz = { lesson: { courseId } };
    }

    const attempts = await prisma.quizAttempt.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        quiz: { select: { id: true, lessonId: true, title: true, passScore: true, lesson: { select: { title: true, module: { select: { title: true } } } } } },
      },
      take: 50,
    });

    // A student looking at their own profile is still a student with a quiz
    // left to sit — the stored answers carry correctIndex, so they get the same
    // treatment as the review page. Asked per quiz, not per attempt: passing
    // once opens that quiz for good, and the pass may sit outside the take: 50.
    const passedQuizIds = new Set(
      (await prisma.quizAttempt.findMany({
        where: { userId: studentId, passed: true },
        select: { quizId: true },
        distinct: ["quizId"],
      })).map((a) => a.quizId),
    );

    res.json(attempts.map((a) => ({
      id: a.id,
      quizId: a.quiz.id,
      quizTitle: a.quiz.title,
      lessonTitle: a.quiz.lesson.title,
      moduleTitle: a.quiz.lesson.module?.title || "",
      score: a.score,
      totalQuestions: a.totalQuestions,
      percent: a.totalQuestions > 0 ? Math.round((a.score / a.totalQuestions) * 100) : 0,
      passed: a.passed,
      passScore: a.quiz.passScore,
      answers: redactAnswerKey(
        // Stored rows are in bank order; the letters this page prints are the
        // letters the student clicked. Re-express both indices in the order that
        // attempt was served, or A/B/C/D here disagrees with the review page.
        (JSON.parse(a.answers || "[]") as StoredQuizAnswer[]).map(({ optionOrder, ...row }) =>
          toDisplayFrame(row, safeOptionOrder(optionOrder, Array.isArray(optionOrder) ? optionOrder.length : 0)),
        ),
        {
          role,
          // Disabled by product: review is always unlocked. See quizzes.ts.
          hasPassedQuiz: true,
        },
      ),
      createdAt: a.createdAt,
    })));
  } catch (err) {
    console.error("student quizzes error:", err);
    res.status(500).json({ error: "Failed to fetch student quizzes" });
  }
});

/* ── GET /students/:studentId/adaptive-tests?courseId= ── */
router.get("/students/:studentId/adaptive-tests", authenticate, async (req: Request, res: Response) => {
  try {
    const studentId = param(req, "studentId");
    const { userId, role } = req.user!;
    if (!(await canViewStudentProfile(userId, role, studentId))) {
      res.status(403).json({ error: "Access denied" }); return;
    }
    const courseId = query(req, "courseId");

    const where: any = { userId: studentId };
    if (courseId) where.courseId = courseId;

    const attempts = await prisma.adaptiveTestAttempt.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { module: { select: { title: true } } },
    });

    res.json(attempts.map((a) => ({
      id: a.id,
      moduleId: a.moduleId,
      moduleTitle: a.module.title,
      abilityStart: a.abilityStart,
      abilityEnd: a.abilityEnd,
      totalQuestions: a.totalQuestions,
      correctCount: a.correctCount,
      accuracyPercent: a.accuracyPercent,
      passed: a.passed,
      partialPass: a.partialPass,
      answers: JSON.parse(a.answers || "[]"),
      lessonBreakdown: JSON.parse(a.lessonBreakdown || "{}"),
      createdAt: a.createdAt,
    })));
  } catch (err) {
    console.error("student adaptive tests error:", err);
    res.status(500).json({ error: "Failed to fetch student adaptive tests" });
  }
});

/* ── GET /students/:studentId/attendance ── */
router.get("/students/:studentId/attendance", authenticate, async (req: Request, res: Response) => {
  try {
    const studentId = param(req, "studentId");
    const { userId, role } = req.user!;
    if (!(await canViewStudentProfile(userId, role, studentId))) {
      res.status(403).json({ error: "Access denied" }); return;
    }

    const records = await prisma.attendanceRecord.findMany({
      where: { studentId },
      include: { session: { select: { sessionDate: true, status: true, classGroup: { select: { name: true } } } } },
      orderBy: { session: { sessionDate: "desc" } },
    });

    let present = 0, absent = 0, late = 0, excused = 0;
    for (const r of records) {
      if (r.status === "present") present++;
      else if (r.status === "absent") absent++;
      else if (r.status === "late") late++;
      else if (r.status === "excused") excused++;
    }
    const held = present + absent + late + excused;
    const attended = present + late;
    const rate = held > 0 ? Math.round((attended / held) * 100) : null;

    // Last 30 days for heatmap
    const dayMap = new Map<string, string>();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    for (const r of records) {
      if (r.session.sessionDate >= cutoff) {
        const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(r.session.sessionDate);
        if (!dayMap.has(key)) dayMap.set(key, r.status);
      }
    }

    res.json({
      stats: { present, absent, late, excused, held, attended, rate },
      recentDays: [...dayMap.entries()].map(([date, status]) => ({ date, status })),
    });
  } catch (err) {
    console.error("student attendance error:", err);
    res.status(500).json({ error: "Failed to fetch attendance" });
  }
});

export default router;
