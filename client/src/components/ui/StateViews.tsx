import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: ReactNode;
}

export function ErrorState({
  title = "Đã xảy ra lỗi",
  message = "Không tải được dữ liệu. Vui lòng thử lại.",
  onRetry,
  retryLabel = "Thử lại",
}: ErrorStateProps) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-10 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-destructive/20 bg-card text-destructive shadow-sm">
        <RefreshCw className="h-5 w-5" />
      </div>
      <p className="mt-3.5 text-sm font-semibold tracking-tight text-foreground">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-5 text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="btn-press mt-5 inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90"
        >
          <RefreshCw className="h-4 w-4" /> {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm ring-4 ring-muted/60">
        {icon}
      </div>
      <p className="mt-4 text-sm font-semibold tracking-tight text-foreground">{title}</p>
      {text ? (
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-5 text-muted-foreground">{text}</p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
