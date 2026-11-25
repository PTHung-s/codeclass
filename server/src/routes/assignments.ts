import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, query } from "../utils/routeHelpers";

/**
 * Assignment (giao bài tập) API — phase 1: bài tập viết code từ Thư viện đề.
 *
 * Trạng thái làm bài của học sinh suy ra trực tiếp từ bảng problem_submissions
 * (source of truth của chấm code), nên tracking luôn phản ánh đúng kết quả
 * judge, kể cả khi học sinh tự luyện trước khi được giao.
 *
 * Kiểu bài tập khác (quiz, bài học) sẽ thêm sau: thêm quizId/lessonId vào
 * schema Assignment + mở rộng các endpoint dưới đây theo submissionType.
 */

const router = Router();
router.use(authenticate);

const STAFF_ROLES = ["admin", "teacher", "teaching_assistant"] as const;

interface SubmissionStat {
  attempts: number;
  passed: boolean;
  firstAttemptAt: Date | null;
  lastAttemptAt: Date | null;
}

function emptyStat(): SubmissionStat {
  return { attempts: 0, passed: false, firstAttemptAt: null, lastAttemptAt: null };
}

/** Gom thống kê nộp bài theo học sinh cho 1 đề: số lần nộp, đã đạt chưa, lần đầu/cuối. */
async function loadSubmissionStats(problemId: string | null, studentIds: string[]) {
  const map = new Map<string, SubmissionStat>();
  if (!problemId || studentIds.length === 0) return map;
  const submissions = await prisma.problemSubmission.findMany({
    where: { problemId, studentId: { in: studentIds } },
    select: { studentId: true, passed: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const s of submissions) {
    const stat = map.get(s.studentId) ?? emptyStat();
    stat.attempts += 1;
    stat.passed = stat.passed || s.passed;
    if (!stat.firstAttemptAt) stat.firstAttemptAt = s.createdAt;
    stat.lastAttemptAt = s.createdAt;
    map.set(s.studentId, stat);
  }
  return map;
}

function deriveStatus(stat: SubmissionStat | undefined): "not_started" | "attempting" | "passed" {
  if (!stat || stat.attempts === 0) return "not_started";
  return stat.passed ? "passed" : "attempting";
}

function isLateSubmission(deadline: Date | null, firstAttemptAt: Date | null): boolean {
  return !!deadline && !!firstAttemptAt && firstAttemptAt > deadline;
}

function parseDeadline(raw: unknown): Date | null | "invalid" {
  if (raw === undefined) return undefined as unknown as null; // not provided
  if (raw === null || raw === "") return null;
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? "invalid" : d;
}

/** Giao bài cho ai: danh sách studentIds và/hoặc mở rộng từ các khóa học. */
async function resolveRecipients(body: { studentIds?: unknown; courseIds?: unknown }): Promise<string[]> {
  const ids = new Set<string>();
  if (Array.isArray(body.studentIds)) {
    for (const id of body.studentIds) if (typeof id === "string" && id.trim()) ids.add(id.trim());
  }
  if (Array.isArray(body.courseIds)) {
    const courseIds = body.courseIds.filter((c): c is string => typeof c === "string" && !!c.trim());
    if (courseIds.length) {
      const members = await prisma.courseMember.findMany({
        where: { courseId: { in: courseIds }, roleInCourse: "student", status: "active" },
        select: { userId: true },
      });
      for (const m of members) ids.add(m.userId);
    }
  }
  return [...ids];
}

async function createNotifications(studentIds: string[], assignmentId: string, title: string, problemTitle: string | null, deadline: Date | null) {
  if (!studentIds.length) return;
  const deadlineText = deadline
    ? ` Hạn chót: ${deadline.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}.`
    : "";
  await prisma.notification.createMany({
    data: studentIds.map((userId) => ({
      userId,
      title: "Bài tập mới",
      message: `Bạn được giao bài tập "${title}"${problemTitle ? ` — đề: ${problemTitle}` : ""}.${deadlineText} Vào mục "Bài tập của tôi" để làm.`,
      type: "assignment",
      relatedEntityType: "assignment",
      relatedEntityId: assignmentId,
    })),
  });
}

// ────────────────────────── STAFF ──────────────────────────

/** Danh sách bài tập (GV/TA/admin) + thống kê tổng quan từng bài. */
router.get("/", requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const status = query(req, "status"); // active (mặc định) | archived | all
    const courseId = query(req, "courseId");
    const where: Record<string, unknown> = { submissionType: "problem" };
    if (status === "archived") where.status = "archived";
    else if (status !== "all") where.status = { not: "archived" };
    if (courseId) where.courseId = courseId;

    const assignments = await prisma.assignment.findMany({
      where,
      include: {
        problem: { select: { id: true, title: true, difficulty: true } },
        course: { select: { id: true, title: true } },
        createdBy: { select: { id: true, fullName: true } },
        assignedStudents: { select: { studentId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const problemIds = [...new Set(assignments.map((a) => a.problemId).filter((x): x is string => !!x))];
    const studentIds = [...new Set(assignments.flatMap((a) => a.assignedStudents.map((s) => s.studentId)))];
    const submissions =
      problemIds.length && studentIds.length
        ? await prisma.problemSubmission.findMany({
            where: { problemId: { in: problemIds }, studentId: { in: studentIds } },
            select: { problemId: true, studentId: true, passed: true, createdAt: true },
          })
        : [];
    const statMap = new Map<string, SubmissionStat>();
    for (const s of submissions) {
      const key = `${s.problemId}:${s.studentId}`;
      const stat = statMap.get(key) ?? emptyStat();
      stat.attempts += 1;
      stat.passed = stat.passed || s.passed;
      if (!stat.firstAttemptAt) stat.firstAttemptAt = s.createdAt;
      stat.lastAttemptAt = s.createdAt;
      statMap.set(key, stat);
    }

    const result = assignments.map((a) => {
      const rows = a.assignedStudents.map((link) => {
        const stat = a.problemId ? statMap.get(`${a.problemId}:${link.studentId}`) : undefined;
        return {
          studentId: link.studentId,
          status: deriveStatus(stat),
          passed: !!stat?.passed,
          late: isLateSubmission(a.deadline, stat?.firstAttemptAt ?? null),
        };
      });
      const assigned = rows.length;
      const done = rows.filter((r) => r.status !== "not_started").length;
      const passed = rows.filter((r) => r.status === "passed").length;
      const late = rows.filter((r) => r.late && r.status !== "not_started").length;
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        deadline: a.deadline,
        status: a.status,
        createdAt: a.createdAt,
        problem: a.problem,
        course: a.course,
        createdBy: a.createdBy,
        stats: { assigned, done, passed, notStarted: assigned - done, late },
      };
    });

    res.json(result);
  } catch {
    res.status(500).json({ error: "Không tải được danh sách bài tập" });
  }
});

/** Tạo bài tập mới + giao cho học sinh (theo danh sách chọn hoặc theo khóa học). */
router.post("/", requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const { userId } = req.user!;
    const title = String(req.body.title || "").trim();
    const problemId = String(req.body.problemId || "").trim();
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
    const deadline = parseDeadline(req.body.deadline);
    if (!title) {
      res.status(400).json({ error: "Cần tiêu đề bài tập" });
      return;
    }
    if (!problemId) {
      res.status(400).json({ error: "Cần chọn đề bài từ thư viện" });
      return;
    }
    if (deadline === "invalid") {
      res.status(400).json({ error: "Hạn chót không hợp lệ" });
      return;
    }

    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { id: true, title: true, status: true },
    });
    if (!problem) {
      res.status(404).json({ error: "Không tìm thấy đề bài" });
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
    const assignment = await prisma.assignment.create({
      data: {
        title,
        description: description || null,
        problemId,
        courseId,
        deadline,
        submissionType: "problem",
        status: "published",
        publishDate: new Date(),
        createdById: userId,
        assignedStudents: { create: students.map((s) => ({ studentId: s.id })) },
      },
    });

    await createNotifications(students.map((s) => s.id), assignment.id, title, problem.title, deadline).catch(() => undefined);

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
      where: { studentId: userId, assignment: { status: "published", submissionType: "problem" } },
      include: {
        assignment: {
          include: {
            problem: { select: { id: true, title: true, difficulty: true } },
            course: { select: { id: true, title: true } },
          },
        },
      },
    });

    const problemIds = [...new Set(links.map((l) => l.assignment.problemId).filter((x): x is string => !!x))];
    const mySubmissions =
      problemIds.length
        ? await prisma.problemSubmission.findMany({
            where: { studentId: userId, problemId: { in: problemIds } },
            select: { problemId: true, passed: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          })
        : [];
    const statByProblem = new Map<string, SubmissionStat>();
    for (const s of mySubmissions) {
      const stat = statByProblem.get(s.problemId) ?? emptyStat();
      stat.attempts += 1;
      stat.passed = stat.passed || s.passed;
      if (!stat.firstAttemptAt) stat.firstAttemptAt = s.createdAt;
      stat.lastAttemptAt = s.createdAt;
      statByProblem.set(s.problemId, stat);
    }

    const now = new Date();
    const rows = links.map((l) => {
      const a = l.assignment;
      const stat = a.problemId ? statByProblem.get(a.problemId) : undefined;
      const status = deriveStatus(stat);
      const isLate = isLateSubmission(a.deadline, stat?.firstAttemptAt ?? null);
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        instructions: a.instructions,
        deadline: a.deadline,
        createdAt: a.createdAt,
        problem: a.problem,
        course: a.course,
        attempts: stat?.attempts ?? 0,
        firstAttemptAt: stat?.firstAttemptAt ?? null,
        lastAttemptAt: stat?.lastAttemptAt ?? null,
        status,
        isLate,
        overdue: !!a.deadline && a.deadline < now && status !== "passed",
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

// ────────────────────────── STAFF (detail) ──────────────────────────

/** Chi tiết 1 bài tập: bảng trạng thái từng học sinh được giao. */
router.get("/:id", requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        problem: { select: { id: true, title: true, difficulty: true } },
        course: { select: { id: true, title: true } },
        createdBy: { select: { id: true, fullName: true } },
        assignedStudents: {
          include: {
            student: { select: { id: true, fullName: true, nickname: true, email: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!assignment || assignment.submissionType !== "problem") {
      res.status(404).json({ error: "Không tìm thấy bài tập" });
      return;
    }

    const studentIds = assignment.assignedStudents.map((l) => l.studentId);
    const statMap = await loadSubmissionStats(assignment.problemId, studentIds);
    const rows = assignment.assignedStudents.map((link) => {
      const stat = statMap.get(link.studentId);
      return {
        student: link.student,
        status: deriveStatus(stat),
        attempts: stat?.attempts ?? 0,
        passed: !!stat?.passed,
        firstAttemptAt: stat?.firstAttemptAt ?? null,
        lastAttemptAt: stat?.lastAttemptAt ?? null,
        late: isLateSubmission(assignment.deadline, stat?.firstAttemptAt ?? null),
      };
    });
    rows.sort((a, b) => a.student.fullName.localeCompare(b.student.fullName, "vi"));

    const done = rows.filter((r) => r.status !== "not_started").length;
    const passed = rows.filter((r) => r.status === "passed").length;
    res.json({
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      instructions: assignment.instructions,
      deadline: assignment.deadline,
      status: assignment.status,
      problem: assignment.problem,
      course: assignment.course,
      createdBy: assignment.createdBy,
      stats: { assigned: rows.length, done, passed, notStarted: rows.length - done, late: rows.filter((r) => r.late && r.status !== "not_started").length },
      rows,
    });
  } catch {
    res.status(500).json({ error: "Không tải được chi tiết bài tập" });
  }
});

/** Cập nhật bài tập: tiêu đề/mô tả/hạn chót/lưu trữ + thêm học sinh. */
router.patch("/:id", requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const existing = await prisma.assignment.findUnique({
      where: { id },
      include: { problem: { select: { title: true } } },
    });
    if (!existing || existing.submissionType !== "problem") {
      res.status(404).json({ error: "Không tìm thấy bài tập" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (typeof req.body.title === "string" && req.body.title.trim()) data.title = req.body.title.trim();
    if (typeof req.body.description === "string") data.description = req.body.description.trim() || null;
    if ("deadline" in req.body) {
      const d = parseDeadline(req.body.deadline);
      if (d === "invalid") {
        res.status(400).json({ error: "Hạn chót không hợp lệ" });
        return;
      }
      data.deadline = d === null ? null : (d as Date);
    }
    if (req.body.status === "archived" || req.body.status === "published") data.status = req.body.status;
    if (Object.keys(data).length) {
      await prisma.assignment.update({ where: { id }, data });
    }

    // Thêm học sinh (chỉ thêm mới, không tự ý gỡ người đã nộp bài)
    if (Array.isArray(req.body.studentIds) && req.body.studentIds.length) {
      const wanted = req.body.studentIds.filter((x: unknown): x is string => typeof x === "string" && !!x.trim());
      const students = await prisma.user.findMany({
        where: { id: { in: wanted }, role: "student", status: "active" },
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
          await createNotifications(
            toAdd.map((s) => s.id),
            id,
            data.title ? String(data.title) : existing.title,
            existing.problem?.title ?? null,
            (data.deadline as Date | null | undefined) ?? existing.deadline
          ).catch(() => undefined);
        }
      }
    }

    const assignedCount = await prisma.assignmentStudent.count({ where: { assignmentId: id } });
    res.json({ ok: true, assignedCount });
  } catch {
    res.status(500).json({ error: "Không cập nhật được bài tập" });
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
