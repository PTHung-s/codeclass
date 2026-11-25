import { cn } from "../../lib/utils";

/**
 * Code with clickable line numbers — the "spot the bug" half of a debug question,
 * and the same widget in reveal mode on the reveal/review screens.
 *
 * Two modes:
 *  - play (`revealBuggy` undefined): clicking a line toggles it amber.
 *  - reveal (`revealBuggy` given): the real buggy lines go red, whatever the
 *    student picked goes amber, and clicking does nothing. Using one component
 *    for both is why the review page can show exactly what the match showed.
 */
export function CodeLines({
  code,
  highlighted,
  onToggle,
  disabled,
  revealBuggy,
  userPicks,
  className,
}: {
  code: string;
  highlighted: number[];
  onToggle?: (line: number) => void;
  disabled?: boolean;
  /** Reveal mode: the true buggy lines. */
  revealBuggy?: number[];
  /** Reveal mode: what this student highlighted. */
  userPicks?: number[];
  className?: string;
}) {
  const lines = code.split("\n");
  const revealMode = revealBuggy !== undefined;
  const highlightSet = new Set(highlighted);
  const buggySet = new Set(revealBuggy || []);
  const pickSet = new Set(userPicks || []);
  const locked = disabled || revealMode || !onToggle;

  return (
    <div
      className={cn(
        "min-h-0 overflow-auto rounded-xl border border-slate-800 bg-[#0B1220] font-mono text-[13.5px] leading-6 sm:text-[14px]",
        className,
      )}
    >
      <div className="min-w-max">
        {lines.map((line, i) => {
          const ln = i + 1;
          const isBuggy = buggySet.has(ln);
          const userPicked = pickSet.has(ln);
          let bg = locked ? "" : "hover:bg-slate-800/80";
          if (revealMode) {
            // A line that is both the real bug and the student's pick reads as a
            // hit: red wins, and the amber ring marks it as chosen.
            if (isBuggy) bg = userPicked ? "bg-red-500/35 ring-1 ring-inset ring-amber-400/70" : "bg-red-500/30";
            else if (userPicked) bg = "bg-amber-500/20";
          } else if (highlightSet.has(ln)) {
            bg = "bg-amber-500/30 hover:bg-amber-500/40";
          }
          return (
            <div
              key={i}
              className="grid min-w-max grid-cols-[2.75rem_max-content] border-b border-slate-800/55 last:border-b-0"
            >
              <span className="w-[2.75rem] shrink-0 select-none border-r border-slate-800 bg-slate-950/55 pr-2.5 text-right text-slate-500">
                {ln}
              </span>
              <button
                type="button"
                disabled={locked}
                onClick={() => !locked && onToggle?.(ln)}
                aria-pressed={!revealMode ? highlightSet.has(ln) : undefined}
                className={cn(
                  "whitespace-pre px-3 py-1 text-left text-slate-100 transition-colors sm:px-4",
                  locked ? "cursor-default" : "cursor-pointer",
                  bg,
                )}
              >
                <span
                  className={cn(
                    highlightSet.has(ln) && !revealMode && "rounded bg-amber-300/15 px-0.5 text-amber-50",
                  )}
                >
                  {line || " "}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The legend that makes the red/amber colours mean something. */
export function CodeLinesLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 text-[11px] text-slate-400", className)}>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-red-500/60" /> Dòng lỗi thật
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-amber-500/50" /> Dòng học sinh tô
      </span>
    </div>
  );
}
