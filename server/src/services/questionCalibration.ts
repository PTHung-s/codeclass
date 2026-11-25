import prisma from "../utils/prisma";

export const QUESTION_CALIBRATION_MODEL = "smoothed-rate-v1";
export const QUESTION_CALIBRATION_ENABLED = process.env.QUESTION_CALIBRATION_ENABLED === "true";

export type CalibratedQuestion = {
  authoredDifficulty: number;
  effectiveDifficulty: number;
  calibratedDifficulty: number | null;
  samples: number;
  confidence: number;
  status: string;
};

export function getEffectiveDifficulty(question: {
  difficulty: number;
  effectiveDifficulty?: number | null;
  calibrationConfidence?: number | null;
  calibrationStatus?: string | null;
  calibrationLocked?: boolean;
}, options?: { allowCalibrated?: boolean }): number {
  const allowCalibrated = options?.allowCalibrated ?? QUESTION_CALIBRATION_ENABLED;
  if (!allowCalibrated) return clamp(Number(question.difficulty) || 3, 1, 5);
  if (question.calibrationLocked && Number.isFinite(question.effectiveDifficulty)) {
    return clamp(Number(question.effectiveDifficulty), 1, 5);
  }
  const confidence = Number(question.calibrationConfidence ?? 0);
  const status = question.calibrationStatus ?? "collecting";
  if ((status === "calibrated" || status === "tentative") && confidence >= 0.45 && Number.isFinite(question.effectiveDifficulty)) {
    return clamp(Number(question.effectiveDifficulty), 1, 5);
  }
  return clamp(Number(question.difficulty) || 3, 1, 5);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export type CalibrationComputation = {
  sampleCount: number;
  correctCount: number;
  correctRate: number;
  empiricalDifficulty: number;
  effectiveDifficulty: number;
  confidence: number;
  status: string;
  optionDistribution: number[];
};

export function computeCalibration(
  authoredDifficulty: number,
  contentVersion: number,
  responses: Array<{ userId: string; contentVersion: number; selectedIndex: number; correctIndex: number; isCorrect: boolean }>,
): CalibrationComputation {
  const seenStudents = new Set<string>();
  const validResponses = responses.filter((response) => {
    if (response.contentVersion !== contentVersion || seenStudents.has(response.userId)) return false;
    seenStudents.add(response.userId);
    return true;
  });
  const sampleCount = validResponses.length;
  const correctCount = validResponses.filter((response) => response.isCorrect).length;
  const optionCount = validResponses.reduce((max, response) => Math.max(max, response.correctIndex + 1, response.selectedIndex + 1), 0);
  const optionDistribution = Array.from({ length: Math.max(1, optionCount) }, (_, index) => validResponses.filter((response) => response.selectedIndex === index).length);
  const correctRate = (correctCount + 2) / (sampleCount + 4);
  const empiricalDifficulty = clamp(1 + 4 * (1 - correctRate), 1, 5);
  const weight = sampleCount / (sampleCount + 50);
  const effectiveDifficulty = clamp((1 - weight) * authoredDifficulty + weight * empiricalDifficulty, 1, 5);
  const confidence = 1 - Math.exp(-sampleCount / 50);
  const status = sampleCount < 30
    ? "collecting"
    : Math.abs(effectiveDifficulty - authoredDifficulty) >= 1.25
      ? "needs_review"
      : sampleCount < 100 ? "tentative" : "calibrated";
  return {
    sampleCount,
    correctCount,
    correctRate: round(correctRate),
    empiricalDifficulty: round(empiricalDifficulty),
    effectiveDifficulty: round(effectiveDifficulty),
    confidence: round(confidence),
    status,
    optionDistribution,
  };
}

/**
 * Calibrate one question from first valid exposure per student. The author
 * value remains the prior; small samples are deliberately shrunk toward it.
 */
export async function calibrateQuestion(questionId: string): Promise<CalibratedQuestion | null> {
  const question = await prisma.quizQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      difficulty: true,
      contentVersion: true,
      calibrationLocked: true,
      responses: {
        orderBy: { createdAt: "asc" },
        select: {
          userId: true,
          contentVersion: true,
          selectedIndex: true,
          isCorrect: true,
          correctIndex: true,
        },
      },
    },
  });
  if (!question) return null;

  const computed = computeCalibration(question.difficulty, question.contentVersion, question.responses);

  await prisma.$transaction(async (tx) => {
    await tx.quizQuestionCalibration.upsert({
      where: {
        questionId_contentVersion_modelVersion: {
          questionId,
          contentVersion: question.contentVersion,
          modelVersion: QUESTION_CALIBRATION_MODEL,
        },
      },
      create: {
        questionId,
        contentVersion: question.contentVersion,
        modelVersion: QUESTION_CALIBRATION_MODEL,
        sampleCount: computed.sampleCount,
        uniqueStudentCount: computed.sampleCount,
        correctCount: computed.correctCount,
        correctRate: computed.correctRate,
        empiricalDifficulty: computed.empiricalDifficulty,
        effectiveDifficulty: computed.effectiveDifficulty,
        confidence: computed.confidence,
        optionDistribution: JSON.stringify(computed.optionDistribution),
        status: computed.status,
      },
      update: {
        sampleCount: computed.sampleCount,
        uniqueStudentCount: computed.sampleCount,
        correctCount: computed.correctCount,
        correctRate: computed.correctRate,
        empiricalDifficulty: computed.empiricalDifficulty,
        effectiveDifficulty: computed.effectiveDifficulty,
        confidence: computed.confidence,
        optionDistribution: JSON.stringify(computed.optionDistribution),
        status: computed.status,
      },
    });

    if (!question.calibrationLocked) {
      await tx.quizQuestion.update({
        where: { id: questionId },
        data: {
          calibratedDifficulty: computed.empiricalDifficulty,
          effectiveDifficulty: computed.effectiveDifficulty,
          calibrationSamples: computed.sampleCount,
          calibrationConfidence: computed.confidence,
          calibrationStatus: computed.status,
          lastCalibratedAt: new Date(),
        },
      });
    }
  });

  return {
    authoredDifficulty: question.difficulty,
    effectiveDifficulty: computed.effectiveDifficulty,
    calibratedDifficulty: computed.empiricalDifficulty,
    samples: computed.sampleCount,
    confidence: computed.confidence,
    status: computed.status,
  };
}

export async function calibrateCourseQuestions(courseId: string): Promise<{ processed: number; results: CalibratedQuestion[] }> {
  const questions = await prisma.quizQuestion.findMany({
    where: { quiz: { lesson: { courseId } } },
    select: { id: true },
    orderBy: { orderIndex: "asc" },
  });
  const results: CalibratedQuestion[] = [];
  for (const question of questions) {
    const result = await calibrateQuestion(question.id);
    if (result) results.push(result);
  }
  return { processed: questions.length, results };
}
