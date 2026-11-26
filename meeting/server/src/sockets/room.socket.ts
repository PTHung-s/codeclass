import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import { roomManager } from '../room.manager.js';
import { Room } from '../types.js';
import { buildRoomSyncPayload, pushCodeClassEvent } from '../codeclassBridge.js';
import {
  adaptiveTimers,
  breakoutGraceTimers,
  breakoutTimers,
  broadcastBreakoutSummary,
  buildBreakoutSummary,
  clearAdaptiveQuestionTimer,
  closeSfuRoom,
  emitAudioState,
  findParticipantByKey,
  handleParticipantDeparture,
  isActiveMember,
  lastReactionAt,
  mintSfuToken,
  musicTimers,
  removeRoomUploadsDir,
  sanitizeHostPeer,
  sanitizePublicPeer,
  sanitizeQuestionForStudent,
  sanitizeQuizForStudent,
  syncSfuAudioRouting,
  syncSfuExamPolicy,
} from './shared.js';

export const registerRoomHandlers = (io: Server, socket: Socket) => {
  socket.on('room:list', () => {
    socket.emit('room:list', roomManager.listRooms());
  });

  socket.on('room:join', async ({ roomId, name, password, token, sessionToken, hostSecret }, cb) => {
    const ccUser = await ((globalThis as any).verifyCodeClassToken
      ? (globalThis as any).verifyCodeClassToken(token)
      : Promise.resolve(null));
    const isTeacher = Boolean(ccUser && (ccUser.role === 'teacher' || ccUser.role === 'admin'));

    const room = roomManager.getRoom(roomId);
    if (!room) {
      return cb && cb({ error: 'Phòng không tồn tại' });
    }

    // Chuẩn hóa tên + sessionToken TRƯỚC khi kiểm tra tư cách thành viên breakout
    const resolvedName = (typeof name === 'string' && name.trim()) || (ccUser && ccUser.name) || 'Ẩn danh';
    const effectiveSessionToken =
      typeof sessionToken === 'string' && sessionToken.trim().length >= 16
        ? sessionToken.trim().slice(0, 64)
        : crypto.randomBytes(24).toString('hex');
    const participantKey = ccUser ? `cc:${ccUser.id}` : `anon:${effectiveSessionToken}`;

    // Đang ở phòng nhóm thuộc lớp này → về lớp chính không cần nhập lại mật khẩu
    let returningFromBreakout = false;
    if (!room.isBreakout) {
      for (const bid of room.breakouts || []) {
        const b = roomManager.getRoom(bid);
        if (!b) continue;
        if (b.participants.get(socket.id)?.isConnected || findParticipantByKey(b, participantKey)) {
          returningFromBreakout = true;
          break;
        }
      }
    }

    const validRoomSecret = roomManager.isValidHostSecret(room, hostSecret);

    // Phòng breakout: chỉ thành viên lớp gốc / host / giáo viên mới được vào
    if (room.isBreakout) {
      const mainRoom = roomManager.getRoom(room.parentId || '');
      const validMainSecret = mainRoom ? roomManager.isValidHostSecret(mainRoom, hostSecret) : false;
      const isMember =
        !!mainRoom &&
        (mainRoom.participants.has(socket.id) ||
          !!findParticipantByKey(mainRoom, participantKey) ||
          isTeacher ||
          validMainSecret ||
          validRoomSecret);
      if (!isMember) {
        return cb && cb({ error: 'Chỉ thành viên của lớp này mới vào được phòng nhóm' });
      }
    } else if (room.password && !returningFromBreakout && !validRoomSecret && room.password !== (password || '')) {
      return cb && cb({ error: 'Sai mật khẩu phòng' });
    }

    // Kiểm tra reconnect THEO ĐỊNH DANH THẬT (ccId hoặc sessionToken)
    const oldSocketId = Array.from(room.participants.entries()).find(([_, p]) =>
      ccUser ? p.ccId === ccUser.id : p.sessionToken === effectiveSessionToken,
    )?.[0];

    if (oldSocketId && oldSocketId !== socket.id) {
      console.log(`[Server] User ${resolvedName} reconnected. Replacing socket ${oldSocketId} with ${socket.id}`);
      const oldSock = io.sockets.sockets.get(oldSocketId);
      if (oldSock) {
        await oldSock.leave(roomId);
      }
      if (Array.isArray(room.hearHost) && room.hearHost.includes(oldSocketId)) {
        room.hearHost = room.hearHost.map((id) => (id === oldSocketId ? socket.id : id));
      }
      if (Array.isArray(room.audioGroups)) {
        room.audioGroups.forEach((g) => {
          if (Array.isArray(g.memberIds) && g.memberIds.includes(oldSocketId)) {
            g.memberIds = Array.from(new Set(g.memberIds.map((id) => (id === oldSocketId ? socket.id : id))));
          }
        });
      }
      let pinnedMigrated = false;
      if (room.exam?.shareStatus && oldSocketId in room.exam.shareStatus) {
        room.exam.shareStatus[socket.id] = room.exam.shareStatus[oldSocketId];
        delete room.exam.shareStatus[oldSocketId];
      }
      if (room.exam?.pinnedScreenId === oldSocketId) {
        room.exam.pinnedScreenId = socket.id;
        pinnedMigrated = true;
      }
      io.to(roomId).emit('peer:left', { socketId: oldSocketId });
      if (pinnedMigrated && room.exam) {
        io.to(roomId).emit('exam:pinnedScreen', { targetSocketId: socket.id });
        io.to(roomId).emit('exam:state', {
          monitoring: !!room.exam.monitoring,
          requireShare: !!room.exam.requireShare,
          pinnedScreenId: socket.id,
          hostId: room.hostId,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    await socket.join(roomId);

    const mainRoomForSecret = room.isBreakout && room.parentId ? roomManager.getRoom(room.parentId) : null;
    const validMainSecretForJoin = mainRoomForSecret ? roomManager.isValidHostSecret(mainRoomForSecret, hostSecret) : false;
    const effectiveSecret =
      validRoomSecret
        ? hostSecret
        : validMainSecretForJoin
          ? room.hostSecret
          : undefined;

    roomManager.addParticipant(roomId, socket.id, resolvedName, ccUser as any, effectiveSessionToken, effectiveSecret);

    // Nếu giáo viên/host F5 hoặc mất mạng khi đang ở trong phòng nhóm → khôi phục luôn hostId ở lớp chính
    if (mainRoomForSecret && (isTeacher || validMainSecretForJoin || validRoomSecret)) {
      if (!mainRoomForSecret.hostId || !io.sockets.sockets.get(mainRoomForSecret.hostId)) {
        mainRoomForSecret.hostId = socket.id;
        roomManager.markDirty();
        io.to(mainRoomForSecret.id).emit('room:hostChanged', { hostId: socket.id });
        void syncSfuAudioRouting(mainRoomForSecret);
      }
    }

    // Host chết → trả host cho giáo viên/admin còn trực tuyến (nếu người vừa vào chưa nhận host)
    if (room.hostId && !io.sockets.sockets.get(room.hostId)) {
      const teacherOnline = Array.from(room.participants.entries()).find(
        ([id, p]) =>
          p.isConnected &&
          id !== socket.id &&
          (p.role === 'teacher' || p.role === 'admin') &&
          io.sockets.sockets.get(id),
      );
      if (teacherOnline) {
        room.hostId = teacherOnline[0];
      } else {
        room.hostId = '';
      }
    }

    const participant = room.participants.get(socket.id)!;

    // Thông báo peer:joined ĐÃ LỌC — không bao giờ gửi code/savedCode/codeLog/vi phạm cho học sinh
    const pubPeer = sanitizePublicPeer(socket.id, participant);
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    if (roomSockets) {
      for (const sId of roomSockets) {
        if (sId === socket.id) continue;
        io.to(sId).emit(
          'peer:joined',
          sId === room.hostId ? sanitizeHostPeer(socket.id, participant) : pubPeer,
        );
      }
    }

    io.to(roomId).emit('room:hostChanged', { hostId: room.hostId });
    io.emit('room:list', roomManager.listRooms());
    void pushCodeClassEvent('room:sync', buildRoomSyncPayload(room));
    void syncSfuAudioRouting(room);
    void syncSfuExamPolicy(room);
    if (mainRoomForSecret) {
      broadcastBreakoutSummary(io, mainRoomForSecret.id);
    } else if (room.breakouts && room.breakouts.length > 0) {
      broadcastBreakoutSummary(io, room.id);
    }

    // Cập nhật socketId mới trong phiên Quiz / Adaptive nếu đang diễn ra
    if (room.activeAdaptive) {
      const sc = room.activeAdaptive.scores.get(participantKey);
      if (sc) {
        sc.socketId = socket.id;
        sc.userName = participant.name;
      }
      const resp = room.activeAdaptive.responses.get(participantKey);
      if (resp) {
        resp.socketId = socket.id;
        resp.userName = participant.name;
      }
    }

    const amHost = socket.id === room.hostId;
    let myQuizSubmission: any = null;
    if (room.activeQuiz && !amHost && Array.isArray(room.quizResponses)) {
      const sorted = [...room.quizResponses].sort((a, b) =>
        b.score !== a.score ? b.score - a.score : a.timeTaken - b.timeTaken,
      );
      const idx = sorted.findIndex((r) => r.participantKey === participantKey);
      if (idx !== -1) {
        const r = sorted[idx];
        r.userId = socket.id;
        r.userName = participant.name;
        const answeredIdSet = new Set<string>((r.answers || []).map((a: any) => String(a.questionId)));
        myQuizSubmission = {
          score: r.score,
          timeTaken: r.timeTaken,
          rank: idx + 1,
          totalSubmissions: sorted.length,
          answers: r.answers,
          review: (room.activeQuiz.questions || [])
            .filter((q: any) => answeredIdSet.has(String(q.id)))
            .map((q: any) => ({
              id: q.id,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
            })),
        };
      }
    }

    const adaptiveCurrentQ = room.activeAdaptive?.currentQuestion
      ? amHost
        ? room.activeAdaptive.currentQuestion
        : sanitizeQuestionForStudent(room.activeAdaptive.currentQuestion)
      : null;

    cb &&
      cb({
        ok: true,
        roomName: room.name,
        host: amHost,
        hostId: room.hostId,
        sessionToken: effectiveSessionToken,
        isBreakout: !!room.isBreakout,
        parentId: room.parentId || null,
        breakoutEndsAt: room.isBreakout
          ? (roomManager.getRoom(room.parentId || '')?.breakoutEndsAt ?? null)
          : (room.breakoutEndsAt || null),
        sfuToken: mintSfuToken(roomId, socket.id, resolvedName),
        ownState: {
          code: participant.code || '',
          language: participant.language || { name: 'python', version: '3.10.0' },
          violations: participant.violations || 0,
          copyCount: participant.copyCount || 0,
          pasteCount: participant.pasteCount || 0,
          points: participant.points || 0,
          violationHistory: participant.violationHistory || [],
        },
        peers: Array.from(room.participants.entries())
          .filter(([id, p]) => p.isConnected && id !== socket.id)
          .map(([id, p]) => (amHost ? sanitizeHostPeer(id, p) : sanitizePublicPeer(id, p))),
        messages: room.messages.slice(-200),
        pinned: room.pinned || '',
        forcePin: !!room.forcePin,
        assignments: room.assignments || [],
        currentAssignmentIndex: room.currentAssignmentIndex ?? 0,
        audioMode: room.audioMode || 'all',
        hearHost: room.hearHost || [],
        hostFocus: !!room.hostFocus,
        audioGroups: room.audioGroups || [],
        breakoutSummary: mainRoomForSecret
          ? buildBreakoutSummary(mainRoomForSecret)
          : room.breakouts && room.breakouts.length > 0
            ? buildBreakoutSummary(room)
            : null,
        exam: room.exam
          ? {
              monitoring: !!room.exam.monitoring,
              requireShare: !!room.exam.requireShare,
              pinnedScreenId: room.exam.pinnedScreenId || null,
              ...(amHost ? { shareStatus: room.exam.shareStatus || {} } : {}),
            }
          : null,
        activeQuiz: amHost ? (room.activeQuiz || null) : sanitizeQuizForStudent(room.activeQuiz),
        quizResponses: amHost ? (room.quizResponses || []) : [],
        myQuizSubmission,
        activeAdaptive: room.activeAdaptive
          ? {
              id: room.activeAdaptive.id,
              title: room.activeAdaptive.title,
              status: room.activeAdaptive.status,
              createdAt: room.activeAdaptive.createdAt,
              currentQuestion: adaptiveCurrentQ,
              questionEndsAt: room.activeAdaptive.questionEndsAt || null,
              questionIndex: room.activeAdaptive.questionIndex,
              questionHistory: room.activeAdaptive.questionHistory,
              scores: Array.from(room.activeAdaptive.scores.values()),
            }
          : null,
        aiHistory: room.aiHistory ? (room.aiHistory.get(participantKey) || []) : [],
      });
  });

  socket.on('peer:update-state', ({ roomId, state }) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !state || typeof state !== 'object') return;
    const cleanState: Partial<{
      isMuted: boolean;
      isCameraOff: boolean;
      isActive: boolean;
      isHandRaised: boolean;
    }> = {};
    if (typeof state.isMuted === 'boolean') cleanState.isMuted = state.isMuted;
    if (typeof state.isCameraOff === 'boolean') cleanState.isCameraOff = state.isCameraOff;
    if (typeof state.isActive === 'boolean') cleanState.isActive = state.isActive;
    if (typeof state.isHandRaised === 'boolean') cleanState.isHandRaised = state.isHandRaised;
    if (Object.keys(cleanState).length === 0) return;

    roomManager.updateParticipantState(roomId, socket.id, cleanState);
    socket.to(roomId).emit('peer:update-state', {
      socketId: socket.id,
      state: cleanState,
    });
  });

  socket.on('room:delete', async ({ roomId, password, token, hostSecret }: any, cb) => {
    const ccDel = await ((globalThis as any).verifyCodeClassToken
      ? (globalThis as any).verifyCodeClassToken(token)
      : Promise.resolve(null));
    const teacherDel = ccDel && (ccDel.role === 'teacher' || ccDel.role === 'admin');
    const room = roomManager.getRoom(roomId);
    if (!room) return cb && cb({ error: 'Phòng không tồn tại' });

    const validSecret = roomManager.isValidHostSecret(room, hostSecret);
    if (!teacherDel) {
      if (socket.id !== room.hostId && !validSecret) {
        return cb && cb({ error: 'Chỉ host hoặc giáo viên mới được xóa phòng' });
      }
      if (room.password && room.password !== (password || '')) {
        return cb && cb({ error: 'Sai mật khẩu phòng' });
      }
    }

    io.to(roomId).emit('room:deleted');
    for (const bid of room.breakouts || []) {
      io.to(bid).emit('room:deleted');
      roomManager.deleteRoom(bid);
      void closeSfuRoom(bid);
    }
    roomManager.deleteRoom(roomId);
    removeRoomUploadsDir(roomId);
    io.emit('room:list', roomManager.listRooms());
    void pushCodeClassEvent('room:deleted', { roomId });

    void closeSfuRoom(roomId);
    const mt = musicTimers.get(roomId);
    if (mt) { clearTimeout(mt); musicTimers.delete(roomId); }
    const at = adaptiveTimers.get(roomId);
    if (at) { clearTimeout(at); adaptiveTimers.delete(roomId); }
    clearAdaptiveQuestionTimer(roomId);
    const bt = breakoutTimers.get(roomId);
    if (bt) { clearTimeout(bt); breakoutTimers.delete(roomId); }
    const bgt = breakoutGraceTimers.get(roomId);
    if (bgt) { clearTimeout(bgt); breakoutGraceTimers.delete(roomId); }

    cb && cb({ ok: true });
  });

  // ─── Ai nghe được host / Nói riêng 1-1 / Gom nhóm âm thanh ───────────
  socket.on('audio:setAllowed', ({ roomId, allowed, mode, hostFocus }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return cb && cb({ error: 'Deny' });
    const present = new Set(room.participants.keys());
    const nextMode: 'all' | 'selected' =
      mode === 'all'
        ? 'all'
        : mode === 'selected'
          ? 'selected'
          : Array.isArray(allowed)
            ? 'selected'
            : (room.audioMode || 'all');

    const nextAllowed = Array.isArray(allowed)
      ? Array.from(new Set(allowed.map(String).filter((id: string) => present.has(id) && id !== room.hostId)))
      : (room.hearHost || []).filter((id) => present.has(id) && id !== room.hostId);

    room.audioMode = nextMode;
    room.hearHost = nextAllowed;
    if (typeof hostFocus === 'boolean') room.hostFocus = hostFocus;
    roomManager.markDirty();
    void syncSfuAudioRouting(room);
    emitAudioState(io, room);
    cb && cb({
      ok: true,
      mode: room.audioMode,
      allowed: room.hearHost,
      hostFocus: !!room.hostFocus,
    });
  });

  socket.on('audio:saveGroups', ({ roomId, groups }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return cb && cb({ error: 'Deny' });
    if (!Array.isArray(groups)) return cb && cb({ error: 'Dữ liệu nhóm không hợp lệ' });

    const present = new Set(room.participants.keys());
    const clean = groups
      .slice(0, 12)
      .map((g: any, idx: number) => ({
        id: String(g?.id || `grp_${Date.now()}_${idx}`).slice(0, 40),
        name: String(g?.name || `Nhóm âm thanh ${idx + 1}`).trim().slice(0, 40) || `Nhóm ${idx + 1}`,
        memberIds: Array.isArray(g?.memberIds)
          ? Array.from(
              new Set<string>(
                (g.memberIds as unknown[]).map((x) => String(x)).filter((id) => present.has(id) && id !== room.hostId),
              ),
            )
          : ([] as string[]),
      }));

    room.audioGroups = clean;
    roomManager.markDirty();
    emitAudioState(io, room);
    cb && cb({ ok: true, groups: clean });
  });

  socket.on('audio:mutePeer', ({ roomId, targetSocketId }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return cb && cb({ error: 'Deny' });
    if (!targetSocketId || targetSocketId === room.hostId) return cb && cb({ error: 'Mục tiêu không hợp lệ' });
    const target = room.participants.get(targetSocketId);
    if (!target || !target.isConnected) return cb && cb({ error: 'Học viên không trực tuyến' });

    roomManager.updateParticipantState(roomId, targetSocketId, { isMuted: true });
    io.to(roomId).emit('peer:update-state', {
      socketId: targetSocketId,
      state: { isMuted: true },
    });
    const hostName = room.participants.get(socket.id)?.name || 'Host';
    io.to(targetSocketId).emit('audio:forceMute', { by: hostName, all: false });
    cb && cb({ ok: true });
  });

  socket.on('audio:muteAll', ({ roomId }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return cb && cb({ error: 'Deny' });
    const hostName = room.participants.get(socket.id)?.name || 'Host';
    let count = 0;
    for (const [id, p] of room.participants.entries()) {
      if (!p.isConnected || id === room.hostId) continue;
      roomManager.updateParticipantState(roomId, id, { isMuted: true });
      io.to(roomId).emit('peer:update-state', {
        socketId: id,
        state: { isMuted: true },
      });
      io.to(id).emit('audio:forceMute', { by: hostName, all: true });
      count++;
    }
    cb && cb({ ok: true, count });
  });

  socket.on('room:pin', ({ roomId, peerId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return;
    room.pinned = peerId || '';
    roomManager.markDirty();
    io.to(roomId).emit('room:pin', { peerId: room.pinned });
  });

  socket.on('room:forcePin', ({ roomId, active }, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return cb && cb({ error: 'Deny' });
    room.forcePin = !!active;
    roomManager.markDirty();
    io.to(roomId).emit('room:forcePin', { active: room.forcePin });
    cb && cb({ ok: true });
  });

  socket.on('room:remoteFullscreen', ({ roomId, tileId, active }, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return cb && cb({ error: 'Deny' });
    socket.to(roomId).emit('room:remoteFullscreen', { active: !!active, senderId: socket.id, tileId });
    cb && cb({ ok: true });
  });

  socket.on('room:pin-sync', async ({ roomId, action, participantIdentity, source }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return;

    if (action === 'pin') {
      room.pinned = `${participantIdentity}:${source}`;
    } else {
      room.pinned = '';
    }
    roomManager.markDirty();

    io.to(roomId).emit('room:pin-sync', {
      action,
      participantIdentity,
      source,
      timestamp: Date.now(),
    });
    socket.emit('room:pin-sync-ack', { ok: true, action });
  });

  const ALLOWED_REACTIONS = new Set(['👏', '👍', '❤️', '🎉', '😂', '💡', '🔥', '🙌']);

  socket.on('room:reaction', ({ roomId, emoji }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room) return cb && cb({ error: 'Deny' });
    const clean = typeof emoji === 'string' ? emoji.trim() : '';
    if (!ALLOWED_REACTIONS.has(clean)) return cb && cb({ error: 'Biểu cảm không hợp lệ' });
    const now = Date.now();
    const prev = lastReactionAt.get(socket.id) || 0;
    if (now - prev < 450) {
      return cb && cb({ error: 'Bạn thao tác hơi nhanh, chờ một chút nhé' });
    }
    lastReactionAt.set(socket.id, now);
    const sender = room.participants.get(socket.id);
    io.to(roomId).emit('room:reaction', {
      socketId: socket.id,
      name: sender?.name || 'Thành viên',
      emoji: clean,
      ts: now,
    });
    cb && cb({ ok: true });
  });

  socket.on('room:screenShare', ({ roomId, active }, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket)) return cb && cb({ error: 'Deny' });
    socket.to(roomId).emit('room:screenShare', { senderId: socket.id, active: !!active });
    cb && cb({ ok: true });
  });

  // ─── Rời phòng chủ động ───
  socket.on('room:leave', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket)) return;
    socket.leave(roomId);
    socket.to(roomId).emit('peer:left', { socketId: socket.id });
    handleParticipantDeparture(io, roomId, socket.id, false);
    io.emit('room:list', roomManager.listRooms());
  });

  // ─── Đòi quyền host: giáo viên CodeClass HOẶC đúng hostSecret của người tạo phòng ───
  socket.on('room:claim-host', async ({ roomId, token, hostSecret }: any, cb) => {
    const ccUser = await ((globalThis as any).verifyCodeClassToken
      ? (globalThis as any).verifyCodeClassToken(token)
      : Promise.resolve(null));
    const isTeacher = Boolean(ccUser && (ccUser.role === 'teacher' || ccUser.role === 'admin'));
    const room = roomManager.getRoom(roomId);
    if (!room) return cb && cb({ error: 'Phòng không tồn tại' });
    if (socket.id === room.hostId && io.sockets.sockets.get(room.hostId)) {
      return cb && cb({ error: 'Bạn đang là host' });
    }

    const validSecret = roomManager.isValidHostSecret(room, hostSecret);
    if (!isTeacher && !validSecret) {
      return cb && cb({ error: 'Chỉ giáo viên CodeClass hoặc người tạo phòng mới có quyền host.' });
    }
    if (room.hostId && io.sockets.sockets.get(room.hostId)) {
      return cb && cb({ error: 'Đang có giáo viên/host khác trực tuyến trong phòng này' });
    }

    room.hostId = socket.id;
    roomManager.markDirty();
    io.to(roomId).emit('room:hostChanged', { hostId: socket.id });
    io.emit('room:list', roomManager.listRooms());
    void syncSfuAudioRouting(room);
    void syncSfuExamPolicy(room);
    cb && cb({ ok: true, hostId: socket.id });
  });

  socket.on('rtc:signal', ({ to, signal }) => {
    if (!to || typeof to !== 'string' || to === socket.id) return;
    const targetSocket = io.sockets.sockets.get(to);
    if (!targetSocket) return;
    const sharesRoom = Array.from(socket.rooms).some((r) => r !== socket.id && targetSocket.rooms.has(r));
    if (!sharesRoom) return;
    io.to(to).emit('rtc:signal', { from: socket.id, signal });
  });

  socket.on('disconnecting', () => {
    const roomsToProcess = new Set(socket.rooms);
    for (const roomId of roomsToProcess) {
      if (roomId === socket.id) continue;
      const room = roomManager.getRoom(roomId);
      if (room) {
        socket.to(roomId).emit('peer:left', { socketId: socket.id });
        handleParticipantDeparture(io, roomId, socket.id, true);
      }
    }
    io.emit('room:list', roomManager.listRooms());
  });
};
