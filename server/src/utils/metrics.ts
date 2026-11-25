/**
 * Lightweight server metrics for the admin monitor. No external dependency —
 * just process + os + a few in-memory counters we already touch.
 *
 * This is intentionally simple: a 1-vCPU host with a SQLite database does not
 * need Prometheus. The admin monitor polls /api/admin/metrics every few
 * seconds and draws CPU/RAM/load plus request/error counters.
 */

import os from "os";

// ── Request counter ──
// Reset every 10s, so "requests/s" is the rate over the last window.
const WINDOW_MS = 10_000;
let windowRequests = 0;
let windowResetAt = Date.now();
let lastRate = 0;

export function countRequest(): void {
  windowRequests++;
}

export function requestRate(): number {
  const now = Date.now();
  if (now - windowResetAt >= WINDOW_MS) {
    lastRate = windowRequests / (WINDOW_MS / 1000);
    windowRequests = 0;
    windowResetAt = now;
  }
  return lastRate;
}

// ── SQLite error counters (P1008 "database is locked" / timeouts) ──
// Updated by prisma.ts where the errors are caught, so they are cheap and
// always in sync with what actually happened.
const dbErrors: Record<string, number> = {};

export function countDbError(kind: string): void {
  dbErrors[kind] = (dbErrors[kind] || 0) + 1;
}

export function dbErrorCounts(): Record<string, number> {
  return { ...dbErrors };
}

// ── CPU ──
// os.loadavg() is 1/5/15-minute averages; on a 1-vCPU host, 1.0 = one core
// saturated. cpuUsage() is process (not host) CPU.
const PROCESS_CPUS = Math.max(1, os.cpus().length);

function processCpuPercent(): number {
  try {
    const usage = process.cpuUsage(); // { user, system } microseconds
    const total = usage.user + usage.system;
    const seconds = process.uptime();
    if (seconds <= 0) return 0;
    const percent = (total / 1_000_000 / seconds / PROCESS_CPUS) * 100;
    return Math.min(100, Math.max(0, Math.round(percent)));
  } catch {
    return 0;
  }
}

function hostCpuPercent(): number {
  // 1-minute loadavg / core count, capped at 100%.
  const perCore = os.loadavg()[0] / PROCESS_CPUS;
  return Math.min(100, Math.max(0, Math.round(perCore * 100)));
}

// ── WebSocket / queue ──
// Filled in at read time by whoever owns the state, to avoid a circular import.
let activeWsCount = 0;
let queueDepth = 0;

export function setActiveWsCount(n: number): void {
  activeWsCount = n;
}

export function setQueueDepth(n: number): void {
  queueDepth = n;
}

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

export function collectMetrics(): ServerMetrics {
  const mem = process.memoryUsage();
  const [load1, load5, load15] = os.loadavg();

  return {
    timestamp: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    cpu: {
      processPct: processCpuPercent(),
      hostPct: hostCpuPercent(),
      load1,
      load5,
      load15,
      cores: PROCESS_CPUS,
    },
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      externalMb: Math.round(mem.external / 1024 / 1024),
    },
    requests: { perSec: requestRate() },
    dbErrors: dbErrorCounts(),
    websocket: { activeConnections: activeWsCount },
    queue: { waiting: queueDepth },
  };
}
