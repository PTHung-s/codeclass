import { useEffect, useRef, useMemo } from "react";
import { Loader2, CheckCircle2, TrendingUp } from "lucide-react";
import { fireACConfetti } from "../../lib/confetti";
import { cn } from "../../lib/utils";

const verdictColor: Record<string, string> = {
  AC: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  WA: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400",
  TLE: "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-400",
  RE: "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-400",
  CE: "border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-400",
};

const verdictLabel: Record<string, string> = {
  AC: "AC",
  WA: "WA",
  TLE: "TLE",
  RE: "RE",
  CE: "CE",
};

interface Props {
  results: Record<string, any>; // { [submissionId]: {userId, verdict, score, passedTests, totalTests} }
  total: number;
  players: { userId: string; fullName: string; totalScore?: number }[];
}

export function CodeDuelJudging({ results, total, players }: Props) {
  const entries = Object.values(results || {});

  // Fire celebratory confetti when an AC result arrives.
  const seen = useRef<Set<string>>(new Set());
  const acCount = entries.filter((r) => r.verdict === "AC").length;
  useEffect(() => {
    for (const r of entries) {
      if (r.verdict === "AC" && !seen.current.has(r.submissionId || r.userId)) {
        seen.current.add(r.submissionId || r.userId);
        fireACConfetti();
      }
    }
  }, [acCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = total > 0 && entries.length >= total;
  const progressPct = total > 0 ? Math.round((entries.length / total) * 100) : entries.length > 0 ? 100 : 0;

  // Realtime dynamic leaderboard during judging:
  // Base totalScore + live round score
  const liveLeaderboard = useMemo(() => {
    const scoreMap = new Map<
      string,
      { currentScore: number; verdict?: string; passedTests?: number; totalTests?: number }
    >();
    for (const r of entries) {
      scoreMap.set(r.userId, {
        currentScore: r.score || 0,
        verdict: r.verdict,
        passedTests: r.passedTests,
        totalTests: r.totalTests,
      });
    }

    return [...players]
      .map((p) => {
        const live = scoreMap.get(p.userId);
        const roundScore = live ? live.currentScore : 0;
        const totalLiveScore = (p.totalScore || 0) + roundScore;
        return {
          userId: p.userId,
          fullName: p.fullName,
          roundScore,
          totalLiveScore,
          verdict: live?.verdict,
          passedTests: live?.passedTests,
          totalTests: live?.totalTests,
          isJudged: !!live,
        };
      })
      .sort((a, b) => b.totalLiveScore - a.totalLiveScore || b.roundScore - a.roundScore);
  }, [players, entries]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 py-6">
      {/* Header / progress */}
      <div className="w-full max-w-xl text-center">
        <div className="flex items-center justify-center gap-3">
          {done ? (
            <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          )}
          <p className="text-xl font-bold tracking-tight text-foreground">
            {done ? "Chấm xong! Chuẩn bị công bố kết quả…" : "Hệ thống đang chấm bài theo hàng đợi…"}
          </p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {done
            ? `${entries.length} bài đã chấm xong. Đang cập nhật bảng xếp hạng.`
            : `Đang chấm ${entries.length} / ${total || players.length} bài nộp. Bảng xếp hạng bên dưới thay đổi trực tiếp.`}
        </p>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              done ? "bg-emerald-500" : "bg-primary",
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="mt-1.5 font-mono text-sm font-semibold tabular-nums text-foreground">
          {entries.length} / {total || players.length} đã chấm
          {acCount > 0 && (
            <span className="ml-3 font-bold text-emerald-600 dark:text-emerald-400">· {acCount} AC 🎉</span>
          )}
        </p>
      </div>

      {/* Realtime Live Dynamic Leaderboard */}
      <div className="w-full max-w-3xl space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <TrendingUp className={cn("h-4 w-4 text-primary", !done && "animate-pulse")} /> Bảng xếp hạng
            Realtime (Đang chấm)
          </h3>
          <span className="font-mono text-xs text-muted-foreground">Thứ hạng cập nhật liên tục</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="divide-y divide-border">
            {liveLeaderboard.map((p, idx) => {
              const rank = idx + 1;
              return (
                <div
                  key={p.userId}
                  className={cn(
                    "duel-card-in flex items-center justify-between gap-3 p-3 transition-all duration-500",
                    p.isJudged ? "bg-card" : "bg-muted/20 opacity-70",
                  )}
                  style={{ animationDelay: `${Math.min(idx, 8) * 35}ms` }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-bold",
                        rank === 1
                          ? "bg-amber-400 text-amber-950 shadow-sm"
                          : rank === 2
                            ? "bg-slate-300 text-slate-800 dark:bg-slate-500 dark:text-white"
                            : rank === 3
                              ? "bg-amber-700 text-white"
                              : "bg-muted text-muted-foreground",
                      )}
                    >
                      {rank}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{p.fullName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.isJudged ? (
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            Đã chấm: +{p.roundScore} điểm vòng này ({p.passedTests}/{p.totalTests} test)
                          </span>
                        ) : (
                          <span className="font-mono italic text-amber-500">Đang chờ chấm…</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {p.verdict ? (
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs font-bold",
                          verdictColor[p.verdict] || "border-border bg-muted text-foreground",
                        )}
                      >
                        {verdictLabel[p.verdict] || p.verdict}
                      </span>
                    ) : null}
                    <div className="text-right">
                      <span className="font-mono text-base font-bold tabular-nums text-primary">
                        {p.totalLiveScore}
                      </span>
                      <span className="ml-1 text-[10px] text-muted-foreground">điểm</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
