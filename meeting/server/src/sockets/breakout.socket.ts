import { Server, Socket } from 'socket.io';
import { roomManager, RoomManager } from '../room.manager.js';
import { Room } from '../types.js';
import {
  breakoutGraceTimers,
  breakoutTimers,
  broadcastBreakoutSummary,
  buildBreakoutSummary,
  closeSfuRoom,
  isActiveMember,
  lastHelpAt,
} from './shared.js';

let breakoutIoRef: Server | null = null;
let breakoutHeartbeatStarted = false;

const brkAuth = (room: Room, s: Socket): boolean =>
  s.id === room.hostId ||
  (room.breakouts || []).some((bid) => roomManager.getRoom(bid)?.hostId === s.id);

const createSingleBreakout = (mainRoom: Room, rawName: string): { id: string; name: string } => {
  const cleanName = String(rawName || '').trim().slice(0, 40) || 'Nhóm';
  const bid = roomManager.createRoom(cleanName, mainRoom.password || '', mainRoom.hostName || '', mainRoom.hostSecret);
  const br = roomManager.getRoom(bid)!;
  br.parentId = mainRoom.id;
  br.isBreakout = true;
  br.assignments = (mainRoom.assignments || []).map((a) => ({ ...a }));
  br.currentAssignmentIndex = mainRoom.currentAssignmentIndex ?? 0;
  return { id: bid, name: br.name };
};

const emitBreakoutTimer = (mainRoomId: string): void => {
  const io = breakoutIoRef;
  const room = roomManager.getRoom(mainRoomId);
  if (!io || !room) return;
  const endsAt = room.breakoutEndsAt || null;
  io.to(mainRoomId).emit('breakout:timer', { endsAt });
  for (const bid of room.breakouts || []) io.to(bid).emit('breakout:timer', { endsAt });
};

const clearGraceTimer = (mainRoomId: string): void => {
  const gt = breakoutGraceTimers.get(mainRoomId);
  if (gt) {
    clearTimeout(gt);
    breakoutGraceTimers.delete(mainRoomId);
  }
};

const executeBreakoutRecall = (io: Server, mainRoomId: string): void => {
  const room = roomManager.getRoom(mainRoomId);
  if (!room) return;
  clearGraceTimer(mainRoomId);
  const bt = breakoutTimers.get(mainRoomId);
  if (bt) {
    clearTimeout(bt);
    breakoutTimers.delete(mainRoomId);
  }
  for (const bid of room.breakouts || []) {
    const b = roomManager.getRoom(bid);
    if (!b) continue;
    io.to(bid).emit('breakout:closing', { endsAt: null });
    for (const [sid, p] of b.participants) {
      if (p.isConnected && sid !== room.hostId && sid !== b.hostId) {
        io.to(sid).emit('breakout:move', { roomId: mainRoomId, roomName: room.name, isBreakout: false });
      }
    }
  }
  room.breakoutEndsAt = null;
  room.breakoutClosingAt = null;
  roomManager.markDirty();
  emitBreakoutTimer(mainRoomId);
  broadcastBreakoutSummary(io, mainRoomId);
};

const executeBreakoutClose = (io: Server, mainRoomId: string): void => {
  const room = roomManager.getRoom(mainRoomId);
  if (!room) return;
  clearGraceTimer(mainRoomId);
  const bt = breakoutTimers.get(mainRoomId);
  if (bt) {
    clearTimeout(bt);
    breakoutTimers.delete(mainRoomId);
  }
  for (const bid of room.breakouts || []) {
    const b = roomManager.getRoom(bid);
    if (b) {
      io.to(bid).emit('breakout:closing', { endsAt: null });
      for (const [sid, p] of b.participants) {
        if (p.isConnected && sid !== room.hostId && sid !== b.hostId) {
          io.to(sid).emit('breakout:move', { roomId: mainRoomId, roomName: room.name, isBreakout: false });
        }
      }
    }
    roomManager.deleteRoom(bid);
    void closeSfuRoom(bid);
  }
  room.breakouts = [];
  room.breakoutEndsAt = null;
  room.breakoutClosingAt = null;
  room.breakoutAllowSelfSelect = false;
  roomManager.markDirty();
  emitBreakoutTimer(mainRoomId);
  broadcastBreakoutSummary(io, mainRoomId);
  io.emit('room:list', roomManager.listRooms());
};

const scheduleBreakoutTimer = (mainRoomId: string, minutes: unknown): void => {
  const prev = breakoutTimers.get(mainRoomId);
  if (prev) clearTimeout(prev);
  breakoutTimers.delete(mainRoomId);
  const room = roomManager.getRoom(mainRoomId);
  if (!room) return;
  const m = Number(minutes);
  if (!m || m <= 0) {
    room.breakoutEndsAt = null;
    roomManager.markDirty();
    emitBreakoutTimer(mainRoomId);
    return;
  }
  const ms = Math.min(240, Math.max(0.2, m)) * 60_000;
  room.breakoutEndsAt = Date.now() + ms;
  roomManager.markDirty();
  emitBreakoutTimer(mainRoomId);
  const to = setTimeout(() => {
    breakoutTimers.delete(mainRoomId);
    if (breakoutIoRef) executeBreakoutRecall(breakoutIoRef, mainRoomId);
  }, ms);
  (to as unknown as { unref?: () => void }).unref?.();
  breakoutTimers.set(mainRoomId, to);
};

const breakoutHeartbeatSweep = (): void => {
  try {
    const now = Date.now();
    for (const [id, r] of roomManager.rooms) {
      if (!r.isBreakout && r.breakoutEndsAt && r.breakoutEndsAt <= now) {
        if (breakoutIoRef) executeBreakoutRecall(breakoutIoRef, id);
      }
    }
  } catch { /* bỏ qua lỗi vòng quét */ }
};

export const registerBreakoutHandlers = (io: Server, socket: Socket) => {
  breakoutIoRef = io;
  if (!breakoutHeartbeatStarted) {
    breakoutHeartbeatStarted = true;
    setInterval(breakoutHeartbeatSweep, 60_000).unref?.();
  }

  socket.on('breakout:create', ({ roomId, count, minutes, mode, allowSelfSelect, names }: any, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return cb && cb({ error: 'Phòng không tồn tại' });
    if (!brkAuth(room, socket)) return cb && cb({ error: 'Chỉ host mới tạo được phòng nhóm' });
    if (room.breakouts && room.breakouts.length) {
      return cb && cb({ error: 'Đang có phòng nhóm hoạt động — hãy kết thúc trước' });
    }
    const n = Math.max(1, Math.min(10, parseInt(count, 10) || 2));
    const members = Array.from(room.participants.entries()).filter(
      ([id, p]) => p.isConnected && id !== room.hostId,
    );
    const created: Array<{ id: string; name: string }> = [];
    for (let i = 0; i < n; i++) {
      const customName = Array.isArray(names) && typeof names[i] === 'string' && names[i].trim()
        ? names[i].trim()
        : `Nhóm ${i + 1}`;
      created.push(createSingleBreakout(room, customName));
    }
    room.breakouts = created.map((c) => c.id);
    room.breakoutAllowSelfSelect = !!allowSelfSelect;
    room.breakoutClosingAt = null;
    roomManager.markDirty();
    scheduleBreakoutTimer(roomId, minutes);

    if (mode !== 'manual') {
      members.forEach(([sid], idx) => {
        const t = created[idx % created.length];
        io.to(sid).emit('breakout:move', { roomId: t.id, roomName: t.name, isBreakout: true, parentId: roomId });
      });
    }
    broadcastBreakoutSummary(io, roomId);
    cb && cb({ ok: true, rooms: created.map((c) => ({ ...c, members: [] })), allowSelfSelect: room.breakoutAllowSelfSelect });
  });

  socket.on('breakout:addRoom', ({ roomId, name }: any, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !brkAuth(room, socket)) return cb && cb({ error: 'Chỉ host' });
    const list = room.breakouts || [];
    if (list.length >= 10) return cb && cb({ error: 'Tối đa 10 phòng nhóm' });
    const created = createSingleBreakout(room, typeof name === 'string' && name.trim() ? name.trim() : `Nhóm ${list.length + 1}`);
    room.breakouts = [...list, created.id];
    roomManager.markDirty();
    broadcastBreakoutSummary(io, roomId);
    cb && cb({ ok: true, room: created });
  });

  socket.on('breakout:renameRoom', ({ roomId, breakoutId, name }: any, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !brkAuth(room, socket)) return cb && cb({ error: 'Chỉ host' });
    if (!(room.breakouts || []).includes(breakoutId)) return cb && cb({ error: 'Không tìm thấy phòng nhóm' });
    const br = roomManager.getRoom(breakoutId);
    if (!br) return cb && cb({ error: 'Phòng nhóm không tồn tại' });
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean) return cb && cb({ error: 'Tên nhóm không được trống' });
    br.name = clean;
    roomManager.markDirty();
    io.to(breakoutId).emit('room:renamed', { roomId: breakoutId, name: clean });
    broadcastBreakoutSummary(io, roomId);
    cb && cb({ ok: true, name: clean });
  });

  socket.on('breakout:deleteRoom', ({ roomId, breakoutId }: any, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !brkAuth(room, socket)) return cb && cb({ error: 'Chỉ host' });
    if (!(room.breakouts || []).includes(breakoutId)) return cb && cb({ error: 'Không tìm thấy phòng nhóm' });
    const b = roomManager.getRoom(breakoutId);
    if (b) {
      for (const [sid, p] of b.participants) {
        if (p.isConnected) {
          io.to(sid).emit('breakout:move', { roomId, roomName: room.name, isBreakout: false });
        }
      }
      roomManager.deleteRoom(breakoutId);
      void closeSfuRoom(breakoutId);
    }
    room.breakouts = (room.breakouts || []).filter((id) => id !== breakoutId);
    roomManager.markDirty();
    broadcastBreakoutSummary(io, roomId);
    io.emit('room:list', roomManager.listRooms());
    cb && cb({ ok: true });
  });

  socket.on('breakout:setSettings', ({ roomId, allowSelfSelect }: any, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !brkAuth(room, socket)) return cb && cb({ error: 'Chỉ host' });
    room.breakoutAllowSelfSelect = !!allowSelfSelect;
    roomManager.markDirty();
    broadcastBreakoutSummary(io, roomId);
    cb && cb({ ok: true, allowSelfSelect: room.breakoutAllowSelfSelect });
  });

  socket.on('breakout:list', ({ roomId }: any, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return cb && cb({ error: 'Phòng không tồn tại' });
    if (!brkAuth(room, socket)) return cb && cb({ error: 'Chỉ host' });
    const rooms = (room.breakouts || [])
      .map((bid) => {
        const b = roomManager.getRoom(bid);
        if (!b) return null;
        return {
          id: b.id,
          name: b.name,
          members: Array.from(b.participants.entries())
            .filter(([id, p]) => p.isConnected && id !== room.hostId && id !== b.hostId)
            .map(([id, p]) => ({ socketId: id, name: p.name })),
        };
      })
      .filter(Boolean);
    const mainMembers = Array.from(room.participants.entries())
      .filter(([id, p]) => p.isConnected && id !== room.hostId && id !== socket.id)
      .map(([id, p]) => ({ socketId: id, name: p.name }));
    cb &&
      cb({
        rooms,
        mainMembers,
        endsAt: room.breakoutEndsAt || null,
        closingAt: room.breakoutClosingAt || null,
        allowSelfSelect: !!room.breakoutAllowSelfSelect,
      });
  });

  /** Danh sách tóm tắt công khai cho mọi thành viên lớp (để học sinh tự chọn phòng khi được bật). */
  socket.on('breakout:publicList', ({ roomId }: any, cb) => {
    const curRoom = roomManager.getRoom(roomId);
    if (!curRoom) return cb && cb({ error: 'Phòng không tồn tại' });
    const main = curRoom.isBreakout && curRoom.parentId ? roomManager.getRoom(curRoom.parentId) : curRoom;
    if (!main) return cb && cb({ error: 'Không tìm thấy lớp chính' });
    const inAnyRoom =
      isActiveMember(main, socket) ||
      (main.breakouts || []).some((bid) => isActiveMember(roomManager.getRoom(bid), socket));
    if (!inAnyRoom) return cb && cb({ error: 'Deny' });
    cb && cb({ ok: true, ...buildBreakoutSummary(main) });
  });

  /** Học sinh tự chọn phòng khi `allowSelfSelect` được bật. */
  socket.on('breakout:selfJoin', ({ roomId, targetId }: any, cb) => {
    const curRoom = roomManager.getRoom(roomId);
    if (!curRoom) return cb && cb({ error: 'Phòng không tồn tại' });
    const main = curRoom.isBreakout && curRoom.parentId ? roomManager.getRoom(curRoom.parentId) : curRoom;
    if (!main) return cb && cb({ error: 'Không tìm thấy lớp chính' });
    const isHostCaller = brkAuth(main, socket);
    if (!isHostCaller && !main.breakoutAllowSelfSelect) {
      return cb && cb({ error: 'Host chưa bật chế độ tự chọn phòng nhóm' });
    }
    const target = roomManager.getRoom(targetId);
    if (!target || (targetId !== main.id && !(main.breakouts || []).includes(targetId))) {
      return cb && cb({ error: 'Phòng đích không hợp lệ' });
    }
    const isClassMember =
      isActiveMember(main, socket) ||
      (main.breakouts || []).some((bid) => isActiveMember(roomManager.getRoom(bid), socket));
    if (!isClassMember && !isHostCaller) {
      return cb && cb({ error: 'Bạn không thuộc lớp học này' });
    }
    io.to(socket.id).emit('breakout:move', {
      roomId: targetId,
      roomName: target.name,
      isBreakout: targetId !== main.id,
      parentId: main.id,
    });
    cb && cb({ ok: true });
  });

  socket.on('breakout:timer', ({ roomId, minutes }: any, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !brkAuth(room, socket)) return cb && cb({ error: 'Chỉ host' });
    scheduleBreakoutTimer(roomId, minutes);
    broadcastBreakoutSummary(io, roomId);
    cb && cb({ ok: true, endsAt: room.breakoutEndsAt || null });
  });

  socket.on('breakout:assign', ({ roomId, socketId, targetId }: any, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !brkAuth(room, socket)) return cb && cb({ error: 'Chỉ host' });
    const target = roomManager.getRoom(targetId);
    if (!target || (target.parentId !== roomId && targetId !== roomId)) {
      return cb && cb({ error: 'Phòng đích không hợp lệ' });
    }
    const belongsHere =
      room.participants.get(socketId)?.isConnected ||
      (room.breakouts || []).some((bid) => roomManager.getRoom(bid)?.participants.get(socketId)?.isConnected);
    if (!belongsHere) {
      return cb && cb({ error: 'Học viên không nằm trong lớp này' });
    }
    io.to(socketId).emit('breakout:move', {
      roomId: targetId,
      roomName: target.name,
      isBreakout: targetId !== roomId,
      parentId: roomId,
    });
    cb && cb({ ok: true });
  });

  socket.on('breakout:recall', ({ roomId, graceSeconds }: any, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !brkAuth(room, socket)) return cb && cb({ error: 'Chỉ host' });
    const sec = Number(graceSeconds) > 0 ? Math.min(120, Math.max(1, Number(graceSeconds))) : 0;
    if (sec > 0) {
      clearGraceTimer(roomId);
      const closingAt = Date.now() + sec * 1000;
      room.breakoutClosingAt = closingAt;
      roomManager.markDirty();
      for (const bid of room.breakouts || []) {
        io.to(bid).emit('breakout:closing', {
          endsAt: closingAt,
          reason: 'recall',
          mainRoomId: roomId,
          mainRoomName: room.name,
        });
      }
      broadcastBreakoutSummary(io, roomId);
      const gt = setTimeout(() => executeBreakoutRecall(io, roomId), sec * 1000);
      (gt as unknown as { unref?: () => void }).unref?.();
      breakoutGraceTimers.set(roomId, gt);
      return cb && cb({ ok: true, closingAt });
    }
    executeBreakoutRecall(io, roomId);
    cb && cb({ ok: true });
  });

  socket.on('breakout:close', ({ roomId, graceSeconds }: any, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !brkAuth(room, socket)) return cb && cb({ error: 'Chỉ host' });
    const sec = Number(graceSeconds) > 0 ? Math.min(120, Math.max(1, Number(graceSeconds))) : 0;
    if (sec > 0) {
      clearGraceTimer(roomId);
      const closingAt = Date.now() + sec * 1000;
      room.breakoutClosingAt = closingAt;
      roomManager.markDirty();
      for (const bid of room.breakouts || []) {
        io.to(bid).emit('breakout:closing', {
          endsAt: closingAt,
          reason: 'close',
          mainRoomId: roomId,
          mainRoomName: room.name,
        });
      }
      broadcastBreakoutSummary(io, roomId);
      const gt = setTimeout(() => executeBreakoutClose(io, roomId), sec * 1000);
      (gt as unknown as { unref?: () => void }).unref?.();
      breakoutGraceTimers.set(roomId, gt);
      return cb && cb({ ok: true, closingAt });
    }
    executeBreakoutClose(io, roomId);
    cb && cb({ ok: true });
  });

  socket.on('breakout:broadcast', ({ roomId, message }: any, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !brkAuth(room, socket)) return cb && cb({ error: 'Chỉ host' });
    const text = String(message || '').slice(0, 500);
    if (!text.trim()) return cb && cb({ error: 'Thông báo trống' });
    const senderName = (room.participants.get(socket.id)?.name || 'Host') + ' (thông báo)';
    const msg = { senderId: socket.id, senderName, text, time: Date.now(), broadcast: true };
    for (const tid of [roomId, ...(room.breakouts || [])]) {
      const r = roomManager.getRoom(tid);
      if (!r) continue;
      r.messages.push(msg as any);
      if (r.messages.length > 200) r.messages = r.messages.slice(-200);
      io.to(tid).emit('chat:message', msg);
    }
    roomManager.markDirty();
    cb && cb({ ok: true });
  });

  socket.on('breakout:help', ({ roomId }: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !room.isBreakout) return;
    const main = roomManager.getRoom(room.parentId || '');
    if (!main) return;
    const helper = room.participants.get(socket.id);
    if (!helper || !helper.isConnected) return;
    const now = Date.now();
    if (now - (lastHelpAt.get(socket.id) || 0) < 10000) return;
    lastHelpAt.set(socket.id, now);
    const targetHostId =
      (main.hostId && io.sockets.sockets.get(main.hostId) && main.hostId) ||
      (main.breakouts || []).map((bid) => roomManager.getRoom(bid)?.hostId).find((hid) => hid && io.sockets.sockets.get(hid)) ||
      main.hostId;
    if (!targetHostId) return;
    io.to(targetHostId).emit('breakout:help', {
      roomId,
      roomName: room.name,
      name: helper.name,
    });
  });
};
