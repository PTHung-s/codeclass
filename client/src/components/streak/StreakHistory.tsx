import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import { useToast } from "../../hooks/useToast";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { SkeletonCard } from "../ui/skeletons/SkeletonCard";
import {
  Flame,
  Shield,
  LifeBuoy,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";

/** ─────────────── Types (khớp GET /api/streak/history) ─────────────── */
export type StreakDayStatus = "study" | "bridged" | "rescued" | "light" | "missed";

export interface StreakDay {
  date: string; // VN "YYYY-MM-DD"
  status: StreakDayStatus;
  xp: number;
  lost: boolean;
}

export interface StreakHistoryData {
  user?: { id: string; fullName: string; avatarUrl?: string | null };
  days: StreakDay[];
  currentStreak: number;
  longestStreak: number;
  freezes: number;
  bridgesUsed: number;
  rescuedCount: number;
  breakDates: string[];
  lastStudyDate: string | null;
}

export const STREAK_STATUS_META: Record<
  StreakDayStatus,
  { label: string; cell: string; dot: string }
> = {
  study: {
    label: "Có học",
    cell: "bg-orange-500 text-white dark:bg-orange-500",
    dot: "bg-orange-500",
  },
  bridged: {
    label: "Khiên bảo vệ",
    cell: "bg-sky-500/80 text-white dark:bg-sky-500/80",
    dot: "bg-sky-500",
  },
  rescued: {
    label: "Admin cứu (lỗi hệ thống)",
    cell: "bg-emerald-500/90 text-white dark:bg-emerald-500/90",
    dot: "bg-emerald-500",
  },
  light: {
    label: "Vào học nhẹ (miễn khiên)",
    cell: "bg-amber-400 text-amber-950 dark:bg-amber-400",
    dot: "bg-amber-400",
  },
  missed: {
    label: "Nghỉ",
    cell: "bg-muted text-muted-foreground/50 dark:bg-muted",
    dot: "bg-muted-foreground/30",
  },
};

/** VN "YYYY-MM-DD" → hiển thị vi-VN */
export function formatDayKey(key: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(`${key}T00:00:00+07:00`).toLocaleDateString("vi-VN", opts ?? { day: "2-digit", month: "2-digit" });
}

/** Nhóm các ngày thành tuần (Thứ 2 → CN) cho lưới kiểu GitHub. */
function groupByWeek(days: StreakDay[]): (StreakDay | null)[][] {
  if (days.length === 0) return [];
  const first = new Date(`${days[0].date}T00:00:00+07:00`);
  // getDay(): 0=CN. Đẩy về thứ 2 làm đầu tuần.
  const firstDow = (first.getDay() + 6) % 7;
  const weeks: (StreakDay | null)[][] = [];
  let week: (StreakDay | null)[] = Array.from({ length: firstDow }, () => null);
  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

const DOW_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function statusTooltip(day: StreakDay): string {
  const date = formatDayKey(day.date, { day: "2-digit", month: "2-digit", year: "numeric" });
  const meta = STREAK_STATUS_META[day.status];
  const parts = [`${date} — ${meta.label}`];
  if (day.status === "study" && day.xp > 0) parts.push(`+${day.xp} XP`);
  if (day.lost) parts.push("Ngày mất chuỗi");
  return parts.join(" · ");
}

/** ─────────────── Lưới lịch sử (dùng chung học sinh & giáo viên) ─────────────── */
export function StreakCalendar({
  days,
  compact = false,
  onSelectDay,
}: {
  days: StreakDay[];
  compact?: boolean;
  /** Khi có: bấm vào ô ngày sẽ mở chi tiết (dùng bởi panel quản lý của GV). */
  onSelectDay?: (day: StreakDay) => void;
}) {
  const weeks = useMemo(() => groupByWeek(days), [days]);
  const cell = compact ? "h-3.5 w-3.5 rounded-[4px]" : "h-5 w-5 rounded-md";
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-1">
        <div className="mr-1 flex flex-col justify-between py-0.5 text-[9px] leading-none text-muted-foreground/70">
          {DOW_LABELS.map((d) => (
            <span key={d} className={compact ? "h-3.5" : "h-5"}>{d}</span>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day, di) =>
              day ? (
                <button
                  key={day.date}
                  type="button"
                  title={statusTooltip(day)}
                  onClick={onSelectDay ? () => onSelectDay(day) : undefined}
                  className={cn(
                    cell,
                    "transition-transform hover:scale-125",
                    onSelectDay && "cursor-pointer",
                    STREAK_STATUS_META[day.status].cell,
                    day.lost && "ring-2 ring-red-500 ring-offset-1 ring-offset-card",
                  )}
                />
              ) : (
                <div key={`${wi}-${di}`} className={cn(cell, "opacity-0")} />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** ─────────────── Panel đầy đủ: stats + calendar (self view) ─────────────── */
export function StreakHistoryPanel({
  userId,
  days = 70,
}: {
  userId?: string; // undefined = của chính mình
  days?: number;
}) {
  const { data, isLoading } = useQuery<StreakHistoryData>({
    queryKey: ["streak-history", userId ?? "me", days],
    queryFn: () =>
      api
        .get("/streak/history", { params: { ...(userId ? { userId } : {}), days } })
        .then((r) => r.data),
    staleTime: 60 * 1000,
  });

  if (isLoading) return <SkeletonCard />;
  if (!data) return null;

  return (
    <StreakHistoryInner data={data} days={days} userId={userId} manage={false} />
  );
}

/** ─────────────── Panel đầy đủ + công cụ cứu ngày (staff) ─────────────── */
export function StreakHistoryManagePanel({
  userId,
  days = 84,
}: {
  userId: string;
  days?: number;
}) {
  return <StreakHistoryInner data={null} userId={userId} days={days} manage />;
}

/** ─────────────── Core render ─────────────── */
function StreakHistoryInner({
  data: initial,
  userId,
  days,
  manage,
}: {
  data: StreakHistoryData | null;
  userId?: string;
  days: number;
  manage: boolean;
}) {
  const { user: me } = useAuthContext();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = manage && isStaff(me?.role);

  const q = useQuery<StreakHistoryData>({
    queryKey: ["streak-history", userId ?? "me", days],
    queryFn: () =>
      api
        .get("/streak/history", { params: { ...(userId ? { userId } : {}), days } })
        .then((r) => r.data),
    staleTime: 30 * 1000,
    enabled: manage, // self view đã có data từ ngoài
  });
  const data = manage ? q.data : initial;
  const isLoading = manage ? q.isLoading : false;

  const rescue = useMutation({
    mutationFn: (date: string) => api.post("/streak/rescue", { userId, date }).then((r) => r.data),
    onSuccess: () => {
      toast.success({ title: "Đã cứu ngày nghỉ", message: "Ngày này sẽ không làm gãy chuỗi và không tốn khiên." });
      qc.invalidateQueries({ queryKey: ["streak-history"] });
    },
    onError: (err: any) =>
      toast.error({ title: "Không thể cứu ngày", message: err.response?.data?.error || "Vui lòng thử lại." }),
  });

  const undoRescue = useMutation({
    mutationFn: (date: string) =>
      api.delete("/streak/rescue", { params: { userId, date } }).then((r) => r.data),
    onSuccess: () => {
      toast.success({ title: "Đã hoàn tác ngày cứu" });
      qc.invalidateQueries({ queryKey: ["streak-history"] });
    },
    onError: (err: any) =>
      toast.error({ title: "Không thể hoàn tác", message: err.response?.data?.error || "Vui lòng thử lại." }),
  });

  const [selected, setSelected] = useState<StreakDay | null>(null);

  if (manage && isLoading) return <SkeletonCard />;
  if (!data) return null;

  const stats = [
    { icon: Flame, label: "Chuỗi hiện tại", value: `${data.currentStreak} ngày`, tone: "text-orange-500" },
    { icon: Flame, label: "Chuỗi dài nhất", value: `${data.longestStreak} ngày`, tone: "text-amber-500" },
    { icon: Shield, label: "Khiên còn lại", value: `${data.freezes}`, tone: "text-sky-500" },
    { icon: LifeBuoy, label: "Ngày được cứu", value: `${data.rescuedCount}`, tone: "text-emerald-500" },
  ];

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Lịch sử chuỗi học</h3>
          {data.user && <p className="text-xs text-muted-foreground">{data.user.fullName}</p>}
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <s.icon className={cn("h-4 w-4 shrink-0", s.tone)} />
              <div className="leading-tight">
                <p className="text-sm font-semibold tabular-nums text-foreground">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <StreakCalendar days={data.days} onSelectDay={setSelected} />
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground">
        {(Object.keys(STREAK_STATUS_META) as StreakDayStatus[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-sm", STREAK_STATUS_META[k].dot)} />
            {STREAK_STATUS_META[k].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm ring-2 ring-red-500" />
          Ngày mất chuỗi
        </span>
        {data.lastStudyDate && (
          <span className="ml-auto">Học gần nhất: {formatDayKey(data.lastStudyDate, { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
        )}
      </div>

      {/* Day detail / rescue tool */}
      {selected && (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm">
              <p className="font-semibold text-foreground">
                {formatDayKey(selected.date, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
              </p>
              <p className="text-xs text-muted-foreground">
                {STREAK_STATUS_META[selected.status].label}
                {selected.status === "study" && selected.xp > 0 ? ` · +${selected.xp} XP` : ""}
                {selected.lost ? " · ngày làm gãy chuỗi" : ""}
              </p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setSelected(null)} aria-label="Đóng">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {canManage && (selected.status === "missed" || selected.status === "bridged") && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={rescue.isPending}
                onClick={() => rescue.mutate(selected.date)}
              >
                <LifeBuoy className="mr-1.5 h-3.5 w-3.5" /> Cứu ngày này (lỗi hệ thống)
              </Button>
            </div>
          )}
          {canManage && selected.status === "rescued" && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={undoRescue.isPending}
                onClick={() => undoRescue.mutate(selected.date)}
              >
                <X className="mr-1.5 h-3.5 w-3.5" /> Hoàn tác cứu ngày này
              </Button>
            </div>
          )}
        </div>
      )}
      {canManage && !selected && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Bấm vào một ô ngày để xem chi tiết — với ngày nghỉ/khiên che, GV sẽ thấy nút "Cứu ngày này".
        </p>
      )}
    </Card>
  );
}

/** ─────────────── Ô lịch nhỏ đang phát triển (dashboard) ─────────────── */
export function StreakMiniStrip({ days, max = 28 }: { days: StreakDay[]; max?: number }) {
  const tail = days.slice(-max);
  return (
    <div className="flex items-end gap-[3px]">
      {tail.map((day) => (
        <div
          key={day.date}
          title={statusTooltip(day)}
          className={cn("h-4 w-1.5 rounded-sm", STREAK_STATUS_META[day.status].dot)}
        />
      ))}
    </div>
  );
}

/** Icon paginator nhỏ nếu cần duyệt window ngày */
export function DayRangeNav({
  days,
  onChange,
}: {
  days: number;
  onChange: (d: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Button variant="ghost" size="icon-sm" onClick={() => onChange(Math.max(14, days - 28))} aria-label="Ít ngày hơn">
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <span>{days} ngày</span>
      <Button variant="ghost" size="icon-sm" onClick={() => onChange(Math.min(366, days + 28))} aria-label="Nhiều ngày hơn">
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
