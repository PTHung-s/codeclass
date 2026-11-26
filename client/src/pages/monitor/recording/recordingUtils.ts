/** Shared types + helpers for the lesson-recording dashboard. */

export type RecEventType =
  | "code_snapshot"
  | "tab_out"
  | "tab_back"
  | "run"
  | "idle_start"
  | "paste"
  | "activity";

export interface RecEvent {
  id: string;
  at: string;
  type: RecEventType;
  code: string | null;
  label: string | null;
  passed: boolean | null;
  meta: { lines?: number; chars?: number } | null;
}

export interface RecSessionListItem {
  id: string;
  title: string | null;
  sessionDate: string;
  startedAt: string;
  endedAt: string | null;
  status: "recording" | "ended";
  startedBy: { id: string; fullName: string };
  participantCount: number;
}

export interface RecParticipant {
  id: string;
  userId: string;
  fullName: string;
  nickname?: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  addedManually: boolean;
  activeSeconds: number;
  tabOutCount: number;
  runCount: number;
  finalCode: string | null;
  eventCount: number;
}

/** Live cell pushed over WebSocket (batched every 2s, tab-outs immediately). */
export interface LiveCell {
  userId: string;
  code?: string | null;
  language?: string | null;
  label?: string | null;
  passed?: boolean | null;
  tabbedOut?: boolean;
  tabOutCount?: number;
  runCount?: number;
  lastEventAt: number;
  lastEventType: string;
}

export const EVENT_META: Record<RecEventType, { label: string; color: string; glyph: string }> = {
  code_snapshot: { label: "Viết code", color: "bg-primary", glyph: "●" },
  tab_out: { label: "Rời tab", color: "bg-red-500", glyph: "🔴" },
  tab_back: { label: "Quay lại", color: "bg-emerald-500", glyph: "●" },
  run: { label: "Chạy code", color: "bg-amber-500", glyph: "▲" },
  idle_start: { label: "Ngừng hoạt động", color: "bg-slate-400", glyph: "▬" },
  paste: { label: "Dán code", color: "bg-blue-500", glyph: "◆" },
  activity: { label: "Hoạt động", color: "bg-slate-400", glyph: "·" },
};

export function formatClock(value: string | number | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function formatClockSeconds(value: string | number | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDateVN(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDuration(seconds: number) {
  if (!seconds || seconds < 0) return "0 phút";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h} giờ ${m} phút`;
  return `${m} phút`;
}

export function initialOf(name?: string | null) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}
