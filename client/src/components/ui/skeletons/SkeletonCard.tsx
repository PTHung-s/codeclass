import { SkeletonBase } from "./SkeletonBase";

export function SkeletonCard({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-card p-5 shadow-card space-y-3"
        >
          <div className="flex items-start justify-between">
            <SkeletonBase className="h-5 w-20 rounded-full" />
            <SkeletonBase className="h-4 w-4 rounded" />
          </div>
          <SkeletonBase className="h-5 w-3/4 rounded" />
          <div className="space-y-2">
            <SkeletonBase className="h-3 w-full rounded" />
            <SkeletonBase className="h-3 w-2/3 rounded" />
          </div>
          <div className="flex gap-4 pt-1">
            <SkeletonBase className="h-3 w-16 rounded" />
            <SkeletonBase className="h-3 w-16 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}
