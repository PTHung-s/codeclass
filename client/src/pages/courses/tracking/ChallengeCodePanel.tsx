import { useMemo, useState } from"react";
import { useQuery } from"@tanstack/react-query";
import { Code2, CheckCircle2, MinusCircle, XCircle } from"lucide-react";
import api from"../../../lib/api";
import { cn } from"../../../lib/utils";
import { Card, CardContent } from"../../../components/ui/card";
import { Badge } from"../../../components/ui/badge";
import { SkeletonTable } from"../../../components/ui/skeletons";
import { StudentName } from"../../../components/ui/StudentName";
import { formatRelativeDays, initialOf } from"./trackingUtils";

export interface ChallengeRow {
 id: string;
 userId: string;
 fullName: string;
 nickname?: string | null;
 lessonId: string;
 lessonTitle: string;
 moduleTitle: string;
 challengeKey: string;
 title: string | null;
 language: string;
 latestCode: string;
 firstPassCode: string | null;
 runCount: number;
 failCount: number;
 passed: boolean | null;
 firstPassAt: string | null;
 lastRunAt: string;
}

/**
 * Shows the code students actually wrote. `passed === null` means the block had
 * no expected output to grade against (all C++/Python code_runner blocks), so
 * we present it as"đã làm" rather than pass/fail.
 */
export default function ChallengeCodePanel({ courseId }: { courseId: string }) {
 const [lessonFilter, setLessonFilter] = useState("");
 const [selectedId, setSelectedId] = useState<string | null>(null);

 const { data, isLoading } = useQuery<{ lessons: any[]; challenges: ChallengeRow[]; totalRows: number; truncated: boolean }>({
 queryKey: ["course-tracking-challenges", courseId, lessonFilter],
 queryFn: () =>
 api
 .get(`/courses/${courseId}/tracking/challenges${lessonFilter ? `?lessonId=${lessonFilter}` :""}`)
 .then((r) => r.data),
 enabled: !!courseId,
 });

 const rows = data?.challenges || [];
 const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

 // Only offer lessons that actually have recorded activity, plus the current filter.
 const lessonOptions = data?.lessons || [];

 if (isLoading) return <SkeletonTable rows={6} cols={4} />;

 return (
 <div className="space-y-3">
 <div className="flex flex-wrap items-center gap-2">
 <select
 value={lessonFilter}
 onChange={(e) => {
 setLessonFilter(e.target.value);
 setSelectedId(null);
 }}
 className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none"
 >
 <option value="">Tất cả bài học</option>
 {lessonOptions.map((l: any) => (
 <option key={l.id} value={l.id}>
 {l.title}
 </option>
 ))}
 </select>
 <span className="text-xs text-muted-foreground">
 {data?.truncated
 ? `Hiển thị ${rows.length}/${data.totalRows} lượt mới nhất — hãy lọc theo bài học để xem đủ`
 : `${rows.length} lượt làm bài`}
 </span>
 </div>

 {!rows.length ? (
 <Card>
 <CardContent className="py-12 text-center">
 <Code2 className="mx-auto h-10 w-10 text-muted-foreground opacity-40" />
 <p className="mt-3 text-sm font-medium">Chưa có dữ liệu code</p>
 <p className="mt-1 text-xs text-muted-foreground">
 Hệ thống bắt đầu ghi lại code từ lần chạy tiếp theo của học sinh. Dữ liệu trước đây không được lưu nên
 không hiển thị ở đây.
 </p>
 </CardContent>
 </Card>
 ) : (
 <div className="grid gap-3 lg:grid-cols-[minmax(0,380px)_1fr]">
 {/* List */}
 <Card className="max-h-[70vh] overflow-y-auto">
 <CardContent className="divide-y p-0">
 {rows.map((r) => (
 <button
 key={r.id}
 onClick={() => setSelectedId(r.id)}
 className={cn("flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
 selectedId === r.id &&"bg-primary/10 dark:bg-primary/15",
 )}
 >
 <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
 {initialOf(r.fullName)}
 </span>
 <span className="min-w-0 flex-1">
 <span className="flex items-start gap-1.5">
 <StudentName fullName={r.fullName} nickname={r.nickname} className="min-w-0 flex-1" primaryClassName="text-xs font-semibold" />
 <StatusIcon passed={r.passed} />
 </span>
 <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
 {r.title || r.lessonTitle}
 </span>
 <span className="mt-0.5 block text-[10px] text-muted-foreground">
 {r.runCount} lần chạy
 {r.failCount > 0 && ` · ${r.failCount} lần sai`} · {formatRelativeDays(r.lastRunAt)}
 </span>
 </span>
 </button>
 ))}
 </CardContent>
 </Card>

 {/* Code viewer */}
 <Card className="max-h-[70vh] overflow-y-auto">
 <CardContent className="p-4">
 {!selected ? (
 <p className="py-16 text-center text-sm text-muted-foreground">
 Chọn một học sinh bên trái để xem code.
 </p>
 ) : (
 <div className="space-y-3">
 <div>
 <StudentName fullName={selected.fullName} nickname={selected.nickname} primaryClassName="text-sm font-bold" />
 <p className="text-xs text-muted-foreground">
 {selected.moduleTitle} · {selected.lessonTitle}
 {selected.title ? ` · ${selected.title}` :""}
 </p>
 </div>

 <div className="flex flex-wrap gap-2 text-[11px]">
 <Badge variant="secondary">{selected.language ==="cpp" ?"C++" :"Python"}</Badge>
 <Badge variant="secondary">{selected.runCount} lần chạy</Badge>
 {selected.failCount > 0 && (
 <Badge variant="secondary" className="">
 {selected.failCount} lần sai
 </Badge>
 )}
 <Badge
 variant="secondary"
 className={
 selected.passed === true
 ?""
 : selected.passed === false
 ?""
 :""
 }
 >
 {selected.passed === true ?"Đã đúng" : selected.passed === false ?"Chưa đúng" :"Không chấm tự động"}
 </Badge>
 </div>

 <CodeBlock label="Code mới nhất" code={selected.latestCode} />

 {selected.firstPassCode && selected.firstPassCode !== selected.latestCode && (
 <CodeBlock label="Code lúc làm đúng lần đầu" code={selected.firstPassCode} tone="emerald" />
 )}
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 )}
 </div>
 );
}

function StatusIcon({ passed }: { passed: boolean | null }) {
 if (passed === true) return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />;
 if (passed === false) return <XCircle className="h-3.5 w-3.5 shrink-0" />;
 return <MinusCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

function CodeBlock({ label, code, tone }: { label: string; code: string; tone?:"emerald" }) {
 return (
 <div>
 <p className={cn("mb-1 text-[11px] font-bold uppercase tracking-wider", tone ==="emerald" ?"" :"text-muted-foreground")}>
 {label}
 </p>
 <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 px-4 py-3 font-mono text-xs leading-relaxed">
 {code ||"(trống)"}
 </pre>
 </div>
 );
}
