import { useState } from"react";
import { Navigate, useNavigate, useParams } from"react-router-dom";
import { useQuery } from"@tanstack/react-query";
import Editor from"@monaco-editor/react";
import { ArrowLeft, Bug, Trophy } from"lucide-react";
import api from"../../lib/api";
import { cn } from"../../lib/utils";
import { Button } from"../../components/ui/button";
import { ArenaMarkdown } from"../../components/arena/ArenaMarkdown";
import { CodeLines, CodeLinesLegend } from"../../components/arena/CodeLines";
import { ARENA_READONLY_OPTIONS, configureArenaEditor, langLabel, langOf } from"../../components/arena/arenaMonaco";
import { rankPill } from"../../components/arena/ArenaScoreboard";
import { useAuthContext } from"../../contexts/AuthContext";
import type { ArenaReviewAnswer, ArenaReviewData, ArenaReviewQuestion } from"../../lib/arenaTypes";

const panel ="rounded-2xl border bg-[#0E1728] p-3 sm:p-4";

/**
 * Post-match review for a debug arena.
 *
 * This page used to render a scoring model that no longer exists: a"Chọn Đúng /
 * Chọn Sai" verdict and a"🟢 Đúng (không bug)" badge. `submitAnswer` always
 * records `decision:"bug"` and every generated question has exactly one bug, so
 * those branches were unreachable — and the two things a student actually needs
 * (which line was wrong, and which line they picked) were never shown at all.
 * Now it replays the match's own reveal: real bug lines in red, that student's
 * picks in amber, next to the correct code.
 */
export default function ArenaReview() {
 const { id } = useParams<{ id: string }>();
 const navigate = useNavigate();

 const { data, isLoading } = useQuery<ArenaReviewData>({
 queryKey: ["arena-review", id],
 queryFn: () => api.get(`/arenas/${id}/review`).then((r) => r.data),
 enabled: !!id,
 });

 if (isLoading) {
 return (
 <div className="flex h-64 flex-col items-center justify-center gap-3">
 <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-blue-600" />
 <p className="text-sm text-muted-foreground">Đang tải...</p>
 </div>
 );
 }

 if (!data) {
 return (
 <div className="flex h-64 flex-col items-center justify-center gap-3">
 <p className="text-sm">Không tìm thấy trận này.</p>
 <Button variant="outline" size="sm" onClick={() => navigate("/arena/history")} className="gap-1">
 <ArrowLeft className="h-4 w-4" /> Quay lại
 </Button>
 </div>
 );
 }

 // Opening a quiz match at /arena/:id/review used to render debug-only markup
 // (buggy lines, correct code) against a question that has none of it.
 if (data.match.arenaType ==="quiz") return <Navigate to={`/quiz-arena/${id}/review`} replace />;

 const ranked = [...data.players].sort((a, b) => (a.finalRank || 99) - (b.finalRank || 99));

 return (
 <div className="-m-4 min-h-[calc(100dvh-4rem)] bg-[#0B1220] p-4 md:-m-6 md:p-6">
 <div className="mx-auto max-w-5xl space-y-4">
 <Button
 variant="ghost"
 onClick={() => navigate("/arena/history")}
 className="gap-1 hover:text-white"
 >
 <ArrowLeft className="h-4 w-4" /> Quay lại lịch sử
 </Button>

 <div>
 <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-50">
 <Bug className="h-5 w-5" /> {data.match.title}
 </h1>
 <p className="text-sm">
 {data.match.mode ==="practice" ?"Luyện tập" :"Thi đấu"} · {data.questions.length} câu ·{""}
 {new Date(data.match.createdAt).toLocaleString("vi-VN")}
 </p>
 </div>

 <div className={panel}>
 <p className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide">
 <Trophy className="h-3 w-3" /> Bảng xếp hạng chung cuộc
 </p>
 {ranked.length === 0 && <p className="text-xs">Không có người chơi.</p>}
 {ranked.map((p) => (
 <div key={p.userId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs">
 <span
 className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
 rankPill(p.finalRank || 99),
 )}
 >
 {p.finalRank ||"-"}
 </span>
 <span className="min-w-0 flex-1 truncate font-medium">{p.fullName}</span>
 <span className="font-bold tabular-nums">{p.totalScore}đ</span>
 </div>
 ))}
 </div>

 {data.questions.map((q, index) => (
 <QuestionCard key={q.id} q={q} index={index} />
 ))}
 </div>
 </div>
 );
}

/**
 * One question. Picking a name in the results table swaps whose highlighted
 * lines are overlaid on the buggy code — the same widget the live reveal uses,
 * so what a student sees here matches what they saw in the match.
 */
function QuestionCard({ q, index }: { q: ArenaReviewQuestion; index: number }) {
 const { user } = useAuthContext();
 const mine = q.answers.find((a) => a.userId === user?.id);
 const [focusId, setFocusId] = useState<string | null>(mine?.userId || q.answers[0]?.userId || null);
 const focus = q.answers.find((a) => a.userId === focusId);

 return (
 <div className={cn(panel,"space-y-3")}>
 <div className="flex flex-wrap items-center justify-between gap-2">
 <h3 className="text-sm font-bold text-slate-50">
 Câu {index + 1}: {q.title}
 </h3>
 <div className="flex items-center gap-1.5">
 <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider">
 {langLabel(q.language)}
 </span>
 <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300">
 🔴 Dòng lỗi: {q.buggyLineNumbers.length ? q.buggyLineNumbers.join(",") :"—"}
 </span>
 </div>
 </div>

 <ArenaMarkdown content={q.statement} className="text-sm" />

 <div className="grid gap-2 text-xs sm:grid-cols-2">
 <div className="rounded-lg border border-border p-2">
 <p className="font-bold">Input</p>
 <pre className="mt-1 whitespace-pre-wrap font-mono">{q.input ||"(trống)"}</pre>
 </div>
 <div className="rounded-lg border border-border p-2">
 <p className="font-bold">Output mong đợi</p>
 <pre className="mt-1 whitespace-pre-wrap font-mono">{q.expectedOutput ||"(trống)"}</pre>
 </div>
 </div>

 {q.bugDescription && (
 <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs text-amber-200">
 <b>Lỗi:</b> {q.bugDescription}
 </div>
 )}

 <div className="grid gap-3 lg:grid-cols-2">
 <div className="space-y-1.5">
 <p className="text-xs font-bold">
 Code lỗi{focus && <span className="ml-1 font-normal">· dòng {focus.fullName} đã tô</span>}
 </p>
 <CodeLines
 code={q.shownCode}
 highlighted={[]}
 disabled
 revealBuggy={q.buggyLineNumbers}
 userPicks={focus?.highlightedLines}
 className="max-h-[40vh]"
 />
 <CodeLinesLegend />
 </div>
 <div className="space-y-1.5">
 <p className="text-xs font-bold">Code đúng (đáp án)</p>
 <div className="overflow-hidden rounded-xl border">
 <Editor
 height="min(40vh, 360px)"
 language={langOf(q.language)}
 beforeMount={configureArenaEditor}
 theme="codeclass-arena"
 value={q.correctCode}
 options={ARENA_READONLY_OPTIONS}
 />
 </div>
 </div>
 </div>

 <div>
 <p className="mb-1 text-xs font-bold uppercase tracking-wide">
 Kết quả từng người {q.answers.length > 1 && <span className="font-normal">· bấm để xem dòng họ đã tô</span>}
 </p>
 {q.answers.length === 0 && <p className="text-xs">Không ai trả lời câu này.</p>}
 <div className="space-y-1">
 {q.answers.map((a) => (
 <AnswerRow
 key={a.userId}
 a={a}
 isMe={a.userId === user?.id}
 active={a.userId === focusId}
 onSelect={() => setFocusId(a.userId)}
 />
 ))}
 </div>
 </div>

 {focus?.submittedCode && (
 <div className="space-y-1.5">
 <p className="text-xs font-bold">Code {focus.fullName} đã nộp</p>
 <div className="overflow-hidden rounded-xl border">
 <Editor
 height="240px"
 language={langOf(q.language)}
 beforeMount={configureArenaEditor}
 theme="codeclass-arena"
 value={focus.submittedCode}
 options={ARENA_READONLY_OPTIONS}
 />
 </div>
 </div>
 )}
 </div>
 );
}

/** Two independent outcomes per student — spotting the line, and fixing the code. */
function AnswerRow({
 a,
 isMe,
 active,
 onSelect,
}: {
 a: ArenaReviewAnswer;
 isMe: boolean;
 active: boolean;
 onSelect: () => void;
}) {
 const picked = a.highlightedLines.length > 0;
 const attempted = a.identified || a.fixed || picked || a.score > 0;
 return (
 <button
 type="button"
 onClick={onSelect}
 className={cn("flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition",
 active ?"border-primary/50 bg-primary/10" :"border-transparent hover:bg-white/5",
 )}
 >
 <span className="min-w-0 flex-1 truncate font-medium">
 {a.fullName}
 {isMe && <span className="ml-1 text-[10px] text-primary">(bạn)</span>}
 </span>
 <span
 className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
 a.identified
 ?"bg-emerald-500/15 text-emerald-300"
 : picked
 ?"bg-rose-500/10 text-rose-300"
 :"text-slate-400",
 )}
 >
 {a.identified ?"🎯 Tô trúng" : picked ?"Tô trượt" :"—"}
 </span>
 <span
 className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
 a.fixed
 ?"bg-emerald-500/15 text-emerald-300"
 : attempted
 ?"bg-amber-500/10 text-amber-300"
 :"text-slate-400",
 )}
 >
 {a.fixed ?"🔧 Sửa OK" :"—"}
 </span>
 <span
 className={cn("w-16 shrink-0 text-right font-bold tabular-nums",
 a.score > 0 ?"text-emerald-300" :"text-slate-400",
 )}
 >
 {a.score > 0 ? `+${a.score}` :"0"}
 {a.timeBonus > 0 && <span className="ml-0.5 text-[10px]">(+{a.timeBonus}⏱)</span>}
 </span>
 </button>
 );
}
