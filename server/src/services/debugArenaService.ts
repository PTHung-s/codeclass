import prisma from "../utils/prisma";
import { runPythonCode } from "../utils/pythonRunner";
import { runCppCode } from "../utils/cppRunner";
import { generateDebugQuestion, planQuestions, getRecentQuestionTitles, reviewDebugQuestion, DebugQuestionSpec, PlanItem } from "./debugArenaGenerator";
import { generateQuizPair, reviewQuizBatch, quizItemFingerprint, QuizQuestionSpec } from "./quizArenaGenerator";
import { computeQuizCalibration } from "./quizArenaCalibration";
import { getBulkLessonObjectives, formatObjectives, getModuleContext, formatModuleContext } from "../utils/courseContent";
import { recordSkillEvidenceBatch, fromArenaQuizAnswer } from "./skillEvidence";

// ── Scoring matrix ──
// Code luôn có bug. 2 luồng chấm điểm ĐỘC LẬP:
//   1. Tô đúng dòng lỗi      → SCORE_IDENTIFY (chính xác) / SCORE_IDENTIFY_IMPRECISE (dư dòng)
//   2. Sửa code ra output đúng → SCORE_FIX
// Làm đúng cái nào được điểm cái đó. Max = SCORE_IDENTIFY + SCORE_FIX.
const SCORE_IDENTIFY = 40;
const SCORE_IDENTIFY_IMPRECISE = 20;
const SCORE_FIX = 60;

export const CHAOS_POWERUPS = {
  blackout: { tokenCost: 10, label: "Cúp điện" },
  generator: { tokenCost: 5, durationSeconds: 0, label: "Máy phát dự phòng" },
} as const;

type ChaosPower = keyof typeof CHAOS_POWERUPS;

export interface ArenaChaosEffectPublic {
  id: string;
  power: ChaosPower;
  sourceUserId: string;
  targetUserIds: string[];
  questionIndex: number;
  endsAt: string;
}

function parseQuizOptions(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((option) => String(option)).filter(Boolean).slice(0, 4) : undefined;
  } catch {
    return undefined;
  }
}

// ── Types ──

export interface CreateArenaInput {
  title: string;
  courseId?: string;
  moduleId?: string;
  customPrompt?: string;
  questionCount: number;
  secondsPerQuestion: number;
  revealSeconds: number;
  tokenRewards: number[]; // [top1, top2, top3]
  languages: ("python" | "cpp")[];
  playerIds: string[];
  mode?: "versus" | "practice";
  arenaType?: "debug" | "quiz";
  chaosEnabled?: boolean;
}

export interface ArenaPlayerPublic {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  totalScore: number;
  finalRank: number | null;
}

export interface ArenaQuestionPublic {
  id: string;
  orderIndex: number;
  language: string;
  title: string;
  statement: string;
  input: string;
  expectedOutput: string;
  shownCode: string;
  arenaType?: "debug" | "quiz";
  options?: string[];
  correctIndex?: number;
  explanation?: string | null;
  topic?: string | null;
  difficulty?: number;
  effectiveDifficulty?: number;
  calibrationSamples?: number;
  calibrationConfidence?: number;
  calibrationStatus?: string;
}

export interface ArenaRevealResult {
  userId: string;
  fullName: string;
  identified: boolean; // correctly highlighted the buggy line
  score: number;
  timeBonus: number;
  fixed: boolean; // code fix produced the expected output
  highlightedLines: number[];
  submittedCode: string | null;
  selectedIndex?: number | null;
  isCorrect?: boolean | null;
  responseTimeMs?: number | null;
}

export interface ArenaRevealPublic {
  question: ArenaQuestionPublic & { hasBug: boolean; correctCode: string; bugDescription: string | null; buggyLineNumbers: number[] };
  results: ArenaRevealResult[];
  difficulty?: { before: number; after: number; samples: number; confidence: number; status: string };
}

export interface ArenaState {
  match: {
    id: string;
    title: string;
    status: string;
    phase: string;
    mode: string;
    arenaType: string;
    currentQuestionIndex: number;
    questionCount: number;
    secondsPerQuestion: number;
    revealSeconds: number;
    tokenRewards: number[];
    languages: string[];
    knowledgeScope: number;
    scopeNote: string | null;
    chaosEnabled: boolean;
    createdAt: string;
  };
  players: ArenaPlayerPublic[];
  remainingSeconds: number;
  question: ArenaQuestionPublic | null;
  reveal: ArenaRevealPublic | null;
  submittedUserIds: string[];
  choseCorrectCount: number;
  choseBugCount: number;
  chaosEffects: ArenaChaosEffectPublic[];
  myAnswer?: { highlightedLines: number[]; submittedCode: string | null; answeredAt: string | null; score: number; selectedIndex?: number | null; isCorrect?: boolean };
  viewerKicked?: boolean;
}

// ── In-memory timers ──
const arenaTimers = new Map<string, ReturnType<typeof setInterval>>();
const arenaTicksInFlight = new Map<string, Promise<void>>();

function stopArenaTimer(matchId: string) {
  const t = arenaTimers.get(matchId);
  if (t) { clearInterval(t); arenaTimers.delete(matchId); }
}

async function broadcast(matchId: string, type: string, payload: any) {
  const { broadcastToArena } = await import("./gameWebSocket");
  broadcastToArena(matchId, { type, payload });
}

async function syncState(matchId: string, viewerUserId?: string) {
  const state = await getArenaState(matchId, viewerUserId);
  // Broadcast public state (omit per-user myAnswer)
  const { myAnswer, ...publicState } = state;
  await broadcast(matchId, "arena_state", publicState);
}

/**
 * Build a FOCUS note from a teacher-selected module (chapter).
 * The note strongly directs ALL questions to that single chapter (not all
 * chapters up to it) so the AI concentrates on what the teacher picked.
 */
async function getModuleScope(moduleId: string): Promise<{ scope: number; note: string }> {
  const mod = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { title: true, orderIndex: true, courseId: true },
  });
  if (!mod) return { scope: 0, note: "" };

  // Focus: lessons IN the selected module only
  const focusLessons = await prisma.lesson.findMany({
    where: { moduleId },
    orderBy: { orderIndex: "asc" },
    select: { title: true, description: true },
  });

  // Background: earlier modules (titles only) — for light context, NOT focus
  const earlierModules = await prisma.module.findMany({
    where: { courseId: mod.courseId, orderIndex: { lt: mod.orderIndex } },
    orderBy: { orderIndex: "asc" },
    select: { title: true },
  });

  const course = await prisma.course.findUnique({
    where: { id: mod.courseId },
    select: { id: true, title: true, description: true },
  });

  // The chapter's real teaching material lives in the course content JSON, not
  // in the database: the C++ seeder writes lesson titles and nothing else, so
  // building this note from Prisma rows alone would hand the AI a bare list of
  // names. Prefer the JSON chapter block and fall back to DB rows for courses
  // that have no content file.
  const moduleContext = course ? getModuleContext(course, mod.title) : null;

  let focusDetails: string;
  if (moduleContext) {
    focusDetails = formatModuleContext(moduleContext);
  } else {
    const objectivesMap = course
      ? getBulkLessonObjectives(course, focusLessons.map((l) => l.title))
      : new Map<string, string[]>();

    const lessonLines = focusLessons
      .map((l) => {
        const objectives = objectivesMap.get(l.title);
        const desc = l.description ? `: ${l.description}` : "";
        const objectivesBlock = objectives && objectives.length > 0 ? `\n${formatObjectives(objectives)}` : "";
        return `  - ${l.title}${desc}${objectivesBlock}`;
      })
      .join("\n");
    focusDetails = `Nội dung chương "${mod.title}":\n${lessonLines}`;
  }

  const note =
    `CHƯƠNG TRỌNG TÂM GIÁO VIÊN CHỌN: "${mod.title}".\n` +
    `TẤT CẢ câu hỏi phải THUỘC chương này và bám sát nội dung bên dưới (đa dạng các bài trong chương, không lạc sang chương khác).\n` +
    focusDetails +
    (earlierModules.length > 0
      ? `\n(kiến thức nền đã học trước đó: ${earlierModules.map((m) => m.title).join(", ")} — chỉ tham khảo, KHÔNG làm trọng tâm)`
      : "");

  return { scope: focusLessons.length, note };
}

/**
 * Combine everything the teacher explicitly asked for (chapter focus +
 * custom prompt) into a single high-priority instruction block.
 */
async function buildTeacherNote(match: { moduleId: string | null; customPrompt: string | null }): Promise<string | null> {
  const parts: string[] = [];
  if (match.moduleId) {
    const focus = await getModuleScope(match.moduleId);
    if (focus.note) parts.push(focus.note);
  }
  if (match.customPrompt && match.customPrompt.trim()) {
    parts.push(`YÊU CẦU THÊM TỪ GIÁO VIÊN:\n${match.customPrompt.trim()}`);
  }
  return parts.length ? parts.join("\n\n") : null;
}

// ── Knowledge scope balancing ──

/**
 * Build the knowledge scope based on the ACTUAL lessons the weakest student
 * has completed, not just a raw lesson count. Returns a list of learned topics
 * and the furthest chapter the student has reached.
 */
async function computeKnowledgeScope(playerIds: string[], courseId?: string): Promise<{ scope: number; note: string }> {
  if (playerIds.length === 0) {
    return { scope: 0, note: "chưa học gì: chỉ dùng biến, nhập/xuất (input/print), biểu thức toán học đơn giản" };
  }

  // Find the student with the fewest completed lessons
  const playerProgress = await Promise.all(
    playerIds.map(async (userId) => {
      const where: any = { userId };
      if (courseId) where.lesson = { courseId };
      const count = await prisma.lessonProgress.count({ where });
      return { userId, count };
    }),
  );
  const weakest = playerProgress.reduce((min, p) => (p.count < min.count ? p : min), playerProgress[0]);

  if (!courseId) {
    // No course context — count all progress across all courses
    return {
      scope: weakest.count,
      note: weakest.count <= 0
        ? "chưa học gì: chỉ dùng biến, nhập/xuất (input/print), biểu thức toán học đơn giản"
        : weakest.count <= 5
          ? "cơ bản: biến, nhập/xuất, biểu thức, điều kiện if/else, vòng lặp for/while đơn giản"
          : weakest.count <= 15
            ? "trung bình: thêm danh sách (list)/mảng, chuỗi, hàm cơ bản"
            : "nâng cao: có thể dùng dict, hàm, đệ quy, thuật toán đơn giản (sắp xếp, tìm kiếm)",
    };
  }

  // For a specific course: find the chapter (module) the weakest student reached
  // Get all lessons for the course, ordered
  const allLessons = await prisma.lesson.findMany({
    where: { courseId },
    orderBy: [{ module: { orderIndex: "asc" } }, { orderIndex: "asc" }],
    select: { id: true, title: true, moduleId: true, module: { select: { title: true, orderIndex: true } } },
  });

  // Get which specific lessons the weakest student has completed
  const completedLessons = await prisma.lessonProgress.findMany({
    where: { userId: weakest.userId, lesson: { courseId } },
    select: { lessonId: true },
  });
  const completedSet = new Set(completedLessons.map((l) => l.lessonId));

  // Find the furthest module the student has reached
  let furthestModuleTitle = "Chưa bắt đầu";
  let furthestModuleIndex = -1;
  const learnedTopics: string[] = [];
  const completedLessonTitles: string[] = [];

  for (const lesson of allLessons) {
    if (completedSet.has(lesson.id)) {
      if (lesson.module.orderIndex > furthestModuleIndex) {
        furthestModuleIndex = lesson.module.orderIndex;
        furthestModuleTitle = lesson.module.title;
      }
      learnedTopics.push(lesson.title);
      completedLessonTitles.push(lesson.title);
    }
  }

  // Fetch course info for JSON content matching
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, description: true },
  });

  // Extract lesson objectives from structured JSON
  const objectivesMap = course
    ? getBulkLessonObjectives(course, completedLessonTitles)
    : new Map<string, string[]>();

  // Build detailed topic list with objectives
  const detailedTopics = completedLessonTitles
    .map((title) => {
      const objectives = objectivesMap.get(title);
      const objectivesBlock = objectives && objectives.length > 0
        ? `\n${formatObjectives(objectives)}`
        : "";
      return `  - ${title}${objectivesBlock}`;
    })
    .join("\n");

  // Build a precise scope note based on what the student actually knows
  const scopeNote = furthestModuleIndex < 0
    ? `Học sinh CHƯA HOÀN THÀNH bài nào trong khóa này. CHỈ dùng kiến thức cực kỳ cơ bản: biến, nhập/xuất (input/print), biểu thức toán học đơn giản. KHÔNG dùng if/else, KHÔNG dùng vòng lặp.`
    : `Học sinh đã học đến: "${furthestModuleTitle}". Các chủ đề đã biết (kèm mục tiêu từng bài):\n${detailedTopics}\nCHỈ ra câu hỏi trong phạm vi những chủ đề trên. TUYỆT ĐỐI KHÔNG dùng kiến thức vượt quá ${furthestModuleTitle}.`;

  return { scope: weakest.count, note: scopeNote };
}

// ── Match lifecycle ──

export async function createArena(input: CreateArenaInput, createdById: string) {
  const mode = input.mode || "versus";
  // Background knowledge note (what students already know). The teacher's
  // chapter focus + custom prompt are combined separately at generation time.
  const scope = await computeKnowledgeScope(input.playerIds, input.courseId);
  const match = await prisma.debugArenaMatch.create({
    data: {
      title: input.title,
      courseId: input.courseId || null,
      moduleId: input.moduleId || null,
      customPrompt: input.customPrompt || null,
      mode,
      questionCount: input.questionCount,
      secondsPerQuestion: input.secondsPerQuestion,
      revealSeconds: input.revealSeconds,
      countdownSeconds: 3,
      arenaType: input.arenaType || "debug",
      // Chaos is deliberately unavailable in practice and Quiz Arena.
      chaosEnabled: Boolean(input.chaosEnabled && mode === "versus" && (input.arenaType || "debug") === "debug"),
      tokenRewards: JSON.stringify(mode === "practice" ? [] : input.tokenRewards || []),
      languages: JSON.stringify(input.languages?.length ? input.languages : ["python"]),
      knowledgeScope: scope.scope,
      scopeNote: scope.note,
      createdById,
    },
  });
  for (const userId of input.playerIds) {
    await prisma.debugArenaPlayer.create({ data: { matchId: match.id, userId } });
  }
  return match;
}

function parseTargetUserIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Buy and trigger a Chaos Arena spell. This is intentionally server-owned:
 * token debit, one-use-per-question rule, targeting and expiry are committed
 * together so a client cannot forge an effect or double-spend on retries.
 */
export async function useChaosPower(
  matchId: string,
  userId: string,
  input: { power: string; actionId?: string },
): Promise<{ balance: number; effect: ArenaChaosEffectPublic }> {
  if (input.power !== "blackout" && input.power !== "generator") throw new Error("Phép không hợp lệ.");
  const power = input.power as ChaosPower;
  const actionId = typeof input.actionId === "string" && input.actionId.trim()
    ? input.actionId.trim().slice(0, 100)
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const actionKey = `${matchId}:${userId}:${actionId}`;

  let result: { balance: number; effect: ArenaChaosEffectPublic };
  try {
    result = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.arenaChaosEffect.findUnique({ where: { actionKey } });
      if (duplicate) {
        const balance = (await tx.user.findUnique({ where: { id: userId }, select: { tokenBalance: true } }))?.tokenBalance ?? 0;
        return {
          balance,
          effect: { id: duplicate.id, power: duplicate.power as ChaosPower, sourceUserId: duplicate.sourceUserId, targetUserIds: parseTargetUserIds(duplicate.targetUserIds), questionIndex: duplicate.questionIndex, endsAt: duplicate.endsAt.toISOString() },
        };
      }

      const match = await tx.debugArenaMatch.findUnique({
        where: { id: matchId },
        include: { players: { select: { userId: true } }, chaosEffects: true },
      });
      if (!match || !match.chaosEnabled || match.mode !== "versus" || match.arenaType !== "debug") {
        throw new Error("Phòng này chưa bật Chaos Debug Arena.");
      }
      if (match.status !== "in_progress" || match.phase !== "question" || match.currentQuestionIndex < 0) {
        throw new Error("Chỉ có thể dùng phép khi đang giải câu hỏi.");
      }
      if (!match.players.some((player) => player.userId === userId)) throw new Error("Bạn không phải người chơi trong arena này.");

      const now = new Date();
      const remaining = match.phaseEndsAt ? Math.max(0, Math.ceil((match.phaseEndsAt.getTime() - now.getTime()) / 1000)) : 0;
      if (remaining < 15) throw new Error("Không thể dùng phép trong 15 giây cuối.");
      if (match.chaosEffects.some((effect) => effect.sourceUserId === userId && effect.power === power && effect.questionIndex === match.currentQuestionIndex)) {
        throw new Error("Bạn đã dùng phép này ở câu hiện tại.");
      }

      const activeEffects = match.chaosEffects.filter((effect) => effect.endsAt > now);
      let targets: string[];
      let endsAt: Date;
      if (power === "blackout") {
        const protectedUsers = new Set(
          activeEffects
            .filter((effect) => effect.power === "generator")
            .flatMap((effect) => parseTargetUserIds(effect.targetUserIds)),
        );
        targets = match.players.map((player) => player.userId).filter((id) => id !== userId && !protectedUsers.has(id));
        if (targets.length === 0) throw new Error("Không còn đối thủ nào có thể bị cúp điện.");
        // Blackout deliberately persists for the whole current question.
        // The arena state machine owns phaseEndsAt, so this cannot drift from
        // the actual timer or be extended by a client.
        endsAt = match.phaseEndsAt || new Date(now.getTime() + 60_000);
      } else {
        targets = [userId];
        // The generator lasts through the active question and can also be used
        // as a rescue while a blackout is already on screen.
        endsAt = match.phaseEndsAt || new Date(now.getTime() + 60_000);
      }

      const user = await tx.user.findUnique({ where: { id: userId }, select: { tokenBalance: true } });
      const cost = CHAOS_POWERUPS[power].tokenCost;
      const currentBalance = user?.tokenBalance ?? 0;
      if (currentBalance < cost) throw new Error("Số dư token không đủ.");
      const balance = currentBalance - cost;
      const effect = await tx.arenaChaosEffect.create({
        data: { matchId, sourceUserId: userId, power, targetUserIds: JSON.stringify(targets), questionIndex: match.currentQuestionIndex, actionKey, endsAt },
      });
      await tx.tokenTransaction.create({
        data: {
          userId,
          amount: -cost,
          balanceAfter: balance,
          type: "spend",
          reason: `arena_chaos_${power}`,
          description: `${CHAOS_POWERUPS[power].label} · ${match.title}`,
          refType: "ArenaChaosEffect",
          refId: effect.id,
        },
      });
      await tx.user.update({ where: { id: userId }, data: { tokenBalance: balance } });
      return { balance, effect: { id: effect.id, power, sourceUserId: userId, targetUserIds: targets, questionIndex: effect.questionIndex, endsAt: effect.endsAt.toISOString() } };
    });
  } catch (error: any) {
    // A network retry racing the initial commit can hit the unique action key.
    if (error?.code === "P2002") {
      const duplicate = await prisma.arenaChaosEffect.findUnique({ where: { actionKey } });
      if (duplicate) {
        const balance = (await prisma.user.findUnique({ where: { id: userId }, select: { tokenBalance: true } }))?.tokenBalance ?? 0;
        result = { balance, effect: { id: duplicate.id, power: duplicate.power as ChaosPower, sourceUserId: duplicate.sourceUserId, targetUserIds: parseTargetUserIds(duplicate.targetUserIds), questionIndex: duplicate.questionIndex, endsAt: duplicate.endsAt.toISOString() } };
      } else throw error;
    } else throw error;
  }
  await syncState(matchId);
  await broadcast(matchId, "arena_chaos", { power: result.effect.power, sourceUserId: result.effect.sourceUserId, targetUserIds: result.effect.targetUserIds, endsAt: result.effect.endsAt });
  return result;
}

/** A student joins an open versus lobby. Blocked if kicked or already started. */
export async function joinArena(matchId: string, userId: string) {
  const match = await prisma.debugArenaMatch.findUnique({
    where: { id: matchId },
    include: {
      kicks: { select: { userId: true } },
      players: { select: { userId: true } },
    },
  });
  if (!match) throw new Error("Không tìm thấy arena");
  if (match.mode === "practice") throw new Error("Phòng luyện tập không thể tham gia");
  if (match.status !== "lobby") throw new Error("Arena đã bắt đầu, không thể vào");
  if (match.kicks.some((k) => k.userId === userId)) throw new Error("Bạn đã bị mời ra khỏi phòng này và không thể vào lại");
  if (match.players.some((p) => p.userId === userId)) return; // already a player
  await prisma.debugArenaPlayer.create({ data: { matchId, userId } });
  await syncState(matchId);
}

/** A player leaves on their own (only meaningful while in lobby). */
export async function leaveArena(matchId: string, userId: string) {
  await prisma.debugArenaPlayer.deleteMany({ where: { matchId, userId } });
  await syncState(matchId);
}

/** Teacher kicks a player: remove them and ban re-entry for this match. */
export async function kickPlayer(matchId: string, userId: string) {
  const match = await prisma.debugArenaMatch.findUnique({ where: { id: matchId }, select: { status: true } });
  if (!match) throw new Error("Không tìm thấy arena");
  await prisma.debugArenaPlayer.deleteMany({ where: { matchId, userId } });
  await prisma.debugArenaKick.upsert({
    where: { matchId_userId: { matchId, userId } },
    create: { matchId, userId },
    update: {},
  });
  await syncState(matchId);
  // Tell the kicked user's client (still in the room) to show the kicked screen
  await broadcast(matchId, "arena_kicked", { userId });
}

/**
 * Solo practice: create a match with the student as the only player and
 * auto-start it (no host lobby). Returns the match ready to play.
 */
export async function startPractice(
  userId: string,
  config: {
    title?: string;
    courseId?: string;
    moduleId?: string;
    customPrompt?: string;
    questionCount: number;
    secondsPerQuestion: number;
    revealSeconds: number;
    languages: ("python" | "cpp")[];
    arenaType?: "debug" | "quiz";
  },
) {
  const match = await createArena(
    {
      title: config.title || "Luyện tập Debug",
      courseId: config.courseId,
      moduleId: config.moduleId,
      customPrompt: config.customPrompt,
      questionCount: config.questionCount,
      secondsPerQuestion: config.secondsPerQuestion,
      revealSeconds: config.revealSeconds,
      tokenRewards: [],
      languages: config.languages,
      playerIds: [userId],
      mode: "practice",
      arenaType: config.arenaType || "debug",
    },
    userId,
  );
  // Fire startArena in the background so the client sees the "generating"
  // phase first (instead of jumping straight to countdown).
  startArena(match.id).catch((e) => console.error("practice startArena error:", e));
  return match;
}

/** Generate ONLY the first question (fast start), then enter countdown.
 *  Remaining questions are generated in the background (always one ahead). */
export async function startArena(matchId: string) {
  const initialMatch = await prisma.debugArenaMatch.findUnique({ where: { id: matchId }, select: { arenaType: true } });
  if (initialMatch?.arenaType === "quiz") return startQuizArena(matchId);
  const match = await prisma.debugArenaMatch.findUnique({
    where: { id: matchId },
    include: { players: true },
  });
  if (!match) throw new Error("Không tìm thấy arena");
  if (match.status !== "lobby") throw new Error("Arena đã bắt đầu hoặc kết thúc");

  await prisma.debugArenaMatch.update({
    where: { id: matchId },
    data: { status: "generating", phase: "generating" },
  });
  await broadcast(matchId, "arena_generating", { status: "generating" });

  const languages = JSON.parse(match.languages) as ("python" | "cpp")[];

  // Recompute background knowledge from the players who actually joined (self-join flow)
  let scopeNote = match.scopeNote;
  if (match.moduleId) {
    // Teacher selected a specific chapter — scope is the chapter itself.
    // Without this, computeKnowledgeScope would happily pull topics from
    // later chapters the student already reached, and the AI happily uses
    // those (the classic symptom: Ch 3 selected, question contains if/else
    // because the student had finished Ch 5).
    const focus = await getModuleScope(match.moduleId);
    if (focus.note) scopeNote = focus.note;
  } else if (match.mode !== "practice") {
    const playerIds = match.players.map((p) => p.userId);
    const scope = await computeKnowledgeScope(playerIds, match.courseId || undefined);
    scopeNote = scope.note;
    await prisma.debugArenaMatch.update({
      where: { id: matchId },
      data: { knowledgeScope: scope.scope, scopeNote: scope.note },
    });
  }

  // Teacher's explicit instructions (chapter focus + custom prompt) — high priority
  const teacherNote = await buildTeacherNote(match);

  // Generate question 0 synchronously, retrying until the AI produces a valid
  // question (no canned fallback). Client sees phase=generating (loading) meanwhile.
  const recentTitles0 = await getRecentQuestionTitles(30, 60);
  const spec0 = await generateOneValidatedQuestion(languages[0] || "python", scopeNote, 0, recentTitles0, undefined, teacherNote);
  await saveQuestion(matchId, 0, spec0);

  await prisma.debugArenaMatch.update({
    where: { id: matchId },
    data: { status: "in_progress", phase: "countdown", currentQuestionIndex: -1, phaseEndsAt: new Date(Date.now() + match.countdownSeconds * 1000) },
  });
  startTicker(matchId);
  // Send full state BEFORE phase change so client has countdown data immediately
  await syncState(matchId);
  await broadcast(matchId, "arena_phase", { phase: "countdown" });

  // Background: generate remaining questions (1..N-1) so they're ready ahead of time
  generateRemainingQuestions(matchId, match.questionCount, languages, scopeNote, teacherNote).catch((e) =>
    console.error("background question generation error:", e),
  );

  return { ok: true, questionCount: match.questionCount };
}

async function startQuizArena(matchId: string) {
  const match = await prisma.debugArenaMatch.findUnique({ where: { id: matchId }, include: { players: true } });
  if (!match) throw new Error("Khong tim thay quiz arena");
  await prisma.debugArenaMatch.update({ where: { id: matchId }, data: { status: "generating", phase: "generating" } });
  await broadcast(matchId, "arena_generating", { status: "generating" });

  const note = match.moduleId
    ? (await getModuleScope(match.moduleId)).note
    : (match.mode === "practice"
      ? match.scopeNote
      : (await computeKnowledgeScope(match.players.map((p) => p.userId), match.courseId || undefined)).note);
  if (note !== match.scopeNote) await prisma.debugArenaMatch.update({ where: { id: matchId }, data: { scopeNote: note } });

  try {
    await generateQuizPairForMatch(matchId, 0);
  } catch (error) {
    await prisma.debugArenaMatch.update({ where: { id: matchId }, data: { status: "lobby", phase: "lobby", phaseEndsAt: null } });
    await broadcast(matchId, "arena_generation_failed", { message: "AI chưa tạo được câu hỏi hợp lệ. Có thể thử bắt đầu lại." });
    throw error;
  }
  await prisma.debugArenaMatch.update({
    where: { id: matchId },
    data: { status: "in_progress", phase: "countdown", currentQuestionIndex: -1, phaseEndsAt: new Date(Date.now() + match.countdownSeconds * 1000) },
  });
  startTicker(matchId);
  await syncState(matchId);
  await broadcast(matchId, "arena_phase", { phase: "countdown" });
  return { ok: true, questionCount: match.questionCount };
}

/**
 * Derive the valid skillId scope for AI-generated quiz items of a match:
 * approved tags on the module's lesson-quiz questions first, then title-based
 * guesses. Empty array → generator falls back to "skillId nếu xác định được".
 */
async function deriveQuizSkillScope(moduleId: string | null): Promise<string[]> {
  if (!moduleId) return [];
  try {
    const rows = await prisma.quizQuestion.findMany({
      where: {
        skillTagStatus: "approved",
        skillId: { not: null },
        quiz: { lesson: { moduleId } },
      },
      select: { skillId: true },
    });
    const tagged = [...new Set(rows.map((r) => r.skillId).filter((s): s is string => Boolean(s)))];
    // No title-based fallback: an untagged module yields an empty scope and the
    // generator falls back to its default behavior (see skill-assessment.md).
    return tagged;
  } catch (err) {
    console.error("[debugArena] deriveQuizSkillScope failed:", err);
    return [];
  }
}

async function generateQuizPairForMatch(matchId: string, startIndex: number): Promise<void> {
  const match = await prisma.debugArenaMatch.findUnique({ where: { id: matchId } });
  if (!match || match.arenaType !== "quiz") return;
  const skillScope = await deriveQuizSkillScope(match.moduleId);
  const existing = await prisma.debugArenaQuestion.findMany({
    where: { matchId },
    orderBy: { orderIndex: "asc" },
    select: { id: true, title: true, quizDifficulty: true, quizEffectiveDifficulty: true, quizItem: { select: { fingerprint: true } } },
  });
  const previousTitles = existing.map((q) => q.title);
  const previousFingerprints = existing.flatMap((q) => q.quizItem?.fingerprint ? [q.quizItem.fingerprint] : []);
  const bank = await prisma.arenaQuizItem.findMany({ orderBy: { updatedAt: "desc" }, take: 60, select: { title: true, fingerprint: true } });
  for (const item of bank) {
    if (!previousTitles.includes(item.title)) previousTitles.push(item.title);
    if (!previousFingerprints.includes(item.fingerprint)) previousFingerprints.push(item.fingerprint);
  }
  const answers = await prisma.debugArenaAnswer.findMany({
    where: { matchId, answeredAt: { not: null } },
    select: { questionId: true, isCorrect: true, responseTimeMs: true, quizDifficultyUsed: true },
  });
  const correct = answers.filter((a) => a.isCorrect).length;
  const targetDifficulty = Math.max(1, Math.min(5, 3 + (answers.length ? (0.5 - correct / answers.length) * 2 : 0)));
  const questionPerformance = existing.map((question) => {
    const questionAnswers = answers.filter((answer) => answer.questionId === question.id);
    if (!questionAnswers.length) return `${question.title}: chua co luot tra loi`;
    const questionCorrect = questionAnswers.filter((answer) => answer.isCorrect).length;
    const avgTime = Math.round(questionAnswers.reduce((sum, answer) => sum + (answer.responseTimeMs || 0), 0) / questionAnswers.length);
    const difficulty = question.quizEffectiveDifficulty ?? question.quizDifficulty ?? 3;
    return `${question.title} (do kho ${difficulty.toFixed(2)}): ${questionCorrect}/${questionAnswers.length} dung, ${avgTime}ms trung binh`;
  });
  const performanceSummary = answers.length
    ? `${correct}/${answers.length} dung; thoi gian phan hoi trung binh ${Math.round(answers.reduce((sum, a) => sum + (a.responseTimeMs || 0), 0) / answers.length)}ms\n${questionPerformance.join("\n")}`
    : null;
  // The teacher's chapter choice reaches the quiz prompt the same way it reaches
  // the debug one. Passing customPrompt alone silently dropped the selected
  // module: a teacher who picked "Chương 8" got questions from anywhere.
  const teacherNote = await buildTeacherNote(match);
  const reviewContext = { topicNote: teacherNote, scopeNote: match.scopeNote };

  let pair = await reviewQuizBatch(
    await generateQuizPair({
      topicNote: teacherNote,
      scopeNote: match.scopeNote,
      targetDifficulty,
      previousTitles,
      previousFingerprints,
      performanceSummary,
      skillScope,
    }),
    reviewContext,
  );
  const needed = Math.min(2, match.questionCount - startIndex);
  // Review can drop candidates, so this loop now also serves to replace rejects.
  for (let retry = 0; pair.length < needed && retry < 2; retry++) {
    const more = await reviewQuizBatch(
      await generateQuizPair({ topicNote: teacherNote, scopeNote: match.scopeNote, targetDifficulty, previousTitles, previousFingerprints, performanceSummary, skillScope }),
      reviewContext,
    );
    const seen = new Set(pair.map((item) => quizItemFingerprint(item)));
    pair = [...pair, ...more.filter((item) => !seen.has(quizItemFingerprint(item)))].slice(0, 2);
  }
  if (pair.length < 1) throw new Error("AI chua tao duoc cau hoi trac nghiem hop le");

  const count = Math.min(pair.length, match.questionCount - startIndex);
  for (let i = 0; i < count; i++) {
    const item = await upsertQuizItem(pair[i]);
    const orderIndex = startIndex + i;
    const already = await prisma.debugArenaQuestion.findFirst({ where: { matchId, orderIndex } });
    if (already) continue;
    await prisma.debugArenaQuestion.create({
      data: {
        matchId,
        orderIndex,
        language: "python",
        title: item.title,
        statement: item.statement,
        input: "",
        expectedOutput: "",
        shownCode: "",
        correctCode: "",
        hasBug: false,
        quizItemId: item.id,
        quizOptions: item.options,
        quizCorrectIndex: item.correctIndex,
        quizExplanation: item.explanation,
        quizTopic: item.topic,
        quizDifficulty: item.authoredDifficulty,
        quizEffectiveDifficulty: item.effectiveDifficulty || item.authoredDifficulty,
        quizCalibrationSamples: item.calibrationSamples,
        quizCalibrationConfidence: item.calibrationConfidence,
        quizCalibrationStatus: item.calibrationStatus,
      },
    });
  }
}

async function upsertQuizItem(spec: QuizQuestionSpec) {
  const fingerprint = quizItemFingerprint(spec);
  const existing = await prisma.arenaQuizItem.findUnique({ where: { fingerprint } });
  if (existing) return existing;
  return prisma.arenaQuizItem.create({
    data: {
      fingerprint,
      title: spec.title,
      statement: spec.statement,
      options: JSON.stringify(spec.options),
      correctIndex: spec.correctIndex,
      explanation: spec.explanation,
      topic: spec.topic,
      authoredDifficulty: spec.difficulty,
      effectiveDifficulty: spec.difficulty,
      skillId: spec.skillId,
      aiSkillSuggest: spec.skillId,
    },
  });
}

/** Persist a single validated question to the DB. */
async function saveQuestion(matchId: string, orderIndex: number, spec: ValidatedSpec) {
  await prisma.debugArenaQuestion.create({
    data: {
      matchId,
      orderIndex,
      language: spec.language,
      title: spec.title,
      statement: spec.statement,
      input: spec.input,
      expectedOutput: spec.expectedOutput,
      shownCode: spec.shownCode,
      correctCode: spec.correctCode,
      hasBug: spec.hasBug,
      bugDescription: spec.bugDescription,
      buggyLineNumbers: JSON.stringify(spec.buggyLineNumbers),
    },
  });
}

/** Generate all remaining questions (index 1..N-1) in the background, in
 *  parallel batches of 3 to respect API rate limits. Each question retries
 *  until valid (no canned fallback). */
async function generateRemainingQuestions(
  matchId: string,
  totalCount: number,
  languages: ("python" | "cpp")[],
  scopeNote: string | null,
  teacherNote: string | null = null,
) {
  const remaining = totalCount - 1; // question 0 already generated
  if (remaining <= 0) return;

  // Get recent titles + already generated in this match for dedup
  const recentTitles = await getRecentQuestionTitles(30, 60);
  const prevQuestions = await prisma.debugArenaQuestion.findMany({
    where: { matchId },
    select: { title: true },
    orderBy: { orderIndex: "asc" },
  });
  const allPreviousTitles = [...recentTitles, ...prevQuestions.map((q) => q.title)];

  // Plan remaining questions
  const lang = languages[0] || "python";
  const plan = await planQuestions(remaining, scopeNote, lang, allPreviousTitles, teacherNote);
  console.log(`[Arena] Remaining plan: ${plan.length} items, topics: ${plan.map(p => p.topic).join(" | ")}`);

  // Collect indices that still need generation
  const indices: number[] = [];
  for (let i = 1; i < totalCount; i++) {
    const existing = await prisma.debugArenaQuestion.findFirst({ where: { matchId, orderIndex: i } });
    if (!existing) indices.push(i);
  }

  // Generate in parallel batches of 3. Background generation is BEST-EFFORT:
  // if a question can't be produced after the internal retries, skip it here
  // (don't block the rest). When the player actually reaches it, the on-demand
  // ensureQuestionGenerated will retry persistently with a loading screen.
  await runInBatches(
    indices,
    async (i) => {
      const planItem = plan[i - 1]; // plan[0] = question 1, etc.
      const itemLang = languages[i % languages.length] || "python";
      const spec = await buildOneValidatedQuestion(itemLang, scopeNote, i, allPreviousTitles, planItem || undefined, teacherNote);
      if (!spec) {
        console.log(`[Arena] Q${i}: background gen failed — will retry on-demand when player reaches it`);
        return;
      }
      await saveQuestion(matchId, i, spec).catch((e) => console.error(`[Arena] Q${i} save failed:`, e?.message));
    },
    3,
  );
}

// Dedupe on-demand generation so overlapping ticks/requests share one promise
const questionGenInFlight = new Map<string, Promise<void>>();

/** Ensure question at `index` exists in DB. If not, generate it (retrying until
 *  valid — no canned fallback). Concurrent callers for the same (match, index)
 *  share a single in-flight promise. */
async function ensureQuestionGenerated(matchId: string, index: number) {
  const existing = await prisma.debugArenaQuestion.findFirst({ where: { matchId, orderIndex: index } });
  if (existing) return;

  const key = `${matchId}:${index}`;
  const inFlight = questionGenInFlight.get(key);
  if (inFlight) return inFlight;

  const p = (async () => {
    try {
      const match = await prisma.debugArenaMatch.findUnique({ where: { id: matchId } });
      if (!match) return;
      const languages = JSON.parse(match.languages) as ("python" | "cpp")[];
      const itemLang = languages[index % languages.length] || "python";
      const teacherNote = await buildTeacherNote(match);

      // Match startArena + generateRemainingQuestions: 30-day recent titles are
      // also passed so the AI can dedupe against every arena played in the last
      // month, not just this match.
      const [recentTitles, prevQuestions] = await Promise.all([
        getRecentQuestionTitles(30, 60),
        prisma.debugArenaQuestion.findMany({
          where: { matchId },
          select: { title: true },
          orderBy: { orderIndex: "asc" },
        }),
      ]);
      const seen = new Set<string>();
      const allPreviousTitles: string[] = [];
      for (const title of [...recentTitles, ...prevQuestions.map((q) => q.title)]) {
        if (!seen.has(title)) {
          seen.add(title);
          allPreviousTitles.push(title);
        }
      }

      // The plan generated by generateRemainingQuestions lives only in that
      // function's stack; recompute for this one slot so the on-demand
      // question still gets topic / bugType / difficulty guidance.
      const [planItem] = await planQuestions(1, match.scopeNote, itemLang, allPreviousTitles, teacherNote);

      const spec = await generateOneValidatedQuestion(
        itemLang,
        match.scopeNote,
        index,
        allPreviousTitles,
        planItem,
        teacherNote,
      );
      await saveQuestion(matchId, index, spec);
    } finally {
      questionGenInFlight.delete(key);
    }
  })();
  questionGenInFlight.set(key, p);
  return p;
}

interface ValidatedSpec extends Omit<DebugQuestionSpec, "bugDescription"> {
  expectedOutput: string;
  shownCode: string;
  hasBug: boolean;
  bugDescription: string | null;
  buggyLineNumbers: number[];
}

/**
 * Diff correctCode vs buggyCode → list of 1-indexed buggy line numbers in the
 * buggyCode. Ground truth for the "highlight the buggy line" task. We diff
 * rather than trust the AI to count lines (LLMs are bad at that).
 */
function diffBuggyLines(correctCode: string, buggyCode: string): number[] {
  // Normalize: split, trim trailing whitespace per line, drop trailing empty lines
  const norm = (code: string) => {
    const lines = code.replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/\s+$/, ""));
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines;
  };
  const correctLines = norm(correctCode);
  const buggyLines = norm(buggyCode);
  const out: number[] = [];

  if (correctLines.length === buggyLines.length) {
    // Same structure — compare line by line (the common case for subtle bugs)
    for (let i = 0; i < buggyLines.length; i++) {
      if (correctLines[i] !== buggyLines[i]) out.push(i + 1);
    }
  } else {
    // Different line count — align from the top, mark everything from the
    // first difference onward in the buggy code (best-effort for multi-line bugs)
    const minLen = Math.min(correctLines.length, buggyLines.length);
    let firstDiff = -1;
    for (let i = 0; i < minLen; i++) {
      if (correctLines[i] !== buggyLines[i]) { firstDiff = i; break; }
    }
    const start = firstDiff === -1 ? minLen : firstDiff;
    for (let i = start; i < buggyLines.length; i++) out.push(i + 1);
  }

  return out;
}

/**
 * How many times the reviewer may reject inside a single
 * buildOneValidatedQuestion call. A question that has already passed execution
 * validation costs real time to replace, and the reviewer is an opinion rather
 * than an oracle: without a cap, a strict reviewer could reject every candidate
 * and leave players staring at the loading screen. After the budget is spent we
 * keep the next execution-valid question and log that we did.
 */
const MAX_REVIEW_REJECTS = 2;

async function buildOneValidatedQuestion(
  language: "python" | "cpp",
  scopeNote: string | null,
  index: number,
  previousTitles: string[] = [],
  plan?: PlanItem,
  teacherNote: string | null = null,
): Promise<ValidatedSpec | null> {
  let reviewRejects = 0;

  for (let attempt = 0; attempt < 4; attempt++) {
    const spec = await generateDebugQuestion(language, scopeNote, index, previousTitles, plan, teacherNote);
    if (!spec) { console.log(`[Arena] Q${index} attempt ${attempt + 1}/4: AI returned nothing`); continue; }
    // Validate correct code produces some output
    const correctRun = await executeCode(language, spec.correctCode, spec.input);
    if (!correctRun.ok || !correctRun.output.trim()) { console.log(`[Arena] Q${index} attempt ${attempt + 1}/4: correctCode crashed/no output`); continue; }
    const expectedOutput = correctRun.output;

    // Validate buggy code runs AND actually produces a different output
    const buggyRun = await executeCode(language, spec.buggyCode, spec.input);
    if (!buggyRun.ok) { console.log(`[Arena] Q${index} attempt ${attempt + 1}/4: buggyCode crashed`); continue; }
    const effectivelyBuggy = buggyRun.output.trim() !== expectedOutput.trim();
    if (!effectivelyBuggy) { console.log(`[Arena] Q${index} attempt ${attempt + 1}/4: bug has no effect (same output)`); continue; }

    // Bug is ALWAYS present. Compute the buggy line numbers by diffing.
    const buggyLineNumbers = diffBuggyLines(spec.correctCode, spec.buggyCode);
    if (buggyLineNumbers.length === 0) { console.log(`[Arena] Q${index} attempt ${attempt + 1}/4: no buggy line (codes identical)`); continue; }
    // Enforce a single-line bug so the "highlight the buggy line" task is
    // unambiguous. If the AI restructured the code (multi-line diff), retry.
    if (buggyLineNumbers.length !== 1) { console.log(`[Arena] Q${index} attempt ${attempt + 1}/4: ${buggyLineNumbers.length}-line diff (need single-line bug)`); continue; }

    // ── Review pass ──
    // Execution proved the bug is real; it says nothing about whether the
    // statement matches the code or whether the reveal explanation is accurate
    // and short. Ask a second AI, but never let its opinion strand a game:
    // a null review (key missing / circuit open / API error) keeps the question.
    let reviewed = spec;
    const review = await reviewDebugQuestion(spec, expectedOutput, buggyRun.output, scopeNote, teacherNote);
    if (review?.verdict === "reject") {
      reviewRejects++;
      if (reviewRejects <= MAX_REVIEW_REJECTS) {
        console.log(`[Arena] Q${index} attempt ${attempt + 1}/4: review REJECTED (${reviewRejects}/${MAX_REVIEW_REJECTS}) — ${review.reason}`);
        continue;
      }
      console.log(`[Arena] Q${index}: review reject budget spent — keeping question despite: ${review.reason}`);
    } else if (review?.verdict === "fix_prose") {
      reviewed = {
        ...spec,
        statement: review.statement || spec.statement,
        bugDescription: review.bugDescription || spec.bugDescription,
      };
      console.log(`[Arena] Q${index}: review rewrote prose — ${review.reason}`);
    }

    return {
      ...reviewed,
      expectedOutput,
      shownCode: reviewed.buggyCode, // always show the buggy code
      hasBug: true,
      bugDescription: reviewed.bugDescription,
      buggyLineNumbers,
    };
  }
  return null;
}

/**
 * Generate ONE validated question, retrying until the AI produces a valid one
 * (no canned fallback). Used when a question MUST be ready (question 0, and
 * on-demand when the next question isn't pre-generated yet). The client shows
 * a "Đang lựa chọn câu hỏi..." loading screen via phase=generating while this runs.
 *
 * Per the product decision: wait as long as needed for a real AI question
 * rather than degrading to easy canned questions. Each buildOneValidatedQuestion
 * call already retries the AI 4× internally; we retry that with a 2s backoff.
 */
async function generateOneValidatedQuestion(
  language: "python" | "cpp",
  scopeNote: string | null,
  index: number,
  previousTitles: string[] = [],
  plan?: PlanItem,
  teacherNote: string | null = null,
): Promise<ValidatedSpec> {
  let attempt = 0;
  while (true) {
    attempt++;
    const spec = await buildOneValidatedQuestion(language, scopeNote, index, previousTitles, plan, teacherNote);
    if (spec) return spec;
    console.log(`[Arena] Q${index}: AI attempt ${attempt} failed (no valid question), retrying in 2s...`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Run async tasks in parallel batches to respect API rate limits. */
async function runInBatches<T, R>(items: T[], fn: (item: T, i: number) => Promise<R>, batchSize = 3): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const res = await Promise.all(batch.map((item, j) => fn(item, i + j)));
    results.push(...res);
  }
  return results;
}

// ── Canned fallback questions (guaranteed valid, no AI needed) ──
function buildFallbackQuestion(language: "python" | "cpp", variant: number): ValidatedSpec {
  const pool = language === "cpp" ? FALLBACKS_CPP : FALLBACKS_PY;
  const item = pool[variant % pool.length];
  return {
    ...item,
    language,
    expectedOutput: item.expectedOutput,
    shownCode: item.buggyCode,
    hasBug: true,
    bugDescription: item.bugDescription,
    buggyLineNumbers: diffBuggyLines(item.correctCode, item.buggyCode),
  };
}

// Each fallback: correctCode is right; buggyCode changes output. hasBug decided at build time below.
interface FallbackSeed {
  title: string;
  statement: string;
  input: string;
  expectedOutput: string;
  correctCode: string;
  buggyCode: string;
  bugDescription: string;
  hasBug: boolean;
}

const FALLBACKS_PY: FallbackSeed[] = [
  {
    title: "Tổng hai số",
    statement: "Cho hai số nguyên a và b. In ra tổng a + b.",
    input: "3 5",
    expectedOutput: "8",
    correctCode: "a, b = map(int, input().split())\nprint(a + b)",
    buggyCode: "a, b = map(int, input().split())\nprint(a - b)",
    bugDescription: "Dùng dấu trừ thay vì dấu cộng.",
    hasBug: true,
  },
  {
    title: "Bình phương",
    statement: "Cho số nguyên n. In ra bình phương của n.",
    input: "4",
    expectedOutput: "16",
    correctCode: "n = int(input())\nprint(n * n)",
    buggyCode: "n = int(input())\nprint(n * 2)",
    bugDescription: "Nhân 2 thay vì bình phương.",
    hasBug: true,
  },
  {
    title: "Số lớn nhất",
    statement: "Cho 3 số nguyên trên một dòng. In ra số lớn nhất.",
    input: "3 9 5",
    expectedOutput: "9",
    correctCode: "nums = list(map(int, input().split()))\nprint(max(nums))",
    buggyCode: "nums = list(map(int, input().split()))\nprint(min(nums))",
    bugDescription: "Dùng min thay vì max.",
    hasBug: true,
  },
];

const FALLBACKS_CPP: FallbackSeed[] = [
  {
    title: "Tổng hai số",
    statement: "Cho hai số nguyên a và b. In ra tổng a + b.",
    input: "3 5",
    expectedOutput: "8",
    correctCode: "#include <iostream>\nusing namespace std;\nint main(){int a,b;cin>>a>>b;cout<<a+b;return 0;}",
    buggyCode: "#include <iostream>\nusing namespace std;\nint main(){int a,b;cin>>a>>b;cout<<a-b;return 0;}",
    bugDescription: "Dùng dấu trừ thay vì dấu cộng.",
    hasBug: true,
  },
  {
    title: "Bình phương",
    statement: "Cho số nguyên n. In ra bình phương của n.",
    input: "4",
    expectedOutput: "16",
    correctCode: "#include <iostream>\nusing namespace std;\nint main(){int n;cin>>n;cout<<n*n;return 0;}",
    buggyCode: "#include <iostream>\nusing namespace std;\nint main(){int n;cin>>n;cout<<n*2;return 0;}",
    bugDescription: "Nhân 2 thay vì bình phương.",
    hasBug: true,
  },
];

// ── Code execution helper ──
async function executeCode(
  language: string,
  code: string,
  input: string,
): Promise<{ ok: boolean; output: string; error?: string }> {
  try {
    if (language === "cpp") {
      const r = await runCppCode(code, input);
      if (r.status !== "success") return { ok: false, output: "", error: r.stderr };
      return { ok: true, output: r.stdout };
    }
    const r = await runPythonCode(code, input);
    if (r.status !== "success") return { ok: false, output: "", error: r.stderr };
    return { ok: true, output: r.stdout };
  } catch (err: any) {
    return { ok: false, output: "", error: err?.message || "execution error" };
  }
}

// ── Ticker / state machine ──
function startTicker(matchId: string) {
  stopArenaTimer(matchId);
  const interval = setInterval(() => {
    // A slow database/AI transition must never overlap the next one-second tick.
    if (arenaTicksInFlight.has(matchId)) return;
    const tick = tickArena(matchId)
      .catch((e) => console.error("arena tick error:", e))
      .finally(() => arenaTicksInFlight.delete(matchId));
    arenaTicksInFlight.set(matchId, tick);
  }, 1000);
  arenaTimers.set(matchId, interval);
}

async function tickArena(matchId: string) {
  const match = await prisma.debugArenaMatch.findUnique({ where: { id: matchId } });
  if (!match || match.status !== "in_progress") {
    stopArenaTimer(matchId);
    return;
  }
  const remaining = match.phaseEndsAt ? Math.max(0, Math.ceil((match.phaseEndsAt.getTime() - Date.now()) / 1000)) : 0;
  await broadcast(matchId, "arena_timer", { remainingSeconds: remaining });

  if (remaining > 0) return;

  // Phase ended → transition
  if (match.phase === "countdown") {
    await enterQuestion(matchId, 0);
  } else if (match.phase === "question") {
    await enterReveal(matchId);
  } else if (match.phase === "reveal") {
    await advanceFromReveal(matchId);
  }
}

async function enterQuestion(matchId: string, index: number) {
  const match = await prisma.debugArenaMatch.findUnique({ where: { id: matchId } });
  if (!match) return;

  if (match.arenaType === "quiz") {
    const existingQuiz = await prisma.debugArenaQuestion.findFirst({ where: { matchId, orderIndex: index } });
    if (!existingQuiz) {
      await prisma.debugArenaMatch.update({ where: { id: matchId }, data: { phase: "generating" } });
      await syncState(matchId);
      await broadcast(matchId, "arena_phase", { phase: "generating" });
      try {
        await generateQuizPairForMatch(matchId, index);
      } catch (error) {
        console.error("quiz question generation failed:", error);
        await finishArena(matchId);
        return;
      }
    }
  }

  // If the question isn't ready yet, show a loading phase ("Đang lựa chọn câu
  // hỏi...") while we generate it. Retry until valid — no canned fallback.
  const existing = await prisma.debugArenaQuestion.findFirst({ where: { matchId, orderIndex: index } });
  if (!existing) {
    await prisma.debugArenaMatch.update({ where: { id: matchId }, data: { phase: "generating" } });
    await syncState(matchId);
    await broadcast(matchId, "arena_phase", { phase: "generating" });
  }
  await ensureQuestionGenerated(matchId, index);

  const latest = await prisma.debugArenaMatch.findUnique({ where: { id: matchId } });
  if (!latest) return;
  await prisma.debugArenaMatch.update({
    where: { id: matchId },
    data: {
      phase: "question",
      currentQuestionIndex: index,
      phaseEndsAt: new Date(Date.now() + latest.secondsPerQuestion * 1000),
    },
  });
  // CRITICAL: send full state BEFORE phase change so the client has question
  // data. Otherwise arena_phase arrives with phase="question" but question=null
  // (carried over from reveal), causing a blank/flash until arena_state lands.
  await syncState(matchId);
  await broadcast(matchId, "arena_phase", { phase: "question", questionIndex: index });
}

async function enterReveal(matchId: string) {
  const match = await prisma.debugArenaMatch.findUnique({
    where: { id: matchId },
    include: { questions: { orderBy: { orderIndex: "asc" } }, players: true },
  });
  if (!match) return;
  if (match.arenaType === "quiz") return enterQuizReveal(match);
  const q = match.questions[match.currentQuestionIndex];
  if (q) {
    // Grade everyone for this question (answereds already graded on submit; grade the rest as 0)
    const answers = await prisma.debugArenaAnswer.findMany({ where: { questionId: q.id } });
    const answeredUserIds = new Set(answers.map((a) => a.userId));
    for (const p of match.players) {
      if (!answeredUserIds.has(p.userId)) {
        await prisma.debugArenaAnswer.create({
          data: {
            matchId,
            questionId: q.id,
            userId: p.userId,
            decision: "",
            score: 0,
            answeredAt: new Date(),
          },
        }).catch(() => {});
      }
    }

    // Recompute each player's totalScore from ALL their answers (idempotent across re-reveals)
    const allAnswers = await prisma.debugArenaAnswer.findMany({
      where: { matchId },
      select: { userId: true, score: true },
    });
    const totals = new Map<string, number>();
    for (const a of allAnswers) {
      totals.set(a.userId, (totals.get(a.userId) || 0) + a.score);
    }
    for (const p of match.players) {
      await prisma.debugArenaPlayer.update({
        where: { id: p.id },
        data: { totalScore: totals.get(p.userId) || 0 },
      }).catch(() => {});
    }
  }
  await prisma.debugArenaMatch.update({
    where: { id: matchId },
    data: { phase: "reveal", phaseEndsAt: new Date(Date.now() + match.revealSeconds * 1000) },
  });
  // Send full state BEFORE phase change so client has reveal data immediately
  await syncState(matchId);
  await broadcast(matchId, "arena_phase", { phase: "reveal" });

  // Pre-generate the NEXT question while students review this one's answer
  const nextIndex = match.currentQuestionIndex + 1;
  if (nextIndex < match.questionCount) {
    ensureQuestionGenerated(matchId, nextIndex).catch(() => {});
  }
}

async function enterQuizReveal(match: any) {
  const q = match.questions[match.currentQuestionIndex];
  if (!q) return;
  const answers = await prisma.debugArenaAnswer.findMany({ where: { questionId: q.id } });
  const answeredUserIds = new Set(answers.map((a) => a.userId));
  for (const player of match.players) {
    if (!answeredUserIds.has(player.userId)) {
      await prisma.debugArenaAnswer.create({
        data: { matchId: match.id, questionId: q.id, userId: player.userId, decision: "", score: 0, answeredAt: new Date() },
      }).catch(() => {});
    }
  }

  const difficulty = q.quizItemId ? await calibrateQuizItem(q.quizItemId) : null;
  const allAnswers = await prisma.debugArenaAnswer.findMany({ where: { matchId: match.id }, select: { userId: true, score: true } });
  const totals = new Map<string, number>();
  for (const answer of allAnswers) totals.set(answer.userId, (totals.get(answer.userId) || 0) + answer.score);
  for (const player of match.players) {
    await prisma.debugArenaPlayer.update({ where: { id: player.id }, data: { totalScore: totals.get(player.userId) || 0 } }).catch(() => {});
  }

  await prisma.debugArenaMatch.update({
    where: { id: match.id },
    data: { phase: "reveal", phaseEndsAt: new Date(Date.now() + match.revealSeconds * 1000) },
  });
  await syncState(match.id);
  await broadcast(match.id, "arena_phase", { phase: "reveal" });

  const nextIndex = match.currentQuestionIndex + 1;
  if (nextIndex < match.questionCount) {
    const exists = match.questions.some((question: any) => question.orderIndex === nextIndex);
    if (!exists) generateQuizPairForMatch(match.id, nextIndex).catch((error) => console.error("quiz pair generation error:", error));
  }
}

async function calibrateQuizItem(itemId: string) {
  const item = await prisma.arenaQuizItem.findUnique({ where: { id: itemId } });
  if (!item) return null;
  const answers = await prisma.debugArenaAnswer.findMany({
    where: { question: { quizItemId: itemId }, match: { arenaType: "quiz" }, selectedIndex: { not: null }, answeredAt: { not: null } },
    orderBy: { answeredAt: "asc" },
    select: { userId: true, selectedIndex: true, isCorrect: true, responseTimeMs: true },
  });
  const calibration = computeQuizCalibration(item.authoredDifficulty ?? 3, item.effectiveDifficulty, answers.map((a) => ({
    userId: a.userId,
    selectedIndex: a.selectedIndex ?? -1,
    isCorrect: a.isCorrect ?? false,
    responseTimeMs: a.responseTimeMs ?? null,
  })));

  await prisma.$transaction(async (tx) => {
    await tx.arenaQuizCalibration.upsert({
      where: { itemId_contentVersion_modelVersion: { itemId, contentVersion: item.contentVersion, modelVersion: "smoothed-rate-v1" } },
      create: { itemId, contentVersion: item.contentVersion, sampleCount: calibration.samples, uniqueStudentCount: calibration.samples, correctCount: calibration.correctCount, correctRate: calibration.correctRate, empiricalDifficulty: calibration.empiricalDifficulty, effectiveDifficulty: calibration.effectiveDifficulty, confidence: calibration.confidence, optionDistribution: JSON.stringify(calibration.optionDistribution), status: calibration.status },
      update: { sampleCount: calibration.samples, uniqueStudentCount: calibration.samples, correctCount: calibration.correctCount, correctRate: calibration.correctRate, empiricalDifficulty: calibration.empiricalDifficulty, effectiveDifficulty: calibration.effectiveDifficulty, confidence: calibration.confidence, optionDistribution: JSON.stringify(calibration.optionDistribution), status: calibration.status },
    });
    if (!item.calibrationLocked) {
      await tx.arenaQuizItem.update({ where: { id: itemId }, data: { calibratedDifficulty: calibration.empiricalDifficulty, effectiveDifficulty: calibration.effectiveDifficulty, calibrationSamples: calibration.samples, calibrationConfidence: calibration.confidence, calibrationStatus: calibration.status } });
    }
  });
  return { before: calibration.before, after: calibration.effectiveDifficulty, samples: calibration.samples, confidence: calibration.confidence, status: calibration.status };
}

async function advanceFromReveal(matchId: string) {
  const match = await prisma.debugArenaMatch.findUnique({
    where: { id: matchId },
  });
  if (!match) return;
  const nextIndex = match.currentQuestionIndex + 1;
  // Use questionCount (configured total) instead of counting already-generated
  // questions in DB — background generation may not have finished yet.
  if (nextIndex >= match.questionCount) {
    await finishArena(matchId);
  } else {
    await enterQuestion(matchId, nextIndex);
  }
}

/** Host skip: immediately end the current phase. */
export async function skipPhase(matchId: string) {
  const match = await prisma.debugArenaMatch.findUnique({ where: { id: matchId } });
  if (!match || match.status !== "in_progress") return;
  await prisma.debugArenaMatch.update({ where: { id: matchId }, data: { phaseEndsAt: new Date(0) } });
  await tickArena(matchId);
}

/**
 * Auto-advance: once every player has locked in an answer for the current
 * question, skip the remaining wait and move straight to the reveal phase.
 * (A short grace lets clients show the "all answered" state first.)
 */
async function autoAdvanceIfComplete(matchId: string, questionId: string) {
  const match = await prisma.debugArenaMatch.findUnique({
    where: { id: matchId },
    select: { phase: true, status: true },
  });
  if (!match || match.status !== "in_progress" || match.phase !== "question") return;

  const [playerCount, answeredCount] = await Promise.all([
    prisma.debugArenaPlayer.count({ where: { matchId } }),
    prisma.debugArenaAnswer.count({ where: { questionId, answeredAt: { not: null } } }),
  ]);

  if (playerCount > 0 && answeredCount >= playerCount) {
    await enterReveal(matchId);
  }
}

export async function finishArena(matchId: string) {
  stopArenaTimer(matchId);
  // Compute final ranks
  const players = await prisma.debugArenaPlayer.findMany({
    where: { matchId },
    orderBy: { totalScore: "desc" },
  });
  let rank = 0;
  let prevScore: number | null = null;
  for (let i = 0; i < players.length; i++) {
    if (prevScore === null || players[i].totalScore !== prevScore) {
      rank = i + 1;
      prevScore = players[i].totalScore;
    }
    // Mutate the in-memory object so the reward loop below sees the fresh rank
    players[i].finalRank = rank;
    await prisma.debugArenaPlayer.update({ where: { id: players[i].id }, data: { finalRank: rank } });
  }

  await prisma.debugArenaMatch.update({ where: { id: matchId }, data: { status: "finished", phase: "podium", phaseEndsAt: null } });

  const match = await prisma.debugArenaMatch.findUnique({ where: { id: matchId } });
  const isPractice = match?.mode === "practice";

  // Token rewards ONLY for versus mode. Practice gives XP (no tokens).
  if (!isPractice) {
    const rewards = match ? (JSON.parse(match.tokenRewards) as number[]) : [];
    const { awardTokens } = await import("../utils/tokens");
    for (const p of players) {
      // Participation token (idempotent)
      await awardTokens(p.userId, 2, {
        reason: "arena_participated",
        description: `Tham gia Code Debug Arena: ${match?.title || ""}`,
        refType: "ArenaParticipate",
        refId: `${matchId}_${p.userId}`,
      }).catch(() => {});
      // Podium reward
      if (p.finalRank && p.finalRank >= 1 && p.finalRank <= 3) {
        const amount = rewards[p.finalRank - 1];
        if (typeof amount === "number" && amount > 0) {
          await awardTokens(p.userId, amount, {
            reason: "arena_win",
            description: `Top ${p.finalRank} Code Debug Arena: ${match?.title || ""}`,
            refType: "ArenaWin",
            refId: `${matchId}_${p.userId}_rank${p.finalRank}`,
          }).catch(() => {});
        }
      }
    }
  }

  // Practice completion contributes to XP via the ledger (PRACTICE_XP_PER_MATCH)
  // + streak day. Idempotent on the match id.
  if (isPractice) {
    import("../utils/xpLedger")
      .then(({ awardXp, awardStreakDay, PRACTICE_XP_PER_MATCH }) =>
        awardXp(match.createdById, PRACTICE_XP_PER_MATCH, {
          reason: "arena_practice",
          description: `Luyện tập: ${match.title || "Debug Arena"}`,
          refType: "ArenaPractice",
          refId: match.id,
        }).then(() => awardStreakDay(match.createdById)),
      )
      .catch(() => {});
  }

  // Send full state BEFORE phase change so client has podium data immediately
  await syncState(matchId);
  await broadcast(matchId, "arena_phase", { phase: "podium" });
}

// ── Answer submission ──

export interface SubmitResult {
  ok: boolean;
  score: number;
  identifyScore: number;
  fixScore: number;
  identified: boolean;
  fixed: boolean;
}

export async function submitAnswer(
  matchId: string,
  userId: string,
  body: { questionId: string; highlightedLines?: number[]; submittedCode?: string; selectedIndex?: number; responseTimeMs?: number; activeTimeMs?: number; changeCount?: number },
): Promise<SubmitResult> {
  const match = await prisma.debugArenaMatch.findUnique({ where: { id: matchId } });
  if (match?.arenaType === "quiz") return submitQuizAnswer(match, userId, body);
  if (!match || match.phase !== "question") {
    return { ok: false, score: 0, identifyScore: 0, fixScore: 0, identified: false, fixed: false };
  }
  const question = await prisma.debugArenaQuestion.findUnique({ where: { id: body.questionId } });
  if (!question || question.matchId !== matchId) {
    return { ok: false, score: 0, identifyScore: 0, fixScore: 0, identified: false, fixed: false };
  }
  // Idempotent: update existing answer or create
  const existing = await prisma.debugArenaAnswer.findUnique({
    where: { questionId_userId: { questionId: question.id, userId } },
  });

  const highlightedLines = Array.isArray(body.highlightedLines) ? body.highlightedLines.filter((n) => Number.isInteger(n) && n > 0) : [];
  const { identifyScore, fixScore, identified, fixed } = await gradeAnswer(question, highlightedLines, body.submittedCode);
  const baseScore = identifyScore + fixScore;

  // Time bonus: 10% of remaining time added to score
  let timeBonus = 0;
  if (baseScore > 0 && match.phaseEndsAt && match.secondsPerQuestion > 0) {
    const remainingSeconds = Math.max(0, Math.ceil((match.phaseEndsAt.getTime() - Date.now()) / 1000));
    timeBonus = Math.round(baseScore * 0.1 * (remainingSeconds / match.secondsPerQuestion));
  }
  const score = baseScore + timeBonus;

  const data = {
    matchId,
    questionId: question.id,
    userId,
    decision: "bug",
    submittedCode: body.submittedCode ?? null,
    highlightedLines: JSON.stringify(highlightedLines),
    score,
    identified,
    fixed,
    timeBonus,
    answeredAt: new Date(),
  };

  if (existing) {
    await prisma.debugArenaAnswer.update({ where: { id: existing.id }, data });
  } else {
    await prisma.debugArenaAnswer.create({ data });
  }

  // Keep this player's running total correct even if this submit lands late
  // (e.g. slow code execution finishing after the phase flipped to reveal).
  const userAnswers = await prisma.debugArenaAnswer.findMany({
    where: { matchId, userId },
    select: { score: true },
  });
  const total = userAnswers.reduce((sum, a) => sum + a.score, 0);
  await prisma.debugArenaPlayer
    .updateMany({ where: { matchId, userId }, data: { totalScore: total } })
    .catch(() => {});

  // Broadcast the new submitted-count. getArenaState holds this answer's points
  // back out of the public leaderboard until the reveal.
  await syncState(matchId);

  // Auto-advance to reveal once every player has locked in (short grace first)
  setTimeout(() => {
    autoAdvanceIfComplete(matchId, question.id).catch((e) => console.error("auto-advance error:", e));
  }, 1500);

  return { ok: true, score, identifyScore, fixScore, identified, fixed };
}

async function submitQuizAnswer(
  match: any,
  userId: string,
  body: { questionId: string; selectedIndex?: number; responseTimeMs?: number; activeTimeMs?: number; changeCount?: number },
): Promise<SubmitResult> {
  if (match.phase !== "question") return { ok: false, score: 0, identifyScore: 0, fixScore: 0, identified: false, fixed: false };
  const player = await prisma.debugArenaPlayer.findUnique({ where: { matchId_userId: { matchId: match.id, userId } } });
  const question = await prisma.debugArenaQuestion.findUnique({ where: { id: body.questionId } });
  if (!player || !question || question.matchId !== match.id || question.quizCorrectIndex === null || !Number.isInteger(body.selectedIndex)) {
    return { ok: false, score: 0, identifyScore: 0, fixScore: 0, identified: false, fixed: false };
  }
  const selectedIndex = Number(body.selectedIndex);
  if (selectedIndex < 0 || selectedIndex > 3) return { ok: false, score: 0, identifyScore: 0, fixScore: 0, identified: false, fixed: false };
  const existing = await prisma.debugArenaAnswer.findUnique({ where: { questionId_userId: { questionId: question.id, userId } } });
  if (existing?.answeredAt) {
    return { ok: true, score: existing.score, identifyScore: existing.isCorrect ? 100 : 0, fixScore: 0, identified: existing.isCorrect ?? false, fixed: false };
  }
  const isCorrect = selectedIndex === question.quizCorrectIndex;
  const baseScore = isCorrect ? 100 : 0;
  const responseTimeMs = Number.isFinite(body.responseTimeMs) ? Math.max(0, Math.min(3600000, Math.round(Number(body.responseTimeMs)))) : null;
  const remainingSeconds = match.phaseEndsAt ? Math.max(0, Math.ceil((match.phaseEndsAt.getTime() - Date.now()) / 1000)) : 0;
  const timeBonus = baseScore > 0 && match.secondsPerQuestion > 0 ? Math.round(baseScore * 0.1 * (remainingSeconds / match.secondsPerQuestion)) : 0;
  const score = baseScore + timeBonus;
  await prisma.debugArenaAnswer.upsert({
    where: { questionId_userId: { questionId: question.id, userId } },
    create: { matchId: match.id, questionId: question.id, userId, decision: isCorrect ? "correct" : "wrong", selectedIndex, isCorrect, responseTimeMs, activeTimeMs: body.activeTimeMs ?? null, changeCount: body.changeCount || 0, quizDifficultyUsed: question.quizEffectiveDifficulty || question.quizDifficulty || 3, score, timeBonus, answeredAt: new Date() },
    update: { decision: isCorrect ? "correct" : "wrong", selectedIndex, isCorrect, responseTimeMs, activeTimeMs: body.activeTimeMs ?? null, changeCount: body.changeCount || 0, quizDifficultyUsed: question.quizEffectiveDifficulty || question.quizDifficulty || 3, score, timeBonus, answeredAt: new Date() },
  });

  // Skill evidence → unified sink (fail-soft). skillId lives on the bank item
  // (ArenaQuizItem); the arena question only references it.
  try {
    if (question.quizItemId) {
      const item = await prisma.arenaQuizItem.findUnique({
        where: { id: question.quizItemId },
        select: { skillId: true, skillTagStatus: true, effectiveDifficulty: true, authoredDifficulty: true },
      });
      if (item) {
        await recordSkillEvidenceBatch(
          fromArenaQuizAnswer(
            userId,
            question.id,
            match.id,
            {
              skillId: item.skillId,
              skillTagStatus: item.skillTagStatus,
              effectiveDifficulty: item.effectiveDifficulty,
              difficulty: item.authoredDifficulty,
            },
            isCorrect,
            new Date(),
          ),
        );
      }
    }
  } catch (err) {
    console.error("[debugArena] skill evidence record failed:", err);
  }

  const userAnswers = await prisma.debugArenaAnswer.findMany({ where: { matchId: match.id, userId }, select: { score: true } });
  await prisma.debugArenaPlayer.update({ where: { id: player.id }, data: { totalScore: userAnswers.reduce((sum, answer) => sum + answer.score, 0) } });
  // Update the shared item immediately; the next state/reveal shows fresh evidence.
  if (question.quizItemId) await calibrateQuizItem(question.quizItemId);
  await syncState(match.id);
  setTimeout(() => autoAdvanceIfComplete(match.id, question.id).catch((error) => console.error("quiz auto-advance error:", error)), 1500);
  return { ok: true, score, identifyScore: isCorrect ? 100 : 0, fixScore: 0, identified: isCorrect, fixed: false };
}

/**
 * Two independent scoring dimensions:
 *   1. Identify — did the student highlight the buggy line(s)?
 *      - exact match (highlight == buggy, no extras) → SCORE_IDENTIFY
 *      - superset (contains all buggy lines + extras) → SCORE_IDENTIFY_IMPRECISE
 *      - otherwise → 0
 *   2. Fix — did their edited code produce the expected output? → SCORE_FIX
 */
async function gradeAnswer(
  question: { buggyLineNumbers: string | null; expectedOutput: string; input: string; language: string; shownCode: string },
  highlightedLines: number[],
  submittedCode?: string,
): Promise<{ identifyScore: number; fixScore: number; identified: boolean; fixed: boolean }> {
  // ── Dimension 1: Identify ──
  let buggyLines: number[] = [];
  try {
    buggyLines = question.buggyLineNumbers ? (JSON.parse(question.buggyLineNumbers) as number[]) : [];
  } catch {
    buggyLines = [];
  }
  const buggySet = new Set(buggyLines);
  const highlightSet = new Set(highlightedLines);

  let identifyScore = 0;
  let identified = false;
  if (highlightSet.size > 0 && buggySet.size > 0) {
    const exact = buggySet.size === highlightSet.size && [...buggySet].every((l) => highlightSet.has(l));
    const containsAll = [...buggySet].every((l) => highlightSet.has(l));
    if (exact) {
      identifyScore = SCORE_IDENTIFY;
      identified = true;
    } else if (containsAll) {
      identifyScore = SCORE_IDENTIFY_IMPRECISE;
      identified = true;
    }
  }

  // ── Dimension 2: Fix ──
  let fixScore = 0;
  let fixed = false;
  const submitted = (submittedCode || "").trim();
  const unchanged = submitted === "" || submitted === question.shownCode.trim();
  if (!unchanged) {
    const run = await executeCode(question.language, submittedCode!, question.input);
    if (run.ok && run.output.trim() === question.expectedOutput.trim()) {
      fixScore = SCORE_FIX;
      fixed = true;
    }
  }

  return { identifyScore, fixScore, identified, fixed };
}

// ── Run code (for the editor "Run" button) ──
export async function runArenaCode(
  matchId: string,
  userId: string,
  body: { questionId: string; code: string },
): Promise<{ ok: boolean; output: string; expectedOutput: string; matches: boolean; error?: string }> {
  const question = await prisma.debugArenaQuestion.findUnique({ where: { id: body.questionId } });
  if (!question || question.matchId !== matchId) {
    return { ok: false, output: "", expectedOutput: "", matches: false, error: "Không tìm thấy câu hỏi" };
  }
  const run = await executeCode(question.language, body.code, question.input);
  const matches = run.ok && run.output.trim() === question.expectedOutput.trim();
  return {
    ok: run.ok,
    output: run.output,
    expectedOutput: question.expectedOutput,
    matches,
    error: run.error,
  };
}

// ── State query ──

export async function getArenaState(matchId: string, viewerUserId?: string): Promise<ArenaState> {
  const match = await prisma.debugArenaMatch.findUnique({
    where: { id: matchId },
    include: {
      players: { include: { user: { select: { id: true, fullName: true, nickname: true, role: true, avatarUrl: true } } } },
      questions: { orderBy: { orderIndex: "asc" } },
      kicks: { select: { userId: true } },
      // Keep the current-question audit trail in state as well as live effects:
      // the client uses it to disable a spell after its short animation ends.
      chaosEffects: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!match) throw new Error("Arena not found");

  const viewerKicked = !!(viewerUserId && match.kicks.some((k) => k.userId === viewerUserId));

  const remaining = match.phaseEndsAt ? Math.max(0, Math.ceil((match.phaseEndsAt.getTime() - Date.now()) / 1000)) : 0;

  const currentQ = match.currentQuestionIndex >= 0 ? match.questions[match.currentQuestionIndex] : null;

  let question: ArenaQuestionPublic | null = null;
  let reveal: ArenaRevealPublic | null = null;
  let submittedUserIds: string[] = [];
  let choseCorrectCount = 0;
  let choseBugCount = 0;
  /**
   * Points banked on the question still being answered. `totalScore` is kept
   * live in the database so a mid-question disconnect can't lose anything, but
   * broadcasting it live turns the leaderboard into an answer key: a player who
   * submits and watches their own row jump knows they were right before anyone
   * else has finished. Held back here and released at the reveal.
   */
  const pendingScoreByUser = new Map<string, number>();

  if (currentQ && (match.phase === "question" || match.phase === "reveal" || match.phase === "podium")) {
    const revealVisible = match.phase === "reveal" || match.phase === "podium";
    question = {
      id: currentQ.id,
      orderIndex: currentQ.orderIndex,
      language: currentQ.language,
      title: currentQ.title,
      statement: currentQ.statement,
      input: currentQ.input,
      expectedOutput: currentQ.expectedOutput,
      shownCode: currentQ.shownCode,
      arenaType: match.arenaType === "quiz" ? "quiz" : "debug",
      options: match.arenaType === "quiz" ? parseQuizOptions(currentQ.quizOptions) : undefined,
      // Never expose the answer key while students are still answering.
      correctIndex: match.arenaType === "quiz" && revealVisible ? currentQ.quizCorrectIndex ?? undefined : undefined,
      explanation: match.arenaType === "quiz" && revealVisible ? currentQ.quizExplanation : undefined,
      topic: match.arenaType === "quiz" ? currentQ.quizTopic : undefined,
      difficulty: match.arenaType === "quiz" ? currentQ.quizDifficulty ?? 3 : undefined,
      effectiveDifficulty: match.arenaType === "quiz" ? currentQ.quizEffectiveDifficulty ?? currentQ.quizDifficulty ?? 3 : undefined,
      calibrationSamples: match.arenaType === "quiz" ? currentQ.quizCalibrationSamples : undefined,
      calibrationConfidence: match.arenaType === "quiz" ? currentQ.quizCalibrationConfidence : undefined,
      calibrationStatus: match.arenaType === "quiz" ? currentQ.quizCalibrationStatus : undefined,
    };

    const answers = await prisma.debugArenaAnswer.findMany({
      where: { questionId: currentQ.id },
      include: { user: { select: { fullName: true, nickname: true, role: true } } },
    });
    submittedUserIds = answers.filter((a) => a.answeredAt).map((a) => a.userId);
    // Legacy fields, kept at 0 — no more "Đúng/Sai" decision
    choseCorrectCount = 0;
    choseBugCount = 0;

    if (match.phase === "question") {
      for (const a of answers) {
        if (a.answeredAt && a.score) pendingScoreByUser.set(a.userId, a.score);
      }
    }

    if (match.phase === "reveal" || match.phase === "podium") {
      const playerById = new Map(match.players.map((p) => [p.user.id, p.user.role === "student" ? p.user.nickname?.trim() || p.user.fullName : p.user.fullName]));
      if (match.arenaType === "quiz") {
        const item = currentQ.quizItemId ? await prisma.arenaQuizItem.findUnique({ where: { id: currentQ.quizItemId } }) : null;
        reveal = {
          question: {
            ...question,
            options: question.options || [],
            correctIndex: currentQ.quizCorrectIndex ?? 0,
            explanation: currentQ.quizExplanation,
            hasBug: false,
            correctCode: "",
            bugDescription: null,
            buggyLineNumbers: [],
          },
          results: match.players.map((p) => {
            const answer = answers.find((x) => x.userId === p.user.id);
            return {
              userId: p.user.id,
              fullName: playerById.get(p.user.id) || p.user.nickname?.trim() || p.user.fullName,
              identified: answer?.isCorrect ?? false,
              score: answer?.score ?? 0,
              timeBonus: answer?.timeBonus ?? 0,
              fixed: false,
              highlightedLines: [],
              submittedCode: null,
              selectedIndex: answer?.selectedIndex,
              isCorrect: answer?.isCorrect ?? false,
              responseTimeMs: answer?.responseTimeMs,
            };
          }),
          difficulty: {
            before: currentQ.quizDifficulty ?? item?.authoredDifficulty ?? 3,
            after: item?.effectiveDifficulty ?? currentQ.quizEffectiveDifficulty ?? currentQ.quizDifficulty ?? 3,
            samples: item?.calibrationSamples ?? currentQ.quizCalibrationSamples,
            confidence: item?.calibrationConfidence ?? currentQ.quizCalibrationConfidence,
            status: item?.calibrationStatus ?? currentQ.quizCalibrationStatus,
          },
        };
      } else {
      let buggyLineNumbers: number[] = [];
      try {
        buggyLineNumbers = currentQ.buggyLineNumbers ? (JSON.parse(currentQ.buggyLineNumbers) as number[]) : [];
      } catch {
        buggyLineNumbers = [];
      }
      reveal = {
        question: {
          ...question,
          hasBug: currentQ.hasBug,
          correctCode: currentQ.correctCode,
          bugDescription: currentQ.bugDescription,
          buggyLineNumbers,
        },
        results: match.players.map((p) => {
          const a = answers.find((x) => x.userId === p.user.id);
          let highlightedLines: number[] = [];
          try {
            highlightedLines = a?.highlightedLines ? (JSON.parse(a.highlightedLines) as number[]) : [];
          } catch {
            highlightedLines = [];
          }
          return {
            userId: p.user.id,
            fullName: playerById.get(p.user.id) || p.user.nickname?.trim() || p.user.fullName,
            identified: a?.identified ?? false,
            score: a?.score ?? 0,
            timeBonus: (a as any)?.timeBonus ?? 0,
            fixed: a?.fixed ?? false,
            highlightedLines,
            submittedCode: a?.submittedCode ?? null,
          };
        }),
      };
      }
      // During reveal/podium, hide the public "question" wrapper to avoid confusion (reveal holds full data)
      question = null;
    }
  }

  const players: ArenaPlayerPublic[] = match.players
    .map((p) => ({
      userId: p.user.id,
      fullName: p.user.role === "student" ? p.user.nickname?.trim() || p.user.fullName : p.user.fullName,
      avatarUrl: p.user.avatarUrl,
      totalScore: p.totalScore - (pendingScoreByUser.get(p.user.id) ?? 0),
      finalRank: p.finalRank,
    }))
    .sort((a, b) => b.totalScore - a.totalScore);

  let myAnswer: ArenaState["myAnswer"];
  if (viewerUserId && currentQ) {
    const a = await prisma.debugArenaAnswer.findUnique({
      where: { questionId_userId: { questionId: currentQ.id, userId: viewerUserId } },
    });
    if (a) {
      let highlightedLines: number[] = [];
      try {
        highlightedLines = a.highlightedLines ? (JSON.parse(a.highlightedLines) as number[]) : [];
      } catch {
        highlightedLines = [];
      }
      myAnswer = {
        highlightedLines,
        submittedCode: a.submittedCode,
        answeredAt: a.answeredAt ? a.answeredAt.toISOString() : null,
        score: match.phase === "reveal" || match.phase === "podium" ? a.score : 0,
        selectedIndex: a.selectedIndex,
        isCorrect: a.isCorrect ?? undefined,
      };
    }
  }

  return {
    match: {
      id: match.id,
      title: match.title,
      status: match.status,
      phase: match.phase,
      mode: match.mode,
      arenaType: match.arenaType,
      currentQuestionIndex: match.currentQuestionIndex,
      questionCount: match.questionCount,
      secondsPerQuestion: match.secondsPerQuestion,
      revealSeconds: match.revealSeconds,
      tokenRewards: JSON.parse(match.tokenRewards) as number[],
      languages: JSON.parse(match.languages) as string[],
      knowledgeScope: match.knowledgeScope,
      scopeNote: match.scopeNote,
      chaosEnabled: match.chaosEnabled,
      createdAt: match.createdAt.toISOString(),
    },
    players,
    remainingSeconds: remaining,
    question,
    reveal,
    submittedUserIds,
    choseCorrectCount,
    choseBugCount,
    chaosEffects: match.chaosEffects.map((effect) => ({
      id: effect.id,
      power: effect.power as ChaosPower,
      sourceUserId: effect.sourceUserId,
      targetUserIds: parseTargetUserIds(effect.targetUserIds),
      questionIndex: effect.questionIndex,
      endsAt: effect.endsAt.toISOString(),
    })),
    myAnswer,
    viewerKicked,
  };
}

export function arenaTimerRunning(matchId: string): boolean {
  return arenaTimers.has(matchId);
}

// Restart ticker on server restart for in-progress arenas (best-effort)
export async function resumeInProgressArenas() {
  const matches = await prisma.debugArenaMatch.findMany({ where: { status: "in_progress" } });
  for (const m of matches) {
    startTicker(m.id);
  }
}
