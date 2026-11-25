import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Lamp, Plus, Trophy, X } from "lucide-react";
import api from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { useToast } from "../../../hooks/useToast";
import { languageForCourse } from "../../../lib/courseExperience";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Card, CardContent } from "../../ui/card";
import type { ArenaTypeConfig } from "./arenaBrowseConfig";

interface StudentOption {
  id: string;
  fullName: string;
  email: string;
}

interface CourseOption {
  id: string;
  title: string;
  description?: string | null;
}

/**
 * Create form for both arenas. Numeric bounds here mirror `clampInt` in
 * `server/src/routes/debugArena.ts` so the form can't submit a value the server
 * will silently rewrite.
 */
export function ArenaCreateForm({ cfg }: { cfg: ArenaTypeConfig }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { Icon } = cfg;

  const [title, setTitle] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [secondsPerQuestion, setSecondsPerQuestion] = useState(cfg.create.seconds);
  const [revealSeconds, setRevealSeconds] = useState(cfg.create.reveal);
  const [courseId, setCourseId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [languages, setLanguages] = useState<string[]>(["python"]);
  // Once the teacher touches the language pills, their choice wins and the
  // course dropdown stops steering it.
  const [languageTouched, setLanguageTouched] = useState(false);
  const [tokens, setTokens] = useState<number[]>([30, 20, 10]);
  const [players, setPlayers] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [chaosEnabled, setChaosEnabled] = useState(false);

  const { data: students = [] } = useQuery<StudentOption[]>({
    queryKey: ["students-list"],
    queryFn: () => api.get("/users?limit=200&role=student").then((r) => (Array.isArray(r.data) ? r.data : r.data?.users || [])),
  });
  const { data: courses = [] } = useQuery<CourseOption[]>({
    queryKey: ["courses-list"],
    queryFn: () => api.get("/courses").then((r) => (Array.isArray(r.data) ? r.data : r.data?.courses || [])),
  });
  const { data: modules = [] } = useQuery<{ id: string; title: string }[]>({
    queryKey: ["modules-list", courseId],
    queryFn: () => api.get(`/courses/${courseId}/modules`).then((r) => r.data),
    enabled: !!courseId,
  });

  const selectedCourse = courses.find((c) => c.id === courseId);
  const courseLanguage = languageForCourse(selectedCourse);
  // Warn rather than block: a teacher may deliberately drill C++ concepts in
  // Python, but the common case is having forgotten to switch.
  const courseLanguageMismatch =
    cfg.languages && !!courseLanguage && languages.length > 0 && !languages.includes(courseLanguage);

  const createMu = useMutation({
    mutationFn: () =>
      api
        .post("/arenas", {
          arenaType: cfg.type,
          title: title.trim(),
          courseId: courseId || undefined,
          moduleId: moduleId || undefined,
          customPrompt: customPrompt || undefined,
          questionCount,
          secondsPerQuestion,
          revealSeconds,
          languages: cfg.languages ? languages : ["python"],
          tokenRewards: tokens,
          playerIds: players,
          chaosEnabled: cfg.chaos && chaosEnabled,
        })
        .then((r) => r.data),
    onSuccess: (match) => navigate(`${cfg.base}/${match.id}`),
    onError: (err: any) =>
      toast.error({ title: "Tạo phòng thất bại", message: err?.response?.data?.error || "Đã có lỗi xảy ra." }),
  });

  const matches = students
    .filter((s) => !players.includes(s.id))
    .filter((s) => `${s.fullName} ${s.email}`.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 8);

  const toggleLang = (lang: string) => {
    setLanguageTouched(true);
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
  };

  const canSubmit = !!title.trim() && (!cfg.languages || languages.length > 0) && !createMu.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <Button variant="ghost" onClick={() => navigate(cfg.base)} className="gap-1 text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Quay lại
      </Button>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-white">
          <Icon className="h-6 w-6 text-blue-600" /> {cfg.createTitle}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{cfg.createBlurb}</p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Tên phòng</span>
            <Input
              placeholder={cfg.type === "quiz" ? "vd: Quiz Arena #1" : "vd: Debug Battle #1"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1"
            />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <NumField label="Số câu" value={questionCount} min={1} max={20} onChange={setQuestionCount} />
            <NumField label="Giây/câu" value={secondsPerQuestion} min={15} max={600} onChange={setSecondsPerQuestion} />
            <NumField label="Giây xem ĐA" value={revealSeconds} min={5} max={180} onChange={setRevealSeconds} />
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">
              Khóa học — để tự cân bằng phạm vi kiến thức (không bắt buộc)
            </span>
            <select
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={courseId}
              onChange={(e) => {
                const nextCourseId = e.target.value;
                setCourseId(nextCourseId);
                setModuleId("");
                // Follow the course's language unless the teacher already chose
                // one by hand. Selecting a C++ chapter used to leave the toggle
                // on Python, so the AI got a C++ focus and emitted Python code.
                if (cfg.languages && !languageTouched) {
                  const lang = languageForCourse(courses.find((c) => c.id === nextCourseId));
                  if (lang) setLanguages([lang]);
                }
              }}
            >
              <option value="">Toàn bộ kiến thức</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Hệ thống giới hạn phạm vi đề theo người chơi có trình độ thấp nhất trong khóa.
            </span>
          </label>

          {modules.length > 0 && (
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">
                Giới hạn đến chương (trống = tự động theo học sinh yếu nhất)
              </span>
              <select
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={moduleId}
                onChange={(e) => setModuleId(e.target.value)}
              >
                <option value="">Tự động</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Lưu ý cho AI (không bắt buộc)</span>
            <Input
              placeholder={cfg.promptPlaceholder}
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="mt-1"
            />
          </label>

          {cfg.languages && (
            <div>
              <span className="text-xs font-semibold text-muted-foreground">Ngôn ngữ (AI tự chọn theo độ khó)</span>
              <div className="mt-1 flex gap-2">
                {["python", "cpp"].map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLang(lang)}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-xs font-semibold transition",
                      languages.includes(lang)
                        ? "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {lang === "cpp" ? "C++" : "Python"}
                  </button>
                ))}
              </div>
              {languages.length === 0 && <p className="mt-1 text-[11px] text-red-500">Chọn ít nhất một ngôn ngữ.</p>}
              {courseLanguageMismatch && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  Khóa "{selectedCourse?.title}" dạy {courseLanguage === "cpp" ? "C++" : "Python"} — đề sẽ ra bằng ngôn
                  ngữ bạn chọn ở trên, có thể lệch với nội dung chương.
                </p>
              )}
            </div>
          )}

          <div>
            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Trophy className="h-3 w-3" /> Tokens thưởng (Top 1 / 2 / 3)
            </span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {tokens.map((t, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                      i === 0 ? "bg-amber-500" : i === 1 ? "bg-gray-400" : "bg-orange-700",
                    )}
                  >
                    {i + 1}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={t}
                    onChange={(e) =>
                      setTokens((prev) => prev.map((v, idx) => (idx === i ? Math.max(0, Number(e.target.value) || 0) : v)))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          {cfg.chaos && (
            <button
              type="button"
              onClick={() => setChaosEnabled((v) => !v)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition",
                chaosEnabled
                  ? "border-amber-400 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100/60 text-amber-950 dark:from-amber-950/50 dark:via-orange-950/40 dark:to-amber-950/30 dark:text-amber-100"
                  : "border-border bg-card hover:border-amber-300 hover:bg-amber-50/40 dark:hover:bg-amber-950/15",
              )}
            >
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  chaosEnabled ? "bg-amber-400 text-amber-950 shadow-lg" : "bg-muted text-muted-foreground",
                )}
              >
                <Lamp className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold">Chaos Debug Arena</span>
                <span className="mt-0.5 block text-xs opacity-75">
                  Cúp điện, đèn dầu và máy phát dự phòng — chỉ dành cho trận đối kháng.
                </span>
                <span className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
                  <span className="rounded-full bg-black/10 px-2 py-0.5">Đến hết câu</span>
                  <span className="rounded-full bg-black/10 px-2 py-0.5">1 lần / câu</span>
                  <span className="rounded-full bg-black/10 px-2 py-0.5">Khóa 15s cuối</span>
                </span>
              </span>
              <span
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full transition",
                  chaosEnabled ? "bg-amber-500" : "bg-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 size-5 rounded-full bg-white shadow transition-all",
                    chaosEnabled ? "left-6" : "left-1",
                  )}
                />
              </span>
            </button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-blue-600 dark:text-blue-300">
              <Icon className="h-4 w-4" /> Người chơi ({players.length})
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Không bắt buộc — có thể tạo phòng trống, học sinh tự vào và bạn vẫn mời ra được trước khi bắt đầu.
            </p>
          </div>

          <div className="flex flex-wrap gap-1">
            {players.map((id) => {
              const s = students.find((x) => x.id === id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                >
                  {s?.fullName || id.slice(0, 6)}
                  <button
                    type="button"
                    aria-label={`Bỏ ${s?.fullName || "người chơi"}`}
                    onClick={() => setPlayers((prev) => prev.filter((p) => p !== id))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
            {players.length === 0 && (
              <p className="text-xs text-muted-foreground">Chưa chọn ai — học sinh sẽ tự tham gia sau.</p>
            )}
          </div>

          <Input placeholder="Tìm học sinh..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <div className="space-y-0.5">
              {matches.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setPlayers((prev) => [...prev, s.id]);
                    setSearch("");
                  }}
                  className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted"
                >
                  {s.fullName} <span className="text-muted-foreground">({s.email})</span>
                </button>
              ))}
              {matches.length === 0 && <p className="px-2 text-[11px] text-muted-foreground">Không tìm thấy.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={() => createMu.mutate()} disabled={!canSubmit} className="w-full gap-2" size="lg">
        <Plus className="h-4 w-4" /> {createMu.isPending ? "Đang tạo..." : "Tạo phòng"}
      </Button>
    </div>
  );
}

function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="mt-1"
      />
    </label>
  );
}
