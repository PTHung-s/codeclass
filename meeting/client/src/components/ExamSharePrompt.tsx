/**
 * ExamSharePrompt — overlay BẮT BUỘC ở máy học sinh khi host yêu cầu chia sẻ màn hình.
 *
 * VÌ SAO PHẢI CÓ OVERLAY: trình duyệt không cho phép tự động chia sẻ màn hình —
 * getDisplayMedia() bắt buộc người dùng bấm chọn cửa sổ. Không code nào vượt được
 * rào cản bảo mật này. Nên cách "bắt buộc" mạnh nhất khả thi là:
 *   1. Phủ overlay toàn màn hình, chặn thao tác khác.
 *   2. Học sinh bấm "Chia sẻ ngay" → gọi getDisplayMedia.
 *   3. Nếu học sinh dừng chia sẻ giữa chừng → overlay hiện lại.
 *   4. Báo trạng thái lên host để host biết ai chưa làm.
 */
import React, { useEffect, useRef, useState } from 'react';
import { MonitorUp, ShieldAlert, Loader2, AlertTriangle } from 'lucide-react';
import { useMeetingStore } from '../store/useMeetingStore';
import { socket } from '../services/socket';
import { sfuService } from '../services/sfu';
import { toast } from '../store/useUiStore';

export const ExamSharePrompt: React.FC = () => {
  const examMonitoring = useMeetingStore((s) => s.examMonitoring);
  const examRequireShare = useMeetingStore((s) => s.examRequireShare);
  const isHost = useMeetingStore((s) => s.isHost);
  const roomId = useMeetingStore((s) => s.roomId);
  const localScreenStream = useMeetingStore((s) => s.localScreenStream);
  const isSharing = !!localScreenStream;
  const starting = useRef(false);
  const prevMonitoringRef = useRef(examMonitoring);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Báo trạng thái chia sẻ + loại bề mặt (toàn màn hình / cửa sổ / 1 tab) lên host mỗi khi đổi
  useEffect(() => {
    if (!roomId || isHost) return;
    const surface = isSharing ? sfuService.currentScreenSurface : undefined;
    socket.emit('exam:reportShare', { roomId, sharing: isSharing, surface });
    if (isSharing) {
      setErrorMsg('');
      if (examRequireShare && surface && surface !== 'monitor' && surface !== 'unknown') {
        toast.warning('Bạn đang chỉ chia sẻ 1 tab/cửa sổ. Khuyến nghị chọn Toàn màn hình khi thi.');
      }
    }
  }, [isSharing, roomId, isHost, examRequireShare]);

  // Tự động dừng chia sẻ màn hình thi khi giáo viên bấm "Kết thúc giám sát"
  useEffect(() => {
    const wasMonitoring = prevMonitoringRef.current;
    prevMonitoringRef.current = examMonitoring;
    if (wasMonitoring && !examMonitoring && !isHost && sfuService.isScreenSharedForExam) {
      sfuService.stopScreenShare();
      toast.info('Giáo viên đã kết thúc giám sát — đã tự động dừng chia sẻ màn hình.');
    }
  }, [examMonitoring, isHost]);

  // Học sinh rời phòng → không còn phải chia sẻ
  if (isHost || !examRequireShare || isSharing) return null;

  const start = async () => {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setErrorMsg('');
    try {
      await sfuService.startScreenShare(undefined, { forExam: true });
    } catch (e: any) {
      console.warn('[Exam] học sinh chưa chia sẻ:', e);
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'AbortError') {
        setErrorMsg('Em đã đóng hộp thoại chọn màn hình. Hãy bấm nút bên trên và chọn Toàn màn hình.');
      } else {
        setErrorMsg(e?.message || 'Không bật được chia sẻ màn hình. Hãy thử lại hoặc tải lại trang.');
      }
      if (roomId) socket.emit('exam:reportShare', { roomId, sharing: false });
    } finally {
      starting.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-card border border-warn/40 bg-raised p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-warn/15">
          <ShieldAlert size={28} className="text-warn" />
        </div>
        <h2 className="mb-1 text-lg font-bold text-white">Giáo viên yêu cầu chia sẻ màn hình</h2>
        <p className="mb-5 text-sm leading-relaxed text-muted">
          Đang trong giờ giám sát. Em cần chia sẻ <b className="text-white">Toàn màn hình</b> để giáo viên theo dõi
          (các bạn khác trong lớp không nhìn thấy màn hình của em). Hãy chọn toàn màn hình rồi bấm{' '}
          <b className="text-white">Chia sẻ</b>.
        </p>
        {errorMsg && (
          <div className="mb-4 flex items-start gap-2 rounded-ctl border border-danger/40 bg-danger/10 px-3 py-2 text-left text-xs text-danger">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        <button
          onClick={start}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-ctl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <MonitorUp size={16} />}
          {busy ? 'Đang mở hộp thoại chia sẻ…' : 'Chia sẻ màn hình ngay'}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-muted">
          <Loader2 size={11} className="animate-spin" /> Đang chờ em chia sẻ…
        </p>
      </div>
    </div>
  );
};

export default ExamSharePrompt;
