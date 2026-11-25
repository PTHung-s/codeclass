import { useState, useCallback, useRef, createContext, useContext } from "react";
import ConfirmDialog from "../components/ui/ConfirmDialog";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirmContext() {
  const ctx = useContext(ConfirmContext);
  if (!ctx)
    throw new Error("useConfirmContext must be used within ConfirmProvider");
  return ctx;
}

/**
 * Hook cung cấp hàm confirm() trả về Promise<boolean>.
 * Cần bọc app trong ConfirmProvider (đặt trong Layout.tsx).
 *
 * Usage:
 *   const confirm = useConfirmContext();
 *   const ok = await confirm({ title: "Xóa?", message: "Không thể hoàn tác", variant: "danger" });
 *   if (ok) { ... }
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    opts: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm: ConfirmFn = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ opts, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state?.resolve(true);
    setState(null);
  }, [state]);

  const handleCancel = useCallback(() => {
    state?.resolve(false);
    setState(null);
  }, [state]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={!!state}
        title={state?.opts.title || ""}
        message={state?.opts.message || ""}
        confirmLabel={state?.opts.confirmLabel}
        cancelLabel={state?.opts.cancelLabel}
        variant={state?.opts.variant || "primary"}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
}
