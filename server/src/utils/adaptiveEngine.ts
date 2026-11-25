/**
 * Adaptive Testing Engine — ELO-based ability estimation with
 * difficulty-aware question selection.
 *
 * Scale:
 *   difficulty: 1 (dễ) … 5 (khó)     — from QuizQuestion.difficulty
 *   ability:    0 … 10                — inferred student skill
 *
 * A chapter-skip test draws QUESTIONS_PER_TEST questions from the
 * entire chapter bank, adapts difficulty after each answer, and
 * returns abilityEnd + skipable lesson IDs.
 */

export const QUESTIONS_PER_TEST = 25;
export const ABILITY_INIT = 3;          // start at easy end
export const K_FACTOR = 1.0;            // ELO learning rate

/**
 * Per-chapter difficulty scaling & pass thresholds.
 * Later chapters have harder topics → higher scale → wider diff range → higher pass bar.
 *
 * scale:  multiplies question difficulty (original 1-5 → scaled diff)
 * pass:   ability must reach this to skip the entire chapter
 * partial: ability must reach this to skip lessons done well (≥60% correct)
 */
export interface ChapterConfig {
  scale: number;      // difficulty multiplier (e.g. 1.4 means diff 1-5 → 1.4-7.0)
  pass: number;       // pass threshold
  partial: number;    // partial skip threshold
}

export const CHAPTER_CONFIGS: Record<number, ChapterConfig> = {
  // Format: chapterIndex → { scale, pass, partial }
  //  scale ×1.0: diff=1→5, max=5  |  ×2.0: diff=2→10, max=10
  1:  { scale: 1.0, pass: 4.0, partial: 3.0 },   // Làm quen Python
  2:  { scale: 1.0, pass: 4.0, partial: 3.0 },   // Biến, kiểu dữ liệu
  3:  { scale: 1.2, pass: 4.5, partial: 3.5 },   // Toán tử, biểu thức
  4:  { scale: 1.4, pass: 5.0, partial: 4.0 },   // Rẽ nhánh if/elif/else
  5:  { scale: 1.6, pass: 5.5, partial: 4.5 },   // Vòng lặp
  6:  { scale: 1.8, pass: 6.0, partial: 5.0 },   // Xử lý số
  7:  { scale: 1.6, pass: 5.5, partial: 4.5 },   // Chuỗi cơ bản
  8:  { scale: 1.8, pass: 6.0, partial: 5.0 },   // List cơ bản
  9:  { scale: 2.0, pass: 6.5, partial: 5.5 },   // Hàm
  10: { scale: 1.4, pass: 5.0, partial: 4.0 },   // Debug & tư duy
  11: { scale: 1.8, pass: 6.0, partial: 5.0 },   // Ôn tập theo dạng bài
  12: { scale: 2.0, pass: 7.0, partial: 6.0 },   // Project cuối khóa
};

/**
 * Algorithm course configs — difficulty already 1-10, no scaling needed (scale=1.0).
 * Pass thresholds increase with chapter difficulty (avg 2.4→4.8).
 */
export const ALGO_CHAPTER_CONFIGS: Record<number, ChapterConfig> = {
  1:  { scale: 1.0, pass: 4.0, partial: 3.0 },   // Kỹ năng giải bài (avg 2.4)
  2:  { scale: 1.0, pass: 4.0, partial: 3.0 },   // Số học cơ bản (avg 2.5)
  3:  { scale: 1.0, pass: 5.0, partial: 4.0 },   // Sàng & tiền xử lý (avg 3.2)
  4:  { scale: 1.0, pass: 5.5, partial: 4.5 },   // Kỹ thuật dãy số (avg 3.7)
  5:  { scale: 1.0, pass: 5.0, partial: 4.0 },   // Chuỗi nâng cao (avg 3.3)
  6:  { scale: 1.0, pass: 5.0, partial: 4.0 },   // Dictionary (avg 3.3)
  7:  { scale: 1.0, pass: 6.0, partial: 5.0 },   // Tìm kiếm & sắp xếp (avg 4.3)
  8:  { scale: 1.0, pass: 6.0, partial: 5.0 },   // Hai con trỏ (avg 4.3)
  9:  { scale: 1.0, pass: 6.0, partial: 5.0 },   // Đệ quy (avg 4.1)
  10: { scale: 1.0, pass: 7.0, partial: 6.0 },   // Luyện đề (avg 4.8)
};

// Course IDs for detection
export const ALGO_COURSE_ID = "1e1a7c13-5c1a-48c3-b79a-848893303830";

/** Get config for a module, depending on course type. */
export function getChapterConfig(moduleIndex?: number, courseId?: string): ChapterConfig {
  if (courseId === ALGO_COURSE_ID) {
    if (moduleIndex && ALGO_CHAPTER_CONFIGS[moduleIndex]) {
      return ALGO_CHAPTER_CONFIGS[moduleIndex];
    }
    return { scale: 1.0, pass: 5.0, partial: 4.0 }; // algo default
  }
  // Python course (default)
  if (moduleIndex && CHAPTER_CONFIGS[moduleIndex]) {
    return CHAPTER_CONFIGS[moduleIndex];
  }
  return { scale: 1.6, pass: 5.5, partial: 4.5 }; // fallback
}

/** Legacy constants — use getChapterConfig() for new code */
export const PASS_THRESHOLD = 6.0;
export const PARTIAL_THRESHOLD = 5.0;

export interface BankQuestion {
  id: string;
  lessonId: string;
  question: string;
  options: string[];
  correctIndex: number;
  difficulty: number;
  baseDifficulty?: number; // canonical 1-5 difficulty before chapter scaling
  explanation: string | null;
  skillId?: string | null; // approved skill tag (if any) for mastery mapping
}

export interface AdaptiveAnswer {
  questionId: string;
  lessonId: string;
  difficulty: number;
  baseDifficulty?: number;
  question: string;       // question stem
  options: string[];       // answer options
  correctIndex: number;    // correct answer
  explanation: string | null;
  selectedIndex: number;
  isCorrect: boolean;
  abilityAfter: number;
  skillId?: string | null; // skill for this question (if tagged)
}

export interface AdaptiveSession {
  sessionId: string;
  userId: string;
  attemptId: string | null;
  type: "chapter-skip";
  moduleId: string;
  courseId: string;
  chapterConfig: ChapterConfig;
  questions: BankQuestion[];
  answers: AdaptiveAnswer[];
  /** The question currently shown to the student. Persisted for request validation. */
  currentQuestionId: string | null;
  initialAbility?: number;
  currentAbility: number;
  currentIndex: number;
  totalQuestions: number;
  maxAbility: number;
  createdAt: number;
  expiresAt: number;
}

// The database attempt is the durable result; this store holds only the active question bank.
const sessions = new Map<string, AdaptiveSession>();
export const ADAPTIVE_SESSION_TTL_MS = 25 * 60 * 1000;

/** Keep the advertised test length consistent with the available question bank. */
export function getAdaptiveQuestionCount(bankSize: number): number {
  if (!Number.isFinite(bankSize)) return 0;
  return Math.min(QUESTIONS_PER_TEST, Math.max(0, Math.floor(bankSize)));
}

/* ── IRT 2PL Item Response Function ── */
function irf(theta: number, difficulty: number): number {
  return 1 / (1 + Math.exp(difficulty - theta));
}

/* ── MAP Ability Estimation (Bayesian with prior) ── */
export function estimateAbilityMLE(
  answers: Array<{ difficulty: number; isCorrect: boolean }>,
  priorMean: number = ABILITY_INIT,
): { theta: number; info: number; se: number } {
  const safePrior = Number.isFinite(priorMean) ? clamp(priorMean, 0.5, 9.5) : ABILITY_INIT;
  if (answers.length === 0) return { theta: safePrior, info: 0, se: 1.5 };

  // Prior: theta ~ N(safePrior, 2²). This prevents wild swings with few answers.
  const priorVar = 4; // prior variance (σ²=4 → σ=2, weak prior)

  let bestTheta = safePrior;
  let bestLP = -Infinity; // log posterior

  // Grid search (theta 0.5 → 10, step 0.05)
  for (let t = 0.5; t <= 10; t += 0.05) {
    // Log-likelihood from data
    let ll = 0;
    for (const a of answers) {
      const p = irf(t, a.difficulty);
      ll += a.isCorrect ? Math.log(p) : Math.log(1 - p);
    }
    // Log-prior (Gaussian)
    const lp = ll - ((t - safePrior) ** 2) / (2 * priorVar);
    if (lp > bestLP) { bestLP = lp; bestTheta = t; }
  }

  // For early answers, blend with prior (weighted by info)
  let totalInfo = 0;
  for (const a of answers) {
    const p = irf(bestTheta, a.difficulty);
    totalInfo += p * (1 - p);
  }
  // Prior adds "pseudo-information" of 1/priorVar = 0.25
  const priorInfo = 1 / priorVar;
  const effectiveInfo = totalInfo + priorInfo;
  const se = 1 / Math.sqrt(Math.max(0.5, effectiveInfo));

  return { theta: round(bestTheta, 2), info: totalInfo, se: round(se, 3) };
}

/* ── Fisher Information Question Selection ── */
export function selectNextQuestion(
  available: BankQuestion[],
  answeredIds: Set<string>,
  currentAbility: number,
): BankQuestion | null {
  const remaining = available.filter((q) => !answeredIds.has(q.id));
  if (remaining.length === 0) return null;

  // Pick the question with highest Fisher Information at current ability
  let bestQ: BankQuestion | null = null;
  let bestInfo = -1;

  for (const q of remaining) {
    const p = irf(currentAbility, q.difficulty);
    const info = p * (1 - p); // Fisher Information for binary item
    if (info > bestInfo) {
      bestInfo = info;
      bestQ = q;
    }
  }

  // If multiple with same info (same difficulty), pick randomly among them
  if (bestQ) {
    const sameDiff = remaining.filter((q) => q.difficulty === bestQ!.difficulty);
    if (sameDiff.length > 1) {
      return sameDiff[Math.floor(Math.random() * sameDiff.length)];
    }
    return bestQ;
  }

  // Fallback: random
  return remaining[Math.floor(Math.random() * remaining.length)];
}

/* ── Legacy ELO update (kept for backward compat with tests) ── */
export function updateAbility(currentAbility: number, difficulty: number, isCorrect: boolean): number {
  const expected = 1 / (1 + Math.pow(10, (difficulty - currentAbility) / 2));
  const actual = isCorrect ? 1 : 0;
  const change = K_FACTOR * (actual - expected);
  return clamp(currentAbility + change, 0.5, 10.0);
}

/* ── Session lifecycle ── */
export function createSession(
  sessionId: string,
  userId: string,
  moduleId: string,
  courseId: string,
  bank: BankQuestion[],
  config: ChapterConfig,
  totalQuestions?: number,
  maxAbility?: number,
  ttlMs?: number,
  initialAbility?: number,
): AdaptiveSession;
/** @deprecated Kept for pure engine callers; HTTP sessions must pass an owner. */
export function createSession(
  sessionId: string,
  moduleId: string,
  courseId: string,
  bank: BankQuestion[],
  config: ChapterConfig,
  totalQuestions?: number,
  maxAbility?: number,
): AdaptiveSession;
export function createSession(
  sessionId: string,
  a: string,
  b: string,
  c: string | BankQuestion[],
  d?: BankQuestion[] | ChapterConfig,
  e?: ChapterConfig | number,
  f?: number,
  g?: number,
  h?: number,
  i?: number,
): AdaptiveSession {
  const legacy = Array.isArray(c);
  const userId = legacy ? "legacy-engine" : a;
  const moduleId = legacy ? a : b;
  const courseId = legacy ? b : c as string;
  const bank = (legacy ? c : d) as BankQuestion[];
  const config = (legacy ? d : e) as ChapterConfig;
  const totalQuestions = legacy
    ? (typeof e === "number" ? e : QUESTIONS_PER_TEST)
    : (f ?? QUESTIONS_PER_TEST);
  const maxAbility = legacy
    ? (f ?? 10)
    : (g ?? 10);
  const ttlMs = legacy
    ? ADAPTIVE_SESSION_TTL_MS
    : (h ?? ADAPTIVE_SESSION_TTL_MS);
  const startAbility = !legacy && Number.isFinite(i)
    ? round(clamp(i as number, 0.5, Math.min(9.5, maxAbility)), 2)
    : ABILITY_INIT;
  const session: AdaptiveSession = {
    sessionId,
    userId,
    attemptId: null,
    type: "chapter-skip",
    moduleId,
    courseId,
    chapterConfig: config,
    questions: bank,
    answers: [],
    currentQuestionId: null,
    initialAbility: startAbility,
    currentAbility: startAbility,
    currentIndex: 0,
    totalQuestions,
    maxAbility,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): AdaptiveSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  if (Date.now() >= session.expiresAt) {
    sessions.delete(sessionId);
    return undefined;
  }
  return session;
}

export function serializeSession(session: AdaptiveSession): string {
  return JSON.stringify(session);
}

export function restoreSession(stateJson: string): AdaptiveSession | undefined {
  try {
    const parsed = JSON.parse(stateJson) as AdaptiveSession;
    if (!parsed?.sessionId || !parsed?.userId || !Array.isArray(parsed.questions) || !Array.isArray(parsed.answers)
      || !Number.isFinite(parsed.expiresAt) || !Number.isFinite(parsed.totalQuestions)) {
      return undefined;
    }
    if (Date.now() >= parsed.expiresAt) return undefined;
    sessions.set(parsed.sessionId, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/* ── Process one answer ── */
export function processAnswer(
  session: AdaptiveSession,
  questionId: string,
  selectedIndex: number,
): { answer: AdaptiveAnswer; isComplete: boolean } {
  const q = session.questions.find((q) => q.id === questionId);
  if (!q) throw new Error("Question not found in session bank");

  // A retried request after a lost response must not create duplicate evidence.
  const existingAnswer = session.answers.find((answer) => answer.questionId === questionId);
  if (existingAnswer) {
    if (session.currentQuestionId && session.currentQuestionId !== questionId) {
      throw new Error("Unexpected question for current session state");
    }
    return {
      answer: existingAnswer,
      isComplete: session.answers.length >= session.totalQuestions,
    };
  }

  // HTTP sessions record the question sent to the client. Pure engine callers
  // may leave this unset for backwards-compatible white-box tests.
  if (session.currentQuestionId && session.currentQuestionId !== questionId) {
    throw new Error("Unexpected question for current session state");
  }
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= q.options.length) {
    throw new Error("Selected answer index is out of range");
  }

  const isCorrect = selectedIndex === q.correctIndex;

  // Build temp answer record for MLE estimation
  const allAnswers = [
    ...session.answers.map((a) => ({ difficulty: a.difficulty, isCorrect: a.isCorrect })),
    { difficulty: q.difficulty, isCorrect },
  ];
  const mle = estimateAbilityMLE(allAnswers, session.initialAbility ?? ABILITY_INIT);

  const answer: AdaptiveAnswer = {
    questionId: q.id,
    lessonId: q.lessonId,
    difficulty: q.difficulty,
    baseDifficulty: q.baseDifficulty,
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    selectedIndex,
    isCorrect,
    abilityAfter: mle.theta,
    skillId: q.skillId ?? null,
  };

  session.currentAbility = mle.theta;
  session.answers.push(answer);
  session.currentIndex = session.answers.length;
  session.currentQuestionId = null;

  return { answer, isComplete: session.answers.length >= session.totalQuestions };
}

/* ── Final result computation ── */
export interface AdaptiveResult {
  sessionId: string;
  abilityStart: number;
  abilityEnd: number;
  /** 95% confidence interval for ability */
  confidenceInterval: { lower: number; upper: number };
  totalQuestions: number;
  correctCount: number;
  accuracyPercent: number;
  passed: boolean;
  partialPass: boolean;
  /** Lesson IDs that can be skipped (all if passed, subset if partial) */
  skipableLessonIds: string[];
  /** Lesson IDs that still need study */
  requiredLessonIds: string[];
  answers: AdaptiveAnswer[];
  /** Per-lesson breakdown: lessonId → { correct, total, percent } */
  lessonBreakdown: Record<string, { correct: number; total: number; percent: number }>;
}

export function computeResult(session: AdaptiveSession): AdaptiveResult {
  const correctCount = session.answers.filter((a) => a.isCorrect).length;
  const accuracyPercent = session.totalQuestions > 0
    ? Math.round((correctCount / session.totalQuestions) * 100)
    : 0;
  // MLE estimation from all answers (fallback to currentAbility if no answers)
  let abilityEnd: number;
  let confidenceInterval: { lower: number; upper: number };
  if (session.answers.length > 0) {
    const mle = estimateAbilityMLE(
      session.answers.map((a) => ({ difficulty: a.difficulty, isCorrect: a.isCorrect })),
      session.initialAbility ?? ABILITY_INIT,
    );
    abilityEnd = mle.theta;
    confidenceInterval = {
      lower: round(Math.max(0.5, abilityEnd - 1.96 * mle.se), 2),
      upper: round(Math.min(10, abilityEnd + 1.96 * mle.se), 2),
    };
  } else {
    abilityEnd = round(session.currentAbility, 2);
    confidenceInterval = { lower: abilityEnd, upper: abilityEnd };
  }

  const cfg = session.chapterConfig;
  // Chapter config is the single source of truth. The old implementation
  // ignored these thresholds and used hard-coded accuracy percentages.
  const passed = abilityEnd >= cfg.pass;
  const partialPass = !passed && abilityEnd >= cfg.partial;

  // Per-lesson performance
  const lessonPerf: Record<string, { correct: number; total: number }> = {};
  for (const a of session.answers) {
    const p = (lessonPerf[a.lessonId] ||= { correct: 0, total: 0 });
    p.total++;
    if (a.isCorrect) p.correct++;
  }

  const lessonBreakdown: AdaptiveResult["lessonBreakdown"] = {};
  for (const [lid, p] of Object.entries(lessonPerf)) {
    lessonBreakdown[lid] = { correct: p.correct, total: p.total, percent: Math.round((p.correct / p.total) * 100) };
  }

  // Determine skipable lessons
  const allLessonIds = [...new Set(session.questions.map((q) => q.lessonId))];
  let skipableLessonIds: string[];
  let requiredLessonIds: string[];

  if (passed) {
    skipableLessonIds = allLessonIds;
    requiredLessonIds = [];
  } else if (partialPass) {
    skipableLessonIds = allLessonIds.filter((lid) => (lessonBreakdown[lid]?.percent ?? 0) >= 60);
    requiredLessonIds = allLessonIds.filter((lid) => !skipableLessonIds.includes(lid));
  } else {
    skipableLessonIds = [];
    requiredLessonIds = allLessonIds;
  }

  return {
    sessionId: session.sessionId,
    abilityStart: session.initialAbility ?? ABILITY_INIT,
    abilityEnd,
    confidenceInterval,
    totalQuestions: session.totalQuestions,
    correctCount,
    accuracyPercent,
    passed,
    partialPass,
    skipableLessonIds,
    requiredLessonIds,
    answers: session.answers,
    lessonBreakdown,
  };
}

/* ── Helpers ── */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function round(v: number, decimals: number): number {
  return Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals);
}
