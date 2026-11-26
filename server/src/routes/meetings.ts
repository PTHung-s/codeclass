import { Router, Request, Response, NextFunction } from "express";
import prisma from "../utils/prisma";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { verifyToken } from "../utils/jwt";
import { SKILL_SEEDS, skillIdToName } from "../utils/skillGraph";
import { resolveCourseStudents } from "../services/assignmentService";
import { notifyNotificationChanged } from "../services/notificationEvents";
import {
  createLiveMeetingRoom,
  deleteLiveMeetingRoom,
  fetchLiveMeetingRooms,
  getMeetingPublicUrl,
  syncMeetingQuizEvent,
  syncRoomEvent,
  verifyMeetingInternalSecret,
} from "../services/meetingService";
import { safeJsonParse } from "../services/examTypes";

const router = Router();
const STAFF = ["admin", "teacher", "teaching_assistant"] as const;

function paramStr(v: unknown): string {
  return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
}

function requireInternalOrStaff(req: Request, res: Response, next: NextFunction) {
  const headerSecret = req.headers["x-meeting-secret"];
  const secretStr = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
  if (verifyMeetingInternalSecret(secretStr)) {
    return next();
  }
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (bearer) {
    try {
      const payload = verifyToken(bearer);
      if ((STAFF as readonly string[]).includes(payload.role)) {
        req.user = payload;
        return next();
      }
    } catch {
      // fall through
    }
  }
  res.status(401).json({ error: "Không có quyền truy cập internal meeting bridge." });
}

// ── List live & recent meeting rooms ──
router.get("/rooms", authenticate, async (_req: Request, res: Response) => {
  try {
    const liveSnap = await fetchLiveMeetingRooms();

    if (liveSnap.online) {
      const liveIds = new Set(liveSnap.rooms.map((r) => r.roomId));
      const now = Date.now();
      const staleCandidates = await prisma.meetingRoom.findMany({
        where: { status: "live" },
        select: { id: true, lastSyncedAt: true },
      });

      const toEndIds = staleCandidates
        .filter((r) => !liveIds.has(r.id) && now - r.lastSyncedAt.getTime() > 60_000)
        .map((r) => r.id);

      if (toEndIds.length > 0) {
        await prisma.meetingRoom.updateMany({
          where: { id: { in: toEndIds } },
          data: {
            status: "ended",
            endedAt: new Date(),
            activeParticipantCount: 0,
            activeParticipantsJson: "[]",
          },
        });
      }

      for (const liveRoom of liveSnap.rooms) {
        await syncRoomEvent({
          roomId: liveRoom.roomId,
          title: liveRoom.title,
          courseId: liveRoom.courseId,
          hostUserId: liveRoom.hostUserId,
          hostName: liveRoom.hostName,
          hasPassword: liveRoom.hasPassword,
          isBreakout: liveRoom.isBreakout,
          parentRoomId: liveRoom.parentRoomId,
          activeParticipantCount: liveRoom.activeParticipantCount,
          activeQuizTitle: liveRoom.activeQuizTitle,
          examMonitoring: liveRoom.examMonitoring,
          participants: liveRoom.participants,
        });
      }
    }

    const dbRooms = await prisma.meetingRoom.findMany({
      where: { isBreakout: false },
      include: {
        course: { select: { id: true, title: true } },
        _count: { select: { quizSessions: true, attendances: true } },
      },
      orderBy: [{ status: "desc" }, { lastSyncedAt: "desc" }],
      take: 50,
    });

    const publicBaseUrl = getMeetingPublicUrl();
    const mapRoom = (r: (typeof dbRooms)[number]) => ({
      id: r.id,
      title: r.title,
      courseId: r.courseId,
      courseTitle: r.course?.title || null,
      hostUserId: r.hostUserId,
      hostName: r.hostName,
      hasPassword: r.hasPassword,
      status: r.status,
      activeParticipantCount: r.activeParticipantCount,
      peakParticipantCount: r.peakParticipantCount,
      activeQuizTitle: r.activeQuizTitle,
      examMonitoring: r.examMonitoring,
      activeParticipants: safeJsonParse<Array<{ name: string; role?: string | null; ccId?: string | null; points?: number; violations?: number }>>(
        r.activeParticipantsJson,
        [],
      ),
      quizSessionCount: r._count.quizSessions,
      attendanceCount: r._count.attendances,
      lastSyncedAt: r.lastSyncedAt,
      endedAt: r.endedAt,
      createdAt: r.createdAt,
      joinUrl: `${publicBaseUrl}?room=${encodeURIComponent(r.id)}`,
    });

    const rooms = dbRooms.filter((r) => r.status === "live").map(mapRoom);
    const recentEndedRooms = dbRooms.filter((r) => r.status !== "live").slice(0, 12).map(mapRoom);

    res.json({
      meetingServerOnline: liveSnap.online,
      publicBaseUrl,
      rooms,
      recentEndedRooms,
    });
  } catch (err) {
    console.error("[meetings/rooms GET]", err);
    res.status(500).json({ error: "Không tải được danh sách phòng Meeting." });
  }
});

// ── Create a meeting room from CodeClass (staff) ──
router.post("/rooms", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password.trim() : "";
    const courseId = typeof req.body?.courseId === "string" && req.body.courseId.trim() ? req.body.courseId.trim() : undefined;
    const notifyStudents = req.body?.notifyStudents !== false;

    if (!title) {
      res.status(400).json({ error: "Vui lòng nhập tên phòng Meeting." });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { fullName: true, email: true },
    });
    const hostName = user?.fullName || user?.email || "Giáo viên";

    const created = await createLiveMeetingRoom({
      title,
      password: password || undefined,
      hostName,
      hostUserId: req.user!.userId,
      courseId,
    });

    if (notifyStudents && created.room.courseId) {
      try {
        const { studentIds } = await resolveCourseStudents(created.room.courseId);
        if (studentIds.length > 0) {
          await prisma.notification.createMany({
            data: studentIds.map((uid) => ({
              userId: uid,
              title: "Lớp học Meeting đang mở",
              message: `${hostName} vừa mở phòng "${title}". Bấm vào để tham gia lớp trực tuyến.`,
              type: "meeting_live",
              relatedEntityType: "meeting",
              relatedEntityId: created.room.id,
              linkUrl: `/meet`,
            })),
          });
          for (const uid of studentIds) notifyNotificationChanged(uid);
        }
      } catch {
        // fail-soft notifications
      }
    }

    res.status(201).json({
      ok: true,
      room: {
        ...created.room,
        courseTitle: created.room.course?.title || null,
        joinUrl: created.joinUrl,
      },
      hostSecret: created.hostSecret,
      joinUrl: created.joinUrl,
    });
  } catch (err: any) {
    console.error("[meetings/rooms POST]", err);
    const code = typeof err?.statusCode === "number" ? err.statusCode : 502;
    res.status(code).json({ error: err?.message || "Không thể tạo phòng Meeting." });
  }
});

// ── Close / Delete a meeting room (staff) ──
router.delete("/rooms/:roomId", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const roomId = paramStr(req.params.roomId);
    if (!roomId) {
      res.status(400).json({ error: "Thiếu mã phòng." });
      return;
    }
    await deleteLiveMeetingRoom(roomId);
    res.json({ ok: true });
  } catch (err) {
    console.error("[meetings/rooms DELETE]", err);
    res.status(500).json({ error: "Không đóng được phòng Meeting." });
  }
});

// ── Quiz history from Meeting rooms ──
router.get("/quiz-history", authenticate, async (req: Request, res: Response) => {
  try {
    const isStaff = (STAFF as readonly string[]).includes(req.user!.role);
    const courseId = typeof req.query.courseId === "string" && req.query.courseId.trim() ? req.query.courseId.trim() : undefined;
    const roomId = typeof req.query.roomId === "string" && req.query.roomId.trim() ? req.query.roomId.trim() : undefined;
    const kind = req.query.kind === "quiz" || req.query.kind === "adaptive" ? req.query.kind : undefined;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

    const sessions = await prisma.meetingQuizSession.findMany({
      where: {
        ...(courseId ? { courseId } : {}),
        ...(roomId ? { roomId } : {}),
        ...(kind ? { kind } : {}),
        ...(!isStaff ? { submissions: { some: { userId: req.user!.userId } } } : {}),
      },
      include: {
        room: { select: { id: true, title: true, hostName: true, course: { select: { id: true, title: true } } } },
        submissions: {
          where: !isStaff ? { userId: req.user!.userId } : undefined,
          orderBy: [{ score: "desc" }, { timeTaken: "asc" }],
          select: {
            id: true,
            userId: true,
            studentName: true,
            score: true,
            totalQuestions: true,
            accuracy: true,
            timeTaken: true,
            rank: true,
            completedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({
      sessions: sessions.map((s) => {
        const questions = safeJsonParse<Array<{ id: string; skillId?: string | null }>>(s.questionsJson, []);
        const skillIds = Array.from(new Set(questions.map((q) => q.skillId).filter((x): x is string => Boolean(x))));
        const avgAccuracy =
          s.submissions.length > 0
            ? Math.round((s.submissions.reduce((acc, sub) => acc + (sub.accuracy || 0), 0) / s.submissions.length) * 10) / 10
            : 0;
        return {
          id: s.id,
          externalQuizId: s.externalQuizId,
          roomId: s.roomId,
          roomTitle: s.room?.title || s.roomId,
          courseId: s.courseId || s.room?.course?.id || null,
          courseTitle: s.room?.course?.title || null,
          hostName: s.room?.hostName || "",
          kind: s.kind,
          title: s.title,
          totalQuestions: s.totalQuestions,
          submissionCount: s.submissions.length,
          avgAccuracy,
          skills: skillIds.map((id) => ({ id, name: skillIdToName(id) })),
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          submissions: s.submissions,
        };
      }),
    });
  } catch (err) {
    console.error("[meetings/quiz-history]", err);
    res.status(500).json({ error: "Không tải được lịch sử quiz Meeting." });
  }
});

// ── Quiz session detail ──
router.get("/quiz-sessions/:sessionId", authenticate, async (req: Request, res: Response) => {
  try {
    const sessionId = paramStr(req.params.sessionId);
    const isStaff = (STAFF as readonly string[]).includes(req.user!.role);

    const session = await prisma.meetingQuizSession.findUnique({
      where: { id: sessionId },
      include: {
        room: { select: { id: true, title: true, hostName: true, course: { select: { id: true, title: true } } } },
        submissions: {
          where: !isStaff ? { userId: req.user!.userId } : undefined,
          orderBy: [{ score: "desc" }, { timeTaken: "asc" }],
        },
      },
    });

    if (!session) {
      res.status(404).json({ error: "Không tìm thấy phiên quiz Meeting." });
      return;
    }
    if (!isStaff && session.submissions.length === 0) {
      res.status(403).json({ error: "Bạn không có quyền xem phiên quiz này." });
      return;
    }

    const questions = safeJsonParse<
      Array<{
        id: string;
        question: string;
        options: string[];
        correctAnswer: number;
        explanation?: string;
        difficulty?: string | number;
        skillId?: string | null;
      }>
    >(session.questionsJson, []);

    const answerStats = new Map<string, { correct: number; total: number }>();
    for (const sub of session.submissions) {
      const ans = safeJsonParse<Array<{ questionId: string; isCorrect: boolean }>>(sub.answersJson, []);
      for (const a of ans) {
        const cur = answerStats.get(a.questionId) || { correct: 0, total: 0 };
        cur.total++;
        if (a.isCorrect) cur.correct++;
        answerStats.set(a.questionId, cur);
      }
    }

    res.json({
      id: session.id,
      roomId: session.roomId,
      roomTitle: session.room?.title || session.roomId,
      courseTitle: session.room?.course?.title || null,
      kind: session.kind,
      title: session.title,
      totalQuestions: session.totalQuestions,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      questions: questions.map((q) => {
        const st = answerStats.get(q.id) || { correct: 0, total: 0 };
        return {
          ...q,
          skillName: q.skillId ? skillIdToName(q.skillId) : null,
          correctCount: st.correct,
          attemptCount: st.total,
        };
      }),
      submissions: session.submissions.map((sub) => ({
        id: sub.id,
        userId: sub.userId,
        studentName: sub.studentName,
        score: sub.score,
        totalQuestions: sub.totalQuestions,
        accuracy: sub.accuracy,
        timeTaken: sub.timeTaken,
        rank: sub.rank,
        completedAt: sub.completedAt,
        answers: safeJsonParse(sub.answersJson, []),
      })),
    });
  } catch (err) {
    console.error("[meetings/quiz-sessions/:id]", err);
    res.status(500).json({ error: "Không tải được chi tiết phiên quiz." });
  }
});

// ── Shared Quiz Bank for Meeting QuizManager ("Kho CodeClass") ──
router.get("/quiz-bank", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const courseId = typeof req.query.courseId === "string" && req.query.courseId.trim() ? req.query.courseId.trim() : undefined;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25));

    const [bankItems, lessonQuestions] = await Promise.all([
      prisma.quizBankItem.findMany({
        where: {
          status: "approved",
          ...(q ? { stem: { contains: q } } : {}),
        },
        select: {
          id: true,
          stem: true,
          options: true,
          answerIndex: true,
          explanation: true,
          difficultyAuthored: true,
          testsSkill: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.quizQuestion.findMany({
        where: {
          ...(q ? { question: { contains: q } } : {}),
          ...(courseId ? { quiz: { lesson: { courseId } } } : {}),
        },
        select: {
          id: true,
          question: true,
          options: true,
          correctIndex: true,
          explanation: true,
          difficulty: true,
          skillId: true,
          quiz: { select: { title: true } },
        },
        take: limit,
      }),
    ]);

    const diffLabel = (n: number): "easy" | "medium" | "hard" => (n <= 2 ? "easy" : n >= 4 ? "hard" : "medium");

    const items: Array<{
      id: string;
      question: string;
      options: string[];
      correctAnswer: number;
      explanation: string;
      difficulty: "easy" | "medium" | "hard";
      skillId: string | null;
      skillName: string | null;
      source: "quiz_bank" | "lesson_quiz";
      sourceTitle: string;
    }> = [];

    for (const b of bankItems) {
      const opts = safeJsonParse<string[]>(b.options, []).map(String).filter(Boolean);
      if (opts.length < 2) continue;
      const fourOpts = opts.slice(0, 4);
      items.push({
        id: `qb_${b.id}`,
        question: b.stem,
        options: fourOpts,
        correctAnswer: Math.max(0, Math.min(fourOpts.length - 1, b.answerIndex)),
        explanation: b.explanation || "",
        difficulty: diffLabel(b.difficultyAuthored),
        skillId: b.testsSkill || null,
        skillName: b.testsSkill ? skillIdToName(b.testsSkill) : null,
        source: "quiz_bank",
        sourceTitle: "Quiz Bank",
      });
    }

    for (const lq of lessonQuestions) {
      const opts = safeJsonParse<string[]>(lq.options, []).map(String).filter(Boolean);
      if (opts.length < 2) continue;
      const fourOpts = opts.slice(0, 4);
      items.push({
        id: `lq_${lq.id}`,
        question: lq.question,
        options: fourOpts,
        correctAnswer: Math.max(0, Math.min(fourOpts.length - 1, lq.correctIndex)),
        explanation: lq.explanation || "",
        difficulty: diffLabel(lq.difficulty),
        skillId: lq.skillId || null,
        skillName: lq.skillId ? skillIdToName(lq.skillId) : null,
        source: "lesson_quiz",
        sourceTitle: lq.quiz?.title || "Quiz bài học",
      });
    }

    res.json({ items: items.slice(0, limit * 2) });
  } catch (err) {
    console.error("[meetings/quiz-bank]", err);
    res.status(500).json({ error: "Không tải được ngân hàng câu hỏi." });
  }
});

// ── Internal canonical skill catalog for meeting AI prompts ──
router.get("/internal/skills", requireInternalOrStaff, (_req: Request, res: Response) => {
  res.json({
    skills: SKILL_SEEDS.map((s) => ({
      id: s.skillId,
      name: s.name,
    })),
  });
});

// ── Internal realtime event sink from meeting server ──
router.post("/internal/events", requireInternalOrStaff, async (req: Request, res: Response) => {
  try {
    const type = String(req.body?.type || "");
    const payload = req.body?.payload || {};

    if (type === "room:sync") {
      const result = await syncRoomEvent(payload, false);
      res.json(result);
      return;
    }
    if (type === "room:deleted") {
      const result = await syncRoomEvent(payload, true);
      res.json(result);
      return;
    }
    if (type === "quiz:sync" || type === "adaptive:sync") {
      const result = await syncMeetingQuizEvent({
        ...payload,
        kind: type === "adaptive:sync" ? "adaptive" : "quiz",
      });
      res.json(result);
      return;
    }

    res.status(400).json({ error: `Unsupported meeting event type: ${type}` });
  } catch (err: any) {
    console.error("[meetings/internal/events]", err);
    res.status(500).json({ error: err?.message || "Meeting event sync failed" });
  }
});

export default router;
