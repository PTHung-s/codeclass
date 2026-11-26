import { useEffect, useState } from"react";
import { useQuery } from"@tanstack/react-query";
import { ArrowLeft, Clock, Users } from"lucide-react";
import api from"../../../lib/api";
import { cn } from"../../../lib/utils";
import { Card, CardContent } from"../../../components/ui/card";
import { Badge } from"../../../components/ui/badge";
import { Button } from"../../../components/ui/button";
import StudentTimeline from"./StudentTimeline";
import {
 formatClock,
 formatDateVN,
 formatDuration,
 initialOf,
 type RecParticipant,
} from"./recordingUtils";
import { StudentName } from"../../../components/ui/StudentName";

/** Review a finished recording: pick a student on the left, scrub their timeline. */
export default function SessionReplay({
 recordingId,
 onBack,
}: {
 recordingId: string;
 onBack: () => void;
}) {
 const [selected, setSelected] = useState<string | null>(null);

 const { data, isLoading } = useQuery({
 queryKey: ["recording-detail", recordingId],
 queryFn: () => api.get(`/recordings/${recordingId}`).then((r) => r.data),
 enabled: !!recordingId,
 });

 const participants: RecParticipant[] = data?.participants || [];

 useEffect(() => {
 if (!selected && participants.length) setSelected(participants[0].userId);
 }, [participants, selected]);

 if (isLoading) return <p className="py-12 text-center text-sm text-muted-foreground">Đang tải buổi ghi...</p>;
 if (!data) return <p className="py-12 text-center text-sm text-muted-foreground">Không tìm thấy buổi ghi.</p>;

 return (
 <div className="space-y-4">
 <div className="flex flex-wrap items-center gap-3">
 <Button variant="ghost" size="sm" onClick={onBack} className="px-0">
 <ArrowLeft className="h-4 w-4" /> Danh sách buổi ghi
 </Button>
 <span className="text-sm font-bold">{formatDateVN(data.sessionDate)}</span>
 <Badge variant="secondary" className="text-[10px]">
 <Clock className="mr-1 h-3 w-3" />
 {formatClock(data.startedAt)}
 {data.endedAt ? ` – ${formatClock(data.endedAt)}` :" (đang ghi)"}
 </Badge>
 <Badge variant="secondary" className="text-[10px]">
 <Users className="mr-1 h-3 w-3" /> {participants.length} học sinh
 </Badge>
 {data.title && <span className="text-xs text-muted-foreground">{data.title}</span>}
 </div>

 <div className="grid gap-3 lg:grid-cols-[minmax(0,260px)_1fr]">
 <Card className="max-h-[70vh] overflow-y-auto">
 <CardContent className="divide-y p-0">
 {participants.map((p) => (
 <button
 key={p.userId}
 onClick={() => setSelected(p.userId)}
 className={cn("flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
 selected === p.userId &&"bg-primary/10 dark:bg-primary/15",
 )}
 >
 <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
 {initialOf(p.fullName)}
 </span>
 <span className="min-w-0 flex-1">
 <StudentName fullName={p.fullName} nickname={p.nickname} primaryClassName="text-xs font-semibold" />
 <span className="block text-[10px] text-muted-foreground">
 {formatDuration(p.activeSeconds)}
 {p.tabOutCount > 0 && (
 <span className="font-medium text-rose-600 dark:text-rose-400"> · rời tab {p.tabOutCount}</span>
 )}
 </span>
 </span>
 {p.eventCount === 0 && (
 <Badge variant="secondary" className="shrink-0 text-[9px]">
 trống
 </Badge>
 )}
 </button>
 ))}
 </CardContent>
 </Card>

 <div>
 {selected ? (
 <StudentTimeline recordingId={recordingId} userId={selected} isLive={data.status ==="recording"} />
 ) : (
 <p className="py-12 text-center text-sm text-muted-foreground">Chọn một học sinh để xem lại.</p>
 )}
 </div>
 </div>
 </div>
 );
}
