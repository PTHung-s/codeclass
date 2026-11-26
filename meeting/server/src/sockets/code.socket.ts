import { Server, Socket } from 'socket.io';
import { roomManager, RoomManager } from '../room.manager.js';
import { createZip, extForLanguage, safeFileName } from '../zip.js';
import { commentPrefixFor, isActiveMember } from './shared.js';

export const registerCodeHandlers = (io: Server, socket: Socket) => {
  socket.on('user:violation', ({ roomId, type, text }) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room) return;
    if (socket.id === room.hostId) return;

    let violationCount = 0;
    let pasteCount = 0;
    const cleanType = typeof type === 'string' && type.trim() ? type.trim().slice(0, 40) : 'focus-lost';
    let autoReason = '';

    if (cleanType === 'external-paste') {
      const snippet = String(text || '').trim().slice(0, 300);
      roomManager.appendCodeEvent(roomId, socket.id, 'paste', { text: snippet });
      const stats = roomManager.updateParticipantCopyCount(roomId, socket.id, true);
      pasteCount = stats.pasteCount;
      violationCount = room.participants.get(socket.id)?.violations || 0;
      autoReason = snippet
        ? `Dán mã từ bên ngoài (${snippet.length} ký tự): ${snippet.slice(0, 80)}`
        : 'Dán mã từ bên ngoài';
    } else {
      roomManager.updateParticipantState(roomId, socket.id, { isActive: false });
      violationCount = roomManager.updateParticipantViolation(roomId, socket.id);
      pasteCount = room.participants.get(socket.id)?.pasteCount || 0;
      autoReason = cleanType === 'tab-switch' ? 'Chuyển sang tab khác' : 'Rời khỏi cửa sổ bài làm';
      io.to(roomId).emit('peer:update-state', {
        socketId: socket.id,
        state: { isActive: false },
      });
    }

    const timestamp = Date.now();
    roomManager.addParticipantViolationHistory(roomId, socket.id, cleanType, autoReason);

    if (room.hostId) {
      io.to(room.hostId).emit('user:violation', {
        socketId: socket.id,
        type: cleanType,
        violations: violationCount,
        pasteCount,
        violationEntry: { type: cleanType, reason: autoReason, timestamp },
      });
    }
  });

  socket.on('user:copy', ({ roomId, text }) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room) return;
    roomManager.appendCodeEvent(roomId, socket.id, 'copy', { text: String(text || '').slice(0, 300) });
    const stats = roomManager.updateParticipantCopyCount(roomId, socket.id, false);
    if (room.hostId) {
      io.to(room.hostId).emit('user:copy', {
        socketId: socket.id,
        copyCount: stats.copyCount,
      });
    }
  });

  socket.on('user:activity-stats', ({ roomId, added, deleted, timestamp }) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room) return;
    const participant = room.participants.get(socket.id);
    if (!participant) return;

    if (!participant.activityStats) participant.activityStats = [];
    participant.activityStats.push({ timestamp, added, deleted });
    if (participant.activityStats.length > 400) {
      participant.activityStats = participant.activityStats.slice(-300);
    }
    roomManager.markDirty();

    if (room.hostId) {
      io.to(room.hostId).emit('user:activity-stats', {
        socketId: socket.id,
        activityStats: participant.activityStats,
      });
    }
  });

  socket.on('user:violation-reason', ({ roomId, type, reason }) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room) return;
    roomManager.addParticipantViolationHistory(roomId, socket.id, type, reason);
    if (room.hostId) {
      io.to(room.hostId).emit('user:violation-reason', {
        socketId: socket.id,
        type,
        reason,
        timestamp: Date.now(),
      });
    }
  });

  // ─── Code sync / delta / cursor / request ───
  socket.on('code:sync', ({ roomId, targetSocketId, code, language }) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room) return;
    if (typeof code !== 'string') return;

    if (targetSocketId && targetSocketId !== socket.id) {
      if (socket.id !== room.hostId) return;
      const targetParticipant = room.participants.get(targetSocketId);
      if (!targetParticipant) return;
      targetParticipant.code = code;
      if (language) targetParticipant.language = language;
      if (room.isBreakout && room.parentId) {
        const canon = roomManager.resolveCanonicalParticipant(roomId, targetSocketId);
        if (canon && canon.room.id !== room.id) {
          canon.participant.code = code;
          if (language) canon.participant.language = language;
        }
      }
      roomManager.appendCodeEvent(roomId, targetSocketId, 'snap', { text: code });
      io.to(targetSocketId).emit('code:sync', {
        socketId: socket.id,
        code,
        language,
        isTargeted: true,
      });
      return;
    }

    const participant = room.participants.get(socket.id);
    if (participant) {
      participant.code = code;
      if (language) participant.language = language;
      if (room.isBreakout && room.parentId) {
        const canon = roomManager.resolveCanonicalParticipant(roomId, socket.id);
        if (canon && canon.room.id !== room.id) {
          canon.participant.code = code;
          if (language) canon.participant.language = language;
        }
      }
      roomManager.appendCodeEvent(roomId, socket.id, 'snap', { text: code });
    }
    if (socket.id !== room.hostId && room.hostId) {
      io.to(room.hostId).emit('code:sync', {
        socketId: socket.id,
        code,
        language,
      });
    }
  });

  socket.on('code:delta', ({ roomId, targetSocketId, changes, language }) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room || !Array.isArray(changes)) return;

    if (targetSocketId && targetSocketId !== socket.id) {
      if (socket.id !== room.hostId) return;
      const targetPart = room.participants.get(targetSocketId);
      if (!targetPart) return;
      targetPart.code = RoomManager.applyChanges(targetPart.code || '', changes);
      if (language) targetPart.language = language;
      if (room.isBreakout && room.parentId) {
        const canon = roomManager.resolveCanonicalParticipant(roomId, targetSocketId);
        if (canon && canon.room.id !== room.id) {
          canon.participant.code = targetPart.code;
          if (language) canon.participant.language = language;
        }
      }
      roomManager.appendCodeEvent(roomId, targetSocketId, 'snap', { text: targetPart.code });
      io.to(targetSocketId).emit('code:delta', {
        socketId: socket.id,
        changes,
        language,
        isTargeted: true,
      });
      return;
    }

    const selfPart = room.participants.get(socket.id);
    if (selfPart) {
      selfPart.code = RoomManager.applyChanges(selfPart.code || '', changes);
      if (language) selfPart.language = language;
      if (room.isBreakout && room.parentId) {
        const canon = roomManager.resolveCanonicalParticipant(roomId, socket.id);
        if (canon && canon.room.id !== room.id) {
          canon.participant.code = selfPart.code;
          if (language) canon.participant.language = language;
        }
      }
      roomManager.appendCodeEvent(roomId, socket.id, 'snap', { text: selfPart.code });
    }
    if (socket.id !== room.hostId && room.hostId) {
      io.to(room.hostId).emit('code:delta', {
        socketId: socket.id,
        changes,
        language,
      });
    }
  });

  socket.on('cursor:sync', ({ roomId, targetSocketId, cursor }) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room) return;

    if (socket.id === room.hostId) {
      if (targetSocketId && room.participants.get(targetSocketId)?.isConnected) {
        io.to(targetSocketId).emit('cursor:sync', { socketId: socket.id, cursor });
      }
    } else if (room.hostId) {
      io.to(room.hostId).emit('cursor:sync', { socketId: socket.id, cursor });
    }
  });

  socket.on('code:request', ({ roomId, targetSocketId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return;

    const targetParticipant = room.participants.get(targetSocketId);
    if (targetParticipant) {
      socket.emit('code:response', {
        socketId: targetSocketId,
        code: targetParticipant.code || '',
        language: targetParticipant.language || { name: 'python', version: '3.10.0' },
      });
    }
  });

  // ─── Chat ───
  socket.on('chat:send', ({ roomId, message }) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room) return;
    const sender = room.participants.get(socket.id);
    if (!sender) return;

    const text = String(message?.text || '').trim().slice(0, 1000);
    if (!text) return;

    const cleanMsg = {
      senderId: socket.id,
      senderName: sender.name || 'Thành viên',
      text,
      time: Date.now(),
    };
    room.messages.push(cleanMsg);
    if (room.messages.length > 200) {
      room.messages = room.messages.slice(-200);
    }
    roomManager.markDirty();

    io.to(roomId).emit('chat:message', cleanMsg);
  });

  socket.on('chat:history', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room) return;
    socket.emit('chat:history', room.messages);
  });

  // ─── Nhật ký code cho playback — CHỈ host ───
  socket.on('code:history', ({ roomId, targetSocketId }: any, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room) {
      return cb && cb({ error: 'Không có trong phòng' });
    }
    if (socket.id !== room.hostId) {
      return cb && cb({ error: 'Chỉ host mới xem được nhật ký code' });
    }
    const hist = roomManager.getCodeHistory(roomId, targetSocketId);
    if (!hist) return cb && cb({ error: 'Không tìm thấy học viên' });
    cb && cb({ ok: true, ...hist });
  });

  // ─── Bài code đã lưu ───
  socket.on('code:save', ({ roomId, title, code, language, id }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket)) {
      return cb && cb({ error: 'Không có trong phòng' });
    }
    if (typeof code !== 'string') return cb && cb({ error: 'Thiếu nội dung code' });
    if (code.length > 500000) return cb && cb({ error: 'Bài quá dài (giới hạn 500KB)' });
    const res = roomManager.saveCode(roomId, socket.id, title, code, language, id);
    if (!res.ok) return cb && cb({ error: res.error });
    cb && cb({ ok: true, id: res.id, savedAt: res.savedAt });
  });

  socket.on('code:mySaved', ({ roomId }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket)) return cb && cb({ error: 'Không có trong phòng' });
    cb && cb({ ok: true, items: roomManager.listSavedCode(roomId, socket.id) || [] });
  });

  socket.on('code:open', ({ roomId, id }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket)) return cb && cb({ error: 'Không có trong phòng' });
    const s = roomManager.getSavedCode(roomId, socket.id, id);
    if (!s) return cb && cb({ error: 'Không tìm thấy bài' });
    cb && cb({ ok: true, item: s });
  });

  socket.on('code:deleteSaved', ({ roomId, id }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket)) return cb && cb({ error: 'Không có trong phòng' });
    const ok = roomManager.deleteSavedCode(roomId, socket.id, id);
    cb && cb(ok ? { ok: true } : { error: 'Không tìm thấy bài' });
  });

  socket.on('code:ranSaved', ({ roomId, id }: any) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket)) return;
    roomManager.bumpRunCount(roomId, socket.id, id);
  });

  socket.on('code:allSaved', ({ roomId }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return cb && cb({ error: 'Phòng không tồn tại' });
    if (socket.id !== room.hostId) return cb && cb({ error: 'Chỉ giáo viên mới xem được bài của cả lớp' });
    const all = roomManager.getAllSavedCode(roomId) || [];
    cb &&
      cb({
        ok: true,
        students: all
          .filter((s) => s.role !== 'teacher' && s.role !== 'admin' && !s.isHost)
          .map((s) => ({
            socketId: s.socketId,
            name: s.name,
            connected: s.connected,
            savedCount: s.saved.length,
            currentLines: (s.currentCode || '').split('\n').length,
            items: s.saved.map((x) => ({
              id: x.id,
              title: x.title,
              savedAt: x.savedAt,
              lines: (x.code || '').split('\n').length,
              runCount: x.runCount || 0,
            })),
          })),
      });
  });

  socket.on('code:exportZip', ({ roomId }: any, cb: any) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return cb && cb({ error: 'Phòng không tồn tại' });
    if (socket.id !== room.hostId) return cb && cb({ error: 'Chỉ giáo viên mới xuất được bài của lớp' });
    const all = roomManager.getAllSavedCode(roomId) || [];
    const students = all.filter((s) => s.role !== 'teacher' && s.role !== 'admin' && !s.isHost);

    const entries: { name: string; data: string }[] = [];
    const used = new Set<string>();
    const csv: string[][] = [
      [
        'Hoc sinh',
        'So bai da luu',
        'Tong so dong',
        'So lan chay',
        'Dang online',
        'So lan dan code (paste)',
        'So lan copy',
        'Vi pham',
        'Danh sach bai',
      ],
    ];

    for (const s of students) {
      let dir = safeFileName(s.name);
      let n = 2;
      while (used.has(dir)) dir = `${safeFileName(s.name)}-${n++}`;
      used.add(dir);

      let totalLines = 0;
      let totalRuns = 0;
      const titles: string[] = [];
      s.saved.forEach((item, i) => {
        const lines = (item.code || '').split('\n').length;
        totalLines += lines;
        totalRuns += item.runCount || 0;
        const base = safeFileName(item.title) || `bai-${i + 1}`;
        titles.push(item.title);
        const cmt = commentPrefixFor(item.language);
        entries.push({
          name: `${dir}/${String(i + 1).padStart(2, '0')}-${base}.${extForLanguage(item.language)}`,
          data: `${cmt} Học sinh: ${s.name}\n${cmt} Bài: ${item.title}\n${cmt} Lưu lúc: ${new Date(item.savedAt).toLocaleString('vi-VN')}\n${cmt} Số lần chạy: ${item.runCount || 0}\n\n${item.code || ''}\n`,
        });
      });

      const cur = s.currentCode || '';
      if (cur.trim()) {
        const cmtCur = commentPrefixFor(s.language);
        entries.push({
          name: `${dir}/_dang-go-tren-lop.${extForLanguage(s.language)}`,
          data: `${cmtCur} Học sinh: ${s.name}\n${cmtCur} Bản đang gõ trên lớp (chưa bấm Lưu)\n\n${cur}\n`,
        });
      }

      csv.push([
        s.name,
        String(s.saved.length),
        String(totalLines + (cur.trim() ? cur.split('\n').length : 0)),
        String(totalRuns),
        s.connected ? 'Co' : 'Khong',
        String(s.pasteCount || 0),
        String(s.copyCount || 0),
        String(s.violations || 0),
        titles.join(' | '),
      ]);
    }

    const csvText =
      '\uFEFF' +
      csv.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n') +
      '\r\n';
    entries.push({ name: 'BANG-DIEM.csv', data: csvText });
    entries.push({
      name: 'HUONG-DAN.txt',
      data:
        `BÀI CODE HỌC SINH — phòng "${room.name}" (${roomId})\n` +
        `Xuất lúc: ${new Date().toLocaleString('vi-VN')}\n` +
        `Số học sinh: ${students.length}\n\n` +
        `Mỗi học sinh 1 thư mục. Trong đó:\n` +
        `  NN-<tên bài>.<đuôi>  = bài học sinh đã bấm Lưu\n` +
        `  _dang-go-tren-lop.*  = bản đang gõ trên lớp, có thể chưa bấm Lưu\n\n` +
        `BANG-DIEM.csv: mở bằng Excel/Google Sheets để chấm điểm.\n`,
    });

    try {
      const buf = createZip(entries);
      cb &&
        cb({
          ok: true,
          fileName: `bai-code-${safeFileName(room.name)}-${new Date().toISOString().slice(0, 10)}.zip`,
          base64: buf.toString('base64'),
          students: students.length,
          files: entries.length,
        });
    } catch (e: any) {
      cb && cb({ error: 'Không tạo được file ZIP: ' + (e?.message || e) });
    }
  });
};
