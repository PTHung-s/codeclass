/**
 * Skill Mastery Engine — Source- & Difficulty-Aware BKT-IRT + Memory Decay + Prerequisite DAG.
 *
 * Engines:
 *   - bkt (default): Source/difficulty-aware IRT-BKT with hint penalty, guessing weights,
 *     session correlation cap, and forgetting-curve memory decay.
 *   - ewma: Correctness-gated normalized EWMA with memory decay.
 *
 * Rule engine: R1, R2, R3, R7, R8, R9 reading unified SkillEvidence + real class medians +
 * StudentWeaknessTag + SkillGraph prerequisites.
 */

import prisma from "../utils/prisma";
import {
  SKILL_SEEDS,
  getPrerequisiteAncestors,
  getSkillDependents,
  getSkillPrerequisites,
  skillIdToName,
} from "../utils/skillGraph";

// ── Types ──

export interface Observation {
  outcomes: boolean[];
  attempt: number;
  timeFactor: number; // 0.0–1.0
  hintCount: number;
  difficulty?: number; // 1–5 average item difficulty
  difficulties?: number[]; // 1–5 per item, aligned with outcomes
  itemWeights?: number[]; // per-item weight from guessing detection
  source?: string; // lesson_quiz | adaptive_test | problem | session_quiz | arena_quiz | challenge | code_duel | exam
  contextId?: string;
  daysSincePrevious?: number;
  stabilitySessions?: number;
}

export interface MasteryHistoryEntry {
  ts: string;
  value: number;
  delta?: number;
  source?: string;
  correct?: number;
  total?: number;
  difficulty?: number;
  hintCount?: number;
  contextId?: string;
  decayBefore?: number;
}

export interface MasteryBreakdownItem {
  ts: string;
  source: string;
  label: string;
  delta: number;
  valueAfter: number;
  correct?: number;
  total?: number;
  hintCount?: number;
}

export interface SkillState {
  skillId: string;
  name: string;
  mastery: number; // effective mastery (0.0 → 1.0), after read-time decay
  trend: "up" | "down" | "flat";
  hasEvidence: boolean;
  evidenceCount: number;
  lowerBound?: number;
  upperBound?: number;
  confidenceLevel?: "low" | "forming" | "medium" | "high";
  rawMastery?: number;
  retentionRate?: number;
  halfLifeDays?: number;
  daysSinceLastPractice?: number | null;
  dueForReview?: boolean;
  nextReviewAt?: string | null;
  estimatedPrior?: number | null;
  prerequisites?: string[];
  weakPrerequisites?: { skillId: string; name: string; mastery: number }[];
  breakdown?: MasteryBreakdownItem[];
  sourceSummary?: Record<string, { sessions: number; correct: number; total: number }>;
}

export interface RecommendationInput {
  userId: string;
  skillId: string;
  skillName: string;
  wrongTotal: number;
  questionTotal: number;
  skillWrong: number;
  skillTotal: number;
  hintCount: number;
  responseTimePerItem: number;
  classMedian: number | null;
  masteryAfter: number;
  lessonType: string;
  score: number;
  topErrorPattern: string | null;
  topErrorCount: number;
  weakPrerequisiteName?: string | null;
  daysSinceLastPractice?: number | null;
  retentionRate?: number | null;
}

export interface RecommendationOutput {
  id: string;
  title: string;
  type: string;
  skillId: string;
  mandatory: boolean;
  reason: string;
  evidence: string;
  ruleId: string;
  confidence: number;
  detailLevel: string | null;
  lessonId?: string | null;
}

// ── Shared helpers & constants ──

export const FORGETTING_FLOOR = 0.25;
export const FORGETTING_GRACE_DAYS = 2;
export const REVIEW_RETENTION_THRESHOLD = 0.78;

const MAX_HISTORY_ENTRIES = 40;

const SOURCE_LABELS: Record<string, string> = {
  problem: "Bài tập code",
  exam: "Bài kiểm tra / Thi",
  lesson_quiz: "Quiz bài học",
  adaptive_test: "Test vượt chương",
  session_quiz: "Quiz khóa học",
  arena_quiz: "Đấu trường Quiz",
  challenge: "Thử thách trong bài",
  code_duel: "Đấu code",
  decay: "Quên theo thời gian",
};

export function sourceToLabel(source?: string): string {
  if (!source) return "Hoạt động học tập";
  return SOURCE_LABELS[source] || source;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round4(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

// ── Uncertainty Band ──

export function estimateMasteryUncertainty(mastery: number, history: { ts: string; value: number }[]) {
  const evidenceCount = history.length;
  if (evidenceCount === 0) return null;

  const recent = history.slice(-6);
  const averageChange = recent.length < 2
    ? 0
    : recent.slice(1).reduce((sum, entry, index) => sum + Math.abs(entry.value - recent[index].value), 0) / (recent.length - 1);
  const evidenceHalfWidth = 0.32 / Math.sqrt(evidenceCount + 0.5);
  const volatilityPenalty = Math.min(0.1, averageChange * 0.6);
  const halfWidth = Math.min(0.42, Math.max(0.04, evidenceHalfWidth + volatilityPenalty));
  const lowerBound = Math.max(0, mastery - halfWidth);
  const upperBound = Math.min(1, mastery + halfWidth);
  const confidenceLevel: NonNullable<SkillState["confidenceLevel"]> = evidenceCount >= 20 && halfWidth <= 0.09
    ? "high"
    : evidenceCount >= 8 && halfWidth <= 0.16
      ? "medium"
      : evidenceCount >= 3
        ? "forming"
        : "low";

  return {
    lowerBound: round4(lowerBound),
    upperBound: round4(upperBound),
    confidenceLevel,
  };
}

// ── Memory Decay (Forgetting Curve) ──

/** Half-life expands exponentially as the student succeeds across spaced sessions. */
export function computeHalfLifeDays(spacedSuccessCount: number): number {
  const s = Math.max(0, spacedSuccessCount);
  return Math.min(90, Math.round(12 * Math.pow(1.42, Math.max(0, s - 1)) * 10) / 10);
}

/** Count distinct successful study sittings separated by >= 12 hours. */
export function countSpacedSuccesses(history: MasteryHistoryEntry[]): number {
  let count = 0;
  let lastSuccessMs = -Infinity;
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  for (const entry of history) {
    const isSuccess = entry.value >= 0.65 || (entry.delta ?? 0) > 0.01;
    if (!isSuccess) continue;
    const tsMs = Date.parse(entry.ts);
    if (!Number.isFinite(tsMs)) {
      count += 1;
      continue;
    }
    if (tsMs - lastSuccessMs >= TWELVE_HOURS_MS) {
      count += 1;
      lastSuccessMs = tsMs;
    }
  }
  return count;
}

/** Exponential forgetting curve toward FORGETTING_FLOOR after FORGETTING_GRACE_DAYS. */
export function applyMemoryDecay(
  mastery: number,
  daysElapsed: number,
  spacedSuccessCount: number,
): { effectiveMastery: number; retentionRate: number; halfLifeDays: number } {
  const cleanMastery = clamp01(mastery);
  const halfLifeDays = computeHalfLifeDays(spacedSuccessCount);
  const effectiveDays = Math.max(0, (Number.isFinite(daysElapsed) ? daysElapsed : 0) - FORGETTING_GRACE_DAYS);
  if (effectiveDays <= 0 || cleanMastery <= FORGETTING_FLOOR) {
    return {
      effectiveMastery: round4(cleanMastery),
      retentionRate: 1,
      halfLifeDays,
    };
  }
  const retentionRate = Math.pow(0.5, effectiveDays / halfLifeDays);
  const effectiveMastery = clamp01(FORGETTING_FLOOR + (cleanMastery - FORGETTING_FLOOR) * retentionRate);
  return {
    effectiveMastery: round4(effectiveMastery),
    retentionRate: round4(retentionRate),
    halfLifeDays,
  };
}

export function computeNextReviewDate(lastTs: string | Date, spacedSuccessCount: number): string {
  const lastDate = lastTs instanceof Date ? lastTs : new Date(lastTs);
  const baseMs = Number.isFinite(lastDate.getTime()) ? lastDate.getTime() : Date.now();
  const halfLifeDays = computeHalfLifeDays(spacedSuccessCount);
  const daysUntilReview = FORGETTING_GRACE_DAYS + halfLifeDays * (-Math.log2(REVIEW_RETENTION_THRESHOLD));
  return new Date(baseMs + daysUntilReview * 86_400_000).toISOString();
}

// ── EWMA Engine (correctness-gated) ──

/**
 * Correctness-gated difficulty-aware signal.
 * Attempt/time/hint quality scales positive achievement rather than rewarding 0% answers.
 */
export function calculateSignal(
  correctness: number,
  attempt: number,
  timeFactor: number,
  hintCount: number,
  difficulty: number = 3,
): number {
  const c = clamp01(correctness);
  const attemptFactor = 1 / Math.max(1, attempt);
  const hintFactor = Math.max(0, 1 - 0.25 * Math.max(0, hintCount));
  const timeNorm = clamp01(timeFactor);
  const difficultyNorm = clamp01((difficulty - 1) / 4);
  const executionQuality = 0.45 * attemptFactor + 0.25 * timeNorm + 0.30 * hintFactor;
  const base = c * (0.65 + 0.35 * executionQuality);
  const difficultyAdj = c >= 0.5
    ? 0.08 * (difficultyNorm - 0.5)
    : -0.08 * (1 - difficultyNorm);
  return clamp01(base + difficultyAdj);
}

/**
 * EWMA update: 0.7 × decayedPrior + 0.3 × signal.
 */
export function ewmaUpdate(prior: number, observation: Observation): number {
  if (observation.outcomes.length === 0) return clamp01(prior);
  let effectivePrior = clamp01(prior);
  if (observation.daysSincePrevious && observation.daysSincePrevious > FORGETTING_GRACE_DAYS) {
    effectivePrior = applyMemoryDecay(
      effectivePrior,
      observation.daysSincePrevious,
      observation.stabilitySessions ?? 1,
    ).effectiveMastery;
  }
  const correctness = observation.outcomes.filter(Boolean).length / observation.outcomes.length;
  const signal = calculateSignal(
    correctness,
    observation.attempt,
    observation.timeFactor,
    observation.hintCount,
    observation.difficulty ?? 3,
  );
  return clamp01(0.7 * effectivePrior + 0.3 * signal);
}

// ── Source- & Difficulty-Aware IRT-BKT Engine ──

export interface BKTParams {
  pL0: number;
  pT: number;
  pSlip: number;
  pGuess: number;
}

export const DEFAULT_BKT: BKTParams = { pL0: 0.2, pT: 0.08, pSlip: 0.1, pGuess: 0.25 };

interface SourceProfile {
  guessScale: number;
  slipScale: number;
  sourceWeight: number;
  maxSessionEvidence: number;
}

const DEFAULT_SOURCE_PROFILE: SourceProfile = {
  guessScale: 1.0,
  slipScale: 1.0,
  sourceWeight: 1.0,
  maxSessionEvidence: 1.5,
};

const SOURCE_PROFILES: Record<string, SourceProfile> = {
  problem: { guessScale: 0.20, slipScale: 1.15, sourceWeight: 1.35, maxSessionEvidence: 1.8 },
  code_duel: { guessScale: 0.25, slipScale: 1.20, sourceWeight: 1.20, maxSessionEvidence: 1.5 },
  challenge: { guessScale: 0.30, slipScale: 1.10, sourceWeight: 1.10, maxSessionEvidence: 1.4 },
  exam: { guessScale: 0.70, slipScale: 1.05, sourceWeight: 1.45, maxSessionEvidence: 2.2 },
  adaptive_test: { guessScale: 0.95, slipScale: 1.00, sourceWeight: 1.20, maxSessionEvidence: 2.0 },
  lesson_quiz: { guessScale: 1.00, slipScale: 1.00, sourceWeight: 1.00, maxSessionEvidence: 1.5 },
  session_quiz: { guessScale: 1.00, slipScale: 1.00, sourceWeight: 1.00, maxSessionEvidence: 1.5 },
  arena_quiz: { guessScale: 1.10, slipScale: 1.15, sourceWeight: 0.85, maxSessionEvidence: 1.2 },
};

/**
 * Guessing detection from population option spread.
 * Returns 0.9–1.0 weight multiplier; 1.0 when total < 6.
 */
export function computeItemEvidenceWeight(
  distribution: number[],
  selectedIndex: number,
  correctIndex: number,
  isCorrect: boolean,
): number {
  const total = distribution.reduce((sum, n) => sum + n, 0);
  if (total < 6) return 1;

  if (isCorrect) {
    const correctRate = (distribution[correctIndex] ?? 0) / total;
    if (correctRate >= 0.9) return 0.9;
    if (correctRate >= 0.8) return 0.95;
    return 1;
  }
  const selectedRate = (distribution[selectedIndex] ?? 0) / total;
  return selectedRate >= 0.25 ? 1.0 : 0.9;
}

/**
 * Source- & Difficulty-Aware Session BKT update with:
 * - Source calibration (coding problem vs proctored exam vs 4-option MCQ)
 * - IRT-like logistic difficulty shift on pGuess & pSlip
 * - Hint modulation (heavy hint use discounts positive mastery gain)
 * - Time-factor weighting + distractor guessing weights
 * - Correlated-item evidence cap + inter-session forgetting decay
 */
export function bktUpdate(prior: number, observation: Observation, params: BKTParams = DEFAULT_BKT): number {
  const n = observation.outcomes.length;
  if (n === 0) return clamp01(prior);

  const profile = (observation.source && SOURCE_PROFILES[observation.source]) || DEFAULT_SOURCE_PROFILE;
  const weights = observation.itemWeights && observation.itemWeights.length === n
    ? observation.itemWeights
    : new Array<number>(n).fill(1);

  const timeWeightMod = 0.85 + 0.15 * clamp01(observation.timeFactor);
  const hintCount = Math.max(0, observation.hintCount || 0);

  let nEff = 0;
  let sumLogKnow = 0;
  let sumLogNot = 0;

  for (let i = 0; i < n; i++) {
    const itemW = Math.max(0, weights[i]) * profile.sourceWeight * timeWeightMod;
    if (itemW <= 0) continue;

    const rawDiff = observation.difficulties?.[i] ?? observation.difficulty ?? 3;
    const diff = Math.max(1, Math.min(5, Number.isFinite(rawDiff) ? rawDiff : 3));
    const z = (diff - 3) / 2; // -1 (easy) .. +1 (hard)

    const baseGuess = Math.max(0.02, Math.min(0.45, params.pGuess * profile.guessScale * Math.exp(-0.45 * z)));
    const pSlipItem = Math.max(0.03, Math.min(0.35, params.pSlip * profile.slipScale * Math.exp(0.25 * z)));
    const pGuessItem = observation.outcomes[i] && hintCount > 0
      ? Math.min(Math.max(0.05, 1 - pSlipItem - 0.05), baseGuess + Math.min(0.45, 0.14 * hintCount))
      : Math.min(Math.max(0.05, 1 - pSlipItem - 0.05), baseGuess);

    const pCorrectKnow = Math.max(1e-6, Math.min(1 - 1e-6, 1 - pSlipItem));
    const pWrongKnow = Math.max(1e-6, Math.min(1 - 1e-6, pSlipItem));
    const pCorrectNot = Math.max(1e-6, Math.min(1 - 1e-6, pGuessItem));
    const pWrongNot = Math.max(1e-6, Math.min(1 - 1e-6, 1 - pGuessItem));

    if (observation.outcomes[i]) {
      sumLogKnow += itemW * Math.log(pCorrectKnow);
      sumLogNot += itemW * Math.log(pCorrectNot);
    } else {
      sumLogKnow += itemW * Math.log(pWrongKnow);
      sumLogNot += itemW * Math.log(pWrongNot);
    }
    nEff += itemW;
  }

  if (nEff <= 0) return clamp01(prior);

  const scale = Math.min(1, profile.maxSessionEvidence / nEff);
  const logLKnow = scale * sumLogKnow;
  const logLNot = scale * sumLogNot;

  let p0 = clamp01(prior);
  if (observation.daysSincePrevious && observation.daysSincePrevious > FORGETTING_GRACE_DAYS) {
    p0 = applyMemoryDecay(p0, observation.daysSincePrevious, observation.stabilitySessions ?? 1).effectiveMastery;
  }

  const logNum = Math.log(Math.max(1e-12, p0)) + logLKnow;
  const logDenAlt = Math.log(Math.max(1e-12, 1 - p0)) + logLNot;
  const m = Math.max(logNum, logDenAlt);
  let posterior = Math.exp(logNum - m) / (Math.exp(logNum - m) + Math.exp(logDenAlt - m));
  if (!Number.isFinite(posterior)) posterior = p0;

  let p = Math.max(0.02, Math.min(0.98, clamp01(posterior)));

  // Learning transition once per session, damped by retry attempt and hints revealed.
  const attemptFactor = 1 / Math.max(1, observation.attempt);
  const hintTransitionFactor = 1 / (1 + 0.25 * hintCount);
  p = p + (1 - p) * params.pT * attemptFactor * hintTransitionFactor;
  return clamp01(p);
}

// ── Trend & Replay ──

function computeTrend(history: { ts: string; value: number }[]): "up" | "down" | "flat" {
  if (history.length < 4) return "flat";
  const lookbackIdx = Math.max(0, history.length - 6);
  const delta = history[history.length - 1].value - history[lookbackIdx].value;
  if (delta > 0.05) return "up";
  if (delta < -0.05) return "down";
  return "flat";
}

export type ReplayState = {
  value: number;
  lastTs: string | null;
  history: MasteryHistoryEntry[];
};

/** Apply one observation to an in-memory replay. Persisting happens once at the end. */
export function applyReplayObservation(
  replay: Map<string, ReplayState>,
  skillId: string,
  observation: Observation,
  timestamp: string,
  engine: "ewma" | "bkt" = "bkt",
  bktParams: BKTParams = DEFAULT_BKT,
) {
  const state = replay.get(skillId) || {
    value: engine === "bkt" ? bktParams.pL0 : 0.5,
    lastTs: null,
    history: [],
  };

  let daysSincePrevious: number | undefined = observation.daysSincePrevious;
  let decayBefore: number | undefined;
  const stabilitySessions = observation.stabilitySessions ?? Math.max(1, countSpacedSuccesses(state.history));

  if (daysSincePrevious === undefined && state.lastTs) {
    const prevMs = Date.parse(state.lastTs);
    const currMs = Date.parse(timestamp);
    if (Number.isFinite(prevMs) && Number.isFinite(currMs) && currMs > prevMs) {
      daysSincePrevious = (currMs - prevMs) / 86_400_000;
    }
  }

  let effectiveStart = state.value;
  if (daysSincePrevious && daysSincePrevious > FORGETTING_GRACE_DAYS) {
    const decayed = applyMemoryDecay(state.value, daysSincePrevious, stabilitySessions).effectiveMastery;
    const diff = round4(decayed - state.value);
    if (diff < -0.005) decayBefore = diff;
    effectiveStart = decayed;
  }

  const obsWithDecay: Observation = {
    ...observation,
    daysSincePrevious,
    stabilitySessions,
  };

  const value = engine === "bkt"
    ? bktUpdate(state.value, obsWithDecay, bktParams)
    : ewmaUpdate(state.value, obsWithDecay);

  const correctCount = observation.outcomes.filter(Boolean).length;
  const entry: MasteryHistoryEntry = {
    ts: timestamp,
    value: round6(value),
    delta: round4(value - effectiveStart),
    source: observation.source,
    correct: correctCount,
    total: observation.outcomes.length,
    difficulty: observation.difficulty !== undefined ? Math.round(observation.difficulty * 10) / 10 : undefined,
    hintCount: observation.hintCount > 0 ? observation.hintCount : undefined,
    contextId: observation.contextId,
    decayBefore,
  };

  state.value = value;
  state.lastTs = timestamp;
  state.history.push(entry);
  if (state.history.length > MAX_HISTORY_ENTRIES) {
    state.history = state.history.slice(-MAX_HISTORY_ENTRIES);
  }
  replay.set(skillId, state);
}

// ── Full recalculation for a student ──

export async function recalculateMasteryForStudent(userId: string): Promise<SkillState[]> {
  const replay = new Map<string, ReplayState>();
  const [engineRow, bktRow] = await Promise.all([
    prisma.engineSetting.findUnique({ where: { key: "mastery_engine" } }),
    prisma.engineSetting.findUnique({ where: { key: "bkt_params" } }),
  ]);
  const replayEngine: "ewma" | "bkt" = engineRow?.value === "ewma" ? "ewma" : "bkt";

  let replayBktParams = DEFAULT_BKT;
  if (bktRow) {
    try { replayBktParams = { ...DEFAULT_BKT, ...JSON.parse(bktRow.value) }; } catch { /* use defaults */ }
  }

  const skillBktOverrides = new Map<string, BKTParams>();
  if (replayEngine === "bkt") {
    const calibrations = await prisma.skillBktCalibration.findMany();
    for (const c of calibrations) {
      skillBktOverrides.set(c.skillId, {
        pL0: Math.min(0.5, Math.max(0.01, c.pL0)),
        pT: Math.min(0.12, Math.max(0.02, c.pT)),
        pSlip: Math.min(0.3, Math.max(0.05, c.pSlip)),
        pGuess: Math.min(0.4, Math.max(0.05, c.pGuess)),
      });
    }
  }

  const calibByQuestion = new Map<string, { difficulty: number; distribution: number[] }>();
  if (replayEngine === "bkt") {
    const calibRows = await prisma.quizQuestionCalibration.findMany({
      select: {
        questionId: true,
        effectiveDifficulty: true,
        optionDistribution: true,
      },
    });
    for (const row of calibRows) {
      let distribution: number[] = [];
      try {
        distribution = JSON.parse(row.optionDistribution || "[]");
      } catch { /* keep [] */ }
      calibByQuestion.set(row.questionId, {
        difficulty:
          Number.isFinite(row.effectiveDifficulty) && row.effectiveDifficulty !== null
            ? Math.max(1, Math.min(5, Number(row.effectiveDifficulty)))
            : 3,
        distribution,
      });
    }
  }

  // Pre-load hint & active-time metadata for coding problems
  const [hintReveals, problemSubmissions, evidenceRows] = await Promise.all([
    prisma.hintReveal.findMany({
      where: { userId },
      select: { problemId: true },
    }),
    prisma.problemSubmission.findMany({
      where: { studentId: userId },
      orderBy: { createdAt: "asc" },
      select: {
        problemId: true,
        activeTimeSeconds: true,
        problem: { select: { estimatedTime: true } },
      },
    }),
    prisma.skillEvidence.findMany({
      where: { userId },
      orderBy: { occurredAt: "asc" },
    }),
  ]);

  const hintCountByProblem = new Map<string, number>();
  for (const h of hintReveals) {
    hintCountByProblem.set(h.problemId, (hintCountByProblem.get(h.problemId) || 0) + 1);
  }

  const problemTimeByKey = new Map<string, number>();
  {
    const ord = new Map<string, number>();
    for (const sub of problemSubmissions) {
      const n = (ord.get(sub.problemId) || 0) + 1;
      ord.set(sub.problemId, n);
      let timeFactor = 1.0;
      if (sub.activeTimeSeconds && sub.problem?.estimatedTime) {
        const expectedSec = sub.problem.estimatedTime * 60;
        const ratio = sub.activeTimeSeconds / Math.max(1, expectedSec);
        timeFactor = Math.min(1, Math.max(0.1, 1.5 - ratio));
      }
      problemTimeByKey.set(`${sub.problemId}:${n}`, timeFactor);
    }
  }

  // Group by (skillId, sessionKey) into one session observation
  type EvGroup = {
    skillId: string;
    sessionKey: string;
    source: string;
    contextId: string;
    outcomes: boolean[];
    difficulties: number[];
    itemWeights: number[];
    occurredAt: Date;
    attempt: number;
  };
  const groups = new Map<string, EvGroup>();
  for (const row of evidenceRows) {
    const key = `${row.skillId}\0${row.sessionKey}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        skillId: row.skillId,
        sessionKey: row.sessionKey,
        source: row.source,
        contextId: row.contextId,
        outcomes: [],
        difficulties: [],
        itemWeights: [],
        occurredAt: row.occurredAt,
        attempt: Number.isFinite(row.attempt) ? Math.max(1, row.attempt) : 1,
      };
      groups.set(key, g);
    }
    g.outcomes.push(Boolean(row.isCorrect));
    const calib = (row.source === "lesson_quiz" || row.source === "adaptive_test")
      ? calibByQuestion.get(row.questionKey)
      : undefined;
    const difficulty = calib
      ? calib.difficulty
      : Math.max(1, Math.min(5, Number.isFinite(row.difficultyUsed) ? Number(row.difficultyUsed) : 3));
    g.difficulties.push(difficulty);
    g.itemWeights.push(Number.isFinite(row.weight) ? Number(row.weight) : 1);
    if (row.occurredAt < g.occurredAt) g.occurredAt = row.occurredAt;
  }

  // Strictly chronological order across sessions so inter-session decay is exact
  const orderedGroups = Array.from(groups.values()).sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  for (const g of orderedGroups) {
    const attempt = g.attempt;
    let timeFactor = 1.0;
    let hintCount = 0;

    if (g.source === "problem") {
      timeFactor = problemTimeByKey.get(`${g.contextId}:${attempt}`) ?? 1.0;
      hintCount = hintCountByProblem.get(g.contextId) || 0;
    }

    const avgDifficulty =
      g.difficulties.length > 0
        ? g.difficulties.reduce((sum, d) => sum + d, 0) / g.difficulties.length
        : 3;

    applyReplayObservation(
      replay,
      g.skillId,
      {
        outcomes: g.outcomes,
        attempt,
        timeFactor,
        hintCount,
        difficulty: avgDifficulty,
        difficulties: g.difficulties,
        itemWeights: g.itemWeights,
        source: g.source,
        contextId: g.contextId,
      },
      g.occurredAt.toISOString(),
      replayEngine,
      replayEngine === "bkt" ? (skillBktOverrides.get(g.skillId) || replayBktParams) : DEFAULT_BKT,
    );
  }

  // Replace canonical mastery atomically
  await prisma.$transaction(async (tx) => {
    await tx.studentSkillMastery.deleteMany({
      where: { userId, skillId: { in: SKILL_SEEDS.map((seed) => seed.skillId) } },
    });
    for (const seed of SKILL_SEEDS) {
      const state = replay.get(seed.skillId);
      if (!state) continue;
      await tx.studentSkillMastery.create({
        data: {
          userId,
          skillId: seed.skillId,
          value: state.value,
          trend: computeTrend(state.history),
          historyJson: JSON.stringify(state.history),
        },
      });
    }
  });

  // Return enriched states (with read-time decay, breakdown & prerequisite graph)
  const states = buildEnrichedSkillStates(
    new Map(
      Array.from(replay.entries()).map(([skillId, st]) => [
        skillId,
        { value: st.value, trend: computeTrend(st.history), history: st.history },
      ]),
    ),
  );

  await generateRecommendations(userId, states);
  return states;
}

/** Recalculate mastery sequentially across all students with evidence (safe for SQLite). */
export async function recalculateMasteryForAllStudents(): Promise<{
  totalStudents: number;
  updated: number;
  failed: number;
}> {
  const [evUsers, existingUsers] = await Promise.all([
    prisma.skillEvidence.findMany({ distinct: ["userId"], select: { userId: true } }),
    prisma.studentSkillMastery.findMany({ distinct: ["userId"], select: { userId: true } }),
  ]);
  const userIds = Array.from(
    new Set([...evUsers.map((r) => r.userId), ...existingUsers.map((r) => r.userId)]),
  );

  let updated = 0;
  let failed = 0;
  for (const uid of userIds) {
    try {
      await recalculateMasteryForStudent(uid);
      updated += 1;
    } catch (err) {
      failed += 1;
      console.error(`[SkillMastery] batch recalc failed for ${uid}:`, err);
    }
  }
  return { totalStudents: userIds.length, updated, failed };
}

// ── Trailing-Debounce Queue (coalesced, never drops back-to-back submissions) ──

const RECALC_DEBOUNCE_MS = 2500;
const inFlightRecalcs = new Map<string, Promise<SkillState[]>>();
const pendingReruns = new Set<string>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const waitingResolvers = new Map<string, Array<{
  resolve: (value: SkillState[]) => void;
  reject: (reason?: unknown) => void;
}>>();

function flushQueuedRecalculation(userId: string): void {
  debounceTimers.delete(userId);
  const listeners = waitingResolvers.get(userId) || [];
  waitingResolvers.delete(userId);

  const run = recalculateMasteryForStudent(userId)
    .then(async (states) => {
      inFlightRecalcs.delete(userId);
      if (pendingReruns.delete(userId)) {
        return queueMasteryRecalculation(userId);
      }
      return states;
    })
    .catch((err) => {
      inFlightRecalcs.delete(userId);
      pendingReruns.delete(userId);
      throw err;
    });

  inFlightRecalcs.set(userId, run);
  run.then(
    (res) => {
      for (const l of listeners) l.resolve(res);
    },
    (err) => {
      for (const l of listeners) l.reject(err);
    },
  );
}

/** Coalesced trailing-debounce recalculation: guarantees rapid back-to-back submissions are always replayed. */
export function queueMasteryRecalculation(userId: string): Promise<SkillState[]> {
  return new Promise<SkillState[]>((resolve, reject) => {
    let listeners = waitingResolvers.get(userId);
    if (!listeners) {
      listeners = [];
      waitingResolvers.set(userId, listeners);
    }
    listeners.push({ resolve, reject });

    if (inFlightRecalcs.has(userId)) {
      pendingReruns.add(userId);
      return;
    }

    const existingTimer = debounceTimers.get(userId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => flushQueuedRecalculation(userId), RECALC_DEBOUNCE_MS);
    if (typeof timer.unref === "function") timer.unref();
    debounceTimers.set(userId, timer);
  });
}

// ── State Enrichment (Read-Time Decay + Prerequisites + Explainability) ──

type StoredSkillMap = Map<
  string,
  { value: number; trend: string; history: MasteryHistoryEntry[] }
>;

function parseHistoryJson(raw?: string | null): MasteryHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function buildEnrichedSkillStates(
  storedMap: StoredSkillMap,
  now: Date = new Date(),
): SkillState[] {
  const nowMs = now.getTime();
  const baseStates: SkillState[] = [];
  const stateById = new Map<string, SkillState>();

  for (const seed of SKILL_SEEDS) {
    const existing = storedMap.get(seed.skillId);
    const history = existing?.history ?? [];
    const evidenceCount = history.length;
    const hasEvidence = evidenceCount > 0;
    const prereqs = getSkillPrerequisites(seed.skillId);

    if (!hasEvidence) {
      const state: SkillState = {
        skillId: seed.skillId,
        name: seed.name,
        mastery: 0.5,
        trend: "flat",
        hasEvidence: false,
        evidenceCount: 0,
        rawMastery: undefined,
        retentionRate: undefined,
        halfLifeDays: undefined,
        daysSinceLastPractice: null,
        dueForReview: false,
        nextReviewAt: null,
        estimatedPrior: null,
        prerequisites: prereqs,
        weakPrerequisites: [],
        breakdown: [],
        sourceSummary: {},
      };
      baseStates.push(state);
      stateById.set(seed.skillId, state);
      continue;
    }

    const rawMastery = clamp01(existing?.value ?? 0.5);
    const lastEntry = history[history.length - 1];
    const lastMs = Date.parse(lastEntry.ts);
    const daysSinceLastPractice = Number.isFinite(lastMs)
      ? Math.max(0, Math.round(((nowMs - lastMs) / 86_400_000) * 10) / 10)
      : 0;
    const spacedCount = countSpacedSuccesses(history);
    const decayed = applyMemoryDecay(rawMastery, daysSinceLastPractice, spacedCount);
    const effectiveMastery = decayed.effectiveMastery;
    const dueForReview = decayed.retentionRate < REVIEW_RETENTION_THRESHOLD && rawMastery >= 0.5;
    const nextReviewAt = computeNextReviewDate(lastEntry.ts, spacedCount);
    const uncertainty = estimateMasteryUncertainty(effectiveMastery, history);

    const sourceSummary: Record<string, { sessions: number; correct: number; total: number }> = {};
    for (const h of history) {
      const src = h.source || "other";
      const cur = (sourceSummary[src] ||= { sessions: 0, correct: 0, total: 0 });
      cur.sessions += 1;
      cur.correct += h.correct ?? 0;
      cur.total += h.total ?? 0;
    }

    const breakdown: MasteryBreakdownItem[] = history
      .slice(-5)
      .reverse()
      .map((h) => ({
        ts: h.ts,
        source: h.source || "activity",
        label: sourceToLabel(h.source),
        delta: h.delta ?? 0,
        valueAfter: round4(h.value),
        correct: h.correct,
        total: h.total,
        hintCount: h.hintCount,
      }));

    const decayLoss = round4(effectiveMastery - rawMastery);
    if (decayLoss <= -0.01) {
      breakdown.unshift({
        ts: now.toISOString(),
        source: "decay",
        label: `${Math.round(daysSinceLastPractice)} ngày chưa ôn tập`,
        delta: decayLoss,
        valueAfter: effectiveMastery,
      });
    }

    const state: SkillState = {
      skillId: seed.skillId,
      name: seed.name,
      mastery: effectiveMastery,
      trend: (existing?.trend as "up" | "down" | "flat") || computeTrend(history),
      hasEvidence: true,
      evidenceCount,
      ...uncertainty,
      rawMastery: round4(rawMastery),
      retentionRate: decayed.retentionRate,
      halfLifeDays: decayed.halfLifeDays,
      daysSinceLastPractice,
      dueForReview,
      nextReviewAt,
      estimatedPrior: null,
      prerequisites: prereqs,
      weakPrerequisites: [],
      breakdown,
      sourceSummary,
    };
    baseStates.push(state);
    stateById.set(seed.skillId, state);
  }

  // Pass 2: Prerequisite gap attribution + soft prior estimation for unknown skills
  for (const state of baseStates) {
    if (state.hasEvidence && state.mastery < 0.68) {
      const ancestors = getPrerequisiteAncestors(state.skillId, 2);
      const weakPrereqs = ancestors
        .map((pid) => stateById.get(pid))
        .filter((ps): ps is SkillState => Boolean(ps && ps.hasEvidence && ps.mastery < 0.65))
        .sort((a, b) => a.mastery - b.mastery)
        .slice(0, 3)
        .map((ps) => ({ skillId: ps.skillId, name: ps.name, mastery: ps.mastery }));
      state.weakPrerequisites = weakPrereqs;
    } else if (!state.hasEvidence) {
      // Infer soft prior if student already demonstrated stronger dependent skills or passed prerequisites
      const dependents = getSkillDependents(state.skillId)
        .map((did) => stateById.get(did))
        .filter((ds): ds is SkillState => Boolean(ds && ds.hasEvidence));
      const strongDependents = dependents.filter((ds) => ds.mastery >= 0.72);
      if (strongDependents.length > 0) {
        const avgDep = strongDependents.reduce((sum, ds) => sum + ds.mastery, 0) / strongDependents.length;
        state.estimatedPrior = round4(clamp01(0.45 + 0.30 * avgDep));
      } else {
        const directPrereqs = getSkillPrerequisites(state.skillId)
          .map((pid) => stateById.get(pid))
          .filter((ps): ps is SkillState => Boolean(ps && ps.hasEvidence));
        if (directPrereqs.length > 0) {
          const avgPre = directPrereqs.reduce((sum, ps) => sum + ps.mastery, 0) / directPrereqs.length;
          state.estimatedPrior = round4(clamp01(0.25 + 0.40 * avgPre));
        }
      }
    }
  }

  return baseStates;
}

// ── Rule Engine (R1-R9) ──

function buildRecommendation(
  evidence: RecommendationInput,
  overrides: {
    ruleId: string;
    title: string;
    type: string;
    secondarySignal: string;
    action: string;
    confidence: number;
    detailLevel?: string;
    customReason?: string;
  },
): RecommendationOutput {
  const prereqSuffix = evidence.weakPrerequisiteName
    ? ` (gợi ý củng cố kỹ năng nền tảng trước: "${evidence.weakPrerequisiteName}")`
    : "";
  const reason = overrides.customReason || (
    `Em sai ${evidence.wrongTotal}/${evidence.questionTotal} lượt về ${evidence.skillName}; ` +
    `${overrides.secondarySignal}.${prereqSuffix} → ${overrides.action}`
  );
  const pattern = evidence.topErrorPattern || "chưa có nhãn lỗi nổi trội";
  const evidenceText =
    `${evidence.skillWrong}/${evidence.skillTotal} lượt chưa đúng skill ` +
    `${evidence.skillId}, tag ${pattern} x${evidence.topErrorCount}`;

  return {
    id: "",
    title: overrides.title,
    type: overrides.type,
    skillId: evidence.skillId,
    mandatory: overrides.type === "remedial",
    reason,
    evidence: evidenceText,
    ruleId: overrides.ruleId,
    confidence: Math.round(clamp01(overrides.confidence) * 1e3) / 1e3,
    detailLevel: overrides.detailLevel || null,
    lessonId: null,
  };
}

function ruleR8(evidence: RecommendationInput): RecommendationOutput | null {
  if (evidence.masteryAfter >= 0.5) return null;
  let detailLevel: string;
  let desc: string;
  if (evidence.masteryAfter >= 0.4) {
    detailLevel = "nhe";
    desc = "cần ôn lại một khái niệm";
  } else if (evidence.masteryAfter >= 0.25) {
    detailLevel = "vua";
    desc = "cần ôn lại 2-3 khái niệm liên quan";
  } else {
    detailLevel = "nang";
    desc = "cần ôn lại từ đầu, nhiều khái niệm";
  }
  const gap = 0.5 - evidence.masteryAfter;
  return buildRecommendation(evidence, {
    ruleId: "R8",
    title: "Ôn tập kỹ năng còn yếu",
    type: "remedial",
    secondarySignal: `kỹ năng "${evidence.skillName}" đang ở mức ${Math.round(evidence.masteryAfter * 100)}% — ${desc}`,
    action: "Học bài bổ trợ được gán rồi làm bài kiểm tra lại.",
    confidence: Math.min(1, 0.5 + gap),
    detailLevel,
  });
}

function ruleR7(evidence: RecommendationInput): RecommendationOutput | null {
  if (evidence.lessonType !== "chapter_test" || evidence.score >= 0.7) return null;
  const ratio = evidence.wrongTotal / Math.max(1, evidence.questionTotal);
  return buildRecommendation(evidence, {
    ruleId: "R7",
    title: "Ôn lại trước khi sang chương mới",
    type: "remedial",
    secondarySignal: `bài kiểm tra chỉ đạt ${evidence.questionTotal - evidence.wrongTotal}/${evidence.questionTotal} câu đúng`,
    action: "Học bài bổ trợ được gán rồi làm lại bài kiểm tra.",
    confidence: 0.55 + 0.45 * ratio,
  });
}

function ruleR3(evidence: RecommendationInput): RecommendationOutput | null {
  if (evidence.skillWrong < 3) return null;
  const ratio = evidence.skillWrong / Math.max(1, evidence.skillTotal);
  return buildRecommendation(evidence, {
    ruleId: "R3",
    title: "Luyện thêm đúng chỗ đang vướng",
    type: "remedial",
    secondarySignal: `${evidence.skillWrong}/${evidence.skillTotal} lượt thuộc cùng kỹ năng chưa đúng`,
    action: "Làm bài bổ trợ ngắn tập trung vào lỗi vừa gặp.",
    confidence: 0.5 + 0.5 * ratio,
  });
}

function ruleR1(evidence: RecommendationInput): RecommendationOutput | null {
  if (evidence.hintCount < 3) return null;
  return buildRecommendation(evidence, {
    ruleId: "R1",
    title: "Xem lại ví dụ có hướng dẫn",
    type: "remedial",
    secondarySignal: `em đã dùng ${evidence.hintCount} gợi ý trong phần này`,
    action: "Xem bài bổ trợ có từng bước giải trước khi thử lại.",
    confidence: Math.min(1, 0.55 + 0.1 * evidence.hintCount),
  });
}

function ruleR2(evidence: RecommendationInput): RecommendationOutput | null {
  if (evidence.classMedian === null || evidence.classMedian <= 0 || evidence.responseTimePerItem <= 2 * evidence.classMedian) {
    return null;
  }
  const ratio = evidence.responseTimePerItem / evidence.classMedian;
  return buildRecommendation(evidence, {
    ruleId: "R2",
    title: "Xem cách mô phỏng từng bước",
    type: "visualize",
    secondarySignal: `thời gian xử lý trung bình ${Math.round(evidence.responseTimePerItem)} giây, gấp ${ratio.toFixed(1)} lần trung vị lớp`,
    action: "Xem mô phỏng từng bước rồi thử lại để cải thiện tốc độ.",
    confidence: Math.min(1, 0.5 + 0.1 * ratio),
  });
}

function ruleR9(evidence: RecommendationInput): RecommendationOutput | null {
  if (!evidence.daysSinceLastPractice || evidence.daysSinceLastPractice < 7) return null;
  if ((evidence.retentionRate ?? 1) >= REVIEW_RETENTION_THRESHOLD) return null;
  const days = Math.round(evidence.daysSinceLastPractice);
  const retPct = Math.round((evidence.retentionRate ?? 0.7) * 100);
  return buildRecommendation(evidence, {
    ruleId: "R9",
    title: "Ôn nhanh để tránh quên",
    type: "verify",
    secondarySignal: `đã ${days} ngày chưa luyện lại (độ lưu giữ còn ~${retPct}%)`,
    action: "Làm nhanh 1 bài ngắn để gia cố trí nhớ dài hạn.",
    confidence: Math.min(0.95, 0.55 + 0.35 * (1 - (evidence.retentionRate ?? 0.7))),
    customReason: `Đã ${days} ngày em chưa ôn "${evidence.skillName}" (mức lưu giữ ước tính ${retPct}%). → Làm lại 1 bài ngắn để tránh quên kiến thức.`,
  });
}

const RULES = [ruleR8, ruleR7, ruleR3, ruleR1, ruleR2];

function runRules(evidence: RecommendationInput): RecommendationOutput | null {
  for (const rule of RULES) {
    const result = rule(evidence);
    if (result) return result;
  }
  return null;
}

function computeMedian(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ── Unified Recommendation Generation ──

export async function generateRecommendations(
  userId: string,
  skillStates?: SkillState[],
): Promise<RecommendationOutput[]> {
  const states = skillStates || (await getSkillStates(userId));
  const stateBySkill = new Map(states.map((s) => [s.skillId, s]));

  // Mark active recommendations as completed once mastery reaches >= 0.65 and not due for review
  const resolvedSkillIds = states
    .filter((state) => state.hasEvidence && state.mastery >= 0.65 && !state.dueForReview)
    .map((state) => state.skillId);
  if (resolvedSkillIds.length > 0) {
    await prisma.recommendation.updateMany({
      where: { userId, status: "active", skillId: { in: resolvedSkillIds } },
      data: { status: "completed", completedAt: new Date() },
    });
  }

  // Link skills to real lessons via approved QuizQuestion tags and Assignments
  const lessonBySkill = new Map<string, string>();
  const [taggedQuestions, taggedAssignments] = await Promise.all([
    prisma.quizQuestion.findMany({
      where: { skillTagStatus: "approved", skillId: { not: null } },
      select: {
        skillId: true,
        orderIndex: true,
        quiz: { select: { lessonId: true, orderIndex: true } },
      },
      orderBy: [{ quiz: { orderIndex: "asc" } }, { orderIndex: "asc" }],
    }),
    prisma.assignment.findMany({
      where: {
        lessonId: { not: null },
        problem: { skillTagStatus: "approved", skillId: { not: null } },
      },
      select: {
        lessonId: true,
        problem: { select: { skillId: true } },
      },
    }),
  ]);
  for (const row of taggedQuestions) {
    if (row.skillId && !lessonBySkill.has(row.skillId)) {
      lessonBySkill.set(row.skillId, row.quiz.lessonId);
    }
  }
  for (const a of taggedAssignments) {
    const sid = a.problem?.skillId;
    if (sid && a.lessonId && !lessonBySkill.has(sid)) {
      lessonBySkill.set(sid, a.lessonId);
    }
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const [recentEvidence, weaknessTags, hintReveals, studentProblemTimes, studentQuizTimes] = await Promise.all([
    prisma.skillEvidence.findMany({
      where: { userId, occurredAt: { gte: thirtyDaysAgo } },
      orderBy: { occurredAt: "desc" },
    }),
    prisma.studentWeaknessTag.findMany({
      where: { userId, status: "active" },
      orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
    }),
    prisma.hintReveal.findMany({
      where: { userId },
      select: { problemId: true },
    }),
    prisma.problemSubmission.findMany({
      where: { studentId: userId, activeTimeSeconds: { not: null }, createdAt: { gte: thirtyDaysAgo } },
      select: { activeTimeSeconds: true, problem: { select: { skillId: true, skillTagStatus: true } } },
    }),
    prisma.quizQuestionResponse.findMany({
      where: { userId, skillTagStatus: "approved", skillId: { not: null }, activeTimeMs: { not: null }, createdAt: { gte: thirtyDaysAgo } },
      select: { skillId: true, activeTimeMs: true },
    }),
  ]);

  // Aggregate recent evidence per skill across ALL 8 sources
  const statsBySkill = new Map<
    string,
    { wrong: number; total: number; sources: Set<string>; problemIds: Set<string>; hasExamOrChapter: boolean }
  >();
  for (const row of recentEvidence) {
    let st = statsBySkill.get(row.skillId);
    if (!st) {
      st = { wrong: 0, total: 0, sources: new Set(), problemIds: new Set(), hasExamOrChapter: false };
      statsBySkill.set(row.skillId, st);
    }
    st.total += 1;
    if (!row.isCorrect) st.wrong += 1;
    st.sources.add(row.source);
    if (row.source === "problem") st.problemIds.add(row.contextId);
    if (row.source === "exam" || row.source === "adaptive_test") st.hasExamOrChapter = true;
  }

  const hintCountByProblem = new Map<string, number>();
  for (const h of hintReveals) {
    hintCountByProblem.set(h.problemId, (hintCountByProblem.get(h.problemId) || 0) + 1);
  }

  // Student response times per skill (seconds)
  const pushSample = (map: Map<string, number[]>, key: string, val: number) => {
    let list = map.get(key);
    if (!list) {
      list = [];
      map.set(key, list);
    }
    list.push(val);
  };
  const studentTimesBySkill = new Map<string, number[]>();
  for (const sub of studentProblemTimes) {
    const sid = sub.problem?.skillTagStatus === "approved" ? sub.problem.skillId : null;
    if (sid && sub.activeTimeSeconds && sub.activeTimeSeconds > 0) {
      pushSample(studentTimesBySkill, sid, sub.activeTimeSeconds);
    }
  }
  for (const qr of studentQuizTimes) {
    if (qr.skillId && qr.activeTimeMs && qr.activeTimeMs > 0) {
      pushSample(studentTimesBySkill, qr.skillId, qr.activeTimeMs / 1000);
    }
  }

  // Real class medians for skills that the student attempted recently
  const relevantSkillIds = Array.from(statsBySkill.keys());
  const classMedianBySkill = new Map<string, number>();
  if (relevantSkillIds.length > 0) {
    const [classQuizRows, classProblemRows] = await Promise.all([
      prisma.quizQuestionResponse.findMany({
        where: { skillId: { in: relevantSkillIds }, skillTagStatus: "approved", activeTimeMs: { not: null } },
        select: { skillId: true, activeTimeMs: true },
        take: 1000,
      }),
      prisma.problemSubmission.findMany({
        where: {
          activeTimeSeconds: { not: null },
          problem: { skillId: { in: relevantSkillIds }, skillTagStatus: "approved" },
        },
        select: { activeTimeSeconds: true, problem: { select: { skillId: true } } },
        take: 1000,
      }),
    ]);
    const classSamples = new Map<string, number[]>();
    for (const r of classQuizRows) {
      if (r.skillId && r.activeTimeMs && r.activeTimeMs > 0) {
        pushSample(classSamples, r.skillId, r.activeTimeMs / 1000);
      }
    }
    for (const r of classProblemRows) {
      const sid = r.problem?.skillId;
      if (sid && r.activeTimeSeconds && r.activeTimeSeconds > 0) {
        pushSample(classSamples, sid, r.activeTimeSeconds);
      }
    }
    for (const [sid, samples] of classSamples) {
      if (samples.length >= 4) {
        const med = computeMedian(samples);
        if (med !== null) classMedianBySkill.set(sid, med);
      }
    }
  }

  const topWeaknessTag = weaknessTags[0] || null;
  const pickWeaknessTagForSkill = (skillName: string) => {
    const lowerName = skillName.toLowerCase();
    const matched = weaknessTags.find((wt) =>
      wt.tag.toLowerCase().split(/\s+/).some((tok) => tok.length >= 3 && lowerName.includes(tok)),
    );
    return matched || topWeaknessTag;
  };

  // Pre-load active recommendations to avoid duplicate rule spam
  const existingActive = await prisma.recommendation.findMany({
    where: { userId, status: "active" },
    select: { skillId: true, ruleId: true },
  });
  const activeKeys = new Set(existingActive.map((r) => `${r.skillId}:${r.ruleId}`));
  const results: RecommendationOutput[] = [];

  async function createRecommendationIfNew(rec: RecommendationOutput): Promise<boolean> {
    const key = `${rec.skillId}:${rec.ruleId}`;
    if (activeKeys.has(key)) return false;
    rec.lessonId = lessonBySkill.get(rec.skillId) || null;
    const saved = await prisma.recommendation.create({
      data: {
        userId,
        skillId: rec.skillId,
        type: rec.type,
        title: rec.title,
        reason: rec.reason,
        evidence: rec.evidence,
        ruleId: rec.ruleId,
        confidence: rec.confidence,
        mandatory: rec.mandatory,
        detailLevel: rec.detailLevel,
        lessonId: rec.lessonId,
      },
    });
    activeKeys.add(key);
    await prisma.recommendationLog.create({
      data: {
        userId,
        recommendationId: saved.id,
        ruleId: rec.ruleId,
        skillId: rec.skillId,
        reason: rec.reason,
        evidence: rec.evidence,
        confidence: rec.confidence,
        action: "created",
      },
    });
    results.push({ ...rec, id: saved.id });
    return true;
  }

  for (const [skillId, stat] of statsBySkill) {
    const state = stateBySkill.get(skillId);
    if (!state) continue;
    let hintCount = 0;
    for (const pid of stat.problemIds) {
      hintCount += hintCountByProblem.get(pid) || 0;
    }

    const timeSamples = studentTimesBySkill.get(skillId) || [];
    const avgTime = timeSamples.length > 0
      ? timeSamples.reduce((a, b) => a + b, 0) / timeSamples.length
      : 30;
    const tagMatch = pickWeaknessTagForSkill(state.name);
    const weakPrereq = state.weakPrerequisites?.[0];

    const evidence: RecommendationInput = {
      userId,
      skillId,
      skillName: state.name,
      wrongTotal: stat.wrong,
      questionTotal: stat.total,
      skillWrong: stat.wrong,
      skillTotal: stat.total,
      hintCount,
      responseTimePerItem: avgTime,
      classMedian: classMedianBySkill.get(skillId) ?? null,
      masteryAfter: state.mastery,
      lessonType: stat.hasExamOrChapter ? "chapter_test" : "lesson_quiz",
      score: (stat.total - stat.wrong) / Math.max(1, stat.total),
      topErrorPattern: tagMatch?.tag ?? null,
      topErrorCount: tagMatch?.severity ?? 0,
      weakPrerequisiteName: weakPrereq?.name ?? null,
      daysSinceLastPractice: state.daysSinceLastPractice ?? null,
      retentionRate: state.retentionRate ?? null,
    };

    const rec = (stat.wrong > 0 || hintCount >= 3 || (evidence.classMedian !== null && avgTime > 2 * evidence.classMedian))
      ? runRules(evidence)
      : null;

    if (rec) {
      await createRecommendationIfNew(rec);
    }

    // Also evaluate prerequisite root-cause skill if it is weak too
    if (weakPrereq && weakPrereq.mastery < 0.5) {
      const prereqEvidence: RecommendationInput = {
        ...evidence,
        skillId: weakPrereq.skillId,
        skillName: weakPrereq.name,
        masteryAfter: weakPrereq.mastery,
        weakPrerequisiteName: null,
      };
      const prereqRec = ruleR8(prereqEvidence);
      if (prereqRec) await createRecommendationIfNew(prereqRec);
    }
  }

  // Check all evidenced skills for forgetting risk (Rule R9)
  for (const state of states) {
    if (!state.hasEvidence || !state.dueForReview) continue;
    if ((state.rawMastery ?? state.mastery) < 0.58) continue;
    const tagMatch = pickWeaknessTagForSkill(state.name);
    const rec = ruleR9({
      userId,
      skillId: state.skillId,
      skillName: state.name,
      wrongTotal: 0,
      questionTotal: state.evidenceCount,
      skillWrong: 0,
      skillTotal: state.evidenceCount,
      hintCount: 0,
      responseTimePerItem: 30,
      classMedian: null,
      masteryAfter: state.mastery,
      lessonType: "lesson_quiz",
      score: state.mastery,
      topErrorPattern: tagMatch?.tag ?? null,
      topErrorCount: tagMatch?.severity ?? 0,
      daysSinceLastPractice: state.daysSinceLastPractice ?? null,
      retentionRate: state.retentionRate ?? null,
    });
    if (rec) await createRecommendationIfNew(rec);
  }

  return results;
}

// ── Queries (1 query for all 71 skills!) ──

export async function getSkillStates(userId: string): Promise<SkillState[]> {
  const rows = await prisma.studentSkillMastery.findMany({
    where: { userId },
  });
  const storedMap: StoredSkillMap = new Map();
  for (const row of rows) {
    storedMap.set(row.skillId, {
      value: row.value,
      trend: row.trend,
      history: parseHistoryJson(row.historyJson),
    });
  }
  return buildEnrichedSkillStates(storedMap, new Date());
}

export async function getActiveRecommendations(userId: string) {
  return prisma.recommendation.findMany({
    where: { userId, status: "active" },
    orderBy: { createdAt: "desc" },
  });
}

export async function dismissRecommendation(recommendationId: string, userId: string) {
  const rec = await prisma.recommendation.findUnique({ where: { id: recommendationId } });
  if (!rec || rec.userId !== userId) throw new Error("Không tìm thấy đề xuất");

  await prisma.recommendation.update({
    where: { id: recommendationId },
    data: { status: "dismissed", dismissedAt: new Date() },
  });

  await prisma.recommendationLog.create({
    data: {
      userId,
      recommendationId,
      ruleId: rec.ruleId,
      skillId: rec.skillId,
      reason: rec.reason,
      evidence: rec.evidence,
      confidence: rec.confidence,
      action: "dismissed",
    },
  });
}

// ── Seed ──

export async function syncSkillCatalog(): Promise<void> {
  for (const seed of SKILL_SEEDS) {
    await prisma.skill.upsert({
      where: { skillId: seed.skillId },
      create: {
        skillId: seed.skillId,
        topicId: seed.topicId,
        topicName: seed.topicName,
        name: seed.name,
        description: seed.description,
        orderIndex: seed.orderIndex,
      },
      update: {
        topicId: seed.topicId,
        topicName: seed.topicName,
        name: seed.name,
        description: seed.description,
        orderIndex: seed.orderIndex,
      },
    });
  }
  console.log(`[SkillGraph] Synchronized ${SKILL_SEEDS.length} canonical skills`);
}

export const seedSkillsIfEmpty = syncSkillCatalog;
