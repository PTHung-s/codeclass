import { AlertTriangle, ClipboardPaste, MonitorX, PauseCircle } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Card, CardContent } from "../../../components/ui/card";
import { formatClock, type LiveCell, type RecParticipant } from "./recordingUtils";

/**
 * Auto-surfacing alerts. A teacher cannot watch 30 tiles at once, so anything
 * worth reacting to is pushed into this column instead.
 */
export default function AlertColumn({
  participants,
  live,
  onSelect,
}: {
  participants: RecParticipant[];
  live: Map<string, LiveCell>;
  onSelect: (userId: string) => void;
}) {
  const alerts: { userId: string; name: string; text: string; icon: any; tone: string }[] = [];

  for (const p of participants) {
    const cell = live.get(p.userId);

    if (cell?.tabbedOut) {
      alerts.push({
        userId: p.userId,
        name: p.fullName,
        text: `Đang ở tab khác${cell.lastEventAt ? ` từ ${formatClock(cell.lastEventAt)}` : ""}`,
        icon: MonitorX,
        tone: "text-red-600",
      });
    }
    if (cell?.lastEventType === "paste") {
      alerts.push({
        userId: p.userId,
        name: p.fullName,
        text: cell.label || "Vừa dán một đoạn code lớn",
        icon: ClipboardPaste,
        tone: "text-blue-600",
      });
    }
    if (cell?.lastEventType === "idle_start") {
      alerts.push({
        userId: p.userId,
        name: p.fullName,
        text: "Không hoạt động 5 phút — có thể đang bí",
        icon: PauseCircle,
        tone: "text-amber-600",
      });
    }
    const tabOutCount = cell?.tabOutCount ?? p.tabOutCount;
    if (tabOutCount >= 10) {
      alerts.push({
        userId: p.userId,
        name: p.fullName,
        text: `Đã rời tab ${tabOutCount} lần trong buổi`,
        icon: AlertTriangle,
        tone: "text-red-600",
      });
    }
  }

  return (
    <Card className={cn(alerts.length ? "border-red-200 dark:border-red-900" : undefined)}>
      <CardContent className="space-y-2 p-3">
        <h3 className="flex items-center gap-1.5 text-xs font-bold">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          Cần chú ý {alerts.length > 0 && `(${alerts.length})`}
        </h3>

        {!alerts.length ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground">
            Cả lớp đang tập trung.
          </p>
        ) : (
          alerts.map((a, i) => (
            <button
              key={`${a.userId}-${i}`}
              onClick={() => onSelect(a.userId)}
              className="flex w-full items-start gap-2 rounded-lg border border-border p-2 text-left transition-colors hover:bg-muted/50"
            >
              <a.icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", a.tone)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold">{a.name}</span>
                <span className="block text-[10px] text-muted-foreground">{a.text}</span>
              </span>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
