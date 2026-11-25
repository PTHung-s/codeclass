import { SkeletonBase } from "./SkeletonBase";

export function SkeletonLesson() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Back button */}
      <SkeletonBase className="h-4 w-32 rounded mb-6" />
      {/* Progress bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <SkeletonBase className="h-3 w-16 rounded" />
          <SkeletonBase className="h-3 w-24 rounded" />
        </div>
        <div className="flex gap-2">
          <SkeletonBase className="h-10 flex-1 rounded-lg" />
          <SkeletonBase className="h-10 flex-1 rounded-lg" />
        </div>
      </div>
      {/* Title */}
      <div className="mb-8">
        <SkeletonBase className="h-3 w-24 rounded mb-2" />
        <SkeletonBase className="h-7 w-2/3 rounded mb-2" />
        <SkeletonBase className="h-4 w-1/3 rounded mb-4" />
        <SkeletonBase className="h-5 w-24 rounded-full" />
      </div>
      {/* Content */}
      <div className="space-y-3">
        <SkeletonBase className="h-4 w-full rounded" />
        <SkeletonBase className="h-4 w-full rounded" />
        <SkeletonBase className="h-4 w-5/6 rounded" />
        <SkeletonBase className="h-4 w-11/12 rounded" />
        <SkeletonBase className="h-4 w-full rounded" />
        <SkeletonBase className="h-4 w-2/3 rounded" />
        <SkeletonBase className="h-40 w-full rounded-lg mt-4" />
        <SkeletonBase className="h-4 w-full rounded" />
        <SkeletonBase className="h-4 w-3/4 rounded" />
      </div>
    </div>
  );
}
