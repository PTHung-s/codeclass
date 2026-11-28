import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, query, paginate, publicTestCases, sanitizeProblemForStudent, formatProblemPreview } from "../utils/routeHelpers";
import { importProblemPack, listBuiltInPacks, loadBuiltInPack } from "../services/problemPackService";
import { buildCpRoadmap, getProblemNeighbors } from "../services/cpRoadmapService";
import { normalizeCheckerType } from "../utils/judgeChecker";

const router = Router();

const TIER_TAGS = ["tầng 1", "tầng 2", "tầng 3", "tầng 4"];
const TIER_TAG_SET = new Set(TIER_TAGS);

const LIST_PROBLEM_SELECT = {
  id: true,
  title: true,
  shortDescription: true,
  difficulty: true,
  estimatedTime: true,
  status: true,
  skillId: true,
  timeLimitMs: true,
  memoryLimitMb: true,
  checkerType: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  createdBy: { select: { id: true, fullName: true } },
  tags: { select: { tag: true } },
  _count: { select: { problemSubmissions: true } },
} as const;

function sanitizeProblemForList(problem: any) {
  return {
    ...problem,
    shortDescription: formatProblemPreview(problem.shortDescription),
  };
}

function parseCsvParam(raw?: string): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s !== "all"),
    ),
  );
}

router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const search = query(req, "search")?.trim();
    const difficulties = parseCsvParam(query(req, "difficulties") ?? query(req, "difficulty"));
    const tags = parseCsvParam(query(req, "tags") ?? query(req, "tag"));
    const tier = query(req, "tier")?.trim();
    const solved = query(req, "solved")?.trim();
    const sort = query(req, "sort")?.trim() || "default";
    const status = query(req, "status");
    const { role, userId } = req.user!;
    // Opt-in pagination: only when page and/or limit is present (keeps legacy array clients working).
    const pg = paginate(req, { defaultLimit: 30, maxLimit: 100 });

    const where: any = {};
    const andClauses: any[] = [];

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
      andClauses.push({
        OR: [
          { title: { contains: search } },
          { shortDescription: { contains: search } },
          { statement: { contains: search } },
        ],
      });
    }

    if (difficulties.length === 1) {
      where.difficulty = difficulties[0];
    } else if (difficulties.length > 1) {
      where.difficulty = { in: difficulties };
    }

    for (const tag of tags) {
      andClauses.push({ tags: { some: { tag } } });
    }

    if (tier && TIER_TAG_SET.has(tier.toLowerCase())) {
      andClauses.push({ tags: { some: { tag: tier.toLowerCase() } } });
    }

    if (role === "student" && (solved === "solved" || solved === "unsolved")) {
      const solvedRows = await prisma.problemSubmission.findMany({
        where: { studentId: userId, passed: true },
        select: { problemId: true },
        distinct: ["problemId"],
      });
      const solvedIds = solvedRows.map((r) => r.problemId);
      if (solved === "solved") {
        if (solvedIds.length === 0) {
          res.json(pg.hasPagination ? pg.envelope("problems", [], 0) : []);
          return;
        }
        where.id = { in: solvedIds };
      } else if (solvedIds.length > 0) {
        where.id = { notIn: solvedIds };
      }
    }

    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    if (sort === "difficulty") {
      // Difficulty is stored as string ("easy" | "medium" | "hard"); sort lightweight metadata before slicing page.
      const allRows = await prisma.problem.findMany({
        where,
        select: LIST_PROBLEM_SELECT,
      });
      const rank: Record<string, number> = { easy: 1, medium: 2, hard: 3 };
      allRows.sort(
        (a, b) =>
          (rank[a.difficulty] ?? 99) - (rank[b.difficulty] ?? 99) ||
          a.title.localeCompare(b.title, "vi"),
      );
      const total = allRows.length;
      const sliced = pg.hasPagination
        ? allRows.slice(pg.skip, pg.skip + pg.limit)
        : allRows;
      const mapped = sliced.map(sanitizeProblemForList);
      res.json(pg.hasPagination ? pg.envelope("problems", mapped, total) : mapped);
      return;
    }

    const orderBy: any =
      sort === "title_asc"
        ? [{ title: "asc" }]
        : sort === "title_desc"
          ? [{ title: "desc" }]
          : sort === "time_asc"
            ? [{ estimatedTime: "asc" }, { createdAt: "desc" }]
            : sort === "time_desc"
              ? [{ estimatedTime: "desc" }, { createdAt: "desc" }]
              : [{ createdAt: "desc" }];

    const problems = await prisma.problem.findMany({
      where,
      select: LIST_PROBLEM_SELECT,
      orderBy,
      ...pg.clause,
    });

    const mapped = problems.map(sanitizeProblemForList);

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
      timeLimitMs, memoryLimitMb, checkerType,
    } = req.body;

    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const safeTimeLimit = Number.isFinite(Number(timeLimitMs))
      ? Math.max(500, Math.min(10_000, Math.round(Number(timeLimitMs))))
      : 2000;
    const safeMemoryLimit = Number.isFinite(Number(memoryLimitMb))
      ? Math.max(64, Math.min(512, Math.round(Number(memoryLimitMb))))
      : 256;

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
        timeLimitMs: safeTimeLimit,
        memoryLimitMb: safeMemoryLimit,
        checkerType: normalizeCheckerType(checkerType),
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

// ─── Global Problem Bank Tags & Tier Counts ───
router.get("/tags", authenticate, async (req: Request, res: Response) => {
  try {
    const status = query(req, "status");
    const { role } = req.user!;
    const where: any =
      role === "student"
        ? { status: "published" }
        : status
          ? { status }
          : { status: { not: "archived" } };

    const problems = await prisma.problem.findMany({
      where,
      select: { difficulty: true, tags: { select: { tag: true } } },
    });

    const difficulties = { easy: 0, medium: 0, hard: 0 };
    const tagMap = new Map<string, number>();
    const tierMap = new Map<string, number>(TIER_TAGS.map((t) => [t, 0]));

    for (const p of problems) {
      if (p.difficulty === "easy") difficulties.easy++;
      else if (p.difficulty === "hard") difficulties.hard++;
      else difficulties.medium++;

      const seen = new Set<string>();
      for (const row of p.tags) {
        const t = row.tag.trim();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        const low = t.toLowerCase();
        if (TIER_TAG_SET.has(low)) {
          tierMap.set(low, (tierMap.get(low) || 0) + 1);
        } else {
          tagMap.set(t, (tagMap.get(t) || 0) + 1);
        }
      }
    }

    const tiers = TIER_TAGS.map((tag) => ({ tag, count: tierMap.get(tag) || 0 })).filter((x) => x.count > 0);
    const tags = Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "vi"))
      .slice(0, 35);

    res.json({ total: problems.length, difficulties, tiers, tags });
  } catch {
    res.status(500).json({ error: "Không thể tải danh sách chủ đề" });
  }
});

// ─── CP Roadmap (4 Tiers across 190+ problems) ───
router.get("/roadmap", authenticate, async (req: Request, res: Response) => {
  try {
    const roadmap = await buildCpRoadmap(req.user!.userId, req.user!.role);
    res.json(roadmap);
  } catch (err) {
    console.error("cp roadmap error:", err);
    res.status(500).json({ error: "Không thể tải lộ trình CP" });
  }
});

// ─── Prev / Next Neighbor Navigation for a Problem ───
router.get("/:id/neighbors", authenticate, async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const neighbors = await getProblemNeighbors(id, req.user!.role);
    if (!neighbors) {
      res.status(404).json({ error: "Problem not found" });
      return;
    }
    res.json(neighbors);
  } catch {
    res.status(500).json({ error: "Không thể tải bài kế tiếp" });
  }
});

// ─── Teacher: danh sách & import gói đề lập trình thi đấu ───
router.get("/packs", authenticate, requireRole("admin", "teacher"), async (_req: Request, res: Response) => {
  try {
    const packs = await listBuiltInPacks();
    res.json({ packs });
  } catch {
    res.status(500).json({ error: "Không thể tải danh sách gói đề" });
  }
});

router.post("/import-pack", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const { packId, packIds, pack, mode, publish } = req.body || {};
    const importMode = mode === "upsert" ? "upsert" : "skip";
    const shouldPublish = publish !== false;
    const authorId = req.user!.userId;

    const results = [];
    if (Array.isArray(packIds) && packIds.length > 0) {
      for (const pid of packIds) {
        if (typeof pid !== "string") continue;
        const loaded = loadBuiltInPack(pid);
        results.push(await importProblemPack(loaded, authorId, { mode: importMode, publish: shouldPublish }));
      }
    } else if (typeof packId === "string" && packId.trim()) {
      const loaded = loadBuiltInPack(packId.trim());
      results.push(await importProblemPack(loaded, authorId, { mode: importMode, publish: shouldPublish }));
    } else if (pack) {
      results.push(await importProblemPack(pack, authorId, { mode: importMode, publish: shouldPublish }));
    } else {
      res.status(400).json({ error: "Cần truyền packId, packIds hoặc nội dung gói đề JSON (pack)" });
      return;
    }

    const summary = results.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        created: acc.created + r.created,
        updated: acc.updated + r.updated,
        skipped: acc.skipped + r.skipped,
      }),
      { total: 0, created: 0, updated: 0, skipped: 0 },
    );

    res.json({ ok: true, results, summary });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Import gói đề thất bại" });
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
        ...(typeof t.subtask === "number" && Number.isFinite(t.subtask) && t.subtask > 0
          ? { subtask: Math.floor(t.subtask) }
          : {}),
        ...(typeof t.points === "number" && Number.isFinite(t.points) && t.points > 0
          ? { points: t.points }
          : {}),
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
      timeLimitMs, memoryLimitMb, checkerType,
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
        ...(timeLimitMs !== undefined && Number.isFinite(Number(timeLimitMs)) && {
          timeLimitMs: Math.max(500, Math.min(10_000, Math.round(Number(timeLimitMs)))),
        }),
        ...(memoryLimitMb !== undefined && Number.isFinite(Number(memoryLimitMb)) && {
          memoryLimitMb: Math.max(64, Math.min(512, Math.round(Number(memoryLimitMb)))),
        }),
        ...(checkerType !== undefined && { checkerType: normalizeCheckerType(checkerType) }),
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
