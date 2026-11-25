import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "../../lib/utils";
import type { SkillState } from "../../lib/api";

const LEVEL_STYLES = {
  low: { bar: "bg-destructive", text: "text-destructive", label: "Cần củng cố" },
  mid: { bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", label: "Đang tiến bộ" },
  high: { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", label: "Vững" },
} as const;

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus };
const TREND_COLOR = {
  up: "text-emerald-500",
  down: "text-red-500",
  flat: "text-muted-foreground",
} as const;

function masteryLevel(value: number): keyof typeof LEVEL_STYLES {
  if (value < 0.5) return "low";
  if (value < 0.75) return "mid";
  return "high";
}

export function SkillProfileCard({
  skill,
  isUpdated,
}: {
  skill: SkillState;
  isUpdated?: boolean;
}) {
  const level = masteryLevel(skill.mastery);
  const style = LEVEL_STYLES[level];
  const TrendIcon = TREND_ICON[skill.trend];

  return (
    <div className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{skill.name}</p>
          {isUpdated && (
            <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              Vừa cập nhật
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", style.bar)}
              style={{ width: `${Math.round(skill.mastery * 100)}%` }}
            />
          </div>
          <span className="w-10 text-right text-xs tabular-nums font-medium">
            {Math.round(skill.mastery * 100)}%
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px]">
          <TrendIcon className={cn("h-3 w-3", TREND_COLOR[skill.trend])} />
          <span className={style.text}>{style.label}</span>
          {skill.trend === "up" && <span className="text-emerald-600">↑</span>}
          {skill.trend === "down" && <span className="text-red-500">↓</span>}
        </div>
      </div>
    </div>
  );
}
