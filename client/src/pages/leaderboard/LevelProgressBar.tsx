import { getLevelInfo, leagueTailwind } from "../../lib/levels";

interface LevelProgressBarProps {
  xp: number;
  compact?: boolean;
}

export default function LevelProgressBar({ xp, compact }: LevelProgressBarProps) {
  const info = getLevelInfo(xp);
  const tw = leagueTailwind(info.leagueColor);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold ${tw.text} flex items-center gap-0.5`}>
          {info.leagueEmoji} Lv.{info.level}
        </span>
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-[120px]">
          <div
            className={`h-full rounded-full transition-all duration-700 ${tw.bar}`}
            style={{ width: `${info.levelProgress}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-400 tabular-nums dark:text-gray-500">{info.levelProgress}%</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${tw.text} flex items-center gap-1.5`}>
          <span className="text-lg">{info.leagueEmoji}</span>
          {info.levelTitle} · Lv.{info.level}
        </span>
        <span className="text-xs text-gray-400 tabular-nums dark:text-gray-500">{info.levelProgress}%</span>
      </div>
      <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${tw.bar}`}
          style={{ width: `${info.levelProgress}%` }}
        />
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500">
        {info.xpToNextLevel > 0
          ? `${info.xpToNextLevel} XP needed to reach Level ${info.level + 1}`
          : "Max level reached! 🎉"}
      </p>
    </div>
  );
}
