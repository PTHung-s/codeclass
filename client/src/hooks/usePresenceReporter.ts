import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { socketSend, socketSendIfOpen, socketSubscribe } from "../lib/socket";
import { subscribe } from "../lib/activityMonitor";
import { getLiveEditorSnapshot, subscribeLiveEditor } from "../lib/liveEditorBridge";

const IDLE_MS = 90_000;
const REPORT_INTERVAL = 30_000;
const LIVE_CODE_DEBOUNCE_MS = 1800;

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
  if (p.startsWith("/code-lab")) return { type: "code_lab", label: "Code Lab (lập trình trực tuyến)" };
  if (p.startsWith("/problems/")) return { type: "problem", label: heading ? `Làm bài tập: ${heading}` : "Làm bài tập" };
  if (p === "/problems") return { type: "problems", label: "Xem danh sách bài tập" };
  if (p.startsWith("/lessons/")) return { type: "lesson", label: heading ? `Xem bài học: ${heading}` : "Xem bài học" };
  if (/^\/course\/[^/]+\/lesson\/[^/]+\/code/.test(p)) {
    return { type: "lesson", label: heading ? `Code buổi học: ${heading}` : "Xem code buổi học" };
  }
  if (/^\/course\/[^/]+\/lesson\/[^/]+/.test(p)) {
    return { type: "lesson", label: heading ? `Buổi học: ${heading}` : "Đang học buổi học" };
  }
  if (p.startsWith("/course/") || p.startsWith("/courses/")) {
    return { type: "course", label: heading ? `Xem khóa học: ${heading}` : "Xem khóa học" };
  }
  if (/^\/exams\/[^/]+\/take/.test(p)) return { type: "exam", label: heading ? `Đang làm bài thi: ${heading}` : "Đang làm bài thi" };
  if (p.startsWith("/exams")) return { type: "exam", label: heading ? `Phòng thi: ${heading}` : "Phòng thi" };
  if (p.startsWith("/adaptive-test")) return { type: "quiz", label: "Làm quiz thích ứng" };
  if (p.startsWith("/quiz-arena")) return { type: "arena", label: "Đấu trường Quiz" };
  if (p.startsWith("/code-duel")) return { type: "arena", label: "Đấu trường Code Duel" };
  if (p.startsWith("/arena")) return { type: "arena", label: "Đấu trường Debug Arena" };
  if (p.startsWith("/games")) return { type: "arena", label: "Sảnh trò chơi" };
  if (p.startsWith("/quiz")) return { type: "quiz", label: "Làm quiz" };
  if (p.startsWith("/meet")) return { type: "meet", label: "Lớp học Meeting" };
  if (p.startsWith("/my-assignments") || p.startsWith("/assignments")) {
    return { type: "assignment", label: "Bài tập được giao" };
  }
  if (p === "/leaderboard") return { type: "leaderboard", label: "Xem bảng xếp hạng" };
  if (p === "/" || p === "/dashboard") return { type: "dashboard", label: "Trang chính" };
  if (p === "/settings") return { type: "settings", label: "Cài đặt" };
  if (p === "/monitor") return { type: "monitor", label: "Giám sát học sinh" };
  return { type: "browsing", label: heading ? `Đang duyệt: ${heading}` : "Đang duyệt web" };
}

/**
 * Reports the current user's live activity (route + idle/away) and live editor
 * code buffer to the server over the shared realtime transport.
 */
export function usePresenceReporter() {
  const location = useLocation();
  const lastInputRef = useRef(Date.now());
  const pathnameRef = useRef(location.pathname);
  const windowFocusedRef = useRef(true);
  const lastReportRef = useRef<{ type: string; label: string; hidden: boolean; idle: boolean } | null>(null);
  const lastCodeSentKeyRef = useRef<string>("");
  const codeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  pathnameRef.current = location.pathname;

  const pushLiveCode = useCallback((force = false) => {
    const snap = getLiveEditorSnapshot();
    const key = snap ? `${snap.source}|${snap.language}|${snap.label}|${snap.code}` : "__empty__";
    if (!force && key === lastCodeSentKeyRef.current) return;
    lastCodeSentKeyRef.current = key;
    if (!snap) {
      socketSendIfOpen("live_code_update", { code: null, language: null, label: null });
      return;
    }
    socketSendIfOpen("live_code_update", {
      code: snap.code,
      language: snap.language,
      label: snap.label,
      source: snap.source,
    });
  }, []);

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
      return;
    }
    lastReportRef.current = snap;
    socketSend("presence_update", { activityType: act.type, activityLabel: act.label, hidden, idle });
  }, []);

  useEffect(() => {
    return subscribe((e) => {
      switch (e.type) {
        case "windowBlur":
        case "tabHidden":
          windowFocusedRef.current = false;
          report(true);
          break;
        case "windowFocus":
        case "tabVisible":
          windowFocusedRef.current = true;
          lastInputRef.current = Date.now();
          report(true);
          break;
        case "inputActivity":
          lastInputRef.current = Date.now();
          break;
        default:
          break;
      }
    });
  }, [report]);

  // Stream active editor code changes (debounced ~1.8s while typing, instant on clear)
  useEffect(() => {
    const unsub = subscribeLiveEditor((snap) => {
      if (codeTimerRef.current) clearTimeout(codeTimerRef.current);
      if (!snap) {
        pushLiveCode(false);
        return;
      }
      codeTimerRef.current = setTimeout(() => {
        pushLiveCode(false);
      }, LIVE_CODE_DEBOUNCE_MS);
    });
    return () => {
      if (codeTimerRef.current) clearTimeout(codeTimerRef.current);
      unsub();
    };
  }, [pushLiveCode]);

  // Report on route change (small delay so the page heading is rendered)
  useEffect(() => {
    const t = setTimeout(() => report(true), 400);
    return () => clearTimeout(t);
  }, [location.pathname, report]);

  // Periodic heartbeat + re-report on reconnect
  useEffect(() => {
    const unsub = socketSubscribe((msg) => {
      if (msg.type === "__socket_open") {
        report(true);
        pushLiveCode(true);
      }
    });
    const interval = setInterval(() => {
      report();
      if (getLiveEditorSnapshot()) pushLiveCode(false);
    }, REPORT_INTERVAL);
    report(true);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [report, pushLiveCode]);
}
