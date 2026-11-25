import { motion } from "framer-motion";
import { Zap, Code, FileText, BookOpen, TrendingUp, TrendingDown, Minus } from "lucide-react";
import LevelProgressBar from "./LevelProgressBar";
import StreakDisplay from "./StreakDisplay";
import RivalCard from "./RivalCard";
import { getLevelInfo, leagueTailwind } from "../../lib/levels";

interface UserHeroCardProps {
  entry: {
    userId: string;
    fullName: string;
    avatarUrl: string | null;
    xp: number;
    rank: number;
    rankChange: number | null;
    problemCount: number;
    submissionCount: number;
    lessonCount: number;
    streak: number;
    levelTitle: string;
    rival: {
      userId: string;
      fullName: string;
      xp: number;
      xpDiff: number;
      rank: number;
    } | null;
  };
}

export default function UserHeroCard({ entry }: UserHeroCardProps) {
  const info = getLevelInfo(entry.xp);
  const tw = leagueTailwind(info.leagueColor);

  const rankChangeIcon =
    entry.rankChange === null ? (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white/70">NEW</span>
    ) : entry.rankChange > 0 ? (
      <span className="inline-flex items-center gap-0.5 text-green-300 text-xs font-bold">
        <TrendingUp className="w-3 h-3" />↑{entry.rankChange}
      </span>
    ) : entry.rankChange < 0 ? (
      <span className="inline-flex items-center gap-0.5 text-red-300 text-xs font-bold">
        <TrendingDown className="w-3 h-3" />↓{Math.abs(entry.rankChange)}
      </span>
    ) : (
      <span className="inline-flex items-center gap-0.5 text-white/50 text-xs font-bold">
        <Minus className="w-3 h-3" />—
      </span>
    );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl overflow-hidden shadow-lg"
      style={{
        background: "linear-gradient(135deg, #4f46e5 0%, #3b82f6 50%, #06b6d4 100%)",
      }}
    >
      <div className="p-5 sm:p-6 text-white">
        {/* Top row: Rank + Level + XP */}
        <div className="flex min-w-0 items-center justify-between gap-4 mb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-12 h-12 shrink-0 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold backdrop-blur">
              #{entry.rank}
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold text-lg leading-tight" title={entry.fullName}>
                {entry.fullName}
                <span className="ml-2 text-[10px] font-bold uppercase bg-white/20 px-2 py-0.5 rounded-full">YOU</span>
              </p>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${tw.text} bg-white/20 px-2 py-0.5 rounded-full`}>
                  {info.leagueEmoji} {entry.levelTitle}
                </span>
                {rankChangeIcon}
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-3xl font-extrabold tracking-tight">{entry.xp}</p>
            <p className="text-xs text-white/60 font-semibold uppercase">XP</p>
          </div>
        </div>

        {/* Level progress */}
        <div className="mb-4 bg-white/10 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-white/80">Level {info.level} → Level {info.level + 1}</span>
            <span className="text-xs font-semibold text-white/60">{info.levelProgress}%</span>
          </div>
          <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-700 dark:bg-gray-800"
              style={{ width: `${info.levelProgress}%` }}
            />
          </div>
          <p className="text-[10px] text-white/50 mt-1">
            {info.xpToNextLevel > 0 ? `${info.xpToNextLevel} XP until Level ${info.level + 1}` : "Max level! 🎉"}
          </p>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <StreakDisplay streak={entry.streak} size="sm" />
          <span className="inline-flex items-center gap-1 text-xs text-white/70">
            <Code className="w-3.5 h-3.5" /> {entry.problemCount} problems
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-white/70">
            <FileText className="w-3.5 h-3.5" /> {entry.submissionCount} assignments
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-white/70">
            <BookOpen className="w-3.5 h-3.5" /> {entry.lessonCount} lessons
          </span>
        </div>

        {/* Rival */}
        <div className="mt-3 pt-3 border-t border-white/15">
          <RivalCard rival={entry.rival} />
        </div>
      </div>
    </motion.div>
  );
}
