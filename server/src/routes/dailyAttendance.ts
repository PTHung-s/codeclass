import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { countDbError } from "../utils/metrics";
import { query } from "../utils/routeHelpers";
import { broadcastToAll } from "../services/gameWebSocket";

const router = Router();

const VN_TZ = "Asia/Ho_Chi_Minh";

function broadcastAttendanceEvent(event: string, payload: Record<string, unknown> = {}) {
  broadcastToAll({ type: `attendance.${event}`, payload });
}

function vnDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(d);
}

function startOfVnDay(dateOrKey: Date | string): Date {
  const key = typeof dateOrKey === "string" ? dateOrKey : vnDateKey(dateOrKey);
  return new Date(`${key}T00:00:00+07:00`);
}

function vnNow(): Date {
  return new Date();
}

/**
 * A daily attendance session is system-wide (see getActiveSession: it queries by
 * status only, never by class), but AttendanceSession.classGroupId is a required
 * foreign key. So we anchor the row to a real ClassGroup instead of the literal
 * string "default", which violated the FK and made /attendance/start return 500.
 *
 * Prefers a class the caller owns, then any class, and creates a placeholder as a
 * last resort so a fresh install can still start attendance.
 */
async function resolveSessionClassGroupId(requestedId: unknown, teacherId: string): Promise<string> {
  if (typeof requestedId === "string" && requestedId.length > 0) {
    const requested = await prisma.classGroup.findUnique({ where: { id: requestedId }, select: { id: true } });
    if (requested) return requested.id;
  }

  const owned = await prisma.classGroup.findFirst({
    where: { createdById: teacherId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (owned) return owned.id;

  const anyGroup = await prisma.classGroup.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (anyGroup) return anyGroup.id;

  const placeholder = await prisma.classGroup.create({
    data: { name: "Điểm danh chung", createdById: teacherId },
    select: { id: true },
  });
  return placeholder.id;
}

async function markMissingStudentsAbsent(date: Date): Promise<void> {
  await prisma.dailyCheckIn.updateMany({
    where: { date, status: "pending" },
    data: {
      status: "absent",
      note: "Không được giáo viên duyệt trước khi phiên điểm danh kết thúc",
      approvedAt: new Date(),
    },
  });

  const students = await prisma.user.findMany({
    where: { role: "student", status: "active", studentRosterExclusions: { none: {} } },
    select: { id: true },
  });

  const existing = await prisma.dailyCheckIn.findMany({
    where: { studentId: { in: students.map((student) => student.id) }, date },
    select: { studentId: true },
  });
  const recordedStudentIds = new Set(existing.map((record) => record.studentId));

  const missingStudents = students.filter((student) => !recordedStudentIds.has(student.id));
  // SQLite has a single writer. Chunked transactions avoid a large unbounded
  // Promise.all competing with check-ins and Arena writes at session close.
  for (let i = 0; i < missingStudents.length; i += 100) {
    await prisma.$transaction(
      missingStudents.slice(i, i + 100).map((student) =>
        prisma.dailyCheckIn.upsert({
          where: { studentId_date: { studentId: student.id, date } },
          create: { studentId: student.id, date, status: "absent" },
          update: {},
        }),
      ),
    );
  }
}

/**
 * Undo the automatic absences that closing a session produced, so a day can be
 * reopened. Closing marks every student without an approved check-in as absent;
 * without this, reopening the same day left those rows in place and /check-in
 * rejected the students with "Bạn đã điểm danh rồi" — the session was open but
 * nobody could use it.
 *
 * Only rows the system wrote are touched (status "absent" with approvedBy null):
 *   - student had checked in but was never reviewed → back to "pending" so the
 *     teacher can approve them in the reopened session. The row id is kept, so
 *     the token dedupKey still prevents a second attendance award.
 *   - student never checked in → row removed, because canCheckIn requires the
 *     absence of a record.
 * Teacher decisions (approvedBy set) and leave requests ("excused") are left
 * alone: reopening a session must not erase a mark somebody made on purpose.
 */
async function clearAutoAbsencesForDate(date: Date): Promise<{ restored: number; removed: number }> {
  const autoAbsent = await prisma.dailyCheckIn.findMany({
    where: { date, status: "absent", approvedBy: null },
    select: { id: true, checkInAt: true },
  });
  if (autoAbsent.length === 0) return { restored: 0, removed: 0 };

  const toRestore = autoAbsent.filter((record) => record.checkInAt !== null).map((record) => record.id);
  const toRemove = autoAbsent.filter((record) => record.checkInAt === null).map((record) => record.id);

  if (toRestore.length > 0) {
    await prisma.dailyCheckIn.updateMany({
      where: { id: { in: toRestore } },
      data: { status: "pending", note: null, approvedAt: null },
    });
  }
  if (toRemove.length > 0) {
    await prisma.dailyCheckIn.deleteMany({ where: { id: { in: toRemove } } });
  }

  return { restored: toRestore.length, removed: toRemove.length };
}

async function closeSession(sessionId: string, attendanceDate: Date): Promise<boolean> {
  const result = await prisma.attendanceSession.updateMany({
    where: { id: sessionId, status: "active" },
    data: { status: "ended", endsAt: vnNow() },
  });

  if (result.count === 0) return false;
  await markMissingStudentsAbsent(attendanceDate);
  broadcastAttendanceEvent("session_ended", { sessionId, date: vnDateKey(attendanceDate) });
  return true;
}

export async function expireExpiredAttendanceSessions(): Promise<void> {
  const expired = await prisma.attendanceSession.findMany({
    where: { status: "active", endsAt: { lte: new Date() } },
    select: { id: true, startedAt: true },
  });

  for (const session of expired) {
    await closeSession(session.id, startOfVnDay(session.startedAt));
  }
}

async function getTodaySession(): Promise<{ id: string; startedAt: Date; endsAt: Date | null; status: string } | null> {
  const today = startOfVnDay(new Date());
  const tomorrow = new Date(today.getTime() + 86400000);
  return prisma.attendanceSession.findFirst({
    where: { startedAt: { gte: today, lt: tomorrow } },
    select: { id: true, startedAt: true, endsAt: true, status: true },
    orderBy: { startedAt: "desc" },
  });
}

async function getActiveSession(): Promise<{ id: string; startedAt: Date; endsAt: Date | null; status: string } | null> {
  const session = await prisma.attendanceSession.findFirst({
    where: { status: "active" },
    select: { id: true, startedAt: true, endsAt: true, status: true },
  });

  if (!session) return null;
  if (session.endsAt && session.endsAt.getTime() > Date.now()) return session;

  await closeSession(session.id, startOfVnDay(session.startedAt));
  return null;
}

// ─── POST /api/attendance/start ───
// Teacher starts an attendance session with countdown (default 30 min)
router.post("/start", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    // Close and finalize any prior active session before opening a new one.
    await expireExpiredAttendanceSessions();
    const previousActiveSessions = await prisma.attendanceSession.findMany({
      where: { status: "active" },
      select: { id: true, startedAt: true },
    });
    for (const previousSession of previousActiveSessions) {
      await closeSession(previousSession.id, startOfVnDay(previousSession.startedAt));
    }

    const durationMinutes = Math.min(120, Math.max(1, Number(req.body?.durationMinutes) || 30));
    const now = vnNow();
    const endsAt = new Date(now.getTime() + durationMinutes * 60000);
    const classGroupId = await resolveSessionClassGroupId(req.body?.classGroupId, req.user!.userId);
    const sessionDate = startOfVnDay(now);

    // AttendanceSession is unique on (classGroupId, sessionDate), so opening a
    // second session on the same day must reuse the existing row instead of
    // inserting a duplicate.
    const session = await prisma.attendanceSession.upsert({
      where: { classGroupId_sessionDate: { classGroupId, sessionDate } },
      create: {
        classGroupId,
        sessionDate,
        startedById: req.user!.userId,
        startedAt: now,
        endsAt,
        status: "active",
      },
      update: {
        startedById: req.user!.userId,
        startedAt: now,
        endsAt,
        status: "active",
      },
    });

    // Reopening a day: drop the absences the previous close wrote automatically,
    // otherwise the session is open but every student is blocked by their own
    // "absent" row. Runs after the upsert so a failed start leaves marks intact.
    const reopened = await clearAutoAbsencesForDate(sessionDate);

    broadcastAttendanceEvent("session_started", {
      sessionId: session.id,
      startedAt: session.startedAt.toISOString(),
      endsAt: session.endsAt ? session.endsAt.toISOString() : null,
    });

    res.json({
      ok: true,
      reopened,
      session: {
        id: session.id,
        startedAt: session.startedAt,
        endsAt: session.endsAt,
        status: session.status,
      },
    });
  } catch (err) {
    countDbError("timeout");
    console.error("start session error:", err);
    res.status(500).json({ error: "Failed to start session" });
  }
});

// ─── POST /api/attendance/end ───
// Teacher ends the active session early
router.post("/end", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const session = await getActiveSession();

    if (!session) {
      res.status(400).json({ error: "No active session" });
      return;
    }

    const closed = await closeSession(session.id, startOfVnDay(session.startedAt));
    if (!closed) {
      res.status(400).json({ error: "No active session" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("end session error:", err);
    res.status(500).json({ error: "Failed to end session" });
  }
});

// ─── GET /api/attendance/active-session ───
// Public: Get current active session info
router.get("/active-session", authenticate, async (req: Request, res: Response) => {
  try {
    const session = await getActiveSession();

    res.json({ session: session || null });
  } catch (err) {
    console.error("active session error:", err);
    res.status(500).json({ error: "Failed to get session" });
  }
});

// ─── GET /api/attendance/sheet?month=YYYY-MM&search= ───
// Public: anyone can view the attendance sheet
router.get("/sheet", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const month = query(req, "month");
    const search = query(req, "search") || "";

    const [year, mon] = (month || vnDateKey(new Date()).slice(0, 7)).split("-");
    const startDate = startOfVnDay(`${year}-${mon}-01`);
    const nextMonth = new Date(startDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const endDate = new Date(nextMonth.getTime() - 86400000);
    const daysInMonth = new Date(Number(year), Number(mon), 0).getDate();
    const dates = Array.from({ length: daysInMonth }, (_, i) => `${year}-${mon}-${String(i + 1).padStart(2, "0")}`);

    const where: any = { role: "student", status: "active", studentRosterExclusions: { none: {} } };
    if (search.trim()) {
      where.OR = [
        { fullName: { contains: search.trim() } },
        { email: { contains: search.trim() } },
      ];
    }

    const students = await prisma.user.findMany({
      where,
      select: { id: true, fullName: true, nickname: true, avatarUrl: true },
      orderBy: { fullName: "asc" },
    });

    const checkIns = await prisma.dailyCheckIn.findMany({
      where: {
        studentId: { in: students.map(s => s.id) },
        date: { gte: startDate, lte: endDate },
      },
    });

    const checkInMap = new Map<string, string>();
    for (const c of checkIns) {
      checkInMap.set(`${c.studentId}:${vnDateKey(c.date)}`, c.status);
    }

    const result = students.map(s => ({
      id: s.id,
      fullName: s.fullName,
      nickname: s.nickname,
      avatarUrl: s.avatarUrl,
      days: dates.map(dateKey => ({
        date: dateKey,
        status: checkInMap.get(`${s.id}:${dateKey}`) || null,
      })),
    }));

    const pendingCount = await prisma.dailyCheckIn.count({
      where: { status: "pending", date: { gte: startDate, lte: endDate } },
    });

    res.json({ students: result, pendingCount });
  } catch (err) {
    console.error("attendance sheet error:", err);
    res.status(500).json({ error: "Failed to load attendance sheet" });
  }
});

// Read-only public sheet for parent viewing. Deliberately omits pending counts and controls.
router.get("/public-sheet", async (req: Request, res: Response) => {
  try {
    const month = query(req, "month") || vnDateKey(new Date()).slice(0, 7);
    const [year, mon] = month.split("-");
    const startDate = startOfVnDay(`${year}-${mon}-01`);
    const nextMonth = new Date(startDate); nextMonth.setMonth(nextMonth.getMonth() + 1);
    const endDate = new Date(nextMonth.getTime() - 86400000);
    const dates = Array.from({ length: new Date(Number(year), Number(mon), 0).getDate() }, (_, i) => `${year}-${mon}-${String(i + 1).padStart(2, "0")}`);
    const students = await prisma.user.findMany({ where: { role: "student", status: "active", studentRosterExclusions: { none: {} } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } });
    const checkIns = await prisma.dailyCheckIn.findMany({ where: { studentId: { in: students.map(s => s.id) }, date: { gte: startDate, lte: endDate }, status: { not: "pending" } } });
    const map = new Map(checkIns.map(c => [`${c.studentId}:${vnDateKey(c.date)}`, c.status]));
    res.json({ month, dates, students: students.map(s => ({ id: s.id, fullName: s.fullName, days: dates.map(d => ({ date: d, status: map.get(`${s.id}:${d}`) || null })) })) });
  } catch (err) { console.error("public attendance error:", err); res.status(500).json({ error: "Failed to load public attendance" }); }
});

// ─── GET /api/attendance/pending ───
router.get("/pending", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const today = startOfVnDay(new Date());

    const pending = await prisma.dailyCheckIn.findMany({
      where: { date: today, status: "pending", student: { studentRosterExclusions: { none: {} } } },
      include: { student: { select: { id: true, fullName: true, nickname: true, avatarUrl: true } } },
      orderBy: { checkInAt: "asc" },
    });

    res.json({
      pending: pending.map(c => ({
        id: c.id,
        studentId: c.studentId,
        fullName: c.student.fullName,
        nickname: c.student.nickname,
        avatarUrl: c.student.avatarUrl,
        date: vnDateKey(c.date),
        checkInAt: c.checkInAt,
        note: c.note,
      })),
    });
  } catch (err) {
    console.error("pending error:", err);
    res.status(500).json({ error: "Failed to load pending" });
  }
});

// ─── POST /api/attendance/approve ───
router.post("/approve", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const checkInIds: string[] = Array.isArray(req.body?.checkInIds) ? req.body.checkInIds : [];
    const action = req.body?.action; // "approve" | "reject"

    if (!checkInIds.length || !["approve", "reject"].includes(action)) {
      res.status(400).json({ error: "checkInIds and action required" });
      return;
    }

    const activeSession = await getActiveSession();
    if (!activeSession) {
      res.status(400).json({ error: "Attendance session has ended" });
      return;
    }

    const pendingRecords = await prisma.dailyCheckIn.findMany({
      where: { id: { in: checkInIds }, status: "pending", date: startOfVnDay(activeSession.startedAt) },
      select: { id: true, studentId: true },
    });
    const pendingIds = pendingRecords.map((record) => record.id);
    if (pendingIds.length === 0) {
      res.status(400).json({ error: "No pending check-ins found for the active session" });
      return;
    }

    const reviewedAt = new Date();
    await prisma.dailyCheckIn.updateMany({
      where: { id: { in: pendingIds }, status: "pending" },
      data: action === "approve"
        ? { status: "present", approvedBy: req.user!.userId, approvedAt: reviewedAt }
        : { status: "absent", approvedBy: req.user!.userId, approvedAt: reviewedAt, note: "Rejected by teacher" },
    });

    // Token awards are deliberately outside the request critical path.
    if (action === "approve") {
      import("../utils/tokens").then(({ awardAttendanceTokens }) => {
        for (const record of pendingRecords) {
          void awardAttendanceTokens(record.studentId, record.id).catch(() => {});
        }
      }).catch(() => {});
    }

    broadcastAttendanceEvent("reviewed", {
      date: vnDateKey(startOfVnDay(activeSession.startedAt)),
      checkInIds: pendingIds,
      action,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("approve error:", err);
    res.status(500).json({ error: "Failed to approve" });
  }
});

// ─── PUT /api/attendance/override ───
router.put("/override", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const { studentId, date, status } = req.body;

    if (!studentId || !date || !["present", "late", "absent", "excused"].includes(status)) {
      res.status(400).json({ error: "studentId, date, status required" });
      return;
    }

    await prisma.dailyCheckIn.upsert({
      where: { studentId_date: { studentId, date: startOfVnDay(date) } },
      create: {
        studentId,
        date: startOfVnDay(date),
        status,
        approvedBy: req.user!.userId,
        approvedAt: new Date(),
      },
      update: {
        status,
        approvedBy: req.user!.userId,
        approvedAt: new Date(),
      },
    });

    broadcastAttendanceEvent("updated", {
      studentId,
      date: vnDateKey(startOfVnDay(date)),
      status,
      source: "override",
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("override error:", err);
    res.status(500).json({ error: "Failed to override" });
  }
});

// ─── GET /api/attendance/stats?month=YYYY-MM ───
router.get("/stats", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const month = query(req, "month") || vnDateKey(new Date()).slice(0, 7);
    const [year, mon] = month.split("-");
    const startDate = startOfVnDay(`${year}-${mon}-01`);
    const nextMonth = new Date(startDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const endDate = new Date(nextMonth.getTime() - 86400000);

    const students = await prisma.user.findMany({
      where: { role: "student", status: "active", studentRosterExclusions: { none: {} } },
      select: { id: true, fullName: true, nickname: true },
    });

    const checkIns = await prisma.dailyCheckIn.findMany({
      where: { studentId: { in: students.map(s => s.id) }, date: { gte: startDate, lte: endDate } },
      select: { studentId: true, status: true },
    });
    const byStudent = new Map<string, typeof checkIns>();
    for (const checkIn of checkIns) {
      const records = byStudent.get(checkIn.studentId) || [];
      records.push(checkIn);
      byStudent.set(checkIn.studentId, records);
    }

    const stats = students.map(s => {
      const records = byStudent.get(s.id) || [];
      const present = records.filter(c => c.status === "present").length;
      const late = records.filter(c => c.status === "late").length;
      const absent = records.filter(c => c.status === "absent").length;
      const excused = records.filter(c => c.status === "excused").length;
      const total = present + late + absent + excused;
      const rate = total > 0 ? Math.round(((present + late) / total) * 100) : null;
      return { studentId: s.id, fullName: s.fullName, nickname: s.nickname, present, late, absent, excused, total, rate };
    });

    stats.sort((a, b) => (b.rate || 0) - (a.rate || 0));
    const avgRate = stats.length > 0
      ? Math.round(stats.reduce((sum, s) => sum + (s.rate || 0), 0) / stats.length)
      : null;

    res.json({ totalStudents: students.length, avgRate, stats });
  } catch (err) {
    console.error("stats error:", err);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// ─── GET /api/attendance/my-status ───
router.get("/my-status", authenticate, async (req: Request, res: Response) => {
  try {
    const today = startOfVnDay(new Date());

    const activeSession = await getActiveSession();
    const session = await getTodaySession();

    const checkIn = await prisma.dailyCheckIn.findUnique({
      where: { studentId_date: { studentId: req.user!.userId, date: today } },
    });

    res.json({
      session: session || null,
      checkIn: checkIn ? { status: checkIn.status, checkInAt: checkIn.checkInAt, note: checkIn.note } : null,
      canCheckIn: Boolean(activeSession && !checkIn),
      canRequestLeave: Boolean(activeSession && !checkIn),
    });
  } catch (err) {
    console.error("my-status error:", err);
    res.status(500).json({ error: "Failed to load status" });
  }
});

// ─── POST /api/attendance/check-in ───
router.post("/check-in", authenticate, async (req: Request, res: Response) => {
  try {
    const today = startOfVnDay(new Date());

    const session = await getActiveSession();
    if (!session) {
      res.status(400).json({ error: "Chưa có phiên điểm danh nào đang mở" });
      return;
    }

    const exclusion = await prisma.studentRosterExclusion.findUnique({ where: { studentId: req.user!.userId } });
    if (exclusion) {
      res.status(403).json({ error: "Tài khoản không thuộc danh sách điểm danh hiện tại" });
      return;
    }

    const existing = await prisma.dailyCheckIn.findUnique({
      where: { studentId_date: { studentId: req.user!.userId, date: today } },
    });
    if (existing) {
      res.status(400).json({ error: "Bạn đã điểm danh rồi" });
      return;
    }

    const checkIn = await prisma.dailyCheckIn.create({
      data: {
        studentId: req.user!.userId,
        date: today,
        checkInAt: new Date(),
        status: "pending",
      },
    });

    broadcastAttendanceEvent("updated", {
      studentId: req.user!.userId,
      date: vnDateKey(today),
      status: checkIn.status,
      source: "check_in",
    });

    res.json({ ok: true, checkInAt: checkIn.checkInAt, status: checkIn.status });
  } catch (err) {
    console.error("check-in error:", err);
    res.status(500).json({ error: "Failed to check in" });
  }
});

// ─── POST /api/attendance/request-leave ───
router.post("/request-leave", authenticate, async (req: Request, res: Response) => {
  try {
    const reason = req.body?.reason;
    if (!reason) {
      res.status(400).json({ error: "reason required" });
      return;
    }

    const today = startOfVnDay(new Date());

    const session = await getActiveSession();
    if (!session) {
      res.status(400).json({ error: "No active attendance session" });
      return;
    }

    const exclusion = await prisma.studentRosterExclusion.findUnique({ where: { studentId: req.user!.userId } });
    if (exclusion) {
      res.status(403).json({ error: "Tài khoản không thuộc danh sách điểm danh hiện tại" });
      return;
    }

    const existing = await prisma.dailyCheckIn.findUnique({
      where: { studentId_date: { studentId: req.user!.userId, date: today } },
    });
    if (existing) {
      res.status(400).json({ error: "Already have a record for today" });
      return;
    }

    const checkIn = await prisma.dailyCheckIn.create({
      data: {
        studentId: req.user!.userId,
        date: today,
        status: "excused",
        note: reason,
      },
    });

    broadcastAttendanceEvent("updated", {
      studentId: req.user!.userId,
      date: vnDateKey(today),
      status: checkIn.status,
      source: "leave_request",
    });

    res.json({ ok: true, status: "excused" });
  } catch (err) {
    console.error("request-leave error:", err);
    res.status(500).json({ error: "Failed to request leave" });
  }
});

// ─── GET /api/attendance/my-history?months=3 ───
router.get("/my-history", authenticate, async (req: Request, res: Response) => {
  try {
    const months = Math.min(6, Math.max(1, Number(req.query.months) || 3));
    const since = new Date(Date.now() - months * 30 * 86400000);

    const checkIns = await prisma.dailyCheckIn.findMany({
      where: { studentId: req.user!.userId, date: { gte: since } },
      orderBy: { date: "asc" },
    });

    const totalDays = months * 30;
    const dayKeys: string[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      dayKeys.push(vnDateKey(new Date(Date.now() - i * 86400000)));
    }

    const checkInMap = new Map<string, string>();
    for (const c of checkIns) {
      checkInMap.set(vnDateKey(c.date), c.status);
    }

    const days = dayKeys.map(key => ({ date: key, status: checkInMap.get(key) || null }));

    const present = checkIns.filter(c => c.status === "present").length;
    const late = checkIns.filter(c => c.status === "late").length;
    const absent = checkIns.filter(c => c.status === "absent").length;
    const excused = checkIns.filter(c => c.status === "excused").length;
    const total = present + late + absent + excused;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : null;

    res.json({ days, stats: { present, late, absent, excused, rate } });
  } catch (err) {
    console.error("my-history error:", err);
    res.status(500).json({ error: "Failed to load history" });
  }
});

export default router;
