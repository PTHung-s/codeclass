import { useCallback, useMemo } from "react";

interface ToastOptions {
  title: string;
  message?: string;
  duration?: number;
}

interface ToastDetail {
  id: string;
  title: string;
  message: string;
  type: "success" | "warning" | "info" | "error";
  duration?: number;
}

export function useToast() {
  const emit = useCallback(
    (type: ToastDetail["type"], { title, message, duration }: ToastOptions) => {
      const id = crypto.randomUUID();
      const detail: ToastDetail = {
        id,
        title,
        message: message || "",
        type,
        duration: duration ?? 5000,
      };
      window.dispatchEvent(
        new CustomEvent("codeclass:toast", { detail })
      );
    },
    []
  );

  // Return a stable object (memoized on `emit`, which is stable) so callers can
  // safely use `toast` as a dependency of useCallback/useEffect without re-running
  // their effects on every render (which caused infinite fetch loops).
  return useMemo(
    () => ({
      success: (opts: ToastOptions) => emit("success", opts),
      error: (opts: ToastOptions) => emit("error", opts),
      warning: (opts: ToastOptions) => emit("warning", opts),
      info: (opts: ToastOptions) => emit("info", opts),
    }),
    [emit]
  );
}
