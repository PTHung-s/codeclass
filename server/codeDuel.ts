import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param } from "../utils/routeHelpers";
import * as service from "../services/codeDuelService";
import { generateProblemDraft, buildContextSummary } from "../services/codeDuelGenerator";
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

// ── Teacher/Admin dashboard (aggregate stats + all matches) ──
router.get("/stats", requireRole("teacher", "admin", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    res.json(await service.getTeacherDashboard());
  } catch (err: any) {
    console.error("code duel stats error:", err);
    res.status(500).json({ error: "Không thể tải bảng điều khiển." });
  }
});

// ── List matches ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const staff = isStaff(user.role);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const matches = staff
      ? await prisma.codeDuelMatch.findMany({
          where: { status: { not: "hidden" } },
          include: {
            players: { include: { user: { select: { id: true, fullName: true, nickname: true, role: true, avatarUrl: true } } } },
            createdBy: { select: { id: true, fullName: true, nickname: true, role: true } },
            _count: { select: { rounds: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : await prisma.codeDuelMatch.findMany({
          where: {
            status: { not: "hidden" },
            OR: [
              { players: { some: { userId: user.userId } } },
              { status: { not: "draft" } },
            ],
          },
          include: {
            players: { include: { user: { select: { id: true, fullName: true, nickname: true, role: true, avatarUrl: true } } } },
            createdBy: { select: { id: true, fullName: true, nickname: true, role: true } },
            _count: { select: { rounds: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        });
    res.json(matches.map((match) => presentMatchForViewer(match, user.role)));
  } catch (err: any) {
    console.error("list code duel error:", err);
    res.status(500).json({ error: "Không thể lấy danh sách trận đấu." });
  }
});

// ── Create match (teacher+) ──
router.post("/", requireRole("teacher", "admin", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const { title, courseId, language, playerIds, level, scheduledStartAt, totalRounds, pointsPerProblem, rewards } = req.body;
    if (!title) {
      res.status(400).json({ error: "Cần title." });
      return;
    }
    const lang = ["python", "cpp", "both"].includes(language) ? language : "python";
    const match = await service.createMatch(
      {
        title,
        courseId: courseId || undefined,
        language: lang,
        playerIds: Array.isArray(playerIds) ? playerIds : [],
        level: typeof level === "string" ? level : undefined,
        scheduledStartAt: typeof scheduledStartAt === "string" && scheduledStartAt ? scheduledStartAt : null,
        totalRounds: Number(totalRounds) > 0 ? Math.min(20, Math.round(Number(totalRounds))) : null,
        pointsPerProblem: Number(pointsPerProblem) > 0 ? Number(pointsPerProblem) : 1,
        rewards: rewards && typeof rewards === "object" ? JSON.stringify(rewards) : undefined,
      },
      req.user!.userId,
    );
    res.json(match);
  } catch (err: any) {
    console.error("create code duel error:", err);
    res.status(500).json({ error: err.message || "Không thể tạo trận đấu." });
  }
});

/** Teacher-only guard reused by authoring/verify/start/end routes. */
async function assertStaffCanControl(req: Request, res: Response): Promise<string | null> {
  const matchId = param(req, "id");
  if (isStaff(req.user!.role)) return matchId;
  res.status(403).json({ error: "Chỉ giáo viên mới thực hiện được thao tác này." });
  return null;
}

// ── AI draft / revise (teacher): first-phase chat, NOT yet saved ──
// With no `draft` in the body this creates a NEW problem; with a `draft` the
// AI revises that specific draft per the teacher's request ("sửa đề").
router.post("/:id/rounds/ai-draft", requireRole("teacher", "admin", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const matchId = param(req, "id");
    const { prompt, language, draft: currentDraft } = req.body;
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "Cần prompt." });
      return;
    }
    const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new Error("Không tìm thấy trận đấu");

    const priorRounds = await prisma.codeDuelRound.findMany({
      where: { matchId },
      orderBy: { orderIndex: "asc" },
      select: { title: true, topic: true, algorithm: true, difficulty: true },
    });
    const context = buildContextSummary(priorRounds);
    const resolvedLang = ["cpp", "both"].includes(language) && language === "cpp" ? "cpp" : "python";
    const baseDraft = currentDraft && typeof currentDraft === "object" && currentDraft.title && currentDraft.statement ? currentDraft : null;
    const draft = await generateProblemDraft(prompt, resolvedLang, context, baseDraft);
    if (!draft) {
      res.status(502).json({ error: "AI chưa tạo được đề. Kiểm tra khóa API hoặc thử lại." });
      return;
    }
    res.json(draft);
  } catch (err: any) {
    console.error("code duel ai-draft error:", err);
    res.status(500).json({ error: err.message || "Không thể tạo đề." });
  }
});

// ── Finalize a round (teacher): run generator+reference → build tests → save ──
router.post("/:id/rounds", requireRole("teacher", "admin", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const matchId = param(req, "id");
    const match = await prisma.codeDuelMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new Error("Không tìm thấy trận đấu");

    const draft = req.body;
    if (!draft || !draft.title || !draft.statement || !draft.generator || !draft.referenceSolution) {
      res.status(400).json({ error: "Thiếu dữ liệu đề bài." });
      return;
    }
    const resolvedLang = match.language === "cpp" ? "cpp" : "python";
    const result = await service.finalizeRound(matchId, draft, resolvedLang);
    if (!result) {
      res.status(422).json({ error: "Chương trình sinh test không tạo đủ test hợp lệ. Hãy chỉnh sửa đề hoặc thử lại." });
      return;
    }
    res.json({ ok: true, roundId: result.round.id, testCaseCount: result.testCaseCount, generatedCount: result.generatedCount });
  } catch (err: any) {
    console.error("finalize round error:", err);
    res.status(400).json({ error: err.message || "Không thể chốt câu hỏi." });
  }
});

// ── Start match (teacher+) ──
router.post("/:id/start", async (req: Request, res: Response) => {
  try {
    const matchId = await assertStaffCanControl(req, res);
    if (!matchId) return;
    const result = await service.startMatch(matchId);
    res.json(result);
  } catch (err: any) {
    console.error("start code duel error:", err);
    res.status(400).json({ error: err.message || "Không thể bắt đầu trận đấu." });
  }
});

// ── Open the waiting room (teacher): draft → lobby, students join freely ──
router.post("/:id/lobby", async (req: Request, res: Response) => {
  try {
    const matchId = await assertStaffCanControl(req, res);
    if (!matchId) return;
    const result = await service.openLobby(matchId);
    res.json(result);
  } catch (err: any) {
    console.error("open lobby error:", err);
    res.status(400).json({ error: err.message || "Không thể mở phòng chờ." });
  }
});

// ── Get match state (public, role-aware) ──
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const state = await service.getCodeDuelState(param(req, "id"), req.user!.userId);
    res.json(state);
  } catch (err: any) {
    console.error("get code duel error:", err);
    res.status(404).json({ error: "Không tìm thấy trận đấu." });
  }
});

// ── Cumulative leaderboard (per-round grid) ──
router.get("/:id/board", async (req: Request, res: Response) => {
  try {
    const board = await service.getBoardState(param(req, "id"), req.user!.userId);
    res.json(board);
  } catch (err: any) {
    console.error("get code duel board error:", err);
    res.status(404).json({ error: "Không tìm thấy trận đấu." });
  }
});

// ── List rounds (staff authoring studio) — summaries only, never test cases ──
router.get("/:id/rounds", requireRole("teacher", "admin", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const rounds = await prisma.codeDuelRound.findMany({
      where: { matchId: param(req, "id") },
      orderBy: { orderIndex: "asc" },
      select: {
        id: true,
        orderIndex: true,
        title: true,
        difficulty: true,
        status: true,
        enabled: true,
        topic: true,
        algorithm: true,
        statement: true,
        starterCode: true,
        timeLimitSeconds: true,
        constraints: true,
        maxInputSize: true,
        testCases: true,
      },
    });
    res.json(rounds);
  } catch (err: any) {
    console.error("list rounds error:", err);
    res.status(500).json({ error: "Không thể tải danh sách câu hỏi." });
  }
});

// ── Round availability (teacher): disabled questions are skipped entirely ──
router.patch("/:id/rounds/:roundId/enabled", requireRole("teacher", "admin", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const matchId = await assertStaffCanControl(req, res);
    if (!matchId) return;
    if (typeof req.body?.enabled !== "boolean") {
      res.status(400).json({ error: "Cần trạng thái bật/tắt hợp lệ." });
      return;
    }
    res.json(await service.setRoundEnabled(matchId, param(req, "roundId"), req.body.enabled));
  } catch (err: any) {
    console.error("set code duel round availability error:", err);
    res.status(400).json({ error: err.message || "Không thể đổi trạng thái câu hỏi." });
  }
});

// ── Submit code (player, before the shared clock expires) ──
router.post("/:id/rounds/:roundId/submit", async (req: Request, res: Response) => {
  try {
    const matchId = param(req, "id");
    const roundId = param(req, "roundId");
    const { code, outTabCount, language } = req.body;
    if (typeof code !== "string") {
      res.status(400).json({ error: "Cần code." });
      return;
    }
    const result = await service.submitCode(matchId, roundId, req.user!.userId, {
      code,
      outTabCount: Number(outTabCount) || 0,
      language: typeof language === "string" ? language : undefined,
    });
    // Acknowledge the submission only — the verdict is the answer key and always
    // arrives with the reveal, for everyone at the same time.
    res.json({ ok: result.ok });
  } catch (err: any) {
    console.error("submit code error:", err);
    res.status(400).json({ error: err.message || "Không thể nộp bài." });
  }
});

// ── Verify stamp (teacher) on the best top-3 code ──
router.post("/:id/rounds/:roundId/verify", requireRole("teacher", "admin", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const matchId = param(req, "id");
    const roundId = param(req, "roundId");
    const { submissionId, comment } = req.body;
    if (!submissionId) {
      res.status(400).json({ error: "Cần submissionId." });
      return;
    }
    const result = await service.verifySubmission(matchId, roundId, submissionId, req.user!.userId, comment);
    res.json(result);
  } catch (err: any) {
    console.error("verify code error:", err);
    res.status(400).json({ error: err.message || "Không thể xác thực bài." });
  }
});

// ── Regenerate a finalized round's hidden test cases (teacher) ──
router.post("/:id/rounds/:roundId/regenerate", requireRole("teacher", "admin", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const matchId = param(req, "id");
    const roundId = param(req, "roundId");
    const result = await service.regenerateRoundTests(matchId, roundId);
    if (!result) {
      res.status(422).json({ error: "Chương trình sinh test không tạo đủ test hợp lệ. Hãy thử lại." });
      return;
    }
    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("regenerate tests error:", err);
    res.status(400).json({ error: err.message || "Không thể tạo lại test." });
  }
});

// ── Toggle live leaderboard visibility (teacher) ──
router.post("/:id/leaderboard", requireRole("teacher", "admin", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const result = await service.toggleLeaderboard(param(req, "id"), Boolean(req.body?.visible));
    res.json(result);
  } catch (err: any) {
    console.error("toggle leaderboard error:", err);
    res.status(400).json({ error: err.message || "Không thể đổi trạng thái bảng xếp hạng." });
  }
});

// ── Skip current phase (teacher) ──
router.post("/:id/skip", async (req: Request, res: Response) => {
  try {
    const matchId = await assertStaffCanControl(req, res);
    if (!matchId) return;
    await service.skipPhase(matchId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("skip code duel error:", err);
    res.status(400).json({ error: err.message || "Không thể bỏ qua." });
  }
});

// ── Pause / resume the shared clock (teacher) ──
router.post("/:id/pause", async (req: Request, res: Response) => {
  try {
    const matchId = await assertStaffCanControl(req, res);
    if (!matchId) return;
    res.json(await service.pauseMatch(matchId));
  } catch (err: any) {
    console.error("pause code duel error:", err);
    res.status(400).json({ error: err.message || "Không thể tạm dừng." });
  }
});

router.post("/:id/resume", async (req: Request, res: Response) => {
  try {
    const matchId = await assertStaffCanControl(req, res);
    if (!matchId) return;
    res.json(await service.resumeMatch(matchId));
  } catch (err: any) {
    console.error("resume code duel error:", err);
    res.status(400).json({ error: err.message || "Không thể tiếp tục." });
  }
});

// ── Extend the current round (teacher) ──
router.post("/:id/extend", async (req: Request, res: Response) => {
  try {
    const matchId = await assertStaffCanControl(req, res);
    if (!matchId) return;
    const seconds = Number(req.body?.seconds) || 0;
    res.json(await service.extendRound(matchId, seconds));
  } catch (err: any) {
    console.error("extend code duel error:", err);
    res.status(400).json({ error: err.message || "Không thể kéo dài." });
  }
});

// ── End match early (teacher) ──
router.post("/:id/end", async (req: Request, res: Response) => {
  try {
    const matchId = await assertStaffCanControl(req, res);
    if (!matchId) return;
    await service.endMatch(matchId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("end code duel error:", err);
    res.status(400).json({ error: err.message || "Không thể kết thúc trận đấu." });
  }
});

// ── Replay / reset — chơi lại cho khóa sau (teacher): giữ nguyên đề, xóa
//    điểm/submission, đưa trận về draft để bắt đầu lại. ──
router.post("/:id/reset", async (req: Request, res: Response) => {
  try {
    const matchId = await assertStaffCanControl(req, res);
    if (!matchId) return;
    await service.resetMatch(matchId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("reset code duel error:", err);
    res.status(400).json({ error: err.message || "Không thể chơi lại trận đấu." });
  }
});

// ── Kick a student out (teacher): they can't rejoin nor submit ──
router.post("/:id/kick", async (req: Request, res: Response) => {
  try {
    const matchId = await assertStaffCanControl(req, res);
    if (!matchId) return;
    const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
    if (!userId) { res.status(400).json({ error: "Cần userId." }); return; }
    const result = await service.kickPlayer(matchId, userId);
    res.json(result);
  } catch (err: any) {
    console.error("kick code duel error:", err);
    res.status(400).json({ error: err.message || "Không thể loại học sinh." });
  }
});

// ── Restore a previously kicked student (teacher/admin) ──
router.post("/:id/unlock", async (req: Request, res: Response) => {
  try {
    const matchId = await assertStaffCanControl(req, res);
    if (!matchId) return;
    const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
    if (!userId) { res.status(400).json({ error: "Cần userId." }); return; }
    res.json(await service.unlockPlayer(matchId, userId));
  } catch (err: any) {
    console.error("unlock code duel player error:", err);
    res.status(400).json({ error: err.message || "Không thể mở lại quyền vào phòng." });
  }
});

// ── Kicked-student roster (teacher/admin access-management page) ──
router.get("/:id/kicked-players", requireRole("teacher", "admin", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const matchId = await assertStaffCanControl(req, res);
    if (!matchId) return;
    const players = await service.getKickedPlayers(matchId);
    res.json(players.map((player) => ({
      userId: player.userId,
      fullName: player.user.fullName,
      nickname: player.user.nickname,
      avatarUrl: player.user.avatarUrl,
      totalScore: player.totalScore,
      outTabCount: player.outTabCount,
      joinedAt: player.joinedAt.toISOString(),
    })));
  } catch (err: any) {
    console.error("list kicked code duel players error:", err);
    res.status(500).json({ error: "Không thể tải danh sách học sinh đã bị loại." });
  }
});

// ── Player online presence (teacher wall): who is on/offline now ──
router.get("/:id/presence", async (req: Request, res: Response) => {
  try {
    const matchId = await assertStaffCanControl(req, res);
    if (!matchId) return;
    res.json(await service.getCodeDuelPresence(matchId));
  } catch (err: any) {
    console.error("code duel presence error:", err);
    res.status(500).json({ error: "Không thể tải trạng thái trực tuyến." });
  }
});

// ── Delete match permanently (teacher) — cascade removes rounds/players/subs ──
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const matchId = await assertStaffCanControl(req, res);
    if (!matchId) return;
    await service.deleteMatch(matchId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("delete code duel error:", err);
    res.status(400).json({ error: err.message || "Không thể xóa trận đấu." });
  }
});

// ── Verified-code history gallery (student-viewable) ──
router.get("/:id/history", async (req: Request, res: Response) => {
  try {
    const history = await service.getHistory(param(req, "id"));
    res.json(history);
  } catch (err: any) {
    console.error("code duel history error:", err);
    res.status(500).json({ error: "Không thể tải lịch sử." });
  }
});

export default router;
