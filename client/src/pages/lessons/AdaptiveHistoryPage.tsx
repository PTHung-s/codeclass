import { useState } from"react";
import { useNavigate, useSearchParams } from"react-router-dom";
import { useQuery } from"@tanstack/react-query";
import api from"../../lib/api";
import { ArrowLeft, Trophy, Sparkles, Clock, Target, ChevronRight, ChevronDown, CheckCircle2, XCircle, BarChart3, ClipboardList, RotateCcw, Zap } from"lucide-react";
import ReactMarkdown from"react-markdown";
import remarkGfm from"remark-gfm";
import { Button } from"../../components/ui/button";
import { Badge } from"../../components/ui/badge";
import { Skeleton } from"../../components/ui/skeleton";

interface QuizAttemptItem {
 id: string;
 quizTitle: string;
 passScore: number;
 score: number;
 totalQuestions: number;
 percent: number;
 passed: boolean;
 createdAt: string;
}

interface LessonQuizHistory {
 lessonId: string;
 lessonTitle: string;
 moduleTitle: string;
 moduleIndex: number;
 attempts: QuizAttemptItem[];
 bestPercent: number | null;
 passed: boolean;
}

interface HistoryItem {
 id: string;
 moduleId: string;
 moduleTitle: string;
 moduleIndex: number;
 abilityStart: number;
 abilityEnd: number;
 totalQuestions: number;
 correctCount: number;
 accuracyPercent: number;
 passed: boolean;
 partialPass: boolean;
 skippedCount: number;
 createdAt: string;
}

interface AttemptDetail {
 id: string;
 moduleId: string;
 abilityStart: number;
 abilityEnd: number;
 totalQuestions: number;
 correctCount: number;
 accuracyPercent: number;
 passed: boolean;
 partialPass: boolean;
 skippedCount: number;
 answers: Array<{
 questionId: string;
 lessonId: string;
 difficulty: number;
 question: string;
 options: string[];
 correctIndex: number;
 explanation: string | null;
 selectedIndex: number;
 isCorrect: boolean;
 abilityAfter: number;
 }>;
 lessonBreakdown: Record<string, { correct: number; total: number; percent: number }>;
 createdAt: string;
}

export default function AdaptiveHistoryPage() {
 const navigate = useNavigate();
 const [searchParams] = useSearchParams();
 const courseId = searchParams.get("courseId") ||"";
 const [tab, setTab] = useState<"chapter" |"quiz">("chapter");
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const [expandedDetailIdx, setExpandedDetailIdx] = useState<number | null>(null);

 const { data: history = [], isLoading } = useQuery<HistoryItem[]>({
 queryKey: ["adaptive-history", courseId],
 queryFn: () => api.get(`/adaptive/history/${courseId}`).then((r) => r.data || []),
 enabled: !!courseId,
 });

 const { data: detail } = useQuery<AttemptDetail>({
 queryKey: ["adaptive-attempt", expandedId],
 queryFn: () => api.get(`/adaptive/history/${courseId}/attempt/${expandedId}`).then((r) => r.data),
 enabled: !!expandedId && !!courseId,
 });

 const { data: lessons = [] } = useQuery<any[]>({
 queryKey: ["course-lessons-flat", courseId],
 queryFn: () => api.get(`/courses/${courseId}/lessons/flat`).then((r) => r.data || []),
 enabled: !!courseId,
 });

 const lessonMap = new Map(lessons.map((l) => [l.id, l.title]));
 const moduleMap = new Map<string, string>();
 for (const l of lessons) {
 if (!moduleMap.has(l.moduleId) && l.moduleTitle) {
 moduleMap.set(l.moduleId, l.moduleTitle);
 }
 }

 return (
 <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
 <Button
 variant="ghost"
 onClick={() => navigate(`/courses/${courseId}`)}
 className="mb-4 gap-1.5 text-sm hover:text-primary"
 >
 <ArrowLeft className="h-4 w-4" /> Quay lại khóa học
 </Button>

 <h1 className="text-2xl font-extrabold text-foreground">Lịch sử bài kiểm tra</h1>

 {/* Tabs */}
 <div className="mt-4 flex gap-1 rounded-xl p-1">
 {([
 ["chapter","Test vượt chương", Zap],
 ["quiz","Quiz từng bài", ClipboardList],
 ] as const).map(([key, label, Icon]) => (
 <Button
 key={key}
 variant="ghost"
 onClick={() => { setTab(key); setExpandedId(null); }}
 className={`flex-1 gap-1.5 rounded-lg px-3 py-2 text-sm ${tab === key ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
 >
 <Icon className="h-4 w-4" /> {label}
 </Button>
 ))}
 </div>

 {tab ==="chapter" && (isLoading ? (
 <div className="mt-6 space-y-3">
 {[1, 2, 3].map((i) => (
 <Skeleton key={i} className="h-24 w-full rounded-xl" />
 ))}
 </div>
 ) : history.length === 0 ? (
 <div className="mt-8 rounded-2xl border border-dashed bg-card p-10 text-center">
 <BarChart3 className="mx-auto h-10 w-10" />
 <h3 className="mt-3 text-lg font-bold text-foreground">Chưa có lịch sử</h3>
 <p className="mt-1 text-sm">
 Bạn chưa làm bài test vượt chương nào.
 </p>
 </div>
 ) : (
 <div className="mt-6 space-y-3">
 {history.map((item) => (
 <div key={item.id}>
 <Button
 variant="ghost"
 onClick={() => { setExpandedId(expandedId === item.id ? null : item.id); setExpandedDetailIdx(null); }}
 className={`w-full rounded-2xl border border-border p-5 text-left justify-start hover:shadow-sm ${
 item.passed
 ?"bg-emerald-500/10 dark:bg-emerald-950/20"
 : item.partialPass
 ?"bg-amber-500/10 dark:bg-amber-950/20"
 :"bg-red-500/10 dark:bg-red-950/20"
 }`}
 >
 <div className="flex items-center gap-4">
 <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
 item.passed ?"" : item.partialPass ?"" :""
 }`}>
 {item.passed ? <Trophy className="h-5 w-5" /> : item.partialPass ? <Sparkles className="h-5 w-5" /> : <Target className="h-5 w-5" />}
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-bold dark:text-foreground">
 {moduleMap.get(item.moduleId) || item.moduleTitle || `Chương ${item.moduleIndex + 1}`}
 </p>
 <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
 <span className="inline-flex items-center gap-1">
 <Clock className="h-3 w-3" /> {new Date(item.createdAt).toLocaleDateString("vi-VN")}
 </span>
 <span>{item.correctCount}/{item.totalQuestions} đúng ({item.accuracyPercent}%)</span>
 <span>ELO {item.abilityEnd.toFixed(1)}</span>
 {item.skippedCount > 0 && (
 <span className="">Đã vượt {item.skippedCount} bài</span>
 )}
 </div>
 </div>
 <div className="flex items-center gap-2">
 <Badge variant="secondary" className={`text-xs font-bold ${
 item.passed ?"" : item.partialPass ?"" :""
 }`}>
 {item.passed ?"Đạt" : item.partialPass ?"1 phần" :"Chưa đạt"}
 </Badge>
 <ChevronDown className={`h-4 w-4 transition ${expandedId === item.id ?"rotate-180" :""}`} />
 </div>
 </div>
 </Button>

 {/* Expanded detail */}
 {expandedId === item.id && detail && (
 <div className="mt-2 animate-slide-up rounded-xl border border-border bg-card p-5">
 <div className="grid grid-cols-3 gap-3 text-center text-sm">
 <div className="rounded-lg bg-muted/40 p-3">
 <p className="text-xs">Năng lực</p>
 <p className="mt-0.5 font-bold dark:text-foreground">{detail.abilityStart} → {detail.abilityEnd.toFixed(1)}</p>
 </div>
 <div className="rounded-lg bg-muted/40 p-3">
 <p className="text-xs">Độ chính xác</p>
 <p className="mt-0.5 font-bold dark:text-foreground">{detail.accuracyPercent}%</p>
 </div>
 <div className="rounded-lg bg-muted/40 p-3">
 <p className="text-xs">Bài đã vượt</p>
 <p className="mt-0.5 font-bold">{detail.skippedCount}</p>
 </div>
 </div>

 {/* Lesson breakdown */}
 {Object.keys(detail.lessonBreakdown).length > 0 && (
 <div className="mt-4">
 <p className="mb-2 text-xs font-semibold uppercase">Kết quả từng bài</p>
 <div className="space-y-1">
 {Object.entries(detail.lessonBreakdown).map(([lid, perf]) => (
 <div key={lid} className="flex items-center gap-2 text-sm">
 {perf.percent >= 60 ? (
 <CheckCircle2 className="h-4 w-4" />
 ) : (
 <XCircle className="h-4 w-4" />
 )}
 <span className="flex-1">{lessonMap.get(lid) || lid}</span>
 <span className="tabular-nums font-semibold">{perf.correct}/{perf.total} ({perf.percent}%)</span>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Answer review — full accordion */}
 {detail.answers.length > 0 && (
 <div className="mt-4">
 <p className="mb-2 text-xs font-semibold uppercase">Xem lại từng câu</p>
 <div className="space-y-2">
 {detail.answers.map((a, i) => (
 <div key={i} className={`rounded-xl border transition-all duration-200 ${a.isCorrect ?" " :" "}`}>
 <button
 onClick={() => setExpandedDetailIdx((prev) => (prev === i ? null : i))}
 className="flex w-full items-center gap-3 px-4 py-3 text-left"
 >
 <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${a.isCorrect ?" " :" "}`}>
 {a.isCorrect ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
 </span>
 <span className="flex-1 min-w-0 text-sm font-medium dark:text-foreground">
 <span className="">Câu {i + 1}.</span>{""}
 <MdInline content={a.question || `Câu ${i + 1}`} />
 </span>
 <div className="flex items-center gap-2 text-xs">
 <span>Độ khó {a.difficulty}/5</span>
 <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${expandedDetailIdx === i ?"rotate-180" :""}`} />
 </div>
 </button>
 {expandedDetailIdx === i && (
 <div className="animate-slide-up border-t px-4 pb-4 pt-3">
 <div className="pl-10 space-y-2">
 {a.options && a.options.length > 0 && (
 <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
 {a.options.map((opt: string, oi: number) => {
 const isCorrectOpt = oi === a.correctIndex;
 const isSelected = oi === a.selectedIndex;
 let cls =" bg-card dark:bg-transparent ";
 if (isCorrectOpt) cls =" bg-emerald-500/10 dark:bg-emerald-950/30 ";
 else if (isSelected && !a.isCorrect) cls =" bg-red-500/10 dark:bg-red-950/30 ";
 return (
 <div key={oi} className={`flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs ${cls}`}>
 <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isCorrectOpt ? "bg-emerald-600 text-white dark:bg-emerald-500" : isSelected ? "bg-red-500 text-white" : "bg-muted text-muted-foreground"}`}>
 {String.fromCharCode(65 + oi)}
 </span>
 <span className="flex-1 min-w-0"><MdInline content={opt} /></span>
 {isCorrectOpt && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
 {isSelected && !isCorrectOpt && <XCircle className="h-3.5 w-3.5 shrink-0" />}
 </div>
 );
 })}
 </div>
 )}
 {!a.isCorrect && (
 <div className="flex items-start gap-2 text-sm">
 <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
 <div>
 <span className="text-xs font-semibold uppercase">Bạn chọn: </span>
 <span className=""><MdInline content={a.options?.[a.selectedIndex] ??"—"} /></span>
 </div>
 </div>
 )}
 <div className="flex items-start gap-2 text-sm">
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
 <div>
 <span className="text-xs font-semibold uppercase">Đáp án đúng: </span>
 <span className=""><MdInline content={a.options?.[a.correctIndex] ??"—"} /></span>
 </div>
 </div>
 {a.explanation && (
 <div className="mt-2 rounded-lg bg-primary/10 px-3 py-2 text-xs dark:bg-blue-950/30">
 <span className="font-semibold">💡 Giải thích: </span>
 <MdInline content={a.explanation} />
 </div>
 )}
 </div>
 </div>
 )}
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 )}
 </div>
 ))}
 </div>
 ))}

 {tab ==="quiz" && <QuizHistoryTab courseId={courseId} />}
 </div>
 );
}

function MdInline({ content }: { content: string }) {
 return (
 <ReactMarkdown
 remarkPlugins={[remarkGfm]}
 components={{
 p: ({ children }) => <>{children}</>,
 code({ children }) {
 return <code className="whitespace-pre-wrap rounded px-1 py-0.5 text-[0.8rem] font-mono">{children}</code>;
 },
 }}
 >
 {content}
 </ReactMarkdown>
 );
}

function QuizHistoryTab({ courseId }: { courseId: string }) {
 const navigate = useNavigate();
 const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);

 const { data: quizHistory = [], isLoading } = useQuery<LessonQuizHistory[]>({
 queryKey: ["quiz-history", courseId],
 queryFn: () => api.get(`/quizzes/history/${courseId}`).then((r) => r.data || []),
 enabled: !!courseId,
 });

 const { data: attemptDetail } = useQuery<any>({
 queryKey: ["quiz-attempt-detail", expandedAttemptId],
 queryFn: () => api.get(`/quizzes/attempt/${expandedAttemptId}`).then((r) => r.data),
 enabled: !!expandedAttemptId,
 });

 if (isLoading) {
 return (
 <div className="mt-6 space-y-3">
 {[1, 2, 3].map((i) => (
 <Skeleton key={i} className="h-20 w-full rounded-xl" />
 ))}
 </div>
 );
 }

 const lessonsWithAttempts = quizHistory.filter((l) => l.attempts.length > 0);

 if (lessonsWithAttempts.length === 0) {
 return (
 <div className="mt-8 rounded-2xl border border-dashed bg-card p-10 text-center">
 <ClipboardList className="mx-auto h-10 w-10" />
 <h3 className="mt-3 text-lg font-bold text-foreground">Chưa có lịch sử quiz</h3>
 <p className="mt-1 text-sm">
 Bạn chưa làm bài quiz nào. Học xong bài nào thì làm quiz bài đó nhé!
 </p>
 </div>
 );
 }

 return (
 <div className="mt-6 space-y-4">
 {lessonsWithAttempts.map((lesson) => (
 <div key={lesson.lessonId} className="rounded-2xl border border-border bg-card p-4">
 <div className="flex items-center gap-3 mb-3">
 <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${lesson.passed ?"" :""}`}>
 {lesson.passed ? <CheckCircle2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-bold dark:text-foreground truncate">{lesson.lessonTitle}</p>
 <p className="text-xs">Chương {lesson.moduleIndex + 1}: {lesson.moduleTitle}</p>
 </div>
 <div className="text-right">
 {lesson.bestPercent !== null && (
 <span className={`text-sm font-bold ${lesson.passed ?"" :""}`}>
 {lesson.bestPercent}%
 </span>
 )}
 <p className="text-xs">{lesson.attempts.length} lần làm</p>
 </div>
 </div>

 {/* Attempt timeline */}
 <div className="space-y-1.5">
 {lesson.attempts.slice(0, 5).map((a, i) => (
 <div key={a.id}>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => setExpandedAttemptId(expandedAttemptId === a.id ? null : a.id)}
 className={`flex w-full gap-2 text-xs text-left justify-start ${
 a.passed ?"bg-emerald-500/10 dark:bg-emerald-950/20" : i === 0 ?"bg-amber-500/10 dark:bg-amber-950/20" :"bg-muted/40 "
 }`}
 >
 {a.passed ? (
 <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
 ) : (
 <XCircle className="h-3.5 w-3.5 shrink-0" />
 )}
 <span className="flex-1 font-medium">
 Lần {lesson.attempts.length - i}: {a.score}/{a.totalQuestions} ({a.percent}%) {a.passed ?"— Đạt" :""}
 </span>
 <span className="">{new Date(a.createdAt).toLocaleDateString("vi-VN")}</span>
 <ChevronDown className={`h-3 w-3 shrink-0 transition ${expandedAttemptId === a.id ?"rotate-180" :""}`} />
 </Button>

 {/* Expanded detail */}
 {expandedAttemptId === a.id && attemptDetail && attemptDetail.id === a.id && (
 <div className="mt-1 animate-slide-up space-y-2 rounded-xl border border-border bg-card p-4">
 {/* Score summary */}
 <div className="mb-3 flex items-center gap-3 rounded-lg bg-muted/40 p-3">
 <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${attemptDetail.passed ?"" :""}`}>
 {attemptDetail.percent}%
 </div>
 <div>
 <p className="text-sm font-bold dark:text-foreground">
 {attemptDetail.score}/{attemptDetail.totalQuestions} câu đúng {attemptDetail.passed ?"— Đạt ✅" :"— Chưa đạt"}
 </p>
 <p className="text-xs">Cần {attemptDetail.passScore}% để đạt</p>
 </div>
 </div>

 {attemptDetail.details?.map((d: any, di: number) => (
 <div key={di} className={`rounded-xl border border-border p-3 text-sm ${d.isCorrect ?"bg-emerald-500/10 dark:bg-emerald-950/10" :"bg-red-500/10 dark:bg-red-950/10"}`}>
 <div className="flex items-start gap-2.5">
 <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${d.isCorrect ? "bg-emerald-600 text-white dark:bg-emerald-500" : "bg-red-500 text-white"}`}>
 {di + 1}
 </span>
 <div className="flex-1 min-w-0">
 <p className="font-semibold leading-relaxed dark:text-foreground">
 <MdInline content={d.question} />
 </p>

 {/* Options grid */}
 <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
 {d.options.map((opt: string, oi: number) => {
 const isCorrectOpt = oi === d.correctIndex;
 const isSelected = oi === d.selectedIndex;
 let cls =" bg-card dark:bg-transparent ";
 if (isCorrectOpt) cls =" bg-emerald-500/10 dark:bg-emerald-950/30 ";
 else if (isSelected && !d.isCorrect) cls =" bg-red-500/10 dark:bg-red-950/30 ";

 return (
 <div key={oi} className={`flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs ${cls}`}>
 <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isCorrectOpt ? "bg-emerald-600 text-white dark:bg-emerald-500" : isSelected ? "bg-red-500 text-white" : "bg-muted text-muted-foreground"}`}>
 {String.fromCharCode(65 + oi)}
 </span>
 <span className="flex-1 min-w-0"><MdInline content={opt} /></span>
 {isCorrectOpt && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
 {isSelected && !isCorrectOpt && <XCircle className="h-3.5 w-3.5 shrink-0" />}
 </div>
 );
 })}
 </div>

 {d.explanation && (
 <div className="mt-2 rounded-lg bg-primary/10 px-3 py-2 text-xs dark:bg-blue-950/30">
 <span className="font-semibold">💡 Giải thích: </span>
 <MdInline content={d.explanation} />
 </div>
 )}
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 ))}
 </div>

 <Button
 variant="outline"
 size="sm"
 onClick={() => navigate(`/lessons/${lesson.lessonId}/quiz`)}
 className="mt-3 w-full text-xs font-medium"
 >
 Làm lại quiz
 </Button>
 </div>
 ))}
 </div>
 );
}
