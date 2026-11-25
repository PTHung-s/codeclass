import { Badge } from "./badge";
import { cn } from "../../lib/utils";

type Difficulty = "easy" | "medium" | "hard" | string;

const difficultyMap: Record<string, { label: string; className: string }> = {
  easy: {
    label: "Dễ",
    className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200",
  },
  medium: {
    label: "Trung bình",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  },
  hard: {
    label: "Khó",
    className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
  },
};

export function DifficultyBadge({ difficulty }: { difficulty?: Difficulty }) {
  if (!difficulty) return null;
  const info = difficultyMap[difficulty] ?? {
    label: difficulty,
    className: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200",
  };
  return (
    <Badge variant="secondary" className={cn("shrink-0", info.className)}>
      {info.label}
    </Badge>
  );
}

export type StatusTone = "green" | "blue" | "amber" | "red" | "gray" | "brand";

const toneClasses: Record<StatusTone, string> = {
  green: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
  gray: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200",
  brand: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200",
};

export function StatusBadge({
  tone = "gray",
  children,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
}) {
  return (
    <Badge variant="secondary" className={cn("shrink-0", toneClasses[tone])}>
      {children}
    </Badge>
  );
}
