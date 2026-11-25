import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { param, checkCourseAccess } from "../utils/routeHelpers";
import prisma from "../utils/prisma";
import crypto from "crypto";
import { getEffectiveDifficulty } from "../services/questionCalibration";
import { permuteIndices } from "../utils/quizOptionOrder";
import {
  createSession,
  getSession,
  deleteSession,
  processAnswer,
  getChapterConfig,
  estimateAbilityMLE,
  round,
  selectNextQuestion,
  computeResult,
  serializeSession,
  restoreSession,
  getAdaptiveQuestionCount,
  type BankQuestion,
  type AdaptiveSession,
} from "../utils/adaptiveEngine";
import { recordSkillEvidenceBatch, fromAdaptiveAttempt } from "../services/skillEvidence";

const router = Router();

// Remove abandoned persisted sessions periodically; completed attempts remain
// in adaptive_test_attempts for history and analytics.
const adaptiveCleanupTimer = setInterval(() => {
  prisma.adaptiveTestSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch((err) => {
    console.error("adaptive session cleanup error:", err);
  });
}, 10 * 60 * 1000);
adaptiveCleanupTimer.unref();

/** Persist the completed attempt to DB so every test (pass/partial/fail) is
 *  recorded in history. Idempotent via session.attemptId. */
async function ensureAttemptPersisted(userId: string, session: AdaptiveSession): Promise<boolean> {
  if (session.attemptId) return false;
  const existing = await prisma.adaptiveTestAttempt.findUnique({
    where: { sessionId: session.sessionId },
    select: { id: true },
  });
  if (existing) {
    session.attemptId = existing.id;
    return false;
  }
  const result = computeResult(session);
  try {
    const created = await prisma.adaptiveTestAttempt.create({
      data: {
      sessionId: session.sessionId,
      userId,
      courseId: session.courseId,
      moduleId: session.moduleId,
      abilityStart: result.abilityStart,
      abilityEnd: result.abilityEnd,
      totalQuestions: result.totalQuestions,
      correctCount: result.correctCount,
      accuracyPercent: result.accuracyPercent,
      passed: result.passed,
      partialPass: result.partialPass,
      skippedCount: 0,
      answers: JSON.stringify(result.answers.map((a) => ({
        questionId: a.questionId, lessonId: a.lessonId, difficulty: a.difficulty,
        question: a.question, options: a.options, correctIndex: a.correctIndex,
        explanation: a.explanation, selectedIndex: a.selectedIndex, isCorrect: a.isCorrect,
        abilityAfter: a.abilityAfter, skillId: a.skillId ?? null,
      }))),
      lessonBreakdown: JSON.stringify(result.lessonBreakdown),
      },
    });
    session.attemptId = created.id;

    // Skill evidence → unified sink (fail-soft). skillId already gated approved upstream.
    try {
      await recordSkillEvidenceBatch(
        fromAdaptiveAttempt(userId, created.id, result.answers, new Date()),
      );
    } catch (err) {
      console.error("[adaptive] skill evidence record failed:", err);
    }

    return true;
  } catch (err: any) {
    if (err?.code !== "P2002") throw err;
    const raced = await prisma.adaptiveTestAttempt.findUnique({
      where: { sessionId: session.sessionId },
      select: { id: true },
    });
    if (!raced) throw err;
    session.attemptId = raced.id;
    return false;
  }
}

async function persistSession(session: AdaptiveSession): Promise<void> {
  await prisma.adaptiveTestSession.upsert({
    where: { id: session.sessionId },
    create: {
      id: session.sessionId,
      userId: session.userId,
      courseId: session.courseId,
      moduleId: session.moduleId,
      stateJson: serializeSession(session),
      expiresAt: new Date(session.expiresAt),
    },
    update: {
      stateJson: serializeSession(session),
      expiresAt: new Date(session.expiresAt),
    },
  });
}

async function deletePersistedSession(sessionId: string): Promise<void> {
  await prisma.adaptiveTestSession.deleteMany({ where: { id: sessionId } });
}

async function getOwnedSession(req: Request, sessionId: string): Promise<AdaptiveSession | null> {
  const session = getSession(sessionId);
  if (session) return session.userId === req.user!.userId ? session : null;

  const saved = await prisma.adaptiveTestSession.findUnique({ where: { id: sessionId } });
  if (!saved || saved.userId !== req.user!.userId || saved.expiresAt.getTime() <= Date.now()) {
    if (saved?.expiresAt && saved.expiresAt.getTime() <= Date.now()) {
      await deletePersistedSession(sessionId);
    }
    return null;
  }
  const restored = restoreSession(saved.stateJson);
  if (!restored || restored.sessionId !== saved.id || restored.userId !== saved.userId
    || restored.courseId !== saved.courseId || restored.moduleId !== saved.moduleId) {
    return null;
  }
  return restored;
}

/* ── POST /adaptive/start ── */
router.post("/adaptive/start", authenticate, async (req: Request, res: Response) => {
  try {
    const { moduleId, courseId } = req.body;
    if (!moduleId || !courseId) {
      res.status(400).json({ error: "moduleId and courseId are required" });
      return;
    }

    // Verify module belongs to course
    const mod = await prisma.module.findUnique({ where: { id: moduleId } });
    if (!mod || mod.courseId !== courseId) {
      res.status(404).json({ error: "Module not found in this course" });
      return;
    }
    if (!(await checkCourseAccess(req.user!.userId, req.user!.role, courseId))) {
      res.status(403).json({ error: "Bạn không có quyền làm bài kiểm tra này." });
      return;
    }

    // Get chapter config based on course type + module order
    const moduleIndex = (mod.orderIndex ?? 0) + 1; // orderIndex is 0-based
    const chapterConfig = getChapterConfig(moduleIndex, courseId);
    const scale = chapterConfig.scale;

    // Fetch all quiz questions from all lessons in this module
    const lessons = await prisma.lesson.findMany({
      where: { moduleId },
      select: { id: true },
    });
    const lessonIds = lessons.map((l) => l.id);

    const quizzes = await prisma.quiz.findMany({
      where: { lessonId: { in: lessonIds } },
      include: { questions: true },
    });

    // Build bank from all questions
    const bank: BankQuestion[] = [];
    for (const quiz of quizzes) {
      for (const q of quiz.questions) {
        const options: string[] = JSON.parse(q.options || "[]");
        // Shuffle A/B/C/D once per session, then carry the shuffled array and
        // the remapped key together from here on. Unlike the lesson quiz there
        // is no round trip to undo: this session's questions are stored with
        // their options beside their indices, so nothing downstream — grading,
        // the attempt row, the history page — ever consults bank order again.
        const order = permuteIndices(options.length);
        bank.push({
          id: q.id,
          lessonId: quiz.lessonId,
          question: q.question,
          options: order.map((canonical) => options[canonical]),
          correctIndex: Math.max(0, order.indexOf(q.correctIndex)),
          // Calibrated difficulty is gated by confidence; chapter scaling stays
          // for compatibility with the current adaptive pass thresholds.
          difficulty: Math.round(getEffectiveDifficulty(q) * scale),
          baseDifficulty: getEffectiveDifficulty(q),
          explanation: q.explanation,
          // Carry the approved skill tag so mastery can map each question precisely
          skillId: q.skillTagStatus === "approved" ? q.skillId : null,
        });
      }
    }

    if (bank.length < 10) {
      res.status(400).json({ error: `Chương này chỉ có ${bank.length} câu hỏi — cần ít nhất 10 câu để tạo bài test.` });
      return;
    }

    // Shuffle bank (Fisher-Yates) so questions are randomized before adaptive selection
    for (let i = bank.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bank[i], bank[j]] = [bank[j], bank[i]];
    }

    // A short bank is valid too: test size must never exceed available questions.
    const testSize = getAdaptiveQuestionCount(bank.length);

    // Compute theoretical max: all testSize hardest questions correct
    const maxSim = estimateAbilityMLE(
      [...bank].sort((a,b) => b.difficulty - a.difficulty).slice(0, testSize)
        .map((q) => ({ difficulty: q.difficulty, isCorrect: true }))
    );
    const maxAbility = round(maxSim.theta, 2);

    const sessionId = crypto.randomUUID();
    const session = createSession(sessionId, req.user!.userId, moduleId, courseId, bank, chapterConfig, testSize, maxAbility);
    await persistSession(session);

    // Select first question (difficulty ~3)
    const firstQ = selectNextQuestion(bank, new Set(), session.currentAbility);
    if (!firstQ) {
      res.status(500).json({ error: "Không thể chọn câu hỏi đầu tiên." });
      return;
    }
    session.currentQuestionId = firstQ.id;
    await persistSession(session);

    // Return first question WITHOUT answer
    const { correctIndex: _, explanation: __, ...safeQ } = firstQ;

    res.json({
      sessionId,
      question: safeQ,
      questionIndex: 1,
      totalQuestions: session.totalQuestions,
      currentAbility: session.currentAbility,
      passThreshold: chapterConfig.pass,
      maxAbility,
      partialThreshold: chapterConfig.partial,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    console.error("adaptive start error:", err);
    res.status(500).json({ error: "Không thể bắt đầu bài test." });
  }
});

/* ── POST /adaptive/next ── */
router.post("/adaptive/next", authenticate, async (req: Request, res: Response) => {
  try {
    const { sessionId, questionId, selectedIndex } = req.body;
    if (!sessionId || !questionId || selectedIndex === undefined) {
      res.status(400).json({ error: "sessionId, questionId, and selectedIndex are required" });
      return;
    }

    const session = await getOwnedSession(req, sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found or expired." });
      return;
    }

    const submittedQuestion = session.questions.find((q) => q.id === questionId);
    if (!submittedQuestion || !Number.isInteger(selectedIndex)
      || selectedIndex < 0 || selectedIndex >= submittedQuestion.options.length) {
      res.status(400).json({ error: "Invalid question or answer index." });
      return;
    }

    let answer: ReturnType<typeof processAnswer>["answer"];
    let isComplete: boolean;
    try {
      ({ answer, isComplete } = processAnswer(session, questionId, selectedIndex));
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unexpected question")) {
        res.status(409).json({ error: "The submitted question is not the current question." });
        return;
      }
      throw err;
    }
    await persistSession(session);

    if (isComplete) {
      const result = computeResult(session);
      const persistedNow = await ensureAttemptPersisted(req.user!.userId, session);
      await persistSession(session);
      res.json({
        complete: true,
        result,
        currentAnswer: {
          isCorrect: answer.isCorrect,
          correctIndex: (() => {
            const q = session.questions.find((q) => q.id === questionId);
            return q?.correctIndex ?? 0;
          })(),
          explanation: (() => {
            const q = session.questions.find((q) => q.id === questionId);
            return q?.explanation ?? null;
          })(),
        },
      });
      if (persistedNow) {
        import("../utils/tokens")
          .then(({ awardAdaptivePassTokens }) =>
            awardAdaptivePassTokens(req.user!.userId, result.passed, result.partialPass, session.moduleId)
          )
          .catch(() => {});
        import("../utils/xpLedger")
          .then(({ awardAdaptivePassXp }) => awardAdaptivePassXp(req.user!.userId, result.passed, session.attemptId))
          .catch(() => {});
      }
      // Trigger mastery recalculation after test completion
      import("../services/skillMastery")
        .then(({ queueMasteryRecalculation }) => queueMasteryRecalculation(req.user!.userId))
        .catch((err) => console.error("Mastery recalc error:", err));
      return;
    }

    // Select next question
    const answeredIds = new Set(session.answers.map((a) => a.questionId));
    const currentQ = session.currentQuestionId
      ? session.questions.find((q) => q.id === session.currentQuestionId && !answeredIds.has(q.id))
      : null;
    const nextQ = currentQ || selectNextQuestion(session.questions, answeredIds, session.currentAbility);

    if (!nextQ) {
      // No more questions → force complete
      const result = computeResult(session);
      const persistedNow = await ensureAttemptPersisted(req.user!.userId, session);
      await persistSession(session);
      res.json({ complete: true, result });
      if (persistedNow) {
        import("../utils/tokens")
          .then(({ awardAdaptivePassTokens }) =>
            awardAdaptivePassTokens(req.user!.userId, result.passed, result.partialPass, session.moduleId)
          )
          .catch(() => {});
        import("../utils/xpLedger")
          .then(({ awardAdaptivePassXp }) => awardAdaptivePassXp(req.user!.userId, result.passed, session.attemptId))
          .catch(() => {});
      }
      import("../services/skillMastery")
        .then(({ queueMasteryRecalculation }) => queueMasteryRecalculation(req.user!.userId))
        .catch((err) => console.error("Mastery recalc error:", err));
      return;
    }

    const { correctIndex: _, explanation: __, ...safeQ } = nextQ;
    session.currentQuestionId = nextQ.id;
    await persistSession(session);

    res.json({
      complete: false,
      question: safeQ,
      questionIndex: session.answers.length + 1,
      totalQuestions: session.totalQuestions,
      currentAbility: session.currentAbility,
      currentAnswer: {
        isCorrect: answer.isCorrect,
        correctIndex: (() => {
          const q = session.questions.find((q) => q.id === questionId);
          return q?.correctIndex ?? 0;
        })(),
        explanation: (() => {
          const q = session.questions.find((q) => q.id === questionId);
          return q?.explanation ?? null;
        })(),
      },
    });
  } catch (err) {
    console.error("adaptive next error:", err);
    res.status(500).json({ error: "Không thể xử lý câu trả lời." });
  }
});

/* ── GET /adaptive/:sessionId/result ── */
router.get("/adaptive/:sessionId/result", authenticate, async (req: Request, res: Response) => {
  try {
    const sessionId = param(req, "sessionId");
    const session = await getOwnedSession(req, sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found or expired." });
      return;
    }
    res.json(computeResult(session));
  } catch (err) {
    console.error("adaptive result error:", err);
    res.status(500).json({ error: "Failed to get result." });
  }
});

/* ── GET /adaptive/:sessionId/state ──
   Resume an in-progress test after page refresh / re-connect. */
router.get("/adaptive/:sessionId/state", authenticate, async (req: Request, res: Response) => {
  try {
    const sessionId = param(req, "sessionId");
    const session = await getOwnedSession(req, sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found or expired." });
      return;
    }

    // If all questions done but not yet applied, return result
    if (session.answers.length >= session.totalQuestions) {
      const result = computeResult(session);
      res.json({ complete: true, result });
      return;
    }

    const answeredIds = new Set(session.answers.map((a) => a.questionId));
    const nextQ = selectNextQuestion(session.questions, answeredIds, session.currentAbility);
    if (!nextQ) {
      // All questions exhausted → force complete
      const result = computeResult(session);
      res.json({ complete: true, result });
      return;
    }

    session.currentQuestionId = nextQ.id;
    await persistSession(session);

    const { correctIndex: _, explanation: __, ...safeQ } = nextQ;

    res.json({
      complete: false,
      sessionId,
      question: safeQ,
      questionIndex: session.answers.length + 1,
      totalQuestions: session.totalQuestions,
      currentAbility: session.currentAbility,
      passThreshold: session.chapterConfig.pass,
      maxAbility: session.maxAbility,
      partialThreshold: session.chapterConfig.partial,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    console.error("adaptive state error:", err);
    res.status(500).json({ error: "Failed to get session state." });
  }
});

/* ── POST /adaptive/:sessionId/force-complete ──
   Called when anti-cheat hearts reach 0. Persists whatever answers
   were given and returns the result (likely a fail, but saved to DB). */
router.post("/adaptive/:sessionId/force-complete", authenticate, async (req: Request, res: Response) => {
  try {
    const sessionId = param(req, "sessionId");
    const session = await getOwnedSession(req, sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found or expired." });
      return;
    }

    const result = computeResult(session);
    const persistedNow = await ensureAttemptPersisted(req.user!.userId, session);
    await persistSession(session);

    res.json({
      complete: true,
      result,
    });
    if (persistedNow) {
      import("../utils/tokens")
        .then(({ awardAdaptivePassTokens }) =>
          awardAdaptivePassTokens(req.user!.userId, result.passed, result.partialPass, session.moduleId)
        )
        .catch(() => {});
      import("../utils/xpLedger")
        .then(({ awardAdaptivePassXp }) => awardAdaptivePassXp(req.user!.userId, result.passed, session.attemptId))
        .catch(() => {});
    }
  } catch (err) {
    console.error("adaptive force-complete error:", err);
    res.status(500).json({ error: "Failed to force-complete test." });
  }
});

/* ── POST /adaptive/:sessionId/apply ── */
router.post("/adaptive/:sessionId/apply", authenticate, async (req: Request, res: Response) => {
  try {
    const sessionId = param(req, "sessionId");
    const { userId } = req.user!;

    const session = await getOwnedSession(req, sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found or expired." });
      return;
    }

    const result = computeResult(session);
    if (!result.passed && !result.partialPass) {
      res.status(400).json({ error: "Bạn chưa đạt yêu cầu để vượt chương này." });
      return;
    }

    // Mark all skipable lessons as completed
    const skipIds = result.skipableLessonIds;
    if (skipIds.length > 0) {
      const existing = await prisma.lessonProgress.findMany({
        where: { userId, lessonId: { in: skipIds } },
        select: { lessonId: true },
      });
      const existingSet = new Set(existing.map((e) => e.lessonId));
      const toCreate = skipIds.filter((id) => !existingSet.has(id));

      if (toCreate.length > 0) {
        await prisma.lessonProgress.createMany({
          data: toCreate.map((lessonId) => ({ userId, lessonId })),
        });
      }
    }

    // Persist (or reuse) attempt record — normally already created at completion
    const persistedNow = await ensureAttemptPersisted(userId, session);
    await prisma.adaptiveTestAttempt.update({
      where: { id: session.attemptId! },
      data: { skippedCount: skipIds.length },
    });

    // If passed, mark chapter as cleared (gate for next chapter)
    if (result.passed) {
      await prisma.chapterProgress.upsert({
        where: { userId_moduleId: { userId, moduleId: session.moduleId } },
        create: { userId, moduleId: session.moduleId },
        update: { clearedAt: new Date() },
      });
    }

    // Gamification: tokens for clearing a chapter
    if (persistedNow) {
      import("../utils/tokens")
        .then(({ awardAdaptivePassTokens }) =>
          awardAdaptivePassTokens(userId, result.passed, result.partialPass, session.moduleId)
        )
        .catch(() => {});
      import("../utils/xpLedger")
        .then(({ awardAdaptivePassXp }) => awardAdaptivePassXp(userId, result.passed, session.attemptId))
        .catch(() => {});
    }
    import("../utils/badgeEngine").then(({ checkBadges }) => checkBadges(userId)).catch(() => {});

    // Cleanup session
    deleteSession(sessionId);
    await deletePersistedSession(sessionId);

    res.json({
      applied: true,
      skippedLessonIds: skipIds,
      skippedCount: skipIds.length,
      requiredLessonIds: result.requiredLessonIds,
    });
  } catch (err) {
    console.error("adaptive apply error:", err);
    res.status(500).json({ error: "Failed to apply skip." });
  }
});

/* ── GET /adaptive/history/:courseId ── */
router.get("/adaptive/history/:courseId", authenticate, async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "courseId");
    const { userId } = req.user!;

    const attempts = await prisma.adaptiveTestAttempt.findMany({
      where: { userId, courseId },
      orderBy: { createdAt: "desc" },
      include: {
        module: { select: { id: true, title: true, orderIndex: true } },
      },
    });

    res.json(attempts.map((a) => ({
      id: a.id,
      moduleId: a.moduleId,
      moduleTitle: a.module.title,
      moduleIndex: a.module.orderIndex,
      abilityStart: a.abilityStart,
      abilityEnd: a.abilityEnd,
      totalQuestions: a.totalQuestions,
      correctCount: a.correctCount,
      accuracyPercent: a.accuracyPercent,
      passed: a.passed,
      partialPass: a.partialPass,
      skippedCount: a.skippedCount,
      createdAt: a.createdAt,
    })));
  } catch (err) {
    console.error("adaptive history error:", err);
    res.status(500).json({ error: "Failed to fetch history." });
  }
});

/* ── GET /adaptive/history/:courseId/attempt/:id ── */
router.get("/adaptive/history/:courseId/attempt/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const attempt = await prisma.adaptiveTestAttempt.findFirst({
      where: { id, userId: req.user!.userId, courseId: param(req, "courseId") },
    });
    if (!attempt) {
      res.status(404).json({ error: "Attempt not found." });
      return;
    }

    res.json({
      id: attempt.id,
      moduleId: attempt.moduleId,
      abilityStart: attempt.abilityStart,
      abilityEnd: attempt.abilityEnd,
      totalQuestions: attempt.totalQuestions,
      correctCount: attempt.correctCount,
      accuracyPercent: attempt.accuracyPercent,
      passed: attempt.passed,
      partialPass: attempt.partialPass,
      skippedCount: attempt.skippedCount,
      answers: JSON.parse(attempt.answers),
      lessonBreakdown: JSON.parse(attempt.lessonBreakdown),
      createdAt: attempt.createdAt,
    });
  } catch (err) {
    console.error("adaptive attempt detail error:", err);
    res.status(500).json({ error: "Failed to fetch attempt." });
  }
});

export default router;
