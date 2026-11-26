import crypto from "node:crypto";
import prisma from "../utils/prisma";
import { chatCompletion, hasLLM } from "../utils/llmClient";
import { SKILL_SEEDS, skillIdToName } from "../utils/skillGraph";
import { fromMeetingQuizSubmission, recordSkillEvidenceBatch } from "./skillEvidence";
import { queueMasteryRecalculation } from "./skillMastery";

const CANONICAL_SKILL_IDS = new Set(SKILL_SEEDS.map((s) => s.skillId));

export function getMeetingServerUrl(): string {
  return (process.env.MEETING_SERVER_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
}

export function getMeetingPublicUrl(): string {
  return (process.env.MEETING_PUBLIC_URL || "/meet/").replace(/\/?$/, "/");
}

function getInternalSecret(): string {
  return process.env.MEETING_INTERNAL_SECRET || process.env.JWT_SECRET || "";
}

export function verifyMeetingInternalSecret(headerVal?: string | null): boolean {
  const expected = getInternalSecret();
  if (!expected || !headerVal) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(headerVal), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface SyncedParticipantPayload {
  participantKey: string;
  ccId?: string | null;
  displayName: string;
  role?: string | null;
  isConnected?: boolean;
  joinedAt?: number;
  points?: number;
  violations?: number;
  savedCodeCount?: number;
}

export interface SyncRoomPayload {
  roomId: string;
  title: string;
  courseId?: string | null;
  hostUserId?: string | null;
  hostName?: string | null;
  hasPassword?: boolean;
  isBreakout?: boolean;
  parentRoomId?: string | null;
  activeParticipantCount?: number;
  activeQuizTitle?: string | null;
  examMonitoring?: boolean;
  participants?: SyncedParticipantPayload[];
}

export interface SyncQuizQuestionPayload {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
  difficulty?: string | number;
  skillId?: string | null;
}

export interface SyncQuizAnswerPayload {
  questionId: string;
  selectedOption: number;
  isCorrect: boolean;
}

export interface SyncQuizSubmissionPayload {
  participantKey: string;
  ccId?: string | null;
  studentName: string;
  score: number;
  totalQuestions: number;
  timeTaken: number;
  rank?: number | null;
  completedAt?: number;
  answers: SyncQuizAnswerPayload[];
}

export interface SyncMeetingQuizPayload {
  roomId: string;
  roomTitle?: string;
  courseId?: string | null;
  externalQuizId: string;
  kind: "quiz" | "adaptive";
  title: string;
  startedAt?: number;
  endedAt?: number | null;
  questions: SyncQuizQuestionPayload[];
  submissions: SyncQuizSubmissionPayload[];
}

export interface LiveMeetingRoomSnapshot {
  roomId: string;
  title: string;
  courseId?: string | null;
  hostUserId?: string | null;
  hostName: string;
  hasPassword: boolean;
  isBreakout: boolean;
  parentRoomId?: string | null;
  activeParticipantCount: number;
  activeQuizTitle?: string | null;
  examMonitoring: boolean;
  createdAt?: number;
  participants: SyncedParticipantPayload[];
}

function internalHeaders(): Record<string, string> {
  const secret = getInternalSecret();
  return secret ? { "x-meeting-secret": secret } : {};
}

async function resolveValidUserIdSet(candidateIds: Array<string | null | undefined>): Promise<Set<string>> {
  const unique = Array.from(new Set(candidateIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)));
  if (unique.length === 0) return new Set();
  const rows = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

async function resolveValidCourseId(courseId?: string | null): Promise<string | null> {
  if (!courseId || !courseId.trim()) return null;
  const row = await prisma.course.findUnique({ where: { id: courseId.trim() }, select: { id: true } });
  return row?.id ?? null;
}

export async function fetchLiveMeetingRooms(): Promise<{ online: boolean; rooms: LiveMeetingRoomSnapshot[] }> {
  try {
    const res = await fetch(`${getMeetingServerUrl()}/api/internal/rooms`, {
      headers: internalHeaders(),
      signal: (AbortSignal as any).timeout(2500),
    });
    if (!res.ok) return { online: false, rooms: [] };
    const data: any = await res.json();
    return {
      online: true,
      rooms: Array.isArray(data?.rooms) ? data.rooms : [],
    };
  } catch {
    return { online: false, rooms: [] };
  }
}

export async function createLiveMeetingRoom(input: {
  title: string;
  password?: string;
  hostName: string;
  hostUserId: string;
  courseId?: string;
}) {
  const validCourseId = await resolveValidCourseId(input.courseId);
  const res = await fetch(`${getMeetingServerUrl()}/api/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...internalHeaders(),
    },
    body: JSON.stringify({
      name: input.title,
      password: input.password || "",
      hostName: input.hostName,
      hostUserId: input.hostUserId,
      courseId: validCourseId || undefined,
    }),
    signal: (AbortSignal as any).timeout(5000),
  });

  if (!res.ok) {
    const errBody: any = await res.json().catch(() => ({}));
    const err = new Error(errBody?.error || "Không tạo được phòng trên Meeting Server.");
    (err as any).statusCode = res.status >= 400 ? res.status : 502;
    throw err;
  }

  const created: any = await res.json();
  const roomId = String(created.id || "");
  if (!roomId) throw new Error("Meeting Server không trả về ID phòng.");

  const saved = await prisma.meetingRoom.upsert({
    where: { id: roomId },
    create: {
      id: roomId,
      title: input.title,
      courseId: validCourseId,
      hostUserId: input.hostUserId,
      hostName: input.hostName,
      hasPassword: Boolean(input.password),
      status: "live",
      activeParticipantCount: 0,
      lastSyncedAt: new Date(),
    },
    update: {
      title: input.title,
      courseId: validCourseId,
      hostUserId: input.hostUserId,
      hostName: input.hostName,
      hasPassword: Boolean(input.password),
      status: "live",
      endedAt: null,
      lastSyncedAt: new Date(),
    },
    include: {
      course: { select: { id: true, title: true } },
    },
  });

  return {
    room: saved,
    hostSecret: created.hostSecret || "",
    joinUrl: `${getMeetingPublicUrl()}?room=${encodeURIComponent(roomId)}`,
  };
}

export async function deleteLiveMeetingRoom(roomId: string): Promise<void> {
  try {
    await fetch(`${getMeetingServerUrl()}/api/internal/rooms/${encodeURIComponent(roomId)}`, {
      method: "DELETE",
      headers: internalHeaders(),
      signal: (AbortSignal as any).timeout(4000),
    });
  } catch {
    // Fail-soft: mark closed in CodeClass DB even if meeting server already cleared it
  }

  await prisma.meetingRoom.updateMany({
    where: { id: roomId },
    data: {
      status: "ended",
      endedAt: new Date(),
      activeParticipantCount: 0,
      activeParticipantsJson: "[]",
      lastSyncedAt: new Date(),
    },
  });
}

export async function syncRoomEvent(payload: SyncRoomPayload, deleted = false) {
  if (!payload?.roomId) return { ok: false };

  if (deleted) {
    await prisma.meetingRoom.updateMany({
      where: { id: payload.roomId },
      data: {
        status: "ended",
        endedAt: new Date(),
        activeParticipantCount: 0,
        activeParticipantsJson: "[]",
        lastSyncedAt: new Date(),
      },
    });
    return { ok: true, deleted: true };
  }

  const participants = Array.isArray(payload.participants) ? payload.participants : [];
  const connected = participants.filter((p) => p.isConnected !== false);
  const activeCount = Number.isFinite(payload.activeParticipantCount)
    ? Math.max(0, Number(payload.activeParticipantCount))
    : connected.length;

  const validUserIds = await resolveValidUserIdSet([
    payload.hostUserId,
    ...participants.map((p) => p.ccId),
  ]);
  const validCourseId = await resolveValidCourseId(payload.courseId);
  const validHostUserId = payload.hostUserId && validUserIds.has(payload.hostUserId) ? payload.hostUserId : null;

  const existing = await prisma.meetingRoom.findUnique({
    where: { id: payload.roomId },
    select: { peakParticipantCount: true, courseId: true, hostUserId: true },
  });

  const activeJson = JSON.stringify(
    connected.slice(0, 60).map((p) => ({
      name: p.displayName,
      role: p.role || null,
      ccId: p.ccId && validUserIds.has(p.ccId) ? p.ccId : null,
      points: p.points || 0,
      violations: p.violations || 0,
    })),
  );

  const now = new Date();
  await prisma.meetingRoom.upsert({
    where: { id: payload.roomId },
    create: {
      id: payload.roomId,
      title: payload.title || `Phòng ${payload.roomId}`,
      courseId: validCourseId,
      hostUserId: validHostUserId,
      hostName: payload.hostName || "",
      hasPassword: Boolean(payload.hasPassword),
      status: "live",
      isBreakout: Boolean(payload.isBreakout),
      parentRoomId: payload.parentRoomId || null,
      activeParticipantCount: activeCount,
      peakParticipantCount: activeCount,
      activeQuizTitle: payload.activeQuizTitle || null,
      examMonitoring: Boolean(payload.examMonitoring),
      activeParticipantsJson: activeJson,
      lastSyncedAt: now,
    },
    update: {
      title: payload.title || `Phòng ${payload.roomId}`,
      ...(validCourseId && !existing?.courseId ? { courseId: validCourseId } : {}),
      ...(validHostUserId && !existing?.hostUserId ? { hostUserId: validHostUserId } : {}),
      ...(payload.hostName ? { hostName: payload.hostName } : {}),
      hasPassword: Boolean(payload.hasPassword),
      status: "live",
      isBreakout: Boolean(payload.isBreakout),
      parentRoomId: payload.parentRoomId || null,
      activeParticipantCount: activeCount,
      peakParticipantCount: Math.max(existing?.peakParticipantCount || 0, activeCount),
      activeQuizTitle: payload.activeQuizTitle || null,
      examMonitoring: Boolean(payload.examMonitoring),
      activeParticipantsJson: activeJson,
      endedAt: null,
      lastSyncedAt: now,
    },
  });

  for (const p of participants) {
    if (!p?.participantKey) continue;
    const validUid = p.ccId && validUserIds.has(p.ccId) ? p.ccId : null;
    const joinedAt = p.joinedAt ? new Date(p.joinedAt) : now;
    const isConnected = p.isConnected !== false;
    const durationSeconds = Math.max(0, Math.round((now.getTime() - joinedAt.getTime()) / 1000));

    await prisma.meetingAttendance.upsert({
      where: {
        roomId_participantKey: {
          roomId: payload.roomId,
          participantKey: p.participantKey,
        },
      },
      create: {
        roomId: payload.roomId,
        userId: validUid,
        participantKey: p.participantKey,
        displayName: p.displayName || "Ẩn danh",
        role: p.role || null,
        joinedAt,
        leftAt: isConnected ? null : now,
        durationSeconds,
        points: p.points || 0,
        violations: p.violations || 0,
        savedCodeCount: p.savedCodeCount || 0,
      },
      update: {
        ...(validUid ? { userId: validUid } : {}),
        displayName: p.displayName || "Ẩn danh",
        ...(p.role ? { role: p.role } : {}),
        leftAt: isConnected ? null : now,
        durationSeconds,
        points: p.points || 0,
        violations: p.violations || 0,
        savedCodeCount: p.savedCodeCount || 0,
      },
    });
  }

  return { ok: true };
}

export async function syncMeetingQuizEvent(payload: SyncMeetingQuizPayload) {
  if (!payload?.roomId || !payload?.externalQuizId) {
    return { ok: false, error: "Thiếu roomId hoặc externalQuizId" };
  }

  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  const submissions = Array.isArray(payload.submissions) ? payload.submissions : [];

  const existingRoom = await prisma.meetingRoom.findUnique({
    where: { id: payload.roomId },
    select: { id: true, courseId: true },
  });
  const resolvedCourseId = existingRoom?.courseId || (await resolveValidCourseId(payload.courseId));

  if (!existingRoom) {
    await prisma.meetingRoom.create({
      data: {
        id: payload.roomId,
        title: payload.roomTitle || `Phòng ${payload.roomId}`,
        courseId: resolvedCourseId,
        status: "live",
        lastSyncedAt: new Date(),
      },
    });
  }

  const normalizedQuestions = questions.map((q, idx) => ({
    id: String(q.id || `q_${idx}`),
    question: String(q.question || ""),
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correctAnswer: Number(q.correctAnswer) || 0,
    explanation: q.explanation ? String(q.explanation) : "",
    difficulty: q.difficulty ?? "medium",
    skillId:
      typeof q.skillId === "string" && CANONICAL_SKILL_IDS.has(q.skillId.trim())
        ? q.skillId.trim()
        : null,
  }));

  const questionById = new Map(normalizedQuestions.map((q) => [q.id, q]));

  const session = await prisma.meetingQuizSession.upsert({
    where: {
      roomId_externalQuizId_kind: {
        roomId: payload.roomId,
        externalQuizId: String(payload.externalQuizId),
        kind: payload.kind === "adaptive" ? "adaptive" : "quiz",
      },
    },
    create: {
      externalQuizId: String(payload.externalQuizId),
      roomId: payload.roomId,
      courseId: resolvedCourseId,
      kind: payload.kind === "adaptive" ? "adaptive" : "quiz",
      title: payload.title || "Bài kiểm tra trong lớp Meeting",
      questionsJson: JSON.stringify(normalizedQuestions),
      totalQuestions: normalizedQuestions.length,
      startedAt: payload.startedAt ? new Date(payload.startedAt) : new Date(),
      endedAt: payload.endedAt ? new Date(payload.endedAt) : null,
    },
    update: {
      ...(resolvedCourseId ? { courseId: resolvedCourseId } : {}),
      title: payload.title || "Bài kiểm tra trong lớp Meeting",
      questionsJson: JSON.stringify(normalizedQuestions),
      totalQuestions: normalizedQuestions.length,
      ...(payload.endedAt ? { endedAt: new Date(payload.endedAt) } : {}),
    },
  });

  const validUserIds = await resolveValidUserIdSet(submissions.map((s) => s.ccId));
  const touchedUserIds = new Set<string>();
  let evidenceInserted = 0;

  for (const sub of submissions) {
    if (!sub?.participantKey) continue;
    const validUid = sub.ccId && validUserIds.has(sub.ccId) ? sub.ccId : null;
    const totalQ = Math.max(normalizedQuestions.length, Number(sub.totalQuestions) || 0);
    const score = Math.max(0, Number(sub.score) || 0);
    const accuracy = totalQ > 0 ? Math.round((score / totalQ) * 1000) / 10 : 0;
    const completedAt = sub.completedAt ? new Date(sub.completedAt) : new Date();

    const enrichedAnswers = (Array.isArray(sub.answers) ? sub.answers : []).map((a) => {
      const q = questionById.get(String(a.questionId));
      return {
        questionId: String(a.questionId),
        selectedOption: Number(a.selectedOption),
        isCorrect: Boolean(a.isCorrect),
        skillId: q?.skillId || null,
        difficulty: q?.difficulty || "medium",
      };
    });

    await prisma.meetingQuizSubmission.upsert({
      where: {
        sessionId_participantKey: {
          sessionId: session.id,
          participantKey: sub.participantKey,
        },
      },
      create: {
        sessionId: session.id,
        roomId: payload.roomId,
        userId: validUid,
        participantKey: sub.participantKey,
        studentName: sub.studentName || "Học viên",
        score,
        totalQuestions: totalQ,
        accuracy,
        timeTaken: Math.max(0, Math.round(Number(sub.timeTaken) || 0)),
        rank: sub.rank ?? null,
        answersJson: JSON.stringify(enrichedAnswers),
        completedAt,
      },
      update: {
        ...(validUid ? { userId: validUid } : {}),
        studentName: sub.studentName || "Học viên",
        score,
        totalQuestions: totalQ,
        accuracy,
        timeTaken: Math.max(0, Math.round(Number(sub.timeTaken) || 0)),
        rank: sub.rank ?? null,
        answersJson: JSON.stringify(enrichedAnswers),
        completedAt,
      },
    });

    if (validUid) {
      const evRows = fromMeetingQuizSubmission(validUid, session.id, payload.roomId, enrichedAnswers, completedAt);
      if (evRows.length > 0) {
        const res = await recordSkillEvidenceBatch(evRows);
        evidenceInserted += res.inserted;
        touchedUserIds.add(validUid);
      }
    }
  }

  for (const uid of touchedUserIds) {
    queueMasteryRecalculation(uid).catch((err) =>
      console.error("[meetingService] mastery recalc error:", err),
    );
  }

  // If questions lack skillIds and LLM is available, classify asynchronously and backfill SkillEvidence
  const hasUntagged = normalizedQuestions.some((q) => !q.skillId);
  if (hasUntagged && submissions.length > 0 && hasLLM()) {
    void classifyMeetingQuizSkillsAsync(session.id).catch((err) =>
      console.warn("[meetingService] async skill classification failed:", err?.message || err),
    );
  }

  return { ok: true, sessionId: session.id, evidenceInserted };
}

/**
 * Fallback classification for Meeting quizzes whose questions did not carry canonical skillId tags.
 */
async function classifyMeetingQuizSkillsAsync(sessionId: string): Promise<void> {
  const session = await prisma.meetingQuizSession.findUnique({
    where: { id: sessionId },
    include: { submissions: true },
  });
  if (!session) return;

  let questions: Array<{
    id: string;
    question: string;
    difficulty?: string | number;
    skillId?: string | null;
    [k: string]: unknown;
  }> = [];
  try {
    questions = JSON.parse(session.questionsJson || "[]");
  } catch {
    return;
  }

  const missing = questions.filter((q) => !q.skillId && q.question);
  if (missing.length === 0) return;

  const skillCatalog = SKILL_SEEDS.map((s) => `${s.skillId}: ${skillIdToName(s.skillId)}`).join("\n");
  const prompt = [
    "Gán đúng 1 mã skillId hợp lệ (hoặc null nếu không khớp) cho từng câu hỏi trắc nghiệm lập trình dưới đây.",
    "Trả về DUY NHẤT JSON dạng {\"mappings\": [{\"id\": \"...\", \"skillId\": \"...\" | null}]}.",
    "\nDanh sách skillId hợp lệ:\n" + skillCatalog,
    "\nCâu hỏi:\n" + missing.map((q) => `- id="${q.id}": ${q.question.slice(0, 220)}`).join("\n"),
  ].join("\n");

  const res = await chatCompletion(
    [
      { role: "system", content: "Bạn là bộ phân loại câu hỏi lập trình theo taxonomy kỹ năng. Chỉ trả về JSON hợp lệ." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.1, max_tokens: 1500, response_format: { type: "json_object" }, timeoutMs: 25_000 },
  );
  if (!res?.content) return;

  let parsed: any = null;
  try {
    parsed = JSON.parse(res.content);
  } catch {
    return;
  }
  const mappings = new Map<string, string>();
  for (const m of Array.isArray(parsed?.mappings) ? parsed.mappings : []) {
    const id = String(m?.id || "");
    const sid = typeof m?.skillId === "string" ? m.skillId.trim() : "";
    if (id && sid && CANONICAL_SKILL_IDS.has(sid)) {
      mappings.set(id, sid);
    }
  }
  if (mappings.size === 0) return;

  const updatedQuestions = questions.map((q) => (!q.skillId && mappings.has(q.id) ? { ...q, skillId: mappings.get(q.id)! } : q));
  await prisma.meetingQuizSession.update({
    where: { id: session.id },
    data: { questionsJson: JSON.stringify(updatedQuestions) },
  });

  const skillByQid = new Map(updatedQuestions.map((q) => [q.id, q]));
  const recalcUsers = new Set<string>();

  for (const sub of session.submissions) {
    let ansList: Array<{ questionId: string; selectedOption: number; isCorrect: boolean; skillId?: string | null; difficulty?: string | number }> = [];
    try {
      ansList = JSON.parse(sub.answersJson || "[]");
    } catch {
      continue;
    }
    const nextAns = ansList.map((a) => {
      const q = skillByQid.get(a.questionId);
      return { ...a, skillId: a.skillId || q?.skillId || null, difficulty: a.difficulty || q?.difficulty || "medium" };
    });
    await prisma.meetingQuizSubmission.update({
      where: { id: sub.id },
      data: { answersJson: JSON.stringify(nextAns) },
    });
    if (sub.userId) {
      const ev = fromMeetingQuizSubmission(sub.userId, session.id, session.roomId, nextAns, sub.completedAt);
      if (ev.length > 0) {
        const resBatch = await recordSkillEvidenceBatch(ev);
        if (resBatch.inserted > 0) recalcUsers.add(sub.userId);
      }
    }
  }

  for (const uid of recalcUsers) {
    queueMasteryRecalculation(uid).catch(() => {});
  }
}
