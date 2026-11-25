import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, checkCourseAccess } from "../utils/routeHelpers";
import { calibrateCourseQuestions, getEffectiveDifficulty, QUESTION_CALIBRATION_ENABLED } from "../services/questionCalibration";
import { redactAnswerKey } from "../utils/quizReview";
import { permuteIndices, safeOptionOrder, toDisplayFrame } from "../utils/quizOptionOrder";
import { recordSkillEvidenceBatch, fromLessonQuizAttempt } from "../services/skillEvidence";
import { computeItemEvidenceWeight } from "../services/skillMastery";

const router = Router();

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Get quiz(zes) for a lesson.
// Students get a randomized subset (no answer/difficulty/explanation leaked) + attempt summary.
// Teachers get the full bank.
router.get("/lessons/:lessonId/quizzes", authenticate, async (req: Request, res: Response) => {
  try {
    const lessonId = param(req, "lessonId");
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }
    const { userId, role } = req.user!;

    const quizzes = await prisma.quiz.findMany({
      where: { lessonId },
      orderBy: { orderIndex: "asc" },
      include: { questions: { orderBy: { orderIndex: "asc" } } },
    });

    if (role !== "student") {
      const teacherView = quizzes.map((q) => ({
        id: q.id,
        title: q.title,
        passScore: q.passScore,
        questionCount: q.questionCount,
        questions: q.questions.map((qq) => ({
          id: qq.id,
          question: qq.question,
          options: JSON.parse(qq.options || "[]"),
          correctIndex: qq.correctIndex,
          difficulty: qq.difficulty,
          explanation: qq.explanation,
        })),
      }));
      res.json(teacherView);
      return;
    }

    // student
    const attempts = await prisma.quizAttempt.findMany({
      where: { quizId: { in: quizzes.map((q) => q.id) }, userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, quizId: true, score: true, totalQuestions: true, passed: true, createdAt: true },
    });

    const result = quizzes.map((quiz) => {
      const att = attempts.filter((a) => a.quizId === quiz.id);
      // The attempt that earned the best score owns the denominator for its
      // percent — a later attempt with fewer questions must not re-scale it.
      const best = att.length ? att.reduce((b, a) => (a.score > b.score ? a : b), att[0]) : null;
      const bestScore = best?.score ?? 0;
      const bestTotal = best?.totalQuestions ?? 0;
      const passed = att.some((a) => a.passed);
      const bank = quiz.questions;
      const take = Math.min(quiz.questionCount || bank.length, bank.length);
      const subset = quiz.shuffle ? shuffle(bank).slice(0, take) : bank.slice(0, take);
      const safe = shuffle(subset).map((qq, i) => {
        const options: string[] = JSON.parse(qq.options || "[]");
        // A fresh permutation per fetch, per question: the correct answer no
        // longer sits on the letter it sat on last time.
        const optionOrder = permuteIndices(options.length);
        return {
          id: qq.id,
          orderIndex: i,
          question: qq.question,
          options: optionOrder.map((canonical) => options[canonical]),
          optionOrder,
        };
      });
      return {
        id: quiz.id,
        title: quiz.title,
        passScore: quiz.passScore,
        questionCount: quiz.questionCount,
        bankSize: bank.length,
        questions: safe,
        summary: {
          attempts: att.length,
          bestScore,
          bestPercent: bestTotal > 0 ? Math.round((bestScore / bestTotal) * 100) : null,
          passed,
          lastScore: att[0]?.score ?? null,
          lastTotal: att[0]?.totalQuestions ?? null,
        },
      };
    });

    res.json(result);
  } catch (err) {
    console.error("get quizzes error:", err);
    res.status(500).json({ error: "Failed to fetch quizzes" });
  }
});

// Submit a quiz attempt. body: { answers: [{ questionId, selectedIndex }] }
router.post("/quizzes/:id/attempt", authenticate, async (req: Request, res: Response) => {
  try {
    const quizId = param(req, "id");
    const { userId, role } = req.user!;

    const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { questions: true } });
    if (!quiz) {
      res.status(404).json({ error: "Quiz not found" });
      return;
    }

    const answers: Array<{
      questionId: string;
      selectedIndex: number;
      /** Display→canonical map the browser was served. Absent ⇒ frames match. */
      optionOrder?: number[];
      responseTimeMs?: number;
      activeTimeMs?: number;
      changeCount?: number;
    }> = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const qMap = new Map(quiz.questions.map((q) => [q.id, q]));

    let score = 0;
    const details: any[] = [];
    for (const a of answers) {
      const q = qMap.get(a.questionId);
      if (!q) continue;
      const options: string[] = JSON.parse(q.options || "[]");
      const optionOrder = safeOptionOrder(a.optionOrder, options.length);
      // Everything from here down is canonical. The browser sent us a position
      // in its own shuffled list; translate it once, at the boundary.
      const selectedIndex = optionOrder && a.selectedIndex >= 0 && a.selectedIndex < optionOrder.length
        ? optionOrder[a.selectedIndex]
        : a.selectedIndex;
      const correctIndex = q.correctIndex;
      const isCorrect = selectedIndex === correctIndex;
      if (isCorrect) score++;
      details.push({
        questionId: q.id,
        question: q.question,
        options,
        correctIndex,
        difficulty: q.difficulty,
        explanation: q.explanation,
        selectedIndex,
        isCorrect,
        optionOrder,
        contentVersion: q.contentVersion,
        effectiveDifficulty: getEffectiveDifficulty(q),
        responseTimeMs: Number.isFinite(a.responseTimeMs) ? Math.max(0, Math.round(a.responseTimeMs!)) : null,
        activeTimeMs: Number.isFinite(a.activeTimeMs) ? Math.max(0, Math.round(a.activeTimeMs!)) : null,
        changeCount: Number.isFinite(a.changeCount) ? Math.max(0, Math.round(a.changeCount!)) : 0,
        skillId: q.skillId,
        skillTagStatus: q.skillTagStatus,
      });
    }

    const total = details.length;
    // Grade against the full drawn paper, never the answered subset. The client
    // requires all questions answered, but the API must enforce it too: without
    // this, POSTing just the one question you know, correct, would score 100%
    // of the answered set and pass a 15-question quiz. Skipping questions
    // therefore caps the best achievable percent.
    const drawnTotal = Math.min(quiz.questionCount || quiz.questions.length, quiz.questions.length);
    const gradeTotal = Math.max(drawnTotal, total); // never below what was answered
    const percent = gradeTotal > 0 ? Math.round((score / gradeTotal) * 100) : 0;
    const passed = percent >= quiz.passScore;

    // Passing on any earlier attempt already opened the review, so a later
    // failed attempt must not slam it shut again.
    let previouslyPassed = false;

    if (role === "student") {
      const [previousAttempts, priorPass] = await Promise.all([
        // Empty-answer attempts don't consume an ordinal in the mastery replay
        // (they carry no evidence), so don't count them here either.
        prisma.quizAttempt.count({ where: { quizId, userId, answers: { not: "[]" } } }),
        prisma.quizAttempt.findFirst({ where: { quizId, userId, passed: true }, select: { id: true } }),
      ]);
      previouslyPassed = priorPass !== null;
      const attempt = await prisma.quizAttempt.create({
        data: {
          quizId,
          userId,
          score,
          totalQuestions: gradeTotal,
          passed,
          // Canonical indices only — questionCalibration's distractor histogram
          // and the teacher export both read these raw. optionOrder rides along
          // so a review opened later can be re-lettered the way it was sat.
          answers: JSON.stringify(details.map((d) => ({ questionId: d.questionId, difficulty: d.difficulty, correctIndex: d.correctIndex, selectedIndex: d.selectedIndex, isCorrect: d.isCorrect, optionOrder: d.optionOrder ?? undefined }))),
        },
      });

      if (QUESTION_CALIBRATION_ENABLED && details.length > 0) {
        await prisma.quizQuestionResponse.createMany({
          data: details.map((d) => ({
            attemptId: attempt.id,
            questionId: d.questionId,
            userId,
            context: "lesson_quiz",
            attemptOrdinal: previousAttempts + 1,
            contentVersion: d.contentVersion,
            authoredDifficulty: d.difficulty,
            difficultyUsed: d.effectiveDifficulty,
            selectedIndex: d.selectedIndex,
            correctIndex: d.correctIndex,
            isCorrect: d.isCorrect,
            responseTimeMs: d.responseTimeMs,
            activeTimeMs: d.activeTimeMs,
            changeCount: d.changeCount,
            skillId: d.skillId,
            skillTagStatus: d.skillTagStatus,
          })),
        });
      }

      // Skill evidence → unified sink (fail-soft: never blocks the answer).
      // Apply empirical guessing weights when question calibration exists.
      try {
        const questionIds = [...new Set(details.map((d) => d.questionId))];
        const calibRows = questionIds.length > 0
          ? await prisma.quizQuestionCalibration.findMany({
              where: { questionId: { in: questionIds } },
              select: { questionId: true, optionDistribution: true },
            })
          : [];
        const distByQuestion = new Map<string, number[]>();
        for (const cr of calibRows) {
          try {
            const dist = JSON.parse(cr.optionDistribution || "[]");
            if (Array.isArray(dist)) distByQuestion.set(cr.questionId, dist);
          } catch { /* ignore */ }
        }
        const weightedDetails = details.map((d) => {
          const dist = distByQuestion.get(d.questionId);
          const weight = dist
            ? computeItemEvidenceWeight(dist, d.selectedIndex, d.correctIndex, d.isCorrect)
            : 1;
          return { ...d, weight };
        });
        await recordSkillEvidenceBatch(
          fromLessonQuizAttempt(userId, quizId, attempt.id, weightedDetails, new Date(), previousAttempts + 1),
        );
      } catch (err) {
        console.error("[persistence] skill evidence record failed:", err);
      }
    }

    // Award tokens synchronously for claim experience
    let tokensAwarded = 0;
    if (role === "student" && passed) {
      try {
        const { awardQuizPassTokens } = await import("../utils/tokens");
        const award = await awardQuizPassTokens(userId, {
          refType: "Quiz",
          refId: quizId,
          description: `Đỗ quiz: ${quiz.title}`,
        });
        tokensAwarded = award.awarded ? award.amount : 0;
      } catch { /* silent */ }
    }

    // XP ledger: quiz XP is "best score per quiz × rate", so only the delta to
    // a new best is awarded (anti-farm) + streak day.
    if (role === "student") {
      try {
        const { awardXp, sumXpForRef, awardStreakDay } = await import("../utils/xpLedger");
        const { getRates } = await import("../utils/gamificationSettings");
        const { xp: rates } = await getRates();
        const best = await prisma.quizAttempt.aggregate({
          where: { quizId, userId },
          _max: { score: true },
        });
        const bestScore = best._max.score ?? score;
        const target = bestScore * rates.quizXpPerPoint;
        const already = await sumXpForRef(userId, "Quiz", quizId);
        const delta = target - already;
        await awardXp(userId, delta, {
          reason: "quiz_best",
          description: `Quiz: ${quiz.title} (best ${bestScore}/${gradeTotal})`,
          refType: "Quiz",
          refId: quizId,
          // Variable amount — dedup on the best score reached, not the quiz id.
          dedupKey: `${userId}_Quiz_${quizId}_${bestScore}`,
        });
        await awardStreakDay(userId);
      } catch { /* silent */ }
    }

    // Redact AFTER persistence: the stored rows keep the real key for
    // calibration and teacher reports, only the reply to the browser is thinned.
    // And translate back into the browser's frame first — the review panel reads
    // options[selectedIndex] and options[correctIndex] off the array we hand it,
    // so all three have to be in the order that browser actually rendered.
    const hasPassedQuiz = passed || previouslyPassed;
    const displayDetails = details.map(({ optionOrder, ...rest }) => toDisplayFrame(rest, optionOrder));
    // Disabled by product: the review is always unlocked. Passing `true` keeps
    // the redaction helper in the loop (so future audit tools still see the
    // canonical answer key) but strips its lock flag.
    const visibleDetails = redactAnswerKey(displayDetails, { role, hasPassedQuiz: true });
    res.json({
      score,
      total: gradeTotal,
      percent,
      passed,
      passScore: quiz.passScore,
      details: visibleDetails,
      // Disabled by product: students see full explanations for every question,
      // regardless of pass / fail. The lock used to hide wrong answers until
      // the student passed; that gate is off now.
      reviewLocked: false,
      tokensAwarded,
    });

    if (role === "student" && passed) {
      import("../utils/badgeEngine").then(({ checkBadges }) => checkBadges(userId)).catch(() => {});
    }
    // Recalculate skill mastery after every quiz submission (fire-and-forget)
    if (role === "student") {
      import("../services/skillMastery")
        .then(({ queueMasteryRecalculation }) => queueMasteryRecalculation(userId))
        .catch((err) => console.error("Mastery recalc error:", err));
    }
  } catch (err) {
    console.error("submit quiz error:", err);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
});

// Create quiz (teacher)
router.post("/lessons/:lessonId/quizzes", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const lessonId = param(req, "lessonId");
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }
    const { title, passScore, questionCount, questions } = req.body;
    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }
    const maxOrder = await prisma.quiz.findFirst({ where: { lessonId }, orderBy: { orderIndex: "desc" }, select: { orderIndex: true } });
    const quiz = await prisma.quiz.create({
      data: {
        lessonId,
        title,
        orderIndex: (maxOrder?.orderIndex ?? -1) + 1,
        passScore: passScore ?? 80,
        questionCount: questionCount ?? 15,
        questions: {
          create: (questions || []).map((q: any, i: number) => ({
            question: q.question,
            options: JSON.stringify(q.options || []),
            correctIndex: q.correctIndex || 0,
            orderIndex: i,
            difficulty: q.difficulty ?? 3,
            explanation: q.explanation ?? null,
          })),
        },
      },
      include: { questions: true },
    });
    res.status(201).json(quiz);
  } catch (err) {
    console.error("create quiz error:", err);
    res.status(500).json({ error: "Failed to create quiz" });
  }
});

router.post("/quizzes/:quizId/questions", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const quizId = param(req, "quizId");
    const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { id: true } });
    if (!quiz) {
      res.status(404).json({ error: "Quiz not found" });
      return;
    }
    const { question, options, correctIndex, difficulty, explanation } = req.body || {};
    if (typeof question !== "string" || !question.trim() || !Array.isArray(options) || options.length < 2) {
      res.status(400).json({ error: "Question and at least two options are required" });
      return;
    }
    const maxOrder = await prisma.quizQuestion.findFirst({ where: { quizId }, orderBy: { orderIndex: "desc" }, select: { orderIndex: true } });
    const created = await prisma.quizQuestion.create({
      data: {
        quizId,
        question: question.trim(),
        options: JSON.stringify(options),
        correctIndex: Number.isInteger(correctIndex) ? correctIndex : 0,
        orderIndex: (maxOrder?.orderIndex ?? -1) + 1,
        difficulty: Math.max(1, Math.min(5, Number(difficulty) || 3)),
        explanation: typeof explanation === "string" ? explanation : null,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    console.error("create quiz question error:", err);
    res.status(500).json({ error: "Failed to create quiz question" });
  }
});

router.patch("/quizzes/:quizId/questions/:questionId", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const quizId = param(req, "quizId");
    const questionId = param(req, "questionId");
    const existing = await prisma.quizQuestion.findFirst({ where: { id: questionId, quizId } });
    if (!existing) {
      res.status(404).json({ error: "Quiz question not found" });
      return;
    }
    const { question, options, correctIndex, difficulty, explanation } = req.body || {};
    const nextQuestion = typeof question === "string" ? question.trim() : existing.question;
    const nextOptions = Array.isArray(options) ? JSON.stringify(options) : existing.options;
    const nextCorrectIndex = Number.isInteger(correctIndex) ? correctIndex : existing.correctIndex;
    const contentChanged = nextQuestion !== existing.question || nextOptions !== existing.options || nextCorrectIndex !== existing.correctIndex;
    const updated = await prisma.quizQuestion.update({
      where: { id: questionId },
      data: {
        question: nextQuestion,
        options: nextOptions,
        correctIndex: nextCorrectIndex,
        difficulty: Math.max(1, Math.min(5, Number(difficulty) || existing.difficulty)),
        explanation: typeof explanation === "string" ? explanation : existing.explanation,
        ...(contentChanged ? {
          contentVersion: { increment: 1 },
          calibratedDifficulty: null,
          effectiveDifficulty: null,
          calibrationSamples: 0,
          calibrationConfidence: 0,
          calibrationStatus: "collecting",
          lastCalibratedAt: null,
        } : {}),
      },
    });
    res.json(updated);
  } catch (err) {
    console.error("update quiz question error:", err);
    res.status(500).json({ error: "Failed to update quiz question" });
  }
});

// Delete quiz
router.delete("/quizzes/:id", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    await prisma.quiz.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete quiz" });
  }
});

/* ── GET /quizzes/history/:courseId ── */
router.get("/quizzes/history/:courseId", authenticate, async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "courseId");
    const { userId } = req.user!;

    // Get all lessons for this course
    const lessons = await prisma.lesson.findMany({
      where: { courseId },
      select: { id: true, title: true, moduleId: true, module: { select: { title: true, orderIndex: true } } },
      orderBy: { orderIndex: "asc" },
    });

    const lessonIds = lessons.map((l) => l.id);

    // Get all quiz attempts
    const attempts = await prisma.quizAttempt.findMany({
      where: { userId, quiz: { lessonId: { in: lessonIds } } },
      orderBy: { createdAt: "desc" },
      include: {
        quiz: { select: { id: true, lessonId: true, title: true, passScore: true } },
      },
    });

    // Group by lesson
    const result = lessons.map((l) => {
      const lessonAttempts = attempts.filter((a) => a.quiz.lessonId === l.id);
      return {
        lessonId: l.id,
        lessonTitle: l.title,
        moduleTitle: l.module?.title || "",
        moduleIndex: l.module?.orderIndex || 0,
        attempts: lessonAttempts.map((a) => ({
          id: a.id,
          quizTitle: a.quiz.title,
          passScore: a.quiz.passScore,
          score: a.score,
          totalQuestions: a.totalQuestions,
          percent: a.totalQuestions > 0 ? Math.round((a.score / a.totalQuestions) * 100) : 0,
          passed: a.passed,
          createdAt: a.createdAt,
        })),
        bestPercent: lessonAttempts.length > 0
          ? Math.max(...lessonAttempts.map((a) => a.totalQuestions > 0 ? Math.round((a.score / a.totalQuestions) * 100) : 0))
          : null,
        passed: lessonAttempts.some((a) => a.passed),
      };
    });

    res.json(result);
  } catch (err) {
    console.error("quiz history error:", err);
    res.status(500).json({ error: "Failed to fetch quiz history." });
  }
});

/* ── GET /quizzes/attempt/:id ── */
router.get("/quizzes/attempt/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { userId, role } = req.user!;
    const attempt = await prisma.quizAttempt.findFirst({
      where: role === "student" ? { id, userId } : { id },
      include: {
        quiz: { select: { id: true, lessonId: true, title: true, passScore: true } },
      },
    });
    if (!attempt) {
      res.status(404).json({ error: "Attempt not found." });
      return;
    }

    // Parse stored answers. optionOrder is absent on anything sat before
    // per-attempt shuffling existed — those attempts were canonical-order.
    const rawAnswers: Array<{
      questionId: string;
      selectedIndex: number;
      isCorrect: boolean;
      optionOrder?: number[];
    }> = JSON.parse(attempt.answers || "[]");

    // Enrich with question content from bank
    const questionIds = rawAnswers.map((a) => a.questionId);
    const questions = await prisma.quizQuestion.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, question: true, options: true, correctIndex: true, explanation: true },
    });
    const qMap = new Map(questions.map((q) => [q.id, q]));

    const details = rawAnswers.map((a) => {
      const q = qMap.get(a.questionId);
      const options: string[] = q ? JSON.parse(q.options || "[]") : [];
      // Re-letter the question the way this student saw it, months later.
      return toDisplayFrame(
        {
          questionId: a.questionId,
          question: q?.question || "",
          options,
          correctIndex: q?.correctIndex ?? 0,
          explanation: q?.explanation || null,
          selectedIndex: a.selectedIndex,
          isCorrect: a.isCorrect,
        },
        safeOptionOrder(a.optionOrder, options.length),
      );
    });

    // Re-reading an old attempt is the same leak as reading a fresh one: the
    // quiz is still sittable, so the key stays sealed until they pass it.
    const hasPassedQuiz =
      attempt.passed ||
      (await prisma.quizAttempt.findFirst({
        where: { quizId: attempt.quiz.id, userId: attempt.userId, passed: true },
        select: { id: true },
      })) !== null;
    // Disabled by product: review is always unlocked.
    const visibleDetails = redactAnswerKey(details, { role, hasPassedQuiz: true });

    res.json({
      id: attempt.id,
      score: attempt.score,
      totalQuestions: attempt.totalQuestions,
      percent: attempt.totalQuestions > 0 ? Math.round((attempt.score / attempt.totalQuestions) * 100) : 0,
      passed: attempt.passed,
      passScore: attempt.quiz.passScore,
      quizTitle: attempt.quiz.title,
      lessonId: attempt.quiz.lessonId,
      details: visibleDetails,
      // Same product decision as the submission response: never lock the review.
      reviewLocked: false,
      createdAt: attempt.createdAt,
    });
  } catch (err) {
    console.error("quiz attempt detail error:", err);
    res.status(500).json({ error: "Failed to fetch attempt detail." });
  }
});

/* ── GET /quizzes/export-responses/:courseId ── */
router.get("/quizzes/export-responses/:courseId", authenticate, async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "courseId");
    const { userId, role } = req.user!;
    if (role !== "admin" && role !== "teacher") {
      res.status(403).json({ error: "Only teachers can export data." });
      return;
    }

    // Get all quiz attempts for this course
    const lessons = await prisma.lesson.findMany({
      where: { courseId },
      select: { id: true, title: true, moduleId: true },
    });
    const lessonIds = lessons.map((l) => l.id);
    const lessonMap = new Map(lessons.map((l) => [l.id, { title: l.title, moduleId: l.moduleId }]));

    const attempts = await prisma.quizAttempt.findMany({
      where: { quiz: { lessonId: { in: lessonIds } } },
      include: { quiz: { select: { lessonId: true } }, user: { select: { id: true } } },
      orderBy: { createdAt: "asc" },
    });

    // Flatten to per-response rows (one row = one question answer)
    const rows: any[] = [];
    for (const a of attempts) {
      const lesson = lessonMap.get(a.quiz.lessonId);
      const answers = JSON.parse(a.answers || "[]");
      for (const ans of answers) {
        rows.push({
          userId: a.userId,
          lessonId: a.quiz.lessonId,
          questionId: ans.questionId,
          difficulty: ans.difficulty ?? null,
          selectedIndex: ans.selectedIndex,
          correctIndex: ans.correctIndex ?? null,
          isCorrect: ans.isCorrect,
          attemptId: a.id,
          createdAt: a.createdAt,
        });
      }
    }

    res.json({
      courseId,
      totalAttempts: attempts.length,
      totalResponses: rows.length,
      rows,
    });
  } catch (err) {
    console.error("export responses error:", err);
    res.status(500).json({ error: "Failed to export data." });
  }
});

router.get("/quizzes/calibration/:courseId", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "courseId");
    const questions = await prisma.quizQuestion.findMany({
      where: { quiz: { lesson: { courseId } } },
      select: {
        id: true,
        question: true,
        difficulty: true,
        calibratedDifficulty: true,
        effectiveDifficulty: true,
        calibrationSamples: true,
        calibrationConfidence: true,
        calibrationStatus: true,
        calibrationLocked: true,
        lastCalibratedAt: true,
        quiz: { select: { title: true, lesson: { select: { title: true } } } },
      },
      orderBy: { orderIndex: "asc" },
    });
    res.json(questions.map((question) => ({ ...question, effectiveDifficulty: getEffectiveDifficulty(question, { allowCalibrated: true }) })));
  } catch (err) {
    console.error("question calibration report error:", err);
    res.status(500).json({ error: "Failed to fetch question calibration." });
  }
});

router.post("/quizzes/calibration/:courseId/recalculate", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "courseId");
    const result = await calibrateCourseQuestions(courseId);
    res.json({ ...result, modelVersion: "smoothed-rate-v1" });
  } catch (err) {
    console.error("question calibration rebuild error:", err);
    res.status(500).json({ error: "Failed to recalibrate questions." });
  }
});

export default router;
