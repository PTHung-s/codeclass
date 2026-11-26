import React from 'react';
import { useUiStore } from '../store/useUiStore';

/**
 * FloatingReactionsOverlay — lớp hiển thị biểu cảm thả nổi realtime
 * (không chặn chuột, tự dọn sau 2.7s).
 */
export const FloatingReactionsOverlay: React.FC = () => {
  const reactions = useUiStore((s) => s.reactions);
  if (reactions.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[180] overflow-hidden" aria-hidden="true">
      {reactions.map((r) => (
        <div
          key={r.id}
          className="anim-float-reaction absolute bottom-20 flex flex-col items-center gap-1 select-none"
          style={{ left: `${r.x}%` }}
        >
          <span className="text-3xl drop-shadow-[0_6px_14px_rgba(0,0,0,0.55)]">{r.emoji}</span>
          <span className="max-w-[120px] truncate rounded-full border border-white/10 bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white/95 backdrop-blur">
            {r.name}
          </span>
        </div>
      ))}
    </div>
  );
};

export default FloatingReactionsOverlay;
