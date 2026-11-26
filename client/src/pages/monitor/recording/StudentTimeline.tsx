import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock, Pause, Play } from "lucide-react";
import api from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { Card, CardContent } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  EVENT_META,
  formatClock,
  formatClockSeconds,
  formatDuration,
  type RecEvent,
  type RecEventType,
} from "./recordingUtils";
import { StudentName } from "../../../components/ui/StudentName";

type FilterType = "all" | "code_snapshot" | "run" | "tab_out" | "paste";

const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "code_snapshot", label: "Viết code" },
  { key: "run", label: "Chạy code" },
  { key: "tab_out", label: "Rời tab" },
  { key: "paste", label: "Dán code" },
];

const SPEEDS = [1, 2, 4] as const;

/**
 * Interactive timeline for one student's recorded session.
 *
 * Supports live auto-refresh, Play/Pause playback with 1x/2x/4x speed,
 * event-type filtering, and scrubbing to inspect code at any exact moment.
 */
export default function StudentTimeline({
  recordingId,
  userId,
  isLive = false,
}: {
  recordingId: string;
  userId: string;
  isLive?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [eventFilter, setEventFilter] = useState<FilterType>("all");
  const sliderRef = useRef<HTMLInputElement>(null);
  const prevUserRef = useRef<string | null>(null);
  const prevVisibleLenRef = useRef(0);

  const { data, isLoading } = useQuery({
    queryKey: ["recording-student", recordingId, userId],
    queryFn: () => api.get(`/recordings/${recordingId}/students/${userId}`).then((r) => r.data),
    enabled: !!recordingId && !!userId,
    refetchInterval: isLive ? 4000 : false,
  });

  const events: RecEvent[] = useMemo(() => data?.events || [], [data]);

  const filterCounts = useMemo(() => {
    const counts: Record<FilterType, number> = {
      all: events.length,
      code_snapshot: 0,
      run: 0,
      tab_out: 0,
      paste: 0,
    };
    for (const e of events) {
      if (e.type === "code_snapshot") counts.code_snapshot += 1;
      else if (e.type === "run") counts.run += 1;
      else if (e.type === "tab_out") counts.tab_out += 1;
      else if (e.type === "paste") counts.paste += 1;
    }
    return counts;
  }, [events]);

  const visibleEvents = useMemo(() => {
    if (eventFilter === "all") return events;
    return events.filter((e) => e.type === eventFilter);
  }, [events, eventFilter]);

  // Keep cursor synced on student switch, filter change, or live tail updates.
  useEffect(() => {
    const switchedUser = prevUserRef.current !== userId;
    const prevLen = prevVisibleLenRef.current;
    prevUserRef.current = userId;
    prevVisibleLenRef.current = visibleEvents.length;

    if (switchedUser) {
      setPlaying(false);
      setEventFilter("all");
      setIndex(visibleEvents.length ? visibleEvents.length - 1 : 0);
      return;
    }

    setIndex((curr) => {
      if (!visibleEvents.length) return 0;
      const wasAtTail = prevLen === 0 || curr >= prevLen - 1;
      if (isLive && wasAtTail && !playing) {
        return visibleEvents.length - 1;
      }
      return Math.min(curr, visibleEvents.length - 1);
    });
  }, [visibleEvents.length, userId, isLive, playing]);

  // Reset cursor to end when switching filter.
  const handleFilterChange = (next: FilterType) => {
    setPlaying(false);
    setEventFilter(next);
    const nextList = next === "all" ? events : events.filter((e) => e.type === next);
    setIndex(nextList.length ? nextList.length - 1 : 0);
  };

  // Playback timer
  const speed = SPEEDS[speedIdx];
  useEffect(() => {
    if (!playing) return;
    if (visibleEvents.length <= 1) {
      setPlaying(false);
      return;
    }
    const ms = Math.max(200, Math.round(1200 / speed));
    const timer = window.setInterval(() => {
      setIndex((curr) => {
        if (curr >= visibleEvents.length - 1) {
          setPlaying(false);
          return curr;
        }
        return curr + 1;
      });
    }, ms);
    return () => window.clearInterval(timer);
  }, [playing, speed, visibleEvents.length]);

  // Arrow keys step between events.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement !== sliderRef.current) return;
      if (e.key === "ArrowLeft") {
        setPlaying(false);
        setIndex((i) => Math.max(0, i - 1));
      }
      if (e.key === "ArrowRight") {
        setPlaying(false);
        setIndex((i) => Math.min(Math.max(0, visibleEvents.length - 1), i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleEvents.length]);

  const startMs = events.length ? new Date(events[0].at).getTime() : 0;
  const endMs = events.length ? new Date(events[events.length - 1].at).getTime() : 0;
  const spanMs = Math.max(1, endMs - startMs);

  const safeIndex = Math.min(index, Math.max(0, visibleEvents.length - 1));
  const current = visibleEvents[safeIndex] || null;

  // Code visible at the cursor = most recent code_snapshot or run with code at or before current event.
  const codeAtCursor = useMemo(() => {
    if (!current || !events.length) return null;
    const fullIdx = events.findIndex((e) => e.id === current.id);
    const startSearch = fullIdx >= 0 ? fullIdx : events.length - 1;
    for (let i = startSearch; i >= 0; i--) {
      const ev = events[i];
      if ((ev.type === "code_snapshot" || ev.type === "run") && ev.code) {
        return { code: ev.code, at: ev.at, label: ev.label };
      }
    }
    return null;
  }, [events, current]);

  const togglePlay = () => {
    if (!visibleEvents.length) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (safeIndex >= visibleEvents.length - 1) {
      setIndex(0);
    }
    setPlaying(true);
  };

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Đang tải dòng thời gian...</div>;
  }

  if (!data) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Không tải được dữ liệu.</div>;
  }

  if (!events.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Clock className="mx-auto h-9 w-9 text-muted-foreground opacity-40" />
          <p className="mt-3 text-sm font-medium">Chưa ghi được sự kiện nào</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLive
              ? "Đang chờ học sinh viết code hoặc thao tác — dòng thời gian sẽ tự động cập nhật."
              : "Học sinh có thể chưa mở bài học hoặc viết code trong lúc buổi ghi đang chạy."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const tabOutCount = data.summary?.tabOutCount ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {data.student && (
          <StudentName
            fullName={data.student.fullName}
            nickname={data.student.nickname}
            primaryClassName="text-xs font-semibold"
          />
        )}
        {isLive && (
          <Badge variant="secondary" className="bg-emerald-500/15 text-[10px] text-emerald-700 dark:text-emerald-400">
            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Trực tiếp
          </Badge>
        )}
        {data.addedManually && (
          <Badge variant="secondary" className="text-[10px]">
            Thêm giữa buổi
          </Badge>
        )}
        <Badge variant="secondary" className="text-[10px]">
          {formatDuration(data.summary?.activeSeconds || 0)}
        </Badge>
        <Badge
          variant="secondary"
          className={cn(
            "text-[10px]",
            tabOutCount > 0 && "bg-rose-500/15 text-rose-600 dark:text-rose-400",
          )}
        >
          Rời tab {tabOutCount} lần
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          Chạy code {data.summary?.runCount ?? 0} lần
        </Badge>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTER_OPTIONS.map((opt) => {
          const count = filterCounts[opt.key];
          const active = eventFilter === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => handleFilterChange(opt.key)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {opt.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Track */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{formatClock(startMs)}</span>
            <span className="font-semibold text-foreground">
              {current ? formatClockSeconds(current.at) : "--:--"}
            </span>
            <span>{formatClock(endMs)}</span>
          </div>

          {/* Event markers, positioned by time */}
          <div className="relative h-9">
            <div className="absolute inset-x-0 top-4 h-1 rounded-full bg-muted" />
            {visibleEvents.map((e, i) => {
              const left = ((new Date(e.at).getTime() - startMs) / spanMs) * 100;
              const meta = EVENT_META[e.type as RecEventType] || EVENT_META.activity;
              const isRun = e.type === "run";
              const tone = isRun
                ? e.passed === true
                  ? "bg-emerald-500"
                  : e.passed === false
                    ? "bg-rose-500"
                    : meta.color
                : meta.color;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setIndex(i);
                  }}
                  title={`${formatClockSeconds(e.at)} — ${meta.label}${e.label ? `: ${e.label}` : ""}`}
                  className={cn(
                    "absolute top-2 -ml-1 rounded-full transition-all hover:scale-150",
                    tone,
                    e.type === "tab_out" ? "top-1 h-5 w-2" : "h-4 w-2",
                    i === safeIndex && "scale-150 ring-2 ring-ring ring-offset-1",
                  )}
                  style={{ left: `${left}%` }}
                />
              );
            })}
          </div>

          {/* Playback + Scrubber */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={togglePlay}
              disabled={visibleEvents.length <= 1}
              aria-label={playing ? "Tạm dừng" : "Phát lại"}
              className="h-7 px-2"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setSpeedIdx((s) => (s + 1) % SPEEDS.length)}
              className="h-7 px-1.5 font-mono text-[11px] text-muted-foreground"
              title="Đổi tốc độ phát"
            >
              {speed}x
            </Button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setIndex((i) => Math.max(0, i - 1));
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Mốc trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              ref={sliderRef}
              type="range"
              min={0}
              max={Math.max(0, visibleEvents.length - 1)}
              value={safeIndex}
              onChange={(e) => {
                setPlaying(false);
                setIndex(Number(e.target.value));
              }}
              disabled={visibleEvents.length === 0}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setIndex((i) => Math.min(Math.max(0, visibleEvents.length - 1), i + 1));
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Mốc sau"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="w-16 text-right text-[11px] tabular-nums text-muted-foreground">
              {visibleEvents.length ? `${safeIndex + 1}/${visibleEvents.length}` : "0/0"}
            </span>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 border-t pt-2 text-[10px] text-muted-foreground">
            {(["code_snapshot", "tab_out", "run", "paste", "idle_start"] as const).map((t) => (
              <span key={t} className="inline-flex items-center gap-1">
                <span className={cn("h-2 w-2 rounded-full", EVENT_META[t].color)} />
                {EVENT_META[t].label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Chạy đúng
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Chạy sai
            </span>
          </div>
        </CardContent>
      </Card>

      {/* What happened at the cursor */}
      {current && (
        <div
          className={cn(
            "rounded-lg border border-border p-3 text-xs",
            current.type === "tab_out" && "border-rose-500/40 bg-rose-500/10 dark:bg-rose-950/30",
            current.type === "paste" && "border-blue-500/40 bg-blue-500/10 dark:bg-blue-950/30",
          )}
        >
          <span className="font-semibold">{EVENT_META[current.type]?.label || current.type}</span>
          {current.label ? <span className="text-muted-foreground"> — {current.label}</span> : null}
          {current.type === "run" && (
            <Badge
              variant="secondary"
              className={cn(
                "ml-2 text-[10px]",
                current.passed === true
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : current.passed === false
                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {current.passed === true ? "Đúng" : current.passed === false ? "Sai" : "Không chấm"}
            </Badge>
          )}
        </div>
      )}

      {/* Code at this moment */}
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Code lúc {codeAtCursor ? formatClockSeconds(codeAtCursor.at) : "—"}
          </p>
          {codeAtCursor?.label && (
            <span className="truncate text-[11px] text-muted-foreground">{codeAtCursor.label}</span>
          )}
        </div>
        <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 px-4 py-3 font-mono text-xs leading-relaxed text-slate-100">
          {codeAtCursor?.code || "(chưa có code tại thời điểm này)"}
        </pre>
      </div>
    </div>
  );
}
