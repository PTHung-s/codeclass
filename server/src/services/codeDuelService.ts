import prisma from "../utils/prisma";
import { judgePythonCode, runPythonCode } from "../utils/pythonRunner";
import { judgeCppCode, runCppCode } from "../utils/cppRunner";
import { buildTestCases, buildContextSummary, AIProblemDraft, TestCaseGen } from "./codeDuelGenerator";
import { recordSkillEvidenceBatch, fromCodeDuelSubmission, resolveCodeDuelRoundSkill } from "./skillEvidence";
import { SKILL_SEEDS } from "../utils/skillGraph";

const COUNTDOWN_SECONDS = 3;
const REVEAL_SECONDS = 20;

// ── Types ──

export interface CreateCodeDuelInput {
  title: string;
  courseId?: string;
  language: "python" | "cpp" | "both";
  playerIds: string[];
  level?: string;
  scheduledStartAt?: string | null;
  totalRounds?: number | null;
  pointsPerProblem?: number;
  rewards?: string;
}

export interface CodeDuelPlayerPublic {
  userId: string;
  fullName: string;
  nickname?: string | null;
  avatarUrl: string | null;
  totalScore: number;
  finalRank: number | null;
  outTabCount: number;
  /** Cumulative tie-break penalty (sum of AC times) — sorts equal scores. */
  penalty?: number;
}

export interface CodeDuelRoundPublic {
  id: string;
  orderIndex: number;
  title: string;
  statement: string;
  difficulty: string;
  timeLimitSeconds: number;
  topic: string;
  algorithm: string;
  starterCode: string;
  /** Public sample cases (hidden:false) only — hidden cases never leave the server. */
  samples: { input: string; output: string }[];
  status: string;
  enabled: boolean;
}

export interface CodeDuelSubmissionPublic {
  id: string;
  userId: string;
  fullName: string;
  code: string;
  language: string;
  verdict: string | null;
  score: number;
  passedTests: number;
  totalTests: number;
  acceptedAt: string | null;
  outTabCount: number;
  isVerified: boolean;
  verifiedComment?: string | null;
  testPerTest?: { testNum: number; passed: boolean; hidden?: boolean; status: string; durationMs: number }[];
}

export interface CodeDuelState {
  match: {
    id: string;
    title: string;
    status: string;
    language: string;
    level: string;
    scheduledStartAt: string | null;
    totalRounds: number | null;
    roundsCount?: number;
    pointsPerProblem: number;
    paused: boolean;
    currentRoundIndex: number;
    roundEndsAt: string | null;
    leaderboardVisible: boolean;
    createdAt: string;
  };
  players: CodeDuelPlayerPublic[];
  /** Public view of the ACTIVE round (question). Null when not in a coding phase. */
  round: CodeDuelRoundPublic | null;
  /** Round reveal (top-3 + all submissions) after judging. */
  reveal: { round: CodeDuelRoundPublic; top3: CodeDuelSubmissionPublic[]; all: CodeDuelSubmissionPublic[] } | null;
  remainingSeconds: number;
  mySubmission?: { submitted: boolean; code: string; submittedAt: string | null; verdict: string | null; score: number };
  isStaff: boolean;
}

// ── In-memory timers ──
const codeDuelTimers = new Map<string, ReturnType<typeof setInterval>>();
const codeDuelTicksInFlight = new Map<string, Promise<void>>();

function stopTimer(matchId: string) {
  const t = codeDuelTimers.get(matchId);
  if (t) { clearInterval(t); codeDuelTimers.delete(matchId); }
}

async function broadcast(matchId: string, type: string, payload: any) {
  const { broadcastToCodeDuel } = await import("./gameWebSocket");
  broadcastToCodeDuel(matchId, { type, payload });
}

async function syncState(matchId: string, viewerUserId?: string) {
  const state = await getCodeDuelState(matchId, viewerUserId);
  const { mySubmission, isStaff, ...publicState } = state;
  await broadcast(matchId, "code_duel_state", publicState);
}

// ── Match lifecycle ──

export interface CodeDuelRewards {
  participateTokens: number;
  participateXp: number;
  topTokens: [number, number, number];
  topXp: [number, number, number];
  verifiedTokens: number;
  verifiedXp: number;
}

export const DEFAULT_REWARDS: CodeDuelRewards = {
  participateTokens: 2,
  participateXp: 15,
  topTokens: [50, 30, 15],
  topXp: [60, 40, 25],
  verifiedTokens: 10,
  verifiedXp: 20,
};

/** Parse a stored rewards JSON; fall back to defaults for missing/blank fields. */
export function parseRewards(raw?: string | null): CodeDuelRewards {
  let parsed: any = {};
  if (raw && typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  }
  return {
    participateTokens: Number.isFinite(Number(parsed?.participateTokens)) ? Math.max(0, Math.round(Number(parsed.participateTokens))) : DEFAULT_REWARDS.participateTokens,
    participateXp: Number.isFinite(Number(parsed?.participateXp)) ? Math.max(0, Math.round(Number(parsed.participateXp))) : DEFAULT_REWARDS.participateXp,
    topTokens: Array.isArray(parsed?.topTokens) && parsed.topTokens.length === 3
      ? [Math.max(0, Math.round(Number(parsed.topTokens[0]) || 0)), Math.max(0, Math.round(Number(parsed.topTokens[1]) || 0)), Math.max(0, Math.round(Number(parsed.topTokens[2]) || 0))]
      : [...DEFAULT_REWARDS.topTokens],
    topXp: Array.isArray(parsed?.topXp) && parsed.topXp.length === 3
      ? [Math.max(0, Math.round(Number(parsed.topXp[0]) || 0)), Math.max(0, Math.round(Number(parsed.topXp[1]) || 0)), Math.max(0, Math.round(Number(parsed.topXp[2]) || 0))]
      : [...DEFAULT_REWARDS.topXp],
    verifiedTokens: Number.isFinite(Number(parsed?.verifiedTokens)) ? Math.max(0, Math.round(Number(parsed.verifiedTokens))) : DEFAULT_REWARDS.verifiedTokens,
    verifiedXp: Number.isFinite(Number(parsed?.verifiedXp)) ? Math.max(0, Math.round(Number(parsed.verifiedXp))) : DEFAULT_REWARDS.verifiedXp,
  };
}

/** Cumulative tie-break penalty for equal totalScore: sum of each AC'd round's
 *  accept time (epoch ms). Everyone codes on the same shared clock per round, so
 *  a smaller sum means the player reached AC faster overall — used to rank
 *  players who finish with the same score (ICPC-style "total solve time"). */
async function penaltyForUsers(matchId: string, userIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!userIds.length) return map;
  const subs = await prisma.codeDuelSubmission.findMany({
    where: { matchId, userId: { in: userIds }, acceptedAt: { not: null } },
    select: { userId: true, acceptedAt: true },
  });
  for (const s of subs) {
    if (!s.acceptedAt) continue;
    map.set(s.userId, (map.get(s.userId) || 0) + s.acceptedAt.getTime());
  }
  return map;
}

/** Sort players by totalScore desc, then penalty asc (faster AC ranks higher),
 *  then userId asc — a stable, deterministic cumulative ranking. */
function byScoreThenPenalty(penalty: Map<string, number>) {
  return (a: { userId: string; totalScore: number }, b: { userId: string; totalScore: number }) =>
    b.totalScore - a.totalScore ||
    (penalty.get(a.userId) || 0) - (penalty.get(b.userId) || 0) ||
    (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);
}

export async function createMatch(input: CreateCodeDuelInput, createdById: string) {
  const match = await prisma.codeDuelMatch.create({
    data: {
      title: input.title,
      courseId: input.courseId || null,
      language: input.language || "python",
      createdById,
      status: "draft",
      level: input.level || "",
      scheduledStartAt: input.scheduledStartAt ? new Date(input.scheduledStartAt) : null,
      totalRounds: input.totalRounds && input.totalRounds > 0 ? input.totalRounds : null,
      pointsPerProblem: Math.max(1, Math.min(100, input.pointsPerProblem || 1)),
      rewards: typeof input.rewards === "string" && input.rewards.trim() ? input.rewards : JSON.stringify(DEFAULT_REWARDS),
    },
  });
  for (const userId of input.playerIds) {
    await prisma.codeDuelPlayer.create({ data: { matchId: match.id, userId } });
  }
  return match;
}

/**
 * Ensure a student is registered as a player of the match. Students join freely
 * (the teacher no longer has to pre-add everyone when creating the match), so a
 * student who opens/submits a non-staff match is auto-registered on first touch.
 * Idempotent; safe to call from WS join, panel, tab and submit paths.
 */
export async function ensurePlayer(matchId: string, userId: string): Promise<{ id: string } | null> {
  const player = await prisma.codeDuelPlayer.findUnique({ where: { matchId_userId: { matchId, userId } } });
  if (player) return { id: player.id };
  try {
    const created = await prisma.codeDuelPlayer.create({ data: { matchId, userId } });
    return { id: created.id };
  } catch {
    // Race: another path created it concurrently — just return idempotently.
    const existing = await prisma.codeDuelPlayer.findUnique({ where: { matchId_userId: { matchId, userId } } });
    return existing ? { id: existing.id } : null;
  }
}

/** Teacher kicks a student out of the match — marks the player kicked so they
 *  cannot rejoin nor submit. (Their scores stay for history; the row is kept.) */
export async function kickPlayer(matchId: string, userId: string) {
  const player = await prisma.codeDuelPlayer.findUnique({ where: { matchId_userId: { matchId, userId } } });
  if (!player) throw new Error("Học sinh không có trong trận.");
  await prisma.codeDuelPlayer.update({ where: { id: player.id }, data: { kicked: true } });
  // Notify the kicked student over WS if connected.
  try {
    const { sendToUser, evictCodeDuelMember } = await import("./gameWebSocket");
    sendToUser(userId, { type: "code_duel_kicked", payload: { matchId } });
    evictCodeDuelMember(matchId, userId);
  } catch { /* non-fatal */ }
  await syncState(matchId);
  return { ok: true, userId };
}

/** Re-open a match for a student previously kicked by staff. Their historical
 * score/submissions are intentionally retained; they simply regain access. */
export async function unlockPlayer(matchId: string, userId: string) {
  const player = await prisma.codeDuelPlayer.findUnique({ where: { matchId_userId: { matchId, userId } } });
  if (!player) throw new Error("Học sinh không có trong trận.");
  await prisma.codeDuelPlayer.update({ where: { id: player.id }, data: { kicked: false } });
  try {
    const { sendToUser } = await import("./gameWebSocket");
    sendToUser(userId, { type: "code_duel_unlocked", payload: { matchId } });
  } catch { /* non-fatal */ }
  await syncState(matchId);
  return { ok: true, userId };
}

/** Staff-only access-management roster. Kept separate from normal state so
 * kicked students do not reappear on the active leaderboard. */
export async function getKickedPlayers(matchId: string) {
  return prisma.codeDuelPlayer.findMany({
    where: { matchId, kicked: true },
    include: { user: { select: { id: true, fullName: true, nickname: true, avatarUrl: true } } },
    orderBy: { joinedAt: "desc" },
  });
}

/** Enable/disable a prepared problem before the match begins. */
export async function setRoundEnabled(matchId: string, roundId: string, enabled: boolean) {
  const [match, round] = await Promise.all([
    prisma.codeDuelMatch.findUnique({ where: { id: matchId } }),
    prisma.codeDuelRound.findUnique({ where: { id: roundId } }),
  ]);
  if (!match) throw new Error("Không tìm thấy trận đấu.");
  if (!round || round.matchId !== matchId) throw new Error("Không tìm thấy câu hỏi.");
  if (!["draft", "lobby"].includes(match.status)) {
    throw new Error("Chỉ có thể bật/tắt bài trước khi trận bắt đầu.");
  }
  const updated = await prisma.codeDuelRound.update({ where: { id: roundId }, data: { enabled } });
  await syncState(matchId);
  return { ok: true, id: updated.id, enabled: updated.enabled };
}

/** Online status of every player (who is present right now in the room) — the
 *  teacher wall uses this to separate online vs offline (not just out-tab). */
export async function getCodeDuelPresence(matchId: string) {
  const players = await prisma.codeDuelPlayer.findMany({
    where: { matchId },
    select: { userId: true, outTabCount: true, kicked: true },
  });
  const { onlineStudentIds } = await import("./gameWebSocket");
  const online = onlineStudentIds();
  return players.map((p) => ({
    userId: p.userId,
    outTabCount: p.outTabCount,
    kicked: p.kicked,
    online: online.has(p.userId),
  }));
}

/**
 * Finalize a round: run the AI's generator + reference solution to build the
 * tiered hidden test cases, then persist the round as `ready`. Called on
 * "Chốt câu hỏi". Returns null if the spec can't produce valid test cases.
 */
export async function finalizeRound(
  matchId: string,
  draft: AIProblemDraft,
  language: "python" | "cpp",
): Promise<{ round: any; testCaseCount: number; generatedCount: number } | null> {
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Không tìm thấy trận đấu");
  if (!["draft", "lobby"].includes(match.status)) throw new Error("Trận đã bắt đầu, không thể thêm câu hỏi");

  const result = await buildTestCases(
    {
      generator: draft.generator,
      referenceSolution: draft.referenceSolution,
      difficulty: draft.difficulty,
      timeLimitSeconds: draft.timeLimitSeconds,
      maxInputSize: draft.maxInputSize,
      targetHiddenCount: (draft as any).targetHiddenCount,
      publicSamples: draft.publicSamples,
    },
    language,
  );
  if (!result) return null; // not enough valid cases → teacher edits/retries

  const nextOrder = await prisma.codeDuelRound.count({ where: { matchId } });
  // Only the first 2 AI samples are public; the generator already stored them
  // with hidden:false, so keep their flags as-is for the rest.
  const testCases = result.testCases;
  const round = await prisma.codeDuelRound.create({
    data: {
      matchId,
      orderIndex: nextOrder,
      title: draft.title,
      statement: draft.statement,
      difficulty: draft.difficulty,
      timeLimitSeconds: draft.timeLimitSeconds,
      testCases: JSON.stringify(testCases),
      sourceGenerator: draft.generator,
      sourceReference: draft.referenceSolution,
      starterCode: draft.starterCode || null,
      constraints: draft.constraints || null,
      maxInputSize: draft.maxInputSize || null,
      topic: draft.topic,
      algorithm: draft.algorithm,
      // Teacher/AI tag — must be a real seed, otherwise evidence replay would
      // point at a nonexistent skill.
      skillId: (() => {
        const raw = String((draft as any).skillId || "").trim();
        return raw && SKILL_SEEDS.some((s) => s.skillId === raw) ? raw : null;
      })(),
      status: "ready",
    },
  });
  return { round, testCaseCount: result.testCases.length, generatedCount: result.generatedCount };
}

/**
 * Re-run the test-case generator for an already-finalized "ready" round. Keeps
 * the existing public (hidden:false) samples stable and regenerates only the
 * hidden cases, so the visible examples the teacher approved don't change.
 * Returns null if the generator + reference can't produce enough valid cases.
 */
export async function regenerateRoundTests(
  matchId: string,
  roundId: string,
): Promise<{ testCaseCount: number; generatedCount: number } | null> {
  const round = await prisma.codeDuelRound.findUnique({ where: { id: roundId } });
  if (!round || round.matchId !== matchId) throw new Error("Không tìm thấy câu hỏi");
  if (!round.sourceGenerator || !round.sourceReference) throw new Error("Câu hỏi chưa có bộ sinh test.");
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Không tìm thấy trận đấu");
  if (!["draft", "lobby"].includes(match.status)) throw new Error("Trận đã bắt đầu, không thể tạo lại test.");

  const lang: "python" | "cpp" = match.language === "cpp" ? "cpp" : "python";
  let existing: TestCaseGen[] = [];
  try { existing = JSON.parse(round.testCases || "[]"); } catch { existing = []; }
  const publicSamples = existing
    .filter((c) => !c.hidden)
    .map((c) => ({ input: c.input, output: c.output }));

  const result = await buildTestCases(
    {
      generator: round.sourceGenerator,
      referenceSolution: round.sourceReference,
      difficulty: round.difficulty,
      timeLimitSeconds: round.timeLimitSeconds,
      maxInputSize: round.maxInputSize ?? undefined,
      publicSamples,
    },
    lang,
  );
  if (!result) return null;

  await prisma.codeDuelRound.update({
    where: { id: roundId },
    data: { testCases: JSON.stringify(result.testCases) },
  });
  return { testCaseCount: result.testCases.length, generatedCount: result.generatedCount };
}

/** Start the match: draft/lobby → countdown. Requires ≥1 ready round. */
export async function startMatch(matchId: string) {
  const match = await prisma.codeDuelMatch.findUnique({
    where: { id: matchId },
    include: { rounds: { where: { status: "ready", enabled: true }, orderBy: { orderIndex: "asc" }, select: { id: true } } },
  });
  if (!match) throw new Error("Không tìm thấy trận đấu");
  if (match.rounds.length === 0) throw new Error("Chưa có câu hỏi nào sẵn sàng (chốt ít nhất 1 câu hỏi trước khi bắt đầu)");
  if (match.status !== "draft" && match.status !== "lobby") throw new Error("Trận đã bắt đầu");

  // Honor a scheduled start: the shared countdown runs until the scheduled
  // moment (if still in the future), otherwise a short 3s countdown.
  const nowMs = Date.now();
  const scheduledMs = match.scheduledStartAt ? match.scheduledStartAt.getTime() : 0;
  const startAt = scheduledMs > nowMs ? scheduledMs : nowMs + COUNTDOWN_SECONDS * 1000;

  await prisma.codeDuelMatch.update({
    where: { id: matchId },
    data: {
      status: "countdown",
      currentRoundIndex: -1,
      roundEndsAt: new Date(startAt),
      paused: false,
      pausedRemaining: 0,
    },
  });
  startTicker(matchId);
  await syncState(matchId);
  await broadcast(matchId, "code_duel_phase", { status: "countdown" });
  return { ok: true };
}

/**
 * "Mở phòng chờ" — chuyển trận từ draft sang lobby để học sinh nhìn thấy trận
 * trên danh sách và vào phòng chờ TRƯỚC khi giáo viên bấm Bắt đầu. Giáo viên
 * mở phòng, học sinh vào tự do (auto-register qua ensurePlayer ở WS join), rồi
 * khi đủ người mới ấn start (lobby → countdown).
 */
export async function openLobby(matchId: string) {
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Không tìm thấy trận đấu");
  if (match.status !== "draft") throw new Error("Phòng đã được mở hoặc trận đã bắt đầu");
  stopTimer(matchId);
  const { clearCodeDuelReadyUsers } = await import("./gameWebSocket");
  clearCodeDuelReadyUsers(matchId);
  await prisma.codeDuelMatch.update({
    where: { id: matchId },
    data: { status: "lobby", currentRoundIndex: -1, roundEndsAt: null, paused: false, pausedRemaining: 0 },
  });
  await syncState(matchId);
  await broadcast(matchId, "code_duel_phase", { status: "lobby" });
  return { ok: true, status: "lobby" };
}

// ── Ticker / state machine ──

function startTicker(matchId: string) {
  stopTimer(matchId);
  const interval = setInterval(() => {
    if (codeDuelTicksInFlight.has(matchId)) return;
    const run = tick(matchId)
      .catch((e) => console.error("code duel tick error:", e))
      .finally(() => codeDuelTicksInFlight.delete(matchId));
    codeDuelTicksInFlight.set(matchId, run);
  }, 1000);
  codeDuelTimers.set(matchId, interval);
}

async function tick(matchId: string) {
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  if (!match) {
    stopTimer(matchId);
    return;
  }
  const remaining = match.paused
    ? match.pausedRemaining
    : match.roundEndsAt ? Math.max(0, Math.ceil((match.roundEndsAt.getTime() - Date.now()) / 1000)) : 0;
  await broadcast(matchId, "code_duel_timer", { remainingSeconds: remaining, status: match.status, paused: match.paused });

  if (match.paused || remaining > 0) return;

  if (match.status === "countdown") {
    await enterNextEnabledRound(matchId, -1);
  } else if (match.status === "in_progress") {
    await judgeRound(matchId);
  }
  // In reveal phase, NEVER auto-advance. Only the teacher/admin clicking 'Next' advances to the next round.
}

async function enterRound(matchId: string, orderIndex: number) {
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  if (!match) return;
  const round = await prisma.codeDuelRound.findFirst({
    where: { matchId, orderIndex, enabled: true, status: "ready" },
  });
  if (!round) {
    console.error(`[CodeDuel] round ${orderIndex} missing for match ${matchId}`);
    await finishMatch(matchId);
    return;
  }
  await prisma.codeDuelRound.update({ where: { id: round.id }, data: { status: "active" } });
  await prisma.codeDuelMatch.update({
    where: { id: matchId },
    data: {
      status: "in_progress",
      currentRoundIndex: orderIndex,
      roundEndsAt: new Date(Date.now() + round.timeLimitSeconds * 1000),
      paused: false,
      pausedRemaining: 0,
    },
  });
  // Send full state BEFORE phase change so the client has question data immediately.
  await syncState(matchId);
  await broadcast(matchId, "code_duel_phase", { status: "in_progress", roundIndex: orderIndex });
}

async function enterNextEnabledRound(matchId: string, afterOrderIndex: number) {
  const round = await prisma.codeDuelRound.findFirst({
    where: { matchId, enabled: true, status: "ready", orderIndex: { gt: afterOrderIndex } },
    orderBy: { orderIndex: "asc" },
  });
  if (!round) {
    await finishMatch(matchId);
    return;
  }
  await enterRound(matchId, round.orderIndex);
}

/**
 * The SHARED clock expired → judge every submission for the active round at
 * once, compute the per-round top-3, persist results, and open the reveal.
 */
async function judgeRound(matchId: string) {
  const match = await prisma.codeDuelMatch.findUnique({
    where: { id: matchId },
    include: { rounds: { orderBy: { orderIndex: "asc" } } },
  });
  if (!match) return;
  const round = match.rounds.find((candidate) => candidate.orderIndex === match.currentRoundIndex);
  if (!round) { await finishMatch(matchId); return; }

  // Persist the "judging" phase BEFORE judging so a reload mid-judge shows the
  // judging screen instead of a stale coding screen with a dead clock.
  await prisma.codeDuelMatch.update({
    where: { id: matchId },
    data: { status: "judging", paused: false, pausedRemaining: 0 },
  });

  let testCases: { input: string; output: string; hidden?: boolean }[] = [];
  try { testCases = JSON.parse(round.testCases || "[]"); } catch { testCases = []; }

  // Auto-submit from live buffer for students who typed code but didn't click Submit before the clock reached 0s.
  const { getCodeDuelLiveBuffer } = await import("./gameWebSocket");
  const existingSubUserIds = new Set(
    (await prisma.codeDuelSubmission.findMany({ where: { roundId: round.id }, select: { userId: true } })).map((s) => s.userId),
  );
  const activePlayers = await prisma.codeDuelPlayer.findMany({ where: { matchId, kicked: false } });
  for (const p of activePlayers) {
    if (!existingSubUserIds.has(p.userId)) {
      const liveBuf = getCodeDuelLiveBuffer(matchId, p.userId);
      if (liveBuf && liveBuf.code && liveBuf.code.trim()) {
        try {
          await prisma.codeDuelSubmission.create({
            data: {
              matchId,
              roundId: round.id,
              playerId: p.id,
              userId: p.userId,
              code: liveBuf.code,
              language: match.language === "both" ? liveBuf.language : (match.language === "cpp" ? "cpp" : "python"),
              outTabCount: p.outTabCount,
            },
          });
        } catch { /* ignore concurrency collisions */ }
      }
    }
  }

  const submissions = await prisma.codeDuelSubmission.findMany({ where: { roundId: round.id } });
  const judgeLanguage = match.language === "both" ? "python" : match.language;

  // Resolve the round's skill once — every AC in this batch emits evidence.
  const duelSkillId = await resolveCodeDuelRoundSkill(round.id, round.skillId).catch(() => null);

  // Broadcast "judging" phase so both teachers and students see the progress state.
  await broadcast(matchId, "code_duel_phase", { status: "judging", roundIndex: match.currentRoundIndex });
  await broadcast(matchId, "code_duel_judging", { roundIndex: match.currentRoundIndex, total: submissions.length });

  // Judge ALL submissions in parallel — results are broadcast together at the
  // reveal, so an early submitter can't leak the answer key.
  await Promise.all(submissions.map(async (sub) => {
    try {
      const res = sub.language === "cpp"
        ? await judgeCppCode(sub.code, testCases)
        : await judgePythonCode(sub.code, testCases);
      const passed = res.passedCount;
      const total = res.totalTests;
      const verdict = deriveVerdict(res, passed, total);
      await prisma.codeDuelSubmission.update({
        where: { id: sub.id },
        data: {
          verdict,
          score: passed,
          passedTests: passed,
          totalTests: total,
          acceptedAt: verdict === "AC" ? sub.submittedAt : null,
          testPerTest: JSON.stringify((res.results || []).map((r: any) => ({
            testNum: r.testNum,
            passed: r.passed,
            hidden: r.hidden,
            status: r.status,
            durationMs: r.durationMs,
          }))),
        },
      });
      // Skill evidence → unified sink (fail-soft). Only AC counts; the sink's
      // dedup key keeps one evidence row per student per round.
      if (verdict === "AC" && duelSkillId) {
        try {
          await recordSkillEvidenceBatch(
            fromCodeDuelSubmission(sub.userId, round.id, matchId, duelSkillId, round.difficulty, sub.submittedAt || new Date()),
          );
        } catch (err) {
          console.error(`[CodeDuel] skill evidence record failed for ${sub.id}:`, err);
        }
      }
      // Broadcast incremental result — clients animate each result appearing.
      await broadcast(matchId, "code_duel_submission_result", {
        roundIndex: match.currentRoundIndex,
        submissionId: sub.id,
        userId: sub.userId,
        verdict,
        score: passed,
        passedTests: passed,
        totalTests: total,
        outTabCount: sub.outTabCount,
      });
    } catch (e) {
      console.error(`[CodeDuel] judge error for submission ${sub.id}:`, e);
      await prisma.codeDuelSubmission.update({
        where: { id: sub.id },
        data: { verdict: "RE", score: 0, passedTests: 0, totalTests: testCases.length },
      }).catch(() => {});
      await broadcast(matchId, "code_duel_submission_result", {
        roundIndex: match.currentRoundIndex,
        submissionId: sub.id,
        userId: sub.userId,
        verdict: "RE",
        score: 0,
        passedTests: 0,
        totalTests: testCases.length,
        outTabCount: sub.outTabCount,
      });
    }
  }));

  await prisma.codeDuelRound.update({ where: { id: round.id }, data: { status: "judged" } });

  // Update cumulative player totals AND outTabCount from submissions.
  // Each round's score is scaled by pointsPerProblem: (passedTests / totalTests) * pointsPerProblem.
  const points = Math.max(1, match.pointsPerProblem || 10);
  const allRounds = await prisma.codeDuelRound.findMany({ where: { matchId }, select: { id: true } });
  const allSubs = await prisma.codeDuelSubmission.findMany({
    where: { roundId: { in: allRounds.map((r) => r.id) } },
    select: { userId: true, score: true, passedTests: true, totalTests: true, outTabCount: true },
  });
  const totals = new Map<string, number>();
  const outTabs = new Map<string, number>();
  for (const s of allSubs) {
    const roundScore = s.totalTests > 0
      ? Math.round(((s.passedTests || s.score) / s.totalTests) * points * 10) / 10
      : (s.score || 0);
    totals.set(s.userId, (totals.get(s.userId) || 0) + roundScore);
    outTabs.set(s.userId, Math.max(outTabs.get(s.userId) || 0, s.outTabCount));
  }
  const players = await prisma.codeDuelPlayer.findMany({ where: { matchId } });
  for (const p of players) {
    await prisma.codeDuelPlayer.update({
      where: { id: p.id },
      data: { totalScore: totals.get(p.userId) || 0, outTabCount: outTabs.get(p.userId) || 0 },
    }).catch(() => {});
  }

  await prisma.codeDuelMatch.update({
    where: { id: matchId },
    data: { status: "reveal", roundEndsAt: new Date(Date.now() + REVEAL_SECONDS * 1000) },
  });
  await syncState(matchId);
  await broadcast(matchId, "code_duel_reveal", { roundIndex: match.currentRoundIndex });
  await broadcast(matchId, "code_duel_phase", { status: "reveal", roundIndex: match.currentRoundIndex });
}

async function advanceFromReveal(matchId: string) {
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  if (!match) return;

  const playedCount = await prisma.codeDuelRound.count({
    where: { matchId, enabled: true, status: { in: ["judged", "active"] } },
  });
  if (match.totalRounds && playedCount >= match.totalRounds) {
    await finishMatch(matchId);
    return;
  }
  await enterNextEnabledRound(matchId, match.currentRoundIndex);
}

/** Teacher skip: immediately advance to next round or finish the match. */
export async function skipPhase(matchId: string) {
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  if (!match) return;
  if (match.status === "reveal") {
    await advanceFromReveal(matchId);
  } else if (match.status === "in_progress") {
    await judgeRound(matchId);
  } else if (match.status === "countdown") {
    await enterNextEnabledRound(matchId, -1);
  }
}

/** Pause the shared clock (freeze the remaining time) during a timed phase. */
export async function pauseMatch(matchId: string) {
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Không tìm thấy trận đấu");
  if (match.paused) return { ok: true, paused: true, remaining: match.pausedRemaining };
  if (["podium", "finished"].includes(match.status)) throw new Error("Trận đã kết thúc, không thể tạm dừng");
  const remaining = match.roundEndsAt ? Math.max(0, Math.ceil((match.roundEndsAt.getTime() - Date.now()) / 1000)) : 0;
  await prisma.codeDuelMatch.update({
    where: { id: matchId },
    data: { paused: true, pausedRemaining: remaining },
  });
  await syncState(matchId);
  await broadcast(matchId, "code_duel_timer", { remainingSeconds: remaining, status: match.status, paused: true });
  return { ok: true, paused: true, remaining };
}

/** Resume a paused clock, re-attaching the frozen time to now. */
export async function resumeMatch(matchId: string) {
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Không tìm thấy trận đấu");
  if (!match.paused) return { ok: true, paused: false };
  const remaining = Math.max(0, match.pausedRemaining || 0);
  await prisma.codeDuelMatch.update({
    where: { id: matchId },
    data: {
      paused: false,
      pausedRemaining: 0,
      roundEndsAt: new Date(Date.now() + remaining * 1000),
    },
  });
  startTicker(matchId); // ensure the shared ticker keeps running
  await syncState(matchId);
  await broadcast(matchId, "code_duel_phase", { status: match.status });
  return { ok: true, paused: false, remaining };
}

/** Extend the current phase's remaining time by N seconds. */
export async function extendRound(matchId: string, seconds: number) {
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Không tìm thấy trận đấu");
  if (!match.roundEndsAt) throw new Error("Không có khoảng thời gian để kéo dài");
  const add = Math.max(1, Math.min(3600, Math.round(seconds) || 0));
  await prisma.codeDuelMatch.update({
    where: { id: matchId },
    data: { roundEndsAt: new Date(match.roundEndsAt.getTime() + add * 1000) },
  });
  await syncState(matchId);
  await broadcast(matchId, "code_duel_timer", { remainingSeconds: 0, status: match.status, paused: false });
  return { ok: true, seconds: add };
}

export async function finishMatch(matchId: string) {
  stopTimer(matchId);
  const players = await prisma.codeDuelPlayer.findMany({ where: { matchId } });
  // Tie-break equal scores by (lower) AC-speed penalty, then userId — so two
  // students on the same points are ranked by how fast they solved, not left
  // with the identical rank forever.
  const penalty = await penaltyForUsers(matchId, players.map((p) => p.userId));
  players.sort(byScoreThenPenalty(penalty));
  let rank = 0;
  let prevScore: number | null = null;
  for (let i = 0; i < players.length; i++) {
    if (prevScore === null || players[i].totalScore !== prevScore) {
      rank = i + 1;
      prevScore = players[i].totalScore;
    }
    players[i] = { ...players[i], finalRank: rank };
    await prisma.codeDuelPlayer.update({ where: { id: players[i].id }, data: { finalRank: rank } });
  }

  await prisma.codeDuelMatch.update({ where: { id: matchId }, data: { status: "podium", roundEndsAt: null } });

  // Participation + podium token + XP rewards, idempotent on the match.
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  const { awardTokens } = await import("../utils/tokens");
  const { awardXp } = await import("../utils/xpLedger");
  const rewards = parseRewards(match?.rewards);
  for (const p of players) {
    const refIdPart = `${matchId}_${p.userId}`;
    await awardTokens(p.userId, rewards.participateTokens, {
      reason: "code_duel_participated",
      description: `Tham gia Code Duel: ${match?.title || ""}`,
      refType: "CodeDuelParticipate",
      refId: refIdPart,
    }).catch(() => {});
    await awardXp(p.userId, rewards.participateXp, {
      reason: "code_duel_finish",
      description: `Hoàn thành Code Duel: ${match?.title || ""}`,
      refType: "CodeDuelFinish",
      refId: refIdPart,
    }).catch(() => {});
    if (p.finalRank && p.finalRank >= 1 && p.finalRank <= 3) {
      const amount = rewards.topTokens[p.finalRank - 1];
      const xpAmount = rewards.topXp[p.finalRank - 1];
      await awardTokens(p.userId, amount, {
        reason: "code_duel_win",
        description: `Top ${p.finalRank} Code Duel: ${match?.title || ""}`,
        refType: "CodeDuelWin",
        refId: `${refIdPart}_rank${p.finalRank}`,
      }).catch(() => {});
      await awardXp(p.userId, xpAmount, {
        reason: "code_duel_top3",
        description: `Top ${p.finalRank} Code Duel: ${match?.title || ""}`,
        refType: "CodeDuelTop3",
        refId: `${refIdPart}_rank${p.finalRank}`,
      }).catch(() => {});
    }
  }

  await syncState(matchId);
  await broadcast(matchId, "code_duel_phase", { status: "podium" });
}

/** Teacher ends the whole match (idempotent, awards already guarded). */
export async function endMatch(matchId: string) {
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  if (!match) return;
  if (match.status !== "podium" && match.status !== "in_progress" && match.status !== "reveal" && match.status !== "countdown") return;
  await finishMatch(matchId);
}

/** Permanently delete a match and all its rounds/players/submissions (cascade). */
export async function deleteMatch(matchId: string) {
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Trận đấu không tồn tại");
  stopTimer(matchId);
  await prisma.codeDuelSubmission.deleteMany({ where: { matchId } });
  await prisma.codeDuelPlayer.deleteMany({ where: { matchId } });
  await prisma.codeDuelRound.deleteMany({ where: { matchId } });
  await prisma.codeDuelMatch.delete({ where: { id: matchId } });
  return { ok: true };
}

/**
 * "Chơi lại" for the next class: wipe all play data and return the match to a
 * ready-to-play state. Keeps the created rounds (problems + test cases) intact
 * so the teacher can start again with the same bài thi. Players are NOT wiped —
 * returning students stay registered, and newcomers auto-register on first join.
 */
export async function resetMatch(matchId: string) {
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Trận đấu không tồn tại");
  stopTimer(matchId);
  // A replay is a clean new session. Remove any in-memory screen locks from
  // the previous run as well as resetting the persisted out-tab counters.
  const { clearCodeDuelReadyUsers, clearCodeDuelTabLocks } = await import("./gameWebSocket");
  clearCodeDuelReadyUsers(matchId);
  clearCodeDuelTabLocks(matchId);

  // Delete every submission for all rounds of this match.
  const rounds = await prisma.codeDuelRound.findMany({ where: { matchId }, select: { id: true } });
  const roundIds = rounds.map((r) => r.id);
  if (roundIds.length > 0) {
    await prisma.codeDuelSubmission.deleteMany({ where: { roundId: { in: roundIds } } });
  }
  // Reset rounds to ready (removes active/judged leftovers).
  await prisma.codeDuelRound.updateMany({ where: { matchId }, data: { status: "ready" } });
  // Reset cumulative scores / ranks / out-tabs back to a fresh slate.
  await prisma.codeDuelPlayer.updateMany({
    where: { matchId },
    data: { totalScore: 0, finalRank: null, outTabCount: 0 },
  });
  // Back to draft so the teacher picks when to start (draft→countdown).
  await prisma.codeDuelMatch.update({
    where: { id: matchId },
    data: {
      status: "draft",
      currentRoundIndex: -1,
      roundEndsAt: null,
      paused: false,
      pausedRemaining: 0,
      leaderboardVisible: false,
    },
  });
  await syncState(matchId);
  await broadcast(matchId, "code_duel_phase", { status: "draft" });
  return { ok: true };
}

// ── Submission ──

// ── Submission (live judge + keep the BEST / earliest-AC attempt) ──

function deriveVerdict(judge: any, passed: number, total: number): string {
  if (!judge) return "RE";
  const statuses = (judge.results || []).map((r: any) => r.status);
  if (statuses.includes("compile_error")) return "CE";
  if (statuses.includes("time_limit")) return "TLE";
  if (statuses.includes("runtime_error") || statuses.includes("blocked")) return "RE";
  return total > 0 && passed === total ? "AC" : "WA";
}

/** A new attempt beats the existing one if it passes more tests, or — on an
 *  equal score — if it reaches AC earlier (the speed tie-break). */
function isBetterAttempt(existing: any, passed: number, isAC: boolean, submittedAt: Date): boolean {
  if (!existing) return true;
  if (passed !== existing.score) return passed > existing.score;
  if (isAC && !existing.acceptedAt) return true;
  if (isAC && existing.acceptedAt) return submittedAt.getTime() < new Date(existing.acceptedAt).getTime();
  return false;
}

export async function submitCode(
  matchId: string,
  roundId: string,
  userId: string,
  body: { code: string; outTabCount?: number; language?: string },
): Promise<any> {
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  if (!match) return { ok: false, message: "Không tìm thấy trận đấu" };
  if (match.status !== "in_progress") return { ok: false, message: "Chưa đến giờ nộp bài" };
  const round = await prisma.codeDuelRound.findUnique({ where: { id: roundId } });
  if (!round || round.matchId !== matchId) return { ok: false, message: "Không tìm thấy câu hỏi" };
  if (!round.enabled) return { ok: false, message: "Câu hỏi này đã được tắt." };
  if (match.currentRoundIndex !== round.orderIndex) return { ok: false, message: "Câu hỏi này không phải đang diễn ra" };
  if (match.roundEndsAt && Date.now() > match.roundEndsAt.getTime()) return { ok: false, message: "Đã hết giờ nộp bài" };

  let player = await prisma.codeDuelPlayer.findUnique({
    where: { matchId_userId: { matchId, userId } },
  });
  // A kicked student can't submit.
  if (player && player.kicked) return { ok: false, message: "Bạn đã bị loại khỏi trận đấu." };
  // Students join freely — register them as a player on first submit if they
  // weren't pre-added by the teacher, instead of rejecting non-members.
  if (!player) {
    await ensurePlayer(matchId, userId);
    player = await prisma.codeDuelPlayer.findUnique({ where: { matchId_userId: { matchId, userId } } });
    if (!player) return { ok: false, message: "Không thể tham gia trận." };
  }

  const code = String(body.code || "").slice(0, 50_000);
  const outTabCount = Math.max(0, Math.min(100, Number(body.outTabCount) || 0));
  // language='both' lets the student pick per attempt; otherwise fixed by the match.
  const lang = match.language === "both" ? (body.language === "cpp" ? "cpp" : "python") : match.language;

  // Judge NOW, privately: per-test PASS/FAIL returns to this student only.
  // Real-time: each PUBLIC test's result is pushed over WS the moment it's
  // judged (hidden cases are withheld so the answer key isn't leaked early).
  let testCases: { input: string; output: string; hidden?: boolean }[] = [];
  try { testCases = JSON.parse(round.testCases || "[]"); } catch { testCases = []; }
  let judge: any = null;
  try {
    const { sendToUser } = await import("./gameWebSocket");
    const push = (r: any) => {
      if (r && !r.hidden) {
        sendToUser(userId, {
          type: "code_duel_test_result",
          payload: {
            roundId,
            testNum: r.testNum,
            passed: r.passed,
            status: r.status,
            durationMs: r.durationMs,
          },
        });
      }
    };
    judge = lang === "cpp"
      ? await judgeCppCode(code, testCases, push)
      : await judgePythonCode(code, testCases, push);
  } catch { judge = null; }
  const passed = judge?.passedCount ?? 0;
  const total = judge?.totalTests ?? 0;
  const verdict = deriveVerdict(judge, passed, total);
  const isAC = verdict === "AC";
  const submittedAt = new Date();
  const acceptedAt = isAC ? submittedAt : null;

  const existing = await prisma.codeDuelSubmission.findFirst({ where: { roundId, playerId: player.id } });
  const perTest = (judge?.results || []).map((r: any) => ({
    testNum: r.testNum,
    passed: r.passed,
    hidden: r.hidden,
    status: r.status,
    durationMs: r.durationMs,
  }));
  if (existing && isBetterAttempt(existing, passed, isAC, submittedAt)) {
    await prisma.codeDuelSubmission.update({
      where: { id: existing.id },
      data: { code, language: lang, verdict, score: passed, passedTests: passed, totalTests: total, acceptedAt, outTabCount, submittedAt, testPerTest: JSON.stringify(perTest) },
    });
  } else if (existing) {
    // Newer attempt is worse — keep the stored best; only bump the out-tab record.
  } else {
    await prisma.codeDuelSubmission.create({
      data: { matchId, roundId, playerId: player.id, userId, code, language: lang, verdict, score: passed, passedTests: passed, totalTests: total, acceptedAt, outTabCount, testPerTest: JSON.stringify(perTest) },
    });
  }

  // Skill evidence → unified sink (fail-soft). Only AC counts; dedup keeps one
  // row per student per round even across re-submits.
  if (isAC) {
    try {
      const skillId = await resolveCodeDuelRoundSkill(roundId, round.skillId);
      if (skillId) {
        await recordSkillEvidenceBatch(
          fromCodeDuelSubmission(userId, roundId, matchId, skillId, round.difficulty, submittedAt),
        );
      }
    } catch (err) {
      console.error("[CodeDuel] skill evidence record failed:", err);
    }
  }

  if (outTabCount > player.outTabCount) {
    await prisma.codeDuelPlayer.update({ where: { id: player.id }, data: { outTabCount } });
  }

  await syncState(matchId);
  return {
    ok: true,
    verdict, score: passed, passedTests: passed, totalTests: total,
    acceptedAt: acceptedAt ? acceptedAt.toISOString() : null,
    results: judge?.results || [],
  };
}

// ── Teacher: verify stamp on the best top-3 code ──

export async function verifySubmission(matchId: string, roundId: string, submissionId: string, verifierId: string, comment?: string) {
  const round = await prisma.codeDuelRound.findUnique({ where: { id: roundId } });
  if (!round || round.matchId !== matchId) throw new Error("Không tìm thấy câu hỏi");
  const sub = await prisma.codeDuelSubmission.findUnique({ where: { id: submissionId } });
  if (!sub || sub.roundId !== roundId) throw new Error("Không tìm thấy bài nộp");

  // Verified code must be within the per-round top-3.
  const topIds = await top3SubmissionIds(roundId);
  if (!topIds.has(submissionId)) throw new Error("Chỉ có thể xác thực bài trong top 3 của vòng");

  await prisma.codeDuelSubmission.update({
    where: { id: submissionId },
    data: {
      isVerified: true,
      verifiedAt: new Date(),
      verifiedById: verifierId,
      verifiedComment: typeof comment === "string" && comment.trim() ? comment.trim().slice(0, 500) : null,
    },
  });

  // Reward the verified student with extra tokens + XP (once per round·user).
  const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
  const rewards = parseRewards(match?.rewards);
  if (rewards.verifiedTokens > 0 || rewards.verifiedXp > 0) {
    const { awardTokens } = await import("../utils/tokens");
    const { awardXp } = await import("../utils/xpLedger");
    if (rewards.verifiedTokens > 0) {
      await awardTokens(sub.userId, rewards.verifiedTokens, {
        reason: "code_duel_verified",
        description: `Code được xác thực: ${match?.title || ""} · Câu ${round.orderIndex + 1}`,
        refType: "CodeDuelVerified",
        refId: `${matchId}_${roundId}_${sub.userId}`,
      }).catch(() => {});
    }
    if (rewards.verifiedXp > 0) {
      await awardXp(sub.userId, rewards.verifiedXp, {
        reason: "code_duel_verified",
        description: `Code được xác thực: ${match?.title || ""} · Câu ${round.orderIndex + 1}`,
        refType: "CodeDuelVerified",
        refId: `${matchId}_${roundId}_${sub.userId}`,
      }).catch(() => {});
    }
  }

  await syncState(matchId);
  return { ok: true, verifiedTokens: rewards.verifiedTokens, verifiedXp: rewards.verifiedXp };
}

async function top3SubmissionIds(roundId: string): Promise<Set<string>> {
  const subs = await prisma.codeDuelSubmission.findMany({
    where: { roundId },
    orderBy: [{ score: "desc" }, { acceptedAt: "asc" }, { submittedAt: "asc" }, { userId: "asc" }],
  });
  return new Set(subs.slice(0, 3).map((s) => s.id));
}

export async function toggleLeaderboard(matchId: string, visible: boolean) {
  await prisma.codeDuelMatch.update({ where: { id: matchId }, data: { leaderboardVisible: visible } });
  await syncState(matchId);
  return { ok: true };
}

/** Teacher/Admin dashboard — aggregate stats + all matches (teacher==admin==TA).
 *  Returns everything a staff control-center needs in one call. */
export async function getTeacherDashboard() {
  const [matches, players, submissions, xp, tokens] = await Promise.all([
    prisma.codeDuelMatch.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, fullName: true, nickname: true, role: true } },
        _count: { select: { players: true, rounds: true } },
      },
    }),
    prisma.codeDuelPlayer.count(),
    prisma.codeDuelSubmission.count(),
    prisma.xpTransaction.aggregate({ _sum: { amount: true }, where: { reason: { contains: "code_duel" } } }),
    prisma.tokenTransaction.aggregate({ _sum: { amount: true }, where: { reason: { contains: "code_duel" } } }),
  ]);

  const byStatus = (s: string) => matches.filter((m) => m.status === s).length;
  return {
    summary: {
      totalMatches: matches.length,
      draft: byStatus("draft"),
      lobby: byStatus("lobby"),
      live: byStatus("countdown") + byStatus("in_progress") + byStatus("judging") + byStatus("reveal"),
      finished: byStatus("podium") + byStatus("finished"),
      totalPlayers: players,
      totalSubmissions: submissions,
      totalXpAwarded: xp._sum.amount || 0,
      totalTokensAwarded: tokens._sum.amount || 0,
    },
    matches: matches.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      language: m.language,
      currentRoundIndex: m.currentRoundIndex,
      roundEndsAt: m.roundEndsAt ? m.roundEndsAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
      createdBy: m.createdBy,
      playersCount: m._count.players,
      roundsCount: m._count.rounds,
    })),
  };
}

// ── State query ──

/** Cumulative whole-match leaderboard (mockup bảng xếp hạng realtime).
 *  Rows = players sorted by total score; each row carries per-round verdict/
 *  tests/AC-time so the client can render the per-round column grid + rank deltas.
 *  Honors leaderboardVisible like getCodeDuelState. */
export async function getBoardState(matchId: string, viewerUserId?: string) {
  const match = await prisma.codeDuelMatch.findUnique({
    where: { id: matchId },
    include: {
      players: { include: { user: { select: { id: true, fullName: true, nickname: true, role: true, avatarUrl: true } } } },
      rounds: { where: { enabled: true }, orderBy: { orderIndex: "asc" }, select: { id: true, orderIndex: true } },
    },
  });
  if (!match) throw new Error("Trận đấu không tồn tại");

  const staff = await (async () => {
    if (!viewerUserId) return false;
    const u = await prisma.user.findUnique({ where: { id: viewerUserId }, select: { role: true } });
    return u ? ["teacher", "admin", "teaching_assistant"].includes(u.role) : false;
  })();

  const subs = await prisma.codeDuelSubmission.findMany({
    where: { matchId },
    select: { userId: true, roundId: true, verdict: true, passedTests: true, totalTests: true, acceptedAt: true },
  });
  const byRound = new Map<string, typeof subs>();
  for (const s of subs) {
    const arr = byRound.get(s.roundId) || [];
    arr.push(s);
    byRound.set(s.roundId, arr);
  }

  // Overall rank BEFORE this tick (for delta arrows). totalScore is server-side.
  const roster = match.players.filter((p) => !p.kicked);
  const penalty = await penaltyForUsers(matchId, roster.map((p) => p.user.id));
  const rows = roster
    .map((p) => {
      const mine = subs.filter((s) => s.userId === p.userId);
      return {
        userId: p.user.id,
        fullName: staff || p.user.role !== "student" ? p.user.fullName : p.user.nickname?.trim() || p.user.fullName,
        nickname: p.user.nickname,
        avatarUrl: p.user.avatarUrl,
        totalScore: p.totalScore,
        finalRank: p.finalRank,
        penalty: penalty.get(p.user.id) || 0,
        rounds: match.rounds.map((r) => {
          const sm = mine.find((s) => s.roundId === r.id);
          return {
            orderIndex: r.orderIndex,
            verdict: sm?.verdict ?? null,
            passedTests: sm?.passedTests ?? 0,
            totalTests: sm?.totalTests ?? 0,
            acceptedAt: sm?.acceptedAt ? sm.acceptedAt.toISOString() : null,
          };
        }),
      };
    })
    .sort(
      (a, b) =>
        b.totalScore - a.totalScore ||
        a.penalty - b.penalty ||
        (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
    );

  return {
    hidden: false,
    match: {
      id: match.id,
      title: match.title,
      status: match.status,
      roundsCount: match.rounds.length,
      currentRoundIndex: match.currentRoundIndex,
      totalRounds: match.totalRounds,
      paused: match.paused,
      isStaff: staff,
    },
    currentRoundIndex: match.currentRoundIndex,
    remainingSeconds: match.paused
      ? match.pausedRemaining
      : match.roundEndsAt ? Math.max(0, Math.ceil((match.roundEndsAt.getTime() - Date.now()) / 1000)) : 0,
    rows,
  };
}

export async function getCodeDuelState(matchId: string, viewerUserId?: string): Promise<CodeDuelState> {
  const match = await prisma.codeDuelMatch.findUnique({
    where: { id: matchId },
    include: {
      players: { include: { user: { select: { id: true, fullName: true, nickname: true, role: true, avatarUrl: true } } } },
      rounds: { where: { enabled: true }, orderBy: { orderIndex: "asc" } },
    },
  });
  if (!match) throw new Error("Trận đấu không tồn tại");

  const staff = await (async () => {
    if (!viewerUserId) return false;
    const u = await prisma.user.findUnique({ where: { id: viewerUserId }, select: { role: true } });
    return u ? ["teacher", "admin", "teaching_assistant"].includes(u.role) : false;
  })();

  const remaining = match.paused
    ? match.pausedRemaining
    : match.roundEndsAt ? Math.max(0, Math.ceil((match.roundEndsAt.getTime() - Date.now()) / 1000)) : 0;

  const currentRound = match.currentRoundIndex >= 0
    ? match.rounds.find((r) => r.orderIndex === match.currentRoundIndex) || null
    : null;

  // Public round (question) — only during the coding/in_progress phase, and only
  // the public samples (never the hidden cases).
  let round: CodeDuelRoundPublic | null = null;
  if (currentRound && match.status === "in_progress") {
    round = toRoundPublic(currentRound);
  }

  let reveal: CodeDuelState["reveal"] = null;
  if (currentRound && (match.status === "reveal" || match.status === "podium")) {
    const subs = await prisma.codeDuelSubmission.findMany({
      where: { roundId: currentRound.id },
      include: { user: { select: { fullName: true, nickname: true, role: true } } },
    });
    const sorted = [...subs].sort(compareSubmissions);
    // Privacy (§7): students may NOT read other students' raw code. Staff sees
    // everything; a student sees their OWN code + per-test detail (so they can
    // review which test they got wrong) plus verified entries — but never a
    // classmate's submission.
    const canView = (s: any) => staff || s.isVerified || (viewerUserId && s.userId === viewerUserId);
    reveal = {
      round: toRoundPublic(currentRound),
      top3: sorted.slice(0, 3).map((s) => toSubmissionPublic(s, canView(s))),
      all: sorted.map((s) => toSubmissionPublic(s, canView(s))),
    };
  }

  // Cumulative leaderboard: Always visible to everyone (exclude kicked players from active roster).
  const roster = match.players.filter((p) => !p.kicked);
  const penalty = await penaltyForUsers(matchId, roster.map((p) => p.user.id));
  const players: CodeDuelPlayerPublic[] = roster
    .map((p) => ({
      userId: p.user.id,
      fullName: staff || p.user.role !== "student" ? p.user.fullName : p.user.nickname?.trim() || p.user.fullName,
      nickname: p.user.nickname,
      avatarUrl: p.user.avatarUrl,
      totalScore: p.totalScore,
      finalRank: p.finalRank,
      outTabCount: p.outTabCount,
      penalty: penalty.get(p.user.id) || 0,
    }))
    .sort(
      (a, b) =>
        b.totalScore - a.totalScore ||
        a.penalty - b.penalty ||
        (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
    );

  let mySubmission: CodeDuelState["mySubmission"];
  if (viewerUserId && currentRound) {
    const mine = await prisma.codeDuelSubmission.findFirst({
      where: { roundId: currentRound.id, userId: viewerUserId },
    });
    if (mine) {
      mySubmission = {
        submitted: true,
        code: mine.code,
        submittedAt: mine.submittedAt.toISOString(),
        verdict: mine.verdict,
        score: mine.score,
      };
    }
  }

  return {
    match: {
      id: match.id,
      title: match.title,
      status: match.status,
      language: match.language,
      level: match.level || "",
      scheduledStartAt: match.scheduledStartAt ? match.scheduledStartAt.toISOString() : null,
      totalRounds: match.totalRounds,
      roundsCount: match.rounds.length,
      pointsPerProblem: match.pointsPerProblem,
      paused: match.paused,
      currentRoundIndex: match.currentRoundIndex,
      roundEndsAt: match.roundEndsAt ? match.roundEndsAt.toISOString() : null,
      leaderboardVisible: match.leaderboardVisible,
      createdAt: match.createdAt.toISOString(),
    },
    players,
    round,
    reveal,
    remainingSeconds: remaining,
    mySubmission,
    isStaff: staff,
  };
}

function toRoundPublic(round: any): CodeDuelRoundPublic {
  let samples: { input: string; output: string }[] = [];
  try {
    const cases = JSON.parse(round.testCases || "[]") as { input: string; output: string; hidden?: boolean }[];
    samples = cases.filter((c) => !c.hidden).map((c) => ({ input: c.input, output: c.output }));
  } catch { samples = []; }
  return {
    id: round.id,
    orderIndex: round.orderIndex,
    title: round.title,
    statement: round.statement,
    difficulty: round.difficulty,
    timeLimitSeconds: round.timeLimitSeconds,
    topic: round.topic || "",
    algorithm: round.algorithm || "",
    starterCode: round.starterCode || "",
    samples,
    status: round.status,
    enabled: round.enabled,
  };
}

function toSubmissionPublic(s: any, withCode = true): CodeDuelSubmissionPublic {
  let perTest: any[] = [];
  try { perTest = JSON.parse(s.testPerTest || "[]"); } catch { perTest = []; }
  return {
    id: s.id,
    userId: s.userId,
    fullName: (s.user?.role === "student" ? s.user.nickname?.trim() || s.user.fullName : s.user?.fullName) || s.userId,
    // Equity: strip raw code unless the caller may see it (staff, or verified
    // gallery). Keeps students from reading classmates' submissions.
    code: withCode ? s.code : "",
    language: s.language,
    verdict: s.verdict,
    score: s.score,
    passedTests: s.passedTests,
    totalTests: s.totalTests,
    acceptedAt: s.acceptedAt ? s.acceptedAt.toISOString() : null,
    outTabCount: s.outTabCount,
    isVerified: s.isVerified,
    verifiedComment: s.verifiedComment,
    testPerTest: perTest,
  };
}

function compareSubmissions(a: any, b: any): number {
  if (b.score !== a.score) return b.score - a.score;
  const at = (x: any) => (x.acceptedAt ? x.acceptedAt.getTime() : Infinity);
  if (at(a) !== at(b)) return at(a) - at(b);
  if (a.submittedAt.getTime() !== b.submittedAt.getTime()) return a.submittedAt.getTime() - b.submittedAt.getTime();
  return a.userId < b.userId ? -1 : 1;
}

// ── History (verified-code gallery) ──

export async function getHistory(matchId: string) {
  const rounds = await prisma.codeDuelRound.findMany({
    where: { matchId, enabled: true },
    orderBy: { orderIndex: "asc" },
    include: {
      submissions: {
        where: { isVerified: true },
        include: { user: { select: { fullName: true, nickname: true, role: true } } },
      },
    },
  });
  return rounds
    .filter((r) => r.submissions.length > 0)
    .map((r) => ({
      roundId: r.id,
      orderIndex: r.orderIndex,
      title: r.title,
      statement: r.statement,
      difficulty: r.difficulty,
      topic: r.topic,
      algorithm: r.algorithm,
      verified: r.submissions.map((s) => toSubmissionPublic(s)),
    }));
}

export function codeDuelTimerRunning(matchId: string): boolean {
  return codeDuelTimers.has(matchId);
}

// Restart tickers on server restart for in-progress matches (best-effort)
export async function resumeInProgressMatches() {
  const matches = await prisma.codeDuelMatch.findMany({
    where: { status: { in: ["countdown", "in_progress", "reveal"] } },
  });
  for (const m of matches) startTicker(m.id);
}
