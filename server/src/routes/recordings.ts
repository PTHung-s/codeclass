import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param } from "../utils/routeHelpers";
import { getActiveRecording } from "../services/recordingService";
import { getLiveRecordingCells, getPresenceSnapshot } from "../services/gameWebSocket";

const router = Router();

// Recordings contain students' code and behaviour — staff only. Scoped to the
// "/recordings" prefix rather than registered bare: this router is mounted at
// "/api", and a bare router.use() also runs for requests destined for routers
// mounted after it, rejecting students with 403 on unrelated endpoints.
router.use("/recordings", authenticate, requireRole("admin", "teacher", "teaching_assistant"));

/** GET /api/recordings — session list, newest first (supports multiple sessions/day). */
router.get("/recordings", async (_req: Request, res: Response) => {
  try {
    const sessions = await prisma.recordingSession.findMany({
      orderBy: [{ startedAt: "desc" }],
      select: {
        id: true,
        title: true,
        sessionDate: true,
        startedAt: true,
        endedAt: true,
        status: true,
        startedBy: { select: { id: true, fullName: true } },
        _count: { select: { participants: true } },
      },
    });
    res.json(
      sessions.map((s) => ({
        id: s.id,
        title: s.title,
        sessionDate: s.sessionDate,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        status: s.status,
        startedBy: s.startedBy,
        participantCount: s._count.participants,
      })),
    );
  } catch (err) {
    console.error("recordings list error:", err);
    res.status(500).json({ error: "Failed to load recordings" });
  }
});

/** GET /api/recordings/presence — current online students + live code snapshot (staff only). */
router.get("/recordings/presence", async (_req: Request, res: Response) => {
  try {
    res.json({ students: getPresenceSnapshot() });
  } catch (err) {
    console.error("recording presence error:", err);
    res.status(500).json({ error: "Failed to load online students" });
  }
});

/** GET /api/recordings/active — the in-memory live session + latest code cells, if any. */
router.get("/recordings/active", async (_req: Request, res: Response) => {
  try {
    const live = getActiveRecording();
    if (!live) {
      res.json({ active: null, liveCells: [] });
      return;
    }
    const session = await prisma.recordingSession.findUnique({
      where: { id: live.sessionId },
      select: {
        id: true,
        title: true,
        sessionDate: true,
        startedAt: true,
        status: true,
        participants: {
          select: {
            id: true,
            userId: true,
            joinedAt: true,
            addedManually: true,
            tabOutCount: true,
            runCount: true,
            user: { select: { id: true, fullName: true, nickname: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!session) {
      res.json({ active: null, liveCells: [] });
      return;
    }

    // Hydrate LiveGrid immediately after F5/tab switch using in-memory live cells,
    // falling back to latest DB code event per participant if memory cell is missing.
    const liveCells = getLiveRecordingCells();
    const cellByUser = new Map(liveCells.map((c: any) => [c.userId, c]));
    const missingParticipants = session.participants.filter((p) => !cellByUser.has(p.userId));
    if (missingParticipants.length > 0) {
      const latestEvents = await prisma.recordingEvent.findMany({
        where: {
          participantId: { in: missingParticipants.map((p) => p.id) },
          type: { in: ["code_snapshot", "run"] },
          code: { not: null },
        },
        orderBy: { at: "desc" },
        select: { participantId: true, code: true, label: true, type: true, at: true },
      });
      const userByParticipant = new Map(missingParticipants.map((p) => [p.id, p]));
      const seenPids = new Set<string>();
      for (const ev of latestEvents) {
        if (seenPids.has(ev.participantId)) continue;
        seenPids.add(ev.participantId);
        const part = userByParticipant.get(ev.participantId);
        if (!part) continue;
        cellByUser.set(part.userId, {
          userId: part.userId,
          code: ev.code,
          label: ev.label,
          tabOutCount: part.tabOutCount,
          runCount: part.runCount,
          lastEventAt: ev.at.getTime(),
          lastEventType: ev.type,
        });
      }
    }

    res.json({
      active: { ...session, startedAtMs: live.startedAt },
      liveCells: [...cellByUser.values()],
    });
  } catch (err) {
    console.error("recording active error:", err);
    res.status(500).json({ error: "Failed to load active recording" });
  }
});

/** GET /api/recordings/:id — overview + per-student roll-ups. */
router.get("/recordings/:id", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const session = await prisma.recordingSession.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        sessionDate: true,
        startedAt: true,
        endedAt: true,
        status: true,
        courseId: true,
        startedBy: { select: { id: true, fullName: true } },
        participants: {
          select: {
            id: true,
            userId: true,
            joinedAt: true,
            addedManually: true,
            activeSeconds: true,
            tabOutCount: true,
            runCount: true,
            finalCode: true,
            user: { select: { id: true, fullName: true, nickname: true, avatarUrl: true } },
            _count: { select: { events: true } },
          },
        },
      },
    });

    if (!session) {
      res.status(404).json({ error: "Recording not found" });
      return;
    }

    res.json({
      ...session,
      participants: session.participants
        .map((p) => ({
          id: p.id,
          userId: p.userId,
          fullName: p.user.fullName,
          nickname: p.user.nickname,
          avatarUrl: p.user.avatarUrl,
          joinedAt: p.joinedAt,
          addedManually: p.addedManually,
          activeSeconds: p.activeSeconds,
          tabOutCount: p.tabOutCount,
          runCount: p.runCount,
          finalCode: p.finalCode,
          eventCount: p._count.events,
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "vi")),
    });
  } catch (err) {
    console.error("recording detail error:", err);
    res.status(500).json({ error: "Failed to load recording" });
  }
});

/**
 * GET /api/recordings/:id/students/:userId
 * Every event for one student — the data the draggable timeline renders.
 */
router.get("/recordings/:id/students/:userId", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const userId = param(req, "userId");

    const participant = await prisma.recordingParticipant.findUnique({
      where: { sessionId_userId: { sessionId: id, userId } },
      select: {
        id: true,
        joinedAt: true,
        addedManually: true,
        activeSeconds: true,
        tabOutCount: true,
        runCount: true,
        finalCode: true,
        user: { select: { id: true, fullName: true, nickname: true, avatarUrl: true } },
        session: { select: { startedAt: true, endedAt: true, sessionDate: true, status: true } },
      },
    });

    if (!participant) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }

    const events = await prisma.recordingEvent.findMany({
      where: { participantId: participant.id },
      orderBy: { at: "asc" },
      select: { id: true, at: true, type: true, code: true, label: true, passed: true, meta: true },
    });

    res.json({
      student: participant.user,
      joinedAt: participant.joinedAt,
      addedManually: participant.addedManually,
      summary: {
        activeSeconds: participant.activeSeconds,
        tabOutCount: participant.tabOutCount,
        runCount: participant.runCount,
      },
      session: participant.session,
      finalCode: participant.finalCode,
      events: events.map((e) => ({
        id: e.id,
        at: e.at,
        type: e.type,
        code: e.code,
        label: e.label,
        passed: e.passed,
        meta: e.meta ? safeParse(e.meta) : null,
      })),
    });
  } catch (err) {
    console.error("recording student events error:", err);
    res.status(500).json({ error: "Failed to load student timeline" });
  }
});

/** DELETE /api/recordings/:id — cascade removes participants + events. */
router.delete("/recordings/:id", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const live = getActiveRecording();
    if (live?.sessionId === id) {
      res.status(409).json({ error: "Không thể xóa buổi đang ghi. Hãy bấm Kết thúc trước." });
      return;
    }
    await prisma.recordingSession.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "P2025") {
      res.status(404).json({ error: "Recording not found" });
      return;
    }
    console.error("recording delete error:", err);
    res.status(500).json({ error: "Failed to delete recording" });
  }
});

function safeParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export default router;
