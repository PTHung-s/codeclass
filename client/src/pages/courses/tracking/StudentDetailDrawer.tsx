import { useQuery } from"@tanstack/react-query";
import { CheckCircle2, Circle, Code2 } from"lucide-react";
import api from"../../../lib/api";
import { cn } from"../../../lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from"../../../components/ui/sheet";
import { Badge } from"../../../components/ui/badge";
import { StudentName } from"../../../components/ui/StudentName";
import { formatDate, scoreColor } from"./trackingUtils";

/** Full per-lesson breakdown for one student: progress, quiz attempts, code. */
export default function StudentDetailDrawer({
 courseId,
 userId,
 onClose,
}: {
 courseId: string;
 userId: string | null;
 onClose: () => void;
}) {
 const { data, isLoading } = useQuery({
 queryKey: ["course-tracking-student", courseId, userId],
 queryFn: () => api.get(`/courses/${courseId}/tracking/students/${userId}`).then((r) => r.data),
 enabled: !!courseId && !!userId,
 });

 return (
 <Sheet open={!!userId} onOpenChange={(open) => !open && onClose()}>
 <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl">
 <SheetHeader className="border-b p-4">
 <SheetTitle>
 {data?.student ? <StudentName fullName={data.student.fullName} nickname={data.student.nickname} primaryClassName="text-base font-semibold" /> :"Chi tiết học sinh"}
 </SheetTitle>
 {data?.student?.email && <p className="text-xs text-muted-foreground">{data.student.email}</p>}
 </SheetHeader>

 {isLoading ? (
 <p className="p-8 text-center text-sm text-muted-foreground">Đang tải...</p>
 ) : !data ? (
 <p className="p-8 text-center text-sm text-muted-foreground">Không tải được dữ liệu.</p>
 ) : (
 <div className="space-y-4 p-4">
 <div className="grid grid-cols-3 gap-2 text-center">
 <Stat value={`${data.summary.percent}%`} label={`${data.summary.lessonsCompleted}/${data.summary.totalLessons} bài`} />
 <Stat value={`${data.summary.quizzesPassed}/${data.summary.quizzesAttempted || 0}`} label="Quiz đạt/đã làm" />
 <Stat value={`${data.summary.challengesPassed}/${data.summary.challengesAttempted}`} label="Code đúng/đã làm" />
 </div>

 {data.timeline.map((mod: any) => (
 <div key={mod.moduleId}>
 <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{mod.moduleTitle}</h3>
 <div className="space-y-1.5">
 {mod.lessons.map((l: any) => (
 <div key={l.lessonId} className="rounded-lg border border-border p-2.5">
 <div className="flex items-start gap-2">
 {l.completedAt ? (
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
 ) : (
 <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
 )}
 <div className="min-w-0 flex-1">
 <p className={cn("truncate text-xs font-medium", !l.completedAt &&"text-muted-foreground")}>{l.title}</p>
 {l.completedAt && <p className="text-[10px] text-muted-foreground">Xong {formatDate(l.completedAt)}</p>}
 </div>

 {l.quiz && (
 <Badge
 variant="secondary"
 className={cn("shrink-0 text-[10px] tabular-nums", scoreColor(l.quiz.bestPercent, l.quiz.passed))}
 title={`${l.quiz.attempts.length} lần thử · cần ≥${l.quiz.passScore}%`}
 >
 {l.quiz.bestPercent}%
 {l.quiz.attempts.length > 1 ? ` ×${l.quiz.attempts.length}` :""}
 </Badge>
 )}
 </div>

 {l.challenges?.length > 0 && (
 <div className="mt-2 space-y-2 border-t pt-2">
 {l.challenges.map((c: any) => (
 <details key={c.id} className="group">
 <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
 <Code2 className="h-3 w-3 shrink-0" />
 <span className="truncate">{c.title ||"Bài code"}</span>
 <span className="ml-auto shrink-0 tabular-nums">
 {c.runCount} lần
 {c.passed === true ?" · đúng" : c.passed === false ?" · chưa đúng" :""}
 </span>
 </summary>
 <pre className="mt-1.5 max-h-60 overflow-auto rounded-lg bg-slate-950 px-3 py-2 font-mono text-[11px] leading-relaxed">
 {c.latestCode ||"(trống)"}
 </pre>
 </details>
 ))}
 </div>
 )}
 </div>
 ))}
 </div>
 </div>
 ))}
 </div>
 )}
 </SheetContent>
 </Sheet>
 );
}

function Stat({ value, label }: { value: string; label: string }) {
 return (
 <div className="rounded-lg bg-muted/50 px-2 py-2">
 <p className="text-lg font-bold tabular-nums">{value}</p>
 <p className="text-[10px] text-muted-foreground">{label}</p>
 </div>
 );
}
