import { ArenaMarkdown } from "../ArenaMarkdown";

/**
 * Question brief rendered in the right rail during the question phase.
 *
 * The teacher picks a chapter and the AI plays in that chapter; this panel
 * keeps the statement, input, and expected output visible while the player
 * reads the buggy code on the left. Always-open by design: the right rail
 * is fixed-width and the left is the only place to widen the code view.
 */
export function DebugBrief({
  question,
}: {
  question: { title: string; statement: string; input: string; expectedOutput: string };
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-slate-800 bg-[#0E1728]">
      <div className="border-b border-slate-800 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-300">Đề bài</p>
        <h3 className="mt-1 text-sm font-extrabold leading-snug text-slate-50">{question.title}</h3>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <ArenaMarkdown content={question.statement} className="text-sm leading-relaxed text-slate-300" />
        <div className="space-y-2 text-xs">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
            <p className="font-bold text-sky-300">Input</p>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-slate-300">{question.input || "(trống)"}</pre>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
            <p className="font-bold text-emerald-300">Output mong đợi</p>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-slate-300">
              {question.expectedOutput || "(trống)"}
            </pre>
          </div>
        </div>
      </div>
    </aside>
  );
}
