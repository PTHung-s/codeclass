import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import type { HeatmapResponse } from "../../lib/api";
import { cn } from "../../lib/utils";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Users, AlertTriangle, TrendingDown, Target } from "lucide-react";
import { StudentName } from "../../components/ui/StudentName";
import { Button } from "../../components/ui/button";

const MASTERY_COLOR = (val: number) => {
  const pct = Math.round(val * 100);
  if (pct >= 75) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
  if (pct >= 50) return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
  return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";
};

const CONFIDENCE_LABEL = {
  low: "Ít bằng chứng",
  forming: "Đang hình thành",
  medium: "Khá chắc",
  high: "Chắc chắn",
} as const;

export default function SkillHeatmap() {
  const navigate = useNavigate();
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [domainFilter, setDomainFilter] = useState<"all" | "py" | "cpp" | "algo">("all");

  useEffect(() => {
    api.get("/skills/heatmap/all")
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  if (!data || data.students.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <Users className="mx-auto h-12 w-12 text-muted-foreground opacity-40" />
        <p className="mt-3 text-muted-foreground">Chưa có dữ liệu mastery của học sinh nào.</p>
      </div>
    );
  }

  const visibleSkills = domainFilter === "all"
    ? data.skills
    : data.skills.filter((s) => s.skillId.startsWith(`${domainFilter}.`));

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Heatmap Kỹ năng</h1>
          <p className="text-sm text-muted-foreground">
            Mastery thực tế hôm nay (đã tính suy giảm trí nhớ) của tất cả học sinh
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Lọc nhóm kỹ năng">
          {(
            [
              { id: "all", label: `Tất cả (${data.skills.length})` },
              { id: "py", label: "Python" },
              { id: "cpp", label: "C++" },
              { id: "algo", label: "Thuật toán" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={domainFilter === tab.id}
              onClick={() => setDomainFilter(tab.id)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                domainFilter === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block overflow-x-auto">
        <CardContent className="p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-bold">Học sinh</th>
                {visibleSkills.map((s) => (
                  <th key={s.skillId} className="px-2 py-2 text-center font-medium whitespace-nowrap" title={`${s.name} — bấm để giao bài khắc phục`}>
                    <button
                      type="button"
                      onClick={() => navigate(`/assignments?remedialSkill=${encodeURIComponent(s.skillId)}`)}
                      className="group inline-flex flex-col items-center hover:text-primary transition-colors"
                    >
                      <span>{s.topicName}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground group-hover:text-primary">
                        {s.name.slice(0, 20)}
                        <Target className="size-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.students.map((student) => (
                <tr key={student.userId} className="border-b hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        className="font-medium text-left hover:text-blue-600 transition-colors"
                        onClick={() => navigate(`/students/${student.userId}`)}
                      >
                        <StudentName fullName={student.fullName} nickname={student.nickname} primaryClassName="text-xs font-medium" />
                      </button>
                      <button
                        type="button"
                        title="Giao bài khắc phục riêng cho học sinh này"
                        onClick={() => navigate(`/assignments?remedialStudent=${encodeURIComponent(student.userId)}`)}
                        className="rounded p-1 text-muted-foreground/60 hover:bg-primary/10 hover:text-primary transition-colors"
                      >
                        <Target className="size-3.5" />
                      </button>
                    </div>
                  </td>
                  {visibleSkills.map((s) => {
                    const state = student.skills[s.skillId];
                    const val = state?.mastery;
                    const retentionNote = state?.retentionRate != null && state.retentionRate < 0.99
                      ? ` · trí nhớ ${Math.round(state.retentionRate * 100)}% (${Math.round(state.daysSinceLastPractice ?? 0)} ngày)`
                      : "";
                    return (
                      <td key={s.skillId} className="px-1 py-2 text-center">
                        <button
                          onClick={() => navigate(`/students/${student.userId}`)}
                          className={cn(
                            "relative inline-flex min-w-[3rem] items-center justify-center rounded px-2 py-1 font-medium tabular-nums",
                            state ? MASTERY_COLOR(val!) : "bg-muted text-muted-foreground",
                            state && state.confidenceLevel !== "high" && "border border-dashed border-current/40",
                          )}
                          title={state
                            ? `Ước lượng ${Math.round(val! * 100)}%, khoảng ${Math.round(state.lowerBound * 100)}–${Math.round(state.upperBound * 100)}%. ${CONFIDENCE_LABEL[state.confidenceLevel]} · ${state.evidenceCount} phiên${retentionNote}.`
                            : "Chưa đánh giá"}
                        >
                          {state ? `${Math.round(val! * 100)}%` : "—"}
                          {state?.dueForReview && (
                            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-500 ring-1 ring-background" title="Cần ôn lại" />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-4">
        {data.students.map((student) => (
          <Card key={student.userId}>
            <CardContent className="p-3 space-y-2">
              <button
                className="font-semibold text-sm hover:text-blue-600"
                onClick={() => navigate(`/students/${student.userId}`)}
              >
                <StudentName fullName={student.fullName} nickname={student.nickname} primaryClassName="text-sm font-semibold" />
              </button>
              {visibleSkills.map((s) => {
                const state = student.skills[s.skillId];
                const val = state?.mastery;
                return (
                  <div key={s.skillId} className="flex items-center gap-2 text-xs">
                    <span className="w-24 truncate text-muted-foreground" title={s.name}>{s.name}</span>
                    <div className="relative h-2 flex-1 rounded-full bg-muted">
                      {state && (
                        <>
                          <div className={cn("absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-35", val! >= 0.75 ? "bg-emerald-500" : val! >= 0.5 ? "bg-amber-500" : "bg-red-500")} style={{ left: `${state.lowerBound * 100}%`, width: `${Math.max(1, (state.upperBound - state.lowerBound) * 100)}%` }} />
                          <span className={cn("absolute top-1/2 h-3 w-0.5 -translate-y-1/2", val! >= 0.75 ? "bg-emerald-500" : val! >= 0.5 ? "bg-amber-500" : "bg-red-500")} style={{ left: `${state.lowerBound * 100}%` }} />
                          <span className={cn("absolute top-1/2 h-3 w-0.5 -translate-y-1/2", val! >= 0.75 ? "bg-emerald-500" : val! >= 0.5 ? "bg-amber-500" : "bg-red-500")} style={{ left: `${state.upperBound * 100}%` }} />
                          <span className={cn("absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background", val! >= 0.75 ? "bg-emerald-500" : val! >= 0.5 ? "bg-amber-500" : "bg-red-500")} style={{ left: `${val! * 100}%` }} />
                        </>
                      )}
                    </div>
                    <span className="w-14 text-right tabular-nums font-medium">{state ? `${Math.round(state.lowerBound * 100)}–${Math.round(state.upperBound * 100)}%` : "—"}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stuck clusters */}
      {data.stuckClusters.length > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="p-4 space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              Cụm học sinh đang kẹt ({data.stuckClusters.length})
            </h2>
            {data.stuckClusters.map((c) => (
              <div key={c.skillId} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-xs">
                <TrendingDown className="h-4 w-4 text-red-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.skillName}</p>
                  <p className="text-muted-foreground">
                    {c.count} học sinh có mastery &lt;50%
                  </p>
                </div>
                <Badge variant="destructive" className="text-[10px]">{c.count} người</Badge>
                <Button
                  size="xs"
                  variant="outline"
                  className="h-7 gap-1 text-[11px]"
                  onClick={() => navigate(`/assignments?remedialSkill=${encodeURIComponent(c.skillId)}`)}
                >
                  <Target className="size-3" /> Giao bài khắc phục
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
