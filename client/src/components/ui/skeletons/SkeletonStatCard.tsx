import { SkeletonBase } from "./SkeletonBase";

export function SkeletonStatCard({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-gray-200 p-5 dark:bg-gray-800 dark:border-gray-700"
        >
          <div className="flex items-center gap-3">
            <SkeletonBase className="w-10 h-10 rounded-lg" />
            <div className="space-y-1.5 flex-1">
              <SkeletonBase className="h-7 w-12 rounded" />
              <SkeletonBase className="h-3 w-20 rounded" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
