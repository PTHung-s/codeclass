import { Server, Socket } from 'socket.io';
import { roomManager, RoomManager } from '../room.manager.js';
import {
  buildAdaptiveSyncPayload,
  buildQuizSyncPayload,
  buildRoomSyncPayload,
  pushCodeClassEvent,
} from '../codeclassBridge.js';
import {
  adaptiveQuestionTimers,
  adaptiveTimers,
  applyLpRewards,
  clearAdaptiveQuestionTimer,
  finalizeAdaptiveQuestionIfReady,
  isActiveMember,
  sanitizeQuestionForStudent,
  sanitizeQuizForStudent,
} from './shared.js';

export const registerQuizHandlers = (io: Server, socket: Socket) => {
  // === Normal Quiz Handlers ===
  socket.on('quiz:start', ({ roomId, quiz }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId || !quiz) return;
    const createdAt = quiz.createdAt || Date.now();
    const rawLimit = Number(quiz.timeLimit) || 0;
    const timeLimit = rawLimit > 0 ? Math.min(3600, Math.max(15, Math.round(rawLimit))) : 0;
    const endsAt = timeLimit > 0 ? createdAt + timeLimit * 1000 : null;
    room.activeQuiz = { ...quiz, createdAt, timeLimit: timeLimit || undefined, endsAt };
    room.quizResponses = [];
    roomManager.markDirty();

    socket.emit('quiz:started', { quiz: room.activeQuiz });
    socket.to(roomId).emit('quiz:started', { quiz: sanitizeQuizForStudent(room.activeQuiz) });
    void pushCodeClassEvent('room:sync', buildRoomSyncPayload(room));
    const qp = buildQuizSyncPayload(room, false);
    if (qp) void pushCodeClassEvent('quiz:sync', qp);
  });

  socket.on('quiz:submit', ({ roomId, answers, response }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !room.activeQuiz || !isActiveMember(room, socket)) {
      return cb && cb({ error: 'Không có bài trắc nghiệm đang mở' });
    }
    const participant = room.participants.get(socket.id);
    if (!participant || socket.id === room.hostId) return cb && cb({ error: 'Deny' });

    const participantKey = RoomManager.getParticipantKey(participant, socket.id);
    if (!room.quizResponses) room.quizResponses = [];

    if (room.quizResponses.some((r) => r.participantKey === participantKey)) {
      return cb && cb({ error: 'Bạn đã nộp bài này rồi' });
    }

    const submittedList: any[] = Array.isArray(answers)
      ? answers
      : Array.isArray(response?.answers)
        ? response.answers
        : [];
    const byId = new Map<string, number>();
    submittedList.forEach((a, i) => {
      const key = String(a?.questionId || `q-${i}`);
      if (typeof a?.selectedOption === 'number') byId.set(key, a.selectedOption);
    });

    const questions: any[] = Array.isArray(room.activeQuiz.questions) ? room.activeQuiz.questions : [];
    let score = 0;
    const gradedAnswers = questions.map((q, i) => {
      const qKey = String(q.id || `q-${i}`);
      const selected = byId.has(qKey) ? byId.get(qKey)! : -1;
      const isCorrect = selected === Number(q.correctAnswer);
      if (isCorrect) score++;
      return { questionId: q.id || qKey, selectedOption: selected, isCorrect };
    });

    const timeTaken = Math.max(
      1,
      Math.round((Date.now() - (room.activeQuiz.createdAt || Date.now())) / 1000),
    );
    const stored = {
      participantKey,
      ccId: participant.ccId || null,
      userId: socket.id,
      userName: participant.name,
      quizId: room.activeQuiz.id,
      answers: gradedAnswers,
      score,
      timeTaken,
      completedAt: Date.now(),
    };
    room.quizResponses.push(stored);
    roomManager.markDirty();
    const qp = buildQuizSyncPayload(room, false);
    if (qp) void pushCodeClassEvent('quiz:sync', qp);

    const { participantKey: _pk, ccId: _cc, ...publicResponse } = stored;
    if (room.hostId) {
      io.to(room.hostId).emit('quiz:submitted', { response: publicResponse });
    }

    const sorted = [...room.quizResponses].sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.timeTaken - b.timeTaken,
    );
    const rank = sorted.findIndex((r) => r.participantKey === participantKey) + 1;
    const review = questions.map((q) => ({
      id: q.id,
      correctAnswer: Number(q.correctAnswer),
      explanation: q.explanation,
    }));

    const resultPayload = {
      ok: true,
      response: publicResponse,
      rank,
      totalSubmissions: sorted.length,
      review,
    };
    socket.emit('quiz:submission-result', resultPayload);
    cb && cb(resultPayload);
  });

  /** Host bổ sung thêm câu hỏi (từ AI hoặc thủ công) ngay trong lúc bài kiểm tra đang diễn ra */
  socket.on('quiz:append-questions', ({ roomId, questions, extraSeconds }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return cb && cb({ error: 'Chỉ host mới thêm được câu hỏi' });
    if (!room.activeQuiz) return cb && cb({ error: 'Không có bài kiểm tra đang mở' });
    if (!Array.isArray(questions) || questions.length === 0) {
      return cb && cb({ error: 'Danh sách câu hỏi bổ sung trống' });
    }

    const existingIds = new Set<string>(
      (room.activeQuiz.questions || []).map((q: any) => String(q?.id || '')),
    );
    const cleaned: any[] = [];
    for (const raw of questions.slice(0, 15)) {
      if (!raw || typeof raw.question !== 'string' || !raw.question.trim()) continue;
      if (!Array.isArray(raw.options) || raw.options.length < 2) continue;
      const ca = Number(raw.correctAnswer);
      let qId = String(raw.id || '').trim() || `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      while (existingIds.has(qId)) {
        qId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      }
      existingIds.add(qId);
      cleaned.push({
        id: qId,
        question: raw.question.trim(),
        options: raw.options.slice(0, 4).map((o: any) => String(o ?? '')),
        correctAnswer: Number.isInteger(ca) && ca >= 0 && ca < 4 ? ca : 0,
        explanation: typeof raw.explanation === 'string' ? raw.explanation : '',
        ...(raw.difficulty ? { difficulty: raw.difficulty } : {}),
        ...(typeof raw.skillId === 'string' && raw.skillId.trim() ? { skillId: raw.skillId.trim() } : {}),
        appendedAt: Date.now(),
      });
    }

    if (cleaned.length === 0) {
      return cb && cb({ error: 'Không có câu hỏi hợp lệ để thêm' });
    }

    room.activeQuiz.questions = [...(room.activeQuiz.questions || []), ...cleaned];

    const addSec = Number(extraSeconds) > 0 ? Math.min(1800, Math.round(Number(extraSeconds))) : 0;
    if (addSec > 0 && room.activeQuiz.endsAt) {
      room.activeQuiz.endsAt = Math.max(Date.now(), Number(room.activeQuiz.endsAt)) + addSec * 1000;
      room.activeQuiz.timeLimit = (Number(room.activeQuiz.timeLimit) || 0) + addSec;
    }
    roomManager.markDirty();

    const meta = {
      totalQuestions: room.activeQuiz.questions.length,
      timeLimit: room.activeQuiz.timeLimit,
      endsAt: room.activeQuiz.endsAt ?? null,
    };
    socket.emit('quiz:questions-appended', { questions: cleaned, ...meta });
    socket.to(roomId).emit('quiz:questions-appended', {
      questions: cleaned.map((q) => ({ ...sanitizeQuestionForStudent(q), appendedAt: q.appendedAt })),
      ...meta,
    });
    const qp = buildQuizSyncPayload(room, false);
    if (qp) void pushCodeClassEvent('quiz:sync', qp);
    cb && cb({ ok: true, added: cleaned.length, ...meta });
  });

  /** Host cộng thêm thời gian làm bài khi quiz đang diễn ra */
  socket.on('quiz:extend-time', ({ roomId, extraSeconds }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return cb && cb({ error: 'Chỉ host mới gia hạn được thời gian' });
    if (!room.activeQuiz) return cb && cb({ error: 'Không có bài kiểm tra đang mở' });
    const addSec = Math.min(1800, Math.max(30, Math.round(Number(extraSeconds) || 0)));
    const baseEnd = room.activeQuiz.endsAt ? Math.max(Date.now(), Number(room.activeQuiz.endsAt)) : Date.now();
    room.activeQuiz.endsAt = baseEnd + addSec * 1000;
    room.activeQuiz.timeLimit = (Number(room.activeQuiz.timeLimit) || 0) + addSec;
    roomManager.markDirty();

    const payload = {
      timeLimit: room.activeQuiz.timeLimit,
      endsAt: room.activeQuiz.endsAt,
      addedSeconds: addSec,
    };
    io.to(roomId).emit('quiz:time-updated', payload);
    cb && cb({ ok: true, ...payload });
  });

  /**
   * Học sinh ĐÃ NỘP BÀI trước đó làm bổ sung RIÊNG các câu hỏi host mới thêm sau.
   * Chống gian lận: TUYỆT ĐỐI bỏ qua mọi questionId đã chấm ở lần nộp trước.
   */
  socket.on('quiz:submit-extra', ({ roomId, answers }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !room.activeQuiz || !isActiveMember(room, socket)) {
      return cb && cb({ error: 'Không có bài trắc nghiệm đang mở' });
    }
    const participant = room.participants.get(socket.id);
    if (!participant || socket.id === room.hostId) return cb && cb({ error: 'Deny' });

    const participantKey = RoomManager.getParticipantKey(participant, socket.id);
    const stored = (room.quizResponses || []).find((r) => r.participantKey === participantKey);
    if (!stored) {
      return cb && cb({ error: 'Bạn chưa nộp lần đầu — hãy nộp toàn bài' });
    }

    const alreadyIds = new Set<string>((stored.answers || []).map((a: any) => String(a.questionId)));
    const submittedList: any[] = Array.isArray(answers) ? answers : [];
    const byId = new Map<string, number>();
    submittedList.forEach((a) => {
      if (a?.questionId && typeof a?.selectedOption === 'number') {
        byId.set(String(a.questionId), a.selectedOption);
      }
    });

    const allQuestions: any[] = Array.isArray(room.activeQuiz.questions) ? room.activeQuiz.questions : [];
    const pendingQuestions = allQuestions.filter((q, i) => !alreadyIds.has(String(q.id || `q-${i}`)));
    if (pendingQuestions.length === 0) {
      return cb && cb({ error: 'Không còn câu hỏi bổ sung nào chưa làm' });
    }

    let addedScore = 0;
    const newGraded = pendingQuestions.map((q) => {
      const qKey = String(q.id);
      const selected = byId.has(qKey) ? byId.get(qKey)! : -1;
      const isCorrect = selected === Number(q.correctAnswer);
      if (isCorrect) addedScore++;
      return { questionId: qKey, selectedOption: selected, isCorrect };
    });

    stored.answers = [...(stored.answers || []), ...newGraded];
    stored.score = (Number(stored.score) || 0) + addedScore;
    stored.completedAt = Date.now();
    stored.userId = socket.id;
    stored.ccId = stored.ccId || participant.ccId || null;
    roomManager.markDirty();
    const qp = buildQuizSyncPayload(room, false);
    if (qp) void pushCodeClassEvent('quiz:sync', qp);

    const { participantKey: _pk, ccId: _cc, ...publicResponse } = stored;
    if (room.hostId) {
      io.to(room.hostId).emit('quiz:response-updated', { response: publicResponse });
    }

    const sorted = [...(room.quizResponses || [])].sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.timeTaken - b.timeTaken,
    );
    const rank = sorted.findIndex((r) => r.participantKey === participantKey) + 1;
    const answeredIdSet = new Set<string>(stored.answers.map((a: any) => String(a.questionId)));
    const review = allQuestions
      .filter((q) => answeredIdSet.has(String(q.id)))
      .map((q) => ({
        id: q.id,
        correctAnswer: Number(q.correctAnswer),
        explanation: q.explanation,
      }));

    const resultPayload = {
      ok: true,
      response: publicResponse,
      rank,
      totalSubmissions: sorted.length,
      review,
    };
    socket.emit('quiz:submission-result', resultPayload);
    cb && cb(resultPayload);
  });

  socket.on('quiz:end', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return;

    const connectedStudentKeys = Array.from(room.participants.entries())
      .filter(([id, p]) => p.isConnected && id !== room.hostId)
      .map(([id, p]) => RoomManager.getParticipantKey(p, id));

    if (room.quizResponses && room.quizResponses.length > 0) {
      const sortedResults = [...room.quizResponses].sort((a, b) =>
        b.score !== a.score ? b.score - a.score : a.timeTaken - b.timeTaken,
      );
      const rankedKeys = sortedResults.map((r) => {
        if (r.participantKey) return r.participantKey;
        const p = room.participants.get(r.userId);
        return p ? RoomManager.getParticipantKey(p, r.userId) : `sock:${r.userId}`;
      });
      applyLpRewards(room, rankedKeys, connectedStudentKeys);

      io.to(roomId).emit('peer:update-points', {
        points: Array.from(room.participants.entries()).map(([id, p]) => ({
          socketId: id,
          points: p.points || 0,
        })),
      });
    }

    const endQuizPayload = buildQuizSyncPayload(room, true);
    if (endQuizPayload) void pushCodeClassEvent('quiz:sync', endQuizPayload);

    room.activeQuiz = null;
    room.quizResponses = [];
    roomManager.markDirty();
    io.to(roomId).emit('quiz:ended');
    void pushCodeClassEvent('room:sync', buildRoomSyncPayload(room));
  });

  // === Adaptive Quiz Handlers ===
  socket.on('adaptive:start', ({ roomId, title }, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return cb && cb({ error: 'Deny' });

    room.activeAdaptive = {
      id: Date.now().toString(),
      title,
      status: 'active',
      createdAt: Date.now(),
      questionIndex: 0,
      questionHistory: [],
      responses: new Map(),
      scores: new Map(),
    };
    roomManager.markDirty();

    io.to(roomId).emit('adaptive:started', {
      session: { id: room.activeAdaptive.id, title, status: 'active', createdAt: room.activeAdaptive.createdAt },
    });
    cb && cb({ ok: true });
  });

  socket.on('adaptive:push-question', ({ roomId, question, timeLimit }: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId || !room.activeAdaptive || !question) return;

    const existingTimer = adaptiveTimers.get(roomId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      adaptiveTimers.delete(roomId);
    }
    clearAdaptiveQuestionTimer(roomId);

    const sec = Number(timeLimit) > 0 ? Math.min(300, Math.max(1, Number(timeLimit))) : 0;
    const endsAt = sec > 0 ? Date.now() + sec * 1000 : null;

    room.activeAdaptive.currentQuestion = question;
    room.activeAdaptive.questionEndsAt = endsAt;
    room.activeAdaptive.questionTimeLimit = sec || undefined;
    room.activeAdaptive.questionIndex++;
    room.activeAdaptive.responses = new Map();
    roomManager.markDirty();

    if (sec > 0) {
      const qTimer = setTimeout(() => {
        adaptiveQuestionTimers.delete(roomId);
        finalizeAdaptiveQuestionIfReady(io, roomId, true);
      }, sec * 1000);
      (qTimer as unknown as { unref?: () => void }).unref?.();
      adaptiveQuestionTimers.set(roomId, qTimer);
    }

    socket.emit('adaptive:question', {
      question,
      questionIndex: room.activeAdaptive.questionIndex,
      endsAt,
    });
    socket.to(roomId).emit('adaptive:question', {
      question: sanitizeQuestionForStudent(question),
      questionIndex: room.activeAdaptive.questionIndex,
      endsAt,
    });
  });

  /** Host chốt câu ngay lập tức (tránh treo lớp khi có học sinh AFK/không bấm) */
  socket.on('adaptive:force-reveal', ({ roomId }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return cb && cb({ error: 'Chỉ host mới chốt câu được' });
    if (!room.activeAdaptive || !room.activeAdaptive.currentQuestion) {
      return cb && cb({ error: 'Không có câu hỏi đang mở' });
    }
    const done = finalizeAdaptiveQuestionIfReady(io, roomId, true);
    cb && cb({ ok: done });
  });

  socket.on('adaptive:answer', ({ roomId, selectedOption }) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room || !room.activeAdaptive || !room.activeAdaptive.currentQuestion) return;
    if (socket.id === room.hostId) return;
    const participant = room.participants.get(socket.id);
    if (!participant) return;

    const q = room.activeAdaptive.currentQuestion;
    if (!Number.isInteger(selectedOption) || selectedOption < 0 || selectedOption >= (q.options?.length || 4)) {
      return;
    }

    const participantKey = RoomManager.getParticipantKey(participant, socket.id);
    if (room.activeAdaptive.responses.has(participantKey)) return;

    const isCorrect = selectedOption === q.correctAnswer;
    room.activeAdaptive.responses.set(participantKey, {
      selectedOption,
      isCorrect,
      userName: participant.name,
      socketId: socket.id,
    });

    const prev = room.activeAdaptive.scores.get(participantKey) || {
      score: 0,
      userName: participant.name,
      socketId: socket.id,
    };
    room.activeAdaptive.scores.set(participantKey, {
      score: prev.score + (isCorrect ? 1 : 0),
      userName: participant.name,
      socketId: socket.id,
    });
    roomManager.markDirty();

    socket.emit('adaptive:answer-confirmed', {
      isCorrect,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation || '',
    });

    finalizeAdaptiveQuestionIfReady(io, roomId);
  });

  socket.on('adaptive:skip-countdown', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return;
    const timer = adaptiveTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      adaptiveTimers.delete(roomId);
    }
    io.to(roomId).emit('adaptive:countdown', { seconds: 0 });
  });

  socket.on('adaptive:end', ({ roomId }, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId || !room.activeAdaptive) return cb && cb({ error: 'Deny' });

    const connectedStudents = Array.from(room.participants.entries())
      .filter(([id, p]) => p.isConnected && id !== room.hostId);

    const rankingsWithKey = connectedStudents
      .map(([id, p]) => {
        const key = RoomManager.getParticipantKey(p, id);
        return {
          key,
          socketId: id,
          userName: p.name,
          score: room.activeAdaptive!.scores.get(key)?.score || 0,
        };
      })
      .sort((a, b) => b.score - a.score);

    applyLpRewards(
      room,
      rankingsWithKey.map((r) => r.key),
      connectedStudents.map(([id, p]) => RoomManager.getParticipantKey(p, id)),
    );

    const rankings = rankingsWithKey.map(({ socketId, userName, score }) => ({ socketId, userName, score }));

    io.to(roomId).emit('peer:update-points', {
      points: Array.from(room.participants.entries()).map(([id, p]) => ({
        socketId: id,
        points: p.points || 0,
      })),
    });

    const endTimer = adaptiveTimers.get(roomId);
    if (endTimer) {
      clearTimeout(endTimer);
      adaptiveTimers.delete(roomId);
    }
    clearAdaptiveQuestionTimer(roomId);

    io.to(roomId).emit('adaptive:ended', { rankings });
    const adaptiveEndPayload = buildAdaptiveSyncPayload(room, true);
    if (adaptiveEndPayload) void pushCodeClassEvent('adaptive:sync', adaptiveEndPayload);
    room.activeAdaptive = null;
    roomManager.markDirty();
    void pushCodeClassEvent('room:sync', buildRoomSyncPayload(room));
    cb && cb({ ok: true });
  });
};
