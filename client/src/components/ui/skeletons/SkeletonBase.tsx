import { CSSProperties } from "react";
import { Skeleton } from "../skeleton";
import { cn } from "../../../lib/utils";

interface SkeletonBaseProps {
  className?: string;
  style?: CSSProperties;
}

export function SkeletonBase({ className, style }: SkeletonBaseProps) {
  return <Skeleton className={cn("bg-gray-200 dark:bg-gray-700", className)} style={style} />;
}
