import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, BookOpen, Code, X } from "lucide-react";
import api from "../../lib/api";

interface SearchResult {
  lessons: { id: string; title: string; module: { title: string }; course: { id: string; title: string } }[];
  problems: { id: string; title: string; difficulty: string; tags: { tag: string }[] }[];
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (query.length < 2) {
      setResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get("/search", { params: { q: query } });
        setResults(res.data);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const difficultyLabel = (d: string) => (d === "easy" ? "Dễ" : d === "medium" ? "TB" : "Khó");

  const handleSelect = (type: string, id: string) => {
    setOpen(false);
    setQuery("");
    setResults(null);
    if (type === "lesson") navigate(`/lessons/${id}`);
    else if (type === "problem") navigate(`/problems/${id}`);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="flex w-48 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate text-left">Tìm kiếm...</span>
        <kbd className="ml-auto hidden items-center rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground lg:inline-flex">
          Ctrl+K
        </kbd>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[480px] max-w-[90vw] -translate-x-1/4 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-elevated">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm bài học, đề bài..."
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {query ? (
              <button
                onClick={() => setQuery("")}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">Đang tìm...</div>
            ) : null}

            {results && !results.lessons.length && !results.problems.length ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">Không tìm thấy kết quả</div>
            ) : null}

            {results?.lessons && results.lessons.length > 0 ? (
              <div>
                <div className="bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Bài học
                </div>
                {results.lessons.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => handleSelect("lesson", l.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60"
                  >
                    <BookOpen className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{l.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.course.title} · {l.module.title}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            {results?.problems && results.problems.length > 0 ? (
              <div>
                <div className="bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Đề bài
                </div>
                {results.problems.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelect("problem", p.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60"
                  >
                    <Code className="h-4 w-4 shrink-0 text-emerald-500" />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{p.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                        {p.tags?.slice(0, 2).map((t: any) => (
                          <span key={t.tag}>{t.tag}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {!results && !loading ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Gõ ít nhất 2 ký tự để tìm kiếm
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
