import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import { formatJudgeFeedback, judgePythonCode, parseTestCases } from "../utils/pythonRunner";
import { judgeCppCode } from "../utils/cppRunner";
import { param } from "../utils/routeHelpers";
import { recordSkillEvidenceBatch, fromProblemSubmission } from "../services/skillEvidence";
import { detectLanguage } from "../utils/codeLanguage";
import { normalizeCheckerType } from "../utils/judgeChecker";
import { detectPlagiarismPairs } from "../services/plagiarismService";

const router = Router();

const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateKey(date: Date) {
  return dateFormatter.format(date);
}

function dayDiff(fromKey: string, toKey: string) {
  const from = new Date(`${fromKey}T00:00:00+07:00`);
  const to = new Date(`${toKey}T00:00:00+07:00`);
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function computeStreak(dateKeys: string[]) {
  if (dateKeys.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastSubmissionDate: "" };
  }

  const sorted = [...dateKeys].sort();
  let longestStreak = 1;
  let running = 1;

  for (let i = 1; i < sorted.length; i += 1) {
    const diff = dayDiff(sorted[i - 1], sorted[i]);
    if (diff === 1) running += 1;
    else if (diff > 1) {
      longestStreak = Math.max(longestStreak, running);
      running = 1;
    }
  }

  longestStreak = Math.max(longestStreak, running);

  let currentStreak = 1;
  for (let i = sorted.length - 1; i > 0; i -= 1) {
    const diff = dayDiff(sorted[i - 1], sorted[i]);
    if (diff === 1) currentStreak += 1;
    else if (diff > 1) break;
  }

  return { currentStreak, longestStreak, lastSubmissionDate: sorted[sorted.length - 1] };
}

router.get("/problems/progress/summary", authenticate, async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;

    if (role !== "student") {
      res.status(403).json({ error: "Only students can access practice progress" });
      return;
    }

    const submissions = await prisma.problemSubmission.findMany({
      where: { studentId: userId },
      select: { problemId: true, createdAt: true, passed: true },
    });

    const solvedSubs = submissions.filter((s) => s.passed);
    const solvedCount = new Set(solvedSubs.map((submission) => submission.problemId)).size;
    const totalSubmissions = submissions.length;
    const dateKeys = Array.from(new Set(solvedSubs.map((submission) => toDateKey(submission.createdAt)))).sort();
    const streak = computeStreak(dateKeys);

    // A streak is only "current" when the latest submission is today or
    // yesterday (VN time) — otherwise it is a historical run, not a live one.
    // Matches computeStreakFromDates in utils/xp.ts so the practice page and
    // the dashboard never disagree.
    const todayKey = toDateKey(new Date());
    const stale = streak.lastSubmissionDate
      ? dayDiff(streak.lastSubmissionDate, todayKey) > 1
      : true;

    const dailyCounts: Record<string, number> = {};
    for (const s of solvedSubs) {
      const k = toDateKey(s.createdAt);
      dailyCounts[k] = (dailyCounts[k] || 0) + 1;
    }

    const heatmapDays: { date: string; count: number }[] = [];
    for (let i = 12 * 7 - 1; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = toDateKey(date);
      heatmapDays.push({ date: key, count: dailyCounts[key] || 0 });
    }

    res.json({
      solvedCount,
      totalSubmissions,
      currentStreak: stale ? 0 : streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastSubmissionDate: streak.lastSubmissionDate,
      heatmapDays,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});

router.get("/problems/progress/solved", authenticate, async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;

    if (role !== "student") {
      res.status(403).json({ error: "Only students can access practice progress" });
      return;
    }

    const submissions = await prisma.problemSubmission.findMany({
      where: { studentId: userId, passed: true },
      select: { problemId: true },
    });

    res.json({ problemIds: Array.from(new Set(submissions.map((submission) => submission.problemId))) });
  } catch {
    res.status(500).json({ error: "Failed to fetch solved problems" });
  }
});

router.get("/problems/:problemId/submissions", authenticate, async (req: Request, res: Response) => {
  try {
    const problemId = param(req, "problemId");
    const { userId, role } = req.user!;

    const problem = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      res.status(404).json({ error: "Problem not found" });
      return;
    }

    // Teacher/admin: see all submissions for this problem
    if (role === "teacher" || role === "admin" || role === "teaching_assistant") {
      const submissions = await prisma.problemSubmission.findMany({
        where: { problemId },
        include: {
          student: { select: { id: true, fullName: true, nickname: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      res.json(submissions);
      return;
    }

    // Student: see own submissions only
    const submissions = await prisma.problemSubmission.findMany({
      where: { problemId, studentId: userId },
      orderBy: { createdAt: "desc" },
    });

    res.json(submissions);
  } catch {
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

router.get("/problem-submissions/:submissionId", authenticate, async (req: Request, res: Response) => {
  try {
    const submissionId = param(req, "submissionId");
    const { userId, role } = req.user!;

    const submission = await prisma.problemSubmission.findUnique({
      where: { id: submissionId },
      include: {
        problem: { select: { id: true, title: true, difficulty: true } },
        student: { select: { id: true, fullName: true, nickname: true, email: true } },
      },
    });

    if (!submission) {
      res.status(404).json({ error: "Practice submission not found" });
      return;
    }

    if (role === "student" && submission.studentId !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (role !== "student" && role !== "admin" && role !== "teacher" && role !== "teaching_assistant") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    res.json(submission);
  } catch {
    res.status(500).json({ error: "Failed to fetch practice submission" });
  }
});

router.get("/submissions/:submissionId", authenticate, async (req: Request, res: Response) => {
  try {
    const submissionId = param(req, "submissionId");
    const { userId, role } = req.user!;

    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        student: { select: { id: true, fullName: true, nickname: true, email: true } },
        assignment: {
          select: {
            id: true,
            title: true,
            problem: { select: { id: true, title: true, difficulty: true } },
          },
        },
        review: { select: { score: true, feedback: true, status: true } },
      },
    });

    if (!sub) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    if (role === "student" && sub.studentId !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (role !== "student" && role !== "admin" && role !== "teacher" && role !== "teaching_assistant") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    res.json({
      id: sub.id,
      code: sub.contentText || "",
      answer: null,
      note: sub.review?.feedback || sub.note || null,
      score: sub.review?.score ?? null,
      language: detectLanguage(sub.contentText || ""),
      student: sub.student,
      problem: sub.assignment?.problem || { id: "", title: sub.assignment?.title || "Bài nộp" },
      createdAt: sub.submittedAt,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch submission" });
  }
});

// Get assignments for a problem (teacher sees who is assigned)
router.get("/problems/:problemId/assigned-students", authenticate, async (req: Request, res: Response) => {
  try {
    const problemId = param(req, "problemId");
    const { userId, role } = req.user!;

    if (role !== "teacher" && role !== "admin" && role !== "teaching_assistant") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Find assignments that link to this problem (legacy problemId or multi-item AssignmentItem)
    const assignments = await prisma.assignment.findMany({
      where: {
        status: "published",
        OR: [{ problemId }, { items: { some: { problemId } } }],
      },
      include: {
        course: { select: { id: true, title: true } },
        assignedStudents: {
          include: {
            student: { select: { id: true, fullName: true, nickname: true, email: true } },
          },
        },
        submissions: {
          include: {
            student: { select: { id: true, fullName: true, nickname: true, email: true } },
            review: { select: { score: true } },
          },
        },
      },
    });

    // Collect all assigned students across all assignments for this problem
    const studentMap = new Map<string, {
      id: string;
      fullName: string;
      email: string;
      assignedVia: string[]; // course names or "Ngân hàng đề"
      hasSubmitted: boolean;
      submissionId: string | null;
      submissionKind: "assignment" | "practice" | null;
      score: number | null;
      status: string | null;
    }>();

    for (const assignment of assignments) {
      const sourceName = assignment.course?.title || "Ngân hàng đề";
      const submittedStudentIds = new Set(
        assignment.submissions.map((s) => s.student.id)
      );

      for (const { student } of assignment.assignedStudents) {
        const sub = assignment.submissions.find((s) => s.student.id === student.id);
        const existing = studentMap.get(student.id);
        if (existing) {
          if (!existing.assignedVia.includes(sourceName)) {
            existing.assignedVia.push(sourceName);
          }
        } else {
          studentMap.set(student.id, {
            id: student.id,
            fullName: student.fullName,
            email: student.email,
            assignedVia: [sourceName],
            hasSubmitted: !!sub,
            submissionId: sub?.id || null,
            submissionKind: sub ? "assignment" : null,
            score: sub?.review?.score ?? null,
            status: sub ? "submitted" : "pending",
          });
        }
      }

      // Also include students who submitted but are NOT in assignedStudents
      // (they practiced freely on the problem)
      for (const sub of assignment.submissions) {
        if (!studentMap.has(sub.student.id)) {
          studentMap.set(sub.student.id, {
            id: sub.student.id,
            fullName: sub.student.fullName,
            email: sub.student.email,
            assignedVia: ["Tự luyện tập"],
            hasSubmitted: true,
            submissionId: sub.id,
            submissionKind: "assignment",
            score: sub.review?.score ?? null,
            status: "submitted",
          });
        }
      }
    }

    // Also find ProblemSubmissions for this problem (direct practice, not via assignment)
    const directSubmissions = await prisma.problemSubmission.findMany({
      where: { problemId },
      include: {
        student: { select: { id: true, fullName: true, nickname: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    for (const sub of directSubmissions) {
      const existing = studentMap.get(sub.student.id);
      const parsedScore = sub.note ? parseScoreFromNote(sub.note) : null;

      if (existing) {
        // Merge: if existing has no score, use parsed one
        if (existing.score === null && parsedScore !== null) {
          existing.score = parsedScore;
        }
        // If existing has no submissionId, use this one
        if (!existing.submissionId && sub.id) {
          existing.submissionId = sub.id;
          existing.submissionKind = "practice";
        }
        existing.hasSubmitted = true;
        existing.status = "submitted";
      } else {
        studentMap.set(sub.student.id, {
          id: sub.student.id,
          fullName: sub.student.fullName,
          email: sub.student.email,
          assignedVia: ["Tự luyện tập"],
          hasSubmitted: true,
          submissionId: sub.id,
          submissionKind: "practice",
          score: parsedScore,
          status: "submitted",
        });
      }
    }

    const students = Array.from(studentMap.values());
    // Sort: pending first, then by name
    students.sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return a.fullName.localeCompare(b.fullName);
    });

    res.json({
      students,
      totalAssigned: students.filter((s) => !s.assignedVia.includes("Tự luyện tập")).length,
      totalSubmitted: students.filter((s) => s.hasSubmitted).length,
      totalPending: students.filter((s) => !s.hasSubmitted && !s.assignedVia.includes("Tự luyện tập")).length,
    });
  } catch (err) {
    console.error("assigned-students error:", err);
    res.status(500).json({ error: "Failed to fetch assigned students" });
  }
});

function parseScoreFromNote(note: string | null): number | null {
  if (!note) return null;
  const match = note.match(/Auto-judge\s*\((\d+)\/(\d+)\)\s*-\s*([\d.]+)\/10/);
  if (match) return Number(match[3]);
  return null;
}

// ─── Teacher: overview of assigned/managed problems ───
router.get("/teacher/manage", authenticate, async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;

    if (role !== "teacher" && role !== "admin" && role !== "teaching_assistant") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Get all assignments created by this teacher
    const assignments = await prisma.assignment.findMany({
      where: {
        createdById: userId,
        status: "published",
      },
      include: {
        problem: { select: { id: true, title: true, difficulty: true } },
        course: { select: { id: true, title: true } },
        assignedStudents: { select: { studentId: true } },
        submissions: {
          select: { studentId: true, review: { select: { score: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Collect problem IDs from assignments
    const problemIds = [...new Set(assignments.map((a) => a.problem?.id).filter(Boolean))] as string[];

    // Also get all ProblemSubmissions for these problems (direct practice)
    const problemSubmissions = problemIds.length > 0 ? await prisma.problemSubmission.findMany({
      where: { problemId: { in: problemIds } },
      select: { problemId: true, studentId: true, note: true },
    }) : [];

    // Group ProblemSubmissions by problem
    const psByProblem = new Map<string, { studentIds: Set<string>; passedIds: Set<string> }>();
    for (const ps of problemSubmissions) {
      if (!psByProblem.has(ps.problemId)) {
        psByProblem.set(ps.problemId, { studentIds: new Set(), passedIds: new Set() });
      }
      const entry = psByProblem.get(ps.problemId)!;
      entry.studentIds.add(ps.studentId);
      // Check if all tests passed from note
      if (ps.note) {
        const match = ps.note.match(/Auto-judge\s*\((\d+)\/(\d+)\)/);
        if (match && parseInt(match[1]) === parseInt(match[2])) {
          entry.passedIds.add(ps.studentId);
        }
      }
    }

    // Group by problem
    const problemMap = new Map<string, {
      problemId: string;
      title: string;
      difficulty: string;
      courses: string[];
      totalAssigned: number;
      totalSubmitted: number;
      totalPassed: number;
      assignmentIds: string[];
      studentIds: Set<string>;       // assigned or submitted
      submittedStudentIds: Set<string>; // submitted (assignment + direct)
      passedStudentIds: Set<string>;
    }>();

    for (const a of assignments) {
      const pid = a.problem?.id || a.id;
      const existing = problemMap.get(pid);
      const assignedStudentIds = a.assignedStudents.map((s) => s.studentId);
      const submittedStudentIds = a.submissions.map((s) => s.studentId);
      // Also count submissions where review score >= 5
      const reviewPassedIds = a.submissions.filter((s) => (s.review?.score || 0) >= 5).map((s) => s.studentId);

      if (existing) {
        if (a.course && !existing.courses.includes(a.course.title)) {
          existing.courses.push(a.course.title);
        }
        assignedStudentIds.forEach((id) => existing.studentIds.add(id));
        submittedStudentIds.forEach((id) => existing.submittedStudentIds.add(id));
        reviewPassedIds.forEach((id) => existing.passedStudentIds.add(id));
      } else {
        problemMap.set(pid, {
          problemId: pid,
          title: a.problem?.title || a.title,
          difficulty: a.problem?.difficulty || "easy",
          courses: a.course ? [a.course.title] : [],
          totalAssigned: 0,
          totalSubmitted: 0,
          totalPassed: 0,
          assignmentIds: [],
          studentIds: new Set(assignedStudentIds),
          submittedStudentIds: new Set(submittedStudentIds),
          passedStudentIds: new Set(reviewPassedIds),
        });
      }
    }

    // Merge ProblemSubmission data into each problem
    for (const [pid, data] of problemMap) {
      const psData = psByProblem.get(pid);
      if (psData) {
        psData.studentIds.forEach((id) => {
          data.studentIds.add(id);
          data.submittedStudentIds.add(id);
        });
        psData.passedIds.forEach((id) => data.passedStudentIds.add(id));
      }
      data.totalAssigned = data.studentIds.size;
      data.totalSubmitted = data.submittedStudentIds.size;
      data.totalPassed = data.passedStudentIds.size;
    }

    const problems = Array.from(problemMap.values()).map((p) => ({
      problemId: p.problemId,
      title: p.title,
      difficulty: p.difficulty,
      courses: p.courses,
      totalAssigned: p.totalAssigned,
      totalSubmitted: p.totalSubmitted,
      totalPassed: p.totalPassed,
      totalPending: Math.max(0, p.totalAssigned - p.totalSubmitted),
    }));

    const totalAssigned = problems.reduce((sum, p) => sum + p.totalAssigned, 0);
    const totalSubmitted = problems.reduce((sum, p) => sum + p.totalSubmitted, 0);
    const totalPassed = problems.reduce((sum, p) => sum + p.totalPassed, 0);

    res.json({
      problems,
      stats: { totalAssigned, totalSubmitted, totalPassed, totalProblems: problems.length },
    });
  } catch (err) {
    console.error("teacher manage error:", err);
    res.status(500).json({ error: "Failed to fetch teacher overview" });
  }
});

// ─── Hàng đợi chấm nền: giới hạn số bài chấm đồng thời để không nghẽn CPU ───
const MAX_CONCURRENT_JUDGES = 3;
let activeJudges = 0;
const judgeWaiters: (() => void)[] = [];

async function acquireJudgeSlot() {
  if (activeJudges < MAX_CONCURRENT_JUDGES) {
    activeJudges += 1;
    return;
  }
  await new Promise<void>((resolve) => judgeWaiters.push(resolve));
  activeJudges += 1;
}

function releaseJudgeSlot() {
  activeJudges = Math.max(0, activeJudges - 1);
  const next = judgeWaiters.shift();
  if (next) next();
}

// Chấm nền: cập nhật tiến độ từng test vào DB, rồi ghi kết quả cuối +
// thưởng vàng/XP + skill evidence + badge/mastery. Không block response.
async function runJudgeInBackground(params: {
  submissionId: string;
  problemId: string;
  problemTitle: string;
  difficulty: string;
  skillId: string | null;
  skillTagStatus: string;
  studentId: string;
  isStudent: boolean;
  code: string;
  language: "python" | "cpp";
  testCases: ReturnType<typeof parseTestCases>;
  timeLimitMs: number;
  memoryLimitMb: number;
  checkerType: ReturnType<typeof normalizeCheckerType>;
  studentNote: string;
}) {
  const {
    submissionId, problemId, problemTitle, difficulty, skillId, skillTagStatus,
    studentId, isStudent, code, language, testCases, timeLimitMs, memoryLimitMb, checkerType, studentNote,
  } = params;
  await acquireJudgeSlot();
  try {
    await prisma.problemSubmission.update({
      where: { id: submissionId },
      data: { status: "judging", judgedTests: 0 },
    });

    let judged = 0;
    const onProgress = () => {
      judged += 1;
      void prisma.problemSubmission
        .update({ where: { id: submissionId }, data: { judgedTests: judged } })
        .catch(() => {});
    };

    const effectiveTimeLimit = language === "python" ? Math.min(10_000, timeLimitMs * 2) : timeLimitMs;
    const judge = language === "cpp"
      ? await judgeCppCode(code, testCases, onProgress, { timeLimitMs: effectiveTimeLimit, memoryLimitMb, checkerType })
      : await judgePythonCode(code, testCases, onProgress, { timeLimitMs: effectiveTimeLimit, memoryLimitMb, checkerType });

    const allPassed = judge.status === "all_passed";
    await prisma.problemSubmission.update({
      where: { id: submissionId },
      data: {
        status: "done",
        passed: allPassed,
        judgedTests: testCases.length,
        note: `${studentNote ? `${studentNote}\n\n` : ""}${formatJudgeFeedback(judge)}`,
      },
    });

    // Skill evidence → unified sink (fail-soft). attempt ordinal = prior count + 1.
    try {
      const created = await prisma.problemSubmission.findUnique({ where: { id: submissionId }, select: { createdAt: true } });
      const createdAt = created?.createdAt ?? new Date();
      const priorCount = await prisma.problemSubmission.count({
        where: { problemId, studentId, createdAt: { lt: createdAt } },
      });
      await recordSkillEvidenceBatch(
        fromProblemSubmission(studentId, problemId, priorCount + 1, { skillId, skillTagStatus, difficulty }, allPassed, createdAt),
      );
    } catch (err) {
      console.error("[problemSubmissions] skill evidence record failed:", err);
    }

    // Thưởng khi giải xong (chạy nền, ghi cả số vàng/XP vào dòng bài nộp để UI hiển thị).
    if (allPassed && isStudent) {
      let tokensAwarded = 0;
      let xpAwarded = 0;
      try {
        const { awardProblemTokens } = await import("../utils/tokens");
        const award = await awardProblemTokens(studentId, difficulty, {
          refType: "Problem",
          refId: problemId,
          description: `Giải bài: ${problemTitle} (${difficulty})`,
        });
        tokensAwarded = award.awarded ? award.amount : 0;
      } catch { /* silent */ }
      try {
        const { awardXp, awardStreakDay } = await import("../utils/xpLedger");
        const { difficultyXpFromRates } = await import("../utils/xp");
        const { getRates } = await import("../utils/gamificationSettings");
        const { xp: rates } = await getRates();
        const amount = difficultyXpFromRates(difficulty, rates);
        const awarded = await awardXp(studentId, amount, {
          reason: "problem_solved",
          description: `Giải bài: ${problemTitle} (${difficulty})`,
          refType: "Problem",
          refId: problemId,
        });
        if (awarded) xpAwarded = amount;
        await awardStreakDay(studentId);
      } catch { /* silent */ }
      await prisma.problemSubmission
        .update({ where: { id: submissionId }, data: { tokensAwarded, xpAwarded } })
        .catch(() => {});
      import("../utils/badgeEngine").then(({ checkBadges }) => checkBadges(studentId)).catch(() => {});
      import("../services/assignmentService")
        .then(({ checkAndAwardAssignmentRewards }) => checkAndAwardAssignmentRewards(studentId, { problemId }))
        .catch(() => {});
      import("../services/skillMastery")
        .then(({ queueMasteryRecalculation }) => queueMasteryRecalculation(studentId))
        .catch((err) => console.error("Mastery recalc error:", err));
    }
  } catch (err) {
    console.error("[problemSubmissions] background judge failed:", err);
    await prisma.problemSubmission
      .update({ where: { id: submissionId }, data: { status: "error" } })
      .catch(() => {});
  } finally {
    releaseJudgeSlot();
  }
}

router.post("/problems/:problemId/submissions", authenticate, async (req: Request, res: Response) => {
  try {
    const problemId = param(req, "problemId");
    const { userId, role } = req.user!;

    const problem = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      res.status(404).json({ error: "Problem not found" });
      return;
    }

    // No gate beyond "the problem exists". Anyone who can open a problem in the
    // library can hand in an answer to it — role, course membership and publish
    // state are all organising metadata, not permission. Staff submissions are
    // stored the same way but skip the student-only reward path below.
    const code = typeof req.body.code === "string" ? req.body.code.trim() : "";
    const answer = typeof req.body.answer === "string" ? req.body.answer.trim() : "";
    const note = typeof req.body.note === "string" ? req.body.note.trim() : "";
    const typingSpeed = typeof req.body.typingSpeed === "number" ? Math.round(req.body.typingSpeed) : null;
    const activeTimeSeconds = typeof req.body.activeTimeSeconds === "number" ? Math.round(req.body.activeTimeSeconds) : null;
    const totalTimeSeconds = typeof req.body.totalTimeSeconds === "number" ? Math.round(req.body.totalTimeSeconds) : null;

    if (!code && !answer) {
      res.status(400).json({ error: "Code hoặc đáp án là bắt buộc" });
      return;
    }

    const testCases = parseTestCases(problem.testCases);
    const needsJudge = !!code && testCases.length > 0;
    const requestedLang = req.body.language === "cpp" || req.body.language === "python" ? req.body.language : null;
    const language: "python" | "cpp" = requestedLang ?? (code ? detectLanguage(code) : "python");

    // Tạo bản ghi ngay và trả response lập tức — việc chấm chạy nền.
    const submission = await prisma.problemSubmission.create({
      data: {
        problemId,
        studentId: userId,
        code,
        language,
        answer,
        note,
        typingSpeed,
        activeTimeSeconds,
        totalTimeSeconds,
        status: needsJudge ? "pending" : "done",
        totalTests: needsJudge ? testCases.length : 0,
        passed: false, // sẽ được chấm nền cập nhật; bài không có test không tự động tính là solved
      },
    });

    res.status(201).json({ submission, judging: needsJudge });

    if (needsJudge) {
      void runJudgeInBackground({
        submissionId: submission.id,
        problemId,
        problemTitle: problem.title,
        difficulty: problem.difficulty,
        skillId: problem.skillId,
        skillTagStatus: problem.skillTagStatus,
        studentId: userId,
        isStudent: role === "student",
        code,
        language,
        testCases,
        timeLimitMs: problem.timeLimitMs ?? 2000,
        memoryLimitMb: problem.memoryLimitMb ?? 256,
        checkerType: normalizeCheckerType(problem.checkerType),
        studentNote: note,
      }).catch(() => {});
    } else if (role === "student") {
      // Bài không có test: vẫn ghi evidence + badge/mastery như cũ (không thưởng vì chưa auto-verified).
      try {
        const priorCount = await prisma.problemSubmission.count({
          where: { problemId, studentId: userId, createdAt: { lt: submission.createdAt } },
        });
        await recordSkillEvidenceBatch(
          fromProblemSubmission(userId, problemId, priorCount + 1, problem as any, false, submission.createdAt),
        );
      } catch { /* fail-soft */ }
      import("../utils/badgeEngine").then(({ checkBadges }) => checkBadges(userId)).catch(() => {});
      import("../services/skillMastery")
        .then(({ queueMasteryRecalculation }) => queueMasteryRecalculation(userId))
        .catch(() => {});
    }
  } catch {
    res.status(500).json({ error: "Failed to submit" });
  }
});

router.get("/problems/:problemId/plagiarism", authenticate, async (req: Request, res: Response) => {
  try {
    const { role } = req.user!;
    if (role !== "teacher" && role !== "admin" && role !== "teaching_assistant") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const problemId = param(req, "problemId");
    const thresholdRaw = Number(req.query.threshold);
    const threshold = Number.isFinite(thresholdRaw)
      ? Math.max(0.4, Math.min(0.99, thresholdRaw > 1 ? thresholdRaw / 100 : thresholdRaw))
      : 0.72;

    const subs = await prisma.problemSubmission.findMany({
      where: { problemId, code: { not: null } },
      include: {
        student: { select: { id: true, fullName: true, nickname: true, email: true } },
      },
      orderBy: [{ passed: "desc" }, { createdAt: "desc" }],
    });

    // Keep best/latest code per student
    const byStudent = new Map<string, (typeof subs)[number]>();
    for (const s of subs) {
      if (!s.code || s.code.trim().length < 20) continue;
      if (!byStudent.has(s.studentId)) byStudent.set(s.studentId, s);
    }

    const items = Array.from(byStudent.values()).map((s) => ({
      submissionId: s.id,
      studentId: s.studentId,
      studentName: s.student.fullName,
      nickname: s.student.nickname,
      email: s.student.email,
      language: (s.language === "cpp" ? "cpp" : detectLanguage(s.code || "")) as "python" | "cpp",
      code: s.code || "",
      score: s.passed ? 10 : 0,
      submittedAt: s.createdAt,
    }));

    const pairs = detectPlagiarismPairs(items, { threshold });
    res.json({ scannedStudents: items.length, threshold, pairs });
  } catch (err) {
    console.error("problem plagiarism check error:", err);
    res.status(500).json({ error: "Không thể kiểm tra tương đồng code" });
  }
});

export default router;
