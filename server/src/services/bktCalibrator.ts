/**
 * BKT Calibrator — extract real observation sequences from student data,
 * then run EM (Baum-Welch) to fit per-skill BKT parameters.
 *
 * Reference: "Using Data-Driven Discovery of Better Student Models" (Baker et al.)
 * Each skill gets its own {pL0, pT, pSlip, pGuess} fitted from the sequences
 * observed across all students who have attempted that skill.
 */

import prisma from "../utils/prisma";
import { SKILL_SEEDS } from "../utils/skillGraph";

// ── Types ──

export interface BktParams {
  pL0: number;
  pT: number;
  pSlip: number;
  pGuess: number;
}

export interface CalibrationResult extends BktParams {
  skillId: string;
  sampleSize: number; // number of student sequences
  totalEvents: number; // total observations consolidated
  converged: boolean;
  iterations: number;
}

// ── Extract observation sequences from real student data ──

/**
 * Extract per-skill observation sequences from real student data.
 * Returns Map<skillId, { studentId, correct, timestamp }[]> — raw events
 * ready to be grouped into sequences by the caller.
 */
export async function extractRawEvents(skillIds?: string[]) {
  const rawBySkill = new Map<string, { studentId: string; correct: boolean; timestamp: Date }[]>();

  const push = (skillId: string, ev: { studentId: string; correct: boolean; timestamp: Date }) => {
    if (!rawBySkill.has(skillId)) rawBySkill.set(skillId, []);
    rawBySkill.get(skillId)!.push(ev);
  };

  // 1. QuizAttempt — per-question approved skill tags
  const quizAttempts = await prisma.quizAttempt.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      quiz: {
        include: {
          questions: { select: { id: true, skillId: true, skillTagStatus: true } },
        },
      },
    },
  });

  for (const attempt of quizAttempts) {
    const answers: Array<{ questionId?: string; isCorrect: boolean }> = JSON.parse(attempt.answers || "[]");
    if (answers.length === 0) continue;
    const qById = new Map((attempt.quiz?.questions || []).map((q) => [q.id, q]));
    for (const a of answers) {
      const q = a.questionId ? qById.get(a.questionId) : undefined;
      if (!q || q.skillTagStatus !== "approved" || !q.skillId) continue;
      if (skillIds && !skillIds.includes(q.skillId)) continue;
      push(q.skillId, { studentId: attempt.userId, correct: a.isCorrect, timestamp: attempt.createdAt });
    }
  }

  // 2. ProblemSubmission — approved skill tags
  const submissions = await prisma.problemSubmission.findMany({
    orderBy: { createdAt: "asc" },
    include: { problem: { select: { skillId: true, skillTagStatus: true } } },
  });

  for (const sub of submissions) {
    if (sub.problem?.skillTagStatus !== "approved" || !sub.problem.skillId) continue;
    if (skillIds && !skillIds.includes(sub.problem.skillId)) continue;
    push(sub.problem.skillId, { studentId: sub.studentId, correct: sub.passed, timestamp: sub.createdAt });
  }

  // 3. AdaptiveTestAttempt — per-question skillId
  const adaptiveTests = await prisma.adaptiveTestAttempt.findMany({
    orderBy: { createdAt: "asc" },
  });

  for (const test of adaptiveTests) {
    const answers: Array<{ isCorrect: boolean; skillId?: string | null }> = JSON.parse(test.answers || "[]");
    for (const a of answers) {
      if (!a.skillId) continue;
      if (skillIds && !skillIds.includes(a.skillId)) continue;
      push(a.skillId, { studentId: test.userId, correct: a.isCorrect, timestamp: test.createdAt });
    }
  }

  return rawBySkill;
}

/**
 * Group raw events per skill into per-student boolean sequences.
 * Returns Map<skillId, boolean[][]> where each inner array is one student's
 * chronologically-ordered correct/wrong observations.
 */
export function groupSequences(
  rawBySkill: Map<string, { studentId: string; correct: boolean; timestamp: Date }[]>,
): Map<string, boolean[][]> {
  const result = new Map<string, boolean[][]>();

  for (const [skillId, events] of rawBySkill) {
    // Group by student
    const byStudent = new Map<string, { correct: boolean; timestamp: Date }[]>();
    for (const e of events) {
      if (!byStudent.has(e.studentId)) byStudent.set(e.studentId, []);
      byStudent.get(e.studentId)!.push({ correct: e.correct, timestamp: e.timestamp });
    }

    // Per student: sort by (timestamp, original order) then build the boolean
    // sequence. Each answer is a distinct observation — answers within ONE quiz
    // attempt share the attempt's createdAt, so we must NOT dedup by timestamp
    // or a single quiz (15 questions) would collapse to one observation.
    const sequences: boolean[][] = [];
    for (const [, evs] of byStudent) {
      evs.sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime() || 0, // stable: preserves push order for ties
      );
      const seq: boolean[] = evs.map((ev) => ev.correct);
      if (seq.length >= 2) sequences.push(seq); // need ≥2 for EM
    }

    if (sequences.length > 0) result.set(skillId, sequences);
  }

  return result;
}

// ── EM (Baum-Welch) for BKT ──

/**
 * Run the EM algorithm to calibrate BKT parameters for one skill.
 * Uses Baum-Welch forward-backward with MAP regularization (Dirichlet priors)
 * to keep parameters in sensible ranges when data is sparse, plus multiple
 * random restarts to avoid local optima.
 *
 * @param sequences  Array of student observation sequences (each = boolean[] ordered by time)
 * @param options    maxIterations, tolerance, initial params, restarts
 * @returns         Fitted parameters + convergence info
 */
export function emCalibrateBkt(
  sequences: boolean[][],
  options?: {
    maxIterations?: number;
    tolerance?: number;
    initial?: Partial<BktParams>;
    restarts?: number;
  },
): { params: BktParams; converged: boolean; iterations: number } {
  const maxIter = options?.maxIterations ?? 100;
  const tol = options?.tolerance ?? 1e-6;
  const restarts = Math.max(1, options?.restarts ?? 3);

  if (sequences.length < 1) {
    const init = options?.initial ?? {};
    return { params: { pL0: init.pL0 ?? 0.2, pT: init.pT ?? 0.15, pSlip: init.pSlip ?? 0.1, pGuess: init.pGuess ?? 0.25 }, converged: false, iterations: 0 };
  }

  // Dirichlet prior hyper-parameters (pseudo-observation counts).
  // These pull parameters toward sensible defaults when data is sparse:
  //   pGuess ~ 0.25  (α_g=5,  β_g=15)  — quiz 4 lựa chọn
  //   pSlip ~ 0.10   (α_s=2,  β_s=18)  — 10% slip rate trung bình
  //   pL0   ~ 0.20   (α_0=2,  β_0=8)
  //   pT    ~ 0.15   (α_t=3,  β_t=17)
  const PRIOR = { aG: 5, bG: 15, aS: 2, bS: 18, aL0: 2, bL0: 8, aT: 3, bT: 17 };

  // ───── Helper: run one EM instance with a given initial guess ─────
  function runEM(initial: BktParams): {
    params: BktParams;
    converged: boolean;
    iterations: number;
    logLik: number;
  } {
    let pL0 = clamp(initial.pL0);
    let pT = clamp(initial.pT);
    let pSlip = clamp(initial.pSlip);
    let pGuess = clamp(initial.pGuess);

    let converged = false;
    let iter = 0;
    let logLik = -Infinity;

    for (iter = 0; iter < maxIter; iter++) {
      const old = { pL0, pT, pSlip, pGuess };

      // Accumulators
      let sumL0 = 0;
      let nStudents = 0;
      let sumGamma0 = 0;
      let sumXi01 = 0;
      let sumState1 = 0;
      let sumState1Wrong = 0;
      let sumState0 = 0;
      let sumState0Correct = 0;
      let totalLogLik = 0;

      for (const seq of sequences) {
        const T = seq.length;
        const obs = seq.map((o) => (o ? 1 : 0));

        // Forward
        const alpha = Array.from({ length: T }, () => [0.0, 0.0]);
        alpha[0][0] = (1 - pL0) * (obs[0] === 1 ? pGuess : 1 - pGuess);
        alpha[0][1] = pL0 * (obs[0] === 1 ? 1 - pSlip : pSlip);
        for (let t = 1; t < T; t++) {
          const emit0 = obs[t] === 1 ? pGuess : 1 - pGuess;
          const emit1 = obs[t] === 1 ? 1 - pSlip : pSlip;
          alpha[t][0] = alpha[t - 1][0] * (1 - pT) * emit0;
          alpha[t][1] = (alpha[t - 1][0] * pT + alpha[t - 1][1]) * emit1;
        }

        // Backward
        const beta = Array.from({ length: T }, () => [0.0, 0.0]);
        beta[T - 1][0] = 1;
        beta[T - 1][1] = 1;
        for (let t = T - 2; t >= 0; t--) {
          const emit0_next = obs[t + 1] === 1 ? pGuess : 1 - pGuess;
          const emit1_next = obs[t + 1] === 1 ? 1 - pSlip : pSlip;
          beta[t][0] = (1 - pT) * emit0_next * beta[t + 1][0] + pT * emit1_next * beta[t + 1][1];
          beta[t][1] = emit1_next * beta[t + 1][1];
        }

        // Posterior γ
        const gamma = Array.from({ length: T }, () => [0.0, 0.0]);
        for (let t = 0; t < T; t++) {
          const like = alpha[t][0] * beta[t][0] + alpha[t][1] * beta[t][1];
          const norm = like > 1e-300 ? like : 1;
          gamma[t][0] = (alpha[t][0] * beta[t][0]) / norm;
          gamma[t][1] = (alpha[t][1] * beta[t][1]) / norm;
        }

        // Transition ξ
        const xi = new Array(T - 1).fill(0);
        for (let t = 0; t < T - 1; t++) {
          const emit1_next = obs[t + 1] === 1 ? 1 - pSlip : pSlip;
          const like = alpha[t][0] * beta[t][0] + alpha[t][1] * beta[t][1];
          const norm = like > 1e-300 ? like : 1;
          xi[t] = (alpha[t][0] * pT * emit1_next * beta[t + 1][1]) / norm;
        }

        // Accumulate
        nStudents++;
        sumL0 += gamma[0][1];
        for (let t = 0; t < T - 1; t++) {
          sumGamma0 += gamma[t][0];
          sumXi01 += xi[t];
        }
        for (let t = 0; t < T; t++) {
          sumState1 += gamma[t][1];
          sumState0 += gamma[t][0];
          if (obs[t] === 0) sumState1Wrong += gamma[t][1];
          if (obs[t] === 1) sumState0Correct += gamma[t][0];
        }

        // Log-likelihood of this sequence (forward probability)
        const seqLik = alpha[T - 1][0] + alpha[T - 1][1];
        totalLogLik += seqLik > 1e-300 ? Math.log(seqLik) : -690; // avoid -Inf
      }

      // MAP M-step: add Dirichlet prior pseudo-counts
      const prior = PRIOR;
      const pL0_num = sumL0 + prior.aL0 - 1;
      const pL0_den = nStudents + prior.aL0 + prior.bL0 - 2;
      pL0 = clamp(pL0_num / Math.max(1, pL0_den));

      const pT_num = sumXi01 + prior.aT - 1;
      const pT_den = sumGamma0 + prior.aT + prior.bT - 2;
      pT = clamp(pT_num / Math.max(1, pT_den));

      const pSlip_num = sumState1Wrong + prior.aS - 1;
      const pSlip_den = sumState1 + prior.aS + prior.bS - 2;
      pSlip = clamp(pSlip_num / Math.max(1, pSlip_den));

      const pGuess_num = sumState0Correct + prior.aG - 1;
      const pGuess_den = sumState0 + prior.aG + prior.bG - 2;
      pGuess = clamp(pGuess_num / Math.max(1, pGuess_den));

      logLik = totalLogLik;

      // Convergence
      const diff =
        Math.abs(pL0 - old.pL0) +
        Math.abs(pT - old.pT) +
        Math.abs(pSlip - old.pSlip) +
        Math.abs(pGuess - old.pGuess);
      if (diff < tol) {
        converged = true;
        break;
      }
    }

    return { params: { pL0, pT, pSlip, pGuess }, converged, iterations: iter + 1, logLik };
  }

  // ───── Multiple restarts ─────
  const restartSeeds: BktParams[] = [];
  // Default initial
  const def = options?.initial ?? {};
  restartSeeds.push({ pL0: def.pL0 ?? 0.2, pT: def.pT ?? 0.15, pSlip: def.pSlip ?? 0.1, pGuess: def.pGuess ?? 0.25 });
  // Random perturbations
  const rng = () => 0.1 + Math.random() * 0.8;
  for (let i = 1; i < restarts; i++) {
    restartSeeds.push({ pL0: rng(), pT: rng(), pSlip: rng(), pGuess: rng() });
  }

  let best = runEM(restartSeeds[0]);
  for (let i = 1; i < restartSeeds.length; i++) {
    const result = runEM(restartSeeds[i]);
    if (result.logLik > best.logLik) best = result;
  }

  // Renormalize extreme params back to sensible range
  // If pGuess > 0.6 and pSlip < 0.05, it means the model can't separate guess
  // from know — freeze pGuess at 0.25 and re-fit
  if (best.params.pGuess > 0.6 && best.params.pSlip < 0.05) {
    const refined = runEM({ ...best.params, pGuess: 0.25 });
    if (refined.logLik > best.logLik * 0.95) best = refined; // accept if not much worse
  }

  return best;
}

function clamp(v: number): number {
  return Math.min(0.99, Math.max(0.01, v));
}

// ── High-level pipeline ──

export interface CalibrateOptions {
  skillIds?: string[];
  maxIterations?: number;
  tolerance?: number;
  minSequences?: number; // minimum sequences before fitting (default 5)
  syntheticData?: Map<string, { studentId: string; correct: boolean[] }[]>; // LLM-generated override
}

/**
 * Run the full calibration pipeline: extract real data → group sequences →
 * run EM per skill → store results in SkillBktCalibration table.
 * Skips skills with fewer than `minSequences` sequences (add LLM later).
 */
export async function calibrateAllSkills(options?: CalibrateOptions): Promise<CalibrationResult[]> {
  const skillIds = options?.skillIds;
  const maxIter = options?.maxIterations ?? 100;
  const tol = options?.tolerance ?? 1e-6;
  const minSeq = options?.minSequences ?? 2;

  const raw = await extractRawEvents(skillIds);
  const grouped = groupSequences(raw);

  const results: CalibrationResult[] = [];

  const targetSkills = skillIds ?? SKILL_SEEDS.map((s) => s.skillId);

  for (const skillId of targetSkills) {
    const realSeqs = grouped.get(skillId) || [];
    const synthetic = options?.syntheticData?.get(skillId);

    // Merge real + synthetic sequences if available
    const merged = synthetic
      ? [...realSeqs, ...synthetic.map((s) => s.correct)]
      : realSeqs;

    if (merged.length < Math.max(minSeq, 2)) {
      // Not enough data (even with synthetic) — keep defaults
      results.push({
        skillId,
        pL0: 0.2,
        pT: 0.15,
        pSlip: 0.1,
        pGuess: 0.25,
        sampleSize: realSeqs.length,
        totalEvents: realSeqs.reduce((s, seq) => s + seq.length, 0),
        converged: false,
        iterations: 0,
      });
      continue;
    }

    const totalMergedEvents = merged.reduce((s, seq) => s + seq.length, 0);
    const { params, converged, iterations } = emCalibrateBkt(merged, {
      maxIterations: maxIter,
      tolerance: tol,
    });

    // Persist
    await prisma.skillBktCalibration.upsert({
      where: { skillId },
      create: {
        skillId,
        pL0: params.pL0,
        pT: params.pT,
        pSlip: params.pSlip,
        pGuess: params.pGuess,
        sampleSize: merged.length,
        totalEvents: totalMergedEvents,
      },
      update: {
        pL0: params.pL0,
        pT: params.pT,
        pSlip: params.pSlip,
        pGuess: params.pGuess,
        sampleSize: merged.length,
        totalEvents: totalMergedEvents,
        calibratedAt: new Date(),
      },
    });

    results.push({
      skillId,
      ...params,
      sampleSize: merged.length,
      totalEvents: totalMergedEvents,
      converged,
      iterations,
    });
  }

  return results;
}

/** Get the current calibration for a skill (or null if not calibrated). */
export async function getBktParams(skillId: string): Promise<BktParams | null> {
  const row = await prisma.skillBktCalibration.findUnique({ where: { skillId } });
  if (!row) return null;
  return { pL0: row.pL0, pT: row.pT, pSlip: row.pSlip, pGuess: row.pGuess };
}

/** Get all calibrations. */
export async function getAllCalibrations() {
  return prisma.skillBktCalibration.findMany({ orderBy: { skillId: "asc" } });
}