import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param } from "../utils/routeHelpers";
import * as arenaService from "../services/debugArenaService";
import { presentUserForViewer } from "../utils/userPresentation";

const router = Router();
router.use(authenticate);

const isStaff = (role: string) => ["teacher", "admin", "teaching_assistant"].includes(role);

function presentMatchForViewer<T extends { players?: Array<{ user?: any }>; createdBy?: any }>(match: T, role: string): T {
  return {
    ...match,
    createdBy: presentUserForViewer(match.createdBy, role),
    players: match.players?.map((player) => ({ ...player, user: presentUserForViewer(player.user, role) })),
  } as T;
}

/** Line-number columns are stored as JSON text; a bad row must not 500 the review. */
const parseIntArray = (raw: string | null | undefined): number[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
};

// ── List arenas ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const staff = isStaff(user.role);
    // An omitted type is the legacy Debug Arena route, not a request for both modes.
    const arenaType = req.query.type === "quiz" ? "quiz" : "debug";
    // Keep lobby rendering bounded; history/review endpoints provide deep access.
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const matches = staff
      ? await prisma.debugArenaMatch.findMany({
          where: { arenaType, status: { not: "hidden" } },
          include: {
            players: { include: { user: { select: { id: true, fullName: true, nickname: true, role: true, avatarUrl: true } } } },
            createdBy: { select: { id: true, fullName: true, nickname: true, role: true } },
            _count: { select: { questions: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : await prisma.debugArenaMatch.findMany({
          // Students see arenas they play in, OR any arena that is no longer in
          // the lobby (so guests/spectators can find live & finished games).
          where: {
            arenaType,
            status: { not: "hidden" },
            OR: [
              { players: { some: { userId: user.userId } } },
              { status: { not: "lobby" } },
              { mode: "versus", status: "lobby" },
            ],
          },
          include: {
            players: { include: { user: { select: { id: true, fullName: true, nickname: true, role: true, avatarUrl: true } } } },
            createdBy: { select: { id: true, fullName: true, nickname: true, role: true } },
            _count: { select: { questions: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        });
    res.json(matches.map((match) => presentMatchForViewer(match, user.role)));
  } catch (err: any) {
    console.error("list arenas error:", err);
    res.status(500).json({ error: "Không thể lấy danh sách arena." });
  }
});

// ── Create arena (teacher+) ──
router.post("/", requireRole("teacher", "admin", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const {
      title,
      courseId,
      moduleId,
      customPrompt,
      questionCount,
      secondsPerQuestion,
      revealSeconds,
      tokenRewards,
      languages,
      playerIds,
      arenaType,
      chaosEnabled,
    } = req.body;

    if (!title) {
      res.status(400).json({ error: "Cần title." });
      return;
    }

    const match = await arenaService.createArena(
      {
        title,
        courseId: courseId || undefined,
        moduleId: moduleId || undefined,
        customPrompt: customPrompt || undefined,
        questionCount: clampInt(questionCount, 1, 20, 5),
        secondsPerQuestion: clampInt(secondsPerQuestion, 15, 600, 120),
        revealSeconds: clampInt(revealSeconds, 5, 180, 30),
        tokenRewards: Array.isArray(tokenRewards) ? tokenRewards.map(Number).filter((n) => n >= 0) : [],
        languages: Array.isArray(languages) && languages.length ? languages : ["python"],
        playerIds: Array.isArray(playerIds) ? playerIds : [],
        arenaType: arenaType === "quiz" ? "quiz" : "debug",
        chaosEnabled: Boolean(chaosEnabled),
      },
      req.user!.userId,
    );
    res.json(match);
  } catch (err: any) {
    console.error("create arena error:", err);
    res.status(500).json({ error: err.message || "Không thể tạo arena." });
  }
});

// ── Solo practice (any logged-in user) — creates + auto-starts ──
router.post("/practice", async (req: Request, res: Response) => {
  try {
    const { courseId, moduleId, customPrompt, questionCount, secondsPerQuestion, revealSeconds, languages, arenaType } = req.body;
    const match = await arenaService.startPractice(req.user!.userId, {
      courseId: courseId || undefined,
      moduleId: moduleId || undefined,
      customPrompt: customPrompt || undefined,
      questionCount: clampInt(questionCount, 1, 20, 5),
      secondsPerQuestion: clampInt(secondsPerQuestion, 15, 600, 90),
      revealSeconds: clampInt(revealSeconds, 5, 180, 15),
      languages: Array.isArray(languages) && languages.length ? languages : ["python"],
      arenaType: arenaType === "quiz" ? "quiz" : "debug",
    });
    res.json(match);
  } catch (err: any) {
    console.error("practice arena error:", err);
    res.status(500).json({ error: err.message || "Không thể bắt đầu luyện tập." });
  }
});

// ── Practice history (personal: student's own finished practice matches) ──
router.get("/history/practice", async (req: Request, res: Response) => {
  try {
    const arenaType = req.query.type === "quiz" ? "quiz" : "debug";
    const items = await prisma.debugArenaMatch.findMany({
      where: { mode: "practice", status: "finished", createdById: req.user!.userId, arenaType },
      include: {
        questions: { orderBy: { orderIndex: "asc" }, select: { id: true, title: true, language: true, orderIndex: true } },
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(items);
  } catch (err: any) {
    console.error("practice history error:", err);
    res.status(500).json({ error: "Không thể tải lịch sử luyện tập." });
  }
});

// ── Competition history (global: all finished versus matches) ──
router.get("/history/versus", async (req: Request, res: Response) => {
  try {
    const arenaType = req.query.type === "quiz" ? "quiz" : "debug";
    const items = await prisma.debugArenaMatch.findMany({
      where: { mode: "versus", status: "finished", arenaType },
      include: {
        players: { include: { user: { select: { id: true, fullName: true, nickname: true, role: true, avatarUrl: true } } } },
        createdBy: { select: { id: true, fullName: true, nickname: true, role: true } },
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(items.map((item) => presentMatchForViewer(item, req.user!.role)));
  } catch (err: any) {
    console.error("versus history error:", err);
    res.status(500).json({ error: "Không thể tải lịch sử thi đấu." });
  }
});

// ── Full review of a finished match: questions + answers + correct codes ──
router.get("/:id/review", async (req: Request, res: Response) => {
  try {
    const matchId = param(req, "id");
    const match = await prisma.debugArenaMatch.findUnique({
      where: { id: matchId },
      include: {
        questions: { orderBy: { orderIndex: "asc" } },
        players: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!match || match.status !== "finished") {
      res.status(404).json({ error: "Không tìm thấy hoặc chưa kết thúc." });
      return;
    }
    // Fetch all answers grouped by question
    const answers = await prisma.debugArenaAnswer.findMany({
      where: { matchId },
      include: { user: { select: { id: true, fullName: true } } },
    });
    const answersByQuestion = new Map<string, typeof answers>();
    for (const a of answers) {
      const arr = answersByQuestion.get(a.questionId) || [];
      arr.push(a);
      answersByQuestion.set(a.questionId, arr);
    }
    res.json({
      match: {
        id: match.id,
        title: match.title,
        mode: match.mode,
        arenaType: match.arenaType,
        createdAt: match.createdAt,
        createdBy: match.createdBy,
      },
      questions: match.questions.map((q) => ({
        id: q.id,
        orderIndex: q.orderIndex,
        language: q.language,
        title: q.title,
        statement: q.statement,
        input: q.input,
        expectedOutput: q.expectedOutput,
        shownCode: q.shownCode,
        correctCode: q.correctCode,
        hasBug: q.hasBug,
        bugDescription: q.bugDescription,
        // The review page marks the real buggy lines in red, so it needs them.
        buggyLineNumbers: parseIntArray(q.buggyLineNumbers),
        options: (() => {
          if (!q.quizOptions) return undefined;
          try {
            const parsed = JSON.parse(q.quizOptions);
            return Array.isArray(parsed) ? parsed : undefined;
          } catch {
            return undefined;
          }
        })(),
        correctIndex: q.quizCorrectIndex,
        explanation: q.quizExplanation,
        difficulty: q.quizDifficulty,
        effectiveDifficulty: q.quizEffectiveDifficulty,
        calibrationSamples: q.quizCalibrationSamples,
        calibrationConfidence: q.quizCalibrationConfidence,
        calibrationStatus: q.quizCalibrationStatus,
        answers: (answersByQuestion.get(q.id) || []).map((a) => ({
          userId: a.userId,
          fullName: a.user.fullName,
          decision: a.decision,
          submittedCode: a.submittedCode,
          score: a.score,
          fixed: a.fixed,
          // Debug scoring has two independent halves — spotting the line and
          // fixing the code — plus a time bonus. Without these three the review
          // page can only show the total and has to invent a reason for it.
          identified: a.identified,
          highlightedLines: parseIntArray(a.highlightedLines),
          timeBonus: a.timeBonus,
          selectedIndex: a.selectedIndex,
          isCorrect: a.isCorrect,
          responseTimeMs: a.responseTimeMs,
        })),
      })),
      players: match.players.map((p) => ({
        userId: p.user.id,
        fullName: p.user.fullName,
        totalScore: p.totalScore,
        finalRank: p.finalRank,
      })),
    });
  } catch (err: any) {
    console.error("review error:", err);
    res.status(500).json({ error: "Không thể tải chi tiết." });
  }
});

// ── Get arena detail (public state) ──
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const state = await arenaService.getArenaState(param(req, "id"), req.user!.userId);
    res.json(state);
  } catch (err: any) {
    console.error("get arena error:", err);
    res.status(404).json({ error: "Không tìm thấy arena." });
  }
});

// ── Start arena (teacher+, OR practice-match creator) — generates questions, enters countdown ──
// Practice matches auto-start via startPractice; if AI generation gives up, only
// the student who owns the match can press retry, since staff aren't watching.
router.post("/:id/start", async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const matchId = param(req, "id");
    if (!isStaff(user.role)) {
      const match = await prisma.debugArenaMatch.findUnique({
        where: { id: matchId },
        select: { mode: true, createdById: true, status: true },
      });
      if (!match || match.mode !== "practice" || match.createdById !== user.userId) {
        res.status(403).json({ error: "Bạn không có quyền bắt đầu arena này." });
        return;
      }
      // startArena (debug) has no rollback path of its own: if it hangs mid-AI
      // the match stays at status="generating" forever. Reset to lobby so the
      // student can retry from a clean state.
      if (match.status === "generating") {
        await prisma.debugArenaMatch.update({
          where: { id: matchId },
          data: { status: "lobby", phase: "lobby", phaseEndsAt: null },
        });
      } else if (match.status !== "lobby") {
        res.status(400).json({ error: "Arena đã bắt đầu hoặc kết thúc." });
        return;
      }
    }
    const result = await arenaService.startArena(matchId);
    res.json(result);
  } catch (err: any) {
    console.error("start arena error:", err);
    res.status(400).json({ error: err.message || "Không thể bắt đầu arena." });
  }
});

// ── Join an open versus lobby (any logged-in user) ──
router.post("/:id/join", async (req: Request, res: Response) => {
  try {
    await arenaService.joinArena(param(req, "id"), req.user!.userId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("join arena error:", err);
    res.status(400).json({ error: err.message || "Không thể tham gia arena." });
  }
});

// ── Leave a lobby (self) ──
// Soft removal hides a room from arena lists while retaining all results and answers.
router.delete("/:id", requireRole("teacher", "admin", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const matchId = param(req, "id");
    const match = await prisma.debugArenaMatch.findUnique({
      where: { id: matchId },
      select: { status: true },
    });
    if (!match) {
      res.status(404).json({ error: "Không tìm thấy arena." });
      return;
    }
    if (match.status === "in_progress" || match.status === "generating") {
      res.status(409).json({ error: "Không thể xóa khi arena đang diễn ra." });
      return;
    }

    await prisma.debugArenaMatch.update({
      where: { id: matchId },
      data: { status: "hidden" },
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("hide arena error:", err);
    res.status(500).json({ error: "Không thể xóa arena." });
  }
});

router.post("/:id/leave", async (req: Request, res: Response) => {
  try {
    await arenaService.leaveArena(param(req, "id"), req.user!.userId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("leave arena error:", err);
    res.status(400).json({ error: err.message || "Không thể rời arena." });
  }
});

// ── Kick a player from the lobby (teacher+) — bans re-entry ──
router.post("/:id/kick", requireRole("teacher", "admin", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: "Cần userId." });
      return;
    }
    await arenaService.kickPlayer(param(req, "id"), userId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("kick arena error:", err);
    res.status(400).json({ error: err.message || "Không thể mời ra." });
  }
});

// Permission: staff, OR the creator of a practice match (solo self-paced play)
async function assertCanControl(req: Request, res: Response): Promise<string | null> {
  const matchId = param(req, "id");
  const user = req.user!;
  if (isStaff(user.role)) return matchId;
  const match = await prisma.debugArenaMatch.findUnique({
    where: { id: matchId },
    select: { mode: true, createdById: true },
  });
  if (match?.mode === "practice" && match.createdById === user.userId) return matchId;
  res.status(403).json({ error: "Bạn không có quyền thực hiện thao tác này." });
  return null;
}

// ── Skip current phase (staff, or practice creator) ──
router.post("/:id/skip", async (req: Request, res: Response) => {
  try {
    const matchId = await assertCanControl(req, res);
    if (!matchId) return;
    await arenaService.skipPhase(matchId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("skip arena error:", err);
    res.status(400).json({ error: err.message || "Không thể bỏ qua." });
  }
});

// ── End arena early (staff, or practice creator) ──
router.post("/:id/end", async (req: Request, res: Response) => {
  try {
    const matchId = await assertCanControl(req, res);
    if (!matchId) return;
    await arenaService.finishArena(matchId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("end arena error:", err);
    res.status(400).json({ error: err.message || "Không thể kết thúc arena." });
  }
});

// ── Submit answer (player): highlighted buggy lines + optional fixed code ──
router.post("/:id/questions/:questionId/answer", async (req: Request, res: Response) => {
  try {
    const matchId = param(req, "id");
    const questionId = param(req, "questionId");
    const { highlightedLines, submittedCode, selectedIndex, responseTimeMs, activeTimeMs, changeCount } = req.body;
    // highlightedLines is optional (student may only fix the code); must be an array of positive ints
    const cleanLines = Array.isArray(highlightedLines)
      ? highlightedLines.filter((n: any) => Number.isInteger(n) && n > 0)
      : [];
    // Ensure caller is a registered player
    const player = await prisma.debugArenaPlayer.findUnique({
      where: { matchId_userId: { matchId, userId: req.user!.userId } },
    });
    if (!player) {
      res.status(403).json({ error: "Bạn không phải người chơi trong arena này." });
      return;
    }
    const result = await arenaService.submitAnswer(matchId, req.user!.userId, {
      questionId,
      highlightedLines: cleanLines,
      submittedCode: typeof submittedCode === "string" ? submittedCode : undefined,
      selectedIndex: Number.isInteger(selectedIndex) ? selectedIndex : undefined,
      responseTimeMs: Number.isFinite(responseTimeMs) ? responseTimeMs : undefined,
      activeTimeMs: Number.isFinite(activeTimeMs) ? activeTimeMs : undefined,
      changeCount: Number.isInteger(changeCount) ? changeCount : undefined,
    });
    // Acknowledge the submission and nothing else. The score and the verdict
    // are the answer key in disguise: whoever submits first would otherwise
    // learn whether they were right — and could tell the room — while everyone
    // else is still working. Both arrive with the reveal, for everybody at once.
    res.json({ ok: result.ok });
  } catch (err: any) {
    console.error("submit answer error:", err);
    res.status(400).json({ error: err.message || "Không thể nộp câu trả lời." });
  }
});

// ── Run code against the question input (player, for the editor Run button) ──
router.post("/:id/questions/:questionId/run", async (req: Request, res: Response) => {
  try {
    const matchId = param(req, "id");
    const questionId = param(req, "questionId");
    const { code } = req.body;
    if (typeof code !== "string" || !code.trim()) {
      res.status(400).json({ error: "Cần code." });
      return;
    }
    const result = await arenaService.runArenaCode(matchId, req.user!.userId, { questionId, code });
    res.json(result);
  } catch (err: any) {
    console.error("run arena code error:", err);
    res.status(500).json({ error: err.message || "Không thể chạy code." });
  }
});

// ── Chaos Debug Arena power-ups (registered players only) ──
router.post("/:id/chaos", async (req: Request, res: Response) => {
  try {
    const result = await arenaService.useChaosPower(param(req, "id"), req.user!.userId, {
      power: req.body?.power,
      actionId: req.body?.actionId,
    });
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Không thể dùng phép." });
  }
});

function clampInt(v: any, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export default router;
