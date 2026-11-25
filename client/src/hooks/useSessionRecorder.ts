import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { socketSendIfOpen, socketSubscribe } from "../lib/socket";
import { subscribe } from "../lib/activityMonitor";

/**
 * Collects lesson-recording events while a teacher has a recording running.
 *
 * Deliberately passive: it reads the code that PythonRunner ALREADY persists to
 * localStorage (`lesson_code_<saveKey>`), so no component needs new props and
 * the widget used across three lesson pages stays untouched.
 *
 * Dormant until the server pushes `recording_state: {recording: true}`.
 */

const SNAPSHOT_INTERVAL = 30_000;
const IDLE_THRESHOLD = 5 * 60_000; // 5 min of no typing and no tab-out = stuck
const PASTE_THRESHOLD = 200; // chars pasted in one go that look copy-pasted
const CODE_PREFIX = "lesson_code_";
const MAX_CODE = 20_000;

/** Collect the code the student is currently working on, largest buffer first. */
function collectCurrentCode(pathname: string): { code: string; key: string } | null {
  // Lesson id from /lessons/:id — used to prefer buffers for the current lesson.
  const lessonMatch = pathname.match(/\/lessons\/([^/]+)/);
  const lessonId = lessonMatch?.[1] || null;

  let best: { code: string; key: string } | null = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(CODE_PREFIX)) continue;
      if (lessonId && !key.includes(lessonId)) continue;
      const value = localStorage.getItem(key);
      if (!value || !value.trim()) continue;
      if (!best || value.length > best.code.length) {
        best = { code: value.slice(0, MAX_CODE), key: key.slice(CODE_PREFIX.length) };
      }
    }
  } catch {
    return null; // localStorage can throw in private mode
  }
  return best;
}

/**
 * Module-level flag mirroring the hook's state, so reportRecordingRun() (called
 * from PythonRunner, outside this hook) can cheaply skip work.
 */
let recordingActive = false;

/**
 * Events are sent with socketSendIfOpen, never socketSend: socketSend QUEUES
 * when the socket is down and flushes on reconnect, which would stamp an old
 * event onto the timeline at the wrong time. A dropped event is better than a
 * misplaced one.
 */
function emitEvent(payload: Record<string, unknown>) {
  if (!recordingActive) return;
  socketSendIfOpen("recording_event", payload);
}

export function useSessionRecorder() {
  const [recording, setRecording] = useState(false);
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  const lastCodeRef = useRef<string>("");
  const lastInputRef = useRef(Date.now());
  const idleReportedRef = useRef(false);
  const outRef = useRef(false); // dedupe: tab is already marked "out"

  const emit = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    emitEvent({ type, ...payload });
  }, []);

  // Server decides when collection is on.
  useEffect(() => {
    const unsub = socketSubscribe((msg) => {
      if (msg.type === "recording_state") {
        const on = !!msg.payload?.recording;
        recordingActive = on;
        setRecording(on);
      }
    });
    return () => {
      recordingActive = false;
      unsub();
    };
  }, []);

  // Periodic code snapshot. The server drops unchanged code, but comparing here
  // too avoids sending it over the wire at all.
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const found = collectCurrentCode(pathRef.current);
      if (!found || found.code === lastCodeRef.current) return;
      lastCodeRef.current = found.code;
      emit("code_snapshot", {
        code: found.code,
        label: found.key,
        meta: { lines: found.code.split("\n").length, chars: found.code.length },
      });
    }, SNAPSHOT_INTERVAL);
    return () => clearInterval(timer);
  }, [recording, emit]);

  // Tab-out / tab-back — sent immediately; these are the red markers. The tab is
  // "away" when it is hidden OR the window loses focus (e.g. another window
  // covering the page). Dedup so blur + visibility firing together (alt-tab)
  // only produces a single tab_out / tab_back pair.
  useEffect(() => {
    if (!recording) return;
    return subscribe((e) => {
      switch (e.type) {
        case "tabHidden":
        case "windowBlur":
          if (!outRef.current) {
            outRef.current = true;
            emit("tab_out");
          }
          break;
        case "tabVisible":
        case "windowFocus":
          lastInputRef.current = Date.now();
          idleReportedRef.current = false;
          if (outRef.current) {
            outRef.current = false;
            emit("tab_back");
          }
          break;
        default:
          break;
      }
    });
  }, [recording, emit]);

  // Large paste — a strong signal the code came from somewhere else.
  useEffect(() => {
    if (!recording) return;
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") || "";
      if (text.length < PASTE_THRESHOLD) return;
      emit("paste", {
        label: `Dán ${text.length} ký tự`,
        meta: { chars: text.length, lines: text.split("\n").length },
      });
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [recording, emit]);

  // Idle detection — a long silence usually means the student is stuck. Input
  // activity now comes from the shared monitor's single input listener.
  useEffect(() => {
    if (!recording) return;
    const unsub = subscribe((e) => {
      if (e.type === "inputActivity") {
        lastInputRef.current = Date.now();
        idleReportedRef.current = false;
      }
    });
    const timer = setInterval(() => {
      if (document.hidden || idleReportedRef.current) return;
      if (Date.now() - lastInputRef.current >= IDLE_THRESHOLD) {
        idleReportedRef.current = true;
        emit("idle_start", { label: "Không hoạt động 5 phút" });
      }
    }, 30_000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [recording, emit]);

  // Final snapshot on unload so the last edits aren't lost.
  useEffect(() => {
    if (!recording) return;
    const onHide = () => {
      const found = collectCurrentCode(pathRef.current);
      if (found && found.code !== lastCodeRef.current) {
        emitEvent({ type: "code_snapshot", code: found.code, label: found.key });
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [recording]);

  return recording;
}

/**
 * Called by PythonRunner on every Run. No-op unless a recording is active, so
 * normal self-study never touches the socket.
 */
export function reportRecordingRun(label: string | undefined, passed: boolean | null) {
  emitEvent({ type: "run", label: label || "Chạy code", passed });
}
