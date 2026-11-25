/**
 * Skill Mastery Engine — ported from hackathon/Vietnam-AI-Innovation/backend/app/services/
 * (mastery.py + engines.py + rules.py)
 *
 * Two engines:
 *   EWMA (default) — explainable, no calibration needed
 *   BKT (experimental) — Bayesian Knowledge Tracing, needs per-skill calibration
 *
 * Rule engine: R1-R8 for generating personalized recommendations.
 */

import prisma from "../utils/prisma";
import { SKILL_SEEDS, skillIdToName } from "../utils/skillGraph";

// ── Types ──

export interface Observation {
  outcomes: boolean[]; // per-item correctness
  attempt: number; // submission attempt number (1-based)
  timeFactor: number; // 0.0–1.0, computed from response_time vs class_median
  hintCount: number; // number of hints used
  difficulty?: number; // 1-5 average difficulty of the items (default 3 = medium)
  difficulties?: number[]; // per-item difficulty (1-5), aligned with outcomes; overrides difficulty for BKT
  itemWeights?: number[]; // per-item evidence weight (default 1); <1 discounts guessed/careless answers
}

export interface SkillState {
  skillId: string;
  name: string;
  mastery: number; // 0.0 → 1.0; 0.5 is only a display fallback when unknown
  trend: "up" | "down" | "flat";
  hasEvidence: boolean;
  evidenceCount: number;
  lowerBound?: number;
  upperBound?: number;
  confidenceLevel?: "low" | "forming" | "medium" | "high";
}

type MasteryHistoryEntry = { ts: string; value: number };

/**
 * Conservative uncertainty band for the current mastery estimate.
 *
 * The mastery engine remains the source of the central value. This layer uses
 * the same persisted, deduplicated evidence history: the band narrows with
 * more evidence and stays wider when recent mastery observations disagree.
 * It is intentionally labelled as an estimate until it is calibrated against
 * held-out student responses.
 */
export function estimateMasteryUncertainty(mastery: number, history: MasteryHistoryEntry[]) {
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
    lowerBound: Math.round(lowerBound * 1e4) / 1e4,
    upperBound: Math.round(upperBound * 1e4) / 1e4,
    confidenceLevel,
  };
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
  lessonType: string; // "lesson_quiz" | "chapter_test" | "adaptive_test"
  score: number; // 0.0–1.0
  topErrorPattern: string | null;
  topErrorCount: number;
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

// ── EWMA Engine ──

/**
 * Compute a raw signal from a student's answer session.
 * Formula: 0.4×correctness + 0.2×attempt_factor + 0.2×time_factor + 0.2×hint_factor
 */
/**
 * Compute a difficulty-aware signal.
 * Formula: 0.4×correctness + 0.2×attempt + 0.15×time + 0.15×hint + 0.1×difficultyBonus
 * Hard questions (difficulty 4-5) increase signal ceiling; easy ones reduce it.
 */
export function calculateSignal(
  correctness: number,
  attempt: number,
  timeFactor: number,
  hintCount: number,
  difficulty: number = 3,
): number {
  const attemptFactor = 1 / Math.max(1, attempt);
  const hintFactor = Math.max(0, 1 - 0.25 * Math.max(0, hintCount));
  // Difficulty changes the meaning of the outcome: hard-correct is stronger,
  // easy-wrong is more concerning. It must not reward a wrong hard answer.
  const difficultyLevel = Math.max(0, Math.min(1, (difficulty - 1) / 4));
  const difficultyBonus = correctness >= 0.5
    ? 0.1 * difficultyLevel
    : -0.1 * (1 - difficultyLevel);
  const signal =
    0.4 * correctness + 0.2 * attemptFactor + 0.15 * timeFactor + 0.15 * hintFactor + 0.1 * difficultyBonus;
  return Math.min(1, Math.max(0, signal));
}

/**
 * EWMA update: 0.7 × prior + 0.3 × new_signal. Explainable, no calibration.
 */
export function ewmaUpdate(prior: number, observation: Observation): number {
  if (observation.outcomes.length === 0) return Math.min(1, Math.max(0, prior));
  const correctness = observation.outcomes.filter(Boolean).length / observation.outcomes.length;
  const signal = calculateSignal(
    correctness,
    observation.attempt,
    observation.timeFactor,
    observation.hintCount,
    observation.difficulty ?? 3,
  );
  return Math.min(1, Math.max(0, 0.7 * prior + 0.3 * signal));
}

// ── BKT Engine (experimental) ──

export interface BKTParams {
  pL0: number; // prior probability student knows the skill
  pT: number; // probability of learning the skill in one step
  pSlip: number; // probability of slip (knows but answers wrong)
  pGuess: number; // probability of guess (doesn't know but answers right)
}

// pT kept modest: multi-item quizzes already move the posterior a lot per
// session; a large pT then piles learning on top and every diligent student
// saturates near the ceiling after 2–3 quizzes.
export const DEFAULT_BKT: BKTParams = { pL0: 0.2, pT: 0.08, pSlip: 0.1, pGuess: 0.25 };

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Guessing detection from population option spread. Weights are deliberately
 * mild (0.9–1.0) so evidence tuning nudges rather than crushes BKT.
 *
 * When enough students have answered a question, the option distribution
 * reveals whether a student's answer is committed or accidental:
 * - Correct on a near-trivially-easy item (≥90% class correct): the knowledge
 *   isn't really demonstrated (standard pGuess already discounts guessing).
 * - Correct on a well-discriminating item (<80%): full weight.
 * - Wrong choosing a rare option (<25%): likely careless slip or random
 *   click, mildly discounted.
 * - Wrong choosing a popular distractor (≥25%): committed error, full weight.
 *
 * @returns  0.9–1.0 weight multiplier on the BKT posterior; 1 when the
 *           question has <6 class responses.
 */
export function computeItemEvidenceWeight(
  distribution: number[],
  selectedIndex: number,
  correctIndex: number,
  isCorrect: boolean,
): number {
  const total = distribution.reduce((sum, n) => sum + n, 0);
  if (total < 6) return 1; // too few class responses → no signal, neutral weight

  if (isCorrect) {
    const correctRate = (distribution[correctIndex] ?? 0) / total;
    if (correctRate >= 0.9) return 0.9;    // trivially easy → mildly weaker
    if (correctRate >= 0.8) return 0.95;   // commonly known → very slightly weaker
    return 1;                              // discriminating → full weight
  }
  const selectedRate = (distribution[selectedIndex] ?? 0) / total;
  return selectedRate >= 0.25 ? 1.0 : 0.9; // popular distractor → full; rare → mild guess discount
}

/**
 * Cap on how many independent Bernoulli trials one quiz/session is allowed to
 * count as. Items answered in the same sitting are highly correlated, so
 * treating 15 correct answers as 15 independent BKT updates saturates every
 * skill near the 0.98 ceiling after a single perfect quiz — which is exactly
 * what made every student profile look identical at ~98%.
 *
 * With MAX_SESSION_EVIDENCE = 1.5:
 *   1 correct item     → mild rise (~50–55%)
 *   1 perfect quiz     → solid (~65–75%), clearly not "mastered"
 *   2–3 good sessions  → high mastery
 *   many good sessions → near ceiling
 *   a single perfect quiz alone cannot look like full mastery
 */
const MAX_SESSION_EVIDENCE = 1.5;

/**
 * Session-level BKT update.
 *
 * A multi-item observation (one quiz attempt for one skill) is treated as a
 * SINGLE binomial evidence step, not N sequential Bayesian updates:
 *
 *   P(k correct | knows)    ∝ (1 − pSlip)^k · pSlip^(n−k)
 *   P(k correct | ¬knows)   ∝ pGuess^k · (1 − pGuess)^(n−k)
 *
 * The binomial coefficient cancels in the Bayes ratio. Log-space evaluation
 * keeps large n numerically stable. Within-session correlation is handled by
 * scaling the log-likelihood so the effective independent sample size never
 * exceeds MAX_SESSION_EVIDENCE.
 *
 * itemWeights (from option-distribution guessing detection) adjust the
 * effective correct/total counts before the binomial step. pT (learning) is
 * applied once after the posterior, diminished by attempt ordinal so retries
 * contribute less new learning. A soft floor/ceiling keeps p out of the
 * absorbing 0/1 states.
 */
export function bktUpdate(prior: number, observation: Observation, params: BKTParams = DEFAULT_BKT): number {
  const n = observation.outcomes.length;
  if (n === 0) return clamp01(prior);

  const weights = observation.itemWeights && observation.itemWeights.length === n
    ? observation.itemWeights
    : new Array<number>(n).fill(1);

  // Effective counts — itemWeights discount guessed/careless answers.
  let nEff = 0;
  let kEff = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.max(0, weights[i]);
    nEff += w;
    if (observation.outcomes[i]) kEff += w;
  }
  if (nEff <= 0) return clamp01(prior);

  // Correlated-item damping: one sitting cannot count as more than
  // MAX_SESSION_EVIDENCE independent observations.
  const scale = Math.min(1, MAX_SESSION_EVIDENCE / nEff);

  // Binomial likelihood in log space (coefficient cancels in Bayes ratio).
  const pCorrectKnow = Math.max(1e-6, Math.min(1 - 1e-6, 1 - params.pSlip));
  const pWrongKnow = Math.max(1e-6, Math.min(1 - 1e-6, params.pSlip));
  const pCorrectNot = Math.max(1e-6, Math.min(1 - 1e-6, params.pGuess));
  const pWrongNot = Math.max(1e-6, Math.min(1 - 1e-6, 1 - params.pGuess));
  const logLKnow = scale * (kEff * Math.log(pCorrectKnow) + (nEff - kEff) * Math.log(pWrongKnow));
  const logLNot = scale * (kEff * Math.log(pCorrectNot) + (nEff - kEff) * Math.log(pWrongNot));

  const p0 = clamp01(prior);
  const logNum = Math.log(Math.max(1e-12, p0)) + logLKnow;
  const logDenAlt = Math.log(Math.max(1e-12, 1 - p0)) + logLNot;
  // log-sum-exp for numerical stability
  const m = Math.max(logNum, logDenAlt);
  let posterior = Math.exp(logNum - m) / (Math.exp(logNum - m) + Math.exp(logDenAlt - m));
  if (!Number.isFinite(posterior)) posterior = p0;

  // Soft bounds — exact 0/1 are absorbing states BKT cannot leave.
  let p = Math.max(0.02, Math.min(0.98, clamp01(posterior)));

  // Learning once per session; retries bring diminishing new learning.
  p = p + (1 - p) * params.pT * (1 / Math.max(1, observation.attempt));
  return clamp01(p);
}

// ── Trend computation ──

function computeTrend(history: { ts: string; value: number }[]): "up" | "down" | "flat" {
  if (history.length < 6) return "flat";
  const delta = history[history.length - 1].value - history[history.length - 6].value;
  if (delta > 0.05) return "up";
  if (delta < -0.05) return "down";
  return "flat";
}

// ── Mastery update for one skill ──

async function updateMasteryForSkill(
  userId: string,
  skillId: string,
  observation: Observation,
  timestamp: string,
): Promise<SkillState> {
  const existing = await prisma.studentSkillMastery.findUnique({
    where: { userId_skillId: { userId, skillId } },
  });
  const skillName = skillIdToName(skillId);
  const prior = existing?.value ?? 0.5;
  const history: { ts: string; value: number }[] = existing
    ? (JSON.parse(existing.historyJson) || [])
    : [];

  // Full recalculation scans the student's history on every new submission.
  // Do not apply an assessment twice when its timestamp is already present.
  if (history.some((entry) => entry.ts === timestamp)) {
    return {
      skillId,
      name: skillName,
      mastery: Math.round(prior * 1e4) / 1e4,
      trend: (existing?.trend as "up" | "down" | "flat") || "flat",
      hasEvidence: Boolean(existing),
      evidenceCount: history.length,
    };
  }

  const newValue = ewmaUpdate(prior, observation);
  history.push({ ts: timestamp, value: Math.round(newValue * 1e6) / 1e6 });

  await prisma.studentSkillMastery.upsert({
    where: { userId_skillId: { userId, skillId } },
    create: {
      userId,
      skillId,
      value: newValue,
      trend: computeTrend(history),
      historyJson: JSON.stringify(history),
    },
    update: {
      value: newValue,
      trend: computeTrend(history),
      historyJson: JSON.stringify(history),
    },
  });

  return {
    skillId,
    name: skillName,
    mastery: Math.round(newValue * 1e4) / 1e4,
    trend: computeTrend(history),
    hasEvidence: true,
    evidenceCount: history.length,
  };
}

export type ReplayState = {
  value: number;
  history: { ts: string; value: number }[];
};

/** Apply one observation to an in-memory replay. Persisting happens once at the end. */
export function applyReplayObservation(
  replay: Map<string, ReplayState>,
  skillId: string,
  observation: Observation,
  timestamp: string,
  engine: "ewma" | "bkt" = "ewma",
  bktParams: BKTParams = DEFAULT_BKT,
) {
  const state = replay.get(skillId) || {
    // Use calibrated pL0 (prior knowledge) as starting point for BKT;
    // 0.5 is the display default for "unknown" but is not model-principled.
    value: engine === "bkt" ? bktParams.pL0 : 0.5,
    history: [],
  };
  const value = engine === "bkt"
    ? bktUpdate(state.value, observation, bktParams)
    : ewmaUpdate(state.value, observation);
  state.value = value;
  state.history.push({ ts: timestamp, value: Math.round(value * 1e6) / 1e6 });
  replay.set(skillId, state);
}

// ── Full recalculation for a student ──

/**
 * Recalculate mastery for all skills of a student by scanning their entire
 * quiz/problem/adaptive-test history. Called after each new submission.
 */
export async function recalculateMasteryForStudent(userId: string): Promise<SkillState[]> {
  const results: SkillState[] = [];
  const replay = new Map<string, ReplayState>();
  const engineRow = await prisma.engineSetting.findUnique({ where: { key: "mastery_engine" } });
  const bktRow = await prisma.engineSetting.findUnique({ where: { key: "bkt_params" } });
  const replayEngine: "ewma" | "bkt" = engineRow?.value === "bkt" ? "bkt" : "ewma";

  // Default BKT params (global fallback)
  let replayBktParams = DEFAULT_BKT;
  if (bktRow) {
    try { replayBktParams = { ...DEFAULT_BKT, ...JSON.parse(bktRow.value) }; } catch { /* use defaults */ }
  }

  // Pre-load per-skill calibrated params when BKT engine is active
  const skillBktOverrides = new Map<string, BKTParams>();
  if (replayEngine === "bkt") {
    const calibrations = await prisma.skillBktCalibration.findMany();
    for (const c of calibrations) {
      // Clamp to physically reasonable bounds — Baum-Welch EM can produce
      // pathological params on small classes (e.g. pGuess=0.85 for easy skills
      // where students ace the quiz, causing mastery to stay near pL0 forever).
      skillBktOverrides.set(c.skillId, {
        pL0: Math.min(0.5, Math.max(0.01, c.pL0)),
        // Cap pT hard — EM sometimes fits large transition probs that, combined
        // with multi-item quizzes, drive every active student to the ceiling.
        pT: Math.min(0.12, Math.max(0.02, c.pT)),
        pSlip: Math.min(0.3, Math.max(0.05, c.pSlip)),
        pGuess: Math.min(0.4, Math.max(0.05, c.pGuess)),
      });
    }
  }

  // Per-question empirical calibration (effective difficulty + population option
  // distribution) for BKT difficulty-weighting and guessing detection.  When a
  // calibration record exists, we use its effectiveDifficulty (a Bayesian blend
  // of authored and empirical) and optionDistribution to modulate evidence
  // strength.  This data is populated by calibrateQuestions.js / questionCalibration.
  const calibByQuestion = new Map<
    string,
    { difficulty: number; distribution: number[] }
  >();
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

  const applyReplay = (skillId: string, observation: Observation, timestamp: string) =>
    applyReplayObservation(
      replay,
      skillId,
      observation,
      timestamp,
      replayEngine,
      replayEngine === "bkt" ? (skillBktOverrides.get(skillId) || replayBktParams) : DEFAULT_BKT,
    );

  // Hint/time metadata still comes from the original tables (problem path only).
  // The sink stores pass/fail + difficulty; EWMA's time/hint factors need the
  // live submission rows. Failures here must not block the sink replay.
  const hintReveals = await prisma.hintReveal.findMany({
    where: { userId },
    select: { problemId: true, hintId: true },
  });
  const hintCountByProblem = new Map<string, number>();
  for (const h of hintReveals) {
    hintCountByProblem.set(h.problemId, (hintCountByProblem.get(h.problemId) || 0) + 1);
  }

  // problemId → { timeFactor, estimated lookup already baked in }
  const problemTimeByKey = new Map<string, number>(); // `${problemId}:${ordinal}` → timeFactor
  {
    const submissions = await prisma.problemSubmission.findMany({
      where: { studentId: userId },
      orderBy: { createdAt: "asc" },
      select: {
        problemId: true,
        activeTimeSeconds: true,
        problem: { select: { estimatedTime: true } },
      },
    });
    const ord = new Map<string, number>();
    for (const sub of submissions) {
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

  // ── Load ALL evidence from the unified sink ──
  // Writers (and the backfill script) already gated skillTagStatus === "approved"
  // at insert time, so every row here is trusted evidence.
  const evidenceRows = await prisma.skillEvidence.findMany({
    where: { userId },
    orderBy: { occurredAt: "asc" },
  });

  // Group by (skillId, sessionKey) → one Observation per skill-session.
  // Session-level BKT applies pT once per group (not per item).
  type EvGroup = {
    skillId: string;
    sessionKey: string;
    source: string;
    contextId: string;
    outcomes: boolean[];
    difficulties: number[];
    itemWeights: number[];
    occurredAt: Date;
    // For attempt ordinal derivation
    questionKeys: string[];
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
        questionKeys: [],
        // Ordinal snapshotted at write time — counts retries even when an
        // earlier attempt produced no tagged evidence of its own.
        attempt: Number.isFinite(row.attempt) ? Math.max(1, row.attempt) : 1,
      };
      groups.set(key, g);
    }
    g.outcomes.push(Boolean(row.isCorrect));
    // Prefer live calibrated difficulty for quiz/adaptive questionKeys when available;
    // otherwise fall back to the difficulty snapshotted at answer time.
    const calib = (row.source === "lesson_quiz" || row.source === "adaptive_test")
      ? calibByQuestion.get(row.questionKey)
      : undefined;
    const difficulty = calib
      ? calib.difficulty
      : Math.max(1, Math.min(5, Number.isFinite(row.difficultyUsed) ? Number(row.difficultyUsed) : 3));
    g.difficulties.push(difficulty);
    // Weight snapshotted at write time (default 1). Calib-based guessing discount
    // is applied at write time when available; replay trusts the stored value.
    g.itemWeights.push(Number.isFinite(row.weight) ? Number(row.weight) : 1);
    g.questionKeys.push(row.questionKey);
    if (row.occurredAt < g.occurredAt) g.occurredAt = row.occurredAt;
  }

  // Attempt ordinal rides on each evidence row (snapshotted at write time), so
  // retries are counted correctly even when an earlier attempt left no tagged
  // evidence. Problem rows additionally look up live time/hint metadata.
  for (const g of groups.values()) {
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

    applyReplay(g.skillId, {
      outcomes: g.outcomes,
      attempt,
      timeFactor,
      hintCount,
      difficulty: avgDifficulty,
      difficulties: g.difficulties,
      itemWeights: g.itemWeights,
    }, g.occurredAt.toISOString());
  }

  // 4. Replace canonical mastery atomically. Replaying always starts at the
  //   same prior (0.5 EWMA / calibrated pL0 for BKT), so repeated rebuilds
  //   cannot compound the same historical evidence.
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

  // Return all canonical skills. Missing evidence remains explicitly unknown.
  for (const seed of SKILL_SEEDS) {
    const state = replay.get(seed.skillId);
    results.push({
      skillId: seed.skillId,
      name: seed.name,
      mastery: state?.value ?? 0.5,
      trend: state ? computeTrend(state.history) : "flat",
      hasEvidence: Boolean(state),
      evidenceCount: state?.history.length ?? 0,
    });
  }

  // 5. Generate recommendations after recalc
  await generateRecommendations(userId, results);

  return results;
}

const recalculationQueues = new Map<string, Promise<SkillState[]>>();
const lastRecalculationAt = new Map<string, number>();
// A rebuild replays the student's full history and rewrites every skill row in
// one SQLite transaction. Coalesce bursts (one rebuild per student at a time)
// and cap the frequency so a busy class cannot serialize the DB write lock.
const RECALC_MIN_INTERVAL_MS = 2 * 60 * 1000;

/** Serialize background rebuilds per student so concurrent submissions do not race. */
export function queueMasteryRecalculation(userId: string): Promise<SkillState[]> {
  const inFlight = recalculationQueues.get(userId);
  if (inFlight) return inFlight;
  if (Date.now() - (lastRecalculationAt.get(userId) || 0) < RECALC_MIN_INTERVAL_MS) {
    return Promise.resolve([]);
  }
  const next = recalculateMasteryForStudent(userId);
  recalculationQueues.set(userId, next);
  next.then(
    () => {
      lastRecalculationAt.set(userId, Date.now());
      if (recalculationQueues.get(userId) === next) recalculationQueues.delete(userId);
    },
    () => { if (recalculationQueues.get(userId) === next) recalculationQueues.delete(userId); },
  );
  return next;
}

// ── Rule Engine (R1-R8) ──

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
  },
): RecommendationOutput {
  const reason =
    `Em sai ${evidence.wrongTotal}/${evidence.questionTotal} câu về ${evidence.skillName}; ` +
    `${overrides.secondarySignal}. → ${overrides.action}`;
  const pattern = evidence.topErrorPattern || "chưa có nhãn lỗi nổi trội";
  const evidenceText =
    `${evidence.skillWrong}/${evidence.skillTotal} câu sai skill ` +
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
    confidence: Math.round(Math.min(1, Math.max(0, overrides.confidence)) * 1e3) / 1e3,
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
    secondarySignal: `bài kiểm tra cuối chương chỉ đạt ${evidence.questionTotal - evidence.wrongTotal}/${evidence.questionTotal} câu đúng`,
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
    secondarySignal: `${evidence.skillWrong}/${evidence.skillTotal} câu thuộc cùng kỹ năng chưa đúng`,
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
    secondarySignal: `em đã dùng ${evidence.hintCount} gợi ý trong bài này`,
    action: "Xem bài bổ trợ có từng bước giải trước khi thử lại.",
    confidence: Math.min(1, 0.55 + 0.1 * evidence.hintCount),
  });
}

function ruleR2(evidence: RecommendationInput): RecommendationOutput | null {
  if (evidence.classMedian === null || evidence.responseTimePerItem <= 2 * evidence.classMedian) {
    return null;
  }
  const ratio = evidence.responseTimePerItem / evidence.classMedian;
  return buildRecommendation(evidence, {
    ruleId: "R2",
    title: "Xem cách mô phỏng từng bước",
    type: "visualize",
    secondarySignal: `thời gian mỗi câu ${Math.round(evidence.responseTimePerItem)} giây, gấp ${ratio.toFixed(1)} lần trung vị lớp`,
    action: "Xem mô phỏng từng bước rồi trả lời lại.",
    confidence: Math.min(1, 0.5 + 0.1 * ratio),
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

// ── Recommendation generation ──

export async function generateRecommendations(
  userId: string,
  skillStates?: SkillState[],
): Promise<RecommendationOutput[]> {
  // Get current mastery states
  const states =
    skillStates ||
    (await getSkillStates(userId));

  // Resolve recommendations when the student has demonstrated the skill,
  // preventing old active gaps from remaining visible forever.
  const resolvedSkillIds = states
    .filter((state) => state.hasEvidence && state.mastery >= 0.65)
    .map((state) => state.skillId);
  if (resolvedSkillIds.length > 0) {
    await prisma.recommendation.updateMany({
      where: { userId, status: "active", skillId: { in: resolvedSkillIds } },
      data: { status: "completed", completedAt: new Date() },
    });
  }

  // Connect a recommendation to a real lesson via APPROVED question tags only.
  // Title-based guessing was removed: an untagged lesson simply contributes no
  // link (invariant #2 — only approved tags may drive assessment outputs).
  const lessonBySkill = new Map<string, string>();
  const taggedQuestions = await prisma.quizQuestion.findMany({
    where: { skillTagStatus: "approved", skillId: { not: null } },
    select: {
      skillId: true,
      orderIndex: true,
      quiz: { select: { lessonId: true, orderIndex: true } },
    },
    orderBy: [{ quiz: { orderIndex: "asc" } }, { orderIndex: "asc" }],
  });
  for (const row of taggedQuestions) {
    if (!row.skillId) continue;
    if (!lessonBySkill.has(row.skillId)) lessonBySkill.set(row.skillId, row.quiz.lessonId);
  }

  // Gather evidence from recent quiz attempts
  const recentAttempts = await prisma.quizAttempt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { quiz: { include: { lesson: true } } },
  });

  const results: RecommendationOutput[] = [];

  // Per-skill quiz evidence comes only from approved tags snapshotted on the
  // stored responses. Attempts without approved tags produce no quiz-based
  // recommendations (title-based guessing was removed on purpose).
  const attemptIds = recentAttempts.map((a) => a.id);
  const responseRows = attemptIds.length
    ? await prisma.quizQuestionResponse.findMany({
        where: {
          attemptId: { in: attemptIds },
          skillTagStatus: "approved",
          skillId: { not: null },
        },
        select: { attemptId: true, skillId: true, isCorrect: true },
      })
    : [];
  const skillsByAttempt = new Map<string, Map<string, { wrong: number; total: number }>>();
  for (const row of responseRows) {
    if (!row.skillId) continue;
    let perSkill = skillsByAttempt.get(row.attemptId);
    if (!perSkill) {
      perSkill = new Map();
      skillsByAttempt.set(row.attemptId, perSkill);
    }
    const stat = perSkill.get(row.skillId) || { wrong: 0, total: 0 };
    stat.total += 1;
    if (!row.isCorrect) stat.wrong += 1;
    perSkill.set(row.skillId, stat);
  }

  // Pre-load existing ACTIVE recommendations to avoid duplicates (spam prevention)
  const existingActive = await prisma.recommendation.findMany({
    where: { userId, status: "active" },
    select: { skillId: true, ruleId: true },
  });
  const activeKeys = new Set(existingActive.map((r) => `${r.skillId}:${r.ruleId}`));

  /** Returns true if an active recommendation for this skill+rule already exists */
  const isDuplicate = (skillId: string, ruleId: string) => activeKeys.has(`${skillId}:${ruleId}`);

  /** Creates a recommendation (and audit log) only if not a duplicate. */
  async function createRecommendationIfNew(rec: RecommendationOutput): Promise<boolean> {
    if (isDuplicate(rec.skillId, rec.ruleId)) return false;
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
    activeKeys.add(`${rec.skillId}:${rec.ruleId}`); // prevent dup within same run too
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

  for (const attempt of recentAttempts) {
    const perSkill = skillsByAttempt.get(attempt.id);
    if (!perSkill || perSkill.size === 0) continue;

    for (const [skillId, stat] of perSkill) {
      if (stat.wrong === 0) continue;
      const state = states.find((s) => s.skillId === skillId);
      const evidence: RecommendationInput = {
        userId,
        skillId,
        skillName: skillIdToName(skillId),
        wrongTotal: stat.wrong,
        questionTotal: stat.total,
        skillWrong: stat.wrong,
        skillTotal: stat.total,
        hintCount: 0,
        responseTimePerItem: 30, // default 30s per item
        classMedian: null, // no class data yet
        masteryAfter: state?.mastery ?? 0.5,
        lessonType: attempt.quiz?.lesson?.moduleId ? "lesson_quiz" : "chapter_test",
        score: attempt.score / Math.max(1, attempt.totalQuestions),
        topErrorPattern: null,
        topErrorCount: 0,
      };

      const rec = runRules(evidence);
      if (rec) {
        await createRecommendationIfNew(rec);
      }
    }
  }

  // Also gather evidence from recent PROBLEM submissions (not just quizzes)
  const problemHintReveals = await prisma.hintReveal.findMany({
    where: { userId },
    select: { problemId: true, hintId: true },
  });
  const problemHintCounts = new Map<string, number>();
  for (const h of problemHintReveals) {
    problemHintCounts.set(h.problemId, (problemHintCounts.get(h.problemId) || 0) + 1);
  }

  const recentProblems = await prisma.problemSubmission.findMany({
    where: { studentId: userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      problem: {
        select: {
          id: true,
          title: true,
          skillId: true,
          skillTagStatus: true,
          aiSkillSuggest: true,
          estimatedTime: true,
        },
      },
    },
  });

  // Group by skill and count wrong submissions
  const problemSkillStats = new Map<
    string,
    { wrong: number; total: number; hintCount: number; totalTime: number }
  >();
  for (const sub of recentProblems) {
    const skillId =
      sub.problem?.skillTagStatus === "approved" && sub.problem?.skillId
        ? sub.problem.skillId
        : null;
    if (!skillId) continue;

    const stat = problemSkillStats.get(skillId) || {
      wrong: 0,
      total: 0,
      hintCount: 0,
      totalTime: 0,
    };
    stat.total++;
    if (!sub.passed) stat.wrong++;
    stat.hintCount += problemHintCounts.get(sub.problemId) || 0;
    if (sub.activeTimeSeconds) stat.totalTime += sub.activeTimeSeconds;
    problemSkillStats.set(skillId, stat);
  }

  for (const [skillId, stat] of problemSkillStats) {
    if (stat.wrong === 0) continue;
    const state = states.find((s) => s.skillId === skillId);
    const avgTime =
      stat.total > 0 ? Math.round(stat.totalTime / stat.total) : 30;

    const evidence: RecommendationInput = {
      userId,
      skillId,
      skillName: skillIdToName(skillId),
      wrongTotal: stat.wrong,
      questionTotal: stat.total,
      skillWrong: stat.wrong,
      skillTotal: stat.total,
      hintCount: stat.hintCount,
      responseTimePerItem: avgTime,
      classMedian: null,
      masteryAfter: state?.mastery ?? 0.5,
      lessonType: "chapter_test", // problems are practice, treat as self-test
      score: (stat.total - stat.wrong) / Math.max(1, stat.total),
      topErrorPattern: null,
      topErrorCount: 0,
    };

    const rec = runRules(evidence);
    if (rec) {
      await createRecommendationIfNew(rec);
    }
  }

  return results;
}

// ── Queries ──

export async function getSkillStates(userId: string): Promise<SkillState[]> {
  const results: SkillState[] = [];
  for (const seed of SKILL_SEEDS) {
    const existing = await prisma.studentSkillMastery.findUnique({
      where: { userId_skillId: { userId, skillId: seed.skillId } },
    });
    let history: MasteryHistoryEntry[] = [];
    if (existing) {
      try { history = JSON.parse(existing.historyJson || "[]") as MasteryHistoryEntry[]; } catch { history = []; }
    }
    const evidenceCount = history.length;
    const uncertainty = evidenceCount > 0 ? estimateMasteryUncertainty(existing?.value ?? 0.5, history) : null;
    results.push({
      skillId: seed.skillId,
      name: seed.name,
      mastery: existing?.value ?? 0.5,
      trend: (existing?.trend as "up" | "down" | "flat") || "flat",
      hasEvidence: evidenceCount > 0,
      evidenceCount,
      ...uncertainty,
    });
  }
  return results;
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

/** Backward-compatible startup hook; unlike the old implementation it also updates changed seeds. */
export const seedSkillsIfEmpty = syncSkillCatalog;
