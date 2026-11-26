import React, { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';
import { useUiStore } from '../store/useUiStore';

const SHORTCUT_GROUPS = [
  {
    title: 'Điều khiển phòng học',
    items: [
      { keys: ['Alt', 'M'], desc: 'Bật / tắt Microphone' },
      { keys: ['Alt', 'V'], desc: 'Bật / tắt Camera' },
      { keys: ['Alt', 'H'], desc: 'Giơ tay / Hạ tay phát biểu' },
      { keys: ['Alt', 'A'], desc: 'Trả âm thanh về Cả lớp (Host)' },
    ],
  },
  {
    title: 'Bố cục & Trình soạn thảo',
    items: [
      { keys: ['Alt', '1'], desc: 'Bố cục ưu tiên Video (70/30)' },
      { keys: ['Alt', '2'], desc: 'Bố cục Cân bằng (50/50)' },
      { keys: ['Alt', '3'], desc: 'Bố cục ưu tiên Code (30/70)' },
      { keys: ['Ctrl', 'S'], desc: 'Lưu bài code hiện tại' },
      { keys: ['Esc'], desc: 'Đóng sidebar hoặc bảng đang mở' },
      { keys: ['Shift', '?'], desc: 'Mở / đóng bảng phím tắt này' },
    ],
  },
];

export const ShortcutHelpModal: React.FC = () => {
  const open = useUiStore((s) => s.shortcutsOpen);
  const setOpen = useUiStore((s) => s.setShortcutsOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[325] grid place-items-center bg-black/70 p-4 backdrop-blur-sm anim-backdrop"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-panel border border-line-strong bg-overlay p-5 shadow-modal anim-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-accent" />
            <h3 className="text-sm font-bold text-white">Phím tắt nhanh</h3>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="grid h-7 w-7 place-items-center rounded-ctl text-muted transition-colors hover:bg-line hover:text-white active:scale-95"
            aria-label="Đóng bảng phím tắt"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {SHORTCUT_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">
                {g.title}
              </div>
              <div className="space-y-1.5">
                {g.items.map((item) => (
                  <div
                    key={item.desc}
                    className="flex items-center justify-between rounded-ctl border border-line/70 bg-raised/70 px-3 py-1.5 text-xs"
                  >
                    <span className="text-white/85">{item.desc}</span>
                    <span className="flex items-center gap-1">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded border border-line-strong bg-base px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-muted">
          Mẹo: Phím tắt tự động tạm dừng khi bạn đang gõ trong ô chat hoặc trình soạn thảo code.
        </p>
      </div>
    </div>
  );
};

export default ShortcutHelpModal;
