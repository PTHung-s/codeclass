import { useState } from"react";
import { useNavigate, useSearchParams } from"react-router-dom";
import { useQuery } from"@tanstack/react-query";
import { Bug, ChevronRight, Clock, ListOrdered, Sparkles, Trophy, Users, Zap } from"lucide-react";
import api from"../../lib/api";
import { cn } from"../../lib/utils";
import { Button } from"../../components/ui/button";
import { Card, CardContent } from"../../components/ui/card";
import { EmptyState } from"../../components/ui/StateViews";

interface HistoryItem {
 id: string;
 title: string;
 mode: string;
 createdAt: string;
 createdBy?: { id: string; fullName: string };
 players?: Array<{
 user: { id: string; fullName: string; avatarUrl: string | null };
 totalScore: number;
 finalRank: number | null;
 }>;
 questions?: Array<{ id: string; title: string; language: string; orderIndex: number }>;
 _count?: { questions: number };
}

/**
 * Finished-match history, mounted on both `/arena/history` and
 * `/quiz-arena/history?type=quiz`. The heading, icon and review target used to
 * be hardcoded to Debug, so the quiz route announced"Lịch sử Debug Arena".
 */
export default function ArenaHistory() {
 const [tab, setTab] = useState<"practice" |"versus">("practice");
 const navigate = useNavigate();
 const [searchParams] = useSearchParams();
 const isQuiz = searchParams.get("type") ==="quiz";

 const typeQuery = isQuiz ?"?type=quiz" :"";
 const kind = isQuiz ?"quiz" :"debug";
 const Icon = isQuiz ? Sparkles : Bug;
 const base = isQuiz ?"/quiz-arena" :"/arena";

 const { data: practice = [], isLoading: practiceLoading } = useQuery<HistoryItem[]>({
 queryKey: ["arena-history-practice", kind],
 queryFn: () => api.get(`/arenas/history/practice${typeQuery}`).then((r) => r.data),
 });
 const { data: versus = [], isLoading: versusLoading } = useQuery<HistoryItem[]>({
 queryKey: ["arena-history-versus", kind],
 queryFn: () => api.get(`/arenas/history/versus${typeQuery}`).then((r) => r.data),
 });

 const list = tab ==="practice" ? practice : versus;
 const loading = tab ==="practice" ? practiceLoading : versusLoading;

 return (
 <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <h1 className="flex items-center gap-2 text-2xl font-extrabold dark:text-foreground">
 <Icon className="h-6 w-6" /> Lịch sử {isQuiz ?"Quiz Arena" :"Debug Arena"}
 </h1>
 <Button variant="ghost" size="sm" onClick={() => navigate(base)} className="text-muted-foreground">
 Về danh sách phòng
 </Button>
 </div>

 <div className="flex gap-2">
 {(
 [
 { key:"practice", label:"Luyện tập cá nhân", icon: Zap },
 { key:"versus", label:"Thi đấu", icon: Trophy },
 ] as const
 ).map(({ key, label, icon: TabIcon }) => (
 <button
 key={key}
 type="button"
 onClick={() => setTab(key)}
 className={cn("flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-sm font-semibold transition",
 tab === key
 ?"bg-primary/10 dark:bg-blue-950/40 "
 :"border-border text-muted-foreground hover:bg-muted",
 )}
 >
 <TabIcon className="h-3.5 w-3.5" /> {label}
 </button>
 ))}
 </div>

 {loading ? (
 <div className="space-y-2">
 {[1, 2].map((i) => (
 <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
 ))}
 </div>
 ) : list.length === 0 ? (
 <EmptyState
 icon={<Icon className="h-5 w-5" />}
 title={`Chưa có lịch sử ${tab ==="practice" ?"luyện tập" :"thi đấu"}`}
 text="Trận nào kết thúc sẽ xuất hiện ở đây kèm phần xem lại từng câu."
 />
 ) : (
 <div className="space-y-2">
 {list.map((item) => {
 const champion = item.players?.find((p) => p.finalRank === 1);
 const myScore = item.players?.[0]?.totalScore;
 return (
 <Card
 key={item.id}
 className="cursor-pointer transition-shadow hover:shadow-md"
 onClick={() => navigate(`${base}/${item.id}/review`)}
 >
 <CardContent className="flex items-center gap-3 p-4">
 <div className="min-w-0 flex-1">
 <h3 className="truncate text-sm font-bold">{item.title}</h3>
 <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
 <span className="flex items-center gap-0.5">
 <Clock className="h-3 w-3" />
 {new Date(item.createdAt).toLocaleDateString("vi-VN")}
 </span>
 <span className="flex items-center gap-0.5">
 <ListOrdered className="h-3 w-3" />
 {item._count?.questions || item.questions?.length || 0} câu
 </span>
 {tab ==="versus" && item.players && (
 <span className="flex items-center gap-0.5">
 <Users className="h-3 w-3" />
 {item.players.length}
 </span>
 )}
 </div>
 {tab ==="versus" && champion && (
 <p className="mt-0.5 text-xs font-semibold">
 🏆 {champion.user.fullName} ({champion.totalScore}đ)
 </p>
 )}
 {tab ==="practice" && myScore !== undefined && (
 <p className="mt-0.5 text-xs font-semibold">{myScore}đ</p>
 )}
 </div>
 <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
 </CardContent>
 </Card>
 );
 })}
 </div>
 )}
 </div>
 );
}
