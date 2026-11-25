import prisma from "./prisma";

export const SETTING_KEY = "gamification_rates";
export const LB_REWARDS_KEY = "leaderboard_rewards";

export interface LeaderboardRewards {
  dailyTop3: number[];  // [1st, 2nd, 3rd]
  weeklyTop3: number[]; // [1st, 2nd, 3rd]
}

export const DEFAULT_LB_REWARDS: LeaderboardRewards = {
  dailyTop3: [5, 4, 3],
  weeklyTop3: [50, 40, 30],
};

export interface XpRates {
  problemEasyXp: number;
  problemMediumXp: number;
  problemHardXp: number;
  submissionXp: number;
  lessonXp: number;
  quizXpPerPoint: number;
  streakXp: number;
}

/** Cấu hình streak: ngưỡng "ngày học thật" + số ngày tối đa khiên tự bắc cầu hồi tố. */
export interface StreakConfig {
  /** Số phút active tối thiểu trong ngày để được tính là ngày học thật (default 3). */
  minActiveMinutes: number;
  /** Chỉ tự bắc cầu (miễn phí hoặc tiêu khiên) các ngày nghỉ trong N ngày gần nhất; 0 = tắt hẳn tự bắc cầu. */
  bridgeLookbackDays: number;
}

export const DEFAULT_STREAK_CONFIG: StreakConfig = {
  minActiveMinutes: 3,
  bridgeLookbackDays: 14,
};

export interface TokenRates {
  problemEasyTokens: number;
  problemMediumTokens: number;
  problemHardTokens: number;
  lessonTokens: number;
  assignmentTokens: number;
  quizPassTokens: number;
  reviewTokensMultiplier: number;
  adaptivePassTokens: number;
  adaptivePartialTokens: number;
  chapterClearTokens: number;
  contestFinishTokens: number;
  gameParticipationTokens: number;
  helpRequestTokens: number;
  helpSolutionTokens: number;
  bugReportTokens: number;
  hacktestTokens: number;
  attendanceTokens: number;
}

export const DEFAULT_XP_RATES: XpRates = {
  problemEasyXp: 5,
  problemMediumXp: 15,
  problemHardXp: 30,
  submissionXp: 15,
  lessonXp: 5,
  quizXpPerPoint: 3,
  streakXp: 2,
};

export const DEFAULT_TOKEN_RATES: TokenRates = {
  problemEasyTokens: 2,
  problemMediumTokens: 5,
  problemHardTokens: 10,
  lessonTokens: 2,
  assignmentTokens: 4,
  quizPassTokens: 5,
  reviewTokensMultiplier: 1,
  adaptivePassTokens: 12,
  adaptivePartialTokens: 5,
  chapterClearTokens: 8,
  contestFinishTokens: 6,
  gameParticipationTokens: 4,
  helpRequestTokens: 2,
  helpSolutionTokens: 10,
  bugReportTokens: 8,
  hacktestTokens: 10,
  attendanceTokens: 2,
};

// In-memory cache to avoid hitting the DB on every XP/token computation.
let cachedRates: { xp: XpRates; tokens: TokenRates } | null = null;
let cachedStreakConfig: StreakConfig | null = null;

function coerceRates<T extends object>(raw: any, defaults: T): T {
  const result: any = { ...defaults };
  if (raw && typeof raw === "object") {
    for (const key of Object.keys(defaults)) {
      const v = raw[key];
      if (typeof v === "number" && isFinite(v) && v >= 0) result[key] = v;
    }
  }
  return result as T;
}

function coerceStreakConfig(raw: any): StreakConfig {
  const result = { ...DEFAULT_STREAK_CONFIG };
  if (raw && typeof raw === "object") {
    if (typeof raw.minActiveMinutes === "number" && isFinite(raw.minActiveMinutes) && raw.minActiveMinutes >= 0 && raw.minActiveMinutes <= 60) {
      result.minActiveMinutes = raw.minActiveMinutes;
    }
    if (typeof raw.bridgeLookbackDays === "number" && isFinite(raw.bridgeLookbackDays) && raw.bridgeLookbackDays >= 0 && raw.bridgeLookbackDays <= 365) {
      result.bridgeLookbackDays = raw.bridgeLookbackDays;
    }
  }
  return result;
}

export async function getRates(): Promise<{ xp: XpRates; tokens: TokenRates }> {
  const cached = cachedRates;
  if (cached) return cached;
  const setting = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  let parsed: any = {};
  try {
    parsed = setting ? JSON.parse(setting.value) : {};
  } catch {
    parsed = {};
  }
  const result = {
    xp: coerceRates(parsed.xp, DEFAULT_XP_RATES),
    tokens: coerceRates(parsed.tokens, DEFAULT_TOKEN_RATES),
  };
  cachedRates = result;
  return result;
}

export async function getStreakConfig(): Promise<StreakConfig> {
  if (cachedStreakConfig) return cachedStreakConfig;
  const setting = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  let parsed: any = {};
  try {
    parsed = setting ? JSON.parse(setting.value) : {};
  } catch {
    parsed = {};
  }
  cachedStreakConfig = coerceStreakConfig(parsed.streak);
  return cachedStreakConfig;
}

export async function saveRates(xp: Partial<XpRates>, tokens: Partial<TokenRates>): Promise<void> {
  const current = await getRates();
  const merged = {
    xp: { ...current.xp, ...xp },
    tokens: { ...current.tokens, ...tokens },
  };
  // Preserve other blocks living under the same setting key (e.g. streak).
  let raw: any = {};
  const setting = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  try { raw = setting ? JSON.parse(setting.value) : {}; } catch { raw = {}; }
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify({ ...raw, ...merged }) },
    update: { value: JSON.stringify({ ...raw, ...merged }) },
  });
  cachedRates = merged;
  // Note: XP is now a ledger (User.xp + xp_transactions), not a recomputed
  // cache — rate changes only affect awards going forward, never the past.
}

// ── Leaderboard rewards config ──

let cachedLbRewards: LeaderboardRewards | null = null;

export async function getLbRewards(): Promise<LeaderboardRewards> {
  if (cachedLbRewards) return cachedLbRewards;
  const setting = await prisma.setting.findUnique({ where: { key: LB_REWARDS_KEY } });
  let parsed: any = {};
  try { parsed = setting ? JSON.parse(setting.value) : {}; } catch { parsed = {}; }
  const result: LeaderboardRewards = {
    dailyTop3: Array.isArray(parsed.dailyTop3) && parsed.dailyTop3.length >= 3
      ? parsed.dailyTop3.slice(0, 3).map((v: any) => (typeof v === "number" && v >= 0 ? v : 0))
      : DEFAULT_LB_REWARDS.dailyTop3,
    weeklyTop3: Array.isArray(parsed.weeklyTop3) && parsed.weeklyTop3.length >= 3
      ? parsed.weeklyTop3.slice(0, 3).map((v: any) => (typeof v === "number" && v >= 0 ? v : 0))
      : DEFAULT_LB_REWARDS.weeklyTop3,
  };
  cachedLbRewards = result;
  return result;
}

export async function saveLbRewards(data: Partial<LeaderboardRewards>): Promise<void> {
  const current = await getLbRewards();
  const merged: LeaderboardRewards = {
    dailyTop3: data.dailyTop3 ?? current.dailyTop3,
    weeklyTop3: data.weeklyTop3 ?? current.weeklyTop3,
  };
  await prisma.setting.upsert({
    where: { key: LB_REWARDS_KEY },
    create: { key: LB_REWARDS_KEY, value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  });
  cachedLbRewards = merged;
}

export async function saveStreakConfig(config: Partial<StreakConfig>): Promise<StreakConfig> {
  const current = await getStreakConfig();
  const merged: StreakConfig = { ...current, ...config };
  // Preserve other blocks living under the same setting key (e.g. xp/tokens).
  let raw: any = {};
  const setting = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  try { raw = setting ? JSON.parse(setting.value) : {}; } catch { raw = {}; }
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify({ ...raw, streak: merged }) },
    update: { value: JSON.stringify({ ...raw, streak: merged }) },
  });
  cachedStreakConfig = merged;
  return merged;
}

export function invalidateAllCaches() {
  cachedRates = null;
  cachedLbRewards = null;
  cachedStreakConfig = null;
}
