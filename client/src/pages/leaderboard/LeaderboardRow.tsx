import { motion } from "framer-motion";
import { Medal, TrendingUp, TrendingDown, Minus, Star } from "lucide-react";
import { getLevelInfo, leagueTailwind } from "../../lib/levels";
import StudentAvatar from "../../components/ui/StudentAvatar";

interface RowEntry {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  xp: number;
  rank: number;
  rankChange: number | null;
  streak: number;
  levelTitle: string;
  badges: { id: string; name: string; icon: string | null }[];
}

interface LeaderboardRowProps {
  entry: RowEntry;
  isCurrentUser: boolean;
  onUserClick?: (userId: string) => void;
}

export default function LeaderboardRow({ entry, isCurrentUser, onUserClick }: LeaderboardRowProps) {
  const info = getLevelInfo(entry.xp);
  const tw = leagueTailwind(info.leagueColor);

  const rankChangeBadge =
    entry.rankChange === null ? (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">NEW</span>
    ) : entry.rankChange > 0 ? (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-600">
        <TrendingUp className="w-3 h-3" /> +{entry.rankChange}
      </span>
    ) : entry.rankChange < 0 ? (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-500">
        <TrendingDown className="w-3 h-3" /> {entry.rankChange}
      </span>
    ) : (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-gray-400 dark:text-gray-500">
        <Minus className="w-3 h-3" />
      </span>
    );

  const medalColors: Record<number, string> = {
    1: "text-yellow-500",
    2: "text-gray-400",
    3: "text-amber-600",
  };

  return (
    <motion.tr
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      onClick={() => onUserClick?.(entry.userId)}
      className={`border-b border-gray-100 transition-colors cursor-pointer ${ isCurrentUser ? "bg-brand-50/80 hover:bg-brand-50 ring-1 ring-brand-200" : "hover:bg-muted" } dark:border-gray-700`}
    >
      {/* Rank */}
      <td className="px-3 sm:px-4 py-3 w-16">
        <div className="flex items-center gap-1.5">
          {entry.rank <= 3 ? (
            <Medal className={`w-5 h-5 ${medalColors[entry.rank]}`} />
          ) : (
            <span className="text-sm font-bold text-gray-400 tabular-nums w-5 text-center dark:text-gray-500">#{entry.rank}</span>
          )}
          <span className="hidden sm:inline">{rankChangeBadge}</span>
        </div>
      </td>

      {/* Name + Level */}
      <td className="px-3 sm:px-4 py-3 min-w-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <StudentAvatar
            studentId={entry.userId}
            fullName={entry.fullName}
            avatarUrl={entry.avatarUrl}
            size="md"
            showName={false}
            clickable
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white" title={entry.fullName}>
                {entry.fullName}
              </p>
              {isCurrentUser && (
                <span className="shrink-0 text-[9px] font-bold uppercase bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full">YOU</span>
              )}
            </div>
            <p className={`truncate text-[11px] font-medium ${tw.text}`}>
              {info.leagueEmoji} {entry.levelTitle} · Lv.{info.level}
            </p>
          </div>
        </div>
      </td>

      {/* XP */}
      <td className="px-3 sm:px-4 py-3 text-center">
        <span className="text-sm font-bold text-brand-600 tabular-nums">{entry.xp}</span>
      </td>

      {/* Streak */}
      <td className="px-3 sm:px-4 py-3 text-center hidden sm:table-cell">
        <span className={`text-sm font-semibold ${entry.streak >= 7 ? "text-red-500" : entry.streak >= 3 ? "text-orange-500" : "text-gray-400"}`}>
          🔥 {entry.streak}
        </span>
      </td>

      {/* Level */}
      <td className="px-3 sm:px-4 py-3 hidden md:table-cell">
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${tw.bg} ${tw.text} ${tw.border} border`}>
          {info.leagueEmoji} {entry.levelTitle}
        </span>
      </td>

      {/* Badges */}
      <td className="px-3 sm:px-4 py-3 hidden lg:table-cell">
        <div className="flex gap-1">
          {entry.badges.slice(0, 3).map((b) => (
            <span key={b.id} className="text-lg" title={b.name}>
              {b.icon || <Star className="w-4 h-4 text-yellow-500" />}
            </span>
          ))}
          {entry.badges.length === 0 && (
            <span className="text-xs text-gray-300">—</span>
          )}
          {entry.badges.length > 3 && (
            <span className="text-xs text-gray-400 font-medium dark:text-gray-500">+{entry.badges.length - 3}</span>
          )}
        </div>
      </td>
    </motion.tr>
  );
}
