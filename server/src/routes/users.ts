import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, paginate } from "../utils/routeHelpers";

const router = Router();

router.get("/", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    // Always bound the list — pickers used to request limit=300; hard cap 200.
    // When neither page nor limit is sent, still return a capped array for legacy clients.
    const pg = paginate(req, { defaultLimit: 50, maxLimit: 200 });
    const roleFilter = typeof req.query.role === "string" ? req.query.role : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const where: any = {};
    if (roleFilter) where.role = roleFilter;
    if (search) {
      where.OR = [
        { fullName: { contains: search } },
        { email: { contains: search } },
        { nickname: { contains: search } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, fullName: true, email: true, role: true,
        avatarUrl: true, status: true, createdAt: true, lastLoginAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.limit,
    });

    if (pg.hasPagination) {
      const total = await prisma.user.count({ where });
      res.json(pg.envelope("users", users, total));
    } else {
      res.json(users);
    }
  } catch {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/:id", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, fullName: true, email: true, role: true,
        avatarUrl: true, phone: true, bio: true, status: true,
        createdAt: true, lastLoginAt: true,
        courseMembers: {
          include: { course: { select: { id: true, title: true } } },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.patch("/:id", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { fullName, role, status, phone, bio } = req.body;
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(fullName !== undefined && { fullName }),
        ...(role !== undefined && { role }),
        ...(status !== undefined && { status }),
        ...(phone !== undefined && { phone }),
        ...(bio !== undefined && { bio }),
      },
      select: { id: true, fullName: true, email: true, role: true, status: true },
    });
    res.json(user);
  } catch {
    res.status(500).json({ error: "Failed to update user" });
  }
});

export default router;
