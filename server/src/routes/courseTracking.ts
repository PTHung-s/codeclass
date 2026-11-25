import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, query } from "../utils/routeHelpers";

const router = Router();

// Every endpoint here is teacher-facing. The guard is scoped to this router's
// own path prefix, NOT registered bare: this router is mounted at "/api", so a
// bare router.use() would run for every request passing through — including
// routes owned by routers mounted after it — and reject students with 403
// before they ever reached their own endpoint.
router.use("/courses/:courseId/tracking", authenticate, requireRole("admin", "teacher", "teaching_assistant"));

// ── Warning thresholds (tweak here) ──
const QUIZ_FAIL_ATTEMPTS = 3; // ≥N attempts on one quiz, still not passed
const INACTIVE_DAYS = 7; // no lesson/quiz/challenge activity for N days
const CHALLENGE_STUCK_RUNS = 8; // ≥N runs on one challenge without passing
const BEHIND_RATIO = 0.5; // below N× the class median completion

/**
 * The effective roster.
 *
 * Deliberately NOT CourseMember: that table is abandoned as an access gate
 * (see checkCourseAccess in utils/routeHelpers.ts) and is wildly out of sync —
 * in production the C++ course has zero members but 18 students with real
 * progress. Attendance and tuition both use this "active students minus roster
 * exclusions" definition, so tracking matches them.
 */
function rosterWhere() {
  return { role: "student", status: "active", studentRosterExclusions: { none: {} } } as const;
}

async function loadRoster() {
  return prisma.user.findMany({
    where: rosterWhere(),
    select: { id: true, fullName: true, nickname: true, email: true, avatarUrl: true },
    orderBy: { fullName: "asc" },
  });
}

/** 404s consistently across every tracking endpoint for an unknown course. */
async function requireCourse(courseId: string, res: Response) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true } });
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return null;
  }
  return course;
}

/** Ordered modules + lessons for a course, in one query. */
async function loadCourseStructure(courseId: string) {
  const modules = await prisma.module.findMany({
    where: { courseId },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      title: true,
      orderIndex: true,
      lessons: {
        where: { status: { not: "archived" } },
        orderBy: { orderIndex: "asc" },
        select: { id: true, title: true, orderIndex: true },
      },
    },
  });

  const lessons = modules.flatMap((m) =>
    m.lessons.map((l) => ({ id: l.id, title: l.title, moduleId: m.id, moduleTitle: m.title, orderIndex: l.orderIndex })),
  );

  return { modules, lessons };
}

function percentOf(score: number, total: number) {
  return total > 0 ? Math.round((score / total) * 100) : 0;
}

/**
 * GET /api/courses/:courseId/tracking/overview
 *
 * Everything the grid + warnings need, in one request. Uses a handful of bulk
 * queries aggregated in JS rather than per-student queries — the box is a
 * 1 vCPU droplet on SQLite, and 21 students × 61 lessons would otherwise be
 * over a thousand round trips.
 */
router.get("/courses/:courseId/tracking/overview", async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "courseId");

    const course = await requireCourse(courseId, res);
    if (!course) return;

    const [roster, { modules, lessons }] = await Promise.all([loadRoster(), loadCourseStructure(courseId)]);
    const studentIds = roster.map((s) => s.id);
    const lessonIds = lessons.map((l) => l.id);

    if (!studentIds.length || !lessonIds.length) {
      res.json({
        course,
        modules: modules.map((m) => ({ id: m.id, title: m.title, orderIndex: m.orderIndex, lessonCount: m.lessons.length })),
        lessons,
        students: [],
        warnings: [],
        totals: { students: roster.length, lessons: lessons.length, modules: modules.length },
      });
      return;
    }

    const quizzes = await prisma.quiz.findMany({
      where: { lessonId: { in: lessonIds } },
      select: { id: true, lessonId: true, passScore: true, _count: { select: { questions: true } } },
    });
    const gradableQuizzes = quizzes.filter((q) => q._count.questions > 0);
    const quizIds = gradableQuizzes.map((q) => q.id);

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [progress, attempts, challenges, sessionLogs] = await Promise.all([
      prisma.lessonProgress.findMany({
        where: { userId: { in: studentIds }, lessonId: { in: lessonIds } },
        select: { userId: true, lessonId: true, completedAt: true },
      }),
      quizIds.length
        ? prisma.quizAttempt.findMany({
            where: { userId: { in: studentIds }, quizId: { in: quizIds } },
            select: { userId: true, quizId: true, score: true, totalQuestions: true, passed: true, createdAt: true },
          })
        : Promise.resolve([]),
      prisma.challengeAttempt.findMany({
        where: { userId: { in: studentIds }, lessonId: { in: lessonIds } },
        // latestCode is intentionally omitted — the overview only needs counters.
        select: { userId: true, lessonId: true, challengeKey: true, runCount: true, passed: true, lastRunAt: true },
      }),
      prisma.sessionLog.findMany({
        where: { userId: { in: studentIds }, date: { gte: since } },
        select: { userId: true, date: true, activeSeconds: true },
      }),
    ]);

    // ── Index everything by student ──
    const doneByStudent = new Map<string, Set<string>>();
    const lastProgressAt = new Map<string, Date>();
    for (const p of progress) {
      if (!doneByStudent.has(p.userId)) doneByStudent.set(p.userId, new Set());
      doneByStudent.get(p.userId)!.add(p.lessonId);
      const prev = lastProgressAt.get(p.userId);
      if (!prev || p.completedAt > prev) lastProgressAt.set(p.userId, p.completedAt);
    }

    // Best percent + attempt count per (student, quiz).
    const quizStats = new Map<string, { best: number; attempts: number; passed: boolean; lastAt: Date }>();
    for (const a of attempts) {
      const key = `${a.userId}::${a.quizId}`;
      const pct = percentOf(a.score, a.totalQuestions);
      const cur = quizStats.get(key);
      if (!cur) {
        quizStats.set(key, { best: pct, attempts: 1, passed: a.passed, lastAt: a.createdAt });
      } else {
        cur.best = Math.max(cur.best, pct);
        cur.attempts += 1;
        cur.passed = cur.passed || a.passed;
        if (a.createdAt > cur.lastAt) cur.lastAt = a.createdAt;
      }
    }

    const challengeByStudent = new Map<string, { attempted: number; passed: number; stuck: number; lastAt?: Date }>();
    for (const c of challenges) {
      const cur = challengeByStudent.get(c.userId) || { attempted: 0, passed: 0, stuck: 0 };
      cur.attempted += 1;
      if (c.passed === true) cur.passed += 1;
      if (c.passed !== true && c.runCount >= CHALLENGE_STUCK_RUNS) cur.stuck += 1;
      if (!cur.lastAt || c.lastRunAt > cur.lastAt) cur.lastAt = c.lastRunAt;
      challengeByStudent.set(c.userId, cur);
    }

    const lastSessionAt = new Map<string, Date>();
    for (const log of sessionLogs) {
      if (log.activeSeconds <= 0) continue;
      const prev = lastSessionAt.get(log.userId);
      if (!prev || log.date > prev) lastSessionAt.set(log.userId, log.date);
    }

    const lastQuizAt = new Map<string, Date>();
    for (const a of attempts) {
      const prev = lastQuizAt.get(a.userId);
      if (!prev || a.createdAt > prev) lastQuizAt.set(a.userId, a.createdAt);
    }

    // ── Build per-student rows ──
    const students = roster.map((student) => {
      const done = doneByStudent.get(student.id) || new Set<string>();

      const perModule: Record<string, { done: number; total: number }> = {};
      for (const m of modules) {
        perModule[m.id] = {
          done: m.lessons.filter((l) => done.has(l.id)).length,
          total: m.lessons.length,
        };
      }

      // "Currently at" = first lesson in course order they haven't completed.
      const currentLesson = lessons.find((l) => !done.has(l.id)) || null;

      let quizAttempted = 0;
      let quizPassed = 0;
      let bestSum = 0;
      for (const q of gradableQuizzes) {
        const s = quizStats.get(`${student.id}::${q.id}`);
        if (!s) continue;
        quizAttempted += 1;
        bestSum += s.best;
        if (s.passed) quizPassed += 1;
      }

      const ch = challengeByStudent.get(student.id) || { attempted: 0, passed: 0, stuck: 0, lastAt: undefined };

      const candidates = [
        lastProgressAt.get(student.id),
        lastQuizAt.get(student.id),
        lastSessionAt.get(student.id),
        ch.lastAt,
      ].filter(Boolean) as Date[];
      const lastActiveAt = candidates.length ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : null;

      return {
        userId: student.id,
        fullName: student.fullName,
        nickname: student.nickname,
        email: student.email,
        avatarUrl: student.avatarUrl,
        lessonsCompleted: done.size,
        totalLessons: lessons.length,
        percent: lessons.length ? Math.round((done.size / lessons.length) * 100) : 0,
        perModule,
        currentLesson: currentLesson
          ? { id: currentLesson.id, title: currentLesson.title, moduleTitle: currentLesson.moduleTitle }
          : null,
        quiz: {
          attempted: quizAttempted,
          passed: quizPassed,
          total: gradableQuizzes.length,
          avgBestPercent: quizAttempted ? Math.round(bestSum / quizAttempted) : null,
        },
        challenge: { attempted: ch.attempted, passed: ch.passed, stuck: ch.stuck },
        lastActiveAt,
      };
    });

    // ── Warnings ──
    const warnings: any[] = [];
    const now = Date.now();
    const inactiveCutoff = INACTIVE_DAYS * 24 * 60 * 60 * 1000;

    const engaged = students.filter((s) => s.lessonsCompleted > 0 || s.quiz.attempted > 0);
    const sortedPercents = engaged.map((s) => s.percent).sort((a, b) => a - b);
    const median = sortedPercents.length
      ? sortedPercents[Math.floor(sortedPercents.length / 2)]
      : 0;

    for (const s of students) {
      const hasStarted = s.lessonsCompleted > 0 || s.quiz.attempted > 0 || s.challenge.attempted > 0;

      // Repeatedly failing a specific quiz.
      const stuckQuizzes = gradableQuizzes.filter((q) => {
        const st = quizStats.get(`${s.userId}::${q.id}`);
        return st && !st.passed && st.attempts >= QUIZ_FAIL_ATTEMPTS;
      });
      if (stuckQuizzes.length) {
        const lessonTitles = stuckQuizzes
          .map((q) => lessons.find((l) => l.id === q.lessonId)?.title)
          .filter(Boolean)
          .slice(0, 3);
        warnings.push({
          userId: s.userId,
          fullName: s.fullName,
          nickname: s.nickname,
          type: "quiz_failing",
          severity: "high",
          detail: `Trượt ${stuckQuizzes.length} bài kiểm tra sau ≥${QUIZ_FAIL_ATTEMPTS} lần thử${lessonTitles.length ? `: ${lessonTitles.join(", ")}` : ""}`,
        });
      }

      if (hasStarted && s.lastActiveAt && now - new Date(s.lastActiveAt).getTime() > inactiveCutoff) {
        const days = Math.floor((now - new Date(s.lastActiveAt).getTime()) / (24 * 60 * 60 * 1000));
        warnings.push({
          userId: s.userId,
          fullName: s.fullName,
          nickname: s.nickname,
          type: "inactive",
          severity: days > 14 ? "high" : "medium",
          detail: `Không hoạt động ${days} ngày`,
        });
      }

      if (s.challenge.stuck > 0) {
        warnings.push({
          userId: s.userId,
          fullName: s.fullName,
          nickname: s.nickname,
          type: "challenge_stuck",
          severity: "medium",
          detail: `${s.challenge.stuck} challenge chạy ≥${CHALLENGE_STUCK_RUNS} lần mà chưa đúng`,
        });
      }

      if (hasStarted && median > 0 && s.percent < median * BEHIND_RATIO) {
        warnings.push({
          userId: s.userId,
          fullName: s.fullName,
          nickname: s.nickname,
          type: "behind",
          severity: "medium",
          detail: `Mới ${s.percent}% trong khi trung vị lớp là ${median}%`,
        });
      }
    }

    const severityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    warnings.sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3));

    res.json({
      course,
      modules: modules.map((m) => ({ id: m.id, title: m.title, orderIndex: m.orderIndex, lessonCount: m.lessons.length })),
      lessons,
      students,
      warnings,
      totals: {
        students: roster.length,
        lessons: lessons.length,
        modules: modules.length,
        quizzes: gradableQuizzes.length,
        classMedianPercent: median,
      },
    });
  } catch (err) {
    console.error("tracking overview error:", err);
    res.status(500).json({ error: "Failed to load tracking overview" });
  }
});

/**
 * GET /api/courses/:courseId/tracking/quiz
 *
 * Student × lesson quiz matrix. Per-question drill-down reuses the existing
 * GET /api/quizzes/attempt/:id, which already lets staff read any attempt.
 */
router.get("/courses/:courseId/tracking/quiz", async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "courseId");
    if (!(await requireCourse(courseId, res))) return;
    const [roster, { lessons }] = await Promise.all([loadRoster(), loadCourseStructure(courseId)]);
    const studentIds = roster.map((s) => s.id);
    const lessonIds = lessons.map((l) => l.id);

    const quizzes = lessonIds.length
      ? await prisma.quiz.findMany({
          where: { lessonId: { in: lessonIds } },
          select: { id: true, lessonId: true, title: true, passScore: true, _count: { select: { questions: true } } },
        })
      : [];
    const gradable = quizzes.filter((q) => q._count.questions > 0);

    const attempts = gradable.length && studentIds.length
      ? await prisma.quizAttempt.findMany({
          where: { userId: { in: studentIds }, quizId: { in: gradable.map((q) => q.id) } },
          select: { id: true, userId: true, quizId: true, score: true, totalQuestions: true, passed: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        })
      : [];

    const cells = new Map<string, any>();
    for (const a of attempts) {
      const key = `${a.userId}::${a.quizId}`;
      const pct = percentOf(a.score, a.totalQuestions);
      const cur = cells.get(key);
      if (!cur) {
        cells.set(key, {
          bestPercent: pct,
          attempts: 1,
          passed: a.passed,
          lastAttemptId: a.id,
          lastAttemptAt: a.createdAt,
          bestAttemptId: a.id,
        });
      } else {
        cur.attempts += 1;
        cur.passed = cur.passed || a.passed;
        if (pct > cur.bestPercent) {
          cur.bestPercent = pct;
          cur.bestAttemptId = a.id;
        }
        // Ordered ascending, so the last one seen is the most recent.
        cur.lastAttemptId = a.id;
        cur.lastAttemptAt = a.createdAt;
      }
    }

    // Only lessons that actually have a quiz become columns.
    const quizLessons = lessons
      .filter((l) => gradable.some((q) => q.lessonId === l.id))
      .map((l) => {
        const q = gradable.find((qq) => qq.lessonId === l.id)!;
        return {
          lessonId: l.id,
          lessonTitle: l.title,
          moduleId: l.moduleId,
          moduleTitle: l.moduleTitle,
          quizId: q.id,
          quizTitle: q.title,
          passScore: q.passScore,
          questionCount: q._count.questions,
        };
      });

    res.json({
      lessons: quizLessons,
      students: roster.map((s) => ({
        userId: s.id,
        fullName: s.fullName,
        nickname: s.nickname,
        avatarUrl: s.avatarUrl,
        scores: Object.fromEntries(
          quizLessons
            .map((ql) => [ql.lessonId, cells.get(`${s.id}::${ql.quizId}`) || null])
            .filter(([, v]) => v !== null),
        ),
      })),
    });
  } catch (err) {
    console.error("tracking quiz error:", err);
    res.status(500).json({ error: "Failed to load quiz tracking" });
  }
});

/**
 * GET /api/courses/:courseId/tracking/challenges?lessonId=&userId=
 *
 * The actual code students wrote. Split out from the overview because the code
 * payload is heavy — only fetched when a teacher opens the panel.
 */
router.get("/courses/:courseId/tracking/challenges", async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "courseId");
    if (!(await requireCourse(courseId, res))) return;
    const filterLessonId = query(req, "lessonId");
    const filterUserId = query(req, "userId");

    const [roster, { lessons }] = await Promise.all([loadRoster(), loadCourseStructure(courseId)]);
    const rosterIds = new Set(roster.map((s) => s.id));
    const lessonIds = lessons.map((l) => l.id);
    const scopedLessonIds = filterLessonId ? lessonIds.filter((id) => id === filterLessonId) : lessonIds;

    if (!scopedLessonIds.length) {
      res.json({ lessons: [], challenges: [] });
      return;
    }

    // A whole class working through a course can produce thousands of rows
    // (e.g. 159 code blocks × 21 students in the Python course), so the list is
    // capped. The cap is reported back so the UI can say data was cut rather
    // than quietly showing a teacher a partial class.
    const ROW_LIMIT = 500;

    const [totalRows, rows] = await Promise.all([
      prisma.challengeAttempt.count({
        where: {
          lessonId: { in: scopedLessonIds },
          ...(filterUserId ? { userId: filterUserId } : { userId: { in: [...rosterIds] } }),
        },
      }),
      prisma.challengeAttempt.findMany({
        where: {
          lessonId: { in: scopedLessonIds },
          ...(filterUserId ? { userId: filterUserId } : { userId: { in: [...rosterIds] } }),
        },
        select: {
          id: true,
          userId: true,
          lessonId: true,
          challengeKey: true,
          title: true,
          language: true,
          latestCode: true,
          firstPassCode: true,
          runCount: true,
          failCount: true,
          passed: true,
          firstPassAt: true,
          lastRunAt: true,
          user: { select: { id: true, fullName: true, nickname: true, avatarUrl: true } },
        },
        orderBy: { lastRunAt: "desc" },
        take: ROW_LIMIT,
      }),
    ]);

    const lessonMap = new Map(lessons.map((l) => [l.id, l]));

    res.json({
      lessons: lessons.map((l) => ({ id: l.id, title: l.title, moduleTitle: l.moduleTitle })),
      totalRows,
      truncated: totalRows > rows.length,
      challenges: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        fullName: r.user.fullName,
        nickname: r.user.nickname,
        avatarUrl: r.user.avatarUrl,
        lessonId: r.lessonId,
        lessonTitle: lessonMap.get(r.lessonId)?.title || "",
        moduleTitle: lessonMap.get(r.lessonId)?.moduleTitle || "",
        challengeKey: r.challengeKey,
        title: r.title,
        language: r.language,
        latestCode: r.latestCode,
        firstPassCode: r.firstPassCode,
        runCount: r.runCount,
        failCount: r.failCount,
        passed: r.passed,
        firstPassAt: r.firstPassAt,
        lastRunAt: r.lastRunAt,
      })),
    });
  } catch (err) {
    console.error("tracking challenges error:", err);
    res.status(500).json({ error: "Failed to load challenge tracking" });
  }
});

/**
 * GET /api/courses/:courseId/tracking/students/:userId
 * Per-lesson detail for one student: progress, every quiz attempt, every challenge.
 */
router.get("/courses/:courseId/tracking/students/:userId", async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "courseId");
    const userId = param(req, "userId");
    if (!(await requireCourse(courseId, res))) return;

    const student = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, nickname: true, email: true, avatarUrl: true, role: true, lastLoginAt: true },
    });
    if (!student || student.role !== "student") {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    const { modules, lessons } = await loadCourseStructure(courseId);
    const lessonIds = lessons.map((l) => l.id);

    const [progress, quizzes, challenges] = await Promise.all([
      prisma.lessonProgress.findMany({
        where: { userId, lessonId: { in: lessonIds } },
        select: { lessonId: true, completedAt: true },
      }),
      prisma.quiz.findMany({
        where: { lessonId: { in: lessonIds } },
        select: {
          id: true,
          lessonId: true,
          title: true,
          passScore: true,
          attempts: {
            where: { userId },
            select: { id: true, score: true, totalQuestions: true, passed: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      prisma.challengeAttempt.findMany({
        where: { userId, lessonId: { in: lessonIds } },
        orderBy: { lastRunAt: "desc" },
      }),
    ]);

    const doneMap = new Map(progress.map((p) => [p.lessonId, p.completedAt]));
    const quizByLesson = new Map(quizzes.map((q) => [q.lessonId, q]));
    const challengesByLesson = new Map<string, typeof challenges>();
    for (const c of challenges) {
      const list = challengesByLesson.get(c.lessonId) || [];
      list.push(c);
      challengesByLesson.set(c.lessonId, list);
    }

    const timeline = modules.map((m) => ({
      moduleId: m.id,
      moduleTitle: m.title,
      lessons: m.lessons.map((l) => {
        const quiz = quizByLesson.get(l.id);
        const attempts = quiz?.attempts || [];
        return {
          lessonId: l.id,
          title: l.title,
          completedAt: doneMap.get(l.id) || null,
          quiz: quiz && attempts.length
            ? {
                quizId: quiz.id,
                passScore: quiz.passScore,
                bestPercent: Math.max(...attempts.map((a) => percentOf(a.score, a.totalQuestions))),
                passed: attempts.some((a) => a.passed),
                attempts: attempts.map((a) => ({
                  id: a.id,
                  percent: percentOf(a.score, a.totalQuestions),
                  score: a.score,
                  totalQuestions: a.totalQuestions,
                  passed: a.passed,
                  createdAt: a.createdAt,
                })),
              }
            : null,
          challenges: (challengesByLesson.get(l.id) || []).map((c) => ({
            id: c.id,
            challengeKey: c.challengeKey,
            title: c.title,
            language: c.language,
            latestCode: c.latestCode,
            firstPassCode: c.firstPassCode,
            runCount: c.runCount,
            failCount: c.failCount,
            passed: c.passed,
            lastRunAt: c.lastRunAt,
          })),
        };
      }),
    }));

    const completed = progress.length;

    res.json({
      student,
      summary: {
        lessonsCompleted: completed,
        totalLessons: lessons.length,
        percent: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
        quizzesPassed: quizzes.filter((q) => q.attempts.some((a) => a.passed)).length,
        quizzesAttempted: quizzes.filter((q) => q.attempts.length > 0).length,
        challengesAttempted: challenges.length,
        challengesPassed: challenges.filter((c) => c.passed === true).length,
      },
      timeline,
    });
  } catch (err) {
    console.error("tracking student detail error:", err);
    res.status(500).json({ error: "Failed to load student detail" });
  }
});

export default router;
