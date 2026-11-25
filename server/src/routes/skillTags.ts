import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { param } from "../utils/routeHelpers";
import prisma from "../utils/prisma";
import { SKILL_SEEDS } from "../utils/skillGraph";
import {
  enrichAllUntagged,
  getPendingReview,
  approveItem,
  rejectItem,
  deleteItem,
  bulkApproveAll,
  getTagStats,
} from "../services/skillTagEnrichment";

const router = Router();
router.use(authenticate);
router.use(requireRole("teacher", "admin", "teaching_assistant"));

// ── Manual skill-tag mappings (SkillTagMapping) ──
// Legacy content without a skillId column (in-lesson challenges, code-duel
// rounds, session-quiz questions) is tagged here once by staff; every student
// action afterwards emits skill evidence through the unified sink.
const MAPPING_SCOPES = ["challenge", "code_duel_round", "session_quiz_question"] as const;
const VALID_SKILLS = new Set(SKILL_SEEDS.map((s) => s.skillId));

// GET /api/skill-tags/mappings?scope=challenge — list mappings for a scope
router.get("/mappings", async (req: Request, res: Response) => {
  try {
    const scope = String(req.query.scope || "");
    if (!MAPPING_SCOPES.includes(scope as any)) {
      res.status(400).json({ error: `scope phải là một trong: ${MAPPING_SCOPES.join(", ")}` });
      return;
    }
    const mappings = await prisma.skillTagMapping.findMany({
      where: { scope },
      orderBy: { updatedAt: "desc" },
    });
    res.json(mappings);
  } catch (err) {
    console.error("list mappings error:", err);
    res.status(500).json({ error: "Không thể tải danh sách mapping." });
  }
});

// POST /api/skill-tags/mappings — upsert {scope, refKey, skillId}
router.post("/mappings", async (req: Request, res: Response) => {
  try {
    const scope = String(req.body?.scope || "");
    const refKey = String(req.body?.refKey || "").trim();
    const skillId = String(req.body?.skillId || "").trim();
    if (!MAPPING_SCOPES.includes(scope as any)) {
      res.status(400).json({ error: `scope phải là một trong: ${MAPPING_SCOPES.join(", ")}` });
      return;
    }
    if (!refKey || refKey.length > 300) {
      res.status(400).json({ error: "refKey không hợp lệ." });
      return;
    }
    if (!VALID_SKILLS.has(skillId)) {
      res.status(400).json({ error: `skillId không hợp lệ: ${skillId}` });
      return;
    }
    const mapping = await prisma.skillTagMapping.upsert({
      where: { scope_refKey: { scope, refKey } },
      create: { scope, refKey, skillId, status: "approved" },
      update: { skillId, status: "approved" },
    });
    res.json(mapping);
  } catch (err) {
    console.error("upsert mapping error:", err);
    res.status(500).json({ error: "Không thể lưu mapping." });
  }
});

// DELETE /api/skill-tags/mappings/:id — remove a mapping (content stops emitting evidence)
router.delete("/mappings/:id", async (req: Request, res: Response) => {
  try {
    await prisma.skillTagMapping.delete({ where: { id: param(req, "id") } });
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "P2025") {
      res.status(404).json({ error: "Không tìm thấy mapping." });
      return;
    }
    console.error("delete mapping error:", err);
    res.status(500).json({ error: "Không thể xóa mapping." });
  }
});

// ── GET /api/skill-tags/stats — counts per status ──
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getTagStats();
    res.json(stats);
  } catch (err: any) {
    console.error("tag stats error:", err);
    res.status(500).json({ error: "Không thể tải thống kê." });
  }
});

// ── GET /api/skill-tags/pending — items awaiting review ──
router.get("/pending", async (req: Request, res: Response) => {
  try {
    const type = req.query.type === "problem" ? "problem" : req.query.type === "quiz" ? "quiz" : undefined;
    const limit = Math.min(100, Number(req.query.limit) || 30);
    const items = await getPendingReview({ type, limit });
    res.json(items);
  } catch (err: any) {
    console.error("pending tags error:", err);
    res.status(500).json({ error: "Không thể tải danh sách." });
  }
});

// ── POST /api/skill-tags/enrich — trigger AI enrichment (background) ──
router.post("/enrich", async (req: Request, res: Response) => {
  try {
    // Respond immediately, run enrichment in background (can take minutes)
    res.json({ ok: true, message: "Đang chạy AI enrich ngược — làm mới sau 1-2 phút." });
    enrichAllUntagged().catch((err) => console.error("enrich error:", err));
  } catch (err: any) {
    console.error("trigger enrich error:", err);
    res.status(500).json({ error: "Không thể chạy enrich." });
  }
});

// ── POST /api/skill-tags/:type/:id/approve — approve with AI suggestion or override ──
router.post("/:type/:id/approve", async (req: Request, res: Response) => {
  try {
    const type = req.params.type === "problem" ? "problem" : "quiz";
    const skillId = String(req.body.skillId || "");
    if (!skillId) {
      res.status(400).json({ error: "Cần skillId." });
      return;
    }
    await approveItem(type, param(req, "id"), skillId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("approve tag error:", err);
    res.status(400).json({ error: err.message || "Không thể duyệt." });
  }
});

// ── POST /api/skill-tags/:type/:id/reject — reject AI suggestion ──
router.post("/:type/:id/reject", async (req: Request, res: Response) => {
  try {
    const type = req.params.type === "problem" ? "problem" : "quiz";
    await rejectItem(type, param(req, "id"));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("reject tag error:", err);
    res.status(400).json({ error: "Không thể từ chối." });
  }
});

// DELETE /api/skill-tags/:type/:id — remove bad content from active review/content lists
router.delete("/:type/:id", async (req: Request, res: Response) => {
  try {
    const type = req.params.type === "problem" ? "problem" : req.params.type === "quiz" ? "quiz" : null;
    if (!type) {
      res.status(400).json({ error: "Loại nội dung không hợp lệ." });
      return;
    }
    await deleteItem(type, param(req, "id"));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("delete skill review item error:", err);
    res.status(400).json({ error: err.message || "Không thể xóa nội dung." });
  }
});

// ── POST /api/skill-tags/bulk-approve — approve ALL pending in one click ──
router.post("/bulk-approve", async (_req: Request, res: Response) => {
  try {
    const result = await bulkApproveAll();
    res.json({ ok: true, approved: result.approved });
  } catch (err: any) {
    console.error("bulk approve error:", err);
    res.status(500).json({ error: "Không thể duyệt hàng loạt." });
  }
});

export default router;
