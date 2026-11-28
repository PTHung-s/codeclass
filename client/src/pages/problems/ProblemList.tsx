import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import api from "../../lib/api";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Code,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  CheckCircle2,
  PackagePlus,
  Compass,
  Timer,
} from "lucide-react";
import ProblemPackImportDialog from "../../components/ui/ProblemPackImportDialog";
import { useConfirmContext } from "../../hooks/useConfirm";
import { SkeletonTable } from "../../components/ui/skeletons";
import { ErrorState, EmptyState } from "../../components/ui/StateViews";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../components/ui/table";
import { DifficultyBadge } from "../../components/ui/Badges";

interface TagCount {
  tag: string;
  count: number;
}

interface GlobalTagsSummary {
  total: number;
  difficulties: { easy: number; medium: number; hard: number };
  tiers: TagCount[];
  tags: TagCount[];
}

const TAG_CLASS = "bg-muted text-muted-foreground";
const MAX_TAGS_VISIBLE = 2;
const MAX_TAGS_VISIBLE_MOBILE = 3;

function formatProblemPreview(value?: string | null) {
  if (!value) return "";
  return String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatLimitSec(ms?: number) {
  const sec = (ms || 2000) / 1000;
  return Number.isInteger(sec) ? `${sec}s` : `${sec.toFixed(1)}s`;
}

export default function ProblemList() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isTeacher = isStaff(user?.role);
  const confirm = useConfirmContext();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sortBy, setSortBy] = useState("default");
  const [solvedFilter, setSolvedFilter] = useState<"all" | "solved" | "unsolved">("all");
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const PAGE_SIZE = 40;

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const { data: tagsSummary } = useQuery<GlobalTagsSummary>({
    queryKey: ["problemTags", statusFilter, isTeacher],
    queryFn: () =>
      api
        .get("/problems/tags", {
          params: isTeacher && statusFilter ? { status: statusFilter } : undefined,
        })
        .then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: problemsResponse, isLoading, isError, refetch } = useQuery({
    queryKey: [
      "problems",
      debouncedSearch,
      page,
      selectedDifficulties,
      selectedTags,
      selectedTier,
      solvedFilter,
      sortBy,
      statusFilter,
      isTeacher,
    ],
    queryFn: () =>
      api
        .get("/problems", {
          params: {
            search: debouncedSearch || undefined,
            difficulties: selectedDifficulties.length ? selectedDifficulties.join(",") : undefined,
            tags: selectedTags.length ? selectedTags.join(",") : undefined,
            tier: selectedTier || undefined,
            solved: !isTeacher && solvedFilter !== "all" ? solvedFilter : undefined,
            sort: sortBy !== "default" ? sortBy : undefined,
            status: isTeacher && statusFilter ? statusFilter : undefined,
            page,
            limit: PAGE_SIZE,
          },
        })
        .then((r) => r.data),
  });

  const solvedQuery = useQuery({
    queryKey: ["problemProgress", "solved"],
    queryFn: () => api.get("/problems/progress/solved").then((r) => r.data),
    enabled: Boolean(user && !isTeacher),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/problems/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["problems"] });
      qc.invalidateQueries({ queryKey: ["problemTags"] });
    },
  });

  const problems = useMemo(() => {
    const raw = problemsResponse;
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.problems)) return raw.problems;
    return [];
  }, [problemsResponse]);

  const totalProblems = typeof problemsResponse?.total === "number" ? problemsResponse.total : problems.length;
  const totalPages =
    typeof problemsResponse?.totalPages === "number"
      ? Math.max(1, problemsResponse.totalPages)
      : Math.max(1, Math.ceil(totalProblems / PAGE_SIZE));

  const solvedIds = useMemo(() => {
    const ids = solvedQuery.data?.problemIds || [];
    return new Set<string>(ids);
  }, [solvedQuery.data]);

  const tagCounts = tagsSummary?.tags || [];
  const tierCounts = tagsSummary?.tiers || [];
  const bankTotal = tagsSummary?.total ?? totalProblems;

  const difficultyLabel = (d: string) => (d === "easy" ? "Dễ" : d === "medium" ? "TB" : "Khó");
  const selectedTagPreview = selectedTags.slice(0, 2);
  const remainingSelected = Math.max(selectedTags.length - selectedTagPreview.length, 0);
  const hasAnyFilter =
    selectedTags.length > 0 ||
    selectedDifficulties.length > 0 ||
    !!selectedTier ||
    (!isTeacher && solvedFilter !== "all") ||
    (isTeacher && !!statusFilter) ||
    !!debouncedSearch;

  const clearAllFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setSelectedTags([]);
    setSelectedDifficulties([]);
    setSelectedTier("");
    setSolvedFilter("all");
    setStatusFilter("");
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <img
          src="/cp-roadmap/hero-banner.jpg"
          alt="Thư viện đề lập trình CodeClass"
          className="absolute inset-0 h-full w-full object-cover object-right opacity-75 dark:opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/90 to-white/35 dark:from-background/95 dark:via-background/90 dark:to-background/60" />
        <div className="relative z-10 flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Thư viện đề bài
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{bankTotal} bài tập</span>
              {tagsSummary?.difficulties && (
                <>
                  <span>·</span>
                  <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {tagsSummary.difficulties.easy} Dễ
                  </span>
                  <span>·</span>
                  <span className="text-amber-700 dark:text-amber-300 tabular-nums">
                    {tagsSummary.difficulties.medium} Trung bình
                  </span>
                  <span>·</span>
                  <span className="text-rose-700 dark:text-rose-400 tabular-nums">
                    {tagsSummary.difficulties.hard} Khó
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => navigate("/problems/roadmap")}>
              <Compass className="size-3.5 text-primary" /> Lộ trình CP 4 Tầng
            </Button>
            {isTeacher && (
              <>
                <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                  <PackagePlus className="size-3.5" /> Import kho đề CP
                </Button>
                <Button size="sm" onClick={() => navigate("/problems/new")}>
                  <Plus className="size-3.5" /> Tạo đề mới
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {isTeacher && (
        <ProblemPackImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-xs flex-1" role="search">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="problem-search" className="sr-only">
            Tìm kiếm đề bài
          </label>
          <Input
            id="problem-search"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Tìm theo tên hoặc nội dung đề..."
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {[
            { value: "easy", label: "Dễ", count: tagsSummary?.difficulties?.easy },
            { value: "medium", label: "Trung bình", count: tagsSummary?.difficulties?.medium },
            { value: "hard", label: "Khó", count: tagsSummary?.difficulties?.hard },
          ].map((level) => {
            const isActive = selectedDifficulties.includes(level.value);
            return (
              <Button
                key={level.value}
                variant={isActive ? "secondary" : "outline"}
                size="xs"
                onClick={() => {
                  setPage(1);
                  setSelectedDifficulties((prev) =>
                    prev.includes(level.value)
                      ? prev.filter((v) => v !== level.value)
                      : [...prev, level.value],
                  );
                }}
                className="h-7 rounded-full px-2.5 text-[11px]"
              >
                {level.label}
                {typeof level.count === "number" && (
                  <span className="ml-1 text-[10px] opacity-70 tabular-nums">{level.count}</span>
                )}
              </Button>
            );
          })}
        </div>

        {tierCounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {tierCounts.map((t) => {
              const active = selectedTier === t.tag;
              const label = t.tag.replace(/^t/, "T");
              return (
                <Button
                  key={t.tag}
                  variant={active ? "secondary" : "outline"}
                  size="xs"
                  onClick={() => {
                    setPage(1);
                    setSelectedTier((prev) => (prev === t.tag ? "" : t.tag));
                  }}
                  className="h-7 rounded-full px-2.5 text-[11px]"
                >
                  {label}
                  <span className="ml-1 text-[10px] opacity-70 tabular-nums">{t.count}</span>
                </Button>
              );
            })}
          </div>
        )}

        {!isTeacher && (
          <div className="flex items-center gap-1">
            {[
              { value: "all", label: "Tất cả" },
              { value: "unsolved", label: "Chưa làm" },
              { value: "solved", label: "Đã giải" },
            ].map((opt) => (
              <Button
                key={opt.value}
                variant={solvedFilter === opt.value ? "secondary" : "outline"}
                size="xs"
                onClick={() => {
                  setPage(1);
                  setSolvedFilter(opt.value as typeof solvedFilter);
                }}
                className="h-7 rounded-full px-2.5 text-[11px]"
              >
                {opt.label}
              </Button>
            ))}
          </div>
        )}

        {isTeacher && (
          <select
            aria-label="Trạng thái đề"
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value);
            }}
            className="h-7 rounded-full border border-input bg-card px-2.5 text-[11px] font-medium text-foreground outline-none focus:border-ring"
          >
            <option value="">Trạng thái: Đang dùng</option>
            <option value="published">Đã xuất bản</option>
            <option value="draft">Bản nháp</option>
            <option value="archived">Đã lưu trữ</option>
          </select>
        )}

        <label htmlFor="problem-sort" className="sr-only">
          Sắp xếp
        </label>
        <div className="relative inline-flex h-7 items-center rounded-full border border-input bg-card pl-3 pr-2.5 text-[11px] font-medium text-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span>
              {sortBy === "title_asc"
                ? "Tên A → Z"
                : sortBy === "title_desc"
                  ? "Tên Z → A"
                  : sortBy === "difficulty"
                    ? "Độ khó tăng dần"
                    : sortBy === "time_asc"
                      ? "Thời gian tăng dần"
                      : sortBy === "time_desc"
                        ? "Thời gian giảm dần"
                        : "Mới nhất"}
            </span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </span>
          <select
            id="problem-sort"
            data-slot="problem-sort"
            value={sortBy}
            onChange={(e) => {
              setPage(1);
              setSortBy(e.target.value);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            <option value="default">Mới nhất</option>
            <option value="title_asc">Tên A → Z</option>
            <option value="title_desc">Tên Z → A</option>
            <option value="difficulty">Độ khó tăng dần</option>
            <option value="time_asc">Thời gian tăng dần</option>
            <option value="time_desc">Thời gian giảm dần</option>
          </select>
        </div>

        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="h-8 px-2 text-xs"
          >
            <X className="size-3.5" /> Xóa lọc
          </Button>
        )}

        <Button
          variant={sidebarOpen ? "secondary" : "outline"}
          size="sm"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="h-8 px-2.5 text-xs"
        >
          {sidebarOpen ? <ChevronLeft className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          Chủ đề {selectedTags.length > 0 && `(${selectedTags.length})`}
        </Button>
      </div>

      <div className="flex gap-4">
        {sidebarOpen && (
          <div className="hidden w-48 shrink-0 md:block lg:w-52">
            <div className="sticky top-4 rounded-xl border border-border bg-card p-3 shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Chủ đề</h3>
                {selectedTags.length > 0 && (
                  <span className="text-[10px] font-medium text-primary">{selectedTags.length} chọn</span>
                )}
              </div>
              <div className="max-h-[60vh] space-y-0.5 overflow-y-auto pr-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setPage(1);
                    setSelectedTags([]);
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-xs transition-colors ${
                    selectedTags.length === 0
                      ? "bg-muted font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <span>Tất cả kho đề</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{bankTotal}</span>
                </button>
                {tagCounts.map(({ tag, count }) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setPage(1);
                      setSelectedTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                      );
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-xs transition-colors ${
                      selectedTags.includes(tag)
                        ? "bg-muted font-semibold text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <span className="truncate">{tag}</span>
                    <span className="ml-2 shrink-0 text-[11px] tabular-nums text-muted-foreground">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          {isLoading ? (
            <SkeletonTable rows={8} cols={4} />
          ) : isError ? (
            <ErrorState title="Không tải được danh sách đề bài" onRetry={() => refetch()} />
          ) : !problems.length ? (
            <EmptyState
              icon={<Code className="h-5 w-5" />}
              title="Không tìm thấy đề bài"
              text="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
                <span>
                  Trang {page}/{totalPages} · {problems.length} đề trên trang này (tổng{" "}
                  <strong className="font-semibold text-foreground tabular-nums">{totalProblems}</strong> đề khớp)
                </span>
                {hasAnyFilter && (
                  <div className="flex flex-wrap items-center gap-1.5 text-foreground">
                    <span className="hidden md:inline">Đã lọc:</span>
                    {selectedTier && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {selectedTier}
                      </span>
                    )}
                    {selectedTagPreview.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                        {tag}
                      </span>
                    ))}
                    {remainingSelected > 0 && (
                      <span className="text-[11px] text-muted-foreground">+{remainingSelected}</span>
                    )}
                    {selectedDifficulties.map((level) => (
                      <span key={level} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                        {difficultyLabel(level)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3 px-4 py-3 md:hidden">
                {problems.map((p: any) => {
                  const isSolved = !isTeacher && solvedIds.has(p.id);
                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Mở đề bài ${p.title || ""}`}
                      className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      onClick={() => navigate(`/problems/${p.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/problems/${p.id}`);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{p.title}</p>
                            {isSolved && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" /> Đã giải
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {formatProblemPreview(p.shortDescription)}
                          </p>
                        </div>
                        {isTeacher && (
                          <div className="flex shrink-0 gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/problems/${p.id}/edit`);
                              }}
                              className="text-muted-foreground hover:text-foreground"
                              title="Chỉnh sửa"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const ok = await confirm({
                                  title: "Xóa đề",
                                  message: "Xóa đề này?",
                                  variant: "danger",
                                });
                                if (ok) deleteMutation.mutate(p.id);
                              }}
                              className="text-muted-foreground hover:text-destructive"
                              title="Xóa"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <DifficultyBadge difficulty={p.difficulty} />
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                          <Timer className="h-3.5 w-3.5" />
                          {formatLimitSec(p.timeLimitMs)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {p.estimatedTime ? `${p.estimatedTime}p` : "-"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {p.tags?.slice(0, MAX_TAGS_VISIBLE_MOBILE).map((t: any) => (
                          <span
                            key={t.tag}
                            className={`rounded-md px-2 py-0.5 text-xs font-medium ${TAG_CLASS}`}
                          >
                            {t.tag}
                          </span>
                        ))}
                        {p.tags?.length > MAX_TAGS_VISIBLE_MOBILE && (
                          <span className="py-0.5 text-xs text-muted-foreground">
                            +{p.tags.length - MAX_TAGS_VISIBLE_MOBILE}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[44%] px-4 py-2 text-[11px]">Tiêu đề</TableHead>
                      <TableHead className="w-24 px-3 py-2 text-[11px]">Độ khó</TableHead>
                      <TableHead className="w-[28%] px-3 py-2 text-[11px]">Chủ đề</TableHead>
                      <TableHead className="w-24 px-3 py-2 text-[11px]">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          <span>Giới hạn</span>
                        </span>
                      </TableHead>
                      {isTeacher && <TableHead className="w-16 px-3 py-2" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {problems.map((p: any) => {
                      const isSolved = !isTeacher && solvedIds.has(p.id);
                      return (
                        <TableRow
                          key={p.id}
                          className="group cursor-pointer"
                          onClick={() => navigate(`/problems/${p.id}`)}
                        >
                          <TableCell className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-[13px] font-medium text-foreground">{p.title}</p>
                              {isSolved && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                                  <CheckCircle2 className="size-2.5" /> AC
                                </span>
                              )}
                              {isTeacher && p.status !== "published" && (
                                <span className="inline-flex shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                  {p.status}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                              {formatProblemPreview(p.shortDescription)}
                            </p>
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <DifficultyBadge difficulty={p.difficulty} />
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {p.tags?.slice(0, MAX_TAGS_VISIBLE).map((t: any) => (
                                <span
                                  key={t.tag}
                                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TAG_CLASS}`}
                                >
                                  {t.tag}
                                </span>
                              ))}
                              {p.tags?.length > MAX_TAGS_VISIBLE && (
                                <span className="py-0.5 text-[11px] text-muted-foreground">
                                  +{p.tags.length - MAX_TAGS_VISIBLE}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2 text-[11px] text-muted-foreground tabular-nums">
                            <div className="flex items-center gap-2">
                              <span title="Time limit">{formatLimitSec(p.timeLimitMs)}</span>
                              {p.estimatedTime && <span className="opacity-70">· {p.estimatedTime}p</span>}
                            </div>
                          </TableCell>
                          {isTeacher && (
                            <TableCell className="px-3 py-2">
                              <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/problems/${p.id}/edit`);
                                  }}
                                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                  title="Chỉnh sửa"
                                >
                                  <Edit className="size-3.5" />
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const ok = await confirm({
                                      title: "Xóa đề",
                                      message: "Xóa đề này?",
                                      variant: "danger",
                                    });
                                    if (ok) deleteMutation.mutate(p.id);
                                  }}
                                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                                  title="Xóa"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || isLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" /> Trước
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Trang {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || isLoading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Sau <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
