import { Navigate, useNavigate, useParams } from"react-router-dom";
import { useQuery } from"@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clock, Sparkles, Trophy } from"lucide-react";
import api from"../../lib/api";
import { cn } from"../../lib/utils";
import { Button } from"../../components/ui/button";
import { ArenaMarkdown } from"../../components/arena/ArenaMarkdown";
import { rankPill } from"../../components/arena/ArenaScoreboard";
import { LETTERS } from"../../components/arena/quiz/QuizQuestion";
import { useAuthContext } from"../../contexts/AuthContext";
import type { ArenaReviewData, ArenaReviewQuestion } from"../../lib/arenaTypes";

const panel ="rounded-2xl border bg-[#0E1728] p-3 sm:p-4";

/**
 * Post-match review for a quiz arena — the same page shape as the debug review,
 * with options + explanation where the debug one shows code.
 *
 * The old version was `@ts-nocheck`, declared its own copy of the payload type,
 * and had a full screen of unreachable JSX after an early `return` (both
 * branches rendered a leaderboard, so nobody noticed). It also pulled in
 * `components/arena/QuizArenaContent.tsx`, which is now deleted.
 */
export default function QuizArenaReview() {
 const { id } = useParams<{ id: string }>();
 const navigate = useNavigate();
 const back = () => navigate("/quiz-arena/history?type=quiz");

 const { data, isLoading } = useQuery<ArenaReviewData>({
 queryKey: ["quiz-arena-review", id],
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
 <Button variant="outline" size="sm" onClick={back} className="gap-1">
 <ArrowLeft className="h-4 w-4" /> Quay lại
 </Button>
 </div>
 );
 }

 // A debug match opened at /quiz-arena/:id/review has no options to render.
 if (data.match.arenaType !=="quiz") return <Navigate to={`/arena/${id}/review`} replace />;

 const ranked = [...data.players].sort((a, b) => (a.finalRank || 99) - (b.finalRank || 99));

 return (
 <div className="-m-4 min-h-[calc(100dvh-4rem)] bg-[#0B1220] p-4 md:-m-6 md:p-6">
 <div className="mx-auto max-w-4xl space-y-4">
 <Button variant="ghost" onClick={back} className="gap-1 hover:text-white">
 <ArrowLeft className="h-4 w-4" /> Quay lại lịch sử
 </Button>

 <div>
 <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-50">
 <Sparkles className="h-5 w-5" /> {data.match.title}
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

function QuestionCard({ q, index }: { q: ArenaReviewQuestion; index: number }) {
 const { user } = useAuthContext();
 const options = q.options || [];
 const mine = q.answers.find((a) => a.userId === user?.id);
 // Same distribution bar the live reveal shows — useful to a teacher rereading
 // the match to see which distractor actually pulled the class.
 const counts = options.map((_, i) => q.answers.filter((a) => a.selectedIndex === i).length);

 return (
 <div className={cn(panel,"space-y-3")}>
 <div className="flex flex-wrap items-center justify-between gap-2">
 <h3 className="text-sm font-bold text-slate-50">
 Câu {index + 1}: {q.title}
 </h3>
 <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold">
 Độ khó {Number(q.effectiveDifficulty || q.difficulty || 3).toFixed(2)} · {q.calibrationSamples || 0} lượt
 </span>
 </div>

 <ArenaMarkdown content={q.statement} className="text-sm" />

 <div className="grid gap-2">
 {options.map((option, i) => {
 const correct = i === q.correctIndex;
 const myPick = mine?.selectedIndex === i;
 return (
 <div
 key={i}
 className={cn("flex items-start gap-2.5 rounded-xl border p-2.5 text-sm",
 correct
 ?"border-emerald-500/50 bg-emerald-500/10"
 : myPick
 ?"border-rose-500/40 bg-rose-500/10"
 :"border-border",
 )}
 >
 <b className="shrink-0">{LETTERS[i]}.</b>
 <ArenaMarkdown content={option} className="flex-1" />
 {myPick && <span className="shrink-0 text-[10px] font-semibold">bạn chọn</span>}
 <span className="shrink-0 text-xs">{counts[i]} chọn</span>
 {correct && <CheckCircle2 className="size-4 shrink-0" />}
 </div>
 );
 })}
 </div>

 <div className="rounded-xl p-3 text-sm">
 <b className="">Giải thích:</b>
 <ArenaMarkdown content={q.explanation ||"Chưa có giải thích."} className="mt-1" />
 </div>

 <div>
 <p className="mb-1 text-xs font-bold uppercase tracking-wide">Kết quả từng người</p>
 {q.answers.length === 0 && <p className="text-xs">Không ai trả lời câu này.</p>}
 <div className="space-y-1">
 {q.answers.map((a) => (
 <div
 key={a.userId}
 className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
 a.userId === user?.id &&"bg-primary/10 ring-1 ring-inset ring-primary/30",
 )}
 >
 <span className={cn("size-2 shrink-0 rounded-full", a.isCorrect ?"bg-emerald-400" :"bg-rose-400")} />
 <span className="min-w-0 flex-1 truncate font-medium">
 {a.fullName}
 {a.userId === user?.id && <span className="ml-1 text-[10px] text-primary">(bạn)</span>}
 </span>
 <span className="shrink-0">
 {a.selectedIndex === null || a.selectedIndex === undefined ?"Không trả lời" : LETTERS[a.selectedIndex]}
 </span>
 <span className="shrink-0">
 <Clock className="mr-0.5 inline size-3" />
 {a.responseTimeMs ? `${Math.round(a.responseTimeMs / 1000)}s` :"—"}
 </span>
 <span
 className={cn("w-12 shrink-0 text-right font-bold tabular-nums",
 a.score > 0 ?"text-emerald-300" :"text-slate-400",
 )}
 >
 {a.score > 0 ? `+${a.score}` :"0"}
 </span>
 </div>
 ))}
 </div>
 </div>
 </div>
 );
}
