import { SkeletonBase } from "./SkeletonBase";

export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ["w-full", "w-4/5", "w-3/4", "w-2/3", "w-5/6"];
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBase
          key={i}
          className={`h-3 rounded ${widths[i % widths.length]}`}
        />
      ))}
    </div>
  );
}
