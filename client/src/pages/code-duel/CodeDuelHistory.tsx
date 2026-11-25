import { useEffect, useState } from"react";
import { useParams, Link } from"react-router-dom";
import { ArrowLeft, ShieldCheck, Code2 } from"lucide-react";
import api from"../../lib/api";
import { useToast } from"../../hooks/useToast";
import { ArenaMarkdown } from"../../components/arena/ArenaMarkdown";

interface HistoryRound {
 roundId: string;
 orderIndex: number;
 title: string;
 statement: string;
 difficulty: string;
 topic: string;
 algorithm: string;
 verified: {
 id: string;
 fullName: string;
 code: string;
 verdict: string | null;
 passedTests: number;
 totalTests: number;
 acceptedAt: string | null;
 verifiedComment?: string | null;
 }[];
}

export default function CodeDuelHistory() {
 const { id } = useParams<{ id: string }>();
 const toast = useToast();
 const [history, setHistory] = useState<HistoryRound[]>([]);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 api
 .get<HistoryRound[]>(`/code-duel/${id}/history`)
 .then((res) => setHistory(res.data))
 .catch((err: any) => toast.error({ title:"Không tải được", message: err?.response?.data?.error ||"Đã có lỗi." }))
 .finally(() => setLoading(false));
 }, [id]);

 return (
 <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
 <Link to={`/code-duel/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
 <ArrowLeft className="h-4 w-4" /> Về trận đấu
 </Link>

 <div>
 <h1 className="flex items-center gap-2 text-2xl font-extrabold text-foreground">
 <ShieldCheck className="h-6 w-6" /> Code mẫu đã xác thực
 </h1>
 <p className="mt-0.5 text-sm text-muted-foreground">
 Lời giải được giáo viên xác thực (VERIFIED) sau mỗi vòng — lưu lại để học sinh tham khảo.
 </p>
 </div>

 {loading ? (
 <div className="py-16 text-center text-muted-foreground">Đang tải...</div>
 ) : history.length === 0 ? (
 <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
 Chưa có lời giải nào được xác thực.
 </div>
 ) : (
 <div className="space-y-4">
 {history.map((h) => {
 const v = h.verified[0] || null;
 return (
 <div key={h.roundId} className="overflow-hidden rounded-xl border border-border bg-card">
 <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
 <div>
 <p className="font-semibold text-foreground">
 Vòng {h.orderIndex + 1} · {h.title}
 </p>
 <p className="text-xs text-muted-foreground">{h.difficulty}{h.topic ? ` · ${h.topic}` :""}</p>
 </div>
 {v && (
 <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold text-white">
 <ShieldCheck className="h-3.5 w-3.5" /> {v.fullName}
 </span>
 )}
 </div>
 <div className="px-4 py-3">
 {v ? (
 <div className="space-y-3">
 <ArenaMarkdown content={h.statement} className="text-sm text-foreground/80" />
 <div className="flex items-center gap-2 text-xs text-muted-foreground">
 <Code2 className="h-3.5 w-3.5" />
 {v.passedTests}/{v.totalTests} test · {v.verdict ||"—"}
 {v.acceptedAt && ` · nộp ${new Date(v.acceptedAt).toLocaleString("vi-VN")}`}
 {v.verifiedComment && <span className="">· “{v.verifiedComment}”</span>}
 </div>
 <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 font-mono text-xs">
 {v.code}
 </pre>
 </div>
 ) : (
 <p className="py-2 text-center text-sm text-muted-foreground">Chưa xác thực lời giải cho vòng này.</p>
 )}
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 );
}