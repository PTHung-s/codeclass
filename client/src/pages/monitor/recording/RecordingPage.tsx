import { useCallback, useEffect, useMemo, useState } from"react";
import { useQuery, useQueryClient } from"@tanstack/react-query";
import { CircleStop, PlayCircle, Trash2, UserPlus, Users } from"lucide-react";
import api from"../../../lib/api";
import { cn } from"../../../lib/utils";
import { socketSend, socketSubscribe } from"../../../lib/socket";
import { Card, CardContent } from"../../../components/ui/card";
import { Badge } from"../../../components/ui/badge";
import { Button } from"../../../components/ui/button";
import { useConfirmContext } from"../../../hooks/useConfirm";
import { usePresence } from"../../../hooks/usePresence";
import LiveGrid from"./LiveGrid";
import AlertColumn from"./AlertColumn";
import AddStudentDialog from"./AddStudentDialog";
import SessionReplay from"./SessionReplay";
import StudentTimeline from"./StudentTimeline";
import {
 formatClock,
 formatDateVN,
 type LiveCell,
 type RecParticipant,
 type RecSessionListItem,
} from"./recordingUtils";

/**
 * Teacher dashboard for lesson recording.
 *
 * Start captures every student currently online; students can be added
 * mid-session. End stores the session for the day — re-recording the same day
 * overwrites it, earlier days are kept.
 */
export default function RecordingPage() {
 const qc = useQueryClient();
 const confirm = useConfirmContext();
 const online = usePresence();

 const [live, setLive] = useState<Map<string, LiveCell>>(new Map());
 const [showAdd, setShowAdd] = useState(false);
 const [openSessionId, setOpenSessionId] = useState<string | null>(null);
 const [inspectUserId, setInspectUserId] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const { data: activeData } = useQuery({
 queryKey: ["recording-active"],
 queryFn: () => api.get("/recordings/active").then((r) => r.data),
 });

 const { data: sessions = [] } = useQuery<RecSessionListItem[]>({
 queryKey: ["recordings"],
 queryFn: () => api.get("/recordings").then((r) => r.data),
 });

 const active = activeData?.active || null;
 const isRecording = !!active;

 const participants: RecParticipant[] = useMemo(() => {
 if (!active?.participants) return [];
 return active.participants
 .map((p: any) => ({
 id: p.id,
 userId: p.userId,
 fullName: p.user?.fullName ||"?",
 nickname: p.user?.nickname ?? null,
 avatarUrl: p.user?.avatarUrl ?? null,
 joinedAt: p.joinedAt ??"",
 addedManually: !!p.addedManually,
 activeSeconds: 0,
 tabOutCount: p.tabOutCount ?? 0,
 runCount: p.runCount ?? 0,
 finalCode: null,
 eventCount: 0,
 }))
 .sort((a: RecParticipant, b: RecParticipant) => a.fullName.localeCompare(b.fullName,"vi"));
 }, [active]);

 const participantIds = useMemo(() => new Set(participants.map((p) => p.userId)), [participants]);

 const refetchAll = useCallback(() => {
 qc.invalidateQueries({ queryKey: ["recording-active"] });
 qc.invalidateQueries({ queryKey: ["recordings"] });
 }, [qc]);

 // Live updates: batched cells every 5s, tab-outs pushed immediately.
 useEffect(() => {
 const unsub = socketSubscribe((msg) => {
 if (msg.type ==="recording_live" && Array.isArray(msg.payload?.cells)) {
 setLive((prev) => {
 const next = new Map(prev);
 for (const cell of msg.payload.cells as LiveCell[]) {
 const old = next.get(cell.userId);
 next.set(cell.userId, { ...old, ...cell });
 }
 return next;
 });
 } else if (msg.type ==="recording_started" || msg.type ==="__socket_open") {
 setLive(new Map());
 refetchAll();
 } else if (msg.type ==="recording_ended" || msg.type ==="recording_participant_added") {
 refetchAll();
 } else if (msg.type ==="recording_error") {
 setError(msg.payload?.message ||"Có lỗi xảy ra");
 }
 });
 return unsub;
 }, [refetchAll]);

 const onlineStudentCount = online.length;

 const handleStart = async () => {
 setError(null);
 setBusy(true);
 socketSend("recording_start", {});
 setTimeout(() => {
 refetchAll();
 setBusy(false);
 }, 800);
 };

 const handleEnd = async () => {
 const ok = await confirm({
 title:"Kết thúc buổi ghi",
 message:"Lưu lại buổi ghi này? Nếu hôm nay đã có buổi ghi trước đó, bản này sẽ thay thế bản cũ.",
 });
 if (!ok) return;
 setBusy(true);
 socketSend("recording_end", {});
 setTimeout(() => {
 refetchAll();
 setBusy(false);
 }, 800);
 };

 const handleDelete = async (id: string) => {
 const ok = await confirm({ title:"Xóa buổi ghi", message:"Xóa vĩnh viễn buổi ghi này?", variant:"danger" });
 if (!ok) return;
 try {
 await api.delete(`/recordings/${id}`);
 if (openSessionId === id) setOpenSessionId(null);
 refetchAll();
 } catch (err: any) {
 setError(err.response?.data?.error ||"Không xóa được");
 }
 };

 if (openSessionId) {
 return <SessionReplay recordingId={openSessionId} onBack={() => setOpenSessionId(null)} />;
 }

 return (
 <div className="space-y-4">
 {/* Control bar */}
 <Card>
 <CardContent className="flex flex-wrap items-center gap-3 p-4">
 {isRecording ? (
 <>
 <span className="inline-flex items-center gap-2 text-sm font-bold">
 <span className="h-2.5 w-2.5 animate-pulse rounded-full" />
 Đang ghi
 </span>
 <Badge variant="secondary" className="text-[10px]">
 Bắt đầu {formatClock(active.startedAt)}
 </Badge>
 <Badge variant="secondary" className="text-[10px]">
 <Users className="mr-1 h-3 w-3" /> {participants.length} học sinh
 </Badge>
 <div className="flex-1" />
 <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
 <UserPlus className="h-3.5 w-3.5" /> Thêm học sinh
 </Button>
 <Button variant="default" size="sm" onClick={handleEnd} disabled={busy} className="">
 <CircleStop className="h-3.5 w-3.5" /> Kết thúc & lưu
 </Button>
 </>
 ) : (
 <>
 <div className="min-w-0 flex-1">
 <p className="text-sm font-bold">Chưa ghi buổi nào</p>
 <p className="text-xs text-muted-foreground">
 Bấm Bắt đầu để ghi lại toàn bộ học sinh đang online ({onlineStudentCount} em). Buổi ghi hôm nay sẽ thay
 thế bản cũ nếu có.
 </p>
 </div>
 <Button variant="default" size="sm" onClick={handleStart} disabled={busy || onlineStudentCount === 0}>
 <PlayCircle className="h-4 w-4" /> Bắt đầu ghi
 </Button>
 </>
 )}
 </CardContent>
 </Card>

 {error && (
 <div className="rounded-lg border bg-red-500/10 px-3 py-2 text-xs dark:bg-red-950/30">
 {error}
 </div>
 )}

 {/* Live view */}
 {isRecording && (
 <div className="grid gap-3 xl:grid-cols-[1fr_minmax(0,260px)]">
 <div className="space-y-3">
 <LiveGrid participants={participants} live={live} onSelect={setInspectUserId} />
 {inspectUserId && (
 <Card>
 <CardContent className="p-4">
 <div className="mb-2 flex items-center justify-between">
 <h3 className="text-xs font-bold">Dòng thời gian trực tiếp</h3>
 <Button variant="ghost" size="xs" onClick={() => setInspectUserId(null)}>
 Đóng
 </Button>
 </div>
 <StudentTimeline recordingId={active.id} userId={inspectUserId} />
 </CardContent>
 </Card>
 )}
 </div>
 <AlertColumn participants={participants} live={live} onSelect={setInspectUserId} />
 </div>
 )}

 {/* Saved sessions */}
 <div>
 <h2 className="mb-2 text-sm font-bold">Buổi đã ghi</h2>
 {!sessions.length ? (
 <Card>
 <CardContent className="py-10 text-center text-xs text-muted-foreground">
 Chưa có buổi ghi nào được lưu. Hệ thống chỉ lưu từ lúc bạn bấm Bắt đầu, và tự xóa buổi cũ hơn 30 ngày.
 </CardContent>
 </Card>
 ) : (
 <Card>
 <CardContent className="divide-y p-0">
 {sessions.map((s) => (
 <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
 <button className="min-w-0 flex-1 text-left" onClick={() => setOpenSessionId(s.id)}>
 <span className="flex items-center gap-2">
 <span className="text-xs font-semibold">{formatDateVN(s.sessionDate)}</span>
 {s.status ==="recording" && (
 <Badge variant="secondary" className="text-[9px] font-bold">
 ĐANG GHI
 </Badge>
 )}
 </span>
 <span className="mt-0.5 block text-[10px] text-muted-foreground">
 {formatClock(s.startedAt)}
 {s.endedAt ? ` – ${formatClock(s.endedAt)}` :""} · {s.participantCount} học sinh ·{""}
 {s.startedBy?.fullName}
 </span>
 </button>
 <Button
 variant="ghost"
 size="icon-sm"
 className={cn("", s.status ==="recording" &&"opacity-40")}
 onClick={() => handleDelete(s.id)}
 title={s.status ==="recording" ?"Hãy kết thúc buổi ghi trước" :"Xóa"}
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 ))}
 </CardContent>
 </Card>
 )}
 </div>

 <AddStudentDialog
 open={showAdd}
 onClose={() => setShowAdd(false)}
 existingUserIds={participantIds}
 onAdd={(userId) => socketSend("recording_add", { userId })}
 />
 </div>
 );
}
