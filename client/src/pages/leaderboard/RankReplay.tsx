import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, ChevronDown, ChevronUp, TrendingUp, Zap, Flame, Code } from "lucide-react";
import api from "../../lib/api";
import StudentAvatar from "../../components/ui/StudentAvatar";
import { getLevelInfo } from "../../lib/levels";

interface HistoryData {
  snapshots: Record<string, Array<{
    userId: string;
    fullName: string;
    xp: number;
    rank: number;
    streak: number;
    problemCount: number;
  }>>;
  dates: string[];
  insights: {
    biggestClimber: { userId: string; fullName: string; rankGain: number; from: number; to: number } | null;
    highestXpGain: { userId: string; fullName: string; xpGain: number } | null;
    longestStreak: { userId: string; fullName: string; streak: number } | null;
    mostActive: { userId: string; fullName: string; problemGain: number } | null;
  };
}

export default function RankReplay() {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(2);
  const [currentIdx, setCurrentIdx] = useState(0);

  const { data, isLoading } = useQuery<HistoryData>({
    queryKey: ["leaderboard-history"],
    queryFn: () => api.get("/leaderboard/history").then((r) => r.data),
    enabled: expanded,
  });

  const dates = data?.dates || [];
  const snapshots = data?.snapshots || {};
  const currentDate = dates[currentIdx];
  const currentData = currentDate ? snapshots[currentDate]?.slice(0, 15) : [];
  const totalFrames = dates.length;

  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Auto-play
  useEffect(() => {
    if (!playing || !expanded) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setCurrentIdx((prev) => {
        if (prev >= totalFrames - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1000 / speed);
    return () => clearInterval(timerRef.current);
  }, [playing, speed, totalFrames, expanded]);

  const handlePlayPause = () => {
    if (currentIdx >= totalFrames - 1) setCurrentIdx(0);
    setPlaying(!playing);
  };

  const handlePrev = () => setCurrentIdx(Math.max(0, currentIdx - 1));
  const handleNext = () => {
    if (currentIdx >= totalFrames - 1) { setPlaying(false); return; }
    setCurrentIdx(currentIdx + 1);
  };

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaying(false);
    setCurrentIdx(parseInt(e.target.value));
  };

  const progress = totalFrames > 0 ? (currentIdx / (totalFrames - 1)) * 100 : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden dark:bg-gray-800 dark:border-gray-700">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 sm:px-5 py-4 flex items-center justify-between hover:bg-muted transition-colors"
      >
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 dark:text-white">
          📊 Rank Replay
        </h3>
        <span className="text-xs text-gray-400 flex items-center gap-1 dark:text-gray-500">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-4 sm:p-5 space-y-5 dark:border-gray-700">
          {isLoading ? (
            <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">Loading replay data...</div>
          ) : dates.length < 2 ? (
            <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
              Not enough data yet. Check back after a few days!
            </div>
          ) : (
            <>
              {/* Playback controls */}
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={handlePrev} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors dark:text-gray-500">
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  onClick={handlePlayPause}
                  className="p-2 rounded-full bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                >
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button onClick={handleNext} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors dark:text-gray-500">
                  <SkipForward className="w-4 h-4" />
                </button>

                <span className="text-xs text-gray-400 tabular-nums ml-2 dark:text-gray-500">
                  {currentDate || "—"} ({currentIdx + 1}/{totalFrames})
                </span>

                {/* Speed selector */}
                <div className="ml-auto flex items-center rounded-lg border border-gray-200 overflow-hidden dark:border-gray-700">
                  {([1, 2, 4] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                        speed === s ? "bg-brand-600 text-white" : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Timeline slider */}
              <div>
                <input
                  type="range"
                  min={0}
                  max={totalFrames - 1}
                  value={currentIdx}
                  onChange={handleSlider}
                  className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-brand-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1 dark:text-gray-500">
                  <span>{dates[0]}</span>
                  <span>{dates[dates.length - 1]}</span>
                </div>
              </div>

              {/* Animated leaderboard */}
              <div className="rounded-lg border border-gray-200 overflow-hidden dark:border-gray-700">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200 dark:bg-gray-800/60 dark:border-gray-700">
                    <tr>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase w-12 dark:text-gray-400">Rank</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase dark:text-gray-400">Player</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase w-16 dark:text-gray-400">XP</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {currentData.map((entry) => (
                        <motion.tr
                          key={entry.userId}
                          layout
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ type: "spring", stiffness: 300, damping: 25 }}
                          className="border-b border-gray-50 hover:bg-muted"
                        >
                          <td className="px-3 py-2">
                            <span className="text-sm font-bold text-gray-400 tabular-nums dark:text-gray-500">#{entry.rank}</span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <StudentAvatar
                                studentId={entry.userId}
                                fullName={entry.fullName}
                                size="sm"
                                showName={false}
                              />
                              <span className="text-sm font-medium text-gray-900 truncate max-w-[120px] dark:text-white">{entry.fullName}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-sm font-bold text-brand-600 tabular-nums">{entry.xp}</span>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              {/* Insights */}
              {data?.insights && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {data.insights.biggestClimber && (
                    <div className="rounded-xl bg-green-50 border border-green-200 p-3">
                      <p className="text-[10px] text-green-600 font-semibold uppercase mb-1 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Biggest Climber
                      </p>
                      <p className="text-sm font-bold text-green-800 truncate">{data.insights.biggestClimber.fullName}</p>
                      <p className="text-xs text-green-600">
                        #{data.insights.biggestClimber.from} → #{data.insights.biggestClimber.to} (+{data.insights.biggestClimber.rankGain})
                      </p>
                    </div>
                  )}
                  {data.insights.highestXpGain && (
                    <div className="rounded-xl bg-brand-50 border border-brand-200 p-3">
                      <p className="text-[10px] text-brand-600 font-semibold uppercase mb-1 flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Most XP Gain
                      </p>
                      <p className="text-sm font-bold text-brand-800 truncate">{data.insights.highestXpGain.fullName}</p>
                      <p className="text-xs text-brand-600">+{data.insights.highestXpGain.xpGain} XP</p>
                    </div>
                  )}
                  {data.insights.longestStreak && (
                    <div className="rounded-xl bg-orange-50 border border-orange-200 p-3">
                      <p className="text-[10px] text-orange-600 font-semibold uppercase mb-1 flex items-center gap-1">
                        <Flame className="w-3 h-3" /> Longest Streak
                      </p>
                      <p className="text-sm font-bold text-orange-800 truncate">{data.insights.longestStreak.fullName}</p>
                      <p className="text-xs text-orange-600">🔥 {data.insights.longestStreak.streak} days</p>
                    </div>
                  )}
                  {data.insights.mostActive && (
                    <div className="rounded-xl bg-purple-50 border border-purple-200 p-3">
                      <p className="text-[10px] text-purple-600 font-semibold uppercase mb-1 flex items-center gap-1">
                        <Code className="w-3 h-3" /> Most Active
                      </p>
                      <p className="text-sm font-bold text-purple-800 truncate">{data.insights.mostActive.fullName}</p>
                      <p className="text-xs text-purple-600">+{data.insights.mostActive.problemGain} problems</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
