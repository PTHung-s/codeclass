import Editor from "@monaco-editor/react";
import { motion } from "framer-motion";
import { SkipForward } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { CodeLines, CodeLinesLegend } from "../CodeLines";
import { ArenaScoreboardReveal } from "../ArenaScoreboard";
import { ARENA_READONLY_OPTIONS, configureArenaEditor, langOf } from "../arenaMonaco";
import type { ArenaState } from "../../../lib/arenaTypes";

/**
 * Answer screen for a debug question.
 *
 * Every debug question has exactly one bug — the server generates them that way
 * and `submitAnswer` always records `decision: "bug"`. So there is no "was there
 * a bug?" verdict to render; what a student needs is *which line* and *what the
 * fix looks like*, side by side with their own attempt.
 */
export function DebugReveal({
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
  const r = state.reveal;
  if (!r) return <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Đang tải đáp án...</div>;
  const q = r.question;
  const mine = r.results.find((res) => res.userId === viewerId);
  const gainByUser = new Map(r.results.map((res) => [res.userId, res.score]));
  const isLast = state.match.currentQuestionIndex + 1 >= state.match.questionCount;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-3 px-3 py-3 sm:px-4">
        <motion.div
          initial={{ scale: 0.97, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="space-y-3 rounded-2xl border border-red-500/30 bg-[#0E1728] p-3 sm:p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-slate-50">{q.title}</h2>
            <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-300">
              🔴 Dòng lỗi: {q.buggyLineNumbers.length ? q.buggyLineNumbers.join(", ") : "—"}
            </span>
          </div>
          {q.bugDescription && (
            <div className="rounded-lg bg-red-500/10 p-2.5 text-xs text-red-200">
              <b>Lỗi:</b> {q.bugDescription}
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-red-300">Code lỗi</p>
              <CodeLines
                code={q.shownCode}
                highlighted={[]}
                disabled
                revealBuggy={q.buggyLineNumbers}
                userPicks={mine?.highlightedLines}
                className="max-h-[46vh]"
              />
              <CodeLinesLegend />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-emerald-300">Code đúng (đáp án)</p>
              <div className="overflow-hidden rounded-xl border border-slate-800">
                <Editor
                  height="min(46vh, 420px)"
                  language={langOf(q.language)}
                  beforeMount={configureArenaEditor}
                  theme="codeclass-arena"
                  value={q.correctCode}
                  options={ARENA_READONLY_OPTIONS}
                />
              </div>
            </div>
          </div>

          {/* Viewer's Own Submitted Fix Review */}
          {mine?.submittedCode && (
            <details className="mt-3 rounded-xl border border-white/10 bg-black/40 p-3">
              <summary className="cursor-pointer text-xs font-bold text-slate-300 hover:text-white flex items-center justify-between">
                <span>Code bạn đã sửa và nộp {mine.fixed ? "✓ (Đúng)" : "✗ (Chưa đúng)"}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${mine.fixed ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                  {mine.fixed ? "+60 điểm sửa code" : "0 điểm sửa code"}
                </span>
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950 p-2.5 font-mono text-xs text-slate-200">
                {mine.submittedCode}
              </pre>
            </details>
          )}
        </motion.div>

        <div className="rounded-2xl border border-slate-800 bg-[#0E1728] p-3">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">Kết quả từng người</p>
          {r.results.length === 0 && <p className="text-xs text-slate-500">Không ai trả lời câu này.</p>}
          {r.results.map((res) => (
            <ResultRow key={res.userId} res={res} isMe={res.userId === viewerId} />
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

/** One player's two independent outcomes, plus the time bonus baked into the score. */
export function ResultRow({
  res,
  isMe,
}: {
  res: NonNullable<ArenaState["reveal"]>["results"][number];
  isMe?: boolean;
}) {
  const picked = (res.highlightedLines?.length || 0) > 0;
  const attempted = res.identified || res.fixed || picked || res.score > 0;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
        isMe && "bg-blue-500/10 ring-1 ring-inset ring-blue-500/30",
      )}
    >
      <span className="min-w-0 flex-1 truncate font-medium text-slate-200">
        {res.fullName}
        {isMe && <span className="ml-1 text-[10px] text-blue-300">(bạn)</span>}
      </span>
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
          res.identified
            ? "bg-amber-500/15 text-amber-300"
            : picked
              ? "bg-red-500/10 text-red-300"
              : "bg-slate-800 text-slate-500",
        )}
      >
        {res.identified ? "🎯 Tô trúng" : picked ? "Tô trượt" : "—"}
      </span>
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
          res.fixed
            ? "bg-emerald-500/15 text-emerald-300"
            : attempted
              ? "bg-red-500/10 text-red-300"
              : "bg-slate-800 text-slate-500",
        )}
      >
        {res.fixed ? "🔧 Sửa OK" : "—"}
      </span>
      <span className={cn("w-16 text-right font-bold tabular-nums", res.score > 0 ? "text-blue-300" : "text-slate-500")}>
        {res.score > 0 ? `+${res.score}` : "0"}
        {res.timeBonus > 0 && <span className="ml-0.5 text-[10px] text-amber-400">(+{res.timeBonus}⏱)</span>}
      </span>
    </div>
  );
}
