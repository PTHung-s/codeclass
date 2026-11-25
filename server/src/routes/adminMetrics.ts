import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { collectMetrics } from "../utils/metrics";

const router = Router();

// Staff-only: teachers watch this while teaching to tell "the server is slow"
// apart from "my own connection is slow". It exposes no student data — only
// process counters — so teaching assistants are included.
router.get(
  "/admin/metrics",
  authenticate,
  requireRole("admin", "teacher", "teaching_assistant"),
  (_req, res) => {
    try {
      res.json(collectMetrics());
    } catch (err: any) {
      res.status(500).json({ error: "Failed to collect metrics", detail: err?.message || String(err) });
    }
  },
);

export default router;
