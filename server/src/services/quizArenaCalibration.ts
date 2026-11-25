export interface QuizCalibrationResponse {
  userId: string;
  selectedIndex: number | null;
  isCorrect: boolean;
  responseTimeMs: number | null;
}

export interface QuizCalibrationResult {
  before: number;
  empiricalDifficulty: number;
  effectiveDifficulty: number;
  samples: number;
  correctCount: number;
  correctRate: number;
  confidence: number;
  optionDistribution: number[];
  status: "collecting" | "needs_review" | "tentative" | "calibrated";
}

const clamp = (value: number, min = 1, max = 5) => Math.max(min, Math.min(max, value));

/**
 * Calculate a stable difficulty signal from the first exposure of each student.
 * The prior keeps low-sample questions from jumping between extremes.
 */
export function computeQuizCalibration(
  authoredDifficulty: number,
  currentEffectiveDifficulty: number | null | undefined,
  rawResponses: QuizCalibrationResponse[],
): QuizCalibrationResult {
  const uniqueResponses: QuizCalibrationResponse[] = [];
  const seen = new Set<string>();
  for (const response of rawResponses) {
    if (seen.has(response.userId) || response.selectedIndex === null) continue;
    seen.add(response.userId);
    uniqueResponses.push(response);
  }

  const samples = uniqueResponses.length;
  const correctCount = uniqueResponses.filter((response) => response.isCorrect).length;
  const correctRate = (correctCount + 2) / (samples + 4);
  const empiricalDifficulty = clamp(1 + 4 * (1 - correctRate));
  const weight = samples / (samples + 50);
  const effectiveDifficulty = clamp((1 - weight) * clamp(authoredDifficulty) + weight * empiricalDifficulty);
  const confidence = 1 - Math.exp(-samples / 50);
  const status = samples < 30
    ? "collecting"
    : Math.abs(effectiveDifficulty - clamp(authoredDifficulty)) >= 1.25
      ? "needs_review"
      : samples < 100
        ? "tentative"
        : "calibrated";

  return {
    before: currentEffectiveDifficulty ?? clamp(authoredDifficulty),
    empiricalDifficulty,
    effectiveDifficulty,
    samples,
    correctCount,
    correctRate,
    confidence,
    optionDistribution: Array.from({ length: 4 }, (_, index) => uniqueResponses.filter((response) => response.selectedIndex === index).length),
    status,
  };
}
