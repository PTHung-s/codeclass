import { useCallback, useEffect, useRef, useState } from "react";
import type { SupportedLanguage } from "../lib/codeRunner";
import { socketIsOpen, socketSendIfOpen, socketSubscribe } from "../lib/socket";

export type InteractiveTerminalPhase = "idle" | "starting" | "running" | "stopping";

export interface TerminalExit {
  status: "success" | "runtime_error" | "time_limit" | "blocked" | "compile_error" | "stopped" | "output_limit" | "disconnected" | "error";
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  reason?: string;
}

interface UseInteractiveTerminalOptions {
  onOutput: (stream: "stdout" | "stderr", data: string) => void;
  onExit: (exit: TerminalExit) => void;
  onError: (message: string) => void;
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useInteractiveTerminal({ onOutput, onExit, onError }: UseInteractiveTerminalOptions) {
  const [phase, setPhase] = useState<InteractiveTerminalPhase>("idle");
  const [connected, setConnected] = useState(socketIsOpen());
  const sessionIdRef = useRef<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const pendingInputRef = useRef<string[]>([]);
  const callbacksRef = useRef({ onOutput, onExit, onError });

  useEffect(() => {
    callbacksRef.current = { onOutput, onExit, onError };
  }, [onError, onExit, onOutput]);

  useEffect(() => {
    const unsubscribe = socketSubscribe((msg) => {
      const payload = msg?.payload || {};

      if (msg?.type === "__socket_open") {
        setConnected(true);
        return;
      }
      if (msg?.type === "__socket_close") {
        setConnected(false);
        if (sessionIdRef.current || requestIdRef.current) {
          sessionIdRef.current = null;
          requestIdRef.current = null;
          pendingInputRef.current = [];
          setPhase("idle");
          callbacksRef.current.onError("Mất kết nối terminal. Phiên chạy đã được dừng để bảo vệ tài nguyên.");
        }
        return;
      }

      if (msg?.type === "terminal_started" && payload.requestId === requestIdRef.current) {
        const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : null;
        sessionIdRef.current = sessionId;
        if (!sessionId) {
          requestIdRef.current = null;
          setPhase("idle");
          callbacksRef.current.onError("Máy chủ không trả về phiên terminal hợp lệ.");
          return;
        }
        requestIdRef.current = null;
        setPhase("running");
        const queuedInput = pendingInputRef.current;
        pendingInputRef.current = [];
        for (const data of queuedInput) {
          if (!socketSendIfOpen("terminal_input", { sessionId, data })) {
            callbacksRef.current.onError("Mất kết nối khi gửi input vào terminal.");
            break;
          }
        }
        return;
      }

      if (msg?.type === "terminal_output" && payload.sessionId === sessionIdRef.current) {
        if ((payload.stream === "stdout" || payload.stream === "stderr") && typeof payload.data === "string") {
          callbacksRef.current.onOutput(payload.stream, payload.data);
        }
        return;
      }

      if (msg?.type === "terminal_exit" && payload.sessionId === sessionIdRef.current) {
        sessionIdRef.current = null;
        requestIdRef.current = null;
        setPhase("idle");
        callbacksRef.current.onExit({
          status: payload.status || "error",
          exitCode: typeof payload.exitCode === "number" ? payload.exitCode : null,
          durationMs: Number(payload.durationMs) || 0,
          timedOut: Boolean(payload.timedOut),
          reason: typeof payload.reason === "string" ? payload.reason : undefined,
        });
        return;
      }

      if (msg?.type === "terminal_error") {
        const message = typeof payload.message === "string" ? payload.message : "Không chạy được terminal.";
        if (payload.requestId === requestIdRef.current) {
          sessionIdRef.current = null;
          requestIdRef.current = null;
          pendingInputRef.current = [];
          setPhase("idle");
          callbacksRef.current.onError(message);
        } else if (payload.sessionId === sessionIdRef.current) {
          callbacksRef.current.onError(message);
        }
      }
    });

    return () => {
      const sessionId = sessionIdRef.current;
      if (sessionId && socketIsOpen()) socketSendIfOpen("terminal_stop", { sessionId });
      sessionIdRef.current = null;
      requestIdRef.current = null;
      pendingInputRef.current = [];
      unsubscribe();
    };
  }, []);

  const start = useCallback((language: SupportedLanguage, code: string): boolean => {
    if (sessionIdRef.current || requestIdRef.current) return false;
    if (!socketIsOpen()) {
      callbacksRef.current.onError("Terminal chưa kết nối. Hãy đợi vài giây rồi thử lại.");
      return false;
    }

    const nextRequestId = requestId();
    requestIdRef.current = nextRequestId;
    pendingInputRef.current = [];
    setPhase("starting");
    const sent = socketSendIfOpen("terminal_start", { requestId: nextRequestId, language, code });
    if (!sent) {
      requestIdRef.current = null;
      pendingInputRef.current = [];
      setPhase("idle");
      callbacksRef.current.onError("Không gửi được yêu cầu chạy code.");
    }
    return sent;
  }, []);

  const write = useCallback((data: string): boolean => {
    if (requestIdRef.current && !sessionIdRef.current) {
      pendingInputRef.current.push(data);
      return true;
    }
    const sessionId = sessionIdRef.current;
    if (!sessionId || !socketIsOpen()) return false;
    return socketSendIfOpen("terminal_input", { sessionId, data });
  }, []);

  const stop = useCallback((): boolean => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !socketIsOpen()) return false;
    setPhase("stopping");
    const sent = socketSendIfOpen("terminal_stop", { sessionId });
    if (!sent) setPhase("running");
    return sent;
  }, []);

  return { phase, connected, start, write, stop };
}
