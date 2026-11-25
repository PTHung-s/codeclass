import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, checkCourseAccess } from "../utils/routeHelpers";

const router = Router();

router.get("/courses/:courseId/modules", authenticate, async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "courseId");
    const { userId, role } = req.user!;

    if (role !== "admin") {
      const access = await checkCourseAccess(userId, role, courseId);
      if (!access) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    const modules = await prisma.module.findMany({
      where: { courseId },
      include: { _count: { select: { lessons: true } } },
      orderBy: { orderIndex: "asc" },
    });

    res.json(modules);
  } catch {
    res.status(500).json({ error: "Failed to fetch modules" });
  }
});

router.post("/courses/:courseId/modules", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "courseId");
    const { title, description, status } = req.body;

    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const maxOrder = await prisma.module.findFirst({
      where: { courseId },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });

    const module_ = await prisma.module.create({
      data: {
        courseId,
        title,
        description,
        status: status || "draft",
        orderIndex: (maxOrder?.orderIndex ?? -1) + 1,
      },
    });

    res.status(201).json(module_);
  } catch {
    res.status(500).json({ error: "Failed to create module" });
  }
});

router.patch("/modules/:id", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const module_ = await prisma.module.findUnique({ where: { id }, include: { course: true } });

    if (!module_) {
      res.status(404).json({ error: "Module not found" });
      return;
    }

    const { title, description, status, orderIndex } = req.body;
    const updated = await prisma.module.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(orderIndex !== undefined && { orderIndex }),
      },
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update module" });
  }
});

router.delete("/modules/:id", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const module_ = await prisma.module.findUnique({ where: { id }, include: { course: true } });

    if (!module_) {
      res.status(404).json({ error: "Module not found" });
      return;
    }

    await prisma.module.update({ where: { id }, data: { status: "archived" } });
    res.json({ message: "Module archived" });
  } catch {
    res.status(500).json({ error: "Failed to delete module" });
  }
});

export default router;
