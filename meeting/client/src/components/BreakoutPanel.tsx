/**
 * BreakoutPanel — giao diện quản lý Phòng nhóm (được dock gọn trong SidebarTemplate).
 *
 * Host: tạo N nhóm (Tự động chia đều / Tạo phòng trước thủ công / Cho HS tự chọn),
 *       đổi tên / thêm / xóa từng nhóm lẻ, kéo HS vào nhóm, gọi về sau 30s hoặc gọi ngay,
 *       gửi thông báo tới mọi nhóm.
 * Học sinh: khi Host bật "Cho phép tự chọn", xem danh sách nhóm và bấm "Tham gia";
 *           khi ở trong nhóm, thấy đếm ngược, nút "Về lớp chính" và nút "Cần giúp đỡ".
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Plus,
  X,
  PhoneCall,
  Timer,
  Megaphone,
  DoorOpen,
  CornerUpLeft,
  LifeBuoy,
  Edit3,
  Trash2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { useMeetingStore } from '../store/useMeetingStore';
import { socket } from '../services/socket';
import { switchRoom } from '../lib/roomSwitch';
import { toast, uiConfirm, uiPrompt } from '../store/useUiStore';

interface BrkRoom {
  id: string;
  name: string;
  members: Array<{ socketId: string; name: string }>;
}

interface BrkList {
  rooms: BrkRoom[];
  mainMembers: Array<{ socketId: string; name: string }>;
  endsAt: number | null;
  closingAt?: number | null;
  allowSelfSelect?: boolean;
}

const fmtLeft = (ms: number): string => {
  if (ms <= 0) return '00:00';
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const BreakoutPanel: React.FC = () => {
  const isHost = useMeetingStore((s) => s.isHost);
  const roomId = useMeetingStore((s) => s.roomId);
  const isBreakout = useMeetingStore((s) => s.isBreakout);
  const parentId = useMeetingStore((s) => s.parentId);
  const breakoutEndsAt = useMeetingStore((s) => s.breakoutEndsAt);
  const breakoutSummary = useMeetingStore((s) => s.breakoutSummary);
  const breakoutHelpAlerts = useMeetingStore((s) => s.breakoutHelpAlerts);
  const clearBreakoutHelpAlert = useMeetingStore((s) => s.clearBreakoutHelpAlert);

  const mainRoomId = isBreakout ? parentId : roomId;

  const [list, setList] = useState<BrkList | null>(null);
  const [count, setCount] = useState(2);
  const [minutes, setMinutes] = useState(15);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [allowSelfSelect, setAllowSelfSelect] = useState(false);
  const [customNames, setCustomNames] = useState<string[]>(['Nhóm 1', 'Nhóm 2']);
  const [broadcast, setBroadcast] = useState('');
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState<string | null>(null);
  const [helpCooldown, setHelpCooldown] = useState(false);
  const helpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCustomNames((prev) =>
      Array.from({ length: count }, (_, i) => prev[i] || `Nhóm ${i + 1}`),
    );
  }, [count]);

  useEffect(() => {
    return () => {
      if (helpTimerRef.current) clearTimeout(helpTimerRef.current);
    };
  }, []);

  const refresh = useCallback((): (() => void) | undefined => {
    if (!mainRoomId) return undefined;
    if (isHost) {
      const t = setTimeout(
        () =>
          socket.emit('breakout:list', { roomId: mainRoomId }, (r: any) => {
            if (r && !r.error) {
              const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'vi');
              r.rooms?.forEach((rm: BrkRoom) => rm.members?.sort(byName));
              r.mainMembers?.sort(byName);
              setList(r);
            }
          }),
        100,
      );
      return () => clearTimeout(t);
    } else if (roomId) {
      const t = setTimeout(
        () =>
          socket.emit('breakout:publicList', { roomId }, (r: any) => {
            if (r && r.ok) useMeetingStore.getState().setBreakoutSummary(r);
          }),
        100,
      );
      return () => clearTimeout(t);
    }
    return undefined;
  }, [mainRoomId, roomId, isHost]);

  useEffect(() => {
    const cleanup = refresh();
    const iv = setInterval(() => refresh(), 5000);
    return () => {
      if (cleanup) cleanup();
      clearInterval(iv);
    };
  }, [refresh]);

  useEffect(() => {
    if (!breakoutEndsAt) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [breakoutEndsAt]);

  const act = (ev: string, payload: any) =>
    new Promise<any>((res) => {
      const t = setTimeout(() => res({ error: 'Hết thời gian chờ — mạng chậm, thử lại' }), 8000);
      socket.emit(ev, payload, (r: any) => {
        clearTimeout(t);
        res(r);
      });
    });

  const withPending = async (key: string, fn: () => Promise<any>) => {
    if (pending) return;
    setPending(key);
    try {
      await fn();
    } finally {
      setPending(null);
    }
  };

  const create = () =>
    withPending('create', async () => {
      const r = await act('breakout:create', {
        roomId: mainRoomId,
        count,
        minutes,
        mode,
        allowSelfSelect,
        names: customNames.slice(0, count),
      });
      if (r && r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(mode === 'manual' ? `Đã tạo ${count} phòng trống để gán thành viên` : `Đã chia ${count} phòng nhóm`);
      refresh();
    });

  const addRoom = () =>
    withPending('addRoom', async () => {
      const r = await act('breakout:addRoom', { roomId: mainRoomId });
      if (r && r.error) toast.error(r.error);
      else refresh();
    });

  const renameRoom = async (b: BrkRoom) => {
    const nextName = await uiPrompt('Nhập tên mới cho phòng nhóm:', {
      title: 'Đổi tên nhóm',
      defaultValue: b.name,
      confirmLabel: 'Lưu tên',
    });
    if (!nextName || !nextName.trim()) return;
    const r = await act('breakout:renameRoom', {
      roomId: mainRoomId,
      breakoutId: b.id,
      name: nextName.trim(),
    });
    if (r && r.error) toast.error(r.error);
    else refresh();
  };

  const deleteRoom = async (b: BrkRoom) => {
    if (!(await uiConfirm(`Xóa nhóm "${b.name}"? Học viên trong nhóm này sẽ được đưa về lớp chính.`, { title: 'Xóa nhóm lẻ', danger: true }))) {
      return;
    }
    const r = await act('breakout:deleteRoom', { roomId: mainRoomId, breakoutId: b.id });
    if (r && r.error) toast.error(r.error);
    else refresh();
  };

  const toggleSelfSelect = (next: boolean) =>
    withPending('settings', async () => {
      const r = await act('breakout:setSettings', { roomId: mainRoomId, allowSelfSelect: next });
      if (r && r.error) toast.error(r.error);
      else refresh();
    });

  const recall = (graceSeconds = 0) =>
    withPending('recall', async () => {
      const msg = graceSeconds > 0
        ? `Thông báo và tự động gọi TẤT CẢ học sinh về lớp chính sau ${graceSeconds} giây?`
        : 'Gọi TẤT CẢ học sinh về lớp chính ngay lập tức? (Các phòng nhóm vẫn giữ để vào lại)';
      if (!(await uiConfirm(msg, { title: 'Gọi về lớp chính', confirmLabel: graceSeconds > 0 ? `Gọi sau ${graceSeconds}s` : 'Gọi ngay' }))) {
        return;
      }
      const r = await act('breakout:recall', { roomId: mainRoomId, graceSeconds });
      if (r && r.error) {
        toast.error(r.error);
        return;
      }
      refresh();
    });

  const closeAll = (graceSeconds = 0) =>
    withPending('close', async () => {
      const msg = graceSeconds > 0
        ? `Đóng TẤT CẢ phòng nhóm và đưa mọi người về lớp chính sau ${graceSeconds} giây?`
        : 'Kết thúc và đóng ngay TẤT CẢ phòng nhóm?';
      if (!(await uiConfirm(msg, { title: 'Kết thúc phòng nhóm', danger: true }))) {
        return;
      }
      const r = await act('breakout:close', { roomId: mainRoomId, graceSeconds });
      if (r && r.error) {
        toast.error(r.error);
        return;
      }
      if (graceSeconds === 0) setList(null);
      refresh();
    });

  const setTimer = () =>
    withPending('timer', async () => {
      const r = await act('breakout:timer', { roomId: mainRoomId, minutes });
      if (r && r.error) toast.error(r.error);
      else refresh();
    });

  const clearTimer = () =>
    withPending('timer-off', async () => {
      const r = await act('breakout:timer', { roomId: mainRoomId, minutes: 0 });
      if (r && r.error) toast.error(r.error);
      else refresh();
    });

  const sendBroadcast = () =>
    withPending('broadcast', async () => {
      if (!broadcast.trim()) return;
      const r = await act('breakout:broadcast', { roomId: mainRoomId, message: broadcast });
      if (r && r.error) {
        toast.error(r.error);
        return;
      }
      setBroadcast('');
      toast.success('Đã phát thông báo tới mọi nhóm');
    });

  const visit = (bid: string) => {
    clearBreakoutHelpAlert(bid);
    switchRoom(bid, undefined, (res) => {
      if (res && res.ok && bid) {
        const st = useMeetingStore.getState();
        socket.emit('chat:send', {
          roomId: bid,
          message: { senderId: socket.id, senderName: st.userName || 'Host', text: 'Thầy/cô đã vào nhóm cùng các em', time: Date.now() },
        });
      }
    });
  };

  const selfJoin = (targetId: string) => {
    if (!roomId) return;
    socket.emit('breakout:selfJoin', { roomId, targetId }, (r: any) => {
      if (r && r.error) toast.error(r.error);
    });
  };

  const sendHelp = () => {
    if (!roomId || helpCooldown) return;
    socket.emit('breakout:help', { roomId });
    setHelpCooldown(true);
    toast.success('Đã gửi tín hiệu cần hỗ trợ tới giáo viên');
    if (helpTimerRef.current) clearTimeout(helpTimerRef.current);
    helpTimerRef.current = setTimeout(() => setHelpCooldown(false), 10000);
  };

  const endsLeft = breakoutEndsAt ? breakoutEndsAt - now : 0;
  const showCountdown = breakoutEndsAt && endsLeft > 0;

  // ─── PHÍA HỌC SINH ───
  if (!isHost) {
    const rooms = breakoutSummary?.rooms || [];
    const canSelfPick = !!breakoutSummary?.allowSelfSelect;
    return (
      <div className="flex-1 space-y-3 overflow-y-auto p-3 custom-scrollbar">
        {isBreakout && parentId && (
          <div className="space-y-2 rounded-card border border-line bg-overlay p-3">
            {showCountdown && (
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-accent">
                <Clock size={13} /> Tự về lớp chính sau {fmtLeft(endsLeft)}
              </div>
            )}
            <button
              onClick={sendHelp}
              disabled={helpCooldown}
              className="flex w-full items-center justify-center gap-2 rounded-ctl border border-line-strong bg-elevated px-3 py-2 text-xs font-semibold text-white transition-all hover:border-accent disabled:opacity-50"
            >
              <LifeBuoy size={14} className="text-ok" />
              {helpCooldown ? 'Đã báo thầy/cô ✓' : 'Cần thầy/cô giúp đỡ'}
            </button>
            {canSelfPick && (
              <button
                onClick={() => selfJoin(parentId)}
                className="flex w-full items-center justify-center gap-2 rounded-ctl bg-accent px-3 py-2 text-xs font-bold text-accent-ink hover:brightness-110"
              >
                <CornerUpLeft size={14} /> Về lớp chính
              </button>
            )}
          </div>
        )}

        {canSelfPick && rooms.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Chọn phòng nhóm để vào ({rooms.length})
            </div>
            {rooms.map((b) => {
              const isHere = roomId === b.id;
              return (
                <div
                  key={b.id}
                  className={`flex items-center justify-between rounded-card border p-3 ${
                    isHere ? 'border-accent bg-accent/10' : 'border-line bg-overlay'
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{b.name}</div>
                    <div className="text-[11px] text-muted">{b.size} thành viên</div>
                  </div>
                  {isHere ? (
                    <span className="rounded-full bg-accent/20 px-2.5 py-0.5 text-[10px] font-bold text-accent">
                      Đang ở đây
                    </span>
                  ) : (
                    <button
                      onClick={() => selfJoin(b.id)}
                      className="rounded-ctl bg-accent px-3 py-1.5 text-xs font-bold text-accent-ink hover:brightness-110"
                    >
                      Tham gia
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : !isBreakout ? (
          <div className="rounded-card border border-line bg-overlay p-5 text-center text-xs text-muted">
            Chờ giáo viên chia phòng nhóm hoặc mở quyền tự chọn phòng.
          </div>
        ) : null}
      </div>
    );
  }

  // ─── PHÍA HOST ───
  const activeRooms = list?.rooms || [];

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-3 custom-scrollbar">
      {isBreakout && parentId && (
        <button
          onClick={() => switchRoom(parentId, undefined)}
          className="flex w-full items-center justify-center gap-2 rounded-ctl bg-accent px-3 py-2 text-xs font-bold text-accent-ink hover:brightness-110"
        >
          <CornerUpLeft size={14} /> Quay về lớp chính
        </button>
      )}

      {/* Tạo phòng nhóm khi chưa có phòng nào */}
      {activeRooms.length === 0 && (
        <div className="space-y-3 rounded-card border border-line bg-overlay p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Plus size={14} className="text-accent" /> Thiết lập phòng nhóm
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">Số lượng nhóm</span>
              <input
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 2)))}
                className="w-full rounded-ctl border border-line bg-base px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">Hẹn giờ (phút)</span>
              <input
                type="number"
                min={0}
                max={240}
                value={minutes}
                onChange={(e) => setMinutes(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-ctl border border-line bg-base px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="block text-[11px] text-muted">Cách phân chia</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setMode('auto')}
                className={`rounded-ctl border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  mode === 'auto'
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line bg-base text-muted hover:text-white'
                }`}
              >
                Chia đều tự động
              </button>
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`rounded-ctl border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  mode === 'manual'
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line bg-base text-muted hover:text-white'
                }`}
              >
                Tạo phòng trống
              </button>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-ctl border border-line bg-base px-2.5 py-2 text-xs">
            <span className="text-white/90">Cho phép học sinh tự chọn nhóm</span>
            <input
              type="checkbox"
              checked={allowSelfSelect}
              onChange={(e) => setAllowSelfSelect(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
            />
          </label>

          {/* Tên các nhóm */}
          <div className="space-y-1.5">
            <span className="block text-[11px] text-muted">Tên các phòng nhóm</span>
            <div className="max-h-32 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
              {customNames.map((nm, i) => (
                <input
                  key={i}
                  value={nm}
                  onChange={(e) => {
                    const next = [...customNames];
                    next[i] = e.target.value;
                    setCustomNames(next);
                  }}
                  placeholder={`Nhóm ${i + 1}`}
                  className="w-full rounded border border-line bg-base px-2.5 py-1 text-xs text-white outline-none focus:border-accent"
                />
              ))}
            </div>
          </div>

          <button
            onClick={create}
            disabled={!!pending}
            className="w-full rounded-ctl bg-accent py-2 text-xs font-bold text-accent-ink hover:brightness-110 disabled:opacity-50"
          >
            Tạo {count} phòng nhóm
          </button>
        </div>
      )}

      {/* Danh sách phòng nhóm đang mở */}
      {activeRooms.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-white/85">
              <input
                type="checkbox"
                checked={!!list?.allowSelfSelect}
                onChange={(e) => toggleSelfSelect(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
              />
              HS tự chọn nhóm
            </label>
            <button
              onClick={addRoom}
              disabled={!!pending || activeRooms.length >= 10}
              className="flex items-center gap-1 rounded-ctl border border-line-strong bg-overlay px-2.5 py-1 text-[11px] font-semibold text-white hover:border-accent hover:text-accent disabled:opacity-40"
            >
              <Plus size={12} /> Thêm nhóm
            </button>
          </div>

          <div className="space-y-2">
            {activeRooms.map((b) => {
              const helpInfo = breakoutHelpAlerts[b.id];
              return (
                <div
                  key={b.id}
                  className={`rounded-card border p-2.5 ${
                    helpInfo ? 'border-danger/60 bg-danger/10' : 'border-line bg-overlay'
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-xs font-bold text-white">{b.name}</span>
                      <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] text-muted">
                        {b.members.length}
                      </span>
                      {helpInfo && (
                        <span className="animate-pulse rounded-full bg-danger px-1.5 py-0.5 text-[9px] font-bold text-white">
                          Cần giúp
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => renameRoom(b)}
                        className="rounded p-1 text-muted hover:bg-line hover:text-white"
                        title="Đổi tên nhóm"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => deleteRoom(b)}
                        className="rounded p-1 text-muted hover:bg-danger/20 hover:text-danger"
                        title="Xóa nhóm này"
                      >
                        <Trash2 size={12} />
                      </button>
                      <button
                        onClick={() => visit(b.id)}
                        disabled={!!pending || roomId === b.id}
                        className="flex items-center gap-1 rounded-ctl bg-elevated px-2 py-1 text-[10px] font-semibold text-white hover:bg-accent hover:text-accent-ink disabled:opacity-50"
                        title="Ghé thăm phòng này"
                      >
                        <DoorOpen size={11} /> {roomId === b.id ? 'Đang ở' : 'Vào'}
                      </button>
                    </div>
                  </div>
                  {b.members.length === 0 ? (
                    <p className="text-[10px] text-muted">(chưa có học viên)</p>
                  ) : (
                    <div className="space-y-1">
                      {b.members.map((m) => (
                        <div key={m.socketId} className="flex items-center justify-between text-[11px] text-white/85">
                          <span className="truncate">{m.name}</span>
                          <button
                            onClick={async () => {
                              const r = await act('breakout:assign', { roomId: mainRoomId, socketId: m.socketId, targetId: mainRoomId });
                              if (r && r.error) toast.error(r.error);
                              else refresh();
                            }}
                            className="rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-line hover:text-white"
                            title="Gọi riêng người này về lớp chính"
                          >
                            về lớp
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Thành viên chưa vào nhóm nào */}
            {list && list.mainMembers.length > 0 && (
              <div className="rounded-card border border-warn/40 bg-warn/10 p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-warn">
                  <AlertCircle size={13} />
                  Chưa vào nhóm ({list.mainMembers.length} em đang ở lớp chính)
                </div>
                {list.mainMembers.map((m) => (
                  <div key={m.socketId} className="flex items-center justify-between py-0.5 text-[11px] text-white/90">
                    <span className="truncate">{m.name}</span>
                    <select
                      defaultValue=""
                      onChange={async (e) => {
                        const targetId = e.target.value;
                        if (!targetId) return;
                        const r = await act('breakout:assign', { roomId: mainRoomId, socketId: m.socketId, targetId });
                        if (r && r.error) toast.error(r.error);
                        else refresh();
                        e.target.value = '';
                      }}
                      className="rounded border border-line bg-base px-1.5 py-0.5 text-[10px] text-white outline-none focus:border-accent"
                    >
                      <option value="">cho vào →</option>
                      {activeRooms.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hẹn giờ + Gọi về / Đóng */}
          <div className="space-y-2 rounded-card border border-line bg-overlay p-2.5">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[11px] text-muted">
                <Timer size={12} /> Phút
                <input
                  type="number"
                  min={0}
                  max={240}
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(0, Number(e.target.value) || 0))}
                  className="w-14 rounded border border-line bg-base px-1.5 py-1 text-white outline-none"
                />
              </label>
              <button
                onClick={setTimer}
                disabled={!!pending}
                className="rounded-ctl bg-elevated px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-line-strong"
              >
                Đặt giờ
              </button>
              {showCountdown && (
                <button
                  onClick={clearTimer}
                  disabled={!!pending}
                  className="ml-auto flex items-center gap-1 rounded-ctl bg-accent/15 px-2 py-1 text-[11px] font-bold text-accent"
                  title="Bấm để tắt hẹn giờ"
                >
                  {fmtLeft(endsLeft)} <X size={11} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => recall(30)}
                disabled={!!pending}
                className="flex items-center justify-center gap-1 rounded-ctl bg-elevated px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-line-strong"
                title="Báo trước 30 giây rồi gọi học sinh về lớp chính"
              >
                <PhoneCall size={12} /> Gọi về (30s)
              </button>
              <button
                onClick={() => recall(0)}
                disabled={!!pending}
                className="flex items-center justify-center gap-1 rounded-ctl bg-elevated px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-line-strong"
                title="Gọi ngay mọi học sinh về lớp chính"
              >
                <PhoneCall size={12} /> Gọi về ngay
              </button>
              <button
                onClick={() => closeAll(30)}
                disabled={!!pending}
                className="flex items-center justify-center gap-1 rounded-ctl border border-danger/40 bg-danger/15 px-2 py-1.5 text-[11px] font-semibold text-danger hover:bg-danger/25"
              >
                <X size={12} /> Đóng (30s)
              </button>
              <button
                onClick={() => closeAll(0)}
                disabled={!!pending}
                className="flex items-center justify-center gap-1 rounded-ctl bg-danger px-2 py-1.5 text-[11px] font-bold text-white hover:brightness-110"
              >
                <X size={12} /> Đóng ngay
              </button>
            </div>
          </div>

          {/* Thông báo tới mọi nhóm */}
          <div className="rounded-card border border-line bg-overlay p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-white">
              <Megaphone size={13} className="text-accent" /> Thông báo tới mọi nhóm
            </div>
            <div className="flex gap-2">
              <input
                value={broadcast}
                onChange={(e) => setBroadcast(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendBroadcast(); }}
                placeholder="Ví dụ: còn 2 phút trở lại lớp…"
                className="min-w-0 flex-1 rounded border border-line bg-base px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
              />
              <button
                onClick={sendBroadcast}
                className="rounded-ctl bg-accent px-3 py-1.5 text-xs font-bold text-accent-ink hover:brightness-110"
              >
                Gửi
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default BreakoutPanel;
