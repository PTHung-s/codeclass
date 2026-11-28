import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Layers,
  PackagePlus,
  Sparkles,
  Trophy,
} from "lucide-react";
import api from "../../lib/api";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import { cn } from "../../lib/utils";
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

const TIER_VISUALS: Record<
  "tier1" | "tier2" | "tier3" | "tier4",
  {
    shortTag: string;
    headline: string;
    image: string;
    topics: string[];
    ringClass: string;
    badgeClass: string;
    barClass: string;
    accentBorder: string;
  }
> = {
  tier1: {
    shortTag: "Tầng 1",
    headline: "Nền tảng thi đấu",
    image: "/cp-roadmap/tier-1.jpg",
    topics: ["Số học", "Prefix Sum", "Sắp xếp & Tham lam"],
    ringClass: "border-emerald-500/60 ring-2 ring-emerald-500/20",
    badgeClass: "bg-emerald-600 text-white",
    barClass: "bg-emerald-500",
    accentBorder: "border-l-emerald-500",
  },
  tier2: {
    shortTag: "Tầng 2",
    headline: "Kỹ thuật lõi",
    image: "/cp-roadmap/tier-2.jpg",
    topics: ["Binary Search", "Two Pointers", "Stack · Heap · Bitmask"],
    ringClass: "border-sky-500/60 ring-2 ring-sky-500/20",
    badgeClass: "bg-sky-600 text-white",
    barClass: "bg-sky-500",
    accentBorder: "border-l-sky-500",
  },
  tier3: {
    shortTag: "Tầng 3",
    headline: "Quy hoạch động & Đồ thị",
    image: "/cp-roadmap/tier-3.jpg",
    topics: ["DP Knapsack · Bitmask", "BFS/DFS · Dijkstra", "MST · SCC"],
    ringClass: "border-violet-500/60 ring-2 ring-violet-500/20",
    badgeClass: "bg-violet-600 text-white",
    barClass: "bg-violet-500",
    accentBorder: "border-l-violet-500",
  },
  tier4: {
    shortTag: "Tầng 4",
    headline: "CTDL & HSG Quốc gia",
    image: "/cp-roadmap/tier-4.jpg",
    topics: ["Segment Tree · BIT", "LCA · Trie · Z", "Hình học & Nim"],
    ringClass: "border-amber-500/60 ring-2 ring-amber-500/20",
    badgeClass: "bg-amber-600 text-white",
    barClass: "bg-amber-500",
    accentBorder: "border-l-amber-500",
  },
};

export default function CpRoadmapPage() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const isTeacher = isStaff(user?.role);

  const [activeTier, setActiveTier] = useState<"all" | "tier1" | "tier2" | "tier3" | "tier4">("all");
  const [diffFilter, setDiffFilter] = useState<"all" | "easy" | "medium" | "hard">("all");
  const [hideSolved, setHideSolved] = useState(false);
  const [expandedPacks, setExpandedPacks] = useState<Record<string, boolean>>({});
  const [autoExpandedOnce, setAutoExpandedOnce] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<CpRoadmapPayload>({
    queryKey: ["cp-roadmap"],
    queryFn: () => api.get("/problems/roadmap").then((r) => r.data),
  });

  // Expand the first unfinished pack automatically so the page opens with concrete problems ready.
  useEffect(() => {
    if (!data?.tiers || autoExpandedOnce) return;
    let firstPackId: string | null = null;
    for (const tier of data.tiers) {
      for (const pack of tier.packs) {
        if (pack.solvedCount < pack.totalCount) {
          firstPackId = pack.packId;
          break;
        }
      }
      if (firstPackId) break;
    }
    if (!firstPackId) firstPackId = data.tiers[0]?.packs[0]?.packId ?? null;
    if (firstPackId) {
      setExpandedPacks({ [firstPackId]: true });
    }
    setAutoExpandedOnce(true);
  }, [data?.tiers, autoExpandedOnce]);

  const togglePack = (packId: string) => {
    setExpandedPacks((prev) => ({ ...prev, [packId]: !prev[packId] }));
  };

  const visibleTiers = useMemo(() => {
    if (!data?.tiers) return [];
    return activeTier === "all" ? data.tiers : data.tiers.filter((t) => t.tierKey === activeTier);
  }, [data?.tiers, activeTier]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="h-44 animate-pulse rounded-2xl bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />
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
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Visual Editorial Hero Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <img
          src="/cp-roadmap/hero-banner.jpg"
          alt="Lộ trình lập trình thi đấu 4 tầng"
          className="absolute inset-0 h-full w-full object-cover object-right opacity-95 dark:opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/88 to-white/25 dark:from-background/95 dark:via-background/90 dark:to-background/60" />

        <div className="relative z-10 flex flex-col justify-between gap-4 p-5 sm:p-7 lg:flex-row lg:items-end">
          <div className="max-w-xl space-y-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <Layers className="h-3 w-3" /> 19 chuyên đề · {data.summary.totalPackProblems} bài chuẩn thi đấu
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Lộ trình Lập trình Thi đấu
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Đi theo 4 tầng từ Số học &amp; Tham lam cơ bản đến Quy hoạch động nâng cao, Đồ thị, Segment Tree và đề HSG Quốc gia.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1 text-xs font-semibold text-foreground shadow-sm tabular-nums">
                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                Tiến độ: {data.summary.totalSolved}/{data.summary.totalPackProblems} ({pctTotal}%)
              </span>
              {data.summary.totalAttempted > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-300 tabular-nums">
                  {data.summary.totalAttempted} bài đang thử
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isTeacher && data.summary.totalImported < data.summary.totalPackProblems && (
              <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
                <PackagePlus className="size-3.5" /> Nạp nốt đề ({data.summary.totalPackProblems - data.summary.totalImported})
              </Button>
            )}
            <Button size="sm" onClick={() => navigate("/problems")}>
              Thư viện đề bài <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </section>

      {/* 4 Illustrated Tier Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.tiers.map((tier) => {
          const pct = tier.totalCount > 0 ? Math.round((tier.solvedCount / tier.totalCount) * 100) : 0;
          const selected = activeTier === tier.tierKey;
          const vis = TIER_VISUALS[tier.tierKey];

          return (
            <button
              key={tier.tierKey}
              type="button"
              onClick={() => setActiveTier((prev) => (prev === tier.tierKey ? "all" : tier.tierKey))}
              className={cn(
                "group flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                selected ? vis.ringClass : "border-border",
              )}
            >
              <div className="relative h-28 w-full overflow-hidden bg-muted">
                <img
                  src={vis.image}
                  alt={tier.label}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
                <span
                  className={cn(
                    "absolute left-2.5 top-2.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm",
                    vis.badgeClass,
                  )}
                >
                  {vis.shortTag}
                </span>
                <span className="absolute right-2.5 top-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-900 shadow-sm dark:bg-zinc-900/90 dark:text-zinc-100">
                  {pct}%
                </span>
              </div>

              <div className="flex flex-1 flex-col justify-between p-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground">{vis.headline}</h3>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {vis.topics.map((topic) => (
                      <span
                        key={topic}
                        className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-3.5 space-y-1.5">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all", vis.barClass)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                    <span>
                      Đã giải <strong className="text-foreground">{tier.solvedCount}</strong>/{tier.totalCount}
                    </span>
                    <span>{tier.packs.length} chuyên đề</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Đề xuất bắt đầu ngay
            </h2>
            <span className="text-xs text-muted-foreground">Ưu tiên theo kỹ năng và độ khó tăng dần</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {data.recommendations.map((rec, i) => {
              const cleanPack = rec.packTitle.replace(/^Tầng\s*\d+\s*:\s*/i, "");
              const accent = i === 0 ? "border-l-emerald-500" : i === 1 ? "border-l-sky-500" : "border-l-violet-500";
              const isGeneric = rec.reason.startsWith("Tiếp nối lộ trình");
              return (
                <button
                  key={rec.problemId}
                  type="button"
                  onClick={() => navigate(`/problems/${rec.problemId}`)}
                  className={cn(
                    "group flex flex-col justify-between rounded-xl border border-border border-l-4 bg-card p-3.5 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow",
                    accent,
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <DifficultyBadge difficulty={rec.difficulty} />
                      <span className="truncate rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {cleanPack}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground group-hover:text-primary">
                      {rec.title}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] font-medium text-primary">
                    <span className="truncate">{isGeneric ? "Bài mở đầu chuyên đề" : rec.reason}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-sm">
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
      <div className="space-y-7">
        {visibleTiers.map((tier) => {
          const vis = TIER_VISUALS[tier.tierKey];
          return (
            <section key={tier.tierKey} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2.5">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-14 shrink-0 overflow-hidden rounded-xl border border-border shadow-sm">
                    <img src={vis.image} alt={tier.label} className="h-full w-full object-cover" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground">{tier.label}</h2>
                    <p className="text-xs text-muted-foreground">{tier.subtitle}</p>
                  </div>
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
                  const easyC = pack.problems.filter((p) => p.difficulty === "easy").length;
                  const medC = pack.problems.filter((p) => p.difficulty === "medium").length;
                  const hardC = pack.problems.filter((p) => p.difficulty === "hard").length;

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
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                              {easyC} Dễ · {medC} TB · {hardC} Khó
                            </span>
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
                                className={cn("h-full rounded-full transition-all", vis.barClass)}
                                style={{ width: `${packPct}%` }}
                              />
                            </div>
                          </div>
                          <span className="w-14 text-right text-xs font-semibold tabular-nums text-foreground">
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
          );
        })}
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
