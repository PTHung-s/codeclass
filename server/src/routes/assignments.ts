import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, query } from "../utils/routeHelpers";
import { getRates } from "../utils/gamificationSettings";
import {
  ACTIVE_SUBMISSION_TYPES,
  AssignmentItemType,
  assignmentItemInclude,
  deriveSubmissionType,
  evaluateAssignmentsForStudents,
  getRemedialRecommendations,
  normalizeAssignmentItems,
  notifyAssignmentAssigned,
  notifyAssignmentReminder,
  resolveCourseStudents,
} from "../services/assignmentService";

const router = Router();
router.use(authenticate);

const STAFF_ROLES = ["admin", "teacher", "teaching_assistant"] as const;

function parseDeadline(raw: unknown): Date | null | "invalid" {
  if (raw === undefined) return undefined as unknown as null;
  if (raw === null || raw === "") return null;
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? "invalid" : d;
}

function parseNonNegInt(raw: unknown, fallback = 0): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(10_000, Math.round(n));
}

interface RequestedItemInput {
  itemType: AssignmentItemType;
  targetId: string;
}

function parseRequestedItems(body: Record<string, unknown>): RequestedItemInput[] {
  const rawList = Array.isArray(body.items) ? body.items : null;
  const out: RequestedItemInput[] = [];
  const seen = new Set<string>();

  if (rawList && rawList.length > 0) {
    for (const raw of rawList) {
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      const type = obj.itemType;
      if (type !== "problem" && type !== "quiz" && type !== "lesson") continue;
      const targetId =
        type === "problem"
          ? String(obj.problemId || obj.targetId || obj.id || "").trim()
          : type === "quiz"
            ? String(obj.quizId || obj.targetId || obj.id || "").trim()
            : String(obj.lessonId || obj.targetId || obj.id || "").trim();
      if (!targetId) continue;
      const key = `${type}:${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ itemType: type, targetId });
    }
    return out;
  }

  // Backward-compatible single problemId / lessonId payload
  const problemId = typeof body.problemId === "string" ? body.problemId.trim() : "";
  if (problemId) out.push({ itemType: "problem", targetId: problemId });
  const lessonId = typeof body.lessonId === "string" ? body.lessonId.trim() : "";
  if (lessonId) out.push({ itemType: "lesson", targetId: lessonId });
  return out;
}

async function validateRequestedItems(inputs: RequestedItemInput[]) {
  const problemIds = inputs.filter((i) => i.itemType === "problem").map((i) => i.targetId);
  const quizIds = inputs.filter((i) => i.itemType === "quiz").map((i) => i.targetId);
  const lessonIds = inputs.filter((i) => i.itemType === "lesson").map((i) => i.targetId);

  const [problems, quizzes, lessons] = await Promise.all([
    problemIds.length
      ? prisma.problem.findMany({ where: { id: { in: problemIds } }, select: { id: true, title: true } })
      : Promise.resolve([]),
    quizIds.length
      ? prisma.quiz.findMany({ where: { id: { in: quizIds } }, select: { id: true, title: true, lessonId: true } })
      : Promise.resolve([]),
    lessonIds.length
      ? prisma.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true } })
      : Promise.resolve([]),
  ]);

  const problemMap = new Map(problems.map((p) => [p.id, p]));
  const quizMap = new Map(quizzes.map((q) => [q.id, q]));
  const lessonMap = new Map(lessons.map((l) => [l.id, l]));

  const validated: Array<{
    itemType: AssignmentItemType;
    problemId: string | null;
    quizId: string | null;
    lessonId: string | null;
    title: string;
    orderIndex: number;
  }> = [];

  for (let idx = 0; idx < inputs.length; idx++) {
    const inp = inputs[idx];
    if (inp.itemType === "problem") {
      const p = problemMap.get(inp.targetId);
      if (!p) return { error: "Không tìm thấy đề bài trong thư viện" } as const;
      validated.push({ itemType: "problem", problemId: p.id, quizId: null, lessonId: null, title: p.title, orderIndex: idx });
    } else if (inp.itemType === "quiz") {
      const q = quizMap.get(inp.targetId);
      if (!q) return { error: "Không tìm thấy bài quiz đã chọn" } as const;
      validated.push({ itemType: "quiz", problemId: null, quizId: q.id, lessonId: q.lessonId, title: q.title, orderIndex: idx });
    } else {
      const l = lessonMap.get(inp.targetId);
      if (!l) return { error: "Không tìm thấy bài học đã chọn" } as const;
      validated.push({ itemType: "lesson", problemId: null, quizId: null, lessonId: l.id, title: l.title, orderIndex: idx });
    }
  }

  return { items: validated } as const;
}

async function resolveRecipients(body: { studentIds?: unknown; courseIds?: unknown; assignAllActive?: unknown }): Promise<string[]> {
  const ids = new Set<string>();
  if (Array.isArray(body.studentIds)) {
    for (const id of body.studentIds) if (typeof id === "string" && id.trim()) ids.add(id.trim());
  }
  if (Array.isArray(body.courseIds)) {
    const courseIds = body.courseIds.filter((c): c is string => typeof c === "string" && !!c.trim());
    for (const cid of courseIds) {
      const resolved = await resolveCourseStudents(cid);
      for (const sid of resolved.studentIds) ids.add(sid);
    }
  }
  if (body.assignAllActive === true) {
    const resolved = await resolveCourseStudents(null);
    for (const sid of resolved.studentIds) ids.add(sid);
  }
  return [...ids];
}

// ────────────────────────── STAFF HELPERS / CATALOG ──────────────────────────

/** Danh mục nội dung (Bài code / Quiz / Bài học) để chọn khi giao bài tập. */
router.get("/catalog", requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const type = query(req, "type") || "problem";
    const q = (query(req, "q") || "").trim();
    const courseId = query(req, "courseId") || "";
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25));

    if (type === "quiz") {
      const quizzes = await prisma.quiz.findMany({
        where: {
          ...(q ? { OR: [{ title: { contains: q } }, { lesson: { title: { contains: q } } }] } : {}),
          ...(courseId ? { lesson: { courseId } } : {}),
        },
        select: {
          id: true,
          title: true,
          lessonId: true,
          questionCount: true,
          lesson: {
            select: {
              id: true,
              title: true,
              course: { select: { id: true, title: true } },
            },
          },
          _count: { select: { questions: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      res.json(
        quizzes.map((qz) => ({
          id: qz.id,
          itemType: "quiz" as const,
          quizId: qz.id,
          lessonId: qz.lessonId,
          title: qz.title,
          difficulty: null,
          courseTitle: qz.lesson?.course?.title ?? null,
          lessonTitle: qz.lesson?.title ?? null,
          questionCount: qz._count.questions,
        })),
      );
      return;
    }

    if (type === "lesson") {
      const lessons = await prisma.lesson.findMany({
        where: {
          status: { not: "archived" },
          ...(q ? { title: { contains: q } } : {}),
          ...(courseId ? { courseId } : {}),
        },
        select: {
          id: true,
          title: true,
          course: { select: { id: true, title: true } },
          module: { select: { id: true, title: true } },
        },
        orderBy: [{ courseId: "asc" }, { orderIndex: "asc" }],
        take: limit,
      });
      res.json(
        lessons.map((l) => ({
          id: l.id,
          itemType: "lesson" as const,
          lessonId: l.id,
          title: l.title,
          difficulty: null,
          courseTitle: l.course?.title ?? null,
          moduleTitle: l.module?.title ?? null,
        })),
      );
      return;
    }

    const problems = await prisma.problem.findMany({
      where: {
        status: { not: "archived" },
        ...(q ? { OR: [{ title: { contains: q } }, { shortDescription: { contains: q } }] } : {}),
      },
      select: { id: true, title: true, difficulty: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json(
      problems.map((p) => ({
        id: p.id,
        itemType: "problem" as const,
        problemId: p.id,
        title: p.title,
        difficulty: p.difficulty,
        courseTitle: null,
      })),
    );
  } catch {
    res.status(500).json({ error: "Không tải được danh mục nội dung" });
  }
});

/** Gợi ý danh sách học sinh theo khóa (fallback thông minh khi CourseMember trống). */
router.get("/course-students", requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const courseId = (query(req, "courseId") || "").trim() || null;
    const resolved = await resolveCourseStudents(courseId);
    res.json({
      studentIds: resolved.studentIds,
      source: resolved.source,
      count: resolved.studentIds.length,
    });
  } catch {
    res.status(500).json({ error: "Không lấy được danh sách học sinh theo khóa" });
  }
});

/** Gợi ý bài tập khắc phục lỗ hổng kỹ năng (theo lớp, theo kỹ năng hoặc theo 1 học sinh). */
router.get("/recommend-remedial", requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const skillId = (query(req, "skillId") || "").trim() || undefined;
    const studentId = (query(req, "studentId") || "").trim() || undefined;
    const limit = Number(req.query.limit) || 8;
    const result = await getRemedialRecommendations({ skillId, studentId, limit });
    if (!result) {
      res.status(404).json({ error: "Không tìm thấy học sinh" });
      return;
    }
    res.json(result);
  } catch {
    res.status(500).json({ error: "Không tạo được gợi ý bài tập khắc phục" });
  }
});

// ────────────────────────── STAFF LIST & CREATE ──────────────────────────

/** Danh sách bài tập (GV/TA/admin) + thống kê tổng quan từng bài. */
router.get("/", requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const status = query(req, "status"); // active (mặc định) | archived | all
    const courseId = query(req, "courseId");
    const where: Record<string, unknown> = { submissionType: { in: [...ACTIVE_SUBMISSION_TYPES] } };
    if (status === "archived") where.status = "archived";
    else if (status !== "all") where.status = { not: "archived" };
    if (courseId) where.courseId = courseId;

    const assignments = await prisma.assignment.findMany({
      where,
      include: {
        ...assignmentItemInclude,
        course: { select: { id: true, title: true } },
        createdBy: { select: { id: true, fullName: true } },
        assignedStudents: { select: { studentId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const studentIds = [...new Set(assignments.flatMap((a) => a.assignedStudents.map((s) => s.studentId)))];
    const progressMap = await evaluateAssignmentsForStudents(assignments, studentIds);

    const result = assignments.map((a) => {
      const normalizedItems = normalizeAssignmentItems(a);
      const rows = a.assignedStudents.map((link) => progressMap.get(`${a.id}:${link.studentId}`));
      const assigned = rows.length;
      const done = rows.filter((r) => r && r.status !== "not_started").length;
      const passed = rows.filter((r) => r && r.status === "passed").length;
      const late = rows.filter((r) => r && r.isLate && r.status !== "not_started").length;
      const locked = rows.filter((r) => r && r.locked).length;
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        deadline: a.deadline,
        status: a.status,
        submissionType: a.submissionType,
        strictDeadline: a.strictDeadline,
        autoAssignNewStudents: a.autoAssignNewStudents,
        rewardOnTime: a.rewardOnTime,
        bonusTokens: a.bonusTokens,
        bonusXp: a.bonusXp,
        reminderSentAt: a.reminderSentAt,
        createdAt: a.createdAt,
        courseId: a.courseId,
        problem: a.problem,
        lesson: a.lesson,
        course: a.course,
        createdBy: a.createdBy,
        items: normalizedItems,
        stats: { assigned, done, passed, notStarted: assigned - done, late, locked },
      };
    });

    res.json(result);
  } catch {
    res.status(500).json({ error: "Không tải được danh sách bài tập" });
  }
});

/** Tạo bài tập mới (1 hoặc nhiều bài code/quiz/bài học) + giao cho học sinh. */
router.post("/", requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const { userId } = req.user!;
    const title = String(req.body.title || "").trim();
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
    const deadline = parseDeadline(req.body.deadline);
    if (!title) {
      res.status(400).json({ error: "Cần tiêu đề bài tập" });
      return;
    }
    if (deadline === "invalid") {
      res.status(400).json({ error: "Hạn chót không hợp lệ" });
      return;
    }

    const parsedInputs = parseRequestedItems(req.body);
    if (!parsedInputs.length) {
      res.status(400).json({ error: "Cần chọn ít nhất một nội dung (bài code, quiz hoặc bài học)" });
      return;
    }

    const validated = await validateRequestedItems(parsedInputs);
    if ("error" in validated) {
      res.status(404).json({ error: validated.error });
      return;
    }

    const recipientIds = await resolveRecipients(req.body);
    if (!recipientIds.length) {
      res.status(400).json({ error: "Cần chọn học sinh hoặc khóa học có học sinh" });
      return;
    }
    const students = await prisma.user.findMany({
      where: { id: { in: recipientIds }, role: "student", status: "active" },
      select: { id: true },
    });
    if (!students.length) {
      res.status(400).json({ error: "Không có học sinh hợp lệ nào được chọn" });
      return;
    }

    const courseId = typeof req.body.courseId === "string" && req.body.courseId.trim() ? req.body.courseId.trim() : null;
    const strictDeadline = req.body.strictDeadline === true;
    const autoAssignNewStudents = req.body.autoAssignNewStudents === true;
    const rewardOnTime = req.body.rewardOnTime !== false;
    const bonusTokens = parseNonNegInt(req.body.bonusTokens, 0);
    const bonusXp = parseNonNegInt(req.body.bonusXp, 0);

    const submissionType = deriveSubmissionType(validated.items);
    const firstProblemId = validated.items.find((i) => i.itemType === "problem")?.problemId ?? null;
    const firstLessonId = validated.items.find((i) => i.itemType === "lesson")?.lessonId ?? null;

    const assignment = await prisma.assignment.create({
      data: {
        title,
        description: description || null,
        problemId: firstProblemId,
        lessonId: firstLessonId,
        courseId,
        deadline,
        submissionType,
        strictDeadline,
        autoAssignNewStudents,
        rewardOnTime,
        bonusTokens,
        bonusXp,
        status: "published",
        publishDate: new Date(),
        createdById: userId,
        items: {
          create: validated.items.map((it) => ({
            itemType: it.itemType,
            problemId: it.problemId,
            quizId: it.quizId,
            lessonId: it.lessonId,
            orderIndex: it.orderIndex,
          })),
        },
        assignedStudents: { create: students.map((s) => ({ studentId: s.id })) },
      },
    });

    await notifyAssignmentAssigned(
      students.map((s) => s.id),
      assignment.id,
      title,
      validated.items,
      deadline,
    ).catch(() => undefined);

    res.status(201).json({ id: assignment.id, assignedCount: students.length });
  } catch {
    res.status(500).json({ error: "Không tạo được bài tập" });
  }
});

// ────────────────────────── STUDENT ──────────────────────────

/** Danh sách bài tập được giao của học sinh đang đăng nhập. */
router.get("/mine", requireRole("student"), async (req: Request, res: Response) => {
  try {
    const { userId } = req.user!;
    const links = await prisma.assignmentStudent.findMany({
      where: {
        studentId: userId,
        assignment: { status: "published", submissionType: { in: [...ACTIVE_SUBMISSION_TYPES] } },
      },
      include: {
        assignment: {
          include: {
            ...assignmentItemInclude,
            course: { select: { id: true, title: true } },
          },
        },
      },
    });

    const assignments = links.map((l) => l.assignment);
    const now = new Date();
    const [progressMap, rates] = await Promise.all([
      evaluateAssignmentsForStudents(assignments, [userId], now),
      getRates(),
    ]);

    const rows = links.map((l) => {
      const a = l.assignment;
      const prog = progressMap.get(`${a.id}:${userId}`);
      const items = prog?.items ?? [];
      const expectedTokens = a.rewardOnTime ? (rates.tokens.assignmentTokens || 0) + (a.bonusTokens || 0) : 0;
      const expectedXp = a.rewardOnTime ? (rates.xp.submissionXp || 0) + (a.bonusXp || 0) : 0;
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        instructions: a.instructions,
        deadline: a.deadline,
        createdAt: a.createdAt,
        submissionType: a.submissionType,
        strictDeadline: a.strictDeadline,
        rewardOnTime: a.rewardOnTime,
        bonusTokens: a.bonusTokens,
        bonusXp: a.bonusXp,
        expectedTokens,
        expectedXp,
        rewardedAt: l.rewardedAt,
        completedAt: prog?.completedAt ?? l.completedAt ?? null,
        problem: a.problem,
        lesson: a.lesson,
        course: a.course,
        items,
        completedItems: prog?.completedItems ?? 0,
        totalItems: prog?.totalItems ?? items.length,
        attempts: prog?.attempts ?? 0,
        firstAttemptAt: prog?.firstAttemptAt ?? null,
        lastAttemptAt: prog?.lastAttemptAt ?? null,
        status: prog?.status ?? "not_started",
        isLate: prog?.isLate ?? false,
        overdue: prog?.overdue ?? false,
        locked: prog?.locked ?? false,
        closedAfterDeadline: prog?.closedAfterDeadline ?? false,
      };
    });

    // Bài cần làm (quá hạn trước) lên đầu, bài đã đạt xuống cuối; cùng nhóm thì theo hạn chót.
    const rank = (r: (typeof rows)[number]) => (r.status === "passed" ? 2 : r.overdue ? 0 : 1);
    rows.sort((x, y) => {
      if (rank(x) !== rank(y)) return rank(x) - rank(y);
      const dx = x.deadline ? new Date(x.deadline).getTime() : Infinity;
      const dy = y.deadline ? new Date(y.deadline).getTime() : Infinity;
      return dx - dy;
    });

    res.json(rows);
  } catch {
    res.status(500).json({ error: "Không tải được bài tập của bạn" });
  }
});

// ────────────────────────── STAFF (detail / submissions / edit / remind) ──────────────────────────

/** Xem code / lượt làm quiz / tiến độ bài học của 1 học sinh trong bài tập. */
router.get("/:id/students/:studentId/submissions", requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const studentId = param(req, "studentId");

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: assignmentItemInclude,
    });
    if (!assignment || !ACTIVE_SUBMISSION_TYPES.includes(assignment.submissionType as (typeof ACTIVE_SUBMISSION_TYPES)[number])) {
      res.status(404).json({ error: "Không tìm thấy bài tập" });
      return;
    }

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, fullName: true, nickname: true, email: true, avatarUrl: true },
    });
    if (!student) {
      res.status(404).json({ error: "Không tìm thấy học sinh" });
      return;
    }

    const normalizedItems = normalizeAssignmentItems(assignment);
    const problemIds = normalizedItems.filter((i) => i.itemType === "problem" && i.problemId).map((i) => i.problemId!);
    const quizIds = normalizedItems.filter((i) => i.itemType === "quiz" && i.quizId).map((i) => i.quizId!);
    const lessonIds = normalizedItems.filter((i) => i.itemType === "lesson" && i.lessonId).map((i) => i.lessonId!);

    const [problemSubs, quizAttempts, lessonProgresses] = await Promise.all([
      problemIds.length
        ? prisma.problemSubmission.findMany({
            where: { problemId: { in: problemIds }, studentId },
            select: {
              id: true,
              problemId: true,
              code: true,
              language: true,
              answer: true,
              note: true,
              passed: true,
              status: true,
              totalTests: true,
              judgedTests: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      quizIds.length
        ? prisma.quizAttempt.findMany({
            where: { quizId: { in: quizIds }, userId: studentId },
            select: { id: true, quizId: true, score: true, totalQuestions: true, passed: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      lessonIds.length
        ? prisma.lessonProgress.findMany({
            where: { lessonId: { in: lessonIds }, userId: studentId },
            select: { lessonId: true, completedAt: true },
          })
        : Promise.resolve([]),
    ]);

    const items = normalizedItems.map((it) => {
      if (it.itemType === "problem" && it.problemId) {
        const subs = problemSubs.filter((s) => s.problemId === it.problemId).slice(0, 8);
        return { ...it, problemSubmissions: subs, quizAttempts: [], lessonCompletedAt: null };
      }
      if (it.itemType === "quiz" && it.quizId) {
        const attempts = quizAttempts.filter((a) => a.quizId === it.quizId).slice(0, 8);
        return { ...it, problemSubmissions: [], quizAttempts: attempts, lessonCompletedAt: null };
      }
      const lp = lessonProgresses.find((p) => p.lessonId === it.lessonId);
      return { ...it, problemSubmissions: [], quizAttempts: [], lessonCompletedAt: lp?.completedAt ?? null };
    });

    res.json({
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      deadline: assignment.deadline,
      student,
      items,
    });
  } catch {
    res.status(500).json({ error: "Không tải được bài nộp của học sinh" });
  }
});

/** Chi tiết 1 bài tập: bảng trạng thái từng học sinh được giao. */
router.get("/:id", requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        ...assignmentItemInclude,
        course: { select: { id: true, title: true } },
        createdBy: { select: { id: true, fullName: true } },
        assignedStudents: {
          include: {
            student: { select: { id: true, fullName: true, nickname: true, email: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!assignment || !ACTIVE_SUBMISSION_TYPES.includes(assignment.submissionType as (typeof ACTIVE_SUBMISSION_TYPES)[number])) {
      res.status(404).json({ error: "Không tìm thấy bài tập" });
      return;
    }

    const studentIds = assignment.assignedStudents.map((l) => l.studentId);
    const progressMap = await evaluateAssignmentsForStudents([assignment], studentIds);
    const normalizedItems = normalizeAssignmentItems(assignment);

    const rows = assignment.assignedStudents.map((link) => {
      const prog = progressMap.get(`${assignment.id}:${link.studentId}`);
      return {
        student: link.student,
        status: prog?.status ?? "not_started",
        attempts: prog?.attempts ?? 0,
        passed: !!prog?.passed,
        completedItems: prog?.completedItems ?? 0,
        totalItems: prog?.totalItems ?? normalizedItems.length,
        firstAttemptAt: prog?.firstAttemptAt ?? null,
        lastAttemptAt: prog?.lastAttemptAt ?? null,
        completedAt: prog?.completedAt ?? link.completedAt ?? null,
        late: prog?.isLate ?? false,
        locked: prog?.locked ?? false,
        rewardedAt: link.rewardedAt,
        itemStatuses: (prog?.items ?? []).map((it) => ({
          id: it.id,
          itemType: it.itemType,
          title: it.title,
          status: it.status,
          passed: it.passed,
          attempts: it.attempts,
          scoreLabel: it.scoreLabel,
          isLate: it.isLate,
        })),
      };
    });
    rows.sort((a, b) => a.student.fullName.localeCompare(b.student.fullName, "vi"));

    const itemStats = normalizedItems.map((it, idx) => {
      const passedCount = rows.filter((r) => r.itemStatuses[idx]?.passed).length;
      return { ...it, passedCount };
    });

    const done = rows.filter((r) => r.status !== "not_started").length;
    const passed = rows.filter((r) => r.status === "passed").length;
    const late = rows.filter((r) => r.late && r.status !== "not_started").length;
    const locked = rows.filter((r) => r.locked).length;

    res.json({
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      instructions: assignment.instructions,
      deadline: assignment.deadline,
      status: assignment.status,
      submissionType: assignment.submissionType,
      strictDeadline: assignment.strictDeadline,
      autoAssignNewStudents: assignment.autoAssignNewStudents,
      rewardOnTime: assignment.rewardOnTime,
      bonusTokens: assignment.bonusTokens,
      bonusXp: assignment.bonusXp,
      reminderSentAt: assignment.reminderSentAt,
      courseId: assignment.courseId,
      problem: assignment.problem,
      lesson: assignment.lesson,
      course: assignment.course,
      createdBy: assignment.createdBy,
      items: itemStats,
      stats: { assigned: rows.length, done, passed, notStarted: rows.length - done, late, locked },
      rows,
    });
  } catch {
    res.status(500).json({ error: "Không tải được chi tiết bài tập" });
  }
});

/** Cập nhật bài tập: tiêu đề/mô tả/hạn chót/chính sách/nội dung + thêm/gỡ/đồng bộ học sinh. */
router.patch("/:id", requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const existing = await prisma.assignment.findUnique({
      where: { id },
      include: assignmentItemInclude,
    });
    if (!existing || !ACTIVE_SUBMISSION_TYPES.includes(existing.submissionType as (typeof ACTIVE_SUBMISSION_TYPES)[number])) {
      res.status(404).json({ error: "Không tìm thấy bài tập" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (typeof req.body.title === "string" && req.body.title.trim()) data.title = req.body.title.trim();
    if (typeof req.body.description === "string") data.description = req.body.description.trim() || null;
    if ("courseId" in req.body) {
      data.courseId = typeof req.body.courseId === "string" && req.body.courseId.trim() ? req.body.courseId.trim() : null;
    }
    if ("deadline" in req.body) {
      const d = parseDeadline(req.body.deadline);
      if (d === "invalid") {
        res.status(400).json({ error: "Hạn chót không hợp lệ" });
        return;
      }
      data.deadline = d === null ? null : (d as Date);
      // Reset automatic 24h reminder if deadline was cleared or pushed > 24h into the future
      if (d === null || (d as Date).getTime() > Date.now() + 24 * 60 * 60 * 1000) {
        data.reminderSentAt = null;
      }
    }
    if (req.body.status === "archived" || req.body.status === "published") data.status = req.body.status;
    if (typeof req.body.strictDeadline === "boolean") data.strictDeadline = req.body.strictDeadline;
    if (typeof req.body.autoAssignNewStudents === "boolean") data.autoAssignNewStudents = req.body.autoAssignNewStudents;
    if (typeof req.body.rewardOnTime === "boolean") data.rewardOnTime = req.body.rewardOnTime;
    if ("bonusTokens" in req.body) data.bonusTokens = parseNonNegInt(req.body.bonusTokens, existing.bonusTokens);
    if ("bonusXp" in req.body) data.bonusXp = parseNonNegInt(req.body.bonusXp, existing.bonusXp);

    let updatedNormalizedItems = normalizeAssignmentItems(existing);

    if (Array.isArray(req.body.items)) {
      const parsedInputs = parseRequestedItems({ items: req.body.items });
      if (!parsedInputs.length) {
        res.status(400).json({ error: "Bài tập cần ít nhất một nội dung" });
        return;
      }
      const validated = await validateRequestedItems(parsedInputs);
      if ("error" in validated) {
        res.status(404).json({ error: validated.error });
        return;
      }
      data.submissionType = deriveSubmissionType(validated.items);
      data.problemId = validated.items.find((i) => i.itemType === "problem")?.problemId ?? null;
      data.lessonId = validated.items.find((i) => i.itemType === "lesson")?.lessonId ?? null;

      await prisma.$transaction(async (tx) => {
        await tx.assignmentItem.deleteMany({ where: { assignmentId: id } });
        await tx.assignmentItem.createMany({
          data: validated.items.map((it) => ({
            assignmentId: id,
            itemType: it.itemType,
            problemId: it.problemId,
            quizId: it.quizId,
            lessonId: it.lessonId,
            orderIndex: it.orderIndex,
          })),
        });
        await tx.assignment.update({ where: { id }, data });
      });
      updatedNormalizedItems = validated.items.map((it) => ({
        itemType: it.itemType,
        title: it.title,
      })) as typeof updatedNormalizedItems;
    } else if (Object.keys(data).length) {
      await prisma.assignment.update({ where: { id }, data });
    }

    // Gỡ học sinh (chỉ gỡ link assignment_students, giữ nguyên lịch sử bài nộp/quiz)
    if (Array.isArray(req.body.removeStudentIds) && req.body.removeStudentIds.length) {
      const toRemove = req.body.removeStudentIds.filter((x: unknown): x is string => typeof x === "string" && !!x.trim());
      if (toRemove.length) {
        await prisma.assignmentStudent.deleteMany({
          where: { assignmentId: id, studentId: { in: toRemove } },
        });
      }
    }

    // Thêm học sinh hoặc đồng bộ HS lớp (chỉ thêm mới, idempotent)
    const addIdsSet = new Set<string>();
    if (Array.isArray(req.body.studentIds)) {
      for (const x of req.body.studentIds) {
        if (typeof x === "string" && x.trim()) addIdsSet.add(x.trim());
      }
    }
    if (req.body.syncRoster === true) {
      const targetCourseId =
        "courseId" in data ? (data.courseId as string | null) : existing.courseId;
      const resolved = await resolveCourseStudents(targetCourseId);
      for (const sid of resolved.studentIds) addIdsSet.add(sid);
    }

    let addedCount = 0;
    if (addIdsSet.size > 0) {
      const students = await prisma.user.findMany({
        where: { id: { in: [...addIdsSet] }, role: "student", status: "active" },
        select: { id: true },
      });
      if (students.length) {
        const already = await prisma.assignmentStudent.findMany({
          where: { assignmentId: id, studentId: { in: students.map((s) => s.id) } },
          select: { studentId: true },
        });
        const have = new Set(already.map((x) => x.studentId));
        const toAdd = students.filter((s) => !have.has(s.id));
        if (toAdd.length) {
          await prisma.assignmentStudent.createMany({
            data: toAdd.map((s) => ({ assignmentId: id, studentId: s.id })),
          });
          addedCount = toAdd.length;
          const notifyTitle = typeof data.title === "string" ? data.title : existing.title;
          const notifyDeadline =
            "deadline" in data ? (data.deadline as Date | null) : existing.deadline;
          await notifyAssignmentAssigned(
            toAdd.map((s) => s.id),
            id,
            notifyTitle,
            updatedNormalizedItems,
            notifyDeadline,
          ).catch(() => undefined);
        }
      }
    }

    const assignedCount = await prisma.assignmentStudent.count({ where: { assignmentId: id } });
    res.json({ ok: true, assignedCount, addedCount });
  } catch {
    res.status(500).json({ error: "Không cập nhật được bài tập" });
  }
});

/** Gửi nhắc hạn thủ công cho học sinh chưa hoàn thành bài tập. */
router.post("/:id/remind", requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        ...assignmentItemInclude,
        assignedStudents: { select: { studentId: true } },
      },
    });
    if (!assignment || !ACTIVE_SUBMISSION_TYPES.includes(assignment.submissionType as (typeof ACTIVE_SUBMISSION_TYPES)[number])) {
      res.status(404).json({ error: "Không tìm thấy bài tập" });
      return;
    }

    let targetStudentIds = assignment.assignedStudents.map((s) => s.studentId);
    if (Array.isArray(req.body?.studentIds) && req.body.studentIds.length > 0) {
      const allow = new Set(req.body.studentIds.filter((x: unknown): x is string => typeof x === "string"));
      targetStudentIds = targetStudentIds.filter((sid) => allow.has(sid));
    }
    if (!targetStudentIds.length) {
      res.json({ ok: true, remindedCount: 0 });
      return;
    }

    const progressMap = await evaluateAssignmentsForStudents([assignment], targetStudentIds);
    const unfinished = targetStudentIds.filter((sid) => {
      const prog = progressMap.get(`${assignment.id}:${sid}`);
      return !prog || prog.status !== "passed";
    });

    if (unfinished.length > 0) {
      const items = normalizeAssignmentItems(assignment);
      await notifyAssignmentReminder(unfinished, assignment.id, assignment.title, items, assignment.deadline);
    }

    res.json({ ok: true, remindedCount: unfinished.length });
  } catch {
    res.status(500).json({ error: "Không gửi được nhắc hạn" });
  }
});

/** Xóa hẳn bài tập (chỉ người tạo hoặc admin). Bài nộp của học sinh trên đề không bị xóa. */
router.delete("/:id", requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { userId, role } = req.user!;
    const assignment = await prisma.assignment.findUnique({ where: { id }, select: { createdById: true } });
    if (!assignment) {
      res.status(404).json({ error: "Không tìm thấy bài tập" });
      return;
    }
    if (role !== "admin" && assignment.createdById !== userId) {
      res.status(403).json({ error: "Chỉ người tạo bài tập hoặc admin mới xóa được" });
      return;
    }
    await prisma.assignment.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Không xóa được bài tập" });
  }
});

export default router;
