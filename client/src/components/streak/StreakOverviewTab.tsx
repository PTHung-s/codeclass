import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../lib/api";
import { Flame, Shield, LifeBuoy, CalendarX2, Search, History } from "lucide-react";
import StudentAvatar from "../ui/StudentAvatar";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { StreakHistoryManagePanel, formatDayKey, type StreakHistoryData } from "./StreakHistory";
import { cn } from "../../lib/utils";

interface StreakStudentRow {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  currentStreak: number;
  longestStreak: number;
  freezes: number;
  lastStudyDate: string | null;
  lastBreakDate: string | null;
  rescuedCount: number;
}

type SortKey = "streak" | "break" | "name";

/** Tab "Chuỗi học" trong Giám sát học sinh — tổng quan chuỗi của TOÀN BỘ học sinh. */
export default function StreakOverviewTab() {
  const [sort, setSort] = useState<SortKey>("streak");
  const [search, setSearch] = useState("");
  const [detailFor, setDetailFor] = useState<StreakStudentRow | null>(null);

  const q = useQuery<{ students: StreakStudentRow[] }>({
    queryKey: ["streak-overview"],
    queryFn: () => api.get("/streak/overview").then((r) => r.data),
    staleTime: 60 * 1000,
  });

  const students = useMemo(() => {
    const rows = q.data?.students ?? [];
    const filtered = search.trim()
      ? rows.filter((r) => r.fullName.toLowerCase().includes(search.trim().toLowerCase()))
      : rows;
    const sorted = [...filtered];
    if (sort === "streak") sorted.sort((a, b) => b.currentStreak - a.currentStreak || a.fullName.localeCompare(b.fullName));
    else if (sort === "break") {
      // Gãy gần nhất lên đầu; chưa từng gãy xuống cuối.
      sorted.sort((a, b) => {
        if (!a.lastBreakDate && !b.lastBreakDate) return a.fullName.localeCompare(b.fullName);
        if (!a.lastBreakDate) return 1;
        if (!b.lastBreakDate) return -1;
        return b.lastBreakDate.localeCompare(a.lastBreakDate);
      });
    } else sorted.sort((a, b) => a.fullName.localeCompare(b.fullName));
    return sorted;
  }, [q.data, sort, search]);

  const summary = useMemo(() => {
    const rows = q.data?.students ?? [];
    return {
      alive: rows.filter((r) => r.currentStreak > 0).length,
      dead: rows.filter((r) => r.currentStreak === 0).length,
      freezes: rows.reduce((s, r) => s + r.freezes, 0),
      rescued: rows.reduce((s, r) => s + r.rescuedCount, 0),
    };
  }, [q.data]);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Flame className="h-3.5 w-3.5 text-orange-500" /> Chuỗi đang sống</div>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{summary.alive}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarX2 className="h-3.5 w-3.5 text-rose-500" /> Chuỗi đã gãy</div>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{summary.dead}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Shield className="h-3.5 w-3.5 text-sky-500" /> Khiên còn lại (cả lớp)</div>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{summary.freezes}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><LifeBuoy className="h-3.5 w-3.5 text-emerald-500" /> Ngày đã cứu</div>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{summary.rescued}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm học sinh…"
            className="h-8 w-48 pl-8 text-xs"
          />
        </div>
        {([
          { key: "streak", label: "Chuỗi dài nhất" },
          { key: "break", label: "Gãy gần nhất" },
          { key: "name", label: "Tên A→Z" },
        ] as const).map((s) => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              sort === s.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {q.isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Đang tải dữ liệu chuỗi…</div>
      ) : students.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Không có học sinh nào khớp.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Học sinh</th>
                <th className="px-3 py-2.5 text-center font-medium">Chuỗi</th>
                <th className="px-3 py-2.5 text-center font-medium">Dài nhất</th>
                <th className="px-3 py-2.5 text-center font-medium">Khiên</th>
                <th className="px-3 py-2.5 font-medium">Học gần nhất</th>
                <th className="px-3 py-2.5 font-medium">Mất chuỗi ngày</th>
                <th className="px-3 py-2.5 text-center font-medium" title="Ngày được admin cứu">Đã cứu</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.userId} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <StudentAvatar
                        studentId={s.userId}
                        fullName={s.fullName}
                        avatarUrl={s.avatarUrl}
                        size="sm"
                        showName={false}
                        clickable={false}
                      />
                      <span className="font-medium text-foreground">{s.fullName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                      s.currentStreak > 0
                        ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                        : "bg-muted text-muted-foreground",
                    )}>
                      <Flame className="h-3 w-3" /> {s.currentStreak}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{s.longestStreak}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex items-center gap-1 tabular-nums text-sky-600 dark:text-sky-400">
                      <Shield className="h-3 w-3" /> {s.freezes}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                    {s.lastStudyDate ? formatDayKey(s.lastStudyDate, { day: "2-digit", month: "2-digit" }) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                    {s.lastBreakDate ? (
                      <span className="font-medium text-rose-600 dark:text-rose-400">
                        {formatDayKey(s.lastBreakDate, { day: "2-digit", month: "2-digit" })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {s.rescuedCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        <LifeBuoy className="h-3 w-3" /> {s.rescuedCount}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => setDetailFor(s)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      <History className="h-3.5 w-3.5" /> Lịch sử
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Drill-down dialog */}
      <Dialog open={!!detailFor} onOpenChange={(open) => !open && setDetailFor(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lịch sử chuỗi — {detailFor?.fullName}</DialogTitle>
          </DialogHeader>
          {detailFor && (
            <StreakHistoryManagePanel userId={detailFor.userId} days={84} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type { StreakHistoryData };
