/**
 * ExamMonitorOverlay — chế độ giám sát TOÀN MÀN HÌNH.
 *
 * Khi host bật giám sát, lớp học được THAY bằng màn hình giám sát (kiểu
 * "share screen" của Zoom): lưới màn hình học sinh chiếm gần hết, có nút
 * thu nhỏ trở về giao diện lớp học.
 *
 * Chỉ host thấy. Học sinh không thấy gì thay đổi ngoài overlay yêu cầu chia sẻ.
 */
import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import ExamMonitorPanel from './ExamMonitorPanel';
import { useMeetingStore } from '../store/useMeetingStore';
import { formatQuizClock, getQuizClock } from '../lib/quizTimer';

interface Props {
  onExit: () => void;
}

export const ExamMonitorOverlay: React.FC<Props> = ({ onExit }) => {
  const activeQuiz = useMeetingStore((s) => s.activeQuiz);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activeQuiz) return;
    const tick = () => setNow(Date.now());
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [activeQuiz?.id, activeQuiz?.endsAt, activeQuiz?.timeLimit]);

  const qc = getQuizClock(activeQuiz, now);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-base">
      {/* Thanh tiêu đề */}
      <div className="flex flex-none items-center gap-3 border-b border-line bg-raised px-4 py-2.5">
        <div className="grid h-7 w-7 place-items-center rounded-ctl bg-warn/20">
          <span className="h-2 w-2 animate-pulse rounded-full bg-warn" />
        </div>
        <h1 className="text-sm font-bold uppercase tracking-wide text-white">Giám sát thi</h1>
        <span className="hidden text-[11px] text-muted sm:inline">
          Màn hình của học sinh — bấm “Ghim lớp” để cả lớp cùng xem một màn hình
        </span>
        <div className="ml-auto flex items-center gap-2.5">
          {activeQuiz && (
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-bold tabular-nums ${
                qc.isExpired || qc.isUrgent
                  ? 'border-danger/50 bg-danger/15 text-danger animate-pulse'
                  : qc.isWarning
                    ? 'border-warn/50 bg-warn/15 text-warn'
                    : 'border-accent/40 bg-accent/15 text-accent'
              }`}
              title={`Bài trắc nghiệm: ${activeQuiz.title}`}
            >
              <Clock size={13} />
              <span>
                {qc.isTimed
                  ? qc.isExpired
                    ? 'Hết giờ'
                    : formatQuizClock(qc.remainingSec ?? 0)
                  : formatQuizClock(qc.elapsedSec)}
              </span>
            </div>
          )}
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 rounded-ctl bg-elevated px-3 py-1.5 text-[11px] font-semibold text-white transition-all hover:bg-line"
          >
            Thoát giám sát
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ExamMonitorPanel fullscreen onExit={onExit} />
      </div>
    </div>
  );
};

export default ExamMonitorOverlay;
