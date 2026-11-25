import { Code2, MonitorPlay } from"lucide-react";
import { cn } from"../../../lib/utils";
import { Card, CardContent } from"../../../components/ui/card";
import { Badge } from"../../../components/ui/badge";
import { initialOf, type LiveCell, type RecParticipant } from"./recordingUtils";
import { StudentName } from"../../../components/ui/StudentName";

/**
 * Live class grid: one tile per recorded student showing the code they are
 * writing right now. A tile turns red while the student is on another tab.
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
 Buổi ghi bắt tất cả học sinh đang online lúc bấm Bắt đầu. Dùng"Thêm học sinh" nếu có em vào muộn.
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

 return (
 <button
 key={p.userId}
 onClick={() => onSelect(p.userId)}
 className={cn("overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:shadow-md",
 tabbedOut ?" ring-2 " :"border-border",
 )}
 >
 <div
 className={cn("flex items-center gap-2 border-b px-3 py-2",
 tabbedOut ?"bg-primary/10 dark:bg-red-950/30" :"bg-muted/40",
 )}
 >
 <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
 {initialOf(p.fullName)}
 </span>
 <StudentName fullName={p.fullName} nickname={p.nickname} className="min-w-0 flex-1" primaryClassName="text-xs font-semibold" />
 {tabbedOut ? (
 <Badge variant="secondary" className="shrink-0 text-[9px] font-bold">
 RỜI TAB
 </Badge>
 ) : (
 <span className="h-2 w-2 shrink-0 rounded-full" />
 )}
 </div>

 <pre className="h-32 overflow-hidden bg-slate-950 px-3 py-2 font-mono text-[10px] leading-snug">
 {code ||"(chưa viết code)"}
 </pre>

 <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-muted-foreground">
 <span className={cn("inline-flex items-center gap-1", p.tabOutCount > 0 &&"")}>
 rời tab {p.tabOutCount}
 </span>
 <span className="inline-flex items-center gap-1">
 <Code2 className="h-3 w-3" /> {p.runCount}
 </span>
 {p.addedManually && <span className="ml-auto italic">thêm giữa buổi</span>}
 </div>
 </button>
 );
 })}
 </div>
 );
}
