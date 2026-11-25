import { AlertTriangle, CalendarX, Code2, TrendingDown, XCircle } from "lucide-react";
import { Card, CardContent } from "../../../components/ui/card";
import { StudentName } from "../../../components/ui/StudentName";
import { Badge } from "../../../components/ui/badge";
import { cn } from "../../../lib/utils";
import type { TrackingWarning } from "./trackingUtils";

const TYPE_META: Record<TrackingWarning["type"], { label: string; icon: any }> = {
  quiz_failing: { label: "Trượt kiểm tra", icon: XCircle },
  inactive: { label: "Lâu không học", icon: CalendarX },
  challenge_stuck: { label: "Kẹt ở bài code", icon: Code2 },
  behind: { label: "Tụt lại so với lớp", icon: TrendingDown },
};

export default function WarningsPanel({
  warnings,
  onSelectStudent,
}: {
  warnings: TrackingWarning[];
  onSelectStudent: (userId: string) => void;
}) {
  if (!warnings.length) {
    return (
      <Card className="border-emerald-200 dark:border-emerald-900">
        <CardContent className="py-10 text-center">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Không có cảnh báo nào</p>
          <p className="mt-1 text-xs text-muted-foreground">Cả lớp đang theo kịp tiến độ.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardContent className="space-y-2 p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4" />
          Cần chú ý ({warnings.length})
        </h2>

        {warnings.map((w, i) => {
          const meta = TYPE_META[w.type] || { label: w.type, icon: AlertTriangle };
          const Icon = meta.icon;
          return (
            <button
              key={`${w.userId}-${w.type}-${i}`}
              onClick={() => onSelectStudent(w.userId)}
              className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left text-xs transition-colors hover:bg-muted/50"
            >
              <Icon className={cn("h-4 w-4 shrink-0", w.severity === "high" ? "text-red-500" : "text-amber-500")} />
              <span className="min-w-0 flex-1">
                <StudentName fullName={w.fullName} nickname={w.nickname} primaryClassName="text-xs font-medium" />
                <span className="block text-muted-foreground">{w.detail}</span>
              </span>
              <Badge
                variant="secondary"
                className={cn(
                  "shrink-0 text-[10px]",
                  w.severity === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700",
                )}
              >
                {meta.label}
              </Badge>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
