import crypto from 'crypto';
import type express from 'express';
import { Room } from './types.js';
import { RoomManager } from './room.manager.js';

const CODECLASS_API = (process.env.CODECLASS_API || 'http://127.0.0.1:3001').replace(/\/$/, '');
const INTERNAL_SECRET =
  process.env.MEETING_INTERNAL_SECRET || process.env.CODECLASS_INTERNAL_SECRET || process.env.JWT_SECRET || '';

let skillCache: { list: Array<{ id: string; name: string }>; exp: number } | null = null;

export function isValidInternalSecret(req: express.Request): boolean {
  if (!INTERNAL_SECRET) return true;
  const headerVal = req.headers['x-meeting-secret'];
  const given = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (!given) return false;
  const a = Buffer.from(INTERNAL_SECRET, 'utf8');
  const b = Buffer.from(String(given), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Push a room / quiz / adaptive quiz snapshot to CodeClass API asynchronously (fail-soft).
 */
export async function pushCodeClassEvent(
  type: 'room:sync' | 'room:deleted' | 'quiz:sync' | 'adaptive:sync',
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (INTERNAL_SECRET) headers['x-meeting-secret'] = INTERNAL_SECRET;
    await fetch(`${CODECLASS_API}/api/meetings/internal/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type, payload }),
      signal: (AbortSignal as any).timeout(4000),
    });
  } catch (err: any) {
    console.warn(`[CodeClassBridge] push ${type} failed:`, err?.message || err);
  }
}

/**
 * Fetch and cache canonical CodeClass skills for AI question tagging.
 */
export async function getCanonicalSkillsForPrompt(): Promise<string> {
  if (skillCache && skillCache.exp > Date.now()) {
    return skillCache.list.slice(0, 35).map((s) => `${s.id} (${s.name})`).join(', ');
  }
  try {
    const headers: Record<string, string> = {};
    if (INTERNAL_SECRET) headers['x-meeting-secret'] = INTERNAL_SECRET;
    const res = await fetch(`${CODECLASS_API}/api/meetings/internal/skills`, {
      headers,
      signal: (AbortSignal as any).timeout(3000),
    });
    if (!res.ok) return '';
    const data: any = await res.json();
    const list = Array.isArray(data?.skills) ? data.skills : [];
    if (list.length > 0) {
      skillCache = { list, exp: Date.now() + 10 * 60_000 };
      return list.slice(0, 35).map((s: any) => `${s.id} (${s.name})`).join(', ');
    }
  } catch {
    // fail-soft
  }
  return '';
}

export function buildRoomSyncPayload(room: Room) {
  const participants = Array.from(room.participants.entries()).map(([socketId, p]) => ({
    participantKey: RoomManager.getParticipantKey(p, socketId),
    ccId: p.ccId || null,
    displayName: p.name || 'Ẩn danh',
    role: p.role || null,
    isConnected: Boolean(p.isConnected),
    joinedAt: p.joinedAt || room.createdAt,
    points: p.points || 0,
    violations: p.violations || 0,
    savedCodeCount: Array.isArray(p.savedCode) ? p.savedCode.length : 0,
  }));

  return {
    roomId: room.id,
    title: room.name,
    courseId: room.courseId || null,
    hostUserId: room.hostUserId || null,
    hostName: room.hostName || '',
    hasPassword: Boolean(room.password),
    isBreakout: Boolean(room.isBreakout),
    parentRoomId: room.parentId || null,
    activeParticipantCount: participants.filter((p) => p.isConnected).length,
    activeQuizTitle: room.activeQuiz?.title || room.activeAdaptive?.title || null,
    examMonitoring: Boolean(room.exam?.monitoring),
    createdAt: room.createdAt,
    participants,
  };
}

export function buildQuizSyncPayload(room: Room, ended = false) {
  const quiz = room.activeQuiz;
  if (!quiz) return null;
  const responses = Array.isArray(room.quizResponses) ? room.quizResponses : [];
  const sorted = [...responses].sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.timeTaken - b.timeTaken,
  );
  const rankMap = new Map<string, number>();
  sorted.forEach((r, idx) => {
    const key = r.participantKey || `sock:${r.userId}`;
    rankMap.set(key, idx + 1);
  });

  const findCcId = (r: any): string | null => {
    if (r.ccId) return r.ccId;
    if (typeof r.participantKey === 'string' && r.participantKey.startsWith('cc:')) {
      return r.participantKey.slice(3);
    }
    const pt = room.participants.get(r.userId);
    return pt?.ccId || null;
  };

  return {
    roomId: room.id,
    roomTitle: room.name,
    courseId: room.courseId || null,
    externalQuizId: String(quiz.id || quiz.createdAt || room.id),
    kind: 'quiz' as const,
    title: String(quiz.title || 'Bài kiểm tra Meeting'),
    startedAt: quiz.createdAt || Date.now(),
    endedAt: ended ? Date.now() : null,
    questions: (Array.isArray(quiz.questions) ? quiz.questions : []).map((q: any, i: number) => ({
      id: String(q.id || `q_${i}`),
      question: String(q.question || ''),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      correctAnswer: Number(q.correctAnswer) || 0,
      explanation: q.explanation ? String(q.explanation) : '',
      difficulty: q.difficulty || 'medium',
      skillId: q.skillId || null,
    })),
    submissions: responses.map((r: any) => {
      const key = r.participantKey || `sock:${r.userId}`;
      return {
        participantKey: key,
        ccId: findCcId(r),
        studentName: r.userName || 'Học viên',
        score: Number(r.score) || 0,
        totalQuestions: Array.isArray(quiz.questions) ? quiz.questions.length : 0,
        timeTaken: Number(r.timeTaken) || 0,
        rank: rankMap.get(key) ?? null,
        completedAt: r.completedAt || Date.now(),
        answers: Array.isArray(r.answers) ? r.answers : [],
      };
    }),
  };
}

export function buildAdaptiveSyncPayload(room: Room, ended = false) {
  const adaptive = room.activeAdaptive;
  if (!adaptive) return null;
  const history = Array.isArray(adaptive.questionHistory) ? adaptive.questionHistory : [];
  if (history.length === 0) return null;

  const questions = history.map((h: any, idx: number) => ({
    id: String(h?.question?.id || `aq_${idx}`),
    question: String(h?.question?.question || ''),
    options: Array.isArray(h?.question?.options) ? h.question.options.map(String) : [],
    correctAnswer: Number(h?.question?.correctAnswer) || 0,
    explanation: h?.question?.explanation ? String(h.question.explanation) : '',
    difficulty: h?.question?.difficulty || 'medium',
    skillId: h?.question?.skillId || null,
  }));

  // Aggregate per-student answers across questionHistory
  const byStudent = new Map<
    string,
    {
      participantKey: string;
      ccId: string | null;
      studentName: string;
      score: number;
      answers: Array<{ questionId: string; selectedOption: number; isCorrect: boolean }>;
    }
  >();

  history.forEach((h: any, qIdx: number) => {
    const qId = String(h?.question?.id || `aq_${qIdx}`);
    for (const r of Array.isArray(h?.results) ? h.results : []) {
      const pt = room.participants.get(r.socketId);
      const pKey = r.participantKey || (pt ? RoomManager.getParticipantKey(pt, r.socketId) : `sock:${r.socketId}`);
      const ccId =
        r.ccId ||
        pt?.ccId ||
        (typeof pKey === 'string' && pKey.startsWith('cc:') ? pKey.slice(3) : null);

      let entry = byStudent.get(pKey);
      if (!entry) {
        entry = {
          participantKey: pKey,
          ccId,
          studentName: r.userName || pt?.name || 'Học viên',
          score: 0,
          answers: [],
        };
        byStudent.set(pKey, entry);
      }
      const isCorrect = Boolean(r.isCorrect);
      if (isCorrect) entry.score++;
      entry.answers.push({
        questionId: qId,
        selectedOption: Number(r.selectedOption ?? -1),
        isCorrect,
      });
    }
  });

  const sorted = Array.from(byStudent.values()).sort((a, b) => b.score - a.score);
  const submissions = sorted.map((s, idx) => ({
    participantKey: s.participantKey,
    ccId: s.ccId,
    studentName: s.studentName,
    score: s.score,
    totalQuestions: questions.length,
    timeTaken: 0,
    rank: idx + 1,
    completedAt: Date.now(),
    answers: s.answers,
  }));

  return {
    roomId: room.id,
    roomTitle: room.name,
    courseId: room.courseId || null,
    externalQuizId: String(adaptive.id || room.id),
    kind: 'adaptive' as const,
    title: String(adaptive.title || 'Adaptive Quiz Meeting'),
    startedAt: adaptive.createdAt || Date.now(),
    endedAt: ended ? Date.now() : null,
    questions,
    submissions,
  };
}
