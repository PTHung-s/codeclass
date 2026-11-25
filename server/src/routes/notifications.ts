import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import { param } from "../utils/routeHelpers";
import { notifyNotificationChanged } from "../services/notificationEvents";

const router = Router();

router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json(notifications);
  } catch {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.patch("/:id/read", authenticate, async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const notification = await prisma.notification.findUnique({ where: { id } });

    if (!notification) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    if (notification.userId !== req.user!.userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    await prisma.notification.update({ where: { id }, data: { isRead: true } });
    notifyNotificationChanged(req.user!.userId);
    res.json({ message: "Marked as read" });
  } catch {
    res.status(500).json({ error: "Failed to update notification" });
  }
});

router.patch("/read-all", authenticate, async (req: Request, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, isRead: false },
      data: { isRead: true },
    });
    notifyNotificationChanged(req.user!.userId);

    res.json({ message: "All marked as read" });
  } catch {
    res.status(500).json({ error: "Failed to update notifications" });
  }
});

export default router;
