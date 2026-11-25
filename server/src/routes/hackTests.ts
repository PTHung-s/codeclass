import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import { judgePythonCode, parseTestCases, runPythonCode } from "../utils/pythonRunner";
import { judgeCppCode } from "../utils/cppRunner";
import { detectLanguage } from "../utils/codeLanguage";
import { param, isStaff } from "../utils/routeHelpers";

const router = Router();

const MAX_HACKTEST_INPUT_LENGTH = 10_000;
const MAX_HACKTEST_OUTPUT_LENGTH = 10_000;
const MAX_IMPACT_CHECK_SUBMISSIONS = 30;

function normalizeOutput(value: string) {
  return value.trim().replace(/\r\n/g, "\n");
}

function normalizeInput(value: string) {
  return value.replace(/\r\n/g, "\n").trimEnd();
}

function isAllPassedNote(note?: string | null) {
  if (!note) return false;
  const match = note.match(/Auto-judge\s*\((\d+)\/(\d+)\)/);
  return Boolean(match && Number(match[2]) > 0 && Number(match[1]) === Number(match[2]));
}

async function hasSolvedProblem(studentId: string, problemId: string) {
  const direct = await prisma.problemSubmission.findFirst({
    where: { studentId, problemId },
    select: { note: true },
    orderBy: { createdAt: "desc" },
  });
  if (isAllPassedNote(direct?.note)) return true;

  const assignmentSubmission = await prisma.submission.findFirst({
    where: {
      studentId,
      assignment: { problemId },
      review: { is: { feedback: { contains: "Auto-judge" } } },
    },
    select: { review: { select: { feedback: true } } },
    orderBy: { submittedAt: "desc" },
  });

  return isAllPassedNote(assignmentSubmission?.review?.feedback);
}

function validateHackTestPayload(input: unknown, expectedOutput: unknown) {
  if (typeof input !== "string" || typeof expectedOutput !== "string") {
    return "Input và output kỳ vọng là bắt buộc.";
  }

  const normalizedInput = normalizeInput(input);
  const normalizedOutput = normalizeOutput(expectedOutput);

  if (!normalizedInput.trim()) return "Input không được để trống.";
  if (!normalizedOutput) return "Output kỳ vọng không được để trống.";
  if (normalizedInput.length > MAX_HACKTEST_INPUT_LENGTH) return "Input quá dài.";
  if (normalizedOutput.length > MAX_HACKTEST_OUTPUT_LENGTH) return "Output kỳ vọng quá dài.";

  return null;
}

function findDuplicateTest(testCases: { input: string; output: string }[], input: string, output: string) {
  const candidateInput = normalizeInput(input);
  const candidateOutput = normalizeOutput(output);
  return testCases.some((tc) =>
    normalizeInput(tc.input || "") === candidateInput &&
    normalizeOutput(tc.output || "") === candidateOutput
  );
}

async function validateWithTeacherSolution(problem: { teacherSolution: string | null }, input: string, expectedOutput: string) {
  if (!problem.teacherSolution?.trim()) {
    return { ok: true, note: "Chưa có lời giải mẫu, cần giáo viên duyệt thủ công." };
  }

  const run = await runPythonCode(problem.teacherSolution, input);
  if (run.status !== "success") {
    return { ok: false, note: `Lời giải mẫu chạy lỗi với test này: ${run.output}` };
  }

  if (normalizeOutput(run.stdout) !== normalizeOutput(expectedOutput)) {
    return { ok: false, note: "Output kỳ vọng không khớp với lời giải mẫu." };
  }

  return { ok: true, note: "Đã khớp với lời giải mẫu." };
}

async function estimateImpact(problemId: string, proposerId: string, input: string, expectedOutput: string) {
  const submissions = await prisma.problemSubmission.findMany({
    where: {
      problemId,
      studentId: { not: proposerId },
      code: { not: "" },
    },
    select: { code: true, note: true },
    orderBy: { createdAt: "desc" },
    take: MAX_IMPACT_CHECK_SUBMISSIONS,
  });

  const solvedSubmissions = submissions.filter((submission) => isAllPassedNote(submission.note));
  let impactedCount = 0;

  for (const submission of solvedSubmissions) {
    // Chạy đúng ngôn ngữ của bài nộp — trước đây ép Python nên bài nộp C++ bị oan là "bị hack".
    const language = detectLanguage(submission.code || "");
    const result = language === "cpp"
      ? await judgeCppCode(submission.code || "", [{ input, output: expectedOutput, hidden: false }])
      : await judgePythonCode(submission.code || "", [{ input, output: expectedOutput, hidden: false }]);
    if (result.status !== "all_passed") impactedCount += 1;
  }

  return impactedCount;
}

function serializeHackTest(hackTest: any) {
  return {
    ...hackTest,
    inputPreview: hackTest.input.length > 500 ? `${hackTest.input.slice(0, 500)}...` : hackTest.input,
    expectedOutputPreview: hackTest.expectedOutput.length > 500 ? `${hackTest.expectedOutput.slice(0, 500)}...` : hackTest.expectedOutput,
  };
}

router.get("/problems/:problemId/hacktests", authenticate, async (req: Request, res: Response) => {
  try {
    const problemId = param(req, "problemId");
    const { userId, role } = req.user!;

    const problem = await prisma.problem.findUnique({ where: { id: problemId }, select: { id: true, status: true } });
    if (!problem || (role === "student" && problem.status !== "published")) {
      res.status(404).json({ error: "Problem not found" });
      return;
    }

    const where = isStaff(role) ? { problemId } : { problemId, proposerId: userId };
    const hackTests = await prisma.hackTest.findMany({
      where,
      include: {
        proposer: { select: { id: true, fullName: true, email: true } },
        reviewedBy: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(hackTests.map(serializeHackTest));
  } catch (err) {
    console.error("List hacktests error:", err);
    res.status(500).json({ error: "Failed to fetch hacktests" });
  }
});

router.post("/problems/:problemId/hacktests", authenticate, async (req: Request, res: Response) => {
  try {
    const problemId = param(req, "problemId");
    const { userId, role } = req.user!;

    if (role !== "student") {
      res.status(403).json({ error: "Only students can propose hacktests" });
      return;
    }

    const problem = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem || problem.status !== "published") {
      res.status(404).json({ error: "Problem not found" });
      return;
    }

    const solved = await hasSolvedProblem(userId, problemId);
    if (!solved) {
      res.status(403).json({ error: "Em cần AC bài này trước khi đề xuất hacktest." });
      return;
    }

    // Rate limit: tối đa 3 đề xuất đang chờ duyệt cho mỗi (học sinh, bài) —
    // mỗi proposal kích hoạt lời giải mẫu + tối đa 30 lần chấm, không chặn sẽ đè máy.
    const pendingCount = await prisma.hackTest.count({
      where: { problemId, proposerId: userId, status: "pending" },
    });
    if (pendingCount >= 3) {
      res.status(429).json({ error: "Em đang có 3 đề xuất hacktest chờ duyệt cho bài này. Chờ giáo viên duyệt rồi đề xuất tiếp nhé." });
      return;
    }

    const input = typeof req.body.input === "string" ? normalizeInput(req.body.input) : "";
    const expectedOutput = typeof req.body.expectedOutput === "string" ? normalizeOutput(req.body.expectedOutput) : "";
    const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 1000) : "";
    const payloadError = validateHackTestPayload(input, expectedOutput);
    if (payloadError) {
      res.status(400).json({ error: payloadError });
      return;
    }

    const existingTestCases = parseTestCases(problem.testCases);
    if (findDuplicateTest(existingTestCases, input, expectedOutput)) {
      res.status(409).json({ error: "Test này đã có trong bộ test của bài." });
      return;
    }

    const duplicateHackTest = await prisma.hackTest.findFirst({
      where: { problemId, input, expectedOutput, status: { in: ["pending", "approved"] } },
      select: { id: true },
    });
    if (duplicateHackTest) {
      res.status(409).json({ error: "Test này đã được đề xuất trước đó." });
      return;
    }

    const validation = await validateWithTeacherSolution(problem, input, expectedOutput);
    if (!validation.ok) {
      const rejected = await prisma.hackTest.create({
        data: {
          problemId,
          proposerId: userId,
          input,
          expectedOutput,
          note,
          status: "rejected",
          validationNote: validation.note,
        },
      });
      res.status(422).json({ error: validation.note, hackTest: rejected });
      return;
    }

    const impactedCount = await estimateImpact(problemId, userId, input, expectedOutput);
    const hackTest = await prisma.hackTest.create({
      data: {
        problemId,
        proposerId: userId,
        input,
        expectedOutput,
        note,
        status: "pending",
        validationNote: `${validation.note} ${impactedCount > 0 ? `Bắt được ${impactedCount} lời giải AC cũ.` : "Chưa bắt được lời giải AC cũ trong mẫu kiểm tra."}`,
        impactedCount,
      },
      include: {
        proposer: { select: { id: true, fullName: true, email: true } },
        reviewedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    res.status(201).json(serializeHackTest(hackTest));
  } catch (err) {
    console.error("Create hacktest error:", err);
    res.status(500).json({ error: "Failed to propose hacktest" });
  }
});

router.post("/hacktests/:hackTestId/approve", authenticate, async (req: Request, res: Response) => {
  try {
    const hackTestId = param(req, "hackTestId");
    const { userId, role } = req.user!;
    if (!isStaff(role)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const hackTest = await prisma.hackTest.findUnique({
      where: { id: hackTestId },
      include: { problem: true },
    });
    if (!hackTest) {
      res.status(404).json({ error: "Hacktest not found" });
      return;
    }
    if (hackTest.status === "approved") {
      res.status(409).json({ error: "Hacktest đã được duyệt trước đó." });
      return;
    }

    const validation = await validateWithTeacherSolution(hackTest.problem, hackTest.input, hackTest.expectedOutput);
    if (!validation.ok) {
      const rejected = await prisma.hackTest.update({
        where: { id: hackTestId },
        data: {
          status: "rejected",
          validationNote: validation.note,
          reviewedById: userId,
          reviewedAt: new Date(),
        },
      });
      res.status(422).json({ error: validation.note, hackTest: rejected });
      return;
    }

    const testCases = parseTestCases(hackTest.problem.testCases);
    if (!findDuplicateTest(testCases, hackTest.input, hackTest.expectedOutput)) {
      testCases.push({ input: hackTest.input, output: hackTest.expectedOutput, hidden: true });
      await prisma.problem.update({
        where: { id: hackTest.problemId },
        data: { testCases: JSON.stringify(testCases, null, 2) },
      });
    }

    const approved = await prisma.hackTest.update({
      where: { id: hackTestId },
      data: {
        status: "approved",
        validationNote: validation.note,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
      include: {
        proposer: { select: { id: true, fullName: true, email: true } },
        reviewedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    res.json(serializeHackTest(approved));

    // Chạy nền: re-judge các bài AC cũ với test mới (Codeforces-style).
    // Làm sau res.json để response không bị chặn bởi hàng trăm lần chạy code.
    void (async () => {
      const proposer = await prisma.user.findUnique({
        where: { id: hackTest.proposerId },
        select: { fullName: true },
      });
      const acSubmissions = await prisma.problemSubmission.findMany({
        where: { problemId: hackTest.problemId, passed: true, code: { not: "" } },
        select: { id: true, code: true, note: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      let demoted = 0;
      for (const submission of acSubmissions) {
        const language = detectLanguage(submission.code || "");
        const result = language === "cpp"
          ? await judgeCppCode(submission.code || "", [{ input: hackTest.input, output: hackTest.expectedOutput, hidden: false }])
          : await judgePythonCode(submission.code || "", [{ input: hackTest.input, output: hackTest.expectedOutput, hidden: false }]);
        if (result.status === "all_passed") continue;
        demoted += 1;
        const baseNote = (submission.note || "").replace(
          /Auto-judge\s*\((\d+)\/(\d+)\)/,
          (_s, a: string, b: string) => `Auto-judge (${a}/${Number(b) + 1})`,
        );
        const hackLine = `[HACK] Bị hạ bởi test ẩn mới (hacktest của ${proposer?.fullName || "học sinh"} được duyệt ngày ${new Date().toLocaleDateString("vi-VN")}).`;
        await prisma.problemSubmission.update({
          where: { id: submission.id },
          data: { passed: false, note: `${baseNote}\n${hackLine}` },
        });
      }
      await prisma.hackTest.update({
        where: { id: hackTestId },
        data: {
          impactedCount: demoted,
          validationNote: `${validation.note} Re-judge: ${demoted > 0 ? `hạ ${demoted} bài AC cũ (tối đa 200 bài gần nhất).` : "không bài AC cũ nào bị hạ."}`,
        },
      });
    })().catch((e) => console.error("Re-judge hacktest error:", e));

    // Gamification: reward the proposer when their hack test is approved
    import("../utils/tokens")
      .then(({ awardHacktestTokens }) => awardHacktestTokens(hackTest.proposerId, hackTestId, hackTest.problem.title))
      .catch(() => {});
  } catch (err) {
    console.error("Approve hacktest error:", err);
    res.status(500).json({ error: "Failed to approve hacktest" });
  }
});

router.post("/hacktests/:hackTestId/reject", authenticate, async (req: Request, res: Response) => {
  try {
    const hackTestId = param(req, "hackTestId");
    const { userId, role } = req.user!;
    if (!isStaff(role)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 1000) : "Giáo viên đã từ chối.";
    const rejected = await prisma.hackTest.update({
      where: { id: hackTestId },
      data: {
        status: "rejected",
        validationNote: reason || "Giáo viên đã từ chối.",
        reviewedById: userId,
        reviewedAt: new Date(),
      },
      include: {
        proposer: { select: { id: true, fullName: true, email: true } },
        reviewedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    res.json(serializeHackTest(rejected));
  } catch (err) {
    console.error("Reject hacktest error:", err);
    res.status(500).json({ error: "Failed to reject hacktest" });
  }
});

export default router;
