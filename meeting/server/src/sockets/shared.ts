import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { roomManager, RoomManager } from '../room.manager.js';
import { Participant, Room } from '../types.js';
import { safeFileName } from '../zip.js';
import {
  buildAdaptiveSyncPayload,
  buildRoomSyncPayload,
  pushCodeClassEvent,
} from '../codeclassBridge.js';

export const UPLOADS_ROOT = path.join(process.cwd(), 'data', 'uploads');

// Shared timers & state maps
export const musicTimers: Map<string, NodeJS.Timeout> = new Map();
export const advancingMusicRooms: Set<string> = new Set();
export const adaptiveTimers: Map<string, NodeJS.Timeout> = new Map();
export const adaptiveQuestionTimers: Map<string, NodeJS.Timeout> = new Map();
export const breakoutTimers: Map<string, NodeJS.Timeout> = new Map();
export const breakoutGraceTimers: Map<string, NodeJS.Timeout> = new Map();
export const lastHelpAt: Map<string, number> = new Map();
export const lastReactionAt: Map<string, number> = new Map();

/**
 * Mint token HMAC ngắn hạn để client trình lên SFU (mediasoup-server) khi join.
 * SFU dùng chung SFU_SHARED_SECRET để verify → chặn người lạ nghe lén phòng.
 */
const SFU_SECRET = process.env.SFU_SHARED_SECRET || '';
export const mintSfuToken = (roomId: string, clientPeerId: string, name: string): string => {
  if (!SFU_SECRET) return '';
  const payload = { roomId, cid: clientPeerId, name, exp: Date.now() + 12 * 3600 * 1000 };
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SFU_SECRET).update(b).digest('base64url');
  return `${b}.${sig}`;
};

const SFU_ADMIN_URL = (process.env.SFU_ADMIN_URL || '').replace(/\/$/, '');
const SFU_ADMIN_TOKEN = process.env.SFU_ADMIN_TOKEN || '';

/** Báo SFU đóng media room (fire-and-forget) khi phòng bị xóa. */
export async function closeSfuRoom(roomId: string): Promise<void> {
  if (!SFU_ADMIN_URL) return;
  try {
    await fetch(`${SFU_ADMIN_URL}/api/rooms/${encodeURIComponent(roomId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SFU_ADMIN_TOKEN}` },
    });
  } catch (e) {
    console.warn('[closeSfuRoom] failed:', (e as Error).message);
  }
}

/** Đặt nhóm âm thanh trên SFU (null = cả lớp). group = clientPeerId (= signaling socket.id). */
export async function setSfuRouting(roomId: string, group: string[] | null): Promise<void> {
  if (!SFU_ADMIN_URL) return;
  try {
    await fetch(`${SFU_ADMIN_URL}/api/routing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SFU_ADMIN_TOKEN}` },
      body: JSON.stringify({ roomId, group }),
    });
  } catch (e) {
    console.warn('[setSfuRouting] failed:', (e as Error).message);
  }
}

/** Đẩy luật định tuyến âm thanh ("Cả lớp" hoặc bất đối xứng "Nghe host") xuống SFU. */
export async function syncSfuAudioRouting(room: Room): Promise<void> {
  if (!SFU_ADMIN_URL) return;
  try {
    const mode = room.audioMode || 'all';
    const body =
      mode === 'all' || !room.hostId
        ? { roomId: room.id, audioMode: 'all', group: null }
        : {
            roomId: room.id,
            audioMode: 'selected',
            hostId: room.hostId,
            hearHost: room.hearHost || [],
            hostFocus: !!room.hostFocus,
          };
    await fetch(`${SFU_ADMIN_URL}/api/routing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SFU_ADMIN_TOKEN}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn('[syncSfuAudioRouting] failed:', (e as Error).message);
  }
}

/** Đẩy chính sách riêng tư màn hình (giám sát thi) xuống SFU: khi bật monitoring, học sinh chỉ consume màn hình Host hoặc màn hình Host ghim. */
export async function syncSfuExamPolicy(room: Room): Promise<void> {
  if (!SFU_ADMIN_URL) return;
  try {
    await fetch(`${SFU_ADMIN_URL}/api/exam-policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SFU_ADMIN_TOKEN}` },
      body: JSON.stringify({
        roomId: room.id,
        monitoring: !!room.exam?.monitoring,
        hostId: room.hostId || null,
        pinnedScreenId: room.exam?.pinnedScreenId || null,
      }),
    });
  } catch (e) {
    console.warn('[syncSfuExamPolicy] failed:', (e as Error).message);
  }
}

export const emitAudioState = (io: Server, room: Room): void => {
  io.to(room.id).emit('audio:allowed', {
    mode: room.audioMode || 'all',
    allowed: room.hearHost || [],
    hostFocus: !!room.hostFocus,
    groups: room.audioGroups || [],
    hostId: room.hostId,
  });
};

export const buildBreakoutSummary = (mainRoom: Room) => {
  const rooms = (mainRoom.breakouts || [])
    .map((bid) => {
      const b = roomManager.getRoom(bid);
      if (!b) return null;
      const size = Array.from(b.participants.values()).filter((p) => p.isConnected).length;
      return { id: b.id, name: b.name, size };
    })
    .filter((x): x is { id: string; name: string; size: number } => Boolean(x));

  const mainSize = Array.from(mainRoom.participants.entries()).filter(
    ([id, p]) => p.isConnected && id !== mainRoom.hostId,
  ).length;

  return {
    rooms,
    allowSelfSelect: !!mainRoom.breakoutAllowSelfSelect,
    endsAt: mainRoom.breakoutEndsAt || null,
    closingAt: mainRoom.breakoutClosingAt || null,
    mainSize,
  };
};

export const broadcastBreakoutSummary = (io: Server, mainRoomId: string): void => {
  const main = roomManager.getRoom(mainRoomId);
  if (!main) return;
  const summary = buildBreakoutSummary(main);
  io.to(mainRoomId).emit('breakout:summary', summary);
  for (const bid of main.breakouts || []) {
    io.to(bid).emit('breakout:summary', summary);
  }
};

export const sanitizePublicPeer = (socketId: string, p: Participant) => ({
  socketId,
  name: p.name,
  role: p.role || null,
  avatar: p.avatar || null,
  isMuted: !!p.isMuted,
  isCameraOff: !!p.isCameraOff,
  isActive: !!p.isActive,
  isConnected: !!p.isConnected,
  isHandRaised: !!p.isHandRaised,
  points: p.points || 0,
});

export const sanitizeHostPeer = (socketId: string, p: Participant) => ({
  ...sanitizePublicPeer(socketId, p),
  code: p.code,
  language: p.language,
  violations: p.violations || 0,
  pasteCount: p.pasteCount || 0,
  copyCount: p.copyCount || 0,
  violationHistory: p.violationHistory || [],
  activityStats: p.activityStats || [],
});

export const sanitizeQuestionForStudent = (q: any) => {
  if (!q) return q;
  return {
    id: q.id,
    question: q.question,
    options: Array.isArray(q.options) ? q.options : [],
  };
};

export const sanitizeQuizForStudent = (quiz: any) => {
  if (!quiz) return null;
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    timeLimit: quiz.timeLimit,
    endsAt: quiz.endsAt ?? null,
    createdAt: quiz.createdAt,
    questions: Array.isArray(quiz.questions)
      ? quiz.questions.map(sanitizeQuestionForStudent)
      : [],
  };
};

export const commentPrefixFor = (lang?: { name?: string } | null): string => {
  const n = (lang?.name || 'python').toLowerCase();
  return n === 'python' || n === 'ruby' ? '#' : '//';
};

export const findParticipantByKey = (
  room: Room,
  participantKey: string,
): [string, Participant] | undefined => {
  for (const [id, p] of room.participants.entries()) {
    if (RoomManager.getParticipantKey(p, id) === participantKey) {
      return [id, p];
    }
  }
  return undefined;
};

export const isActiveMember = (room: Room | undefined, s: Socket): boolean =>
  Boolean(room && s.rooms.has(room.id) && room.participants.get(s.id)?.isConnected);

/**
 * Cộng/trừ LP công bằng sau Quiz / Adaptive:
 * - Top 1: +3, Top 2: +2, Top 3: +1.
 * - Phạt -1 LP áp cho học sinh online KHÔNG nộp bài (nếu có);
 *   nếu tất cả đều nộp và có >= 4 thí sinh, chỉ phạt hạng cuối (không đè Top 2/Top 3!).
 */
export const applyLpRewards = (
  room: Room,
  rankedKeys: string[],
  connectedStudentKeys: string[],
) => {
  const submittedSet = new Set(rankedKeys);
  rankedKeys.forEach((key, index) => {
    const found = findParticipantByKey(room, key);
    if (!found) return;
    const [, p] = found;
    let delta = 0;
    if (index === 0) delta = 3;
    else if (index === 1) delta = 2;
    else if (index === 2) delta = 1;
    else if (index === rankedKeys.length - 1 && rankedKeys.length >= 4) {
      delta = -1;
    }
    if (delta !== 0) {
      p.points = (p.points || 0) + delta;
    }
  });

  // Học sinh đang online nhưng không tham gia trả lời → -1 LP
  for (const key of connectedStudentKeys) {
    if (!submittedSet.has(key)) {
      const found = findParticipantByKey(room, key);
      if (found) {
        found[1].points = (found[1].points || 0) - 1;
      }
    }
  }
  roomManager.markDirty();
};

export const removeUploadedFileIfAny = (dataPath?: string) => {
  if (!dataPath || typeof dataPath !== 'string' || !dataPath.startsWith('/uploads/')) return;
  const rel = dataPath.slice('/uploads/'.length);
  const full = path.resolve(UPLOADS_ROOT, rel);
  if (!full.startsWith(path.resolve(UPLOADS_ROOT))) return;
  fs.promises.unlink(full).catch(() => {});
};

export const removeRoomUploadsDir = (roomId: string) => {
  const safeRoom = safeFileName(roomId);
  const dir = path.resolve(UPLOADS_ROOT, safeRoom);
  if (!dir.startsWith(path.resolve(UPLOADS_ROOT))) return;
  fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
};

export const clearAdaptiveQuestionTimer = (roomId: string): void => {
  const qt = adaptiveQuestionTimers.get(roomId);
  if (qt) {
    clearTimeout(qt);
    adaptiveQuestionTimers.delete(roomId);
  }
};

/**
 * Kiểm tra Adaptive Quiz đã đủ câu trả lời của học sinh online chưa; nếu đủ (hoặc force=true
 * khi host bấm Chốt câu ngay / hết giờ câu hỏi) → tính phân bố A/B/C/D và chốt câu.
 */
export const finalizeAdaptiveQuestionIfReady = (
  io: Server,
  roomId: string,
  force = false,
): boolean => {
  const room = roomManager.getRoom(roomId);
  if (!room || !room.activeAdaptive || !room.activeAdaptive.currentQuestion) return false;

  const q = room.activeAdaptive.currentQuestion;
  const connectedStudents = Array.from(room.participants.entries())
    .filter(([id, p]) => p.isConnected && id !== room.hostId);
  const totalStudents = connectedStudents.length;

  const answeredCount = connectedStudents.filter(([id, p]) => {
    const key = RoomManager.getParticipantKey(p, id);
    return room.activeAdaptive!.responses.has(key);
  }).length;

  if (room.hostId) {
    io.to(room.hostId).emit('adaptive:answer-received', {
      count: answeredCount,
      total: totalStudents,
    });
  }

  if (force || (totalStudents > 0 && answeredCount >= totalStudents)) {
    clearAdaptiveQuestionTimer(roomId);
    const optCount = Math.max(4, Array.isArray(q.options) ? q.options.length : 4);
    const distribution = Array.from({ length: optCount }, () => 0);

    const results = connectedStudents.map(([id, p]) => {
      const key = RoomManager.getParticipantKey(p, id);
      const resp = room.activeAdaptive!.responses.get(key);
      const sel = resp?.selectedOption ?? -1;
      if (sel >= 0 && sel < distribution.length) distribution[sel]++;
      return {
        socketId: id,
        userName: p.name,
        selectedOption: sel,
        isCorrect: resp?.isCorrect ?? false,
      };
    });

    const questionResult = {
      question: q, // lúc này mới công bố đáp án + giải thích
      results,
      correctCount: results.filter((r) => r.isCorrect).length,
      totalCount: results.length,
      distribution,
      forced: force,
    };

    room.activeAdaptive.questionHistory.push(questionResult);

    const scores = connectedStudents.map(([id, p]) => {
      const key = RoomManager.getParticipantKey(p, id);
      const entry = room.activeAdaptive!.scores.get(key);
      return {
        socketId: id,
        userName: p.name,
        score: entry?.score || 0,
      };
    });

    room.activeAdaptive.currentQuestion = undefined;
    room.activeAdaptive.questionEndsAt = null;
    roomManager.markDirty();

    io.to(roomId).emit('adaptive:question-stats', { questionResult, scores });

    const adaptiveSync = buildAdaptiveSyncPayload(room, false);
    if (adaptiveSync) void pushCodeClassEvent('adaptive:sync', adaptiveSync);

    const existingTimer = adaptiveTimers.get(roomId);
    if (existingTimer) clearTimeout(existingTimer);

    io.to(roomId).emit('adaptive:countdown', { seconds: 15 });

    const timer = setTimeout(() => {
      adaptiveTimers.delete(roomId);
      if (room.activeAdaptive && !room.activeAdaptive.currentQuestion && room.hostId) {
        io.to(room.hostId).emit('adaptive:auto-next');
      }
    }, 15000);
    (timer as unknown as { unref?: () => void }).unref?.();
    adaptiveTimers.set(roomId, timer);
    return true;
  }
  return false;
};

/** Dọn dẹp thống nhất khi thành viên chủ động rời phòng hoặc rớt kết nối. */
export const handleParticipantDeparture = (
  io: Server,
  roomId: string,
  socketId: string,
  handoff: boolean,
): void => {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  const prevHost = room.hostId;
  roomManager.removeParticipant(roomId, socketId, handoff);

  let audioChanged = false;
  if (!handoff) {
    if (Array.isArray(room.hearHost) && room.hearHost.includes(socketId)) {
      room.hearHost = room.hearHost.filter((id) => id !== socketId);
      audioChanged = true;
    }
    if (Array.isArray(room.audioGroups)) {
      let grpChanged = false;
      room.audioGroups.forEach((g) => {
        if (Array.isArray(g.memberIds) && g.memberIds.includes(socketId)) {
          g.memberIds = g.memberIds.filter((id) => id !== socketId);
          grpChanged = true;
        }
      });
      if (grpChanged) audioChanged = true;
    }
    if (audioChanged) emitAudioState(io, room);
  }

  let examChanged = false;
  if (room.exam?.shareStatus && socketId in room.exam.shareStatus) {
    delete room.exam.shareStatus[socketId];
    roomManager.markDirty();
  }

  if (room.exam?.pinnedScreenId === socketId) {
    room.exam.pinnedScreenId = null;
    examChanged = true;
    io.to(roomId).emit('exam:pinnedScreen', { targetSocketId: null });
    io.to(roomId).emit('exam:state', {
      monitoring: !!room.exam.monitoring,
      requireShare: !!room.exam.requireShare,
      pinnedScreenId: null,
      hostId: room.hostId,
    });
  }

  if (room.hostId && room.hostId !== socketId) {
    io.to(room.hostId).emit('exam:shareStatus', { socketId, sharing: false, left: true });
  }

  if (prevHost !== room.hostId) {
    io.to(roomId).emit('room:hostChanged', { hostId: room.hostId });
    audioChanged = true;
    examChanged = true;
  }

  if (audioChanged) {
    void syncSfuAudioRouting(room);
  }
  if (examChanged) {
    void syncSfuExamPolicy(room);
  }

  if (room.isBreakout && room.parentId) {
    broadcastBreakoutSummary(io, room.parentId);
  } else if (room.breakouts && room.breakouts.length > 0) {
    broadcastBreakoutSummary(io, room.id);
  }

  if (socketId === prevHost) {
    const musicTimer = musicTimers.get(roomId);
    if (musicTimer) {
      clearTimeout(musicTimer);
      musicTimers.delete(roomId);
    }
    const adaptiveTimer = adaptiveTimers.get(roomId);
    if (adaptiveTimer) {
      clearTimeout(adaptiveTimer);
      adaptiveTimers.delete(roomId);
    }
    clearAdaptiveQuestionTimer(roomId);
  }

  lastHelpAt.delete(socketId);
  lastReactionAt.delete(socketId);
  void pushCodeClassEvent('room:sync', buildRoomSyncPayload(room));
  finalizeAdaptiveQuestionIfReady(io, roomId);
};
