/**
 * ExamMonitorPanel — giao diện GIÁM SÁT THI toàn màn hình (chỉ host).
 *
 * Bố cục theo yêu cầu:
 *  - Bình thường: LƯỚI TỰ ĐỘNG chia cột theo bề rộng màn hình.
 *  - Khi GHIM 1 em: bố cục "1 lớn bên trái + cột nhỏ bên phải" (kiểu Zoom).
 *  - Ảo hoá: chỉ render ô trong tầm nhìn → lớp 30-50 em không treo máy host.
 *
 * GIỚI HẠN ĐÃ BIẾT: trình duyệt không cho tự động chia sẻ màn hình, nên
 * "bắt buộc" chỉ đạt được bằng overlay ở máy học sinh (ExamSharePrompt).
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  MonitorUp, Pin, PinOff, Play, Square, AlertTriangle, CheckCircle2, Users,
  Minimize2, Maximize2, X, Loader2, FileArchive, Headphones, Code2, ShieldAlert,
} from 'lucide-react';
import { useMeetingStore } from '../store/useMeetingStore';
import { socket } from '../services/socket';
import { setAudioAll, toggleSoloPeer } from '../lib/audioActions';

/** Kích thước tối thiểu 1 ô trong lưới tự động (px) */
const MIN_TILE_W = 260;
const MIN_TILE_W_ZOOMED = 440;
const TILE_ASPECT = 0.62;   // cao/rộng — ô ngang kiểu màn hình
const OVERSCAN = 4;         // render thêm ngoài tầm nhìn cho cuộn mượt

const hasLiveScreen = (stream: MediaStream | null | undefined): boolean =>
  Boolean(stream && stream.getVideoTracks().some((t) => t.readyState === 'live'));

const SURFACE_WARNING: Record<string, string> = {
  browser: 'Chỉ 1 tab',
  window: 'Chỉ 1 cửa sổ',
};

interface Props {
  /** Đang ở chế độ toàn màn hình (mở từ tab sidebar) */
  fullscreen?: boolean;
  onExit?: () => void;
}

export const ExamMonitorPanel: React.FC<Props> = ({ fullscreen = false, onExit }) => {
  const peers = useMeetingStore((s) => s.peers);
  const roomId = useMeetingStore((s) => s.roomId);
  const hostId = useMeetingStore((s) => s.hostId);
  const remoteScreen = useMeetingStore((s) => s.remoteScreenStreams);
  const examMonitoring = useMeetingStore((s) => s.examMonitoring);
  const examRequireShare = useMeetingStore((s) => s.examRequireShare);
  const examPinnedScreenId = useMeetingStore((s) => s.examPinnedScreenId);
  const examShareStatus = useMeetingStore((s) => s.examShareStatus);
  const examShareSurface = useMeetingStore((s) => s.examShareSurface);
  const audioMode = useMeetingStore((s) => s.audioMode);
  const hearHost = useMeetingStore((s) => s.hearHost);
  const setExamMonitoring = useMeetingStore((s) => s.setExamMonitoring);
  const setExamRequireShare = useMeetingStore((s) => s.setExamRequireShare);
  const setExamPinnedScreenId = useMeetingStore((s) => s.setExamPinnedScreenId);
  const hydrateExamShareStatus = useMeetingStore((s) => s.hydrateExamShareStatus);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'flagged' | 'pending'>('all');
  const [violationModalId, setViolationModalId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [box, setBox] = useState({ w: 900, h: 600 });
  const [zoomed, setZoomed] = useState(false);

  const students = useMemo(
    () => peers.filter((p) => p.socketId !== hostId),
    [peers, hostId],
  );
  const sharingCount = students.filter((p) => hasLiveScreen(remoteScreen[p.socketId])).length;
  const pending = students.filter((p) => !hasLiveScreen(remoteScreen[p.socketId]));
  const flaggedCount = students.filter((p) => (p.violations || 0) > 0 || (p.pasteCount || 0) > 0 || p.isActive === false).length;

  const filteredStudents = useMemo(() => {
    if (filterMode === 'flagged') {
      return students.filter((p) => (p.violations || 0) > 0 || (p.pasteCount || 0) > 0 || p.isActive === false);
    }
    if (filterMode === 'pending') {
      return students.filter((p) => !hasLiveScreen(remoteScreen[p.socketId]));
    }
    return students;
  }, [students, filterMode, remoteScreen]);

  const pinned = students.find((p) => p.socketId === examPinnedScreenId) || null;
  const violationPeer = violationModalId ? students.find((p) => p.socketId === violationModalId) || null : null;

  /**
   * ĐỒNG BỘ LẠI từ server khi panel mount.
   */
  useEffect(() => {
    if (!roomId) return;
    let alive = true;
    socket.emit('exam:getState', { roomId }, (res: any) => {
      if (!alive || !res || !res.ok || !res.exam) return;
      setExamMonitoring(!!res.exam.monitoring);
      setExamRequireShare(!!res.exam.requireShare);
      setExamPinnedScreenId(res.exam.pinnedScreenId || null);
      if (res.exam.shareStatus && typeof res.exam.shareStatus === 'object') {
        hydrateExamShareStatus(res.exam.shareStatus);
      }
    });
    return () => { alive = false; };
  }, [roomId, setExamMonitoring, setExamRequireShare, setExamPinnedScreenId, hydrateExamShareStatus]);

  /** Đo vùng cuộn để tính số cột + ảo hoá */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth || 900, h: el.clientHeight || 600 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullscreen, zoomed]);

  // Số cột tự động theo bề rộng (zoomed = tăng kích thước tối thiểu từng ô để phóng to màn hình)
  const effectiveMinW = zoomed ? MIN_TILE_W_ZOOMED : MIN_TILE_W;
  const maxColsByWidth = Math.max(1, Math.floor((box.w - 16) / effectiveMinW));
  const cols = Math.min(maxColsByWidth, Math.max(1, filteredStudents.length));
  const tileW = Math.floor((box.w - 16 - (cols - 1) * 8) / cols);
  const rowsThatFit = Math.max(1, Math.floor((box.h - 16) / (effectiveMinW * TILE_ASPECT)));
  const wantedRows = Math.ceil(filteredStudents.length / cols);
  const useRows = Math.min(Math.max(1, wantedRows), Math.max(1, rowsThatFit));
  const byWidth = Math.round(tileW * TILE_ASPECT);
  const byHeight = Math.floor((box.h - 16 - (useRows - 1) * 8) / useRows);
  const rowContentH = zoomed ? Math.max(220, byWidth) : Math.max(130, Math.min(byWidth, byHeight));
  const tileH = rowContentH + 8;
  const totalRows = Math.ceil(filteredStudents.length / cols);
  const firstRow = Math.max(0, Math.floor(scrollTop / tileH) - OVERSCAN);
  const lastRow = Math.min(totalRows, Math.ceil((scrollTop + box.h) / tileH) + OVERSCAN);
  const visible = filteredStudents.slice(firstRow * cols, lastRow * cols);

  const emit = (ev: string, payload: unknown) => socket.emit(ev, payload, () => null);
  const toggleMonitor = () => {
    if (!roomId) return;
    if (examMonitoring) emit('exam:setMonitoring', { roomId, active: false });
    else { emit('exam:setMonitoring', { roomId, active: true }); emit('exam:requireShare', { roomId, active: true }); }
  };
  const togglePin = (socketId: string) => {
    if (!roomId) return;
    emit('exam:pinScreen', { roomId, targetSocketId: examPinnedScreenId === socketId ? null : socketId });
  };
  const quickViewCode = (socketId: string) => {
    const st = useMeetingStore.getState();
    if (!st.peerCodes.has(socketId)) {
      socket.emit('code:request', { roomId: st.roomId, targetSocketId: socketId });
    }
    st.setViewingPeerCode(socketId);
    window.dispatchEvent(new CustomEvent('meet:selectTab', { detail: { tab: 'code' } }));
    if (onExit) onExit();
  };

  /**
   * Xuất ZIP toàn bộ bài code của học sinh để chấm điểm.
   * Server trả base64 (đã kiểm tra chỉ host gọi được), client giải mã rồi tải về.
   */
  const exportZip = () => {
    if (!roomId || exporting) return;
    setExporting(true);
    setExportMsg('');
    socket.emit('code:exportZip', { roomId }, (res: any) => {
      setExporting(false);
      if (!res || !res.ok) {
        setExportMsg(res?.error || 'Không xuất được bài');
        setTimeout(() => setExportMsg(''), 4000);
        return;
      }
      try {
        const bin = atob(res.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = res.fileName || 'bai-code.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setExportMsg(`Đã tải ${res.files} file của ${res.students} học sinh`);
        setTimeout(() => setExportMsg(''), 4000);
      } catch {
        setExportMsg('File quá lớn để tải trên trình duyệt này');
        setTimeout(() => setExportMsg(''), 4000);
      }
    });
  };

  /** Thanh điều khiển dùng chung */
  const Controls = (
    <div className={fullscreen
      ? 'flex flex-none flex-wrap items-center gap-2 border-b border-line bg-raised px-4 py-2'
      : 'flex-none space-y-2 border-b border-line p-3'}>
      <button
        onClick={toggleMonitor}
        className={[
          'flex items-center justify-center gap-2 rounded-ctl px-3 py-2 text-xs font-semibold transition-all',
          fullscreen ? '' : 'w-full',
          examMonitoring ? 'bg-danger text-white hover:bg-danger/90' : 'bg-accent text-accent-ink hover:brightness-110',
        ].join(' ')}
      >
        {examMonitoring ? <><Square size={14} /> Kết thúc giám sát</> : <><Play size={14} /> Bắt đầu giám sát</>}
      </button>

      {examMonitoring && (
        <button
          onClick={() => roomId && emit('exam:requireShare', { roomId, active: !examRequireShare })}
          className={[
            'flex items-center justify-center gap-2 rounded-ctl px-3 py-2 text-[11px] font-semibold transition-all',
            fullscreen ? '' : 'w-full',
            examRequireShare ? 'bg-elevated text-white hover:bg-line' : 'bg-warn/20 text-warn hover:bg-warn/30',
          ].join(' ')}
        >
          <MonitorUp size={13} />
          {examRequireShare ? 'Đang yêu cầu chia sẻ' : 'Yêu cầu cả lớp chia sẻ'}
        </button>
      )}

      <span className="flex items-center gap-1 text-[11px] text-muted">
        <Users size={12} /> {students.length} học sinh
      </span>
      <span className="flex items-center gap-1 text-[11px] font-semibold text-ok">
        <CheckCircle2 size={12} /> {sharingCount} đang chia sẻ
      </span>

      {/* Bộ lọc nhanh danh sách giám sát */}
      {students.length > 0 && (
        <div className="flex items-center gap-1 rounded-ctl border border-line bg-base/70 p-0.5 text-[10px] font-semibold">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`rounded px-2 py-0.5 transition-colors ${filterMode === 'all' ? 'bg-accent text-accent-ink' : 'text-muted hover:text-white'}`}
          >
            Tất cả ({students.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('flagged')}
            className={`rounded px-2 py-0.5 transition-colors ${
              filterMode === 'flagged'
                ? 'bg-danger text-white'
                : flaggedCount > 0
                  ? 'text-danger hover:bg-danger/15'
                  : 'text-muted hover:text-white'
            }`}
          >
            Cần chú ý ({flaggedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('pending')}
            className={`rounded px-2 py-0.5 transition-colors ${
              filterMode === 'pending' ? 'bg-warn text-black' : 'text-muted hover:text-white'
            }`}
          >
            Chưa share ({pending.length})
          </button>
        </div>
      )}

      {audioMode === 'selected' && (
        <button
          onClick={() => setAudioAll(roomId)}
          className="flex items-center gap-1.5 rounded-ctl border border-accent/40 bg-accent/15 px-2.5 py-1.5 text-[11px] font-semibold text-accent hover:bg-accent/25"
          title="Đang nói riêng — bấm để trả âm thanh về cả lớp"
        >
          <Headphones size={12} />
          Đang nói riêng ({hearHost.length}) · Trả về cả lớp
        </button>
      )}

      {/* Xuất toàn bộ bài code của học sinh để chấm điểm */}
      <button
        onClick={exportZip}
        disabled={exporting}
        className={[
          'flex items-center justify-center gap-2 rounded-ctl px-3 py-2 text-[11px] font-semibold transition-all disabled:opacity-60',
          fullscreen ? 'ml-auto' : 'w-full',
          'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30',
        ].join(' ')}
        title="Tải về 1 file ZIP: mỗi học sinh 1 thư mục bài code + bảng điểm CSV"
      >
        {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileArchive size={13} />}
        {exporting ? 'Đang nén…' : 'Xuất bài để chấm'}
      </button>

      {examMonitoring && pending.length > 0 && (
        <span className="flex items-center gap-1.5 rounded-ctl bg-warn/10 px-2 py-1 text-[10px] text-warn">
          <AlertTriangle size={12} className="shrink-0" />
          Chưa chia sẻ ({pending.length}): {pending.slice(0, 6).map((p) => p.name).join(', ')}
          {pending.length > 6 ? ` +${pending.length - 6}` : ''}
        </span>
      )}

      {exportMsg && (
        <span className="rounded-ctl bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300">{exportMsg}</span>
      )}

      {fullscreen && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoomed((z) => !z)}
            title={zoomed ? 'Thu nhỏ lưới (xem nhiều ô hơn)' : 'Phóng to từng ô giám sát'}
            className={`grid h-8 w-8 place-items-center rounded-ctl transition-colors ${
              zoomed ? 'bg-accent/20 text-accent' : 'text-muted hover:bg-line hover:text-white'
            }`}
          >
            {zoomed ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          {onExit && (
            <button onClick={onExit} title="Thoát giám sát"
              className="grid h-8 w-8 place-items-center rounded-ctl text-muted hover:bg-danger hover:text-white">
              <X size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );

  /** Cột nhỏ bên phải khi có ghim */
  const SideCol = (
    <div className="custom-scrollbar flex w-[15rem] flex-none flex-col gap-2 overflow-y-auto xl:w-[17rem]">
      {students.filter((s) => s.socketId !== examPinnedScreenId).map((p) => (
        <Tile
          key={p.socketId}
          p={p}
          stream={remoteScreen[p.socketId] || null}
          isPinned={false}
          reported={examShareStatus[p.socketId]}
          surface={examShareSurface[p.socketId]}
          onTogglePin={togglePin}
          onViewCode={quickViewCode}
          onOpenViolations={(sid) => setViolationModalId(sid)}
          isSolo={audioMode === 'selected' && hearHost.length === 1 && hearHost[0] === p.socketId}
          onSolo={(sid, nm) => toggleSoloPeer(roomId, sid, nm)}
          compact
          className="h-[9.5rem] flex-none"
        />
      ))}
      {students.length <= 1 && (
        <p className="p-3 text-center text-[11px] text-muted">Chưa có học sinh khác.</p>
      )}
    </div>
  );

  return (
    <div className={fullscreen ? 'flex h-full flex-col bg-base' : 'flex h-full flex-col'}>
      {Controls}

      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        className="custom-scrollbar flex-1 overflow-auto p-2"
      >
        {students.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted">Chưa có học sinh nào trong lớp.</p>
        ) : pinned ? (
          /* ── Bố cục GHIM: 1 lớn bên trái + cột nhỏ bên phải ── */
          <div className="flex h-full gap-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <Tile
                p={pinned}
                stream={remoteScreen[pinned.socketId] || null}
                isPinned
                reported={examShareStatus[pinned.socketId]}
                surface={examShareSurface[pinned.socketId]}
                onTogglePin={togglePin}
                onViewCode={quickViewCode}
                onOpenViolations={(sid) => setViolationModalId(sid)}
                isSolo={audioMode === 'selected' && hearHost.length === 1 && hearHost[0] === pinned.socketId}
                onSolo={(sid, nm) => toggleSoloPeer(roomId, sid, nm)}
                className="min-h-0 flex-1"
              />
              <p className="mt-1 flex-none text-center text-[10px] text-muted">
                Đang ghim cho cả lớp — bấm “Bỏ ghim” để trở lại lưới
              </p>
            </div>
            {SideCol}
          </div>
        ) : filteredStudents.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted">Không có học sinh nào khớp bộ lọc đang chọn.</p>
        ) : (
          /* ── Lưới TỰ ĐỘNG theo bề rộng màn hình (ảo hoá, khóa chặt chiều cao hàng) ── */
          <div style={{ height: totalRows * tileH, position: 'relative' }}>
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridAutoRows: `${rowContentH}px`,
                position: 'absolute', top: firstRow * tileH, left: 0, right: 0,
              }}
            >
              {visible.map((p) => (
                <Tile
                  key={p.socketId}
                  p={p}
                  stream={remoteScreen[p.socketId] || null}
                  isPinned={examPinnedScreenId === p.socketId}
                  reported={examShareStatus[p.socketId]}
                  surface={examShareSurface[p.socketId]}
                  onTogglePin={togglePin}
                  onViewCode={quickViewCode}
                  onOpenViolations={(sid) => setViolationModalId(sid)}
                  isSolo={audioMode === 'selected' && hearHost.length === 1 && hearHost[0] === p.socketId}
                  onSolo={(sid, nm) => toggleSoloPeer(roomId, sid, nm)}
                  className="h-full"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal nhật ký vi phạm chi tiết theo mốc thời gian */}
      {violationPeer && (
        <div
          className="fixed inset-0 z-[260] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setViolationModalId(null)}
        >
          <div
            className="anim-modal w-full max-w-md rounded-panel border border-line-strong bg-overlay p-5 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldAlert size={16} className="text-danger shrink-0" />
                <h3 className="text-sm font-bold text-white truncate">Nhật ký vi phạm — {violationPeer.name}</h3>
              </div>
              <button onClick={() => setViolationModalId(null)} className="rounded p-1 text-muted hover:bg-line hover:text-white">
                <X size={15} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-danger">
                Rời tab/cửa sổ: {violationPeer.violations || 0}
              </span>
              <span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-warn">
                Dán code ngoài: {violationPeer.pasteCount || 0}
              </span>
              <span className="rounded-full bg-elevated px-2.5 py-0.5 text-muted">
                Copy: {violationPeer.copyCount || 0}
              </span>
            </div>
            <div className="max-h-72 space-y-1.5 overflow-y-auto custom-scrollbar pr-1">
              {(violationPeer.violationHistory || []).length === 0 ? (
                <p className="py-6 text-center text-xs text-muted">Chưa có mốc vi phạm chi tiết.</p>
              ) : (
                [...(violationPeer.violationHistory || [])].reverse().map((v, i) => (
                  <div key={i} className="rounded-lg border border-line bg-raised px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-bold ${
                          v.type === 'external-paste' ? 'text-warn' : 'text-danger'
                        }`}
                      >
                        {v.type === 'external-paste'
                          ? 'Dán code ngoài'
                          : v.type === 'tab-switch'
                            ? 'Chuyển tab'
                            : 'Mất focus cửa sổ'}
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        {new Date(v.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    {v.reason && <p className="mt-0.5 text-[11px] text-gray-300 break-words">{v.reason}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Video cho 1 ô giám sát — tự gán srcObject và phát.
 *
 * BẮT BUỘC có `no-mirror`: trong index.css có luật chung `video { transform:
 * scaleX(-1) }` để camera tự sướng nhìn như gương. Màn hình học sinh KHÔNG được
 * lật — lật thì chữ trong code bị soi gương, giáo viên không đọc được gì.
 */
const ScreenVideo: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) { el.srcObject = stream; el.play().catch(() => {}); }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className="no-mirror h-full w-full object-contain"
      style={{ transform: 'scaleX(1)' }}
    />
  );
};

/**
 * 1 ô màn hình học sinh.
 *
 * QUAN TRỌNG — PHẢI nằm ở CẤP MODULE, không được định nghĩa lại bên trong
 * ExamMonitorPanel. Khi định nghĩa bên trong, mỗi lần panel render lại là một
 * hàm MỚI → React coi là loại component khác → GỠ và TẠO LẠI toàn bộ ô, tức là
 * huỷ thẻ <video> rồi dựng thẻ mới, gán lại srcObject, tải lại hình. Đó chính
 * là hiện tượng "giật giật": chỉ cần 1 học sinh vào/ra là MỌI ô khác cũng bị
 * dựng lại (đo được: 1 em out/vào → 3/6 ô bị tạo lại, 21 lần loadstart/10s).
 *
 * Đưa ra ngoài + truyền prop tường minh thì React chỉ cập nhật phần đổi.
 */
const Tile: React.FC<{
  p: {
    socketId: string;
    name: string;
    isActive?: boolean;
    violations?: number;
    pasteCount?: number;
  };
  stream: MediaStream | null;
  isPinned: boolean;
  reported?: boolean;
  surface?: string;
  onTogglePin: (socketId: string) => void;
  onViewCode?: (socketId: string) => void;
  onOpenViolations?: (socketId: string) => void;
  isSolo?: boolean;
  onSolo?: (socketId: string, name: string) => void;
  className?: string;
  compact?: boolean;
}> = ({
  p, stream, isPinned, reported, surface, onTogglePin, onViewCode, onOpenViolations,
  isSolo = false, onSolo, className = '', compact = false,
}) => {
  const hasVideo = hasLiveScreen(stream);
  const violations = p.violations || 0;
  const pastes = p.pasteCount || 0;
  const hasFlag = violations > 0 || pastes > 0;
  const surfaceWarn = hasVideo && surface ? SURFACE_WARNING[surface] : undefined;

  return (
    <div className={[
      'group relative overflow-hidden rounded-card border bg-black',
      isPinned
        ? 'border-accent shadow-[0_0_0_2px_var(--color-accent)]'
        : p.isActive === false
          ? 'border-warn/60'
          : hasFlag
            ? 'border-danger/50'
            : 'border-line',
      className,
    ].join(' ')}>
      {hasVideo ? <ScreenVideo stream={stream!} />
        : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-muted">
            <MonitorUp size={compact ? 16 : 22} />
            <span className="text-[10px]">{reported === false ? 'Từ chối / Chưa chia sẻ' : 'Đang chờ chia sẻ…'}</span>
          </div>
        )}

      {/* Cảnh báo giám sát góc trên bên trái */}
      <div className="absolute top-1 left-1 flex flex-wrap items-center gap-1 max-w-[60%]">
        {hasFlag && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenViolations?.(p.socketId); }}
            className="inline-flex items-center gap-1 rounded-full bg-danger/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm hover:brightness-110"
            title="Bấm xem nhật ký vi phạm chi tiết"
          >
            <ShieldAlert size={10} />
            {violations > 0 ? `${violations} VP` : ''}
            {violations > 0 && pastes > 0 ? ' · ' : ''}
            {pastes > 0 ? `${pastes} Paste` : ''}
          </button>
        )}
        {p.isActive === false && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warn/90 px-2 py-0.5 text-[10px] font-bold text-black animate-pulse">
            Rời tab
          </span>
        )}
        {surfaceWarn && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-warn/85 px-2 py-0.5 text-[10px] font-bold text-black"
            title="Học sinh không chia sẻ Toàn màn hình — có thể đang mở cửa sổ khác"
          >
            <AlertTriangle size={10} /> {surfaceWarn}
          </span>
        )}
      </div>

      <div className="absolute bottom-1 left-1 flex max-w-[calc(100%-0.5rem)] items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 backdrop-blur">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${hasVideo ? 'bg-ok' : 'bg-warn animate-pulse'}`} />
        <span className="truncate text-[10px] font-medium text-white">{p.name}</span>
      </div>
      <div className="absolute top-1 right-1 flex items-center gap-1">
        {onViewCode && (
          <button
            onClick={(e) => { e.stopPropagation(); onViewCode(p.socketId); }}
            title={`Xem code trực tiếp của ${p.name}`}
            className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white/85 opacity-0 backdrop-blur transition-all group-hover:opacity-100 hover:bg-black/80 hover:text-accent"
          >
            <Code2 size={11} />
          </button>
        )}
        {onSolo && (
          <button
            onClick={(e) => { e.stopPropagation(); onSolo(p.socketId, p.name); }}
            title={isSolo ? 'Đang nói riêng 1-1 — bấm để trả về cả lớp' : `Nói riêng 1-1 với ${p.name}`}
            className={[
              'flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold backdrop-blur transition-all',
              isSolo
                ? 'bg-ok text-black opacity-100'
                : 'bg-black/60 text-white/85 opacity-0 group-hover:opacity-100 hover:bg-black/80 hover:text-accent',
            ].join(' ')}
          >
            <Headphones size={11} />
            {isSolo ? '1-1' : ''}
          </button>
        )}
        <button
          onClick={() => onTogglePin(p.socketId)}
          title={isPinned ? 'Bỏ ghim cho cả lớp' : 'Ghim màn hình này cho CẢ LỚP xem'}
          className={[
            'flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold backdrop-blur transition-all',
            isPinned ? 'bg-accent text-accent-ink opacity-100'
              : 'bg-black/60 text-white/85 opacity-0 group-hover:opacity-100 hover:bg-black/80',
          ].join(' ')}
        >
          {isPinned ? <PinOff size={11} /> : <Pin size={11} />}
          {isPinned ? 'Bỏ ghim' : 'Ghim lớp'}
        </button>
      </div>
    </div>
  );
};

export default ExamMonitorPanel;
