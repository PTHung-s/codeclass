import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Compass,
  PackagePlus,
  Sparkles,
  Trophy,
} from "lucide-react";
import api from "../../lib/api";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import { cn } from "../../lib/utils";
import { PageHeader } from "../../components/ui/page-header";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { DifficultyBadge } from "../../components/ui/Badges";
import ProblemPackImportDialog from "../../components/ui/ProblemPackImportDialog";

interface RoadmapProblemNode {
  slug: string;
  title: string;
  shortDescription: string;
  difficulty: "easy" | "medium" | "hard";
  estimatedTime: number;
  skillId: string | null;
  tags: string[];
  problemId: string | null;
  solveStatus: "solved" | "attempted" | "unstarted" | "not_imported";
}

interface RoadmapPackSummary {
  packId: string;
  title: string;
  tierKey: "tier1" | "tier2" | "tier3" | "tier4";
  tierLabel: string;
  description: string;
  totalCount: number;
  importedCount: number;
  solvedCount: number;
  attemptedCount: number;
  problems: RoadmapProblemNode[];
}

interface RoadmapTierSummary {
  tierKey: "tier1" | "tier2" | "tier3" | "tier4";
  label: string;
  subtitle: string;
  totalCount: number;
  importedCount: number;
  solvedCount: number;
  packs: RoadmapPackSummary[];
}

interface CpRoadmapPayload {
  summary: {
    totalPackProblems: number;
    totalImported: number;
    totalSolved: number;
    totalAttempted: number;
  };
  tiers: RoadmapTierSummary[];
  recommendations: Array<{
    problemId: string;
    title: string;
    difficulty: "easy" | "medium" | "hard";
    packTitle: string;
    skillId: string | null;
    reason: string;
  }>;
}

export default function CpRoadmapPage() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const isTeacher = isStaff(user?.role);

  const [activeTier, setActiveTier] = useState<"all" | "tier1" | "tier2" | "tier3" | "tier4">("all");
  const [diffFilter, setDiffFilter] = useState<"all" | "easy" | "medium" | "hard">("all");
  const [hideSolved, setHideSolved] = useState(false);
  const [expandedPacks, setExpandedPacks] = useState<Record<string, boolean>>({});
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<CpRoadmapPayload>({
    queryKey: ["cp-roadmap"],
    queryFn: () => api.get("/problems/roadmap").then((r) => r.data),
  });

  const togglePack = (packId: string) => {
    setExpandedPacks((prev) => ({ ...prev, [packId]: !prev[packId] }));
  };

  const visibleTiers = useMemo(() => {
    if (!data?.tiers) return [];
    const list = activeTier === "all" ? data.tiers : data.tiers.filter((t) => t.tierKey === activeTier);
    return list;
  }, [data?.tiers, activeTier]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-4xl py-16 text-center">
        <p className="text-sm text-destructive">Không tải được lộ trình Lập trình Thi đấu.</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => void refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  const pctTotal =
    data.summary.totalPackProblems > 0
      ? Math.round((data.summary.totalSolved / data.summary.totalPackProblems) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Lộ trình Lập trình Thi đấu (4 Tầng)"
        description="Hệ thống 19 chuyên đề từ nền tảng đến đội tuyển HSG Quốc gia — theo dõi tiến độ và gợi ý bài tiếp theo theo năng lực."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isTeacher && data.summary.totalImported < data.summary.totalPackProblems && (
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <PackagePlus className="size-3.5" /> Nạp nốt đề vào DB ({data.summary.totalPackProblems - data.summary.totalImported})
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => navigate("/problems")}>
              Danh sách bài tập
            </Button>
          </div>
        }
      />

      {/* Overall & Tier Progress Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.tiers.map((tier) => {
          const pct = tier.totalCount > 0 ? Math.round((tier.solvedCount / tier.totalCount) * 100) : 0;
          const selected = activeTier === tier.tierKey;
          return (
            <button
              key={tier.tierKey}
              type="button"
              onClick={() => setActiveTier((prev) => (prev === tier.tierKey ? "all" : tier.tierKey))}
              className={cn(
                "rounded-xl border bg-card p-4 text-left transition-all hover:shadow-sm",
                selected ? "border-primary ring-1 ring-primary/40" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground">{tier.label}</span>
                <span className="text-xs font-semibold tabular-nums text-primary">{pct}%</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{tier.subtitle}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                <span>Đã giải {tier.solvedCount}/{tier.totalCount}</span>
                <span>{tier.packs.length} chuyên đề</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <Card className="border-primary/25 bg-primary/[0.03]">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Gợi ý bài tiếp theo cho bạn</h2>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground tabular-nums">
                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                Tổng tiến độ: {data.summary.totalSolved}/{data.summary.totalPackProblems} ({pctTotal}%)
              </span>
            </div>
            <div className="grid gap-2.5 md:grid-cols-3">
              {data.recommendations.map((rec) => (
                <button
                  key={rec.problemId}
                  type="button"
                  onClick={() => navigate(`/problems/${rec.problemId}`)}
                  className="flex flex-col justify-between rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/30"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <DifficultyBadge difficulty={rec.difficulty} />
                      <span className="truncate text-[10px] text-muted-foreground">{rec.packTitle}</span>
                    </div>
                    <p className="mt-1.5 text-xs font-semibold text-foreground">{rec.title}</p>
                  </div>
                  <p className="mt-2 text-[11px] text-primary">{rec.reason}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            { key: "all", label: "Tất cả tầng" },
            { key: "tier1", label: "Tầng 1" },
            { key: "tier2", label: "Tầng 2" },
            { key: "tier3", label: "Tầng 3" },
            { key: "tier4", label: "Tầng 4" },
          ] as const).map((t) => (
            <Button
              key={t.key}
              size="xs"
              variant={activeTier === t.key ? "secondary" : "ghost"}
              onClick={() => setActiveTier(t.key)}
              className="h-7 rounded-full px-2.5 text-xs"
            >
              {t.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {([
              { key: "all", label: "Mọi độ khó" },
              { key: "easy", label: "Dễ" },
              { key: "medium", label: "TB" },
              { key: "hard", label: "Khó" },
            ] as const).map((d) => (
              <Button
                key={d.key}
                size="xs"
                variant={diffFilter === d.key ? "secondary" : "outline"}
                onClick={() => setDiffFilter(d.key)}
                className="h-7 rounded-full px-2.5 text-[11px]"
              >
                {d.label}
              </Button>
            ))}
          </div>

          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={hideSolved}
              onChange={(e) => setHideSolved(e.target.checked)}
            />
            Ẩn bài đã giải
          </label>
        </div>
      </div>

      {/* Tiers & Packs */}
      <div className="space-y-6">
        {visibleTiers.map((tier) => (
          <section key={tier.tierKey} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
                  <Compass className="h-4 w-4 text-primary" />
                  {tier.label}
                </h2>
                <p className="text-xs text-muted-foreground">{tier.subtitle}</p>
              </div>
              <Badge variant="secondary" className="text-[11px] tabular-nums">
                {tier.solvedCount}/{tier.totalCount} bài hoàn thành
              </Badge>
            </div>

            <div className="space-y-2.5">
              {tier.packs.map((pack) => {
                const isOpen = expandedPacks[pack.packId] ?? false;
                const filteredProblems = pack.problems.filter((p) => {
                  if (diffFilter !== "all" && p.difficulty !== diffFilter) return false;
                  if (hideSolved && p.solveStatus === "solved") return false;
                  return true;
                });
                const packPct =
                  pack.totalCount > 0 ? Math.round((pack.solvedCount / pack.totalCount) * 100) : 0;

                return (
                  <Card key={pack.packId} className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => togglePack(pack.packId)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{pack.title}</span>
                          {pack.importedCount < pack.totalCount && (
                            <Badge variant="outline" className="text-[10px]">
                              Đã nạp {pack.importedCount}/{pack.totalCount}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{pack.description}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div className="hidden w-28 sm:block">
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${packPct}%` }}
                            />
                          </div>
                        </div>
                        <span className="w-16 text-right text-xs font-semibold tabular-nums text-foreground">
                          {pack.solvedCount}/{pack.totalCount}
                        </span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="divide-y border-t border-border bg-muted/15">
                        {filteredProblems.length === 0 ? (
                          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                            Không có bài nào khớp bộ lọc hiện tại.
                          </div>
                        ) : (
                          filteredProblems.map((prob, idx) => (
                            <div
                              key={prob.slug}
                              className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/35"
                            >
                              <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">
                                {idx + 1}.
                              </span>
                              {prob.solveStatus === "solved" ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                              ) : prob.solveStatus === "attempted" ? (
                                <Clock className="h-4 w-4 shrink-0 text-amber-500" />
                              ) : (
                                <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-foreground">{prob.title}</span>
                                  <DifficultyBadge difficulty={prob.difficulty} />
                                  {prob.skillId && (
                                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                      {prob.skillId}
                                    </span>
                                  )}
                                </div>
                                {prob.shortDescription && (
                                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                    {prob.shortDescription}
                                  </p>
                                )}
                              </div>
                              <div className="shrink-0">
                                {prob.problemId ? (
                                  <Button
                                    size="xs"
                                    variant={prob.solveStatus === "solved" ? "outline" : "default"}
                                    onClick={() => navigate(`/problems/${prob.problemId}`)}
                                  >
                                    {prob.solveStatus === "solved" ? "Làm lại" : "Giải bài"}
                                  </Button>
                                ) : (
                                  <span className="text-[11px] italic text-muted-foreground">
                                    Chưa import vào DB
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {isTeacher && (
        <ProblemPackImportDialog
          open={importOpen}
          onClose={() => {
            setImportOpen(false);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
