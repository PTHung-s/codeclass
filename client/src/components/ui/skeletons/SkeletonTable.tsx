import { SkeletonBase } from "./SkeletonBase";

export function SkeletonTable({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 bg-muted/50 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBase
            key={i}
            className="h-3 rounded flex-1"
            style={{ maxWidth: `${100 / cols}%` }}
          />
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3">
            {Array.from({ length: cols }).map((_, j) => (
              <SkeletonBase
                key={j}
                className="h-4 rounded flex-1"
                style={{ maxWidth: j === 0 ? "40%" : `${80 / cols}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
