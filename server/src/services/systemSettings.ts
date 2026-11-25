/**
 * System settings — admin-configurable key/value store (DB) with env fallback.
 *
 * LLM provider config precedence: DB (system_settings) > env var > built-in default.
 * A 30s in-memory cache keeps llmClient from hitting the DB on every call;
 * setSetting() invalidates it so changes apply within the next request.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export type LlmProviderConfig = {
  label: "primary" | "fallback";
  apiKey: string;
  baseUrl: string;
  model: string;
  source: "db" | "env" | "default";
};

export type LlmConfig = {
  primary: "vilao" | "deepseek";
  vilao: { apiKey: string; baseUrl: string; model: string; source: LlmProviderConfig["source"] };
  deepseek: { apiKey: string; baseUrl: string; model: string; source: LlmProviderConfig["source"] };
};

const CACHE_TTL_MS = 30_000;
let cache: { config: LlmConfig; loadedAt: number } | null = null;

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string, updatedBy?: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, updatedBy },
    update: { value, updatedBy },
  });
  cache = null; // invalidate
}

export async function deleteSetting(key: string): Promise<void> {
  await prisma.systemSetting.deleteMany({ where: { key } });
  cache = null;
}

export async function listSettings(): Promise<{ key: string; value: string; updatedAt: Date; updatedBy: string | null }[]> {
  return prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
}

/** Env fallbacks (what the app used before DB overrides existed). */
function envDefaults(): LlmConfig {
  return {
    primary: "vilao",
    vilao: {
      apiKey: process.env.VILAO_API_KEY || "",
      baseUrl: process.env.VILAO_BASE_URL || "https://api.vilao.ai/v1/chat/completions",
      model: process.env.VILAO_MODEL || "hpx/Qwen3.8-Max-agent",
      source: process.env.VILAO_API_KEY ? "env" : "default",
    },
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY || "",
      baseUrl: process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions",
      model: process.env.DEEPSEEK_FALLBACK_MODEL || "deepseek-chat",
      source: process.env.DEEPSEEK_API_KEY ? "env" : "default",
    },
  };
}

/** Load merged config: DB overrides on top of env defaults. */
export async function loadLlmConfig(force = false): Promise<LlmConfig> {
  if (!force && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.config;
  const base = envDefaults();
  const config: LlmConfig = {
    primary: base.primary,
    vilao: { ...base.vilao },
    deepseek: { ...base.deepseek },
  };
  try {
    const [primary, vKey, vUrl, vModel, dKey, dModel, dUrl] = await Promise.all([
      getSetting("llm.primary"),
      getSetting("llm.vilao.apiKey"),
      getSetting("llm.vilao.baseUrl"),
      getSetting("llm.vilao.model"),
      getSetting("llm.deepseek.apiKey"),
      getSetting("llm.deepseek.model"),
      getSetting("llm.deepseek.baseUrl"),
    ]);
    if (primary === "vilao" || primary === "deepseek") config.primary = primary;
    if (vKey) { config.vilao.apiKey = vKey; config.vilao.source = "db"; }
    if (vUrl) config.vilao.baseUrl = vUrl;
    if (vModel) { config.vilao.model = vModel; config.vilao.source = "db"; }
    if (dKey) { config.deepseek.apiKey = dKey; config.deepseek.source = "db"; }
    if (dUrl) config.deepseek.baseUrl = dUrl;
    if (dModel) { config.deepseek.model = dModel; config.deepseek.source = "db"; }
  } catch (err) {
    // DB unavailable → env defaults still work
    console.warn("[systemSettings] load failed, using env defaults:", (err as Error).message);
  }
  cache = { config, loadedAt: Date.now() };
  return config;
}

/** Sync accessor for hot paths (llmClient) — returns cached config or env defaults. */
export function getCachedLlmConfig(): LlmConfig {
  if (!cache) {
    cache = { config: envDefaults(), loadedAt: Date.now() };
    // refresh from DB in background; next call sees DB values
    void loadLlmConfig(true).catch(() => {});
  }
  return cache.config;
}

/** Kick off an initial background load at module import. */
void loadLlmConfig(true).catch(() => {});

// ── Announcement config (popup toàn cục, admin điều khiển) ───────────────

export type AnnouncementMode = "never" | "once" | "daily" | "always";

export type AnnouncementConfig = {
  enabled: boolean;
  /** never = không hiện; once = 1 lần duy nhất/trình duyệt; daily = N lần/ngày; always = mỗi lần vào web */
  mode: AnnouncementMode;
  /** Số lần hiện mỗi ngày (chỉ áp dụng với mode "daily") */
  timesPerDay: number;
  title: string;
  /** Nội dung popup, mỗi dòng là một đoạn văn (hỗ trợ tiêu đề phụ **...** ở đầu dòng) */
  body: string;
};

const DEFAULT_ANNOUNCEMENT: AnnouncementConfig = {
  enabled: true,
  mode: "once",
  timesPerDay: 1,
  title: "Khiên bảo vệ chuỗi đã được khôi phục",
  body: "Trước đây, Khiên bảo vệ chuỗi (streak freeze) được kích hoạt chưa đúng cách, khiến nhiều học viên bị mất chuỗi ngày học dù vẫn còn khiên trong kho.\n\nToàn bộ chuỗi bị mất do lỗi này đã được khôi phục lại đầy đủ. Từ thời điểm này, khiên sẽ tự động hoạt động đúng như thiết kế.\n\nBạn chỉ cần đăng nhập lại là chuỗi đã được cập nhật, vui lòng xác nhận để tiếp tục.",
};

export function parseAnnouncement(raw: string | null | undefined): AnnouncementConfig {
  if (!raw) return DEFAULT_ANNOUNCEMENT;
  try {
    const p = JSON.parse(raw);
    return {
      enabled: typeof p.enabled === "boolean" ? p.enabled : DEFAULT_ANNOUNCEMENT.enabled,
      mode: ["never", "once", "daily", "always"].includes(p.mode) ? p.mode : DEFAULT_ANNOUNCEMENT.mode,
      timesPerDay:
        Number.isFinite(p.timesPerDay) && Number(p.timesPerDay) >= 1
          ? Math.round(Number(p.timesPerDay))
          : DEFAULT_ANNOUNCEMENT.timesPerDay,
      title: typeof p.title === "string" && p.title.trim() ? p.title.trim() : DEFAULT_ANNOUNCEMENT.title,
      body: typeof p.body === "string" ? p.body : DEFAULT_ANNOUNCEMENT.body,
    };
  } catch {
    return DEFAULT_ANNOUNCEMENT;
  }
}

export function announcementKey(): string {
  return "announcement";
}

export async function loadAnnouncement(): Promise<AnnouncementConfig> {
  const raw = await getSetting(announcementKey());
  return parseAnnouncement(raw);
}

export async function saveAnnouncement(cfg: AnnouncementConfig, updatedBy?: string): Promise<void> {
  await setSetting(announcementKey(), JSON.stringify(cfg), updatedBy);
}
