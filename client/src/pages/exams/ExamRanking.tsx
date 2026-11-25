import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import { ArrowLeft, Trophy, Medal, Eye, EyeOff } from "lucide-react";

const RANK_STYLE: Record<number, string> = {
  1: "bg-amber-400/15 text-amber-600 dark:text-amber-400",
  2: "bg-slate-400/15 text-slate-600 dark:text-slate-300",
  3: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

export default function ExamRanking() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const staff = isStaff(user?.role);

  const rankQ = useQuery({
    queryKey: ["exam-ranking", examId],
    queryFn: () => api.get(`/exams/${examId}/ranking`).then((r) => r.data),
    enabled: !!examId,
    retry: false,
  });

  if (rankQ.isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Đang tải bảng xếp hạng…</div>;
  }
  if (rankQ.isError) {
    const msg =
      (rankQ.error as any)?.response?.data?.error || "Không tải được bảng xếp hạng.";
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={() => navigate(staff ? `/exams/${examId}/grading` : `/exams/${examId}/result`)}>
          <ArrowLeft className="h-4 w-4" /> Quay lại
        </Button>
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">{msg}</div>
      </div>
    );
  }

  const data = rankQ.data;
  const rows: any[] = data?.ranking || [];
  const scale = data?.scale ?? 100;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 mb-3"
        onClick={() => navigate(staff ? `/exams/${examId}/grading` : `/exams/${examId}/result`)}
      >
        <ArrowLeft className="h-4 w-4" /> {staff ? "Chấm điểm" : "Kết quả"}
      </Button>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15">
          <Trophy className="h-5 w-5 text-amber-500" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Bảng xếp hạng</h1>
          <p className="truncate text-sm text-muted-foreground">Thang điểm {scale}</p>
        </div>
        {data?.staff && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-xs font-medium">
            {data?.showResults ? (
              <><Eye className="h-3.5 w-3.5" /> Đã công bố điểm cho học sinh</>
            ) : (
              <><EyeOff className="h-3.5 w-3.5" /> Chưa công bố điểm</>
            )}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Chưa có học sinh nào nộp bài.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 text-center">#</th>
                <th className="px-3 py-2.5">Học sinh</th>
                <th className="px-3 py-2.5 text-right">Điểm</th>
                {data?.staff && <th className="hidden px-3 py-2.5 text-right sm:table-cell">Thô</th>}
                {data?.staff && <th className="hidden px-3 py-2.5 sm:table-cell">Trạng thái</th>}
                {data?.staff && <th className="hidden px-3 py-2.5 sm:table-cell">Nộp lúc</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.attemptId || `rank-${r.rank}`}
                  className={`border-b border-border/60 last:border-0 ${
                    r.isMe
                      ? "bg-primary/5 ring-1 ring-inset ring-primary/30"
                      : r.rank <= 3 && data?.staff
                        ? "bg-muted/30"
                        : ""
                  }`}
                >
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${RANK_STYLE[r.rank] || "bg-muted text-muted-foreground"}`}>
                      {r.rank}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {r.rank <= 3 && (
                        <Medal className={`h-4 w-4 shrink-0 ${r.rank === 1 ? "text-amber-500" : r.rank === 2 ? "text-slate-400" : "text-orange-500"}`} />
                      )}
                      <span className="font-medium">{r.fullName}</span>
                      {r.isMe && (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">Bạn</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-mono text-base font-bold">{r.scaledScore ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">/{scale}</span>
                  </td>
                  {data?.staff && (
                    <>
                      <td className="hidden px-3 py-2.5 text-right font-mono text-xs text-muted-foreground sm:table-cell">
                        {r.rawScore ?? "—"}/{r.maxScore ?? "—"}
                      </td>
                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        {r.gradeStatus === "done" ? (
                          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">Đã chấm</span>
                        ) : r.gradeStatus === "needs_review" ? (
                          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-400">Chờ duyệt</span>
                        ) : (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{r.gradeStatus}</span>
                        )}
                      </td>
                      <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                        {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "—"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
