import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, query, paginate } from "../utils/routeHelpers";

const router = Router();

function canManageMaterials(role: string): boolean {
  return role === "admin" || role === "teacher" || role === "teaching_assistant";
}

router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const search = query(req, "search");
    const type = query(req, "type");
    const courseId = query(req, "courseId");
    const { userId, role } = req.user!;
    const pg = paginate(req);

    const where: any = {};

    if (role === "student") {
      where.visibility = "student-visible";
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (type) {
      where.type = type;
    }

    // No course-member gate: Material already has its own visibility field
    // ("student-visible" is the default, student-only filtering happens at line 25).
    // Lifting the gate lets a student browse the materials of any course they
    // can already see elsewhere (assignments, lessons), and keeps the API
    // honest: a 403 here would mean "exists but you cannot look", which is
    // different from "exists and is hidden from you".

    const materials = await prisma.material.findMany({
      where,
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      ...pg.clause,
    });

    if (pg.hasPagination) {
      const total = await prisma.material.count({ where });
      res.json(pg.envelope("materials", materials, total));
    } else {
      res.json(materials);
    }
  } catch {
    res.status(500).json({ error: "Failed to fetch materials" });
  }
});

router.post("/", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const { title, description, type, fileUrl, linkUrl, visibility } = req.body;

    if (!title || !type) {
      res.status(400).json({ error: "Title and type are required" });
      return;
    }

    const material = await prisma.material.create({
      data: {
        title,
        description,
        type,
        fileUrl,
        linkUrl,
        visibility: visibility || "student-visible",
        createdById: req.user!.userId,
      },
    });

    res.status(201).json(material);
  } catch {
    res.status(500).json({ error: "Failed to create material" });
  }
});

router.get("/collections", authenticate, async (req: Request, res: Response) => {
  try {
    const search = query(req, "search");
    const type = query(req, "type");
    const { role } = req.user!;
    const where: any = {};

    if (role === "student") {
      where.visibility = "student-visible";
    }

    if (type) {
      where.type = type;
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const collections = await prisma.materialCollection.findMany({
      where,
      include: {
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { items: true } },
        items: {
          orderBy: { orderIndex: "asc" },
          take: 6,
          select: { id: true, title: true, type: true, metadata: true, problemId: true, materialId: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    res.json(collections);
  } catch (error) {
    console.error("Failed to fetch material collections", error);
    res.status(500).json({ error: "Failed to fetch material collections" });
  }
});

router.post("/collections", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const { title, slug, description, type, coverUrl, visibility } = req.body;

    if (!title || !slug) {
      res.status(400).json({ error: "Title and slug are required" });
      return;
    }

    const collection = await prisma.materialCollection.create({
      data: {
        title,
        slug,
        description,
        type: type || "collection",
        coverUrl,
        visibility: visibility || "student-visible",
        createdById: req.user!.userId,
      },
    });

    res.status(201).json(collection);
  } catch (error) {
    console.error("Failed to create material collection", error);
    res.status(500).json({ error: "Failed to create material collection" });
  }
});

router.get("/collections/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const collection = await prisma.materialCollection.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        items: {
          orderBy: { orderIndex: "asc" },
          include: {
            material: true,
            problem: {
              select: {
                id: true,
                title: true,
                shortDescription: true,
                difficulty: true,
                estimatedTime: true,
                status: true,
                tags: { select: { tag: true } },
              },
            },
          },
        },
      },
    });

    if (!collection) {
      res.status(404).json({ error: "Material collection not found" });
      return;
    }

    if (req.user!.role === "student" && collection.visibility !== "student-visible") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    res.json(collection);
  } catch (error) {
    console.error("Failed to fetch material collection", error);
    res.status(500).json({ error: "Failed to fetch material collection" });
  }
});

router.post("/collections/:id/items", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { materialId, problemId, title, description, type, sourceUrl, orderIndex, metadata } = req.body;
    const collection = await prisma.materialCollection.findFirst({ where: { OR: [{ id }, { slug: id }] } });

    if (!collection) {
      res.status(404).json({ error: "Material collection not found" });
      return;
    }

    if (!canManageMaterials(req.user!.role) || (req.user!.role !== "admin" && collection.createdById !== req.user!.userId)) {
      res.status(403).json({ error: "Only the creator can add items" });
      return;
    }

    if (!title || !type) {
      res.status(400).json({ error: "Title and type are required" });
      return;
    }

    const item = await prisma.materialItem.create({
      data: {
        collectionId: collection.id,
        materialId,
        problemId,
        title,
        description,
        type,
        sourceUrl,
        orderIndex: Number.isFinite(Number(orderIndex)) ? Number(orderIndex) : 0,
        metadata: metadata === undefined ? undefined : typeof metadata === "string" ? metadata : JSON.stringify(metadata),
      },
    });

    res.status(201).json(item);
  } catch (error) {
    console.error("Failed to create material item", error);
    res.status(500).json({ error: "Failed to create material item" });
  }
});

router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const material = await prisma.material.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    if (!material) {
      res.status(404).json({ error: "Material not found" });
      return;
    }

    if (req.user!.role === "student" && material.visibility !== "student-visible") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    res.json(material);
  } catch {
    res.status(500).json({ error: "Failed to fetch material" });
  }
});

router.patch("/:id", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const material = await prisma.material.findUnique({ where: { id } });

    if (!material) {
      res.status(404).json({ error: "Material not found" });
      return;
    }

    if (req.user!.role !== "admin" && material.createdById !== req.user!.userId) {
      res.status(403).json({ error: "Only the creator can edit" });
      return;
    }

    const { title, description, type, fileUrl, linkUrl, visibility } = req.body;
    const updated = await prisma.material.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(type !== undefined && { type }),
        ...(fileUrl !== undefined && { fileUrl }),
        ...(linkUrl !== undefined && { linkUrl }),
        ...(visibility !== undefined && { visibility }),
      },
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update material" });
  }
});

router.delete("/:id", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const material = await prisma.material.findUnique({ where: { id } });

    if (!material) {
      res.status(404).json({ error: "Material not found" });
      return;
    }

    await prisma.material.delete({ where: { id } });
    res.json({ message: "Material deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete material" });
  }
});

router.post("/courses/:courseId/materials", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "courseId");
    const { materialId } = req.body;

    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const link = await prisma.courseMaterial.create({
      data: { courseId, materialId },
    });

    res.status(201).json(link);
  } catch {
    res.status(500).json({ error: "Failed to attach material" });
  }
});

router.post("/lessons/:lessonId/materials", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const lessonId = param(req, "lessonId");
    const { materialId } = req.body;

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { course: true } });
    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }

    const link = await prisma.lessonMaterial.create({
      data: { lessonId, materialId },
    });

    res.status(201).json(link);
  } catch {
    res.status(500).json({ error: "Failed to attach material" });
  }
});

export default router;
