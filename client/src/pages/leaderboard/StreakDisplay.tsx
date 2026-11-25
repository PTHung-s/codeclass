interface StreakDisplayProps {
  streak: number;
  size?: "sm" | "md" | "lg";
}

export default function StreakDisplay({ streak, size = "md" }: StreakDisplayProps) {
  const sizes = { sm: "text-sm gap-1", md: "text-base gap-1.5", lg: "text-lg gap-2" };
  const flameSizes = { sm: "text-base", md: "text-xl", lg: "text-2xl" };

  if (streak === 0) {
    return (
      <span className={`inline-flex items-center ${sizes[size]} text-gray-400 dark:text-gray-500`}>
        <span className={flameSizes[size]}>🔥</span>
        <span className="text-xs font-medium">No streak yet</span>
      </span>
    );
  }

  const color = streak >= 7 ? "text-red-500" : streak >= 3 ? "text-orange-500" : "text-gray-400";

  return (
    <span className={`inline-flex items-center ${sizes[size]} ${color}`}>
      <span className={`${flameSizes[size]} tracking-tighter`}>
        {"🔥".repeat(Math.min(streak, 7))}
        {streak > 7 && <span className="text-xs align-super font-bold">+{streak - 7}</span>}
      </span>
      <span className="text-xs font-semibold ml-0.5">{streak}-day streak</span>
    </span>
  );
}
