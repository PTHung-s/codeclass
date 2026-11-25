import prisma from "../utils/prisma";

/**
 * Teacher-controlled lesson recording.
 *
 * A teacher presses Start, which snapshots everyone currently online; students
 * then stream timestamped events (code snapshots, tab-outs, runs) until the
 * teacher presses End. Re-recording on the same calendar day overwrites that
 * day's session, while earlier days survive.
 *
 * All logic lives here rather than in gameWebSocket.ts, which is `@ts-nocheck`
 * and therefore unprotected by the type checker.
 */

/** Max events kept per student per session. Guards the droplet's 85%-full disk. */
const MAX_EVENTS_PER_PARTICIPANT = 300;
/** Recordings older than this are purged when a new one ends. */
const RETENTION_DAYS = 30;

export type RecordingEventType =
  | "code_snapshot"
  | "tab_out"
  | "tab_back"
  | "run"
  | "idle_start"
  | "paste"
  | "activity";

export interface IncomingEvent {
  type: RecordingEventType;
  code?: string;
  label?: string;
  passed?: boolean | null;
  meta?: Record<string, unknown>;
}

/** Midnight in Asia/Ho_Chi_Minh, matching routes/tracking.ts. */
export function vnDateKey(d: Date = new Date()): Date {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
  return new Date(`${key}T00:00:00.000+07:00`);
}

// ── In-memory state for the single active recording ──
// Only one recording runs at a time (one teacher, one class).
interface ActiveState {
  sessionId: string;
  startedAt: number;
  /** userId → participant row id */
  participants: Map<string, string>;
  /** userId → hash of last code snapshot, to skip unchanged snapshots */
  lastCodeHash: Map<string, string>;
  /** participantId → number of events stored */
  eventCounts: Map<string, number>;
}

let active: ActiveState | null = null;
/**
 * Set synchronously at the top of startRecording so two rapid Start clicks
 * can't both get past the isRecording() check while the first is still awaiting
 * its database writes.
 */
let starting = false;

export function getActiveRecording() {
  if (!active) return null;
  return {
    sessionId: active.sessionId,
    startedAt: active.startedAt,
    userIds: [...active.participants.keys()],
  };
}

export function isRecording() {
  return active !== null || starting;
}

export function isParticipant(userId: string) {
  return !!active?.participants.has(userId);
}

/** Cheap non-cryptographic hash — only used to detect "code changed". */
function hashCode(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return `${h}:${s.length}`;
}

/**
 * Start a recording for the given students.
 *
 * Overwrites any existing session for today (cascade removes its participants
 * and events); other days are untouched.
 */
export async function startRecording(opts: {
  startedById: string;
  userIds: string[];
  courseId?: string | null;
  title?: string | null;
}) {
  if (active || starting) return { error: "Đã có buổi ghi đang chạy" as const };
  starting = true;
  try {
    const sessionDate = vnDateKey();

    // Same-day overwrite. Cascade clears participants + events.
    await prisma.recordingSession.deleteMany({ where: { sessionDate } });

    // Only real students get recorded, never staff.
    const students = await prisma.user.findMany({
      where: { id: { in: opts.userIds }, role: "student" },
      select: { id: true },
    });

    const session = await prisma.recordingSession.create({
      data: {
        sessionDate,
        startedById: opts.startedById,
        courseId: opts.courseId || null,
        title: opts.title || null,
        status: "recording",
        participants: {
          create: students.map((s) => ({ userId: s.id, addedManually: false })),
        },
      },
      include: { participants: { select: { id: true, userId: true } } },
    });

    active = {
      sessionId: session.id,
      startedAt: session.startedAt.getTime(),
      participants: new Map(session.participants.map((p) => [p.userId, p.id])),
      lastCodeHash: new Map(),
      eventCounts: new Map(),
    };

    return { sessionId: session.id, userIds: [...active.participants.keys()] };
  } finally {
    starting = false;
  }
}

/** Add a student who joined after Start. Idempotent. */
export async function addParticipant(userId: string) {
  if (!active) return { error: "Không có buổi ghi nào đang chạy" as const };
  if (active.participants.has(userId)) return { alreadyIn: true as const };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user || user.role !== "student") return { error: "Không tìm thấy học sinh" as const };

  const participant = await prisma.recordingParticipant.upsert({
    where: { sessionId_userId: { sessionId: active.sessionId, userId } },
    create: { sessionId: active.sessionId, userId, addedManually: true },
    update: {},
    select: { id: true },
  });

  active.participants.set(userId, participant.id);
  return { added: true as const };
}

/**
 * Store one event from a student. Returns a compact summary for the live grid,
 * or null when the event is ignored (not recording / not a participant / code
 * unchanged).
 */
export async function recordEvent(userId: string, ev: IncomingEvent) {
  if (!active) return null;
  const participantId = active.participants.get(userId);
  if (!participantId) return null;

  const at = new Date();
  const code = typeof ev.code === "string" ? ev.code.slice(0, 20_000) : null;

  // Skip snapshots that didn't change anything — the single biggest disk saver.
  if (ev.type === "code_snapshot") {
    if (!code) return null;
    const h = hashCode(code);
    if (active.lastCodeHash.get(userId) === h) return null;
    active.lastCodeHash.set(userId, h);
  }

  await prisma.recordingEvent.create({
    data: {
      participantId,
      at,
      type: ev.type,
      code,
      label: typeof ev.label === "string" ? ev.label.slice(0, 200) : null,
      passed: ev.passed === true ? true : ev.passed === false ? false : null,
      meta: ev.meta ? JSON.stringify(ev.meta).slice(0, 500) : null,
    },
  });

  // Roll-up counters, incremented atomically.
  if (ev.type === "tab_out") {
    await prisma.recordingParticipant.update({
      where: { id: participantId },
      data: { tabOutCount: { increment: 1 } },
    });
  } else if (ev.type === "run") {
    await prisma.recordingParticipant.update({
      where: { id: participantId },
      data: { runCount: { increment: 1 } },
    });
  }

  await enforceEventCap(participantId);

  return { userId, type: ev.type, at: at.getTime(), code, label: ev.label ?? null, passed: ev.passed ?? null };
}

/**
 * Keep each student under the event cap by dropping the OLDEST code snapshots
 * first. Tab-outs, runs and pastes are preserved — losing those would defeat the
 * purpose of the recording.
 *
 * The in-memory counter is a cheap trigger only; the actual decision uses a real
 * COUNT so repeated trims can't compound into over-deleting (an earlier version
 * derived `overflow` from the running counter and deleted far more than needed).
 */
async function enforceEventCap(participantId: string) {
  if (!active) return;
  const seen = (active.eventCounts.get(participantId) ?? 0) + 1;
  active.eventCounts.set(participantId, seen);

  // Cheap guard: nothing can be over the cap before this many events.
  if (seen <= MAX_EVENTS_PER_PARTICIPANT) return;
  // Only re-check periodically to avoid a COUNT on every single event.
  if (seen % 25 !== 0) return;

  const stored = await prisma.recordingEvent.count({ where: { participantId } });
  const overflow = stored - MAX_EVENTS_PER_PARTICIPANT;
  if (overflow <= 0) return;

  const droppable = await prisma.recordingEvent.findMany({
    where: { participantId, type: "code_snapshot" },
    orderBy: { at: "asc" },
    take: overflow,
    select: { id: true },
  });
  if (!droppable.length) return;

  await prisma.recordingEvent.deleteMany({ where: { id: { in: droppable.map((e) => e.id) } } });
}

/** Finish the recording: store final code per student, then purge old sessions. */
export async function endRecording() {
  if (!active) return { error: "Không có buổi ghi nào đang chạy" as const };
  const sessionId = active.sessionId;
  const startedAt = active.startedAt;
  const participantIds = [...active.participants.values()];
  active = null; // stop accepting events immediately

  const endedAt = new Date();

  // Two bulk reads instead of 2 queries per student — a 30-student class was
  // otherwise 60 sequential round trips on a single-core SQLite box.
  const [participantRows, snapshots] = await Promise.all([
    prisma.recordingParticipant.findMany({
      where: { id: { in: participantIds } },
      select: { id: true, joinedAt: true },
    }),
    prisma.recordingEvent.findMany({
      where: { participantId: { in: participantIds }, type: "code_snapshot" },
      orderBy: { at: "desc" },
      select: { participantId: true, code: true },
    }),
  ]);

  // Ordered newest-first, so the first hit per participant is their final code.
  const finalCode = new Map<string, string | null>();
  for (const s of snapshots) {
    if (!finalCode.has(s.participantId)) finalCode.set(s.participantId, s.code);
  }

  await prisma.$transaction(
    participantRows.map((p) => {
      // Count from when THIS student joined, not from Start — a student added in
      // the last 5 minutes shouldn't be credited with the whole session.
      const from = Math.max(startedAt, p.joinedAt.getTime());
      const activeSeconds = Math.max(0, Math.round((endedAt.getTime() - from) / 1000));
      return prisma.recordingParticipant.update({
        where: { id: p.id },
        data: { finalCode: finalCode.get(p.id) ?? null, activeSeconds },
      });
    }),
  );

  await prisma.recordingSession.update({
    where: { id: sessionId },
    data: { status: "ended", endedAt },
  });

  // Retention: drop sessions older than RETENTION_DAYS (cascade clears children).
  const cutoff = vnDateKey();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const purged = await prisma.recordingSession.deleteMany({ where: { sessionDate: { lt: cutoff } } });

  return { sessionId, endedAt, purgedSessions: purged.count };
}

/**
 * Recover from a server restart mid-recording: any session still marked
 * "recording" is closed, because its in-memory state is gone.
 */
export async function reconcileOrphanedRecordings() {
  const orphans = await prisma.recordingSession.updateMany({
    where: { status: "recording" },
    data: { status: "ended", endedAt: new Date() },
  });
  if (orphans.count > 0) {
    console.log(`[recording] closed ${orphans.count} orphaned session(s) after restart`);
  }
}
