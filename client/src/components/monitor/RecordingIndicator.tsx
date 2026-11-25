import { Circle } from "lucide-react";

/**
 * Visible while a teacher is recording the session.
 *
 * Students are minors, so recording is disclosed rather than silent — and
 * knowing the session is being reviewed nudges behaviour more effectively than
 * catching people after the fact.
 */
export default function RecordingIndicator({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full border border-red-200 bg-red-50/95 px-3 py-1.5 shadow-sm backdrop-blur dark:border-red-900 dark:bg-red-950/80">
      <Circle className="h-2.5 w-2.5 animate-pulse fill-red-500 text-red-500" />
      <span className="text-[11px] font-semibold text-red-700 dark:text-red-300">Đang ghi nhận buổi học</span>
    </div>
  );
}
