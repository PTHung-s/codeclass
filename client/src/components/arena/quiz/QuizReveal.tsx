import { motion } from "framer-motion";
import { CheckCircle2, SkipForward } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { ArenaMarkdown } from "../ArenaMarkdown";
import { ArenaScoreboardReveal } from "../ArenaScoreboard";
import { LETTERS } from "./QuizQuestion";
import type { ArenaState } from "../../../lib/arenaTypes";

export function QuizReveal({
  state,
  isHost,
  onSkip,
  skipping,
  viewerId,
}: {
  state: ArenaState;
  isHost: boolean;
  onSkip: () => void;
  skipping: boolean;
  viewerId: string;
}) {
  const reveal = state.reveal;
  if (!reveal)
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Đang tải đáp án...</div>;
  const q = reveal.question;
  const options = q.options || [];
  const counts = options.map((_, index) => reveal.results.filter((r) => r.selectedIndex === index).length);
  const mine = reveal.results.find((r) => r.userId === viewerId);
  const gainByUser = new Map(reveal.results.map((r) => [r.userId, r.score]));
  const isLast = state.match.currentQuestionIndex + 1 >= state.match.questionCount;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-3 px-3 py-3 sm:px-4">
        <motion.div
          initial={{ scale: 0.97, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="space-y-3 rounded-2xl border border-emerald-500/30 bg-[#0E1728] p-3 sm:p-4"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-6 shrink-0 text-emerald-400" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Đáp án và phân tích</p>
              <h2 className="truncate text-base font-extrabold text-slate-50">{q.title}</h2>
            </div>
          </div>
          <ArenaMarkdown content={q.statement} className="text-slate-300" />
          <div className="grid gap-2">
            {options.map((option, index) => {
              const correct = index === q.correctIndex;
              const myPick = mine?.selectedIndex === index;
              return (
                <div
                  key={index}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border p-2.5 text-sm",
                    correct
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : myPick
                        ? "border-red-500/40 bg-red-500/10"
                        : "border-slate-800",
                  )}
                >
                  <b className="shrink-0 text-slate-300">{LETTERS[index]}.</b>
                  <ArenaMarkdown content={option} className="flex-1 text-slate-200" />
                  {myPick && <span className="shrink-0 text-[10px] font-semibold text-blue-300">bạn chọn</span>}
                  <span className="shrink-0 text-xs text-slate-500">{counts[index]} chọn</span>
                  {correct && (
                    <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                      Đúng
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="rounded-xl bg-slate-900/70 p-3 text-sm text-slate-300">
            <b className="text-slate-100">Giải thích:</b>
            <ArenaMarkdown content={q.explanation || "Chưa có giải thích."} className="mt-1" />
          </div>
        </motion.div>

        {reveal.difficulty && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-[#0E1728] p-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hiệu chỉnh độ khó</p>
              <p className="text-lg font-bold text-slate-100">
                {reveal.difficulty.before.toFixed(2)} <span className="text-blue-300">→</span>{" "}
                {reveal.difficulty.after.toFixed(2)}
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>{reveal.difficulty.samples} lượt hợp lệ</p>
              <p>
                Độ tin cậy {Math.round(reveal.difficulty.confidence * 100)}% · {reveal.difficulty.status}
              </p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-[#0E1728] p-3">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">Kết quả câu này</p>
          {reveal.results.length === 0 && <p className="text-xs text-slate-500">Không ai trả lời câu này.</p>}
          {reveal.results.map((result) => (
            <div
              key={result.userId}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
                result.userId === viewerId && "bg-blue-500/10 ring-1 ring-inset ring-blue-500/30",
              )}
            >
              <span className={cn("size-2 shrink-0 rounded-full", result.isCorrect ? "bg-emerald-400" : "bg-red-400")} />
              <span className="min-w-0 flex-1 truncate font-medium text-slate-200">{result.fullName}</span>
              <span className="text-slate-400">
                {result.selectedIndex === null || result.selectedIndex === undefined
                  ? "Không trả lời"
                  : LETTERS[result.selectedIndex]}
              </span>
              <span className="w-16 text-right font-bold tabular-nums text-blue-300">+{result.score}</span>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0E1728] p-3">
          <ArenaScoreboardReveal
            players={state.players}
            tokenRewards={state.match.tokenRewards}
            gainByUser={gainByUser}
            flipKey={q.id}
          />
        </div>

        {isHost ? (
          <Button onClick={onSkip} disabled={skipping} size="lg" className="w-full gap-2 bg-blue-600 hover:bg-blue-500">
            <SkipForward className="h-4 w-4" />
            {isLast ? "Xem kết quả chung cuộc →" : "Câu tiếp theo →"}
          </Button>
        ) : (
          <p className="text-center text-xs text-slate-500">Đợi host chuyển câu · còn {state.remainingSeconds}s</p>
        )}
      </div>
    </div>
  );
}
