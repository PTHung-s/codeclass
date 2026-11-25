import { useEffect, useMemo, useRef, useState } from"react";
import { useQuery } from"@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock } from"lucide-react";
import api from"../../../lib/api";
import { cn } from"../../../lib/utils";
import { Card, CardContent } from"../../../components/ui/card";
import { Badge } from"../../../components/ui/badge";
import {
 EVENT_META,
 formatClock,
 formatClockSeconds,
 formatDuration,
 type RecEvent,
} from"./recordingUtils";
import { StudentName } from"../../../components/ui/StudentName";

/**
 * Draggable timeline for one student's recorded session.
 *
 * Scrubbing moves through the event list; the code panel shows the most recent
 * snapshot at or before the cursor, so the teacher sees what the student's
 * editor actually looked like at that moment.
 */
export default function StudentTimeline({
 recordingId,
 userId,
}: {
 recordingId: string;
 userId: string;
}) {
 const [index, setIndex] = useState(0);
 const sliderRef = useRef<HTMLInputElement>(null);

 const { data, isLoading } = useQuery({
 queryKey: ["recording-student", recordingId, userId],
 queryFn: () => api.get(`/recordings/${recordingId}/students/${userId}`).then((r) => r.data),
 enabled: !!recordingId && !!userId,
 });

 const events: RecEvent[] = useMemo(() => data?.events || [], [data]);

 // Jump to the end whenever a different student is opened.
 useEffect(() => {
 setIndex(events.length ? events.length - 1 : 0);
 }, [events.length, userId]);

 // Arrow keys step between events.
 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 if (document.activeElement !== sliderRef.current) return;
 if (e.key ==="ArrowLeft") setIndex((i) => Math.max(0, i - 1));
 if (e.key ==="ArrowRight") setIndex((i) => Math.min(events.length - 1, i + 1));
 };
 window.addEventListener("keydown", onKey);
 return () => window.removeEventListener("keydown", onKey);
 }, [events.length]);

 const startMs = events.length ? new Date(events[0].at).getTime() : 0;
 const endMs = events.length ? new Date(events[events.length - 1].at).getTime() : 0;
 const spanMs = Math.max(1, endMs - startMs);

 const current = events[index] || null;

 // The code visible at the cursor = most recent snapshot at or before it.
 const codeAtCursor = useMemo(() => {
 for (let i = Math.min(index, events.length - 1); i >= 0; i--) {
 if (events[i].type ==="code_snapshot" && events[i].code) {
 return { code: events[i].code as string, at: events[i].at };
 }
 }
 return null;
 }, [events, index]);

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
 Học sinh có thể chưa mở bài học nào trong lúc buổi ghi đang chạy.
 </p>
 </CardContent>
 </Card>
 );
 }

 return (
 <div className="space-y-3">
 <div className="flex flex-wrap items-center gap-2 text-xs">
 {data.student && <StudentName fullName={data.student.fullName} nickname={data.student.nickname} primaryClassName="text-xs font-semibold" />}
 {data.addedManually && <Badge variant="secondary" className="text-[10px]">Thêm giữa buổi</Badge>}
 <Badge variant="secondary" className="text-[10px]">
 {formatDuration(data.summary?.activeSeconds || 0)}
 </Badge>
 <Badge variant="secondary" className={cn("text-[10px]", data.summary?.tabOutCount > 0 &&"")}>
 Rời tab {data.summary?.tabOutCount ?? 0} lần
 </Badge>
 <Badge variant="secondary" className="text-[10px]">Chạy code {data.summary?.runCount ?? 0} lần</Badge>
 </div>

 {/* Track */}
 <Card>
 <CardContent className="space-y-3 p-4">
 <div className="flex items-center justify-between text-[11px] text-muted-foreground">
 <span>{formatClock(startMs)}</span>
 <span className="font-semibold text-foreground">
 {current ? formatClockSeconds(current.at) :"--:--"}
 </span>
 <span>{formatClock(endMs)}</span>
 </div>

 {/* Event markers, positioned by time */}
 <div className="relative h-9">
 <div className="absolute inset-x-0 top-4 h-1 rounded-full bg-muted" />
 {events.map((e, i) => {
 const left = ((new Date(e.at).getTime() - startMs) / spanMs) * 100;
 const meta = EVENT_META[e.type] || EVENT_META.activity;
 const isRun = e.type ==="run";
 const tone = isRun ? (e.passed === true ?"" : e.passed === false ?"" : meta.color) : meta.color;
 return (
 <button
 key={e.id}
 onClick={() => setIndex(i)}
 title={`${formatClockSeconds(e.at)} — ${meta.label}${e.label ? `: ${e.label}` :""}`}
 className={cn("absolute top-2 -ml-1 rounded-full transition-all hover:scale-150",
 tone,
 e.type ==="tab_out" ?"h-5 w-2 top-1" :"h-4 w-2",
 i === index &&"ring-2 ring-offset-1 ring-ring scale-150",
 )}
 style={{ left: `${left}%` }}
 />
 );
 })}
 </div>

 {/* Scrubber */}
 <div className="flex items-center gap-2">
 <button
 onClick={() => setIndex((i) => Math.max(0, i - 1))}
 className="rounded p-1 text-muted-foreground hover:bg-muted"
 aria-label="Mốc trước"
 >
 <ChevronLeft className="h-4 w-4" />
 </button>
 <input
 ref={sliderRef}
 type="range"
 min={0}
 max={Math.max(0, events.length - 1)}
 value={index}
 onChange={(e) => setIndex(Number(e.target.value))}
 className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
 />
 <button
 onClick={() => setIndex((i) => Math.min(events.length - 1, i + 1))}
 className="rounded p-1 text-muted-foreground hover:bg-muted"
 aria-label="Mốc sau"
 >
 <ChevronRight className="h-4 w-4" />
 </button>
 <span className="w-20 text-right text-[11px] tabular-nums text-muted-foreground">
 {index + 1}/{events.length}
 </span>
 </div>

 {/* Legend */}
 <div className="flex flex-wrap gap-3 border-t pt-2 text-[10px] text-muted-foreground">
 {(["code_snapshot","tab_out","run","paste","idle_start"] as const).map((t) => (
 <span key={t} className="inline-flex items-center gap-1">
 <span className={cn("h-2 w-2 rounded-full", EVENT_META[t].color)} />
 {EVENT_META[t].label}
 </span>
 ))}
 </div>
 </CardContent>
 </Card>

 {/* What happened at the cursor */}
 {current && (
 <div
 className={cn("rounded-lg border border-border p-3 text-xs",
 current.type ==="tab_out" &&" bg-primary/10 dark:bg-red-950/20",
 current.type ==="paste" &&" bg-primary/10 dark:bg-blue-950/20",
 )}
 >
 <span className="font-semibold">{EVENT_META[current.type]?.label || current.type}</span>
 {current.label ? <span className="text-muted-foreground"> — {current.label}</span> : null}
 {current.type ==="run" && (
 <Badge
 variant="secondary"
 className={cn("ml-2 text-[10px]",
 current.passed === true ?"bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : current.passed === false ?"bg-rose-500/15 text-rose-700 dark:text-rose-400" :"bg-muted text-muted-foreground",
 )}
 >
 {current.passed === true ?"Đúng" : current.passed === false ?"Sai" :"Không chấm"}
 </Badge>
 )}
 </div>
 )}

 {/* Code at this moment */}
 <div>
 <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
 Code lúc {codeAtCursor ? formatClockSeconds(codeAtCursor.at) :"—"}
 </p>
 <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 px-4 py-3 font-mono text-xs leading-relaxed text-slate-100">
 {codeAtCursor?.code ||"(chưa có code tại thời điểm này)"}
 </pre>
 </div>
 </div>
 );
}
