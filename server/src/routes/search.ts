import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import { query } from "../utils/routeHelpers";

const router = Router();

router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const q = query(req, "q");
    if (!q || q.length < 2) {
      res.json({ lessons: [], problems: [] });
      return;
    }

    const { role } = req.user!;
    const search = q.trim();
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));

    // Search lessons (all courses visible to everyone)
    const lessonWhere: any = {
      title: { contains: search },
      status: { not: "archived" },
    };

    // Search problems
    let problemWhere: any = {
      OR: [
        { title: { contains: search } },
        { shortDescription: { contains: search } },
      ],
    };
    if (role === "student") {
      problemWhere.status = "published";
    } else {
      problemWhere.status = { not: "archived" };
    }

    const [lessons, problems] = await Promise.all([
      prisma.lesson.findMany({
        where: lessonWhere,
        select: {
          id: true, title: true, module: { select: { id: true, title: true } },
          course: { select: { id: true, title: true } },
        },
        take: limit,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.problem.findMany({
        where: problemWhere,
        select: {
          id: true, title: true, difficulty: true,
          tags: { select: { tag: true } },
        },
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({ lessons, problems });
  } catch {
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
