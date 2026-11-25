import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, checkCourseAccess, paginate } from "../utils/routeHelpers";

const router = Router();
const COURSE_STATUSES = new Set(["draft", "active", "archived"]);

function validCourseStatus(status: unknown): status is "draft" | "active" | "archived" {
  return typeof status === "string" && COURSE_STATUSES.has(status);
}

router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const { role } = req.user!;
    const pg = paginate(req);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";

    let where: any = {};
    if (role === "student") {
      // Students see all active courses (no membership gating)
      where = { status: "active" };
    } else if (status && status !== "all") {
      // "current" = everything still in use (not archived)
      where.status = status === "current" ? { not: "archived" } : status;
    }
    if (search) {
      where.title = { contains: search };
    }

    const courses = await prisma.course.findMany({
      where,
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      ...pg.clause,
    });

    if (pg.hasPagination) {
      const total = await prisma.course.count({ where });
      res.json(pg.envelope("courses", courses, total));
    } else {
      res.json(courses);
    }
  } catch {
    res.status(500).json({ error: "Failed to fetch courses" });
  }
});

router.post("/", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const { title, description, coverImageUrl, startDate, endDate, visibility, kind, status } = req.body;

    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    if (status !== undefined && !validCourseStatus(status)) {
      res.status(400).json({ error: "Trạng thái khóa học không hợp lệ" });
      return;
    }

    const course = await prisma.course.create({
      data: {
        title,
        description,
        coverImageUrl,
        ownerId: req.user!.userId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        visibility: visibility || "private",
        kind: kind === "session" ? "session" : "content",
        ...(status !== undefined && { status }),
      },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
      },
    });

    res.status(201).json(course);
  } catch {
    res.status(500).json({ error: "Failed to create course" });
  }
});

router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const courseId = param(req, "id");

    if (role !== "admin") {
      const access = await checkCourseAccess(userId, role, courseId);
      if (!access) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        modules: { orderBy: { orderIndex: "asc" } },
      },
    });

    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.json(course);
  } catch {
    res.status(500).json({ error: "Failed to fetch course" });
  }
});

router.patch("/:id", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "id");
    const course = await prisma.course.findUnique({ where: { id: courseId } });

    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const { title, description, coverImageUrl, status, visibility, startDate, endDate } = req.body;
    if (status !== undefined && !validCourseStatus(status)) {
      res.status(400).json({ error: "Trạng thái khóa học không hợp lệ" });
      return;
    }
    const updated = await prisma.course.update({
      where: { id: courseId },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(coverImageUrl !== undefined && { coverImageUrl }),
        ...(status !== undefined && { status }),
        ...(visibility !== undefined && { visibility }),
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
      },
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update course" });
  }
});

router.delete("/:id", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "id");
    const course = await prisma.course.findUnique({ where: { id: courseId } });

    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    await prisma.course.update({ where: { id: courseId }, data: { status: "archived" } });
    res.json({ message: "Course archived" });
  } catch {
    res.status(500).json({ error: "Failed to delete course" });
  }
});

export default router;
