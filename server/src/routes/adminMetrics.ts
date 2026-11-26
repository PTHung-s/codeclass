import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { collectMetrics } from "../utils/metrics";
import {
  createDatabaseBackup,
  getValidatedBackupPath,
  listDatabaseBackups,
} from "../services/dbBackupService";

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

router.get("/admin/backups", authenticate, requireRole("admin"), async (_req, res) => {
  try {
    res.json(await listDatabaseBackups());
  } catch (err: any) {
    res.status(500).json({ error: "Không tải được danh sách sao lưu", detail: err?.message || String(err) });
  }
});

router.post("/admin/backups", authenticate, requireRole("admin"), async (_req, res) => {
  try {
    const created = await createDatabaseBackup("manual");
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: "Không tạo được bản sao lưu", detail: err?.message || String(err) });
  }
});

router.get("/admin/backups/:filename/download", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const filename = String(req.params.filename || "");
    const fullPath = await getValidatedBackupPath(filename);
    if (!fullPath) {
      res.status(404).json({ error: "Không tìm thấy tệp sao lưu hợp lệ" });
      return;
    }
    res.download(fullPath, filename);
  } catch (err: any) {
    res.status(500).json({ error: "Không tải được tệp sao lưu", detail: err?.message || String(err) });
  }
});

export default router;
