import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_APP_BASE
  ? window.location.origin            // production: cùng origin, path /meet/socket.io/
  : (import.meta.env.VITE_SOCKET_URL || window.location.origin);

// App deploy dưới subfolder → socket.io path phải là /meet/socket.io/
const APP_BASE = (import.meta.env.VITE_APP_BASE || '').replace(/\/$/, '');
const SOCKET_PATH = APP_BASE ? `${APP_BASE}/socket.io/` : '/socket.io/';

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  path: SOCKET_PATH,
});
