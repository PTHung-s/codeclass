import { useCallback, useEffect, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import {
  Coins, Loader2, Check, Clock, Plus, Pencil, Trash2, Play, CalendarClock, Target, Gift, Calendar,
} from "lucide-react";

interface Quest {
  id: string;
  title: string;
  description: string | null;
  type: string;
  metric: string;
  target: number;
  tokenReward: number;
  icon: string | null;
  current: number;
  completed: boolean;
  claimed: boolean;
  eventId: string | null;
}

interface GameEvent {
  id: string;
  name: string;
  subtitle: string | null;
  icon: string;
  theme: string;
  startsAt: string;
  endsAt: string | null;
  quests: Quest[];
}

interface QuestData {
  daily: Quest[];
  weekly: Quest[];
  achievement: Quest[];
  events: GameEvent[];
  dailyResetAt: string | null;
  weeklyResetAt: string | null;
}

const THEMES: Record<string, { surface: string; chip: string }> = {
  indigo: { surface: "border-border bg-card", chip: "bg-primary/10 text-primary" },
  emerald: { surface: "border-border bg-card", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  rose: { surface: "border-border bg-card", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  amber: { surface: "border-border bg-card", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  sky: { surface: "border-border bg-card", chip: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  purple: { surface: "border-border bg-card", chip: "bg-primary/10 text-primary" },
};

function fmtCountdown(iso: string | null): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Sắp reset";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)} ngày`;
  return `${h}h ${m}m`;
}

function eventStatus(ev: GameEvent): { label: string; cls: string; live: boolean } {
  const now = Date.now();
  const start = new Date(ev.startsAt).getTime();
  const end = ev.endsAt ? new Date(ev.endsAt).getTime() : Infinity;
  if (now < start) return { label: "Sắp diễn ra", cls: "bg-muted text-muted-foreground", live: false };
  if (now > end) return { label: "Đã kết thúc", cls: "bg-muted text-muted-foreground", live: false };
  return { label: "Đang diễn ra", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40", live: true };
}

export function EventScreen() {
  const toast = useToast();
  const { user } = useAuthContext();
  const isAdmin = isStaff(user?.role);

  const [data, setData] = useState<QuestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  // Selected event tab
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Admin modals
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<GameEvent | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskEvent, setTaskEvent] = useState<GameEvent | null>(null);
  const [editingTask, setEditingTask] = useState<Quest | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/quests");
      setData(res.data);
    } catch {
      toast.error({ title: "Không tải được nhiệm vụ" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Auto-select first live event (fallback: first event) when data loads
  useEffect(() => {
    const events = data?.events ?? [];
    if (!events.length) return;
    setSelectedId((cur) =>
      cur && events.some((e) => e.id === cur)
        ? cur
        : (events.find((e) => eventStatus(e).live)?.id ?? events[0].id)
    );
  }, [data]);

  const handleClaim = async (questId: string) => {
    setClaiming(questId);
    try {
      const res = await api.post(`/quests/${questId}/claim`);
      toast.success({ title: `+${res.data.tokenReward} tokens! 🎉` });
      load();
    } catch (err: any) {
      toast.error({ title: err.response?.data?.error || "Không thể nhận thưởng" });
    } finally {
      setClaiming(null);
    }
  };

  const totalClaimable = (data?.events ?? []).flatMap((e) => e.quests).filter((q) => q.completed && !q.claimed).length;
  const totalReward = (data?.events ?? []).flatMap((e) => e.quests).filter((q) => q.completed && !q.claimed).reduce((s, q) => s + q.tokenReward, 0);
  const activeEvents = (data?.events ?? []).filter((e) => eventStatus(e).live).length;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
      </div>
    );
  }

  const events = data?.events ?? [];
  const selectedEvent = events.find((e) => e.id === selectedId) ?? events[0] ?? null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Sự kiện & Nhiệm vụ</h2>
              <p className="text-xs text-muted-foreground">Hoàn thành nhiệm vụ trong sự kiện để nhận token đổi thưởng.</p>
            </div>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => { setEditingEvent(null); setShowEventModal(true); }} className="gap-1.5">
              <Plus className="h-4 w-4" /> Tạo sự kiện
            </Button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-primary ring-1 ring-inset ring-primary/15">
            <Calendar className="h-3.5 w-3.5" /> {activeEvents} sự kiện đang diễn ra
          </span>
          {totalClaimable > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400">
              <Gift className="h-3.5 w-3.5" /> {totalClaimable} nhiệm vụ sẵn sàng nhận
              <span className="inline-flex items-center gap-0.5"><Coins className="h-3.5 w-3.5" /> +{totalReward}</span>
            </span>
          )}
        </div>
      </div>

      {/* Event tabs (left) + tasks (right) */}
      {events.length > 0 && selectedEvent ? (
        <div className="flex flex-col gap-4 md:flex-row">
          {/* Left: event tab list */}
          <div className="flex shrink-0 gap-2 overflow-x-auto pb-1.5 md:w-60 md:flex-col md:overflow-visible md:pb-0">
            {events.map((ev) => {
              const selected = ev.id === selectedEvent.id;
              const theme = THEMES[ev.theme] || THEMES.indigo;
              const status = eventStatus(ev);
              const claimableHere = ev.quests.filter((q) => q.completed && !q.claimed).length;
              return (
                <button
                  key={ev.id}
                  onClick={() => setSelectedId(ev.id)}
                  className={cn(
                    "group relative flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                    selected
                      ? "border-transparent bg-card shadow-md ring-1 ring-primary/30"
                      : "border-border/60 bg-card/60 hover:border-border hover:bg-muted/40"
                  )}
                >
                  {selected && (
                    <span className={cn("absolute -left-px bottom-2 top-2 w-1 rounded-full", status.live ? "bg-emerald-500" : "bg-primary")} />
                  )}
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg shadow-sm", theme.chip)}>
                    {ev.icon ? <span className="text-base">{ev.icon}</span> : <Target className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] font-bold text-foreground">{ev.name}</b>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", status.live ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                      {status.live ? "Đang diễn ra" : "Đã kết thúc"}
                      {claimableHere > 0 && (
                        <span className="rounded-full bg-amber-500 px-1.5 py-px text-[9px] font-bold text-white">{claimableHere}</span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: selected event's tasks */}
          <div className="min-w-0 flex-1">
            {(() => {
              const ev = selectedEvent;
              const theme = THEMES[ev.theme] || THEMES.indigo;
              const status = eventStatus(ev);
              const doneHere = ev.quests.filter((q) => q.completed && !q.claimed).length;
              const completedCount = ev.quests.filter((q) => q.completed).length;
              const overall = ev.quests.length ? Math.round((completedCount / ev.quests.length) * 100) : 0;
              const totalRewardHere = ev.quests.filter((q) => q.completed && !q.claimed).reduce((s, q) => s + q.tokenReward, 0);
              return (
                <section className={cn("overflow-hidden rounded-2xl border bg-card", theme.surface)}>
                  {/* Event banner */}
                  <div className={cn("flex items-center gap-3 border-b border-border p-4", theme.surface)}>
                    <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-sm", theme.chip)}>
                      {ev.icon ? <span className="text-base">{ev.icon}</span> : <Target className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-foreground">{ev.name}</h3>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", status.cls)}>{status.label}</span>
                        {doneHere > 0 && (
                          <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">{doneHere} sẵn sàng</span>
                        )}
                      </div>
                      {ev.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{ev.subtitle}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                        {ev.endsAt ? (
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Còn {fmtCountdown(ev.endsAt)}</span>
                        ) : (
                          <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Không giới hạn thời gian</span>
                        )}
                        <span>{ev.quests.length} nhiệm vụ</span>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex shrink-0 gap-1.5">
                        <button onClick={() => { setTaskEvent(ev); setEditingTask(null); setShowTaskModal(true); }} className="grid h-8 w-8 place-items-center rounded-lg bg-card/10 hover:bg-card/20 text-foreground transition" title="Thêm nhiệm vụ">
                          <Plus className="h-4 w-4" />
                        </button>
                        <button onClick={() => { setEditingEvent(ev); setShowEventModal(true); }} className="grid h-8 w-8 place-items-center rounded-lg bg-card/10 hover:bg-card/20 text-foreground transition" title="Sửa sự kiện">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Overall progress */}
                  {ev.quests.length > 0 && (
                    <div className="flex items-center gap-3 border-b border-border bg-black/10 px-4 py-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card/15">
                        <div className={cn("h-full rounded-full transition-all duration-500", theme.chip)} style={{ width: `${overall}%` }} />
                      </div>
                      <span className="text-[11px] font-bold tabular-nums text-foreground">{overall}%</span>
                      {totalRewardHere > 0 && (
                        <span className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                          <Coins className="h-3 w-3" /> Có thể nhận {totalRewardHere}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Quest cards */}
                  <div className="space-y-2.5 p-3">
                    {ev.quests.map((q) => (
                      <QuestCard key={q.id} quest={q} onClaim={handleClaim} claiming={claiming} />
                    ))}
                    {ev.quests.length === 0 && (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        Chưa có nhiệm vụ nào trong sự kiện này.{isAdmin ? " Bấm + ở góc phải để thêm nhiệm vụ." : ""}
                      </p>
                    )}
                  </div>
                </section>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 py-14 text-center">
          <div className="mb-2 flex justify-center text-muted-foreground"><Target className="h-8 w-8" /></div>
          <p className="text-sm text-muted-foreground">Chưa có sự kiện nào. Quay lại sau nhé!</p>
        </div>
      )}

      {/* Event create/edit modal */}
      {showEventModal && <EventModal editing={editingEvent} onClose={() => setShowEventModal(false)} onSaved={load} />}
      {/* Task create/edit modal */}
      {showTaskModal && taskEvent && <TaskModal event={taskEvent} editing={editingTask} onClose={() => setShowTaskModal(false)} onSaved={load} />}
    </div>
  );
}

function QuestCard({ quest, onClaim, claiming }: { quest: Quest; onClaim: (id: string) => void; claiming: string | null }) {
  const pct = Math.min(100, Math.round((quest.current / quest.target) * 100));
  const canClaim = quest.completed && !quest.claimed;
  return (
    <div className={cn(
      "rounded-xl border p-3.5 transition-all bg-card",
      quest.claimed ? "border-border/40 bg-muted/30 opacity-60"
        : quest.completed ? "border-emerald-400/40 bg-emerald-50/40 dark:bg-emerald-950/20"
        : "border-border hover:border-primary/40 dark:hover:border-primary/40"
    )}>
      <div className="flex items-start gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl", quest.completed ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-muted")}>
          {quest.claimed ? <Check className="h-5 w-5 text-emerald-500" /> : (quest.icon ? <span className="text-base">{quest.icon}</span> : <Target className="h-4 w-4 text-muted-foreground" />)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-blue-500">{quest.type}</div>
              <h4 className="truncate text-sm font-bold text-foreground">{quest.title}</h4>
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <Coins className="h-3 w-3" />+{quest.tokenReward}
            </span>
          </div>
          {quest.description && <p className="mt-1 text-xs leading-snug text-muted-foreground">{quest.description}</p>}
          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full transition-all duration-500", quest.completed ? "bg-emerald-500" : "bg-blue-500")} style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{quest.current}/{quest.target}</span>
          </div>
          <div className="mt-2 flex justify-end">
            {quest.claimed ? (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Đã nhận</span>
            ) : quest.completed ? (
              <Button size="sm" onClick={() => onClaim(quest.id)} disabled={claiming === quest.id} className="gap-1.5 rounded-lg bg-amber-500 text-white shadow-sm hover:bg-amber-400">
                {claiming === quest.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Coins className="h-3.5 w-3.5" />} Nhận {quest.tokenReward}
              </Button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Play className="h-3 w-3" /> Đang làm...</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Admin modals ──

const THEME_LIST = ["indigo", "emerald", "rose", "amber", "sky", "purple"];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground dark:text-slate-300 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-xl bg-muted/50 dark:bg-black/40 border border-border dark:border-white/10 focus:outline-none focus:border-blue-500 text-sm text-foreground";

function EventModal({ editing, onClose, onSaved }: { editing: GameEvent | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(editing?.name || "");
  const [subtitle, setSubtitle] = useState(editing?.subtitle || "");
  const [icon, setIcon] = useState(editing?.icon || "");
  const [theme, setTheme] = useState(editing?.theme || "indigo");
  const [startsAt, setStartsAt] = useState(editing ? new Date(editing.startsAt).toISOString().slice(0, 16) : "");
  const [endsAt, setEndsAt] = useState(editing?.endsAt ? new Date(editing.endsAt).toISOString().slice(0, 16) : "");
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error({ title: "Nhập tên sự kiện" }); return; }
    setSubmitting(true);
    try {
      const payload: any = { name: name.trim(), subtitle: subtitle.trim() || null, icon, theme, startsAt: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(), endsAt: endsAt ? new Date(endsAt).toISOString() : null };
      if (editing) await api.put(`/quests/events/${editing.id}`, payload);
      else await api.post("/quests/events", payload);
      toast.success({ title: editing ? "Đã cập nhật sự kiện!" : "Đã tạo sự kiện!" });
      onClose(); onSaved();
    } catch (err: any) {
      toast.error({ title: err.response?.data?.error || "Lỗi lưu sự kiện" });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-[20px] bg-card dark:bg-slate-900 border border-border dark:border-white/10 p-5 shadow-2xl text-foreground dark:text-slate-100" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-4">{editing ? "Sửa sự kiện" : "Tạo sự kiện mới"}</h3>
        <form onSubmit={handleSave} className="space-y-3.5">
          <Field label="Tên sự kiện *"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="VD: Sự kiện Mùa Xuân" /></Field>
          <Field label="Mô tả ngắn"><input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={inputCls} placeholder="VD: Thử thách đặc biệt của tháng" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Icon"><input value={icon} onChange={(e) => setIcon(e.target.value)} className={inputCls} /></Field>
            <Field label="Màu chủ đạo">
              <div className="flex gap-1.5 pt-1">
                {THEME_LIST.map((t) => (
                  <button type="button" key={t} onClick={() => setTheme(t)} className={cn("h-7 w-7 rounded-full border-2 transition", theme === t ? "border-white ring-2 ring-blue-400" : "border-transparent")} style={{ background: { indigo: "#0066cc", emerald: "#10b981", rose: "#f43f5e", amber: "#f59e0b", sky: "#0ea5e9", purple: "#14b8a6" }[t] }} />
                ))}
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bắt đầu"><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} /></Field>
            <Field label="Kết thúc (để trống = mãi)"><input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputCls} /></Field>
          </div>
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-card/5 text-foreground dark:text-slate-300 font-semibold">Hủy</button>
            <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold shadow transition">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lưu"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const METRICS = [
  ["problems_solved", "Giải bài tập"], ["lessons_completed", "Hoàn thành bài học"],
  ["assignments_submitted", "Nộp bài tập"], ["quizzes_passed", "Đỗ quiz"],
  ["study_minutes", "Phút học tập trung"], ["first_pass_solved", "Đỗ bài ngay lần đầu"],
  ["daily_claim", "Nhận thưởng hàng ngày"], ["current_streak", "Chuỗi ngày hiện tại"],
  ["current_level", "Cấp độ hiện tại"], ["total_problems", "Tổng bài đã giải"],
];

function TaskModal({ event, editing, onClose, onSaved }: { event: GameEvent; editing: Quest | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(editing?.title || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [metric, setMetric] = useState(editing?.metric || "problems_solved");
  const [target, setTarget] = useState(editing?.target || 1);
  const [tokenReward, setTokenReward] = useState(editing?.tokenReward || 10);
  const [icon, setIcon] = useState(editing?.icon || "");
  const [type, setType] = useState(editing?.type || "achievement");
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !metric) { toast.error({ title: "Điền tên và loại nhiệm vụ" }); return; }
    setSubmitting(true);
    try {
      const payload = { title: title.trim(), description: description.trim() || null, type, metric, target: Number(target) || 1, tokenReward: Number(tokenReward) || 0, icon, eventId: event.id };
      if (editing) await api.put(`/quests/${editing.id}`, payload);
      else await api.post("/quests", payload);
      toast.success({ title: editing ? "Đã cập nhật nhiệm vụ!" : "Đã thêm nhiệm vụ!" });
      onClose(); onSaved();
    } catch (err: any) {
      toast.error({ title: err.response?.data?.error || "Lỗi lưu nhiệm vụ" });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-[20px] bg-card dark:bg-slate-900 border border-border dark:border-white/10 p-5 shadow-2xl text-foreground dark:text-slate-100" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-1">{editing ? "Sửa nhiệm vụ" : "Thêm nhiệm vụ"}</h3>
        <p className="text-xs text-muted-foreground mb-4">Trong sự kiện: <b>{event.name}</b></p>
        <form onSubmit={handleSave} className="space-y-3.5">
          <Field label="Tên nhiệm vụ *"><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="VD: Chinh phục 5 bài khó" /></Field>
          <Field label="Yêu cầu (hướng dẫn cho học sinh)"><input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="VD: Yêu cầu: Đỗ 5 bài tập ngay lần chạy đầu" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Loại chỉ tiêu">
              <select value={metric} onChange={(e) => setMetric(e.target.value)} className={inputCls}>
                {METRICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Chỉ tiêu"><input type="number" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phần thưởng (token)"><input type="number" min={0} value={tokenReward} onChange={(e) => setTokenReward(Number(e.target.value))} className={inputCls} /></Field>
            <Field label="Icon"><input value={icon} onChange={(e) => setIcon(e.target.value)} className={inputCls} /></Field>
          </div>
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-card/5 text-foreground dark:text-slate-300 font-semibold">Hủy</button>
            <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold shadow transition">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lưu"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}