import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  Lock,
  PlayCircle,
  Zap,
  BarChart3,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Progress, ProgressTrack, ProgressIndicator } from "../../components/ui/progress";
import api from "../../lib/api";
import { getStructuredCourseKind } from "../../lib/courseExperience";

interface ModuleItem {
  id: string;
  title: string;
  description?: string | null;
  _count?: { lessons?: number };
}

interface LessonItem {
  id: string;
  title: string;
  moduleId: string;
  moduleTitle?: string;
  estimatedDuration?: number | null;
  completed?: boolean;
  hasQuiz?: boolean;
  quizPassed?: boolean;
  locked?: boolean;
}

export default function AlgorithmCourseCurriculum({
  course: courseProp,
  courseId: courseIdProp,
}: {
  course?: any;
  courseId?: string;
}) {
  const outlet = useOutletContext<{ course: any; courseId: string } | null>();
  const course = courseProp || outlet?.course;
  const courseId = courseIdProp || outlet?.courseId || course?.id;
  const navigate = useNavigate();
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});

  const { data: modules = [], isLoading: loadingModules } = useQuery<ModuleItem[]>({
    queryKey: ["course-modules", courseId],
    queryFn: () => api.get(`/courses/${courseId}/modules`).then((r) => r.data || []),
    enabled: !!courseId,
  });

  const { data: flat = [], isLoading: loadingLessons } = useQuery<LessonItem[]>({
    queryKey: ["course-flat-curriculum", courseId],
    queryFn: () => api.get(`/courses/${courseId}/lessons/flat`).then((r) => r.data || []),
    enabled: !!courseId,
  });

  const lessonsMap: Record<string, LessonItem[]> = useMemo(() => {
    if (!modules.length) return {};
    const map: Record<string, LessonItem[]> = {};
    for (const l of flat) (map[l.moduleId] ||= []).push(l);
    return map;
  }, [flat, modules]);

  const rows = useMemo(() => {
    return modules.flatMap((module, moduleIndex) =>
      (lessonsMap[module.id] || []).map((lesson, lessonIndex) => ({
        ...lesson,
        moduleTitle: module.title,
        moduleIndex,
        lessonIndex,
      }))
    );
  }, [modules, lessonsMap]);

  const firstModuleId = modules[0]?.id;
  const totalLessons = rows.length || course?._count?.lessons || 0;
  const completedLessons = rows.filter((lesson) => lesson.completed).length;
  const percent = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const nextLesson = rows.find((lesson) => !lesson.completed) || rows[0];
  const courseKind = getStructuredCourseKind(course);
  const courseLabel = courseKind === "python-basic" ? "Lộ trình Python cơ bản" : "Lộ trình tư duy thuật toán";
  const isLoading = loadingModules || loadingLessons;

  const isModuleOpen = (moduleId: string) => openModules[moduleId] ?? moduleId === firstModuleId;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 dark:border-border dark:bg-card">
        <div className="h-6 w-56 animate-pulse rounded bg-border dark:bg-muted" />
        <div className="mt-5 space-y-3">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-16 animate-pulse rounded-lg bg-muted dark:bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  if (!modules.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center dark:border-border dark:bg-card">
        <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <h2 className="mt-3 text-lg font-bold text-foreground">Khóa học chưa có chương trình</h2>
        <p className="mt-1 text-sm text-muted-foreground">Sau khi thêm chương và bài học, lộ trình sẽ hiển thị tại đây.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card p-5 dark:border-border dark:bg-card">
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{courseLabel}</p>
            <h2 className="mt-2 text-2xl font-bold leading-tight text-foreground">
              {nextLesson ? "Tiếp tục bài học gần nhất" : "Bắt đầu khóa học"}
            </h2>
            {nextLesson ? (
              <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4 dark:border-border dark:bg-background/30">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Chương {nextLesson.moduleIndex + 1} · Bài {nextLesson.lessonIndex + 1}
                </p>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-foreground">{nextLesson.title}</h3>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{nextLesson.moduleTitle}</p>
                  </div>
                  <Button
                    onClick={() => navigate(`/lessons/${nextLesson.id}`)}
                    size="lg"
                  >
                    Vào học <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-border p-4 dark:border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tiến độ</p>
                <p className="mt-1 text-3xl font-bold text-foreground">{percent}%</p>
              </div>
              <PlayCircle className="h-9 w-9 text-primary" />
            </div>
            <Progress value={percent} className="mt-4">
              <ProgressTrack className="h-2 bg-border dark:bg-muted">
                <ProgressIndicator className="bg-primary" />
              </ProgressTrack>
            </Progress>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
              <div className="rounded-lg bg-muted/40 px-3 py-2 dark:bg-background/30">
                <p className="font-bold text-foreground">{modules.length}</p>
                <p className="text-xs text-muted-foreground">Chương</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2 dark:bg-background/30">
                <p className="font-bold text-foreground">{completedLessons}/{totalLessons}</p>
                <p className="text-xs text-muted-foreground">Bài đã học</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card dark:border-border dark:bg-card">
        <div className="border-b border-border px-5 py-4 dark:border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Danh sách bài học</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/adaptive-history?courseId=${courseId}`)}
              className="text-muted-foreground hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted"
            >
              <BarChart3 className="h-3.5 w-3.5" /> Lịch sử test
            </Button>
          </div>
        </div>

        <div className="divide-y divide-border dark:divide-border">
          {modules.map((module, moduleIndex) => {
            const lessons = lessonsMap[module.id] || [];
            const done = lessons.filter((lesson) => lesson.completed).length;
            const open = isModuleOpen(module.id);

            return (
              <div key={module.id} className="overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center justify-start gap-3 px-5 py-4 text-left rounded-none hover:bg-muted transition-colors dark:hover:bg-muted/40"
                  onClick={() => setOpenModules((prev) => ({ ...prev, [module.id]: !open }))}
                >
                  {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chương {moduleIndex + 1}</p>
                    <h3 className="truncate text-base font-bold text-foreground">{module.title}</h3>
                    {module.description ? (
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{module.description}</p>
                    ) : null}
                  </div>
                  <Badge variant="secondary" className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium">
                    {done}/{lessons.length}
                  </Badge>
                </button>

                <div className={`grid transition-all duration-200 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="overflow-hidden">
                    <div className="bg-muted/40 px-3 pb-3 dark:bg-background/20">
                    {lessons.map((lesson, lessonIndex) => {
                      const locked = !!lesson.locked;
                      return (
                        <Button
                          key={lesson.id}
                          disabled={locked}
                          variant="ghost"
                          className={`group flex w-full items-center justify-start gap-3 rounded-lg px-3 py-3 text-left transition ${
                            locked
                              ? "cursor-not-allowed text-muted-foreground/40 dark:text-muted-foreground disabled:opacity-100"
                              : "hover:bg-card hover:shadow-sm dark:hover:bg-muted"
                          }`}
                          onClick={() => !locked && navigate(`/lessons/${lesson.id}`)}
                          title={locked ? "Hoàn thành bài kiểm tra bài trước để mở khóa" : undefined}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-muted-foreground dark:border-border dark:bg-card">
                            {locked ? (
                              <Lock className="h-4 w-4 text-muted-foreground/40" />
                            ) : lesson.completed ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : (
                              lessonIndex + 1
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm font-semibold ${locked ? "" : "text-foreground group-hover:text-primary dark:text-foreground"}`}>
                              {lesson.title}
                            </span>
                          </span>
                          {lesson.hasQuiz && !locked && (
                            <Badge
                              variant="secondary"
                              title={lesson.quizPassed ? "Đã đạt bài kiểm tra" : "Có bài kiểm tra"}
                              className={`hidden shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold sm:inline-flex ${
                                lesson.quizPassed
                                  ? "bg-emerald-100 text-emerald-600"
                                  : "bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary"
                              }`}
                            >
                              <ClipboardList className="h-2.5 w-2.5" />
                              {lesson.quizPassed ? "✓" : "kt"}
                            </Badge>
                          )}
                          {lesson.estimatedDuration ? (
                            <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
                              <Clock3 className="h-3.5 w-3.5" /> {lesson.estimatedDuration} phút
                            </span>
                          ) : null}
                          {!locked && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:text-primary" />}
                        </Button>
                      );
                    })}

                    {/* Test vượt chương */}
                    <Button
                      variant="outline"
                      className="mt-2 flex w-full items-center justify-start gap-3 border-2 border-dashed border-primary/30 bg-transparent px-3 py-3 text-left transition hover:bg-primary/10 hover:border-primary/40 dark:border-primary/40 dark:hover:bg-primary/10"
                      onClick={() => navigate(`/adaptive-test?moduleId=${module.id}&courseId=${courseId}`)}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary">
                        <Zap className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-sm font-semibold text-primary dark:text-primary">
                        Test vượt chương
                      </span>
                      <span className="text-[11px] font-medium text-primary dark:text-primary">25 câu</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
                    </Button>
                  </div>
                </div>
              </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
