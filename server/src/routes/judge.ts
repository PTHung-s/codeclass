import { Router, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import { formatJudgeFeedback, judgePythonCode, parseTestCases } from "../utils/pythonRunner";
import { judgeCppCode } from "../utils/cppRunner";
import { normalizeCheckerType } from "../utils/judgeChecker";
import { notifyNotificationChanged } from "../services/notificationEvents";
import { detectLanguage } from "../utils/codeLanguage";

// Judging spawns compiler processes per request — cap the flood risk, but a
// whole classroom shares one NAT IP, so keep the ceiling class-friendly.
const judgeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Quá nhiều yêu cầu chấm bài. Vui lòng đợi 1 phút rồi thử lại." },
});

const router = Router();

router.post("/submissions/:id/judge", judgeLimiter, authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const submissionId = String(req.params.id);

    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { assignment: { include: { problem: true } } },
    });

    if (!sub) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    if (req.user!.role === "student" && sub.studentId !== req.user!.userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const code = sub.contentText || "";
    if (!code.trim()) {
      res.status(400).json({ error: "No code to judge" });
      return;
    }

    const testCases = parseTestCases(sub.assignment.problem?.testCases);
    if (!testCases.length) {
      res.status(404).json({ error: "No test cases", judgeStatus: "no_testcases" });
      return;
    }

    const language = detectLanguage(code);
    const problemMeta = sub.assignment.problem;
    const baseTimeMs = problemMeta?.timeLimitMs ?? 2000;
    const judgeOpts = {
      timeLimitMs: language === "python" ? Math.min(10_000, baseTimeMs * 2) : baseTimeMs,
      memoryLimitMb: problemMeta?.memoryLimitMb ?? 256,
      checkerType: normalizeCheckerType(problemMeta?.checkerType),
    };
    const result: any = language === "cpp"
      ? await judgeCppCode(code, testCases, undefined, judgeOpts)
      : await judgePythonCode(code, testCases, undefined, judgeOpts);
    const feedback = formatJudgeFeedback(result);

    await prisma.review.upsert({
      where: { submissionId: sub.id },
      create: {
        submissionId: sub.id,
        score: result.score,
        feedback,
        reviewedById: req.user!.userId,
        status: "reviewed",
      },
      update: {
        score: result.score,
        feedback,
        reviewedById: req.user!.userId,
        status: "reviewed",
        reviewedAt: new Date(),
      },
    });

    await prisma.submission.update({
      where: { id: sub.id },
      data: { status: "reviewed" },
    });

    await prisma.notification.create({
      data: {
        userId: sub.studentId,
        title: "Bài đã được chấm",
        message: `Bài nộp cho "${sub.assignment.title}" đã được chấm tự động: ${result.score}/10 điểm.`,
        type: result.passedCount === result.totalTests ? "submission_reviewed" : "revision_requested",
        relatedEntityType: "submission",
        relatedEntityId: sub.id,
      },
    });
    notifyNotificationChanged(sub.studentId);

    res.json(result);
  } catch (err) {
    console.error("Judge error:", err);
    res.status(500).json({ error: "Judge failed" });
  }
});

router.get("/problems/:id/testcases", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const problemId = String(req.params.id);
    const problem = await prisma.problem.findUnique({ where: { id: problemId } });
    const testCases = parseTestCases(problem?.testCases);

    res.json({
      available: testCases.length > 0,
      count: testCases.length,
      publicCount: testCases.filter((tc) => !tc.hidden).length,
    });
  } catch {
    res.json({ available: false, count: 0, publicCount: 0 });
  }
});

export default router;
