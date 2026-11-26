import { Code2, MonitorPlay } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Card, CardContent } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { initialOf, type LiveCell, type RecParticipant } from "./recordingUtils";
import { StudentName } from "../../../components/ui/StudentName";

/**
 * Live class grid: one tile per recorded student showing the code they are
 * writing right now. A tile turns rose while the student is on another tab.
 */
export default function LiveGrid({
  participants,
  live,
  onSelect,
}: {
  participants: RecParticipant[];
  live: Map<string, LiveCell>;
  onSelect: (userId: string) => void;
}) {
  if (!participants.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MonitorPlay className="mx-auto h-10 w-10 text-muted-foreground opacity-40" />
          <p className="mt-3 text-sm font-medium">Chưa có học sinh nào trong buổi ghi</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Học sinh vào lớp sau khi bắt đầu sẽ tự động được ghi nhận, hoặc bấm &ldquo;Thêm học sinh&rdquo; để thêm thủ công.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {participants.map((p) => {
        const cell = live.get(p.userId);
        const tabbedOut = !!cell?.tabbedOut;
        const code = cell?.code ?? p.finalCode ?? null;
        const tabOutCount = cell?.tabOutCount ?? p.tabOutCount;
        const runCount = cell?.runCount ?? p.runCount;

        return (
          <button
            key={p.userId}
            onClick={() => onSelect(p.userId)}
            className={cn(
              "overflow-hidden rounded-xl border bg-card text-left transition-all hover:shadow-md",
              tabbedOut ? "border-rose-500/70 ring-2 ring-rose-500/40" : "border-border",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-2 border-b px-3 py-2",
                tabbedOut ? "bg-rose-500/10 dark:bg-rose-950/40" : "bg-muted/40",
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {initialOf(p.fullName)}
              </span>
              <StudentName
                fullName={p.fullName}
                nickname={p.nickname}
                className="min-w-0 flex-1"
                primaryClassName="text-xs font-semibold"
              />
              {tabbedOut ? (
                <Badge
                  variant="secondary"
                  className="shrink-0 bg-rose-500/15 text-[9px] font-bold text-rose-600 dark:text-rose-400"
                >
                  RỜI TAB
                </Badge>
              ) : (
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="Đang tập trung" />
              )}
            </div>

            {cell?.label && (
              <div className="truncate border-b border-slate-800 bg-slate-900 px-3 py-1 text-[10px] text-slate-400">
                {cell.label}
              </div>
            )}

            <pre className="h-32 overflow-hidden bg-slate-950 px-3 py-2 font-mono text-[10px] leading-snug text-slate-100">
              {code || "(chưa viết code)"}
            </pre>

            <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-muted-foreground">
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  tabOutCount > 0 && "font-semibold text-rose-600 dark:text-rose-400",
                )}
              >
                rời tab {tabOutCount}
              </span>
              <span className="inline-flex items-center gap-1">
                <Code2 className="h-3 w-3" /> {runCount}
              </span>
              {p.addedManually && <span className="ml-auto italic">thêm giữa buổi</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
