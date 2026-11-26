import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Users,
  Wifi,
  WifiOff,
  MonitorPlay,
  Code2,
  BookOpen,
  Brain,
  Gamepad2,
  ClipboardList,
  Trophy,
  Clock,
  Video,
  CalendarCheck,
  Eye,
  Copy,
  Check,
} from "lucide-react";
import { usePresence, type PresenceStatus, type PresenceStudent } from "../../hooks/usePresence";
import StudentAvatar from "../../components/ui/StudentAvatar";
import { StudentName } from "../../components/ui/StudentName";
import RecordingPage from "./recording/RecordingPage";
import StreakOverviewTab from "../../components/streak/StreakOverviewTab";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/utils";

const STATUS_META: Record<PresenceStatus, { label: string; dot: string; text: string }> = {
  online: { label: "Đang hoạt động", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  idle: { label: "Nhàn rỗi", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  away: { label: "Treo máy / tab khác", dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  offline: { label: "Ngoại tuyến", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
};

const ACTIVITY_ICON: Record<string, typeof Code2> = {
  problem: Code2,
  problems: Code2,
  code_lab: Code2,
  lesson: BookOpen,
  course: BookOpen,
  quiz: Brain,
  arena: Gamepad2,
  assignment: ClipboardList,
  assignments: ClipboardList,
  exam: ClipboardList,
  meet: Video,
  leaderboard: Trophy,
  dashboard: Activity,
  monitor: MonitorPlay,
};

function timeAgo(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return "vừa xong";
  if (s < 60) return `${s} giây trước`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  return `${Math.floor(m / 60)} giờ trước`;
}

export default function MonitorPage() {
  const students = usePresence();
  const [tab, setTab] = useState<"live" | "recording" | "streak">("live");
  const [filter, setFilter] = useState<"all" | "online" | "idle" | "away">("all");
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Re-render every few seconds so "X giây trước" stays fresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => {
    const c = { online: 0, idle: 0, away: 0 };
    for (const s of students) {
      if (s.status === "online") c.online++;
      else if (s.status === "idle") c.idle++;
      else if (s.status === "away") c.away++;
    }
    return c;
  }, [students]);

  const filtered = filter === "all" ? students : students.filter((s) => s.status === filter);

  const viewingStudent = useMemo(
    () => (viewingUserId ? students.find((s) => s.userId === viewingUserId) ?? null : null),
    [students, viewingUserId],
  );

  const handleCopyCode = async () => {
    if (!viewingStudent?.code) return;
    try {
      await navigator.clipboard.writeText(viewingStudent.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore clipboard denial */
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold dark:text-foreground">
          <MonitorPlay className="h-6 w-6" /> Giám sát học sinh
        </h1>
        <p className="text-sm text-muted-foreground">
          Trạng thái &amp; code real-time của học sinh đang online · cập nhật tự động qua WebSocket
        </p>
      </div>

      {/* Sub-tabs: live presence vs streak vs recorded sessions */}
      <div className="flex gap-1 border-b">
        {([
          { key: "live", label: "Đang online", icon: Users },
          { key: "streak", label: "Chuỗi học", icon: CalendarCheck },
          { key: "recording", label: "Ghi buổi học", icon: Video },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "recording" ? (
        <RecordingPage />
      ) : tab === "streak" ? (
        <StreakOverviewTab />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard
              icon={Users}
              label="Tổng online"
              value={students.length}
              tone="indigo"
              onClick={() => setFilter("all")}
              active={filter === "all"}
            />
            <SummaryCard
              icon={Wifi}
              label="Đang hoạt động"
              value={counts.online}
              tone="emerald"
              onClick={() => setFilter("online")}
              active={filter === "online"}
            />
            <SummaryCard
              icon={Clock}
              label="Nhàn rỗi"
              value={counts.idle}
              tone="amber"
              onClick={() => setFilter("idle")}
              active={filter === "idle"}
            />
            <SummaryCard
              icon={WifiOff}
              label="Treo máy"
              value={counts.away}
              tone="rose"
              onClick={() => setFilter("away")}
              active={filter === "away"}
            />
          </div>

          {/* List */}
          {students.length === 0 ? (
            <div className="py-20 text-center">
              <Users className="mx-auto mb-3 h-12 w-12 opacity-50" />
              <p className="text-sm text-muted-foreground">Chưa có học sinh nào online.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((s) => (
                <StudentCard key={s.userId} s={s} now={now} onViewCode={setViewingUserId} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Live Code Viewer Dialog */}
      <Dialog
        open={viewingUserId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setViewingUserId(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
              <Code2 className="h-4 w-4 text-primary" />
              {viewingStudent ? (
                <>
                  <span>Code trực tiếp —</span>
                  <StudentName
                    fullName={viewingStudent.fullName}
                    nickname={viewingStudent.nickname}
                    primaryClassName="text-base font-bold"
                  />
                </>
              ) : (
                <span>Code trực tiếp</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {!viewingStudent ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Học sinh này vừa ngoại tuyến.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 font-medium",
                      (STATUS_META[viewingStudent.status] || STATUS_META.online).text,
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        (STATUS_META[viewingStudent.status] || STATUS_META.online).dot,
                      )}
                    />
                    {(STATUS_META[viewingStudent.status] || STATUS_META.online).label}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-medium text-foreground">
                    {viewingStudent.codeLabel || viewingStudent.activityLabel}
                  </span>
                  {viewingStudent.codeLanguage && (
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {viewingStudent.codeLanguage}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {viewingStudent.codeUpdatedAt && (
                    <span className="text-[11px] text-muted-foreground">
                      cập nhật {timeAgo(viewingStudent.codeUpdatedAt, now)}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={!viewingStudent.code}
                    onClick={handleCopyCode}
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Đã chép" : "Chép code"}
                  </Button>
                </div>
              </div>

              <pre className="max-h-[60vh] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100">
                {viewingStudent.code || "(Học sinh chưa viết code trên trình soạn thảo)"}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
  onClick,
  active,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone: "indigo" | "emerald" | "amber" | "rose";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneMap = {
    indigo: "bg-primary/10 dark:bg-blue-950/40",
    emerald: "bg-emerald-500/10 dark:bg-emerald-950/40",
    amber: "bg-amber-500/10 dark:bg-amber-950/40",
    rose: "bg-rose-500/10 dark:bg-rose-950/40",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition",
        active ? "border-primary/40 bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/40",
      )}
    >
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", toneMap[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-semibold leading-none tabular-nums text-foreground">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </button>
  );
}

function StudentCard({
  s,
  now,
  onViewCode,
}: {
  s: PresenceStudent;
  now: number;
  onViewCode: (userId: string) => void;
}) {
  const meta = STATUS_META[s.status] || STATUS_META.online;
  const Icon = ACTIVITY_ICON[s.activityType] || Activity;
  const hasCode = Boolean(s.code && s.code.trim().length > 0);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <StudentAvatar
            studentId={s.userId}
            fullName={s.fullName}
            nickname={s.nickname}
            avatarUrl={s.avatarUrl}
            size="lg"
            clickable={false}
          />
          <span
            className={cn("absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white", meta.dot)}
            title={meta.label}
          />
        </div>
        <div className="min-w-0 flex-1">
          <StudentName
            fullName={s.fullName}
            nickname={s.nickname}
            primaryClassName="text-sm font-bold dark:text-foreground"
          />
          <p className={cn("text-[11px] font-medium", meta.text)}>{meta.label}</p>
        </div>
        {hasCode && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onViewCode(s.userId)}
            className="shrink-0"
            title="Xem code học sinh đang viết trực tiếp"
          >
            <Eye className="h-3.5 w-3.5" />
            Xem code
          </Button>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/40 p-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{s.activityLabel}</p>
          <p className="text-[10px] text-muted-foreground">cập nhật {timeAgo(s.lastActiveAt, now)}</p>
        </div>
      </div>

      {hasCode && (
        <button
          type="button"
          onClick={() => onViewCode(s.userId)}
          className="mt-2 block w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-left transition hover:border-primary/60"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-2.5 py-1 text-[10px] text-slate-300">
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
              <span className="truncate">{s.codeLabel || "Đang viết code"}</span>
            </span>
            {s.codeLanguage && (
              <span className="shrink-0 font-mono uppercase text-slate-400">{s.codeLanguage}</span>
            )}
          </div>
          <pre className="max-h-16 overflow-hidden px-2.5 py-1.5 font-mono text-[10px] leading-snug text-slate-200">
            {s.code}
          </pre>
        </button>
      )}
    </div>
  );
}
