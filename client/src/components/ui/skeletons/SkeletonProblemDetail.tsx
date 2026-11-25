import { SkeletonBase } from "./SkeletonBase";

export function SkeletonProblemDetail() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back button */}
      <SkeletonBase className="h-4 w-40 rounded" />
      {/* Card */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-card">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <SkeletonBase className="h-7 w-2/3 rounded" />
            <div className="flex gap-3">
              <SkeletonBase className="h-5 w-16 rounded-full" />
              <SkeletonBase className="h-5 w-24 rounded-full" />
            </div>
          </div>
          <SkeletonBase className="h-8 w-24 rounded-lg" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBase key={i} className="h-6 w-20 rounded-lg" />
          ))}
        </div>
        <SkeletonBase className="h-64 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <SkeletonBase className="h-24 rounded-xl" />
          <SkeletonBase className="h-24 rounded-xl" />
        </div>
        <SkeletonBase className="h-48 w-full rounded-lg" />
      </div>
      {/* Submit form */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-card">
        <SkeletonBase className="h-6 w-32 rounded" />
        <SkeletonBase className="h-[400px] w-full rounded-lg" />
        <SkeletonBase className="h-10 w-28 rounded-lg" />
      </div>
    </div>
  );
}
