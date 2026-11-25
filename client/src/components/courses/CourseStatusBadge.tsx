import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";

/**
 * Shared course status badge. Previously duplicated (and diverged) in
 * CourseList and CourseDetail — this is the single source of truth.
 *
 * `onImage` is for badges rendered over a course cover image: the soft
 * tint has no real background there and the text dissolves into the photo,
 * so we switch to the same frosted card surface the cover buttons use.
 */
export function CourseStatusBadge({ status, onImage = false }: { status?: string; onImage?: boolean }) {
  const label =
    status === "active" ? "Đang hoạt động" : status === "draft" ? "Bản nháp" : "Đã lưu trữ";
  const text =
    status === "active"
      ? "text-emerald-700 dark:text-emerald-400"
      : status === "draft"
        ? "text-muted-foreground"
        : "text-amber-700 dark:text-amber-400";
  const surface = onImage
    ? "bg-card/85 shadow-sm backdrop-blur"
    : status === "active"
      ? "bg-emerald-500/10 dark:bg-emerald-500/15"
      : status === "draft"
        ? "bg-muted"
        : "bg-amber-500/10 dark:bg-amber-500/15";

  return <Badge className={cn(surface, text)}>{label}</Badge>;
}
