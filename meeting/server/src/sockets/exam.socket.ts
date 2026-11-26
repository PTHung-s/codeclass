import { Server, Socket } from 'socket.io';
import { roomManager } from '../room.manager.js';
import { Room } from '../types.js';
import { isActiveMember, syncSfuExamPolicy } from './shared.js';

const VALID_SURFACES = new Set(['monitor', 'window', 'browser', 'unknown']);

export const registerExamHandlers = (io: Server, socket: Socket) => {
  const broadcastExamState = (room: Room) => {
    io.to(room.id).emit('exam:state', {
      monitoring: !!room.exam?.monitoring,
      requireShare: !!room.exam?.requireShare,
      pinnedScreenId: room.exam?.pinnedScreenId || null,
      hostId: room.hostId,
    });
  };

  socket.on('exam:getState', ({ roomId }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room) {
      return cb && cb({ error: 'Deny' });
    }
    const amHost = socket.id === room.hostId;
    cb &&
      cb({
        ok: true,
        exam: room.exam
          ? {
              monitoring: !!room.exam.monitoring,
              requireShare: !!room.exam.requireShare,
              pinnedScreenId: room.exam.pinnedScreenId || null,
              ...(amHost ? { shareStatus: room.exam.shareStatus || {} } : {}),
            }
          : null,
      });
  });

  socket.on('exam:setMonitoring', ({ roomId, active }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return cb && cb({ error: 'Deny' });
    if (!active) {
      room.exam = {
        monitoring: false,
        requireShare: false,
        pinnedScreenId: null,
        startedAt: 0,
        shareStatus: {},
      };
      roomManager.markDirty();
      broadcastExamState(room);
      void syncSfuExamPolicy(room);
      return cb && cb({ ok: true });
    }
    room.exam = {
      monitoring: true,
      requireShare: room.exam?.requireShare ?? false,
      pinnedScreenId: room.exam?.pinnedScreenId ?? null,
      startedAt: room.exam?.startedAt || Date.now(),
      shareStatus: room.exam?.shareStatus || {},
    };
    roomManager.markDirty();
    broadcastExamState(room);
    void syncSfuExamPolicy(room);
    cb && cb({ ok: true });
  });

  socket.on('exam:requireShare', ({ roomId, active }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return cb && cb({ error: 'Deny' });
    room.exam = {
      monitoring: room.exam?.monitoring ?? true,
      requireShare: !!active,
      pinnedScreenId: room.exam?.pinnedScreenId ?? null,
      startedAt: room.exam?.startedAt || Date.now(),
      shareStatus: room.exam?.shareStatus || {},
    };
    roomManager.markDirty();
    io.to(roomId).emit('exam:requireShare', { active: !!active, hostId: room.hostId });
    broadcastExamState(room);
    void syncSfuExamPolicy(room);
    cb && cb({ ok: true, requireShare: !!active });
  });

  socket.on('exam:reportShare', ({ roomId, sharing, surface }: any) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room) return;
    const cleanSurface = typeof surface === 'string' && VALID_SURFACES.has(surface) ? surface : undefined;
    const now = Date.now();
    if (!room.exam) {
      room.exam = {
        monitoring: false,
        requireShare: false,
        pinnedScreenId: null,
        startedAt: 0,
        shareStatus: {},
      };
    }
    if (!room.exam.shareStatus) room.exam.shareStatus = {};
    room.exam.shareStatus[socket.id] = {
      sharing: !!sharing,
      ...(cleanSurface ? { surface: cleanSurface } : {}),
      updatedAt: now,
    };
    roomManager.markDirty();
    if (room.hostId) {
      io.to(room.hostId).emit('exam:shareStatus', {
        socketId: socket.id,
        sharing: !!sharing,
        ...(cleanSurface ? { surface: cleanSurface } : {}),
        at: now,
      });
    }
  });

  socket.on('exam:pinScreen', ({ roomId, targetSocketId }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return cb && cb({ error: 'Deny' });
    const valid = targetSocketId && room.participants.get(targetSocketId)?.isConnected ? targetSocketId : null;
    room.exam = {
      monitoring: room.exam?.monitoring ?? true,
      requireShare: room.exam?.requireShare ?? false,
      pinnedScreenId: valid,
      startedAt: room.exam?.startedAt || Date.now(),
      shareStatus: room.exam?.shareStatus || {},
    };
    roomManager.markDirty();
    io.to(roomId).emit('exam:pinnedScreen', { targetSocketId: valid });
    broadcastExamState(room);
    void syncSfuExamPolicy(room);
    cb && cb({ ok: true, pinnedScreenId: valid });
  });
};
