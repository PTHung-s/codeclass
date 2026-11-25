import { useEffect, useRef, useState } from "react";
import api from "../lib/api";
import { useAuthContext } from "../contexts/AuthContext";

export interface ServerMetrics {
  timestamp: string;
  uptimeSec: number;
  cpu: { processPct: number; hostPct: number; load1: number; load5: number; load15: number; cores: number };
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number; externalMb: number };
  requests: { perSec: number };
  dbErrors: Record<string, number>;
  websocket: { activeConnections: number };
  queue: { waiting: number };
}

export const METRICS_HISTORY = 40; // ~2 minutes at 3s polling

export interface MetricsHistory {
  cpu: number[];
  mem: number[];
  req: number[];
  ws: number[];
}

// ── Shared state, so the overlay and the detail page poll ONCE between them ──
let current: ServerMetrics | null = null;
let history: MetricsHistory = { cpu: [], mem: [], req: [], ws: [] };
let lastError: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let subscriberCount = 0;

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  for (const fn of listeners) fn();
}

async function poll() {
  try {
    const r = await api.get("/admin/metrics");
    current = r.data as ServerMetrics;
    history = {
      cpu: [...history.cpu, current.cpu.processPct].slice(-METRICS_HISTORY),
      mem: [...history.mem, current.memory.rssMb].slice(-METRICS_HISTORY),
      req: [...history.req, current.requests.perSec].slice(-METRICS_HISTORY),
      ws: [...history.ws, current.websocket.activeConnections].slice(-METRICS_HISTORY),
    };
    lastError = null;
  } catch (err: any) {
    lastError = err?.response?.data?.error || "Không tải được metrics";
  }
  notify();
}

/**
 * Poll server metrics while at least one component is mounted.
 *
 * Polling is reference-counted and the result is shared: the corner overlay and
 * the full page can both be open without doubling the request rate — which
 * would be self-defeating for a tool whose job is to show server load.
 *
 * `enabled: false` unsubscribes without unmounting, so the overlay can be
 * toggled off and stop costing anything.
 */
export function useServerMetrics(enabled = true, intervalMs = 3000) {
  const [, force] = useState(0);
  const rerender = useRef(() => force((n) => n + 1));

  useEffect(() => {
    if (!enabled) return;
    const listener = () => rerender.current();
    listeners.add(listener);
    subscriberCount++;

    if (!timer) {
      void poll();
      timer = setInterval(poll, intervalMs);
    } else if (current) {
      // Late joiner gets whatever the first subscriber already fetched.
      listener();
    }

    return () => {
      listeners.delete(listener);
      subscriberCount--;
      if (subscriberCount <= 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, [enabled, intervalMs]);

  return { metrics: current, history, error: lastError };
}

// ── Overlay visibility, persisted so it survives navigation and reloads ──
const OVERLAY_KEY = "codeclass_perf_overlay";

export function getOverlayEnabled(): boolean {
  return localStorage.getItem(OVERLAY_KEY) === "1";
}

export function setOverlayEnabled(on: boolean): void {
  localStorage.setItem(OVERLAY_KEY, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent("codeclass:perf-overlay", { detail: { on } }));
}

/** Reads the persisted flag and stays in sync when it is toggled elsewhere. */
export function useOverlayEnabled(): [boolean, (on: boolean) => void] {
  const { user } = useAuthContext();
  const isStaff = user?.role === "admin" || user?.role === "teacher" || user?.role === "teaching_assistant";
  const [on, setOn] = useState(() => isStaff && getOverlayEnabled());

  useEffect(() => {
    const handler = (e: Event) => setOn(isStaff && !!(e as CustomEvent).detail?.on);
    window.addEventListener("codeclass:perf-overlay", handler);
    return () => window.removeEventListener("codeclass:perf-overlay", handler);
  }, [isStaff]);

  return [isStaff && on, setOverlayEnabled];
}
