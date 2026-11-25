import { Card, CardContent } from"../../../components/ui/card";
import { StudentName } from"../../../components/ui/StudentName";
import { cn } from"../../../lib/utils";
import {
 formatRelativeDays,
 initialOf,
 ratioColor,
 type TrackingModule,
 type TrackingStudent,
} from"./trackingUtils";

/**
 * Students × chapters grid. Each cell is"done/total" lessons for that chapter,
 * shaded by completion — the fastest way to see who is where and who is behind.
 */
export default function ProgressGrid({
 modules,
 students,
 onSelectStudent,
}: {
 modules: TrackingModule[];
 students: TrackingStudent[];
 onSelectStudent: (userId: string) => void;
}) {
 if (!students.length) {
 return (
 <Card>
 <CardContent className="py-12 text-center text-sm text-muted-foreground">
 Chưa có học sinh nào trong danh sách.
 </CardContent>
 </Card>
 );
 }

 return (
 <>
 {/* Desktop: sticky-name table, same shape as the skill heatmap */}
 <Card className="hidden overflow-x-auto md:block">
 <CardContent className="p-0">
 <table className="w-full text-xs">
 <thead>
 <tr className="border-b bg-muted/50">
 <th className="sticky left-0 z-10 min-w-[190px] bg-muted/50 px-3 py-2 text-left font-bold">Học sinh</th>
 <th className="px-2 py-2 text-center font-bold">Tiến độ</th>
 {modules.map((m, i) => (
 <th key={m.id} className="px-2 py-2 text-center font-medium" title={m.title}>
 <div>C{i + 1}</div>
 <div className="max-w-[90px] truncate text-[10px] font-normal text-muted-foreground">{m.title}</div>
 </th>
 ))}
 <th className="px-3 py-2 text-left font-medium">Đang học</th>
 <th className="px-3 py-2 text-center font-medium">Gần nhất</th>
 </tr>
 </thead>
 <tbody>
 {students.map((s) => (
 <tr key={s.userId} className="border-b hover:bg-muted/30">
 <td className="sticky left-0 z-10 bg-card px-3 py-2">
 <button
 className="flex items-center gap-2 text-left font-medium transition-colors hover:text-primary"
 onClick={() => onSelectStudent(s.userId)}
 >
 <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
 {initialOf(s.fullName)}
 </span>
 <StudentName fullName={s.fullName} nickname={s.nickname} className="max-w-[140px]" primaryClassName="text-xs font-medium" />
 </button>
 </td>

 <td className="px-2 py-2">
 <button
 onClick={() => onSelectStudent(s.userId)}
 className="flex w-full flex-col items-center gap-1"
 title={`${s.lessonsCompleted}/${s.totalLessons} bài`}
 >
 <span className="text-[11px] font-bold tabular-nums">{s.percent}%</span>
 <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
 <span
 className={cn("block h-full rounded-full",
 s.percent >= 75 ?"bg-emerald-500" : s.percent >= 50 ?"bg-amber-500" :"bg-rose-500",
 )}
 style={{ width: `${s.percent}%` }}
 />
 </span>
 </button>
 </td>

 {modules.map((m) => {
 const cell = s.perModule[m.id];
 const total = cell?.total ?? 0;
 const done = cell?.done ?? 0;
 const ratio = total ? done / total : 0;
 return (
 <td key={m.id} className="px-1 py-2 text-center">
 <button
 onClick={() => onSelectStudent(s.userId)}
 className={cn("inline-flex min-w-[3rem] items-center justify-center rounded px-2 py-1 font-medium tabular-nums",
 ratioColor(ratio, total === 0),
 )}
 title={`${m.title}: ${done}/${total} bài`}
 >
 {total ? `${done}/${total}` :"—"}
 </button>
 </td>
 );
 })}

 <td className="max-w-[180px] px-3 py-2">
 {s.currentLesson ? (
 <span className="block truncate text-[11px] text-muted-foreground" title={`${s.currentLesson.moduleTitle} · ${s.currentLesson.title}`}>
 {s.currentLesson.title}
 </span>
 ) : (
 <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Hoàn thành</span>
 )}
 </td>

 <td className="whitespace-nowrap px-3 py-2 text-center text-[11px] text-muted-foreground">
 {formatRelativeDays(s.lastActiveAt)}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </CardContent>
 </Card>

 {/* Mobile: one card per student */}
 <div className="space-y-3 md:hidden">
 {students.map((s) => (
 <Card key={s.userId}>
 <CardContent className="space-y-2 p-3">
 <button className="flex w-full items-center justify-between gap-2" onClick={() => onSelectStudent(s.userId)}>
 <span className="flex min-w-0 items-center gap-2">
 <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
 {initialOf(s.fullName)}
 </span>
 <StudentName fullName={s.fullName} nickname={s.nickname} className="min-w-0 flex-1" primaryClassName="text-sm font-semibold" />
 </span>
 <span className="shrink-0 text-sm font-bold tabular-nums">{s.percent}%</span>
 </button>

 <div className="h-1.5 overflow-hidden rounded-full bg-muted">
 <div
 className={cn("h-full rounded-full",
 s.percent >= 75 ?"bg-emerald-500" : s.percent >= 50 ?"bg-amber-500" :"bg-rose-500",
 )}
 style={{ width: `${s.percent}%` }}
 />
 </div>

 <div className="flex flex-wrap gap-1">
 {modules.map((m, i) => {
 const cell = s.perModule[m.id];
 const total = cell?.total ?? 0;
 const done = cell?.done ?? 0;
 return (
 <span
 key={m.id}
 className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums", ratioColor(total ? done / total : 0, total === 0))}
 title={m.title}
 >
 C{i + 1} {total ? `${done}/${total}` :"—"}
 </span>
 );
 })}
 </div>

 <p className="text-[11px] text-muted-foreground">
 {s.currentLesson ? `Đang học: ${s.currentLesson.title}` :"Đã hoàn thành khóa"} · {formatRelativeDays(s.lastActiveAt)}
 </p>
 </CardContent>
 </Card>
 ))}
 </div>
 </>
 );
}
