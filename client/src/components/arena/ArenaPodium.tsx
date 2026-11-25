import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { ArrowLeft, Crown, Trophy } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { rankPill } from "./ArenaScoreboard";
import type { ArenaState } from "../../lib/arenaTypes";

const HEIGHTS: Record<number, string> = { 1: "h-36", 2: "h-24", 3: "h-16" };

export function ArenaPodium({ state, onExit }: { state: ArenaState; onExit: () => void }) {
  const sorted = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
  const rewards = state.match.tokenRewards;
  const top3 = sorted.slice(0, 3);
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean); // 2nd, 1st, 3rd

  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (fired.current === state.match.id) return;
    fired.current = state.match.id;
    confetti({
      particleCount: 180,
      spread: 90,
      origin: { y: 0.5 },
      colors: ["#0066cc", "#f59e0b", "#10b981", "#3b82f6"],
      disableForReducedMotion: true,
    });
  }, [state.match.id]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <div className="text-center">
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <Trophy className="mx-auto h-14 w-14 text-amber-400" />
          </motion.div>
          <h1 className="mt-2 text-2xl font-black text-slate-50">Kết thúc! 🎉</h1>
          <p className="text-sm text-slate-400">{state.match.title}</p>
          {state.match.mode === "practice" && (
            <motion.p
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-1 text-sm font-bold text-blue-300"
            >
              ✨ +10 Kinh nghiệm ✨
            </motion.p>
          )}
        </div>

        {top3.length > 0 && (
          <div className="flex items-end justify-center gap-2">
            {podiumOrder.map((p) => {
              const rank = sorted.findIndex((x) => x.userId === p.userId) + 1;
              return (
                <div key={p.userId} className="flex w-24 flex-col items-center gap-1">
                  <Crown className={cn("h-5 w-5", rank === 1 ? "text-amber-400" : "opacity-0")} />
                  <div className="text-center">
                    <p className="truncate text-xs font-bold text-slate-100">{p.fullName}</p>
                    <p className="text-lg font-black tabular-nums text-blue-300">{p.totalScore}</p>
                    {rewards[rank - 1] ? <p className="text-[10px] text-amber-400">+{rewards[rank - 1]} 🪙</p> : null}
                  </div>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    className={cn(
                      "flex w-full items-start justify-center rounded-t-lg pt-1 text-2xl font-black",
                      HEIGHTS[rank] || "h-16",
                      rankPill(rank),
                    )}
                  >
                    {rank}
                  </motion.div>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-[#0E1728] p-3">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">Bảng xếp hạng tổng</p>
          {sorted.length === 0 && <p className="text-xs text-slate-500">Không có người chơi.</p>}
          {sorted.map((p, i) => {
            const rank = i + 1;
            return (
              <div key={p.userId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    rankPill(rank),
                  )}
                >
                  {rank}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-200">{p.fullName}</span>
                {rewards[rank - 1] ? (
                  <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                    +{rewards[rank - 1]} 🪙
                  </span>
                ) : null}
                <span className="w-12 text-right font-bold tabular-nums text-blue-300">{p.totalScore}</span>
              </div>
            );
          })}
        </div>

        <Button
          onClick={onExit}
          variant="outline"
          className="w-full gap-2 border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Về danh sách arena
        </Button>
      </div>
    </div>
  );
}
