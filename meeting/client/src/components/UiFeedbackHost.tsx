import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';
import { useUiStore, type ToastVariant, type UiToast } from '../store/useUiStore';

const VARIANT_STYLES: Record<ToastVariant, { border: string; bar: string; icon: React.ReactNode }> = {
  info: {
    border: 'border-accent/40',
    bar: 'bg-accent/70',
    icon: <Info size={16} className="shrink-0 text-accent" />,
  },
  success: {
    border: 'border-ok/40',
    bar: 'bg-ok/70',
    icon: <CheckCircle2 size={16} className="shrink-0 text-ok" />,
  },
  warning: {
    border: 'border-warn/40',
    bar: 'bg-warn/70',
    icon: <AlertTriangle size={16} className="shrink-0 text-warn" />,
  },
  error: {
    border: 'border-danger/40',
    bar: 'bg-danger/70',
    icon: <XCircle size={16} className="shrink-0 text-danger" />,
  },
};

const HUD_TONES = {
  neutral: 'border-line-strong bg-overlay/95 text-white',
  accent: 'border-accent/50 bg-overlay/95 text-accent',
  ok: 'border-ok/50 bg-overlay/95 text-ok',
  danger: 'border-danger/50 bg-overlay/95 text-danger',
};

const ToastItem: React.FC<{ item: UiToast; onDismiss: (id: string) => void }> = ({ item, onDismiss }) => {
  const [leaving, setLeaving] = useState(false);
  const remainingRef = useRef(item.duration);
  const startedAtRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const st = VARIANT_STYLES[item.variant];

  const triggerDismiss = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => onDismiss(item.id), 180);
  }, [item.id, leaving, onDismiss]);

  const startTimer = useCallback(() => {
    startedAtRef.current = Date.now();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(triggerDismiss, Math.max(150, remainingRef.current));
  }, [triggerDismiss]);

  const pauseTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      remainingRef.current = Math.max(200, remainingRef.current - (Date.now() - startedAtRef.current));
    }
  };

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [startTimer]);

  return (
    <div
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
      className={`group pointer-events-auto relative overflow-hidden flex items-center gap-2.5 rounded-card border ${st.border} bg-overlay/95 px-3.5 py-2.5 text-xs font-medium text-white shadow-modal backdrop-blur ${
        leaving ? 'anim-toast-out' : 'anim-toast-in'
      }`}
    >
      {st.icon}
      <span className="flex-1 leading-snug">{item.message}</span>
      {item.action && (
        <button
          onClick={() => {
            item.action?.onClick();
            triggerDismiss();
          }}
          className="shrink-0 rounded-ctl bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent transition-all hover:bg-accent/25 active:scale-95"
        >
          {item.action.label}
        </button>
      )}
      <button
        onClick={triggerDismiss}
        className="shrink-0 rounded p-0.5 text-muted transition-colors hover:bg-line hover:text-white active:scale-95"
        aria-label="Đóng thông báo"
      >
        <X size={13} />
      </button>
      <div
        className={`toast-progress absolute bottom-0 left-0 right-0 h-[2px] ${st.bar}`}
        style={{ animationDuration: `${item.duration}ms` }}
      />
    </div>
  );
};

export const UiFeedbackHost: React.FC = () => {
  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);
  const dialog = useUiStore((s) => s.dialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const hud = useUiStore((s) => s.hud);

  const [inputVal, setInputVal] = useState('');

  useEffect(() => {
    if (dialog?.type === 'prompt') {
      setInputVal(dialog.defaultValue || '');
    }
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeDialog();
        dialog.resolve(dialog.type === 'confirm' ? false : null);
      } else if (e.key === 'Enter' && dialog.type === 'confirm') {
        e.preventDefault();
        e.stopPropagation();
        closeDialog();
        dialog.resolve(true);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [dialog, closeDialog]);

  const handleConfirm = () => {
    if (!dialog) return;
    const val = dialog.type === 'confirm' ? true : inputVal;
    closeDialog();
    dialog.resolve(val);
  };

  const handleCancel = () => {
    if (!dialog) return;
    const val = dialog.type === 'confirm' ? false : null;
    closeDialog();
    dialog.resolve(val);
  };

  return (
    <>
      {/* Mini Action HUD — phản hồi tức thì khi thao tác nhanh / phím tắt */}
      {hud && (
        <div
          key={hud.id}
          className={`pointer-events-none fixed left-1/2 top-[4.4rem] z-[310] rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-modal backdrop-blur-md anim-hud-in ${HUD_TONES[hud.tone]}`}
        >
          {hud.label}
        </div>
      )}

      {/* Toast stack (hover để tạm dừng, có thanh đếm ngược & thoát mượt) */}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[320] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
          {toasts.map((t) => (
            <ToastItem key={t.id} item={t} onDismiss={dismissToast} />
          ))}
        </div>
      )}

      {/* Modal Confirm / Prompt */}
      {dialog && (
        <div
          className="fixed inset-0 z-[330] grid place-items-center bg-black/70 p-4 backdrop-blur-sm anim-backdrop"
          onClick={handleCancel}
        >
          <div
            className="w-full max-w-sm rounded-panel border border-line-strong bg-overlay p-5 shadow-modal anim-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {dialog.title && (
              <h3 className="mb-1.5 text-sm font-bold text-white">{dialog.title}</h3>
            )}
            <p className="text-xs leading-relaxed text-white/80 whitespace-pre-wrap">{dialog.message}</p>

            {dialog.type === 'prompt' && (
              <input
                autoFocus
                type={dialog.inputType || 'text'}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
                placeholder={dialog.placeholder}
                className="mt-3 w-full rounded-ctl border border-line-strong bg-base px-3 py-2 text-xs text-white outline-none transition-colors focus:border-accent"
              />
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={handleCancel}
                className="rounded-ctl border border-line-strong px-3.5 py-1.5 text-xs font-semibold text-white/80 transition-all hover:bg-line hover:text-white active:scale-95"
              >
                {dialog.cancelLabel || 'Huỷ'}
              </button>
              <button
                onClick={handleConfirm}
                className={`rounded-ctl px-3.5 py-1.5 text-xs font-bold transition-all hover:brightness-110 active:scale-95 ${
                  dialog.danger
                    ? 'bg-danger text-white'
                    : 'bg-accent text-accent-ink'
                }`}
              >
                {dialog.confirmLabel || 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UiFeedbackHost;
