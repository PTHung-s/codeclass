import React from 'react';

interface State { hasError: boolean; message: string; }

/** Chặn trắng màn hình: component nào throw khi render sẽ bị bắt ở đây. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    // production build đã drop console; giữ lại để dev thấy stack
    console.error('[ErrorBoundary]', err, info.componentStack);
  }

  private reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="grid h-screen w-screen place-items-center bg-base p-6 text-center">
        <div className="max-w-md space-y-4">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-panel bg-danger/15 text-3xl">⚠️</div>
          <h1 className="text-lg font-bold text-white">Đã xảy ra lỗi giao diện</h1>
          <p className="text-sm text-muted">
            Một thành phần gặp sự cố. Bạn có thể thử tiếp tục; nếu vẫn lỗi, tải lại trang.
          </p>
          {this.state.message && (
            <pre className="max-h-24 overflow-auto rounded-card bg-raised p-3 text-left text-[11px] text-muted custom-scrollbar">
              {this.state.message}
            </pre>
          )}
          <div className="flex justify-center gap-2">
            <button onClick={this.reset} className="rounded-ctl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-110">
              Thử tiếp tục
            </button>
            <button onClick={() => window.location.reload()} className="rounded-ctl border border-line-strong px-4 py-2 text-sm font-semibold text-white hover:bg-line">
              Tải lại trang
            </button>
          </div>
        </div>
      </div>
    );
  }
}
