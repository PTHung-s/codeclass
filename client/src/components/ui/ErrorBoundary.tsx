import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render errors in child components so a single broken component
 * doesn't unmount the entire React tree (blank page).
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-red-200 bg-red-50/50 p-10 dark:border-red-900 dark:bg-red-950/20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-950/50">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-base font-bold">Có lỗi xảy ra</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {this.state.error?.message || "Không thể hiển thị nội dung này."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tải lại trang
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
