import { useState } from"react";
import { useQuery } from"@tanstack/react-query";
import { CheckCircle2, XCircle } from"lucide-react";
import api from"../../../lib/api";
import { cn } from"../../../lib/utils";
import { Card, CardContent } from"../../../components/ui/card";
import { Badge } from"../../../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from"../../../components/ui/dialog";
import { SkeletonTable } from"../../../components/ui/skeletons";
import { StudentName } from"../../../components/ui/StudentName";
import { formatDate, initialOf, scoreColor } from"./trackingUtils";

interface QuizCell {
 bestPercent: number;
 attempts: number;
 passed: boolean;
 lastAttemptId: string;
 bestAttemptId: string;
 lastAttemptAt: string;
}

interface QuizLesson {
 lessonId: string;
 lessonTitle: string;
 moduleTitle: string;
 quizId: string;
 passScore: number;
 questionCount: number;
}

interface QuizMatrix {
 lessons: QuizLesson[];
 students: { userId: string; fullName: string; nickname?: string | null; scores: Record<string, QuizCell> }[];
}

export default function QuizScoreTable({ courseId }: { courseId: string }) {
 const [openAttemptId, setOpenAttemptId] = useState<string | null>(null);

 const { data, isLoading } = useQuery<QuizMatrix>({
 queryKey: ["course-tracking-quiz", courseId],
 queryFn: () => api.get(`/courses/${courseId}/tracking/quiz`).then((r) => r.data),
 enabled: !!courseId,
 });

 if (isLoading) return <SkeletonTable rows={8} cols={6} />;

 if (!data?.lessons.length) {
 return (
 <Card>
 <CardContent className="py-12 text-center text-sm text-muted-foreground">
 Khóa học này chưa có bài kiểm tra nào.
 </CardContent>
 </Card>
 );
 }

 return (
 <>
 <Card className="overflow-x-auto">
 <CardContent className="p-0">
 <table className="w-full text-xs">
 <thead>
 <tr className="border-b bg-muted/50">
 <th className="sticky left-0 z-10 min-w-[190px] bg-muted/50 px-3 py-2 text-left font-bold">Học sinh</th>
 {data.lessons.map((l, i) => (
 <th key={l.lessonId} className="px-2 py-2 text-center font-medium" title={`${l.moduleTitle} · ${l.lessonTitle} (đạt ≥${l.passScore}%)`}>
 <div>B{i + 1}</div>
 <div className="max-w-[80px] truncate text-[10px] font-normal text-muted-foreground">{l.lessonTitle}</div>
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {data.students.map((s) => (
 <tr key={s.userId} className="border-b hover:bg-muted/30">
 <td className="sticky left-0 z-10 bg-card px-3 py-2">
 <span className="flex items-center gap-2">
 <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
 {initialOf(s.fullName)}
 </span>
 <StudentName fullName={s.fullName} nickname={s.nickname} className="max-w-[140px]" primaryClassName="text-xs font-medium" />
 </span>
 </td>
 {data.lessons.map((l) => {
 const cell = s.scores[l.lessonId];
 return (
 <td key={l.lessonId} className="px-1 py-2 text-center">
 {cell ? (
 <button
 onClick={() => setOpenAttemptId(cell.bestAttemptId)}
 className={cn("inline-flex min-w-[3.2rem] flex-col items-center justify-center rounded px-2 py-1 font-medium tabular-nums",
 scoreColor(cell.bestPercent, cell.passed),
 )}
 title={`Cao nhất ${cell.bestPercent}% · ${cell.attempts} lần thử · ${cell.passed ?"đã đạt" :"chưa đạt"} (cần ≥${l.passScore}%)\nLần cuối: ${formatDate(cell.lastAttemptAt)}\nBấm để xem chi tiết`}
 >
 <span>{cell.bestPercent}%</span>
 {cell.attempts > 1 && <span className="text-[9px] font-normal opacity-75">×{cell.attempts}</span>}
 </button>
 ) : (
 <span className="inline-flex min-w-[3.2rem] items-center justify-center rounded bg-muted px-2 py-1 text-muted-foreground">—</span>
 )}
 </td>
 );
 })}
 </tr>
 ))}
 </tbody>
 </table>
 </CardContent>
 </Card>

 <p className="text-[11px] text-muted-foreground">
 Ô hiển thị điểm cao nhất; ×N là số lần làm lại. Bấm vào ô để xem từng câu học sinh chọn.
 </p>

 <AttemptDetailDialog attemptId={openAttemptId} onClose={() => setOpenAttemptId(null)} />
 </>
 );
}

/** Reuses the existing GET /api/quizzes/attempt/:id, which already allows staff. */
function AttemptDetailDialog({ attemptId, onClose }: { attemptId: string | null; onClose: () => void }) {
 const { data, isLoading } = useQuery({
 queryKey: ["quiz-attempt-detail", attemptId],
 queryFn: () => api.get(`/quizzes/attempt/${attemptId}`).then((r) => r.data),
 enabled: !!attemptId,
 });

 return (
 <Dialog open={!!attemptId} onOpenChange={(open) => !open && onClose()}>
 <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
 <DialogHeader>
 <DialogTitle>{data?.quizTitle ||"Chi tiết bài kiểm tra"}</DialogTitle>
 </DialogHeader>

 {isLoading ? (
 <p className="py-8 text-center text-sm text-muted-foreground">Đang tải...</p>
 ) : !data ? (
 <p className="py-8 text-center text-sm text-muted-foreground">Không tải được chi tiết.</p>
 ) : (
 <div className="space-y-3">
 <div className="flex flex-wrap items-center gap-2 text-sm">
 <Badge variant="secondary" className={data.passed ?"" :""}>
 {data.passed ?"Đạt" :"Chưa đạt"}
 </Badge>
 <span className="font-semibold tabular-nums">{data.percent}%</span>
 <span className="text-muted-foreground">
 ({data.score}/{data.totalQuestions} câu · cần ≥{data.passScore}%)
 </span>
 <span className="ml-auto text-xs text-muted-foreground">{formatDate(data.createdAt)}</span>
 </div>

 {(data.details || []).map((d: any, i: number) => (
 <div
 key={d.questionId}
 className={cn("rounded-lg border border-border p-3",
 d.isCorrect ?"bg-emerald-500/10 dark:bg-emerald-950/20" :"bg-red-500/10 dark:bg-red-950/20",
 )}
 >
 <div className="flex items-start gap-2">
 {d.isCorrect ? (
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
 ) : (
 <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
 )}
 <p className="text-sm font-medium">
 Câu {i + 1}. {d.question}
 </p>
 </div>

 <ul className="mt-2 space-y-1 pl-6">
 {(d.options || []).map((opt: string, oi: number) => {
 const chosen = oi === d.selectedIndex;
 const correct = oi === d.correctIndex;
 return (
 <li
 key={oi}
 className={cn("rounded px-2 py-1 text-xs",
 correct &&" font-medium dark:bg-emerald-950/40 ",
 chosen && !correct &&" font-medium dark:bg-red-950/40 ",
 )}
 >
 {String.fromCharCode(65 + oi)}. {opt}
 {chosen && <span className="ml-2 text-[10px] uppercase">← học sinh chọn</span>}
 {correct && !chosen && <span className="ml-2 text-[10px] uppercase">← đáp án đúng</span>}
 </li>
 );
 })}
 </ul>

 {d.explanation && <p className="mt-2 pl-6 text-xs italic text-muted-foreground">{d.explanation}</p>}
 </div>
 ))}
 </div>
 )}
 </DialogContent>
 </Dialog>
 );
}
