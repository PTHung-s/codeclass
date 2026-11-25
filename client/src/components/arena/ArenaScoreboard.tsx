import { useEffect, useState } from "react";
import { motion, AnimatePresence, animate } from "framer-motion";
import { ChevronRight, Trophy } from "lucide-react";
import { cn } from "../../lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import type { ArenaPlayer } from "../../lib/arenaTypes";

export const rankPill = (rank: number) =>
  rank === 1
    ? "bg-amber-400 text-amber-950"
    : rank === 2
      ? "bg-slate-300 text-slate-800"
      : rank === 3
        ? "bg-orange-500 text-orange-50"
        : "bg-slate-700 text-slate-300";

const rankRow = (rank: number) =>
  rank === 1
    ? "bg-amber-500/10 border-amber-500/30"
    : rank === 2
      ? "bg-slate-500/10 border-slate-500/30"
      : rank === 3
        ? "bg-orange-500/10 border-orange-500/30"
        : "border-transparent";

/** Animated count-up, used when a reveal bumps everyone's total at once. */
export function CountUp({ to, from, duration = 0.8 }: { to: number; from: number; duration?: number }) {
  const [val, setVal] = useState(from);
  useEffect(() => {
    const controls = animate(from, to, { duration, ease: "easeOut", onUpdate: (v) => setVal(Math.round(v)) });
    return () => controls.stop();
  }, [from, to, duration]);
  return <>{val}</>;
}

function Row({
  player,
  rank,
  reward,
  gain,
  showGain,
  displayScore,
}: {
  player: ArenaPlayer;
  rank: number;
  reward?: number;
  gain?: number;
  showGain?: boolean;
  displayScore: number;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs", rankRow(rank))}>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
          rankPill(rank),
        )}
      >
        {rank}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-slate-100">{player.fullName}</span>
      {showGain && (gain ?? 0) > 0 && (
        <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
          +{gain}
        </span>
      )}
      {reward ? <span className="text-[9px] text-amber-400">+{reward}🪙</span> : null}
      <span className="w-10 text-right font-bold tabular-nums text-blue-300">{displayScore}</span>
    </div>
  );
}

/**
 * One scoreboard for both arenas and every breakpoint.
 *
 * The old leaderboard was `hidden md:flex`, so on a phone — the device most
 * students actually play on — there was no way to see the score at all.
 */
export function ArenaScoreboard({
  players,
  tokenRewards,
  gainByUser,
  showGains,
}: {
  players: ArenaPlayer[];
  tokenRewards: number[];
  /** During reveal: points just earned, shown as a +N chip. */
  gainByUser?: Map<string, number>;
  showGains?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore);
  const top3 = sorted.slice(0, 3);

  const rows = sorted.map((p, i) => (
    <Row
      key={p.userId}
      player={p}
      rank={i + 1}
      reward={tokenRewards[i]}
      gain={gainByUser?.get(p.userId)}
      showGain={showGains}
      displayScore={p.totalScore}
    />
  ));

  return (
    <>
      {/* Mobile: a single strip of the podium places, tap to see everyone. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-2 overflow-hidden border-b border-slate-800 bg-[#0E1728] px-3 py-1.5 text-left lg:hidden"
      >
        <Trophy className="size-3.5 shrink-0 text-amber-400" />
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
          {top3.length === 0 && <span className="text-[11px] text-slate-500">Chưa có người chơi</span>}
          {top3.map((p, i) => (
            <span key={p.userId} className="flex shrink-0 items-center gap-1 text-[11px]">
              <span className={cn("flex size-4 items-center justify-center rounded-full text-[9px] font-bold", rankPill(i + 1))}>
                {i + 1}
              </span>
              <span className="max-w-[7rem] truncate font-medium text-slate-200">{p.fullName}</span>
              <span className="font-bold tabular-nums text-blue-300">{p.totalScore}</span>
            </span>
          ))}
        </div>
        <ChevronRight className="size-4 shrink-0 text-slate-500" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[75dvh] border-slate-800 bg-[#0E1728] text-slate-100">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-slate-100">
              <Trophy className="size-4 text-amber-400" /> Bảng xếp hạng
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 pb-6">
            {rows.length ? rows : <p className="text-xs text-slate-500">Chưa có người chơi.</p>}
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop rail */}
      <aside className="hidden min-h-0 flex-col gap-2 overflow-y-auto border-l border-slate-800 bg-[#0E1728] p-3 lg:flex">
        <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          <Trophy className="h-3 w-3" /> Bảng xếp hạng
        </p>
        {rows.length ? rows : <p className="text-[11px] text-slate-500">Chưa có người chơi.</p>}
      </aside>
    </>
  );
}

/**
 * Reveal-phase scoreboard: starts in the pre-question order, then flips to the
 * new order so framer-motion's `layout` slides each row to its new rank.
 */
export function ArenaScoreboardReveal({
  players,
  tokenRewards,
  gainByUser,
  flipKey,
}: {
  players: ArenaPlayer[];
  tokenRewards: number[];
  gainByUser: Map<string, number>;
  /** Question id — restarts the animation on each new reveal. */
  flipKey: string;
}) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    setRevealed(false);
    const t = setTimeout(() => setRevealed(true), 1300);
    return () => clearTimeout(t);
  }, [flipKey]);

  const before = (p: ArenaPlayer) => p.totalScore - (gainByUser.get(p.userId) || 0);
  const ordered = [...players].sort((a, b) =>
    revealed ? b.totalScore - a.totalScore : before(b) - before(a),
  );

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        <Trophy className="h-3 w-3" /> Bảng xếp hạng {revealed ? "(mới)" : "(trước câu này)"}
      </p>
      <AnimatePresence>
        {ordered.map((p, idx) => {
          const rank = idx + 1;
          const gain = gainByUser.get(p.userId) || 0;
          return (
            <motion.div
              key={p.userId}
              layout
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm", rankRow(rank))}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  rankPill(rank),
                )}
              >
                {rank}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{p.fullName}</span>
              <AnimatePresence>
                {revealed && gain > 0 && (
                  <motion.span
                    key={`gain-${p.userId}`}
                    initial={{ scale: 0, opacity: 0, x: 10 }}
                    animate={{ scale: 1, opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 18 }}
                    className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300"
                  >
                    +{gain}
                  </motion.span>
                )}
              </AnimatePresence>
              {revealed && tokenRewards[rank - 1] ? (
                <span className="text-[10px] text-amber-400">+{tokenRewards[rank - 1]}🪙</span>
              ) : null}
              <span className="w-12 text-right font-black tabular-nums text-blue-300">
                {revealed ? <CountUp from={before(p)} to={p.totalScore} /> : before(p)}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
