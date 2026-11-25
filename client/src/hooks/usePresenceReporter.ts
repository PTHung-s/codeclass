import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { socketSend, socketSubscribe } from "../lib/socket";
import { subscribe } from "../lib/activityMonitor";

const IDLE_MS = 90_000;
const REPORT_INTERVAL = 30_000;

/** Map the current URL to a human-readable activity for the teacher monitor. */
function deriveActivity(pathname: string): { type: string; label: string } {
  let heading = "";
  try {
    const h = document.querySelector("main h1, main h2") as HTMLElement | null;
    if (h) heading = (h.textContent || "").trim().slice(0, 60);
  } catch {
    /* ignore */
  }

  const p = pathname;
  if (p.startsWith("/problems/")) return { type: "problem", label: heading ? `Làm bài tập: ${heading}` : "Làm bài tập" };
  if (p === "/problems") return { type: "problems", label: "Xem danh sách bài tập" };
  if (p.startsWith("/lessons/")) return { type: "lesson", label: heading ? `Xem bài học: ${heading}` : "Xem bài học" };
  if (p.startsWith("/adaptive-test")) return { type: "quiz", label: "Làm quiz thích ứng" };
  if (p.startsWith("/quiz")) return { type: "quiz", label: "Làm quiz" };
  if (p.startsWith("/arena/")) return { type: "arena", label: "Chơi Debug Arena" };
  if (p === "/arena") return { type: "arena", label: "Xem Debug Arena" };
  if (p.startsWith("/courses/")) return { type: "course", label: heading ? `Xem khóa học: ${heading}` : "Xem khóa học" };
  if (p === "/leaderboard") return { type: "leaderboard", label: "Xem bảng xếp hạng" };
  if (p === "/" || p === "/dashboard") return { type: "dashboard", label: "Trang chính" };
  if (p === "/settings") return { type: "settings", label: "Cài đặt" };
  if (p === "/monitor") return { type: "monitor", label: "Giám sát học sinh" };
  return { type: "browsing", label: heading ? `Đang duyệt: ${heading}` : "Đang duyệt web" };
}

/**
 * Reports the current user's live activity (route + idle/away) to the server
 * over the shared WebSocket, so teachers can monitor students in real time.
 */
export function usePresenceReporter() {
  const location = useLocation();
  const lastInputRef = useRef(Date.now());
  const pathnameRef = useRef(location.pathname);
  const windowFocusedRef = useRef(true); // track window focus
  const lastReportRef = useRef<{ type: string; label: string; hidden: boolean; idle: boolean } | null>(null);
  pathnameRef.current = location.pathname;

  const report = useCallback((force = false) => {
    const hidden = document.hidden || !windowFocusedRef.current;
    const idle = !hidden && Date.now() - lastInputRef.current > IDLE_MS;
    const act = deriveActivity(pathnameRef.current);
    const snap = { type: act.type, label: act.label, hidden, idle };
    const prev = lastReportRef.current;
    if (
      !force &&
      prev &&
      prev.type === snap.type &&
      prev.label === snap.label &&
      prev.hidden === snap.hidden &&
      prev.idle === snap.idle
    ) {
      return; // nothing changed — avoid spamming
    }
    lastReportRef.current = snap;
    socketSend("presence_update", { activityType: act.type, activityLabel: act.label, hidden, idle });
  }, []);

  // Focus/visibility/idle signals come from the shared activity monitor — the
  // single detector also feeding lesson recording and quiz anti-cheat, so this
  // hook no longer wires raw DOM listeners.
  useEffect(() => {
    return subscribe((e) => {
      switch (e.type) {
        case "windowBlur":
        case "tabHidden":
          windowFocusedRef.current = false;
          report(true); // force immediate report — marks "away"
          break;
        case "windowFocus":
        case "tabVisible":
          windowFocusedRef.current = true;
          lastInputRef.current = Date.now(); // reset idle timer
          report(true); // force immediate report — back to online
          break;
        case "inputActivity":
          lastInputRef.current = Date.now(); // reset idle timer
          break;
        default:
          break;
      }
    });
  }, [report]);

  // Report on route change (small delay so the page heading is rendered)
  useEffect(() => {
    const t = setTimeout(() => report(true), 400);
    return () => clearTimeout(t);
  }, [location.pathname, report]);

  // Periodic heartbeat + re-report on reconnect
  useEffect(() => {
    const unsub = socketSubscribe((msg) => {
      if (msg.type === "__socket_open") report(true);
    });
    const interval = setInterval(() => report(), REPORT_INTERVAL);
    report(true);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [report]);
}
