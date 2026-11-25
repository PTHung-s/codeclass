import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import { recordSkillEvidenceBatch, fromChallengeAttempt, resolveChallengeSkill } from "../services/skillEvidence";

const router = Router();

// Matches MAX_CODE_LENGTH in codeRunner.ts — the code that reaches here is the
// same code that was just executed, so the same ceiling applies.
const MAX_CODE_LENGTH = 50_000;
const MAX_KEY_LENGTH = 200;
const MAX_TITLE_LENGTH = 200;

/**
 * POST /api/challenge-attempts
 *
 * Records one Run of an in-lesson code challenge. Upserted on
 * (userId, challengeKey) so each student keeps exactly one row per challenge:
 * the latest code they wrote plus counters describing how much they struggled.
 *
 * `passed` semantics:
 *   true  — graded against expectedOutput and correct
 *   false — graded and wrong
 *   null  — nothing to grade against (every C++/Python code_runner block).
 *           We still record the code and the run count.
 *
 * Called fire-and-forget from PythonRunner, so failures must stay quiet: a
 * student's Run must never appear broken because tracking failed.
 */
router.post("/challenge-attempts", authenticate, async (req: Request, res: Response) => {
  try {
    const { userId } = req.user!;
    const lessonId = typeof req.body?.lessonId === "string" ? req.body.lessonId : "";
    const challengeKey = typeof req.body?.challengeKey === "string" ? req.body.challengeKey : "";
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, MAX_TITLE_LENGTH) || null : null;
    const language = req.body?.language === "cpp" ? "cpp" : "python";
    const passed = req.body?.passed === true ? true : req.body?.passed === false ? false : null;

    if (!lessonId || !challengeKey) {
      res.status(400).json({ error: "lessonId and challengeKey are required" });
      return;
    }
    // Reject rather than truncate: a truncated key would silently merge two
    // distinct challenges into one row and corrupt a student's history.
    if (challengeKey.length > MAX_KEY_LENGTH) {
      res.status(400).json({ error: "challengeKey is too long" });
      return;
    }
    if (code.length > MAX_CODE_LENGTH) {
      res.status(400).json({ error: "Code is too large" });
      return;
    }

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }

    const now = new Date();

    // Atomic upsert: `increment` is evaluated by the database, so a student
    // mashing Run (concurrent requests) can't lose counts the way a
    // read-then-write would.
    //
    // `passed` and `firstPassCode` are deliberately NOT set in the update
    // branch here — doing so would require reading the current row first, which
    // reintroduces the race. They are reconciled below with conditional
    // updateMany calls that are themselves atomic.
    await prisma.challengeAttempt.upsert({
      where: { userId_challengeKey: { userId, challengeKey } },
      create: {
        userId,
        lessonId,
        challengeKey,
        title,
        language,
        latestCode: code,
        firstPassCode: passed === true ? code : null,
        firstPassAt: passed === true ? now : null,
        runCount: 1,
        failCount: passed === false ? 1 : 0,
        passed,
        lastRunAt: now,
      },
      update: {
        lessonId,
        language,
        latestCode: code,
        lastRunAt: now,
        runCount: { increment: 1 },
        ...(passed === false ? { failCount: { increment: 1 } } : {}),
        ...(title ? { title } : {}),
      },
    });

    if (passed === true) {
      // Promote to passed, and capture the first passing snapshot exactly once
      // (the `firstPassAt: null` guard makes this idempotent under concurrency).
      await prisma.challengeAttempt.updateMany({
        where: { userId, challengeKey, firstPassAt: null },
        data: { firstPassCode: code, firstPassAt: now },
      });
      await prisma.challengeAttempt.updateMany({
        where: { userId, challengeKey, passed: { not: true } },
        data: { passed: true },
      });

      // Skill evidence → unified sink (fail-soft) for first pass.
      try {
        const skillId = await resolveChallengeSkill(challengeKey);
        if (skillId) {
          await recordSkillEvidenceBatch(
            fromChallengeAttempt(userId, challengeKey, lessonId, skillId, true, now),
          );
          import("../services/skillMastery")
            .then(({ queueMasteryRecalculation }) => queueMasteryRecalculation(userId))
            .catch(() => {});
        }
      } catch (err) {
        console.error("[challengeAttempts] skill evidence record failed:", err);
      }
    } else if (passed === false) {
      // Record a graded failure, but never downgrade a challenge the student
      // has already solved.
      await prisma.challengeAttempt.updateMany({
        where: { userId, challengeKey, passed: null },
        data: { passed: false },
      });
      try {
        const skillId = await resolveChallengeSkill(challengeKey);
        if (skillId) {
          await recordSkillEvidenceBatch(
            fromChallengeAttempt(userId, challengeKey, lessonId, skillId, false, now),
          );
          import("../services/skillMastery")
            .then(({ queueMasteryRecalculation }) => queueMasteryRecalculation(userId))
            .catch(() => {});
        }
      } catch (err) {
        console.error("[challengeAttempts] failure evidence record failed:", err);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("challenge attempt record error:", err);
    res.status(500).json({ error: "Failed to record challenge attempt" });
  }
});

export default router;
