import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Users, X, GripHorizontal, Activity, Code2, BookOpen, Brain,
  Gamepad2, ClipboardList, Trophy, MonitorPlay, ChevronDown, ChevronUp,
} from "lucide-react";
import { usePresence, type PresenceStudent } from "../../hooks/usePresence";
import { useAuthContext } from "../../contexts/AuthContext";
import { getAnimalAvatarUrl, getAvatarBgColor, cn } from "../../lib/utils";
import { StudentName } from "../ui/StudentName";

const POS_KEY = "teacher-presence-widget:pos";
const DRAG_THRESHOLD = 5;

const STATUS_META = {
  online: { label: "Online", dot: "bg-emerald-500", ring: "ring-emerald-400" },
  idle: { label: "Nhàn rỗi", dot: "bg-amber-500", ring: "ring-amber-400" },
  away: { label: "Treo máy", dot: "bg-rose-500", ring: "ring-rose-400" },
  offline: { label: "Offline", dot: "bg-muted-foreground/50", ring: "ring-muted-foreground/30" },
} as const;

const ACTIVITY_ICON: Record<string, typeof Code2> = {
  problem: Code2, problems: Code2,
  lesson: BookOpen, course: BookOpen,
  quiz: Brain, arena: Gamepad2,
  assignment: ClipboardList, assignments: ClipboardList,
  leaderboard: Trophy, dashboard: Activity, monitor: MonitorPlay,
};

interface Pos { x: number; y: number }

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p.x === "number" && typeof p.y === "number") return p;
  } catch { /* ignore */ }
  return null;
}

function savePos(p: Pos) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

function timeAgo(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return "vừa xong";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}ph`;
  return `${Math.floor(m / 60)}h`;
}

function useDraggable() {
  const [pos, setPos] = useState<Pos | null>(() => loadPos());
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);

  const clamp = (x: number, y: number, el: HTMLElement): Pos => ({
    x: Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, x)),
    y: Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, y)),
  });

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-drag]")) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const current = pos ?? { x: rect.left, y: rect.top };
    startRef.current = { px: e.clientX, py: e.clientY, ox: current.x, oy: current.y, moved: false };
    setDragging(true);
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = startRef.current;
    if (!start) return;
    const dx = e.clientX - start.px, dy = e.clientY - start.py;
    if (!start.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    start.moved = true;
    setPos(clamp(start.ox + dx, start.oy + dy, e.currentTarget as HTMLElement));
  };

  const endDrag = (e: React.PointerEvent, persist: boolean): boolean => {
    const start = startRef.current;
    startRef.current = null;
    setDragging(false);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const moved = start?.moved === true;
    if (persist && moved) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      savePos({ x: rect.left, y: rect.top });
    }
    return moved;
  };

  return { pos, dragging, onPointerDown, onPointerMove, endDrag };
}

export default function TeacherPresenceWidget() {
  const { user } = useAuthContext();
  const students = usePresence();
  const { pos, dragging, onPointerDown, onPointerMove, endDrag } = useDraggable();
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState(false);

  // Re-render every 3s for "time ago"
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(t);
  }, []);

  // Restore dismissed state from session storage
  useEffect(() => {
    const d = sessionStorage.getItem("teacher-presence-widget:dismissed");
    if (d === "1") setDismissed(true);
  }, []);

  const isStaff =
    user?.role === "teacher" || user?.role === "admin" || user?.role === "teaching_assistant";
  if (!isStaff || dismissed) return null;

  const onlineCount = students.filter((s) => s.status === "online").length;
  const idleCount = students.filter((s) => s.status === "idle").length;
  const awayCount = students.filter((s) => s.status === "away").length;

  const wrapperStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, bottom: "auto", right: "auto" }
    : {};

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-[61] flex flex-col items-end gap-2"
      style={wrapperStyle}
    >
      <AnimatePresence mode="wait">
        {expanded ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endDrag(e, true)}
            onPointerCancel={(e) => endDrag(e, false)}
            className={`pointer-events-auto w-72 select-none overflow-hidden rounded-2xl border border-border bg-card shadow-xl ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            style={{ touchAction: "none" }}
          >
            {/* Drag handle + header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <GripHorizontal className="size-3.5 text-muted-foreground/40" />
                <Users className="size-4 text-brand-600" />
                <span className="text-sm font-semibold">Học sinh</span>
                <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                  {onlineCount}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  data-no-drag
                  onClick={() => setDismissed(true)}
                  className="rounded-full p-1 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Ẩn widget"
                  title="Ẩn widget (ấn F5 để hiện lại)"
                >
                  <X className="size-3.5" />
                </button>
                <button
                  data-no-drag
                  onClick={() => setExpanded(false)}
                  className="rounded-full p-1 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Thu gọn"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
            </div>

            {/* Summary counts */}
            <div className="flex gap-1 px-4 py-2 text-[11px]">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-500" /> {onlineCount} online
              </span>
              <span className="mx-1 text-muted-foreground">·</span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-amber-500" /> {idleCount} nhàn rỗi
              </span>
              <span className="mx-1 text-muted-foreground">·</span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-rose-500" /> {awayCount} treo máy
              </span>
            </div>

            {/* Student list */}
            <div className="max-h-64 overflow-y-auto px-2 pb-2">
              {students.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  Chưa có học sinh online
                </div>
              ) : (
                students.map((s) => (
                  <StudentRow key={s.userId} student={s} now={now} />
                ))
              )}
            </div>
          </motion.div>
        ) : (
          /* Collapsed button */
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => { const moved = endDrag(e, true); if (!moved) setExpanded(true); }}
            onPointerCancel={(e) => endDrag(e, false)}
            aria-label={`${onlineCount} học sinh online — bấm để xem`}
            title="Giám sát học sinh (kéo để di chuyển)"
            className="pointer-events-auto relative flex size-12 cursor-grab items-center justify-center rounded-full border border-border bg-card shadow-lg ring-1 ring-black/5 active:scale-95"
            style={{ touchAction: "none" }}
          >
            <Users className="size-5 text-brand-600" />
            {onlineCount > 0 && (
              <span className="absolute -right-1 -top-1 flex min-w-[20px] h-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white shadow-sm">
                {onlineCount}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function StudentRow({ student, now }: { student: PresenceStudent; now: number }) {
  const meta = STATUS_META[student.status] || STATUS_META.offline;
  const ActivityIcon = ACTIVITY_ICON[student.activityType] || Activity;

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors">
      {/* Avatar + status dot */}
      <span className="relative shrink-0">
        <div
          className="relative inline-flex size-8 shrink-0 overflow-hidden rounded-full"
          style={{ backgroundColor: getAvatarBgColor(student.fullName) }}
        >
          <img
            src={student.avatarUrl || getAnimalAvatarUrl(student.fullName)}
            alt={student.fullName}
            className="size-full rounded-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className="absolute inset-0 flex size-full items-center justify-center rounded-full text-xs font-bold text-white">
            {student.fullName.charAt(0).toUpperCase()}
          </div>
        </div>
        <span className={cn(
          "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white dark:border-gray-900",
          meta.dot
        )} />
      </span>

      {/* Name + activity */}
      <div className="min-w-0 flex-1">
        <StudentName fullName={student.fullName} nickname={student.nickname} primaryClassName="text-sm font-medium leading-tight" />
        <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <ActivityIcon className="size-3 shrink-0" />
          <span className="truncate">{student.activityLabel}</span>
        </p>
      </div>

      {/* Time ago */}
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
        {timeAgo(student.lastActiveAt, now)}
      </span>
    </div>
  );
}
