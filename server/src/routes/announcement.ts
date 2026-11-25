/**
 * Public (authenticated) announcement endpoint — the global popup reads this so
 * admins can edit the message / showing rules without redeploying.
 */
import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { loadAnnouncement } from "../services/systemSettings";

const router = Router();
router.use(authenticate);

router.get("/", async (_req: Request, res: Response) => {
  try {
    const cfg = await loadAnnouncement();
    res.json({
      enabled: cfg.enabled,
      mode: cfg.mode,
      timesPerDay: cfg.timesPerDay,
      title: cfg.title,
      body: cfg.body,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Không tải được thông báo." });
  }
});

export default router;