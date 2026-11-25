import { Progress, ProgressIndicator } from "./progress";
import { cn } from "../../lib/utils";

type Tone = "brand" | "green" | "amber" | "red" | "blue";

const barClasses: Record<Tone, string> = {
  brand: "bg-brand-500",
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
};

export function ProgressBar({
  value,
  tone = "brand",
  className = "",
}: {
  value: number;
  tone?: Tone;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <Progress value={pct} className={cn("h-2", className)}>
      <ProgressIndicator className={cn("h-full transition-all", barClasses[tone])} />
    </Progress>
  );
}
