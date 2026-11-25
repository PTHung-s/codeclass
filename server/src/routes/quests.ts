import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param } from "../utils/routeHelpers";
import { resolveQuests, claimQuest, nextReset } from "../utils/questEngine";

const router = Router();

// Get all quests + current user's progress
router.get("/quests", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const quests = await resolveQuests(userId);
    const dailyReset = nextReset("daily");
    const weeklyReset = nextReset("weekly");
    res.json({
      ...quests,
      dailyResetAt: dailyReset?.toISOString() ?? null,
      weeklyResetAt: weeklyReset?.toISOString() ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load quests" });
  }
});

// Claim quest reward
router.post("/quests/:id/claim", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const questId = param(req, "id");
    const result = await claimQuest(userId, questId);
    if (!result.success) {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to claim" });
  }
});

// ── Admin: quest CRUD ──

router.post(
  "/quests",
  authenticate,
  requireRole("admin", "teacher"),
  async (req: Request, res: Response) => {
    try {
      const { title, description, type, metric, target, tokenReward, icon, category, sortOrder, eventId } = req.body;
      if (!title || !type || !metric || !target || !tokenReward) {
        res.status(400).json({ error: "Thiếu trường bắt buộc" });
        return;
      }
      // eventId có thể null → rơi vào event "Tổng hợp" khi seed
      const quest = await prisma.quest.create({
        data: {
          title,
          description,
          type,
          metric,
          target: Number(target),
          tokenReward: Number(tokenReward),
          icon: icon || "🎯",
          category: category || "general",
          sortOrder: Number(sortOrder) || 0,
          eventId: eventId || null,
        },
      });
      res.status(201).json(quest);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to create quest" });
    }
  }
);

router.put(
  "/quests/:id",
  authenticate,
  requireRole("admin", "teacher"),
  async (req: Request, res: Response) => {
    try {
      const questId = param(req, "id");
      const { title, description, type, metric, target, tokenReward, icon, category, isActive, sortOrder, eventId } = req.body;
      const data: any = {};
      if (title !== undefined) data.title = title;
      if (description !== undefined) data.description = description;
      if (type !== undefined) data.type = type;
      if (metric !== undefined) data.metric = metric;
      if (target !== undefined) data.target = Number(target);
      if (tokenReward !== undefined) data.tokenReward = Number(tokenReward);
      if (icon !== undefined) data.icon = icon;
      if (category !== undefined) data.category = category;
      if (isActive !== undefined) data.isActive = isActive;
      if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);
      if (eventId !== undefined) data.eventId = eventId || null;
      const quest = await prisma.quest.update({ where: { id: questId }, data });
      res.json(quest);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update quest" });
    }
  }
);

router.delete(
  "/quests/:id",
  authenticate,
  requireRole("admin", "teacher"),
  async (req: Request, res: Response) => {
    try {
      await prisma.quest.update({ where: { id: param(req, "id") }, data: { isActive: false } });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to deactivate quest" });
    }
  }
);

// ── Admin: GameEvent CRUD ──

router.get(
  "/quests/events",
  authenticate,
  requireRole("admin", "teacher"),
  async (_req: Request, res: Response) => {
    try {
      const events = await prisma.gameEvent.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { quests: { select: { id: true, title: true, isActive: true } } },
      });
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load events" });
    }
  }
);

router.post(
  "/quests/events",
  authenticate,
  requireRole("admin", "teacher"),
  async (req: Request, res: Response) => {
    try {
      const { name, subtitle, icon, theme, startsAt, endsAt, sortOrder } = req.body;
      if (!name) {
        res.status(400).json({ error: "Tên sự kiện là bắt buộc" });
        return;
      }
      const event = await prisma.gameEvent.create({
        data: {
          name,
          subtitle: subtitle || null,
          icon: icon || "🎯",
          theme: theme || "indigo",
          startsAt: startsAt ? new Date(startsAt) : new Date(),
          endsAt: endsAt ? new Date(endsAt) : null,
          sortOrder: Number(sortOrder) || 0,
        },
      });
      res.status(201).json(event);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to create event" });
    }
  }
);

router.put(
  "/quests/events/:id",
  authenticate,
  requireRole("admin", "teacher"),
  async (req: Request, res: Response) => {
    try {
      const { name, subtitle, icon, theme, startsAt, endsAt, isActive, sortOrder } = req.body;
      const data: any = {};
      if (name !== undefined) data.name = name;
      if (subtitle !== undefined) data.subtitle = subtitle || null;
      if (icon !== undefined) data.icon = icon;
      if (theme !== undefined) data.theme = theme;
      if (startsAt !== undefined) data.startsAt = new Date(startsAt);
      if (endsAt !== undefined) data.endsAt = endsAt ? new Date(endsAt) : null;
      if (isActive !== undefined) data.isActive = isActive;
      if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);
      const event = await prisma.gameEvent.update({ where: { id: param(req, "id") }, data });
      res.json(event);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update event" });
    }
  }
);

router.delete(
  "/quests/events/:id",
  authenticate,
  requireRole("admin", "teacher"),
  async (req: Request, res: Response) => {
    try {
      await prisma.gameEvent.update({ where: { id: param(req, "id") }, data: { isActive: false } });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to deactivate event" });
    }
  }
);

export default router;
