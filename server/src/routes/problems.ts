import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, query, paginate, publicTestCases, sanitizeProblemForStudent, formatProblemPreview } from "../utils/routeHelpers";

const router = Router();

function sanitizeProblemForList(problem: any) {
  return {
    ...problem,
    shortDescription: formatProblemPreview(problem.shortDescription),
  };
}

router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const search = query(req, "search");
    const difficulty = query(req, "difficulty");
    const tag = query(req, "tag");
    const status = query(req, "status");
    const { role } = req.user!;
    // Opt-in pagination: only when page and/or limit is present (keeps legacy array clients working).
    const pg = paginate(req, { defaultLimit: 30, maxLimit: 100 });

    const where: any = {};

    if (role === "student") {
      where.status = "published";
    } else if (!status) {
      // GV: ẩn bài đã archive khỏi danh sách mặc định (xem lại qua ?status=archived)
      where.status = { not: "archived" };
    }

    if (status && role !== "student") {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { shortDescription: { contains: search } },
        { statement: { contains: search } },
      ];
    }

    if (difficulty && difficulty !== "all") {
      where.difficulty = difficulty;
    }

    if (tag) {
      where.tags = { some: { tag } };
    }

    const problems = await prisma.problem.findMany({
      where,
      include: {
        createdBy: { select: { id: true, fullName: true } },
        tags: { select: { tag: true } },
      },
      orderBy: { createdAt: "desc" },
      ...pg.clause,
    });

    const mapped =
      role === "student"
        ? problems.map((problem) => sanitizeProblemForList(sanitizeProblemForStudent(problem, false)))
        : problems.map(sanitizeProblemForList);

    if (pg.hasPagination) {
      const total = await prisma.problem.count({ where });
      res.json(pg.envelope("problems", mapped, total));
      return;
    }

    res.json(mapped);
  } catch {
    res.status(500).json({ error: "Failed to fetch problems" });
  }
});

router.post("/", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const {
      title, shortDescription, statement, difficulty, estimatedTime,
      starterCode, sampleInput, sampleOutput, requirementsText, rubric,
      hints, teacherSolution, tags, status,
    } = req.body;

    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const problem = await prisma.problem.create({
      data: {
        title,
        shortDescription,
        statement,
        difficulty: difficulty || "easy",
        estimatedTime,
        starterCode,
        sampleInput,
        sampleOutput,
        requirementsText,
        rubric,
        hints,
        teacherSolution,
        status: status || "draft",
        createdById: req.user!.userId,
        tags: tags && Array.isArray(tags)
          ? { create: tags.map((t: string) => ({ tag: t })) }
          : undefined,
      },
      include: { tags: true },
    });

    res.status(201).json(problem);
  } catch {
    res.status(500).json({ error: "Failed to create problem" });
  }
});

// ─── Teacher: quản lý bộ test của đề ───
router.get("/:id/tests", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const problem = await prisma.problem.findUnique({ where: { id }, select: { testCases: true } });
    if (!problem) {
      res.status(404).json({ error: "Problem not found" });
      return;
    }
    let tests: unknown = [];
    try { tests = JSON.parse(problem.testCases || "[]"); } catch { /* giữ [] */ }
    res.json(Array.isArray(tests) ? tests : []);
  } catch {
    res.status(500).json({ error: "Failed to fetch tests" });
  }
});

router.put("/:id/tests", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const problem = await prisma.problem.findUnique({ where: { id }, select: { id: true } });
    if (!problem) {
      res.status(404).json({ error: "Problem not found" });
      return;
    }

    const incoming = req.body?.tests;
    if (!Array.isArray(incoming)) {
      res.status(400).json({ error: "tests phải là một mảng" });
      return;
    }
    if (incoming.length > 200) {
      res.status(400).json({ error: "Tối đa 200 test mỗi bài" });
      return;
    }

    const cleaned = [];
    for (const t of incoming) {
      if (!t || typeof t.input !== "string" || typeof t.output !== "string") {
        res.status(400).json({ error: "Mỗi test cần đủ input và output (kiểu chuỗi)" });
        return;
      }
      if (t.input.length > 250_000 || t.output.length > 250_000) {
        res.status(400).json({ error: "Một test không được vượt quá 250KB" });
        return;
      }
      cleaned.push({
        input: t.input.replace(/\r\n/g, "\n"),
        output: String(t.output).replace(/\r\n/g, "\n").replace(/\n+$/, "") ,
        hidden: Boolean(t.hidden),
      });
    }

    await prisma.problem.update({
      where: { id },
      data: { testCases: JSON.stringify(cleaned) },
    });

    res.json({ ok: true, count: cleaned.length });
  } catch {
    res.status(500).json({ error: "Failed to save tests" });
  }
});

router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const problem = await prisma.problem.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        tags: { select: { tag: true } },
      },
    });

    if (!problem) {
      res.status(404).json({ error: "Problem not found" });
      return;
    }

    if (req.user!.role === "student" && problem.status !== "published") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (req.user!.role === "student") {
      res.json(sanitizeProblemForStudent(problem, true));
      return;
    }

    res.json(problem);
  } catch {
    res.status(500).json({ error: "Failed to fetch problem" });
  }
});

router.patch("/:id", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const problem = await prisma.problem.findUnique({ where: { id } });

    if (!problem) {
      res.status(404).json({ error: "Problem not found" });
      return;
    }

    if (req.user!.role !== "admin" && problem.createdById !== req.user!.userId) {
      res.status(403).json({ error: "Only the creator can edit" });
      return;
    }

    const {
      title, shortDescription, statement, difficulty, estimatedTime,
      starterCode, sampleInput, sampleOutput, requirementsText, rubric,
      hints, teacherSolution, tags, status,
    } = req.body;

    if (tags !== undefined) {
      await prisma.problemTag.deleteMany({ where: { problemId: id } });
    }

    const updated = await prisma.problem.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(shortDescription !== undefined && { shortDescription }),
        ...(statement !== undefined && { statement }),
        ...(difficulty !== undefined && { difficulty }),
        ...(estimatedTime !== undefined && { estimatedTime }),
        ...(starterCode !== undefined && { starterCode }),
        ...(sampleInput !== undefined && { sampleInput }),
        ...(sampleOutput !== undefined && { sampleOutput }),
        ...(requirementsText !== undefined && { requirementsText }),
        ...(rubric !== undefined && { rubric }),
        ...(hints !== undefined && { hints }),
        ...(teacherSolution !== undefined && { teacherSolution }),
        ...(status !== undefined && { status }),
        ...(tags !== undefined && {
          tags: { create: tags.map((t: string) => ({ tag: t })) },
        }),
      },
      include: { tags: true },
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update problem" });
  }
});

router.delete("/:id", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const problem = await prisma.problem.findUnique({ where: { id } });

    if (!problem) {
      res.status(404).json({ error: "Problem not found" });
      return;
    }

    if (req.user!.role !== "admin" && problem.createdById !== req.user!.userId) {
      res.status(403).json({ error: "Only the creator can delete" });
      return;
    }

    await prisma.problem.update({ where: { id }, data: { status: "archived" } });
    res.json({ message: "Problem archived" });
  } catch {
    res.status(500).json({ error: "Failed to delete problem" });
  }
});

export default router;
