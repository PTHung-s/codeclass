import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, query } from "../utils/routeHelpers";

const router = Router();

// GET /api/bug-reports - List bug reports
// Students see only their own. Teachers/admins see all.
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const status = query(req, "status");
    const courseId = query(req, "courseId");

    console.log("[bug-reports] GET userId=", userId, "role=", role);

    const where: any = {};

    if (role === "student") {
      where.reportedById = userId;
      console.log("[bug-reports] filtering by reportedById =", userId);
    }

    if (status) {
      where.status = status;
    }

    if (courseId) {
      where.courseId = courseId;
    }

    // Count total reports in DB (no filter) for debugging
    const totalInDb = await prisma.bugReport.count();
    console.log("[bug-reports] totalInDb=", totalInDb, "where=", JSON.stringify(where));

    const reports = await prisma.bugReport.findMany({
      where,
      include: {
        reportedBy: { select: { id: true, fullName: true, nickname: true, email: true, role: true } },
        assignedTo: { select: { id: true, fullName: true, email: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    console.log("[bug-reports] returning", reports.length, "reports");

    // Parse images JSON for each report
    const parsed = reports.map((r) => ({
      ...r,
      images: safeParseJSON(r.images, []),
    }));

    res.json(parsed);
  } catch (err: any) {
    console.error("[bug-reports] GET ERROR:", err?.message, err?.code, err?.meta);
    res.status(500).json({ error: err.message || "Failed to fetch bug reports" });
  }
});

// GET /api/bug-reports/:id - Get single bug report
router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { userId, role } = req.user!;

    const report = await prisma.bugReport.findUnique({
      where: { id },
      include: {
        reportedBy: { select: { id: true, fullName: true, nickname: true, email: true, role: true } },
        assignedTo: { select: { id: true, fullName: true, email: true } },
        course: { select: { id: true, title: true } },
      },
    });

    if (!report) {
      res.status(404).json({ error: "Bug report not found" });
      return;
    }

    if (role === "student" && report.reportedById !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    res.json({
      ...report,
      images: safeParseJSON(report.images, []),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch bug report" });
  }
});

// POST /api/bug-reports - Create bug report (students, teachers)
router.post("/", authenticate, async (req: Request, res: Response) => {
  try {
    const { userId } = req.user!;
    const { title, description, images, courseId } = req.body;

    if (!title || !title.trim()) {
      res.status(400).json({ error: "Tiêu đề không được để trống" });
      return;
    }
    if (!description || !description.trim()) {
      res.status(400).json({ error: "Mô tả không được để trống" });
      return;
    }

    const imageArray = Array.isArray(images) ? images : [];

    const report = await prisma.bugReport.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        images: JSON.stringify(imageArray),
        reportedById: userId,
        courseId: courseId || null,
      },
      include: {
        reportedBy: { select: { id: true, fullName: true, nickname: true } },
        course: { select: { id: true, title: true } },
      },
    });

    res.status(201).json({
      ...report,
      images: imageArray,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create bug report" });
  }
});

// PATCH /api/bug-reports/:id - Update bug report (teachers/admins assign, resolve, change status)
router.patch("/:id", authenticate, requireRole("teacher", "admin", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { userId, role } = req.user!;
    const { status, priority, assignedToId, resolution } = req.body;

    const existing = await prisma.bugReport.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Bug report not found" });
      return;
    }

    // Only admin or assigned teacher can update
    if (role !== "admin" && existing.assignedToId && existing.assignedToId !== userId) {
      res.status(403).json({ error: "Bạn không được phân công xử lý báo cáo này" });
      return;
    }

    const data: any = {};
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;
    if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
    if (resolution !== undefined) data.resolution = resolution;

    if (status === "resolved" || status === "closed") {
      data.resolvedAt = new Date();
    }

    if (status === "open") {
      data.resolvedAt = null;
    }

    // If assigning to self
    if (assignedToId === undefined && status === "in_progress" && !existing.assignedToId) {
      data.assignedToId = userId;
    }

    const report = await prisma.bugReport.update({
      where: { id },
      data,
      include: {
        reportedBy: { select: { id: true, fullName: true, nickname: true, email: true } },
        assignedTo: { select: { id: true, fullName: true } },
        course: { select: { id: true, title: true } },
      },
    });

    // Gamification: reward the reporter when their bug is resolved
    const isNowResolved = status === "resolved" || status === "closed";
    const wasResolved = existing.status === "resolved" || existing.status === "closed";
    if (isNowResolved && !wasResolved) {
      import("../utils/tokens")
        .then(({ awardBugReportTokens }) => awardBugReportTokens(existing.reportedById, id, existing.title))
        .catch(() => {});
    }

    res.json({
      ...report,
      images: safeParseJSON(report.images, []),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update bug report" });
  }
});

// DELETE /api/bug-reports/:id - Delete bug report (admin only, or reporter if still open)
router.delete("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { userId, role } = req.user!;

    const existing = await prisma.bugReport.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Bug report not found" });
      return;
    }

    const isStaff = role === "teacher" || role === "admin" || role === "teaching_assistant";
    if (!isStaff && existing.reportedById !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (!isStaff && existing.status !== "open") {
      res.status(400).json({ error: "Chỉ có thể xóa báo cáo đang ở trạng thái mở" });
      return;
    }

    await prisma.bugReport.delete({ where: { id } });
    res.json({ message: "Bug report deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete bug report" });
  }
});

function safeParseJSON(str: string, fallback: any): any {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export default router;
