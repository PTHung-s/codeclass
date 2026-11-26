import { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { roomManager } from '../room.manager.js';
import { Room } from '../types.js';
import { safeFileName } from '../zip.js';
import { removeUploadedFileIfAny, UPLOADS_ROOT } from './shared.js';

const resolveAssignmentMainRoom = (room: Room): Room =>
  room.isBreakout && room.parentId ? roomManager.getRoom(room.parentId) || room : room;

const syncAssignmentsToBreakouts = (
  io: Server,
  mainRoom: Room,
  event: string,
  payload: Record<string, unknown>,
) => {
  io.to(mainRoom.id).emit(event, payload);
  for (const bid of mainRoom.breakouts || []) {
    const br = roomManager.getRoom(bid);
    if (!br) continue;
    br.assignments = mainRoom.assignments.map((a) => ({ ...a }));
    br.currentAssignmentIndex = mainRoom.currentAssignmentIndex ?? 0;
    io.to(bid).emit(event, payload);
  }
  roomManager.markDirty();
};

export const registerAssignmentHandlers = (io: Server, socket: Socket) => {
  socket.on('assignment:add', async ({ roomId, assignment }: any, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return cb && cb({ error: 'Deny' });
    const mainRoom = resolveAssignmentMainRoom(room);
    if (socket.id !== room.hostId && socket.id !== mainRoom.hostId) {
      return cb && cb({ error: 'Deny' });
    }
    if (!assignment || typeof assignment.data !== 'string' || typeof assignment.name !== 'string') {
      return cb && cb({ error: 'Dữ liệu đề bài không hợp lệ' });
    }

    const match = assignment.data.match(/^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,(.+)$/);
    if (!match) {
      socket.emit('assignment:rejected', { error: 'Chỉ hỗ trợ file ảnh hoặc PDF' });
      return cb && cb({ error: 'Chỉ hỗ trợ file ảnh hoặc PDF' });
    }

    const mime = match[1].toLowerCase();
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 10 * 1024 * 1024) {
      socket.emit('assignment:rejected', { error: 'File vượt quá giới hạn 10MB' });
      return cb && cb({ error: 'File vượt quá 10MB' });
    }

    const extMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
    };
    const ext = extMap[mime] || (assignment.type === 'pdf' ? 'pdf' : 'png');
    const safeRoom = safeFileName(mainRoom.id);
    const fileId = `${Date.now()}-${nanoid(8)}.${ext}`;
    const roomUploadDir = path.join(UPLOADS_ROOT, safeRoom);
    try {
      await fs.promises.mkdir(roomUploadDir, { recursive: true });
      await fs.promises.writeFile(path.join(roomUploadDir, fileId), buf);
    } catch (e: any) {
      return cb && cb({ error: 'Không lưu được file đề bài: ' + (e?.message || e) });
    }

    const stored = {
      id: assignment.id || `asgn_${Date.now()}_${nanoid(6)}`,
      name: assignment.name.slice(0, 200),
      type: (mime === 'application/pdf' ? 'pdf' : 'image') as 'image' | 'pdf',
      data: `/uploads/${safeRoom}/${fileId}`,
    };

    roomManager.addAssignment(mainRoom.id, stored);
    syncAssignmentsToBreakouts(io, mainRoom, 'assignment:add', { assignment: stored });
    cb && cb({ ok: true, assignment: stored });
  });

  socket.on('assignment:delete', ({ roomId, assignmentId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const mainRoom = resolveAssignmentMainRoom(room);
    if (socket.id !== room.hostId && socket.id !== mainRoom.hostId) return;
    const target = mainRoom.assignments.find((a) => a.id === assignmentId);
    if (target) removeUploadedFileIfAny(target.data);
    roomManager.deleteAssignment(mainRoom.id, assignmentId);
    syncAssignmentsToBreakouts(io, mainRoom, 'assignment:delete', { assignmentId });
  });

  socket.on('assignment:reorder', ({ roomId, assignments }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !Array.isArray(assignments)) return;
    const mainRoom = resolveAssignmentMainRoom(room);
    if (socket.id !== room.hostId && socket.id !== mainRoom.hostId) return;
    roomManager.updateAssignmentsOrder(mainRoom.id, assignments);
    syncAssignmentsToBreakouts(io, mainRoom, 'assignment:reorder', { assignments });
  });

  socket.on('assignment:page', ({ roomId, index }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const mainRoom = resolveAssignmentMainRoom(room);
    if (socket.id !== room.hostId && socket.id !== mainRoom.hostId) return;
    if (!Number.isInteger(index) || index < 0 || index >= mainRoom.assignments.length) return;
    mainRoom.currentAssignmentIndex = index;
    syncAssignmentsToBreakouts(io, mainRoom, 'assignment:page', { index });
  });
};
