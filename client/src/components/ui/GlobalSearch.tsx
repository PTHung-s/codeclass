import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  BookOpen,
  Code,
  X,
  GraduationCap,
  PlayCircle,
  ClipboardCheck,
  FolderOpen,
  ListChecks,
} from "lucide-react";
import api from "../../lib/api";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";

interface SearchResult {
  courses: { id: string; title: string; kind: string; status: string }[];
  lessons: { id: string; title: string; module: { title: string }; course: { id: string; title: string } }[];
  sessionLessons: { id: string; title: string; orderIndex: number; courseId: string; course: { id: string; title: string } }[];
  problems: { id: string; title: string; difficulty: string; tags: { tag: string }[] }[];
  exams: { id: string; title: string; subject: string; status: string; durationMinutes: number }[];
  materials: { id: string; title: string; type: string }[];
  assignments: { id: string; title: string; problemId: string | null; deadline: string | null }[];
}

interface FlatItem {
  key: string;
  to: string;
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const { user } = useAuthContext();
  const staff = isStaff(user?.role);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => {
          const next = !prev;
          if (next) setTimeout(() => inputRef.current?.focus(), 40);
          return next;
        });
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      setActiveIndex(0);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get("/search", { params: { q: query.trim() } });
        setResults(res.data);
        setActiveIndex(0);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const difficultyLabel = (d: string) => (d === "easy" ? "Dễ" : d === "medium" ? "TB" : "Khó");

  const flatItems = useMemo<FlatItem[]>(() => {
    if (!results) return [];
    const items: FlatItem[] = [];
    for (const c of results.courses || []) {
      items.push({ key: `course:${c.id}`, to: c.kind === "session" ? `/course/${c.id}` : `/courses/${c.id}` });
    }
    for (const s of results.sessionLessons || []) {
      items.push({ key: `session:${s.id}`, to: `/course/${s.courseId}/lesson/${s.id}` });
    }
    for (const l of results.lessons || []) {
      items.push({ key: `lesson:${l.id}`, to: `/lessons/${l.id}` });
    }
    for (const p of results.problems || []) {
      items.push({ key: `problem:${p.id}`, to: `/problems/${p.id}` });
    }
    for (const e of results.exams || []) {
      items.push({ key: `exam:${e.id}`, to: `/exams/${e.id}` });
    }
    for (const a of results.assignments || []) {
      const to = staff ? "/assignments" : "/my-assignments";
      items.push({ key: `assign:${a.id}`, to });
    }
    for (const m of results.materials || []) {
      items.push({ key: `mat:${m.id}`, to: `/materials/${m.id}` });
    }
    return items;
  }, [results, staff]);

  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    flatItems.forEach((item, idx) => map.set(item.key, idx));
    return map;
  }, [flatItems]);

  const handleNavigate = (to: string) => {
    setOpen(false);
    setQuery("");
    setResults(null);
    setActiveIndex(0);
    navigate(to);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flatItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % flatItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flatItems[activeIndex];
      if (target) handleNavigate(target.to);
    }
  };

  const hasAnyResults = flatItems.length > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 40);
        }}
        className="flex h-8 w-44 items-center gap-2 rounded-[7px] border border-border bg-muted/45 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:w-52"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="truncate text-left">Tìm kiếm...</span>
        <kbd className="ml-auto hidden items-center rounded border border-border bg-background px-1 py-0.5 font-sans text-[10px] leading-none text-muted-foreground lg:inline-flex">
          Ctrl+K
        </kbd>
      </button>

      {open && (
        <div className="dropdown-in fixed inset-x-3 top-14 z-50 mx-auto max-w-[500px] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-elevated sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:w-[460px]">
          <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              data-slot="global-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Tìm khóa học, bài học, đề bài, phòng thi, tài liệu..."
              className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">Đang tìm...</div>
            ) : null}

            {results && !hasAnyResults && !loading ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">Không tìm thấy kết quả</div>
            ) : null}

            {results?.courses && results.courses.length > 0 ? (
              <div>
                <div className="bg-muted/50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Khóa học
                </div>
                {results.courses.map((c) => {
                  const idx = indexMap.get(`course:${c.id}`) ?? -1;
                  const to = c.kind === "session" ? `/course/${c.id}` : `/courses/${c.id}`;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onMouseEnter={() => idx >= 0 && setActiveIndex(idx)}
                      onClick={() => handleNavigate(to)}
                      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                        idx === activeIndex ? "bg-muted/80" : "hover:bg-muted/50"
                      }`}
                    >
                      <GraduationCap className="size-4 shrink-0 text-indigo-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground sm:text-sm">{c.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {c.kind === "session" ? "Khóa học theo buổi" : "Khóa học nội dung"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {results?.sessionLessons && results.sessionLessons.length > 0 ? (
              <div>
                <div className="bg-muted/50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Buổi học
                </div>
                {results.sessionLessons.map((s) => {
                  const idx = indexMap.get(`session:${s.id}`) ?? -1;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onMouseEnter={() => idx >= 0 && setActiveIndex(idx)}
                      onClick={() => handleNavigate(`/course/${s.courseId}/lesson/${s.id}`)}
                      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                        idx === activeIndex ? "bg-muted/80" : "hover:bg-muted/50"
                      }`}
                    >
                      <PlayCircle className="size-4 shrink-0 text-sky-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground sm:text-sm">
                          Buổi {s.orderIndex}: {s.title}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">{s.course.title}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {results?.lessons && results.lessons.length > 0 ? (
              <div>
                <div className="bg-muted/50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Bài học
                </div>
                {results.lessons.map((l) => {
                  const idx = indexMap.get(`lesson:${l.id}`) ?? -1;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onMouseEnter={() => idx >= 0 && setActiveIndex(idx)}
                      onClick={() => handleNavigate(`/lessons/${l.id}`)}
                      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                        idx === activeIndex ? "bg-muted/80" : "hover:bg-muted/50"
                      }`}
                    >
                      <BookOpen className="size-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground sm:text-sm">{l.title}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {l.course.title} · {l.module.title}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {results?.problems && results.problems.length > 0 ? (
              <div>
                <div className="bg-muted/50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Đề bài
                </div>
                {results.problems.map((p) => {
                  const idx = indexMap.get(`problem:${p.id}`) ?? -1;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onMouseEnter={() => idx >= 0 && setActiveIndex(idx)}
                      onClick={() => handleNavigate(`/problems/${p.id}`)}
                      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                        idx === activeIndex ? "bg-muted/80" : "hover:bg-muted/50"
                      }`}
                    >
                      <Code className="size-4 shrink-0 text-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground sm:text-sm">{p.title}</p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span
                            className={
                              p.difficulty === "easy"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : p.difficulty === "medium"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-red-600 dark:text-red-400"
                            }
                          >
                            {difficultyLabel(p.difficulty)}
                          </span>
                          {p.tags?.slice(0, 2).map((t) => (
                            <span key={t.tag}>{t.tag}</span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {results?.exams && results.exams.length > 0 ? (
              <div>
                <div className="bg-muted/50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Phòng thi
                </div>
                {results.exams.map((e) => {
                  const idx = indexMap.get(`exam:${e.id}`) ?? -1;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onMouseEnter={() => idx >= 0 && setActiveIndex(idx)}
                      onClick={() => handleNavigate(`/exams/${e.id}`)}
                      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                        idx === activeIndex ? "bg-muted/80" : "hover:bg-muted/50"
                      }`}
                    >
                      <ClipboardCheck className="size-4 shrink-0 text-amber-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground sm:text-sm">{e.title}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {e.subject} · {e.durationMinutes} phút
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {results?.assignments && results.assignments.length > 0 ? (
              <div>
                <div className="bg-muted/50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Bài tập
                </div>
                {results.assignments.map((a) => {
                  const idx = indexMap.get(`assign:${a.id}`) ?? -1;
                  const to = staff ? "/assignments" : "/my-assignments";
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onMouseEnter={() => idx >= 0 && setActiveIndex(idx)}
                      onClick={() => handleNavigate(to)}
                      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                        idx === activeIndex ? "bg-muted/80" : "hover:bg-muted/50"
                      }`}
                    >
                      <ListChecks className="size-4 shrink-0 text-rose-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground sm:text-sm">{a.title}</p>
                        {a.deadline ? (
                          <p className="text-[11px] text-muted-foreground">
                            Hạn: {new Date(a.deadline).toLocaleDateString("vi-VN")}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {results?.materials && results.materials.length > 0 ? (
              <div>
                <div className="bg-muted/50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tài liệu
                </div>
                {results.materials.map((m) => {
                  const idx = indexMap.get(`mat:${m.id}`) ?? -1;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onMouseEnter={() => idx >= 0 && setActiveIndex(idx)}
                      onClick={() => handleNavigate(`/materials/${m.id}`)}
                      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                        idx === activeIndex ? "bg-muted/80" : "hover:bg-muted/50"
                      }`}
                    >
                      <FolderOpen className="size-4 shrink-0 text-teal-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground sm:text-sm">{m.title}</p>
                        <p className="text-[11px] uppercase text-muted-foreground">{m.type}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {!results && !loading ? (
            <div className="px-4 py-5 text-center text-xs text-muted-foreground">
              Gõ ít nhất 2 ký tự · dùng ↑ ↓ và Enter để mở nhanh
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
