import React, { useState, useEffect } from 'react';
import { Check, Copy, Clock } from 'lucide-react';

export const DigitalClock: React.FC = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-line px-2.5 py-1 font-mono text-xs font-semibold text-muted">
      <Clock size={12} className="text-accent" />
      <span>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
    </div>
  );
};

// --- Room info panel ---
export const RoomInfo: React.FC<{ roomId: string, roomName: string, handleCopyLink: () => void, copied: boolean }> = ({ roomId, roomName, handleCopyLink, copied }) => {
  return (
    <div className="h-full space-y-6 overflow-y-auto bg-raised p-5 text-gray-200 custom-scrollbar">
      <div className="rounded-panel border border-line bg-overlay p-4">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Mã cuộc họp</h4>
        <p className="mb-3 text-xs text-muted">Dùng mã này để mời người khác vào lớp học.</p>
        <div className="flex items-center justify-between rounded-card bg-base p-3 ring-1 ring-line">
          <span className="font-mono text-lg font-bold tracking-tight text-accent">{roomId}</span>
          <button onClick={handleCopyLink} className="grid h-9 w-9 place-items-center rounded-ctl text-muted transition-all hover:bg-line hover:text-white active:scale-90">
            {copied ? <Check size={18} className="text-ok" /> : <Copy size={18} />}
          </button>
        </div>
      </div>
      <div>
        <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Tiêu đề</h4>
        <p className="text-xl font-bold leading-tight text-white">{roomName || 'Đang diễn ra…'}</p>
      </div>
    </div>
  );
};
