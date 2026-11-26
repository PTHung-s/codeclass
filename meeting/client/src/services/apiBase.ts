/**
 * API base helper — mọi fetch trong app phải đi qua đây.
 *
 * Khi deploy production dưới subfolder /meet/ (Caddy proxy), origin là
 * codeclass.vnotemate.com → request /api/* sẽ hit CodeClass backend (404).
 * Phải prepend APP_BASE (/meet) để Caddy route đúng tới video-call server.
 *
 * Dev mode (Vite dev server) không set VITE_APP_BASE → trả '' như cũ.
 */
export const APP_BASE = (import.meta.env.VITE_APP_BASE || '').replace(/\/$/, '');

export const apiUrl = (path: string): string => {
  // path bắt đầu bằng '/' — ví dụ '/api/rooms'
  if (!APP_BASE) return path;
  return `${APP_BASE}${path}`;
};

export const originUrl = (path = ''): string => {
  return `${window.location.origin}${APP_BASE}${path}`;
};
