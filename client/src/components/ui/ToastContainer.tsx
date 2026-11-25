import { useState, useEffect, useCallback, useRef } from "react";
import { X, CheckCircle2, AlertTriangle, Info, AlertCircle } from "lucide-react";

interface Toast {
  id: string;
  title: string;
  message: string;
  type: "success" | "warning" | "info" | "error";
  duration?: number;
}

const DEFAULT_DURATION = 5000;

// Neutral card for every toast — only the icon and progress hairline carry color.
const typeConfig = {
  success: {
    icon: CheckCircle2,
    iconColor: "text-emerald-600 dark:text-emerald-400",
    progressBg: "bg-emerald-500/70",
  },
  warning: {
    icon: AlertTriangle,
    iconColor: "text-amber-600 dark:text-amber-400",
    progressBg: "bg-amber-500/70",
  },
  info: {
    icon: Info,
    iconColor: "text-primary",
    progressBg: "bg-primary/70",
  },
  error: {
    icon: AlertCircle,
    iconColor: "text-destructive",
    progressBg: "bg-destructive/70",
  },
};

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
}) {
  const progressRef = useRef<HTMLDivElement>(null);
  const duration = toast.duration ?? DEFAULT_DURATION;

  // Animate progress bar from 100% to 0% over the duration
  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;

    // Force reflow then start animation
    requestAnimationFrame(() => {
      el.style.transition = `width ${duration}ms linear`;
      el.style.width = "0%";
    });

    const timer = setTimeout(() => onRemove(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, duration, onRemove]);

  const config = typeConfig[toast.type];
  const Icon = config.icon;

  return (
    <div className="toast-in pointer-events-auto relative overflow-hidden rounded-xl border border-border bg-card shadow-elevated">
      <div className="flex items-start gap-3 p-4">
        <Icon
          className={`w-5 h-5 ${config.iconColor} shrink-0 mt-0.5`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {toast.title}
          </p>
          {toast.message && (
            <p className="text-xs mt-0.5 text-muted-foreground">
              {toast.message}
            </p>
          )}
        </div>
        <button
          onClick={() => onRemove(toast.id)}
          className="p-1 rounded-full text-muted-foreground opacity-60 hover:opacity-100 hover:bg-muted shrink-0 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {/* Progress bar */}
      <div className="h-0.5 w-full bg-muted">
        <div
          ref={progressRef}
          className={`h-full ${config.progressBg} w-full`}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const toast = (e as CustomEvent).detail as Toast;
      setToasts((prev) => {
        // Reject duplicates — same id means same source event fired by
        // multiple subscribers (e.g. a chat message picked up by three
        // socket hooks, or StrictMode double-mount).
        if (prev.some((t) => t.id === toast.id)) return prev;
        return [...prev, toast];
      });
    };

    window.addEventListener("codeclass:toast", handler);
    return () => window.removeEventListener("codeclass:toast", handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}
