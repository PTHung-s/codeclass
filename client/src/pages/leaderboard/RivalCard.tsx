import { Target } from "lucide-react";

interface RivalProps {
  rival: {
    userId: string;
    fullName: string;
    xp: number;
    xpDiff: number;
    rank: number;
  } | null;
  onRivalClick?: (userId: string) => void;
}

export default function RivalCard({ rival, onRivalClick }: RivalProps) {
  if (!rival) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold">
        <Target className="w-4 h-4" />
        <span>You're #1! 🏆 No rival above</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => onRivalClick?.(rival.userId)}
      className="flex items-center gap-2 text-xs font-semibold text-amber-300 hover:text-amber-100 transition-colors group"
    >
      <Target className="w-4 h-4 group-hover:scale-110 transition-transform" />
      <span>
        🎯 Next Rival: <strong>{rival.fullName}</strong> (#{rival.rank}) · Need{" "}
        <strong>{rival.xpDiff} XP</strong> to overtake
      </span>
    </button>
  );
}
