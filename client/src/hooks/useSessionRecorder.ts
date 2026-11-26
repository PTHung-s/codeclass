import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { socketSendIfOpen, socketSubscribe } from "../lib/socket";
import { subscribe } from "../lib/activityMonitor";
import { getLiveEditorSnapshot } from "../lib/liveEditorBridge";

/**
 * Collects lesson-recording events while a teacher has a recording running.
 *
 * Reads from the universal Live Editor Bridge (covering ProblemDetail, CodeLab,
 * PythonRunner, etc.) with fallback to legacy `lesson_code_` localStorage keys.
 * Syncs recording state on mount & reconnect so refreshing mid-session over
 * Centrifugo never drops the rest of the student's timeline.
 */

const SNAPSHOT_INTERVAL = 5_000;
const IDLE_THRESHOLD = 5 * 60_000; // 5 min of no typing and no tab-out = stuck
const PASTE_THRESHOLD = 200; // chars pasted in one go that look copy-pasted
const CODE_PREFIX = "lesson_code_";
const MAX_CODE = 20_000;

/** Collect the code the student is currently working on: active editor bridge first, localStorage fallback. */
function collectCurrentCode(pathname: string): { code: string; key: string; language?: string } | null {
  const live = getLiveEditorSnapshot();
  if (live && live.code.trim()) {
    return {
      code: live.code.slice(0, MAX_CODE),
      key: live.label,
      language: live.language,
    };
  }

  // Fallback for legacy lesson pages that only persist to localStorage
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
    return null;
  }
  return best;
}

let recordingActive = false;

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
  const outRef = useRef(false);

  const emit = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    emitEvent({ type, ...payload });
  }, []);

  // Server decides when collection is on — explicitly request state on mount & reconnect
  // so Centrifugo refreshes resume recording immediately.
  useEffect(() => {
    socketSendIfOpen("recording_state_request", {});
    const unsub = socketSubscribe((msg) => {
      if (msg.type === "recording_state") {
        const on = !!msg.payload?.recording;
        recordingActive = on;
        if (!on) lastCodeRef.current = "";
        setRecording(on);
      } else if (msg.type === "__socket_open") {
        socketSendIfOpen("recording_state_request", {});
      }
    });
    return () => {
      recordingActive = false;
      unsub();
    };
  }, []);

  // Immediate initial snapshot + frequent change snapshots (every 5s if changed).
  useEffect(() => {
    if (!recording) return;
    const capture = () => {
      const found = collectCurrentCode(pathRef.current);
      if (!found || found.code === lastCodeRef.current) return;
      lastCodeRef.current = found.code;
      emit("code_snapshot", {
        code: found.code,
        label: found.key,
        meta: {
          lines: found.code.split("\n").length,
          chars: found.code.length,
          ...(found.language ? { language: found.language } : {}),
        },
      });
    };
    capture();
    const timer = setInterval(capture, SNAPSHOT_INTERVAL);
    return () => clearInterval(timer);
  }, [recording, emit]);

  // Tab-out / tab-back
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

  // Large paste detection
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

  // Idle detection
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

  // Final snapshot on pagehide
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
 * Called by PythonRunner, PythonCodeWorkspace, ProblemDetail, and CodeLab on
 * every Run/Submit. No-op unless a recording is active.
 */
export function reportRecordingRun(
  label: string | undefined,
  passed: boolean | null,
  codeOverride?: string,
) {
  const snapCode = typeof codeOverride === "string" ? codeOverride : getLiveEditorSnapshot()?.code;
  emitEvent({
    type: "run",
    label: label || "Chạy code",
    passed,
    ...(snapCode && snapCode.trim() ? { code: snapCode.slice(0, MAX_CODE) } : {}),
  });
}
