import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Flag, SkipForward } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import type { ArenaPhase } from "../../lib/arenaTypes";

/**
 * The dark full-bleed frame every arena phase renders inside.
 *
 * `-m-4 md:-m-6` cancels the padding `<main>` applies in Layout.tsx. Without it,
 * `h-[calc(100dvh-4rem)]` makes this taller than its container by exactly that
 * padding, which is what produced two nested scrollbars and clipped the bottom
 * of the match. Every other full-height page in the app does the same thing
 * (CodeLab, ChatPage, HelpDetail) — this is the house pattern, not a hack.
 *
 * Nothing inside may grow the shell: children live in `min-h-0` flex children
 * and scroll themselves.
 */
export function ArenaShell({
  title,
  icon,
  subtitle,
  backTo,
  connected,
  phase,
  remainingSeconds,
  secondsPerQuestion,
  onSkip,
  skipping,
  onEnd,
  showHostControls,
  /** Right rail / mobile bottom strip. Caller decides what goes here per phase:
   *  the brief during the question, the leaderboard during the reveal, etc. */
  rightPanel,
  children,
}: {
  title: string;
  icon: ReactNode;
  subtitle: ReactNode;
  backTo: string;
  connected: boolean;
  phase: ArenaPhase;
  remainingSeconds: number;
  secondsPerQuestion: number;
  onSkip?: () => void;
  skipping?: boolean;
  onEnd?: () => void;
  showHostControls?: boolean;
  rightPanel?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const timed = phase === "question" || phase === "countdown" || phase === "reveal";
  const danger = timed && remainingSeconds <= 10 && phase !== "reveal";

  // Time as a shrinking bar, not just a number — peripheral vision picks it up
  // while your eyes are on the code.
  const total = phase === "question" ? secondsPerQuestion : Math.max(remainingSeconds, 1);
  const pct = timed ? Math.max(0, Math.min(100, (remainingSeconds / Math.max(total, 1)) * 100)) : 0;

  return (
    <div className="-m-4 flex h-[calc(100dvh-4rem)] flex-col overflow-hidden bg-[#0B1220] text-slate-100 md:-m-6">
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-800 bg-[#0E1728] px-2 py-2 sm:px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navigate(backTo)}
          aria-label="Quay lại"
          className="text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold leading-tight">
            {icon} {title}
          </p>
          <p className="truncate text-[11px] text-slate-400">{subtitle}</p>
        </div>

        {timed && (
          <>
            <div className="mx-1 h-6 w-px bg-slate-700" />
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold tabular-nums",
                danger
                  ? "bg-red-500/20 text-red-300"
                  : phase === "reveal"
                    ? "bg-sky-500/15 text-sky-300"
                    : "bg-blue-500/20 text-blue-200",
              )}
            >
              <Clock className="h-3 w-3" />
              {phase === "reveal"
                ? `Đáp án ${remainingSeconds}s`
                : `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`}
            </span>
          </>
        )}

        <div className="flex-1" />

        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold",
            connected ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/20 text-red-300",
          )}
        >
          <span className={cn("size-1.5 rounded-full", connected ? "bg-emerald-400" : "bg-red-400")} />
          <span className="hidden sm:inline">{connected ? "Live" : "Mất kết nối"}</span>
        </span>

        {showHostControls && (
          <>
            {onSkip && (
              <Button
                variant="outline"
                size="sm"
                onClick={onSkip}
                disabled={skipping}
                className="gap-1 border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white"
              >
                <SkipForward className="h-4 w-4" />
                <span className="hidden sm:inline">Bỏ qua</span>
              </Button>
            )}
            {onEnd && (
              <Button variant="destructive" size="sm" onClick={onEnd} className="gap-1">
                <Flag className="h-4 w-4" />
                <span className="hidden sm:inline">Kết thúc</span>
              </Button>
            )}
          </>
        )}
      </header>

      {/* Time bar: thin, always in the same place, red in the final stretch. */}
      <div className="h-0.5 shrink-0 bg-slate-800">
        {timed && (
          <div
            className={cn(
              "h-full transition-[width] duration-1000 ease-linear",
              danger ? "bg-red-500" : phase === "reveal" ? "bg-sky-400" : "bg-blue-500",
            )}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>

      {/*
        Mobile: one column, the scoreboard hoists itself above the work area with
        `order-first`. Desktop: work area + a fixed 18rem rail. Both children are
        `min-h-0` so their own scrollers run instead of stretching the shell.
      */}
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        {rightPanel}
      </div>
    </div>
  );
}
