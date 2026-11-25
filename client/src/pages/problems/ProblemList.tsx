import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import api from "../../lib/api";
import { Plus, Search, Edit, Trash2, Code, X, ChevronLeft, ChevronRight, Clock, CheckCircle2 } from "lucide-react";
import { useConfirmContext } from "../../hooks/useConfirm";
import { SkeletonTable } from "../../components/ui/skeletons";
import { ErrorState, EmptyState } from "../../components/ui/StateViews";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PageHeader } from "../../components/ui/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../components/ui/table";
import { DifficultyBadge } from "../../components/ui/Badges";

interface TagCount {
  tag: string;
  count: number;
}

const TOP_TAGS = [
  "số học", "mảng", "đồ thị", "toán học", "xâu", "tối ưu",
  "cây", "quy hoạch động", "truy vấn", "hình học", "sắp xếp",
  "tìm kiếm nhị phân", "tham lam", "vét cạn", "đệ quy",
  "vòng lặp", "điều kiện", "input/output",
];

// One neutral tag treatment — hue-coding 18 topics read as noise, not signal.
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

export default function ProblemList() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isTeacher = isStaff(user?.role);
  const confirm = useConfirmContext();

  const [search, setSearch] = useState("");
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sortBy, setSortBy] = useState("default");
  const [solvedFilter, setSolvedFilter] = useState<"all" | "solved" | "unsolved">("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 40;

  // Reset to first page when search changes so results stay in sync with the query.
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const { data: problemsResponse, isLoading, isError, refetch } = useQuery({
    queryKey: ["problems", search, page, selectedDifficulties, selectedTags],
    queryFn: () =>
      api.get("/problems", {
        params: {
          search: search || undefined,
          difficulty: selectedDifficulties.length === 1 ? selectedDifficulties[0] : undefined,
          tag: selectedTags.length === 1 ? selectedTags[0] : undefined,
          page,
          limit: PAGE_SIZE,
        },
      }).then((r) => r.data),
  });

    const solvedQuery = useQuery({
      queryKey: ["problemProgress", "solved"],
      queryFn: () => api.get("/problems/progress/solved").then((r) => r.data),
      enabled: !isTeacher,
    });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/problems/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["problems"] }),
  });

  const normalizedProblems = useMemo(() => {
    const raw = problemsResponse;
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.problems)) return raw.problems;
    return [];
  }, [problemsResponse]);
  const totalProblems = typeof problemsResponse?.total === "number" ? problemsResponse.total : normalizedProblems.length;
  const totalPages = typeof problemsResponse?.totalPages === "number"
    ? Math.max(1, problemsResponse.totalPages)
    : Math.max(1, Math.ceil(totalProblems / PAGE_SIZE));
  // Tag sidebar counts are approximate on the current page when multi-tag filter is client-side.
  const tagCounts = computeTagCounts(normalizedProblems);
  const solvedIds = useMemo(() => {
    const ids = solvedQuery.data?.problemIds || [];
    return new Set<string>(ids);
  }, [solvedQuery.data]);

  const filteredByTagsAndDiff = normalizedProblems.filter((p: any) => {
    const matchesTags = selectedTags.length === 0
      || selectedTags.every((tag) => p.tags?.some((t: any) => t.tag === tag));
    const matchesDifficulty = selectedDifficulties.length === 0
      || selectedDifficulties.includes(p.difficulty);
    return matchesTags && matchesDifficulty;
  });

  const filteredProblems = isTeacher
    ? filteredByTagsAndDiff
    : solvedFilter === "all"
      ? filteredByTagsAndDiff
      : solvedFilter === "solved"
        ? filteredByTagsAndDiff.filter((p: any) => solvedIds.has(p.id))
        : filteredByTagsAndDiff.filter((p: any) => !solvedIds.has(p.id));

  const difficultyOrder: Record<string, number> = { easy: 1, medium: 2, hard: 3 };
  const sortedProblems = [...filteredProblems].sort((a: any, b: any) => {
    if (sortBy === "title_asc") {
      return String(a.title || "").localeCompare(String(b.title || ""), "vi");
    }
    if (sortBy === "title_desc") {
      return String(b.title || "").localeCompare(String(a.title || ""), "vi");
    }
    if (sortBy === "time_asc") {
      return (a.estimatedTime ?? Number.MAX_SAFE_INTEGER) - (b.estimatedTime ?? Number.MAX_SAFE_INTEGER);
    }
    if (sortBy === "time_desc") {
      return (b.estimatedTime ?? -1) - (a.estimatedTime ?? -1);
    }
    if (sortBy === "difficulty") {
      return (difficultyOrder[a.difficulty] ?? 99) - (difficultyOrder[b.difficulty] ?? 99);
    }
    return 0;
  });

  const difficultyLabel = (d: string) => d === "easy" ? "Dễ" : d === "medium" ? "TB" : "Khó";
  const selectedTagPreview = selectedTags.slice(0, 2);
  const remainingSelected = Math.max(selectedTags.length - selectedTagPreview.length, 0);
  const hasAnyFilter = selectedTags.length > 0 || selectedDifficulties.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Thư viện đề bài"
        actions={
          isTeacher ? (
            <Button size="sm" onClick={() => navigate("/problems/new")}>
              <Plus className="size-3.5" /> Tạo đề mới
            </Button>
          ) : undefined
        }
      />

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
            placeholder="Tìm kiếm đề bài..."
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {[
            { value: "easy", label: "Dễ" },
            { value: "medium", label: "Trung bình" },
            { value: "hard", label: "Khó" },
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
                      : [...prev, level.value]
                  );
                }}
                className="h-7 rounded-full px-2.5 text-[11px]"
              >
                {level.label}
              </Button>
            );
          })}
        </div>

        {!isTeacher && (
          <div className="flex items-center gap-1">
            {[
              { value: "all", label: "Tất cả" },
              { value: "unsolved", label: "Chưa làm" },
              { value: "solved", label: "Đã làm" },
            ].map((opt) => (
              <Button
                key={opt.value}
                variant={solvedFilter === opt.value ? "secondary" : "outline"}
                size="xs"
                onClick={() => setSolvedFilter(opt.value as typeof solvedFilter)}
                className="h-7 rounded-full px-2.5 text-[11px]"
              >
                {opt.label}
              </Button>
            ))}
          </div>
        )}

        <label htmlFor="problem-sort" className="sr-only">
          Sắp xếp
        </label>
        <select
          id="problem-sort"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="h-8 rounded-lg border border-input bg-card px-2.5 py-0 text-xs leading-none outline-none focus:border-ring"
        >
          <option value="default">Sắp xếp mặc định</option>
          <option value="title_asc">Tên A → Z</option>
          <option value="title_desc">Tên Z → A</option>
          <option value="difficulty">Độ khó tăng dần</option>
          <option value="time_asc">Thời gian tăng dần</option>
          <option value="time_desc">Thời gian giảm dần</option>
        </select>

        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedTags([]);
              setSelectedDifficulties([]);
            }}
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
          <div className="hidden w-44 shrink-0 md:block lg:w-48">
            <div className="sticky top-4 rounded-xl border border-border bg-card p-3 shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Chủ đề</h3>
                {selectedTags.length > 0 && (
                  <span className="text-[10px] font-medium text-primary">{selectedTags.length} chọn</span>
                )}
              </div>
              <div className="max-h-[56vh] space-y-0.5 overflow-y-auto pr-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedTags([])}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-xs transition-colors ${selectedTags.length === 0 ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                >
                  <span>Tất cả</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{normalizedProblems.length}</span>
                </button>
                {tagCounts
                  .filter((t) => TOP_TAGS.includes(t.tag))
                  .map(({ tag, count }) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setPage(1);
                      setSelectedTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                      );
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-xs transition-colors ${selectedTags.includes(tag) ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                  >
                    <span className="truncate">{tag}</span>
                    <span className="ml-2 shrink-0 text-[11px] tabular-nums text-muted-foreground">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0">
          {isLoading ? (
            <SkeletonTable rows={8} cols={4} />
          ) : isError ? (
            <ErrorState
              title="Không tải được danh sách đề bài"
              onRetry={() => refetch()}
            />
          ) : !filteredProblems?.length ? (
            <EmptyState
              icon={<Code className="h-5 w-5" />}
              title="Không tìm thấy đề bài"
              text="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm."
            />
          ) : (
            <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-muted/50 text-xs text-muted-foreground flex items-center justify-between gap-3">
                <span>
                  Trang {page}/{totalPages} · {sortedProblems.length} đề
                  {totalProblems > 0 ? ` (tổng ~${totalProblems})` : ""}
                </span>
                {hasAnyFilter && (
                  <div className="flex items-center gap-1.5 text-foreground flex-wrap">
                    <span className="hidden md:inline">Đã lọc:</span>
                    {selectedTagPreview.map((tag) => (
                      <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-muted">
                        {tag}
                      </span>
                    ))}
                    {remainingSelected > 0 && (
                      <span className="text-[11px] text-muted-foreground">+{remainingSelected}</span>
                    )}
                    {selectedDifficulties.map((level) => (
                      <span key={level} className="text-[11px] px-2 py-0.5 rounded-full bg-muted">
                        {difficultyLabel(level)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="md:hidden px-4 py-3 space-y-3">
                {sortedProblems.map((p: any) => {
                  const isSolved = !isTeacher && solvedIds.has(p.id);
                  return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Mở đề bài ${p.title || ""}`}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow transition-shadow cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
                          <p className="text-sm font-semibold text-foreground truncate">{p.title}</p>
                          {isSolved && (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" /> Đã làm
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{formatProblemPreview(p.shortDescription)}</p>
                      </div>
                      {isTeacher && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={(e) => { e.stopPropagation(); navigate(`/problems/${p.id}/edit`); }}
                            className="text-muted-foreground hover:text-foreground"
                            title="Chỉnh sửa"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={async (e) => { e.stopPropagation(); const ok = await confirm({ title: "Xóa đề", message: "Xóa đề này?", variant: "danger" }); if (ok) deleteMutation.mutate(p.id); }}
                            className="text-muted-foreground hover:text-destructive"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <DifficultyBadge difficulty={p.difficulty} />
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                        <Clock className="w-3.5 h-3.5" />
                        {p.estimatedTime ? `${p.estimatedTime}p` : "-"}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-1.5 flex-wrap">
                      {p.tags?.slice(0, MAX_TAGS_VISIBLE_MOBILE).map((t: any) => (
                        <span
                          key={t.tag}
                          className={`text-xs px-2 py-0.5 rounded-md font-medium ${TAG_CLASS}`}
                        >
                          {t.tag}
                        </span>
                      ))}
                      {p.tags?.length > MAX_TAGS_VISIBLE_MOBILE && (
                        <span className="text-xs text-muted-foreground py-0.5">+{p.tags.length - MAX_TAGS_VISIBLE_MOBILE}</span>
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
                      <TableHead className="w-[46%] px-4 py-2 text-[11px]">Tiêu đề</TableHead>
                      <TableHead className="w-24 px-3 py-2 text-[11px]">Độ khó</TableHead>
                      <TableHead className="w-[30%] px-3 py-2 text-[11px]">Chủ đề</TableHead>
                      <TableHead className="w-20 px-3 py-2 text-[11px]">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          <span className="hidden sm:inline">T/gian</span>
                        </span>
                      </TableHead>
                      {isTeacher && <TableHead className="w-16 px-3 py-2" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedProblems.map((p: any) => {
                      const isSolved = !isTeacher && solvedIds.has(p.id);
                      return (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer group"
                        onClick={() => navigate(`/problems/${p.id}`)}
                      >
                        <TableCell className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[13px] font-medium text-foreground">{p.title}</p>
                            {isSolved && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="size-2.5" /> Đã làm
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{formatProblemPreview(p.shortDescription)}</p>
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
                              <span className="py-0.5 text-[11px] text-muted-foreground">+{p.tags.length - MAX_TAGS_VISIBLE}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-2 text-[11px] text-muted-foreground tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" />
                            {p.estimatedTime ? `${p.estimatedTime}p` : "-"}
                          </span>
                        </TableCell>
                        {isTeacher && (
                          <TableCell className="px-3 py-2">
                            <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/problems/${p.id}/edit`); }}
                                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title="Chỉnh sửa"
                              >
                                <Edit className="size-3.5" />
                              </button>
                              <button
                                onClick={async (e) => { e.stopPropagation(); const ok = await confirm({ title: "Xóa đề", message: "Xóa đề này?", variant: "danger" }); if (ok) deleteMutation.mutate(p.id); }}
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

function computeTagCounts(problems: any[]): TagCount[] {
  const counts: Record<string, number> = {};
  for (const p of problems || []) {
    const seen = new Set<string>();
    for (const t of p.tags || []) {
      const tag = t.tag;
      if (!seen.has(tag) && TOP_TAGS.includes(tag)) {
        counts[tag] = (counts[tag] || 0) + 1;
        seen.add(tag);
      }
    }
  }
  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}
