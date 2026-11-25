/**
 * Admin-only system settings API — LLM provider config + connection test.
 * Values saved here override environment variables at runtime (30s cache).
 */
import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { chatCompletion } from "../utils/llmClient";
import {
  loadLlmConfig,
  setSetting,
  deleteSetting,
  listSettings,
  loadAnnouncement,
  saveAnnouncement,
  parseAnnouncement,
  AnnouncementConfig,
} from "../services/systemSettings";

const router = Router();
router.use(authenticate);
router.use(requireRole("admin"));

const LLM_KEYS = [
  "llm.primary",
  "llm.vilao.apiKey",
  "llm.vilao.baseUrl",
  "llm.vilao.model",
  "llm.deepseek.apiKey",
  "llm.deepseek.model",
  "llm.deepseek.baseUrl",
] as const;

function maskKey(key: string | undefined | null): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 5)}…${key.slice(-4)}`;
}

// ── GET / — current config (keys masked) + raw override list ──
router.get("/", async (_req: Request, res: Response) => {
  try {
    const cfg = await loadLlmConfig(true);
    const overrides = await listSettings();
    res.json({
      primary: cfg.primary,
      vilao: {
        baseUrl: cfg.vilao.baseUrl,
        model: cfg.vilao.model,
        apiKeyMasked: cfg.vilao.apiKey ? maskKey(cfg.vilao.apiKey) : "",
        hasKey: Boolean(cfg.vilao.apiKey),
        source: cfg.vilao.source,
      },
      deepseek: {
        baseUrl: cfg.deepseek.baseUrl,
        model: cfg.deepseek.model,
        apiKeyMasked: cfg.deepseek.apiKey ? maskKey(cfg.deepseek.apiKey) : "",
        hasKey: Boolean(cfg.deepseek.apiKey),
        source: cfg.deepseek.source,
      },
      overrides: overrides
        .filter((o) => (LLM_KEYS as readonly string[]).includes(o.key))
        .map((o) => ({
          key: o.key,
          value: o.key.endsWith("apiKey") ? maskKey(o.value) : o.value,
          updatedAt: o.updatedAt,
          updatedBy: o.updatedBy,
        })),
    });
  } catch (err: any) {
    console.error("admin-settings GET error:", err);
    res.status(500).json({ error: err?.message || "Không tải được cấu hình." });
  }
});

// ── PUT /llm — update settings. Empty string = keep current; "__clear__" = remove override ──
router.put("/llm", async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const userId = req.user!.userId;
    const updates: { key: string; value: string }[] = [];
    const clears: string[] = [];

    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

    if (str(b.primary)) {
      if (b.primary !== "vilao" && b.primary !== "deepseek") {
        res.status(400).json({ error: "primary phải là 'vilao' hoặc 'deepseek'." });
        return;
      }
      updates.push({ key: "llm.primary", value: b.primary });
    }
    const pairs: [string, unknown][] = [
      ["llm.vilao.apiKey", b.vilaoApiKey],
      ["llm.vilao.baseUrl", b.vilaoBaseUrl],
      ["llm.vilao.model", b.vilaoModel],
      ["llm.deepseek.apiKey", b.deepseekApiKey],
      ["llm.deepseek.model", b.deepseekModel],
      ["llm.deepseek.baseUrl", b.deepseekBaseUrl],
    ];
    for (const [key, raw] of pairs) {
      const v = str(raw);
      if (v === "__clear__") clears.push(key);
      else if (v) updates.push({ key, value: v });
    }

    for (const u of updates) await setSetting(u.key, u.value, userId);
    for (const k of clears) await deleteSetting(k);

    const cfg = await loadLlmConfig(true);
    res.json({
      ok: true,
      updated: updates.length,
      cleared: clears.length,
      effective: {
        primary: cfg.primary,
        vilaoModel: cfg.vilao.model,
        vilaoKeyMasked: maskKey(cfg.vilao.apiKey),
        deepseekModel: cfg.deepseek.model,
        deepseekKeyMasked: maskKey(cfg.deepseek.apiKey),
      },
    });
  } catch (err: any) {
    console.error("admin-settings PUT error:", err);
    res.status(500).json({ error: err?.message || "Không lưu được cấu hình." });
  }
});

// ── POST /test-llm — quick smoke test through the real client (incl. fallback) ──
router.post("/test-llm", async (_req: Request, res: Response) => {
  const started = Date.now();
  try {
    const result = await chatCompletion(
      [
        { role: "system", content: "Trả lời ngắn gọn bằng tiếng Việt." },
        { role: "user", content: "Trả lời đúng định dạng JSON: {\"ok\":true}" },
      ],
      { temperature: 0, max_tokens: 50, timeoutMs: 20000, response_format: { type: "json_object" } },
    );
    const latencyMs = Date.now() - started;
    if (!result) {
      res.json({ ok: false, latencyMs, error: "Tất cả provider đều thất bại." });
      return;
    }
    res.json({ ok: true, provider: result.provider, model: result.model, latencyMs, preview: result.content.slice(0, 120) });
  } catch (err: any) {
    res.json({ ok: false, latencyMs: Date.now() - started, error: err?.message || "Lỗi không xác định" });
  }
});

// ── DELETE /llm/override — remove ALL llm.* DB overrides (revert to .env) ──
router.delete("/llm/override", async (_req: Request, res: Response) => {
  try {
    const removed = await prisma.systemSetting.deleteMany({
      where: { key: { startsWith: "llm." } },
    });
    await loadLlmConfig(true);
    res.json({ ok: true, removed: removed.count });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Không xóa được override." });
  }
});

// ── GET /announcement ── get current announcement config (admin) ──
router.get("/announcement", async (_req: Request, res: Response) => {
  try {
    const cfg = await loadAnnouncement();
    res.json({ ...cfg, updatedBy: (await listSettings()).find((s) => s.key === "announcement")?.updatedBy ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Không tải được cấu hình thông báo." });
  }
});

// ── PUT /announcement ── update announcement config (admin) ──
router.put("/announcement", async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const current = await loadAnnouncement();
    const cfg: AnnouncementConfig = parseAnnouncement(JSON.stringify({
      enabled: typeof b.enabled === "boolean" ? b.enabled : current.enabled,
      mode: b.mode || current.mode,
      timesPerDay: b.timesPerDay ?? current.timesPerDay,
      title: typeof b.title === "string" ? b.title : current.title,
      body: typeof b.body === "string" ? b.body : current.body,
    }));
    await saveAnnouncement(cfg, req.user!.userId);
    res.json({ ok: true, config: cfg });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Không lưu được cấu hình thông báo." });
  }
});

export default router;
