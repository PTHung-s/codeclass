import { useState } from"react";
import { useOutletContext, useParams } from"react-router-dom";
import { useQuery } from"@tanstack/react-query";
import { AlertTriangle, BarChart3, Code2, LayoutGrid, Users } from"lucide-react";
import api from"../../../lib/api";
import { cn } from"../../../lib/utils";
import { Card, CardContent } from"../../../components/ui/card";
import { ErrorState } from"../../../components/ui/StateViews";
import { SkeletonTable } from"../../../components/ui/skeletons";
import ProgressGrid from"./ProgressGrid";
import QuizScoreTable from"./QuizScoreTable";
import ChallengeCodePanel from"./ChallengeCodePanel";
import StudentDetailDrawer from"./StudentDetailDrawer";
import WarningsPanel from"./WarningsPanel";
import type { TrackingOverview } from"./trackingUtils";

type SubTab ="progress" |"quiz" |"challenge" |"warnings";

const SUB_TABS: { key: SubTab; label: string; icon: any }[] = [
 { key:"progress", label:"Tiến độ", icon: LayoutGrid },
 { key:"quiz", label:"Điểm quiz", icon: BarChart3 },
 { key:"challenge", label:"Code học sinh", icon: Code2 },
 { key:"warnings", label:"Cảnh báo", icon: AlertTriangle },
];

export default function CourseTrackingTab() {
 const outlet = useOutletContext<{ course: any; courseId: string } | null>();
 const params = useParams();
 const courseId = outlet?.courseId || params.courseId ||"";

 const [subTab, setSubTab] = useState<SubTab>("progress");
 const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

 const { data, isLoading, isError, refetch } = useQuery<TrackingOverview>({
 queryKey: ["course-tracking-overview", courseId],
 queryFn: () => api.get(`/courses/${courseId}/tracking/overview`).then((r) => r.data),
 enabled: !!courseId,
 });

 if (isLoading) return <SkeletonTable rows={8} cols={6} />;
 if (isError) return <ErrorState title="Không tải được dữ liệu theo dõi" onRetry={() => refetch()} />;
 if (!data) return null;

 const active = data.students.filter((s) => s.lessonsCompleted > 0 || s.quiz.attempted > 0).length;
 const avgPercent = data.students.length
 ? Math.round(data.students.reduce((sum, s) => sum + s.percent, 0) / data.students.length)
 : 0;

 return (
 <div className="space-y-4">
 <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
 <SummaryCard icon={Users} value={String(data.totals.students)} label="Học sinh" hint={`${active} em đã bắt đầu học`} />
 <SummaryCard icon={LayoutGrid} value={`${avgPercent}%`} label="Tiến độ trung bình" hint={`${data.totals.lessons} bài · ${data.totals.modules} chương`} />
 <SummaryCard icon={BarChart3} value={String(data.totals.quizzes ?? 0)} label="Bài kiểm tra" hint={`Trung vị lớp ${data.totals.classMedianPercent ?? 0}%`} />
 <SummaryCard
 icon={AlertTriangle}
 value={String(data.warnings.length)}
 label="Cảnh báo"
 hint={data.warnings.length ?"Bấm tab Cảnh báo để xem" :"Không có vấn đề"}
 tone={data.warnings.length ?"warn" : undefined}
 />
 </div>

 <div className="flex flex-wrap gap-1 border-b">
 {SUB_TABS.map((t) => (
 <button
 key={t.key}
 onClick={() => setSubTab(t.key)}
 className={cn("flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
 subTab === t.key
 ?"border-primary text-primary"
 :"border-transparent text-muted-foreground hover:border-border hover:text-foreground",
 )}
 >
 <t.icon className="h-3.5 w-3.5" />
 {t.label}
 {t.key ==="warnings" && data.warnings.length > 0 && (
 <span className="ml-0.5 rounded-full px-1.5 text-[10px] font-bold">{data.warnings.length}</span>
 )}
 </button>
 ))}
 </div>

 {subTab ==="progress" && (
 <ProgressGrid modules={data.modules} students={data.students} onSelectStudent={setSelectedStudent} />
 )}
 {subTab ==="quiz" && <QuizScoreTable courseId={courseId} />}
 {subTab ==="challenge" && <ChallengeCodePanel courseId={courseId} />}
 {subTab ==="warnings" && <WarningsPanel warnings={data.warnings} onSelectStudent={setSelectedStudent} />}

 <StudentDetailDrawer courseId={courseId} userId={selectedStudent} onClose={() => setSelectedStudent(null)} />
 </div>
 );
}

function SummaryCard({
 icon: Icon,
 value,
 label,
 hint,
 tone,
}: {
 icon: any;
 value: string;
 label: string;
 hint?: string;
 tone?:"warn";
}) {
 return (
 <Card>
 <CardContent className="flex items-start gap-3 p-4">
 <span
 className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
 tone ==="warn" ?"" :"bg-primary/10 text-primary",
 )}
 >
 <Icon className="h-4 w-4" />
 </span>
 <div className="min-w-0">
 <p className="text-xl font-bold tabular-nums">{value}</p>
 <p className="text-xs font-medium">{label}</p>
 {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
 </div>
 </CardContent>
 </Card>
 );
}
