import { Room, RoomInfo, Participant } from './types.js';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ─── Serialize/Deserialize Map & Set cho rooms.json ─────────────────
type Any = unknown;
const enc = (v: Any): Any => {
  if (v instanceof Map) return { $M: Array.from(v.entries()).map(([k, x]) => [k, enc(x)]) };
  if (v instanceof Set) return { $S: Array.from(v).map(enc) };
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === 'object') {
    const o: Record<string, Any> = {};
    for (const [k, x] of Object.entries(v as Record<string, Any>)) {
      if (typeof x !== 'function') o[k] = enc(x);
    }
    return o;
  }
  return v;
};
const dec = (v: Any): Any => {
  if (v && typeof v === 'object') {
    const o = v as Record<string, Any>;
    if (Array.isArray(o.$M)) return new Map((o.$M as [string, Any][]).map(([k, x]) => [k, dec(x)]));
    if (Array.isArray(o.$S)) return new Set((o.$S as Any[]).map(dec));
    if (Array.isArray(v)) return (v as Any[]).map(dec);
    const r: Record<string, Any> = {};
    for (const [k, x] of Object.entries(o)) r[k] = dec(x);
    return r;
  }
  return v;
};

export interface CodeEvent {
  t: number;
  k: 'snap' | 'copy' | 'paste';
  text?: string;
  n?: number;
}

export class RoomManager {
  public rooms: Map<string, Room> = new Map();
  private _dirty = false;
  private _saving = false;
  private _lastCount = -1;
  private _pv?: ReturnType<typeof setInterval>;

  static getParticipantKey(
    p: Pick<Participant, 'ccId' | 'sessionToken'>,
    fallbackSocketId: string,
  ): string {
    if (p.ccId) return `cc:${p.ccId}`;
    if (p.sessionToken) return `anon:${p.sessionToken}`;
    return `sock:${fallbackSocketId}`;
  }

  private persistFile(): string {
    return process.env.ROOMS_FILE || path.join(process.cwd(), 'data', 'rooms.json');
  }

  /** Đánh dấu có thay đổi → nền sẽ ghi file sau tối đa 5s (debounce) */
  markDirty(): void {
    this._dirty = true;
    if (this._pv) return;
    this._pv = setInterval(() => {
      if (this._dirty) {
        this._dirty = false;
        void this.saveToFile();
      }
    }, 5000);
    (this._pv as unknown as { unref?: () => void }).unref?.();
  }

  /**
   * Ghi file BẤT ĐỒNG BỘ + guard _saving: rooms.json có thể vài MB — ghi đồng bộ
   * sẽ chặn event loop (video/audio giật). Guard chống ghi chồng khi lần trước chưa xong.
   */
  private async saveToFile(): Promise<void> {
    if (this._saving) return;
    this._saving = true;
    try {
      const out: Record<string, Any> = {};
      for (const [id, r] of this.rooms) {
        // AI history phình: chỉ giữ 60 lượt gần nhất mỗi người
        if (r.aiHistory instanceof Map && r.aiHistory.size) {
          const trimmed = new Map<string, any[]>();
          for (const [k, arr] of r.aiHistory) {
            trimmed.set(k, Array.isArray(arr) && arr.length > 60 ? arr.slice(-60) : arr);
          }
          r.aiHistory = trimmed;
        }
        const rr = enc(r) as Record<string, Any>;
        // chặn phình file: message cũ bỏ bớt, journal đã cap sẵn
        const msgs = rr.messages as Any[] | undefined;
        if (msgs && msgs.length > 400) rr.messages = msgs.slice(-400);
        out[id] = rr;
      }
      const tmp = this.persistFile() + '.tmp';
      await fs.promises.mkdir(path.dirname(this.persistFile()), { recursive: true });
      await fs.promises.writeFile(tmp, JSON.stringify(out));
      // Giữ 1 thế hệ backup trước khi ghi đè — cứu dữ liệu khi có sự cố
      try {
        if (fs.existsSync(this.persistFile())) {
          await fs.promises.copyFile(this.persistFile(), this.persistFile() + '.bak');
        }
      } catch { /* bỏ qua lỗi backup */ }
      await fs.promises.rename(tmp, this.persistFile());
      if (Object.keys(out).length !== this._lastCount) {
        console.log(`[persist] saved ${Object.keys(out).length} rooms`);
        this._lastCount = Object.keys(out).length;
      }
    } catch (e) {
      console.error('[persist] save fail:', (e as Error).message);
    } finally {
      this._saving = false;
    }
  }

  loadFromFile(): void {
    try {
      const p = this.persistFile();
      if (!fs.existsSync(p)) return;
      const data = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, Any>;
      const now = Date.now();
      let n = 0;
      for (const [id, raw] of Object.entries(data)) {
        const r = dec(raw) as Room;
        if (!r || !r.id) continue;
        if (r.createdAt && now - r.createdAt > 30 * 864e5) {
          // Phòng cũ >30 ngày: dọn luôn thư mục uploads kèm theo
          try {
            const uploadsDir = path.join(process.cwd(), 'data', 'uploads', id);
            if (fs.existsSync(uploadsDir)) fs.rmSync(uploadsDir, { recursive: true, force: true });
          } catch { /* noop */ }
          continue;
        }
        if (r.participants instanceof Map) {
          for (const pt of r.participants.values()) {
            pt.isConnected = false;
            pt.isActive = false;
          }
        }
        r.hostId = ''; // host phải join lại để gán socket mới
        r.audioMode = r.audioMode || 'all';
        r.hostFocus = !!r.hostFocus;
        r.audioGroups = Array.isArray(r.audioGroups) ? r.audioGroups : [];
        r.breakoutClosingAt = null;
        this.rooms.set(id, r);
        n++;
      }
      console.log(`[persist] restored ${n} rooms from ${p}`);
      this.markDirty();
    } catch (e) {
      console.error('[persist] load fail:', (e as Error).message);
    }
  }

  isValidHostSecret(room: Room, hostSecret?: string): boolean {
    if (!room.hostSecret || !hostSecret || typeof hostSecret !== 'string') return false;
    const a = Buffer.from(room.hostSecret, 'utf8');
    const b = Buffer.from(hostSecret, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  createRoom(
    name: string,
    password?: string,
    hostName?: string,
    hostSecret?: string,
    opts?: { courseId?: string; hostUserId?: string },
  ): string {
    const roomId = nanoid(8);
    this.markDirty();
    this.rooms.set(roomId, {
      id: roomId,
      name,
      password: password || '',
      hostId: '',
      hostName: hostName || '',
      courseId: opts?.courseId || undefined,
      hostUserId: opts?.hostUserId || undefined,
      hostSecret: hostSecret || crypto.randomBytes(24).toString('hex'),
      participants: new Map(),
      createdAt: Date.now(),
      messages: [],
      pinned: '',
      forcePin: false,
      assignments: [],
      currentAssignmentIndex: 0,
      audioMode: 'all',
      hearHost: [],
      hostFocus: false,
      audioGroups: [],
      breakoutAllowSelfSelect: false,
      breakoutClosingAt: null,
      activeQuiz: null,
      quizResponses: [],
      aiHistory: new Map(),
      musicState: {
        currentTrack: null,
        isPlaying: false,
        startTime: 0,
        poll: null,
      },
    });
    return roomId;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  deleteRoom(roomId: string): boolean {
    this.markDirty();
    return this.rooms.delete(roomId);
  }

  listRooms(): RoomInfo[] {
    // Phòng breakout (nhóm con) KHÔNG hiện trong lobby công khai
    return Array.from(this.rooms.entries())
      .filter(([, r]) => !r.isBreakout)
      .map(([roomId, r]) => ({
        id: roomId,
        name: r.name,
        hostName: r.hostName || '',
        courseId: r.courseId || null,
        locked: Boolean(r.password),
        size: Array.from(r.participants.values()).filter((p) => p.isConnected).length,
        createdAt: r.createdAt,
        activeQuizTitle: r.activeQuiz?.title || r.activeAdaptive?.title || null,
        examMonitoring: Boolean(r.exam?.monitoring),
      }));
  }

  /**
   * Thêm / nối lại thành viên vào phòng.
   * Reconnect CHỈ khớp theo định danh đã xác thực (`ccId` hoặc `sessionToken`) — KHÔNG khớp theo tên thuần.
   * Quyền host chỉ cấp cho giáo viên/admin CodeClass hoặc người giữ `hostSecret` hợp lệ của phòng.
   */
  addParticipant(
    roomId: string,
    socketId: string,
    name: string,
    cc?: { id: string; name: string; role: string; avatarUrl?: string | null } | null,
    sessionToken?: string,
    hostSecret?: string,
  ): boolean {
    this.markDirty();
    const room = this.rooms.get(roomId);
    if (!room) return false;

    let oldSocketId = '';
    let existingData: Participant | null = null;

    for (const [sId, p] of room.participants.entries()) {
      if (cc ? p.ccId === cc.id : Boolean(sessionToken && p.sessionToken === sessionToken)) {
        oldSocketId = sId;
        existingData = p;
        break;
      }
    }

    if (existingData) {
      room.participants.delete(oldSocketId);
      const restored: Participant = {
        ...existingData,
        name: name || existingData.name,
        points: existingData.points || 0,
        violations: existingData.violations || 0,
        pasteCount: existingData.pasteCount || 0,
        isActive: true,
        isConnected: true,
        isHandRaised: false,
      };
      if (sessionToken) restored.sessionToken = sessionToken;
      if (cc) {
        restored.role = cc.role;
        restored.avatar = cc.avatarUrl || null;
        restored.ccId = cc.id;
      }
      room.participants.set(socketId, restored);
    } else {
      const created: Participant = {
        name,
        isMuted: false,
        isCameraOff: false,
        isActive: true,
        isConnected: true,
        points: 0,
        violations: 0,
        pasteCount: 0,
        violationHistory: [],
        activityStats: [],
        codeLog: [],
        sessionToken: sessionToken || undefined,
        joinedAt: Date.now(),
      };
      if (cc) {
        created.role = cc.role;
        created.avatar = cc.avatarUrl || null;
        created.ccId = cc.id;
      }
      room.participants.set(socketId, created);
    }

    const isTeacher = Boolean(cc && (cc.role === 'teacher' || cc.role === 'admin'));
    const validSecret = this.isValidHostSecret(room, hostSecret);
    const curHost = room.hostId ? room.participants.get(room.hostId) : null;
    const curHostIsOnlineTeacher = Boolean(
      curHost &&
        curHost.isConnected &&
        (curHost.role === 'teacher' || curHost.role === 'admin'),
    );

    if (isTeacher && (!curHost?.isConnected || !curHostIsOnlineTeacher || room.hostId === oldSocketId)) {
      room.hostId = socketId;
      if (name) room.hostName = name;
    } else if (validSecret && (!curHost?.isConnected || !curHostIsOnlineTeacher || room.hostId === oldSocketId)) {
      room.hostId = socketId;
      if (!room.hostName && name) room.hostName = name;
    }

    return true;
  }

  updateParticipantState(
    roomId: string,
    socketId: string,
    state: Partial<{ isMuted: boolean; isCameraOff: boolean; isActive: boolean; isHandRaised: boolean }>,
  ): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const participant = room.participants.get(socketId);
    if (!participant) return false;
    room.participants.set(socketId, { ...participant, ...state });
    this.markDirty();
    return true;
  }

  updateParticipantViolation(roomId: string, socketId: string): number {
    const room = this.rooms.get(roomId);
    if (!room) return 0;
    const participant = room.participants.get(socketId);
    if (!participant) return 0;

    participant.violations = (participant.violations || 0) + 1;
    this.markDirty();
    return participant.violations;
  }

  updateParticipantCopyCount(
    roomId: string,
    socketId: string,
    isExternal: boolean = false,
  ): { copyCount: number; pasteCount: number } {
    const room = this.rooms.get(roomId);
    if (!room) return { copyCount: 0, pasteCount: 0 };
    const participant = room.participants.get(socketId);
    if (!participant) return { copyCount: 0, pasteCount: 0 };

    if (isExternal) {
      participant.pasteCount = (participant.pasteCount || 0) + 1;
    } else {
      participant.copyCount = (participant.copyCount || 0) + 1;
    }
    this.markDirty();
    return {
      copyCount: participant.copyCount || 0,
      pasteCount: participant.pasteCount || 0,
    };
  }

  addParticipantViolationHistory(roomId: string, socketId: string, type: string, reason: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const participant = room.participants.get(socketId);
    if (!participant) return false;

    if (!participant.violationHistory) {
      participant.violationHistory = [];
    }
    participant.violationHistory.push({ type, reason, timestamp: Date.now() });
    // Limit to last 100 violations to prevent memory bloat
    if (participant.violationHistory.length > 100) {
      participant.violationHistory = participant.violationHistory.slice(-100);
    }
    this.markDirty();
    return true;
  }

  addAssignment(roomId: string, assignment: { id: string; data: string; type: 'image' | 'pdf'; name: string }): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    room.assignments.push(assignment);
    room.currentAssignmentIndex = room.assignments.length - 1;
    this.markDirty();
    return true;
  }

  deleteAssignment(roomId: string, assignmentId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    room.assignments = room.assignments.filter((a) => a.id !== assignmentId);
    const cur = room.currentAssignmentIndex ?? 0;
    if (cur >= room.assignments.length) {
      room.currentAssignmentIndex = Math.max(0, room.assignments.length - 1);
    }
    this.markDirty();
    return true;
  }

  updateAssignmentsOrder(roomId: string, assignments: any[]): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    room.assignments = assignments;
    const cur = room.currentAssignmentIndex ?? 0;
    if (cur >= room.assignments.length) {
      room.currentAssignmentIndex = Math.max(0, room.assignments.length - 1);
    }
    this.markDirty();
    return true;
  }

  /** Áp các change {rangeOffset,rangeLength,text} (Monaco) vào văn bản. */
  static applyChanges(
    text: string | undefined,
    changes: Array<{ rangeOffset?: number; rangeLength?: number; text?: string }>,
  ): string {
    try {
      let out = text || '';
      const sorted = [...(changes || [])]
        .filter((c) => typeof c.rangeOffset === 'number' && typeof c.text === 'string')
        .sort((a, b) => (b.rangeOffset || 0) - (a.rangeOffset || 0));
      for (const c of sorted) {
        const o = Math.max(0, Math.min(out.length, c.rangeOffset || 0));
        const l = Math.max(0, Math.min(out.length - o, c.rangeLength || 0));
        out = out.slice(0, o) + (c.text || '') + out.slice(o + l);
      }
      return out;
    } catch {
      return text || '';
    }
  }

  /**
   * Ánh xạ thành viên phòng breakout về hồ sơ chuẩn ở lớp chính (mainRoom)
   * để bài lưu (`savedCode`) và nhật ký playback (`codeLog`) không bị mất khi đóng nhóm.
   */
  resolveCanonicalParticipant(
    roomId: string,
    socketId: string,
  ): { room: Room; socketId: string; participant: Participant } | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const p = room.participants.get(socketId);
    if (!p) return null;
    if (room.isBreakout && room.parentId) {
      const main = this.rooms.get(room.parentId);
      if (main) {
        const key = RoomManager.getParticipantKey(p, socketId);
        for (const [mSid, mP] of main.participants.entries()) {
          if (RoomManager.getParticipantKey(mP, mSid) === key) {
            return { room: main, socketId: mSid, participant: mP };
          }
        }
        const linked: Participant = {
          ...p,
          isConnected: false,
          isActive: false,
          savedCode: p.savedCode ? [...p.savedCode] : [],
          codeLog: p.codeLog ? [...p.codeLog] : [],
        };
        main.participants.set(socketId, linked);
        this.markDirty();
        return { room: main, socketId, participant: linked };
      }
    }
    return { room, socketId, participant: p };
  }

  /** Ghi journal playback dạng chuỗi snapshot theo timestamp (merge snapshot sát nhau). */
  appendCodeEvent(roomId: string, socketId: string, kind: 'snap' | 'copy' | 'paste', payload: { text?: string }): void {
    this.markDirty();
    const resolved = this.resolveCanonicalParticipant(roomId, socketId);
    const p = resolved?.participant;
    if (!p) return;
    if (!p.codeLog) p.codeLog = [];
    const log = p.codeLog;
    const now = Date.now();
    const last = log[log.length - 1];
    if (kind === 'snap') {
      const text = String(payload?.text || '');
      if (last && last.k === 'snap' && now - last.t < 600) {
        last.text = text;
        last.t = now;
        return;
      }
      // chặn cấp phát khi code quá dài: chỉ giữ 8KB gần nhất làm "nháp" playback
      log.push({ t: now, k: 'snap', text: text.length > 8192 ? text.slice(0, 8192) : text });
    } else {
      // copy / paste markers (gộp đếm trong 3s), giữ lại đoạn text để highlight playback
      const txt = String(payload?.text || '').slice(0, 300);
      if (last && last.k === kind && now - last.t < 3000) {
        last.n = (last.n || 1) + 1;
        last.t = now;
        if (txt) last.text = txt;
        return;
      }
      log.push({ t: now, k: kind, n: 1, text: txt || undefined });
    }
    if (log.length > 500) log.splice(0, log.length - 420); // giữ cuối + 420 mốc gần nhất
  }

  /** Snapshot đầy đủ cho playback: code hiện tại + journal + mốc thời gian. */
  getCodeHistory(roomId: string, socketId: string) {
    const resolved = this.resolveCanonicalParticipant(roomId, socketId);
    const p = resolved?.participant;
    if (!p) return null;
    const size = (p.code || '').length + JSON.stringify(p.codeLog || []).length;
    // nếu journal phình > ~1.5MB → gộp về snapshot hiện tại
    const log = size > 1500000 ? [{ t: Date.now(), k: 'snap' as const, text: p.code || '', n: 1 }] : (p.codeLog || []);
    return {
      code: p.code || '',
      log,
      language: p.language || null,
      startedAt: log.length ? log[0].t : (p.joinedAt || Date.now()),
      copyCount: p.copyCount || 0,
      pasteCount: p.pasteCount || 0,
    };
  }

  // ─── Bài code đã lưu (để chấm điểm) ───────────────────────────────

  /** Lưu 1 bài mới, hoặc ghi đè nếu trùng id (học sinh sửa lại bài cũ). */
  saveCode(
    roomId: string,
    socketId: string,
    title: string,
    code: string,
    language?: { name: string; version: string },
    id?: string,
  ): { ok: true; id: string; savedAt: number } | { ok: false; error: string } {
    const resolved = this.resolveCanonicalParticipant(roomId, socketId);
    const p = resolved?.participant;
    if (!p) return { ok: false, error: 'Không có trong phòng' };
    if (!p.savedCode) p.savedCode = [];
    const clean = String(title || '').trim().slice(0, 120) || 'Bài chưa đặt tên';
    const now = Date.now();
    if (id) {
      const found = p.savedCode.find((s) => s.id === id);
      if (found) {
        found.title = clean;
        found.code = code || '';
        if (language) found.language = language;
        found.savedAt = now;
        this.markDirty();
        return { ok: true, id: found.id, savedAt: now };
      }
    }
    const rec = {
      id: nanoid(10),
      title: clean,
      code: code || '',
      language: language || { name: 'python', version: '3.10.0' },
      savedAt: now,
      runCount: 0,
    };
    p.savedCode.push(rec);
    this.markDirty();
    return { ok: true, id: rec.id, savedAt: now };
  }

  /** Danh sách bài đã lưu của 1 người (KHÔNG kèm code — nhẹ để gửi đi). */
  listSavedCode(roomId: string, socketId: string) {
    const resolved = this.resolveCanonicalParticipant(roomId, socketId);
    const p = resolved?.participant;
    if (!p) return null;
    return (p.savedCode || [])
      .slice()
      .sort((a, b) => b.savedAt - a.savedAt)
      .map((s) => ({
        id: s.id,
        title: s.title,
        savedAt: s.savedAt,
        lastOpenedAt: s.lastOpenedAt || null,
        runCount: s.runCount || 0,
        lines: (s.code || '').split('\n').length,
        language: s.language,
      }));
  }

  /** Lấy đầy đủ 1 bài (kèm code) để học sinh mở lại chỉnh sửa. */
  getSavedCode(roomId: string, socketId: string, id: string) {
    const resolved = this.resolveCanonicalParticipant(roomId, socketId);
    const p = resolved?.participant;
    if (!p) return null;
    const s = (p.savedCode || []).find((x) => x.id === id);
    if (!s) return null;
    s.lastOpenedAt = Date.now();
    this.markDirty();
    return s;
  }

  /** Xoá 1 bài đã lưu. */
  deleteSavedCode(roomId: string, socketId: string, id: string): boolean {
    const resolved = this.resolveCanonicalParticipant(roomId, socketId);
    const p = resolved?.participant;
    if (!p || !p.savedCode) return false;
    const before = p.savedCode.length;
    p.savedCode = p.savedCode.filter((s) => s.id !== id);
    if (p.savedCode.length === before) return false;
    this.markDirty();
    return true;
  }

  /** Tăng đếm số lần chạy bài (giáo viên tham khảo khi chấm). */
  bumpRunCount(roomId: string, socketId: string, id: string): void {
    const resolved = this.resolveCanonicalParticipant(roomId, socketId);
    const p = resolved?.participant;
    const s = p && (p.savedCode || []).find((x) => x.id === id);
    if (!s) return;
    s.runCount = (s.runCount || 0) + 1;
    s.lastOpenedAt = Date.now();
    this.markDirty();
  }

  /**
   * Toàn bộ bài đã lưu của MỌI người trong phòng — cho giáo viên xuất file.
   * Gộp cả người đã rời phòng (isConnected=false) vì bài vẫn cần chấm.
   */
  getAllSavedCode(roomId: string) {
    let room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.isBreakout && room.parentId) {
      room = this.rooms.get(room.parentId) || room;
    }
    return Array.from(room.participants.entries()).map(([socketId, p]) => ({
      socketId,
      name: p.name,
      role: p.role || null,
      isHost: socketId === room.hostId,
      connected: !!p.isConnected,
      currentCode: p.code || '',
      language: p.language || { name: 'python', version: '3.10.0' },
      saved: (p.savedCode || []).slice().sort((a, b) => a.savedAt - b.savedAt),
      violations: p.violations || 0,
      pasteCount: p.pasteCount || 0,
      copyCount: p.copyCount || 0,
    }));
  }

  removeParticipant(roomId: string, socketId: string, handoff = true): string | null {
    this.markDirty();
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const participant = room.participants.get(socketId);
    if (participant) {
      participant.isActive = false;
      participant.isConnected = false; // đánh dấu đã ngắt → không còn là "ma" trong peers/list
      participant.isHandRaised = false;
    }

    // Chỉ TRAO HOST khi host MẤT KẾT NỐI (đóng trang / mất mạng) — KHÔNG trao khi
    // host rời phòng tạm thời (ghé thăm phòng nhóm) vì host sẽ quay lại ngay.
    // CHỈ trao cho giáo viên/admin còn trực tuyến.
    if (handoff && socketId === room.hostId) {
      const online = Array.from(room.participants.entries())
        .filter(([id, p]) => id !== socketId && p.isConnected);
      const teacher = online.find(([, p]) => p.role === 'teacher' || p.role === 'admin');
      if (teacher) {
        room.hostId = teacher[0];
      } else {
        room.hostId = ''; // không ai đủ quyền → để trống, giáo viên hoặc người có hostSecret vào lại sẽ nhận
      }
    }

    return null;
  }

  isRoomEmpty(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return true;
    return Array.from(room.participants.values()).every((p) => !p.isConnected);
  }
}

export const roomManager = new RoomManager();
