import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronDown, ClipboardList,
  Code2, Eye, Layers3, List, Lock, Target, Menu, PlayCircle, ImageIcon,
} from "lucide-react";
import PythonRunner from "../../components/ui/PythonRunner";
import { DiffEditor } from "@monaco-editor/react";
import { exerciseLevels, getStructuredCourseKind, type ExerciseLevelKey } from "../../lib/courseExperience";
import {
  useStructuredCourseContent, useStructuredLesson,
  type StructuredBlock, type StructuredExercise,
} from "../../hooks/useAlgorithmCourseContent";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "../../components/ui/sheet";
import { useDarkMode } from "../../hooks/useDarkMode";
import { cn } from "../../lib/utils";

/* ─── types ─── */
interface FlatLesson { id: string; title: string; moduleId: string; moduleTitle: string; estimatedDuration: number; completed: boolean; hasQuiz?: boolean; quizPassed?: boolean; locked?: boolean; }
interface TocItem { level: 2 | 3; text: string; id: string; }
interface Figure { src: string; alt?: string; caption?: string; imagePrompt?: string }
interface StageCode { code: string; stdin: string; expectedOutput?: string; label: string; readOnly: boolean; highlightLines?: number[]; revealAfterRun?: boolean }

const PYTHON_SCRATCH = `# Sân khấu code — thử ngay ý tưởng của bài này.
# Ctrl+Enter để chạy.

print("Xin chào!")
`;

const CPP_SCRATCH = `#include <iostream>
using namespace std;

int main() {
    // Sân khấu code — thử ngay ý tưởng của bài này.
    cout << "Xin chao!" << endl;
    return 0;
}
`;

/* ─── main component ─── */
export default function AlgorithmLessonView({ lesson, flatLessons, lessonId, course, markRead }: {
  lesson: any; flatLessons?: FlatLesson[]; lessonId?: string; course?: any;
  markRead: { mutate: () => void; isPending: boolean };
}) {
  const navigate = useNavigate();
  const [scrollProgress, setScrollProgress] = useState(0);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [activeTocId, setActiveTocId] = useState("");
  const [tocOpen, setTocOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const { data: courseContent } = useStructuredCourseContent(course, true);
  const structuredMatch = useStructuredLesson(courseContent, lesson);
  const courseLanguage = courseContent?.course?.language || "python";
  const structuredLesson = structuredMatch?.lesson || null;

  const tocItems = useMemo(() => {
    if (structuredLesson) return structuredLesson.blocks.filter(b => b.title).map((b, i) => ({ level: 2 as const, text: b.title, id: structuredBlockId(b, i) }));
    return parseToc(lesson?.content || "");
  }, [structuredLesson, lesson?.content]);

  const currentIndex = flatLessons ? flatLessons.findIndex(l => l.id === lessonId) : -1;
  const prevLesson = currentIndex > 0 ? flatLessons![currentIndex - 1] : null;
  const nextLesson = flatLessons && currentIndex >= 0 && currentIndex < flatLessons.length - 1 ? flatLessons[currentIndex + 1] : null;
  const totalLessons = flatLessons?.length || 0;
  const completedLessons = flatLessons?.filter(l => l.completed).length || 0;
  const isCompleted = flatLessons?.find(l => l.id === lessonId)?.completed || false;
  const currentFlat = flatLessons?.find(l => l.id === lessonId);
  const hasQuiz = !!currentFlat?.hasQuiz;
  const quizPassed = !!currentFlat?.quizPassed;
  const isLocked = !!currentFlat?.locked;
  const nextLocked = !!nextLesson?.locked;
  const effectiveCompleted = isCompleted || quizPassed;

  const [activeBlockIdx, setActiveBlockIdx] = useState(0);
  /** Code pushed into the stage from the article (e.g. "run the buggy version"). */
  const [stageOverride, setStageOverride] = useState<(StageCode & { nonce: number }) | null>(null);
  /** Index of currently selected mistake in common_mistakes block (for diff view). */
  const [selectedMistakeIdx, setSelectedMistakeIdx] = useState(0);

  const blockCount = structuredLesson?.blocks.length || 0;
  const totalSlides = structuredLesson ? blockCount + 1 : 0;
  const isFinalSlide = !!structuredLesson && activeBlockIdx >= blockCount;
  const activeBlock = (structuredLesson?.blocks[activeBlockIdx] as StructuredBlock & { figures?: Figure[] }) || null;

  useEffect(() => { setActiveBlockIdx(0); }, [lessonId]);
  useEffect(() => { setStageOverride(null); }, [lessonId, activeBlockIdx]);
  useEffect(() => { setSelectedMistakeIdx(0); }, [lessonId, activeBlockIdx]);

  const goToSlide = useCallback((i: number) => {
    setActiveBlockIdx(Math.max(0, Math.min(totalSlides - 1, i)));
    contentScrollRef.current?.scrollTo({ top: 0 });
  }, [totalSlides]);

  // ←/→ chuyển slide (bỏ qua khi đang gõ trong editor/ô nhập liệu)
  useEffect(() => {
    if (!structuredLesson) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true], .monaco-editor")) return;
      e.preventDefault();
      setActiveBlockIdx(i => {
        const next = e.key === "ArrowLeft" ? i - 1 : i + 1;
        const clamped = Math.max(0, Math.min(totalSlides - 1, next));
        if (clamped !== i) contentScrollRef.current?.scrollTo({ top: 0 });
        return clamped;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [structuredLesson, totalSlides]);

  // Theo dõi tiến độ đọc trong cột phải (không phải <main>, vì cột tự cuộn)
  useEffect(() => {
    const el = contentScrollRef.current;
    if (!el) return;
    const handler = () => { const h = el.scrollHeight - el.clientHeight; setScrollProgress(h <= 4 ? 100 : Math.min((el.scrollTop / h) * 100, 100)); };
    el.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => el.removeEventListener("scroll", handler);
  }, [lessonId, activeBlockIdx]);

  useEffect(() => {
    setHasScrolledToBottom(false);
    const root = contentScrollRef.current;
    const el = bottomSentinelRef.current;
    if (!root || !el) return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setHasScrolledToBottom(true), { root, threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [lessonId, lesson?.content, isFinalSlide]);

  const blockFigures = (activeBlock as any)?.stage?.figures?.length ? (activeBlock as any).stage.figures : null;
  const stageMode = (activeBlock as any)?.stage?.mode;
  const isCommonMistakes = activeBlock?.type === "common_mistakes";
  const showCodeRunner = stageMode !== "figure" && stageMode !== "inherit";
  const derivedStage = useMemo(() => resolveStageCode(activeBlock, courseLanguage), [activeBlock, courseLanguage]);
  const stage = stageOverride ?? derivedStage;
  const stageKey = `${lessonId}-${activeBlockIdx}-${stageOverride ? `ovr${stageOverride.nonce}` : "base"}`;
  const stageSaveKey = stageOverride || !lessonId ? undefined : `${lessonId}_stage_${activeBlockIdx}`;

  const tryCode = useCallback((code: string, label: string) => {
    setStageOverride({ code, stdin: "", label, readOnly: false, nonce: Date.now() });
  }, []);

  const scrollToHeading = useCallback((id: string) => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); setTocOpen(false); }, []);

  if (isLocked && flatLessons) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Lock className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-bold text-foreground">Bài học bị khóa</h2>
        <p className="max-w-sm text-sm text-muted-foreground">Hoàn thành bài kiểm tra của bài trước để mở khóa bài học này.</p>
        {prevLesson && <Button variant="default" onClick={() => navigate(`/lessons/${prevLesson.id}`)} className="mt-4 gap-2"><ArrowLeft className="h-4 w-4"/> Quay lại bài trước</Button>}
      </div>
    );
  }

  return (
    <div className="-m-4 md:-m-6 lg:h-[calc(100vh-4rem)] lg:overflow-hidden">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col px-4 py-3 sm:px-6">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-12">

          {/* ═══ CỘT TRÁI — SÂN KHẤU CODE CHẠY ĐƯỢC ═══ */}
          <div className="flex h-[60vh] min-h-0 flex-col gap-2 lg:col-span-5 lg:h-auto">
            {isCommonMistakes ? (
              /* ── Diff view cho common_mistakes ── */
              <MistakeDiffView
                mistakes={(activeBlock as any).mistakes || []}
                selectedIdx={selectedMistakeIdx}
                language={courseLanguage}
              />
            ) : !showCodeRunner && blockFigures ? (
              <FigureDisplay figures={blockFigures} title={activeBlock?.title || ""} />
            ) : (
              <>
                {blockFigures && <FigureStrip figures={blockFigures} title={activeBlock?.title || ""} />}
                {showCodeRunner && (
                  <div className="min-h-0 flex-1">
                    <PythonRunner
                      key={stageKey}
                      fill
                      title={stage.label}
                      initialCode={stage.code}
                      stdin={stage.stdin}
                      expectedOutput={stage.expectedOutput}
                      readOnly={stage.readOnly}
                      saveKey={stageSaveKey}
                      highlightLines={stage.highlightLines}
                      revealAfterRun={stage.revealAfterRun}
                      language={courseLanguage}
                      headerExtra={stageOverride ? (
                        <button onClick={() => setStageOverride(null)} className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                          ← Code của bài
                        </button>
                      ) : undefined}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* ═══ CỘT PHẢI — BÀI ĐỌC DẠNG SLIDE ═══ */}
          <div className="flex min-h-0 min-w-0 flex-col lg:col-span-7">

            <div ref={contentScrollRef} className="min-h-0 flex-1 space-y-6 pr-1 lg:overflow-y-auto">

              {structuredLesson?.video?.url && (
                <div className="mb-6 aspect-video overflow-hidden rounded-xl bg-slate-950">
                  <iframe src={structuredLesson.video.url} title={lesson.title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                </div>
              )}

              <div className="space-y-6">
                {structuredLesson ? (
                  activeBlock && (
                    <StructuredBlockView key={`${activeBlock.type}-${activeBlockIdx}`} block={activeBlock} id={structuredBlockId(activeBlock, activeBlockIdx)} onTryCode={tryCode} lessonId={lessonId} onSelectMistake={setSelectedMistakeIdx} />
                  )
                ) : lesson?.content ? (
                  <div className="lesson-content">
                    {parseContentSegments(lesson.content).map((seg, i) => {
                      if (seg.type === "html") return <div key={i} dangerouslySetInnerHTML={{ __html: seg.content }} />;
                      return <PythonRunner key={i} initialCode={seg.code || ""} expectedOutput={seg.type === "challenge" ? seg.expected : undefined} saveKey={lessonId ? `${lessonId}_algorithm_${i}` : undefined} className="my-6" language={courseLanguage} />;
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">Bài học này chưa có nội dung.</div>
                )}
              </div>

              {(isFinalSlide || !structuredLesson) && (
                <>
                  {lessonId && hasQuiz && (
                    <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ClipboardList className="h-4 w-4"/></div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-foreground">Bài kiểm tra</h3>
                        <p className="text-xs text-muted-foreground">{quizPassed ? "Bạn đã đạt — bài tiếp theo đã mở khóa." : "Đạt bài kiểm tra để hoàn thành bài học."}</p>
                      </div>
                      <Button variant={quizPassed ? "outline" : "default"} size="sm" onClick={() => navigate(`/lessons/${lessonId}/quiz`)} className="shrink-0 gap-1.5 text-xs">{quizPassed ? "Làm lại" : "Làm bài"}<ArrowRight className="h-3.5 w-3.5"/></Button>
                    </div>
                  )}

                  <section className="mt-6">
                    <div className="mb-3 flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-primary" />
                      <h2 className="text-base font-bold text-foreground">Bài tập luyện</h2>
                    </div>
                    <ExerciseTabs lesson={lesson} onOpen={(id) => navigate(`/assignments/${id}`)} onTryCode={tryCode} />
                  </section>

                  <div ref={bottomSentinelRef} className="h-1" />

                  <CompletionCard isCompleted={effectiveCompleted} hasScrolledToBottom={hasScrolledToBottom} scrollProgress={scrollProgress} saving={markRead.isPending} hasQuiz={hasQuiz} quizPassed={quizPassed}
                    onComplete={() => markRead.mutate()}
                    onTakeQuiz={() => navigate(`/lessons/${lessonId}/quiz`)}
                    nextLesson={nextLesson} onNext={(id) => navigate(`/lessons/${id}`)}
                  />

                  <nav className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {prevLesson ? <NavCard direction="prev" lesson={prevLesson} onClick={() => navigate(`/lessons/${prevLesson.id}`)} /> : <div />}
                    {nextLesson && <NavCard direction="next" lesson={nextLesson} onClick={() => !nextLocked && navigate(`/lessons/${nextLesson.id}`)} locked={nextLocked} />}
                  </nav>
                </>
              )}
            </div>

            {/* ═══ THANH CHUYỂN SLIDE ═══ */}
            {structuredLesson && blockCount > 0 && (
              <div className="shrink-0 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={activeBlockIdx === 0} onClick={() => goToSlide(activeBlockIdx - 1)}>
                    <ArrowLeft className="h-3.5 w-3.5"/> Trước
                  </Button>
                  <div className="flex items-center justify-center gap-1.5">
                    {structuredLesson.blocks.map((b, i) => (
                      <button
                        key={structuredBlockId(b, i)}
                        onClick={() => goToSlide(i)}
                        title={b.title || `Phần ${i + 1}`}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-md border text-xs font-bold transition-all",
                          i === activeBlockIdx
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border/50 bg-background/80 text-muted-foreground hover:border-primary/50 hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => goToSlide(blockCount)}
                      title="Luyện tập"
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-md border text-xs font-bold transition-all",
                        isFinalSlide
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border/50 bg-background/80 text-muted-foreground hover:border-primary/50 hover:bg-muted hover:text-foreground"
                      )}
                    >
                      ★
                    </button>
                  </div>
                  <Button variant="default" size="sm" className="gap-1.5 text-xs" disabled={isFinalSlide} onClick={() => goToSlide(activeBlockIdx + 1)}>
                    Tiếp <ArrowRight className="h-3.5 w-3.5"/>
                  </Button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ═══ FLOATING MOBILE BAR ═══ */}
      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 shadow-lg lg:hidden">
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetTrigger className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-muted"><Menu className="h-4 w-4"/></SheetTrigger>
          <SheetContent side="left" className="w-80 p-0">
            <LessonSheetContent course={course} flatLessons={flatLessons} lessonId={lessonId} completedLessons={completedLessons} totalLessons={totalLessons} onOpen={(id) => { navigate(`/lessons/${id}`); setSidebarOpen(false); }} onBack={() => navigate(`/courses/${lesson.courseId}/curriculum`)} />
          </SheetContent>
        </Sheet>
        <Button variant="ghost" size="icon-sm" disabled={!prevLesson} onClick={() => prevLesson && navigate(`/lessons/${prevLesson.id}`)}><ArrowLeft className="h-4 w-4"/></Button>
        <span className="px-2 text-xs font-semibold tabular-nums text-muted-foreground">{currentIndex + 1}/{totalLessons}</span>
        <Button variant="ghost" size="icon-sm" disabled={!nextLesson || nextLocked} onClick={() => nextLesson && !nextLocked && navigate(`/lessons/${nextLesson.id}`)}><ArrowRight className="h-4 w-4"/></Button>
        {tocItems.length > 1 && (
          <Sheet open={tocOpen} onOpenChange={setTocOpen}>
            <SheetTrigger className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-muted"><List className="h-4 w-4"/></SheetTrigger>
            <SheetContent side="right" className="w-80 p-0">
              <div className="border-b border-border p-4"><h3 className="text-sm font-bold text-foreground">Mục lục</h3></div>
              <nav className="max-h-[calc(100vh-8rem)] space-y-0.5 overflow-y-auto p-3">
                {tocItems.map((item, i) => (
                  <button key={item.id} onClick={() => { if (structuredLesson) { goToSlide(i); setTocOpen(false); } else scrollToHeading(item.id); }}
                    className={cn("w-full rounded-md px-3 py-2 text-left text-sm transition-colors", item.level === 3 && "pl-7", (structuredLesson ? i === activeBlockIdx : activeTocId === item.id) ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                    {item.text}
                  </button>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        )}
        {!effectiveCompleted && <Button variant="default" size="xs" onClick={() => markRead.mutate()} disabled={markRead.isPending} className="rounded-full px-3"><CheckCircle2 className="h-3.5 w-3.5"/></Button>}
      </div>
    </div>
  );
}

/* ─── Figure strip above the stage ─── */
function FigureStrip({ figures, title }: { figures: Figure[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const [imgError, setImgError] = useState<Set<number>>(new Set());

  const handleImageError = (index: number) => {
    setImgError(prev => new Set(prev).add(index));
  };

  return (
    <div className="shrink-0 rounded-xl border border-border bg-card/70 p-2">
      <div className="flex items-center gap-2 overflow-x-auto">
        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {figures.map((f, i) => {
          const hasError = imgError.has(i);
          const showPrompt = hasError && f.imagePrompt;

          return (
            <button key={i} onClick={() => setOpen(open === i ? null : i)} title={f.caption || f.alt || title}
              className={cn("h-12 shrink-0 overflow-hidden rounded-lg border transition-all", open === i ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50", showPrompt ? "w-32 bg-amber-500/10 dark:bg-amber-950/20" : "w-16")}>
              {showPrompt ? (
                <div className="flex h-full items-center justify-center px-1 text-[9px] leading-tight text-amber-700 dark:text-amber-400">
                  🎨 Prompt
                </div>
              ) : (
                <img src={f.src} alt={f.alt || title} className="h-full w-full object-cover" loading="lazy" onError={() => handleImageError(i)} />
              )}
            </button>
          );
        })}
      </div>
      {open !== null && (
        <figure className="mt-2">
          {imgError.has(open) && figures[open].imagePrompt ? (
            <div className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-500/10 p-4 dark:border-amber-700 dark:bg-amber-950/20">
              <div className="mb-2 flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-amber-600" />
                <span className="text-sm font-bold text-amber-900 dark:text-amber-400">Image Prompt (Chưa có ảnh)</span>
              </div>
              <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">{figures[open].imagePrompt}</p>
              {figures[open].caption && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-500">Caption: {figures[open].caption}</p>}
            </div>
          ) : (
            <>
              <img src={figures[open].src} alt={figures[open].alt || title} className="max-h-64 w-full rounded-lg object-contain" onError={() => handleImageError(open)} />
              {figures[open].caption && <figcaption className="mt-1 text-center text-xs font-semibold text-muted-foreground">{figures[open].caption}</figcaption>}
            </>
          )}
        </figure>
      )}
    </div>
  );
}

/* ─── Full-size figure display (when no code runner) ─── */
function FigureDisplay({ figures, title }: { figures: Figure[]; title: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [imgError, setImgError] = useState<Set<number>>(new Set());
  const activeFigure = figures[activeIndex];
  const hasError = imgError.has(activeIndex);
  const showPrompt = hasError && activeFigure.imagePrompt;

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Thumbnails */}
      {figures.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-border bg-card/70 p-2">
          <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {figures.map((f, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              title={f.caption || f.alt || title}
              className={cn("h-10 w-14 shrink-0 overflow-hidden rounded-lg border transition-all", activeIndex === i ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50")}
            >
              <img src={f.src} alt={f.alt || title} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {/* Main figure */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-border bg-card/70">
        {showPrompt ? (
          <div className="m-6 rounded-lg border-2 border-dashed border-amber-300 bg-amber-500/10 p-6 dark:border-amber-700 dark:bg-amber-950/20">
            <div className="mb-3 flex items-center gap-2">
              <ImageIcon className="h-6 w-6 text-amber-600" />
              <span className="text-base font-bold text-amber-900 dark:text-amber-400">Image Prompt (Chưa có ảnh)</span>
            </div>
            <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-300">{activeFigure.imagePrompt}</p>
            {activeFigure.caption && <p className="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-500">Caption: {activeFigure.caption}</p>}
          </div>
        ) : (
          <img
            src={activeFigure.src}
            alt={activeFigure.alt || title}
            className="h-full w-full object-contain"
            onError={() => setImgError(prev => new Set(prev).add(activeIndex))}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Lesson sidebar sheet content ─── */
function LessonSheetContent({ course, flatLessons, lessonId, completedLessons, totalLessons, onOpen, onBack }: {
  course: any; flatLessons?: FlatLesson[]; lessonId?: string; completedLessons: number; totalLessons: number; onOpen: (id: string) => void; onBack: () => void;
}) {
  const grouped = useMemo(() => {
    if (!flatLessons) return [];
    return flatLessons.reduce<Array<{ moduleId: string; moduleTitle: string; lessons: FlatLesson[] }>>((acc, l) => {
      const last = acc[acc.length - 1];
      if (last && last.moduleId === l.moduleId) { last.lessons.push(l); } else { acc.push({ moduleId: l.moduleId, moduleTitle: l.moduleTitle, lessons: [l] }); }
      return acc;
    }, []);
  }, [flatLessons]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground"><ArrowLeft className="h-4 w-4"/> Quay lại khóa học</Button>
        <h3 className="mt-2 text-sm font-bold text-foreground">{course?.title}</h3>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: totalLessons ? `${(completedLessons / totalLessons) * 100}%` : "0%" }} />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{completedLessons}/{totalLessons} bài đã hoàn thành</p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {grouped.map((g, gi) => (
          <div key={g.moduleId} className="space-y-1">
            <div className="rounded-lg bg-muted/50 px-2 py-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Chương {gi + 1}</p>
              <p className="truncate text-xs font-semibold text-foreground">{g.moduleTitle}</p>
            </div>
            {g.lessons.map((l, li) => (
              <button key={l.id} disabled={!!l.locked}
                onClick={() => !l.locked && onOpen(l.id)}
                className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors", l.locked ? "cursor-not-allowed text-muted-foreground/40" : l.id === lessonId ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                {l.locked ? <Lock className="h-3.5 w-3.5 shrink-0"/> : l.completed ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500"/> : <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/30"/>}
                <span className="truncate">{li + 1}. {l.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Content blocks ─── */
function StructuredBlockView({ block, id, onTryCode, lessonId, onSelectMistake }: { block: StructuredBlock & { figures?: Figure[] }; id: string; onTryCode: (code: string, label: string) => void; lessonId?: string; onSelectMistake?: (idx: number) => void }) {
  const b = block as any;

  if (block.type === "visualization") return <VisualizationCard kind={block.kind} title={block.title} config={block.config} id={id} />;

  if (block.type === "code_runner") return (
    <BlockWrapper id={id} icon={Code2} title={block.title} tone="code">
      {block.contentMd && <MarkdownBlock content={block.contentMd} />}
      <StageHint />
      {block.expectedOutput && (
        <div className="mt-3"><IoPanel title="Output mong đợi" value={block.expectedOutput} /></div>
      )}
    </BlockWrapper>
  );

  if (block.type === "example") return (
    <BlockWrapper id={id} icon={Eye} title={block.title} tone="example">
      {block.contentMd && <MarkdownBlock content={block.contentMd} />}
      {(block.stdin || block.expectedOutput) && <div className="mt-4 grid gap-3 sm:grid-cols-2">{block.stdin && <IoPanel title="Input" value={block.stdin} />}{block.expectedOutput && <IoPanel title="Output" value={block.expectedOutput} />}</div>}
    </BlockWrapper>
  );

  if (block.type === "common_mistakes") return (
    <BlockWrapper id={id} icon={Target} title={block.title} tone="mistakes">
      <div className="space-y-3">
        {(block.mistakes || []).map((m, i) => (
          <details key={i} className="rounded-lg border border-rose-200 bg-card p-3 dark:border-rose-900/40" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) onSelectMistake?.(i); }}>
            <summary className="cursor-pointer text-sm font-semibold text-foreground">{m.title}</summary>
            <div className="mt-3 space-y-3">
              {m.description && <MarkdownBlock className="text-sm text-muted-foreground" content={cleanMistakeDescription(m.description, Boolean(m.wrongCode || m.correctCode))} />}
              {(m.wrongCode || m.correctCode) && (
                <div className="grid gap-3 lg:grid-cols-2">
                  {m.wrongCode && <CodePanel title="Sai ❌" code={m.wrongCode} tone="bad" onTry={() => onTryCode(m.wrongCode!, `Chạy thử code SAI — ${m.title}`)} tryLabel="Chạy thử để thấy lỗi" />}
                  {m.correctCode && <CodePanel title="Đúng ✅" code={m.correctCode} tone="good" onTry={() => onTryCode(m.correctCode!, `Code ĐÚNG — ${m.title}`)} tryLabel="Chạy bản đúng" />}
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </BlockWrapper>
  );

  if (block.type === "summary") return (
    <BlockWrapper id={id} icon={CheckCircle2} title={block.title} tone="summary">
      {block.keyPoints?.length ? <ul className="space-y-2">{block.keyPoints.map((p, i) => <li key={i} className="flex gap-2 text-sm text-foreground"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"/><MarkdownInline content={p}/></li>)}</ul> : block.contentMd ? <MarkdownBlock content={block.contentMd} /> : null}
    </BlockWrapper>
  );

  if (block.type === "quiz_gate") {
    return (
      <BlockWrapper id={id} icon={ClipboardList} title={block.title} tone="challenge">
        {block.contentMd && <MarkdownBlock content={block.contentMd} />}
        <Button variant="default" size="sm" className="mt-4 gap-2" onClick={() => lessonId && (window.location.href = `/lessons/${lessonId}/quiz`)}>
          <ClipboardList className="h-4 w-4" /> Làm bài kiểm tra
        </Button>
      </BlockWrapper>
    );
  }

  if (block.type === "mini_challenge") {
    const { prompt, answer } = splitMiniChallengeAnswer(block.contentMd || "");
    return (
      <BlockWrapper id={id} icon={ClipboardList} title={block.title} tone="challenge">
        {prompt && <MarkdownBlock content={prompt} />}
        <StageHint label="Làm thử ở sân khấu code bên trái." />
        {answer && (
          <details className="mt-4 rounded-xl border border-amber-200 bg-amber-500/10/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-amber-900 dark:text-amber-100"><span>Gợi ý đáp án</span><ChevronDown className="h-4 w-4 shrink-0"/></summary>
            <MarkdownBlock className="mt-3 text-sm" content={answer}/>
          </details>
        )}
      </BlockWrapper>
    );
  }

  return (
    <BlockWrapper id={id} icon={block.type === "concept" ? Layers3 : BookOpen} title={block.title} tone="concept">
      {block.contentMd && <MarkdownBlock content={block.contentMd} />}
      {b.codeSnippets?.length > 1 && (
        <div className="mt-4 space-y-2">
          {b.codeSnippets.slice(1).map((s: string, i: number) => (
            <CodePanel key={i} title={`Đoạn ${i + 2}`} code={s} tone="good" onTry={() => onTryCode(s, `${block.title} — đoạn ${i + 2}`)} tryLabel="Mở ở sân khấu" />
          ))}
        </div>
      )}
    </BlockWrapper>
  );
}

function StageHint({ label = "Code của phần này đã mở sẵn ở sân khấu bên trái — bấm Run để chạy." }: { label?: string }) {
  return (
    <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
      <PlayCircle className="h-3.5 w-3.5 text-primary" /> {label}
    </p>
  );
}

function BlockWrapper({ id, icon: Icon, title, children, tone = "concept" }: { id: string; icon: any; title: string; children: React.ReactNode; tone?: "concept" | "example" | "code" | "mistakes" | "summary" | "challenge" }) {
  const toneStyles: Record<string, { accent: string; bg: string; iconBg: string; heading: string }> = {
    concept:  { accent: "border-l-primary/40", bg: "", iconBg: "bg-primary/10 text-primary", heading: "text-foreground" },
    example:  { accent: "border-l-emerald-500", bg: "bg-emerald-500/10/40 dark:bg-emerald-950/10", iconBg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", heading: "text-emerald-900 dark:text-emerald-100" },
    code:     { accent: "border-l-slate-600", bg: "bg-slate-50 dark:bg-slate-900/40", iconBg: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300", heading: "text-foreground" },
    mistakes: { accent: "border-l-rose-500", bg: "bg-rose-50/40 dark:bg-rose-950/10", iconBg: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300", heading: "text-rose-900 dark:text-rose-100" },
    summary:  { accent: "border-l-primary", bg: "bg-primary/5 dark:bg-primary/10", iconBg: "bg-primary/10 text-primary", heading: "text-primary" },
    challenge:{ accent: "border-l-amber-500", bg: "bg-amber-500/10/30 dark:bg-amber-950/10", iconBg: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", heading: "text-foreground" },
  };
  const s = toneStyles[tone];

  return (
    <section id={id} className={cn("scroll-mt-20 rounded-r-xl border-l-3 px-5 py-5 sm:px-6", s.accent, s.bg)}>
      <div className="mb-4 flex items-center gap-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", s.iconBg)}><Icon className="h-4 w-4"/></div>
        <h2 className={cn("text-lg font-bold", s.heading)}>{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

/* ─── Exercise tabs ─── */
function ExerciseTabs({ lesson, onOpen, onTryCode }: { lesson: any; onOpen: (id: string) => void; onTryCode: (code: string, label: string) => void }) {
  const [active, setActive] = useState<ExerciseLevelKey>("support");
  const { data: courseContent } = useStructuredCourseContent(lesson?.course || lesson, false);
  const structuredMatch = useStructuredLesson(courseContent, lesson);
  const structuredExercises = structuredMatch?.lesson?.exercises?.[active] || [];
  const groupedAssignments = useMemo(() => {
    const r: Record<string, any[]> = { support: [], core: [], challenge: [] };
    (lesson?.assignments || []).forEach((a: any) => {
      const k = `${a.groupName || a.title || ""}`.toLowerCase();
      if (k.includes("challenge") || k.includes("khó")) r.challenge.push(a); else if (k.includes("core") || k.includes("trung")) r.core.push(a); else r.support.push(a);
    });
    return r;
  }, [lesson?.assignments]);
  const activeAssignments = groupedAssignments[active] || [];
  const level = exerciseLevels.find(l => l.key === active)!;

  return (
    <div>
      <div className="mb-4 flex w-fit rounded-lg bg-muted p-1">
        {exerciseLevels.map(l => (
          <button key={l.key} onClick={() => setActive(l.key)} className={cn("rounded-md px-3 py-1.5 text-xs font-bold transition-colors", active === l.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{l.label}</button>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{level.description}</p>
      {structuredExercises.length > 0 ? (
        <div className="grid gap-3">{structuredExercises.map(ex => <StructuredExerciseCard key={ex.slug} exercise={ex} onTryCode={onTryCode} />)}</div>
      ) : activeAssignments.length > 0 ? (
        <div className="grid gap-3">{activeAssignments.map((a: any) => (
          <button key={a.id} onClick={() => onOpen(a.id)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/50">
            <ClipboardList className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-foreground">{a.title}</p><p className="text-xs text-muted-foreground">{a.status === "published" ? "Đã mở" : "Bản nháp"}</p></div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}</div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Chưa có bài tập cho mức này. Hãy thử mức khác.</div>
      )}
    </div>
  );
}

function StructuredExerciseCard({ exercise, onTryCode }: { exercise: StructuredExercise; onTryCode: (code: string, label: string) => void }) {
  const sample = exercise.sampleTests?.[0];
  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="cursor-pointer list-none p-4">
        <div className="flex items-start gap-3">
          <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-foreground">{exercise.title}</h3>{exercise.estimatedMinutes ? <Badge variant="secondary" className="text-xs">{exercise.estimatedMinutes}p</Badge> : null}</div>
            {exercise.tags?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{exercise.tags.slice(0, 5).map(t => <span key={t} className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{t}</span>)}</div> : null}
          </div>
          <ChevronDown className="mt-0.5 h-4 w-4 text-muted-foreground" />
        </div>
      </summary>
      <div className="mx-4 space-y-4 border-t border-border px-4 pb-4 pt-4">
        {exercise.statement && <MarkdownBlock content={exercise.statement} />}
        {sample && <div className="grid gap-3 md:grid-cols-2"><IoPanel title="Input mẫu" value={sample.input}/><IoPanel title="Output mẫu" value={sample.output}/></div>}
        {exercise.starterCode && (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onTryCode(exercise.starterCode!, `Bài tập — ${exercise.title}`)}>
            <PlayCircle className="h-3.5 w-3.5" /> Mở ở sân khấu code
          </Button>
        )}
        {exercise.hints?.length ? <details className="rounded-lg border border-amber-200 bg-amber-500/10/70 p-3"><summary className="cursor-pointer text-sm font-bold text-amber-800">Gợi ý</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">{exercise.hints.map((h, i) => <li key={i}>{h}</li>)}</ul></details> : null}
      </div>
    </details>
  );
}

/* ─── Completion ─── */
function CompletionCard({ isCompleted, hasScrolledToBottom, scrollProgress, saving, hasQuiz, quizPassed, onComplete, onTakeQuiz, nextLesson, onNext }: {
  isCompleted: boolean; hasScrolledToBottom: boolean; scrollProgress: number; saving: boolean; hasQuiz?: boolean; quizPassed?: boolean;
  onComplete: () => void; onTakeQuiz?: () => void; nextLesson: FlatLesson | null | undefined; onNext: (id: string) => void;
}) {
  if (isCompleted) return (
    <div className="mt-10 rounded-xl border border-emerald-200 bg-emerald-500/10/60 p-6 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
      <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
      <h3 className="font-bold text-emerald-900 dark:text-emerald-100">Bài học đã hoàn thành</h3>
      {nextLesson && <Button variant="default" onClick={() => onNext(nextLesson.id)} className="mt-4 gap-2 bg-emerald-600 hover:bg-emerald-700">Học bài tiếp theo <ArrowRight className="h-4 w-4"/></Button>}
    </div>
  );
  if (hasQuiz && !quizPassed) return (
    <div className="mt-10 rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
      <ClipboardList className="mx-auto mb-2 h-8 w-8 text-primary" />
      <h3 className="font-bold text-foreground">Làm bài kiểm tra để hoàn thành</h3>
      <p className="mt-1 text-sm text-muted-foreground">Đạt bài kiểm tra để đánh dấu đã học xong.</p>
      {onTakeQuiz && <Button variant="default" onClick={onTakeQuiz} className="mt-4 gap-2">Vào làm bài <ArrowRight className="h-4 w-4"/></Button>}
    </div>
  );
  const remaining = Math.max(0, Math.round(100 - scrollProgress));
  return (
    <div className="mt-10 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-6 text-center">
      <h3 className="font-bold text-foreground">Hoàn thành bài học</h3>
      <p className="mt-1 text-sm text-muted-foreground">{hasScrolledToBottom ? "Bạn đã đọc đến cuối bài." : `Còn khoảng ${remaining}% nội dung.`}</p>
      <Button variant="default" onClick={onComplete} disabled={!hasScrolledToBottom || saving} className="mt-4 gap-2"><CheckCircle2 className="h-4 w-4"/>{saving ? "Đang lưu..." : "Đánh dấu đã hoàn thành"}</Button>
    </div>
  );
}

/* ─── Navigation card ─── */
function NavCard({ direction, lesson, onClick, locked }: { direction: "prev" | "next"; lesson: FlatLesson; onClick: () => void; locked?: boolean }) {
  const isPrev = direction === "prev";
  return (
    <button onClick={onClick} disabled={locked} className={cn("flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/50", isPrev ? "" : "justify-end text-right", locked && "cursor-not-allowed opacity-50")}>
      {isPrev && <ArrowLeft className="h-5 w-5 shrink-0 text-muted-foreground"/>}
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{locked ? "🔒 Chưa mở" : isPrev ? "Bài trước" : "Bài tiếp theo"}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{lesson.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{lesson.moduleTitle}</p>
      </div>
      {!isPrev && (locked ? <Lock className="h-5 w-5 shrink-0 text-muted-foreground"/> : <ArrowRight className="h-5 w-5 shrink-0 text-primary"/>)}
    </button>
  );
}

/* ─── Visualization (data-driven, không hardcode) ─── */
function VisualizationCard({ kind, title, config, id }: { kind: string; title: string; config?: Record<string, any>; id?: string }) {
  const body = useMemo(() => buildVisualization(kind, config || {}), [kind, config]);
  return (
    <section id={id} className="scroll-mt-20 rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2"><Layers3 className="h-5 w-5 text-primary"/><h2 className="text-sm font-bold text-foreground">{title || "Minh họa"}</h2></div>
      {body ? (
        <div className="space-y-3">
          {body.rows.map((row, ri) => (
            <div key={ri}>
              {row.label && <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{row.label}</p>}
              <div className="flex flex-wrap gap-1.5">
                {row.cells.map((c, ci) => (
                  <div key={ci} className={cn("flex min-w-11 flex-col items-center rounded-lg border border-border px-2 py-1.5", cellTone(c.tone))}>
                    {c.index !== undefined && <span className="text-[10px] leading-none text-muted-foreground">{c.index}</span>}
                    <span className="text-sm font-bold leading-tight">{c.value}</span>
                    {c.note && <span className="text-[10px] leading-none text-muted-foreground">{c.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {body.legend && <p className="text-xs text-muted-foreground">{body.legend}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Minh họa <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{kind}</code> — xem code chạy ở sân khấu bên trái.</p>
      )}
    </section>
  );
}

type VizCell = { value: string | number; index?: number; note?: string; tone?: "on" | "off" | "left" | "right" | "window" };
type VizBody = { rows: Array<{ label?: string; cells: VizCell[] }>; legend?: string };

function cellTone(tone?: VizCell["tone"]) {
  switch (tone) {
    case "on": return "border-emerald-300 bg-emerald-500/10 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
    case "off": return "border-border bg-muted/50 text-muted-foreground line-through";
    case "left": return "border-sky-400 bg-sky-500/10 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200";
    case "right": return "border-amber-400 bg-amber-500/10 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200";
    case "window": return "border-primary bg-primary/10 text-foreground";
    default: return "border-border bg-card text-foreground";
  }
}

function buildVisualization(kind: string, cfg: Record<string, any>): VizBody | null {
  const clampN = (d: number) => Math.min(Math.max(Number(cfg.n) || d, 5), 60);
  const arr: number[] = Array.isArray(cfg.array) ? cfg.array.map(Number) : [];

  if (kind === "sieve" || kind === "prime_prefix_count" || kind === "prime-prefix") {
    const n = clampN(30);
    const isPrime = new Array(n + 1).fill(true);
    isPrime[0] = isPrime[1] = false;
    for (let p = 2; p * p <= n; p++) if (isPrime[p]) for (let m = p * p; m <= n; m += p) isPrime[m] = false;
    const rows: VizBody["rows"] = [{
      label: "Sàng 2..n",
      cells: Array.from({ length: n - 1 }, (_, i) => ({ value: i + 2, tone: isPrime[i + 2] ? "on" as const : "off" as const })),
    }];
    if (kind !== "sieve") {
      let run = 0;
      rows.push({
        label: "Số nguyên tố ≤ i (cộng dồn)",
        cells: Array.from({ length: n - 1 }, (_, i) => { if (isPrime[i + 2]) run++; return { index: i + 2, value: run }; }),
      });
    }
    return { rows, legend: "Xanh = nguyên tố · gạch ngang = hợp số (bị sàng loại)." };
  }

  if (kind === "prefix_sum" || kind === "preprocessing") {
    const base = arr.length ? arr : Array.from({ length: clampN(10) }, (_, i) => i + 1);
    let run = 0;
    return {
      rows: [
        { label: "a[i]", cells: base.map((v, i) => ({ index: i, value: v })) },
        { label: "prefix[i] = prefix[i-1] + a[i]", cells: base.map((v, i) => { run += v; return { index: i, value: run, tone: "on" as const }; }) },
      ],
      legend: "Tổng đoạn [l..r] = prefix[r] − prefix[l−1] → chỉ 1 phép trừ.",
    };
  }

  if (kind === "marker_array" || kind === "marker-array") {
    const n = clampN(20);
    const marked = new Set<number>((Array.isArray(cfg.marked) ? cfg.marked : arr).map(Number));
    return {
      rows: [{ label: "mark[i]", cells: Array.from({ length: n }, (_, i) => ({ index: i, value: marked.has(i) ? 1 : 0, tone: marked.has(i) ? "on" as const : undefined })) }],
      legend: "Đánh dấu 1 nếu giá trị đã xuất hiện → kiểm tra tồn tại trong O(1).",
    };
  }

  if (kind === "frequency_array" || kind === "frequency-array") {
    const base = arr.length ? arr : [3, 1, 3, 5, 1, 3];
    const maxVal = Math.min(Math.max(...base, Number(cfg.maxVal) || 0), 40);
    const freq = new Array(maxVal + 1).fill(0);
    base.forEach(v => { if (v >= 0 && v <= maxVal) freq[v]++; });
    return {
      rows: [
        { label: "Dãy vào", cells: base.map((v, i) => ({ index: i, value: v })) },
        { label: "freq[v] = số lần v xuất hiện", cells: freq.map((c, v) => ({ index: v, value: c, tone: c > 0 ? "on" as const : undefined })) },
      ],
    };
  }

  if (kind === "two_pointers" || kind === "two-pointers") {
    const base = arr.length ? arr : [1, 3, 4, 5, 8, 10];
    const last = base.length - 1;
    return {
      rows: [{
        label: `Dãy đã sắp xếp${cfg.target !== undefined ? ` · target = ${cfg.target}` : ""}`,
        cells: base.map((v, i) => ({ index: i, value: v, note: i === 0 ? "L" : i === last ? "R" : undefined, tone: i === 0 ? "left" as const : i === last ? "right" as const : undefined })),
      }],
      legend: `Bắt đầu L=0, R=${last}. Tổng = ${base[0] + base[last]}${cfg.target !== undefined ? ` ${base[0] + base[last] === Number(cfg.target) ? "= target ✅" : base[0] + base[last] > Number(cfg.target) ? "> target → lùi R" : "< target → tiến L"}` : ""}.`,
    };
  }

  if (kind === "sliding_window" || kind === "sliding-window") {
    const base = arr.length ? arr : [2, 5, 1, 8, 3, 6];
    const k = Math.min(Math.max(Number(cfg.k) || 3, 1), base.length);
    const sum = base.slice(0, k).reduce((a, b) => a + b, 0);
    return {
      rows: [{ label: `Cửa sổ cố định k = ${k}`, cells: base.map((v, i) => ({ index: i, value: v, tone: i < k ? "window" as const : undefined })) }],
      legend: `Tổng cửa sổ đầu = ${sum}. Trượt 1 bước: + a[i+k] − a[i] → O(1) mỗi bước.`,
    };
  }

  if (kind === "variable_window") {
    const base = arr.length ? arr : [2, 3, 1, 2, 4, 3];
    const S = Number(cfg.S) || 7;
    let l = 0, run = 0, bestR = -1;
    for (let r = 0; r < base.length; r++) { run += base[r]; if (run >= S) { bestR = r; break; } }
    return {
      rows: [{ label: `Cửa sổ biến đổi · S = ${S}`, cells: base.map((v, i) => ({ index: i, value: v, tone: bestR >= 0 && i >= l && i <= bestR ? "window" as const : undefined })) }],
      legend: bestR >= 0 ? `Cửa sổ [${l}..${bestR}] có tổng ${run} ≥ ${S} → thu L lại để tìm cửa sổ ngắn hơn.` : `Không có cửa sổ nào đạt tổng ≥ ${S}.`,
    };
  }

  return null;
}

/* ─── Smaller components ─── */
function IoPanel({ title, value }: { title: string; value: string }) {
  return <div className="rounded-lg bg-slate-950 p-3"><p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</p><pre className="whitespace-pre-wrap break-words font-mono text-sm text-emerald-300">{value}</pre></div>;
}

function CodePanel({ title, code, tone, onTry, tryLabel }: { title: string; code: string; tone: "bad" | "good"; onTry?: () => void; tryLabel?: string }) {
  return (
    <div className="rounded-lg bg-slate-950 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={`text-[11px] font-bold uppercase tracking-wide ${tone === "bad" ? "text-rose-300" : "text-emerald-300"}`}>{title}</p>
        {onTry && (
          <button onClick={onTry} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${tone === "bad" ? "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30" : "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"}`}>
            <PlayCircle className="h-3 w-3" /> {tryLabel || "Chạy thử"}
          </button>
        )}
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-200">{code}</pre>
    </div>
  );
}

function MarkdownBlock({ content, className = "" }: { content: string; className?: string }) {
  return <div className={`lesson-content max-w-none ${className}`}><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>;
}

function MarkdownInline({ content }: { content: string }) {
  return <span className="min-w-0"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <>{children}</> }}>{content}</ReactMarkdown></span>;
}

/* ─── Utils ─── */
/** Chọn code cho sân khấu bên trái theo thứ tự ưu tiên. Luôn trả về code chạy được. */
function scratchFor(language?: string) {
  return language === "cpp" || language === "c++" || language === "c" ? CPP_SCRATCH : PYTHON_SCRATCH;
}

function resolveStageCode(block: (StructuredBlock & { figures?: Figure[] }) | null, language?: string): StageCode {
  const b = block as any;
  const scratch = scratchFor(language);
  if (!b) return { code: scratch, stdin: "", label: "Sân khấu code", readOnly: false };

  // Stage mode from JSON — direct mapping
  // editable:false keeps sample non-editable, but PythonRunner still allows Run.
  const stg = b.stage;
  if (stg?.mode === "code" && stg.code) {
    return { code: stg.code, stdin: stg.stdin || "", expectedOutput: stg.expectedOutput, label: stg.label || b.title || "Chạy thử", readOnly: stg.editable === false, highlightLines: stg.highlightLines, revealAfterRun: stg.revealAfterRun };
  }
  if (stg?.mode === "predict" && stg.code) {
    return { code: stg.code, stdin: stg.stdin || "", label: stg.label || b.title || "Đoán trước", readOnly: false, revealAfterRun: stg.revealAfterRun ?? true };
  }
  if (stg?.mode === "compare") {
    // Compare mode: use first mistake's wrongCode, let user explore via onTryCode
    const firstMistake = (b.mistakes || [])[0];
    if (firstMistake?.wrongCode) {
      return { code: firstMistake.wrongCode, stdin: "", label: stg.label || "So sánh SAI vs ĐÚNG", readOnly: false };
    }
  }

  // Fallback: infer from block type
  if (b.type === "code_runner" && b.code) {
    return { code: b.code, stdin: b.stdin || "", expectedOutput: b.expectedOutput || undefined, label: b.title || "Chạy thử", readOnly: b.editable === false };
  }

  const fenced = firstPythonFence(b.contentMd);
  if (fenced) return { code: fenced, stdin: b.stdin || "", label: b.title || "Code trong bài", readOnly: false };

  if (Array.isArray(b.codeSnippets) && b.codeSnippets.length > 0) {
    return { code: String(b.codeSnippets[0]).trim(), stdin: b.stdin || "", label: b.title || "Code trong bài", readOnly: false };
  }

  if (b.type === "common_mistakes") {
    const fix = (b.mistakes || []).find((m: any) => m.correctCode)?.correctCode;
    if (fix) return { code: fix, stdin: "", label: "Bản viết đúng", readOnly: false };
  }

  if (b.type === "example" && (b.stdin || b.expectedOutput)) {
    return { code: scratch, stdin: b.stdin || "", expectedOutput: b.expectedOutput || undefined, label: b.title || "Thử lại ví dụ", readOnly: false };
  }

  return { code: scratch, stdin: "", label: b.title ? `Nháp — ${b.title}` : "Sân khấu code", readOnly: false };
}

function firstPythonFence(md?: string): string | null {
  if (!md) return null;
  const m = /```(?:python|py|cpp|c\+\+|c)?[^\n]*\n([\s\S]*?)```/.exec(md);
  const code = m?.[1]?.trim();
  return code ? code : null;
}

function cleanMistakeDescription(d: string, hasCode: boolean) {
  return hasCode ? d.replace(/```[\s\S]*?```/g, "").replace(/\n{3,}/g, "\n\n").trim() : d;
}
function splitMiniChallengeAnswer(content: string) {
  const m = /(^|\n)\s*(?:\*\*)?Gợi ý đáp án:?(?:\*\*)?\s*/i.exec(content);
  return m ? { prompt: content.slice(0, m.index).trim(), answer: content.slice(m.index + m[0].length).trim() } : { prompt: content.trim(), answer: "" };
}
function structuredBlockId(b: { title?: string }, i: number) { return `block-${i}-${slugify(b.title || "section")}`; }
function stripMarkdown(v: string) { return v.replace(/```[\s\S]*?```/g," ").replace(/`([^`]+)`/g,"$1").replace(/\*\*([^*]+)\*\*/g,"$1").replace(/\*([^*]+)\*/g,"$1").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/\s+/g," ").trim(); }
function slugify(t: string) { return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").replace(/--+/g,"-"); }
function parseToc(html: string): TocItem[] { const d=document.createElement("div");d.innerHTML=html;return Array.from(d.querySelectorAll("h2,h3")).map(h=>({level:(h.tagName==="H2"?2:3)as 2|3,text:h.textContent?.trim()||"",id:h.id||slugify(h.textContent?.trim()||"section")})); }
function parseContentSegments(html: string): {type:"html"|"python_run"|"challenge";content:string;code?:string;expected?:string}[] {
  const s: any[]=[];const r=/<!--(PYTHON_RUN|CHALLENGE)\s*({[^}]*})?\s*-->([\s\S]*?)<!--\/\1-->/g;let li=0,m:any;while((m=r.exec(html))!==null){const b=html.slice(li,m.index).trim();if(b)s.push({type:"html",content:b});const cm=m[3].match(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/i);const code=decodeHtml(cm?cm[1]:m[3]).trim();if(m[1]==="CHALLENGE"){let e="";try{e=m[2]?JSON.parse(m[2]).expected||"":""}catch{}s.push({type:"challenge",content:m[3],code,expected:e})}else s.push({type:"python_run",content:m[3],code});li=r.lastIndex}const a=html.slice(li).trim();if(a)s.push({type:"html",content:a});return s.length?s:[{type:"html",content:html}];
}
function decodeHtml(v:string){return v.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"');}

/* ── MistakeDiffView: Monaco diff editor cho common_mistakes ── */
function MistakeDiffView({ mistakes, selectedIdx, language }: { mistakes: Array<{ wrongCode?: string; correctCode?: string; title?: string }>; selectedIdx: number; language?: string }) {
  const { dark } = useDarkMode();
  const m = mistakes[selectedIdx] || mistakes[0] || {};
  const original = m.wrongCode || "";
  const modified = m.correctCode || "";
  const title = m.title || `Lỗi ${selectedIdx + 1}`;
  const diffLanguage = language === "python" || language === "py" ? "python" : "cpp";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm dark:border-border dark:bg-card">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5 dark:border-border dark:bg-card/60">
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
          So sánh SAI vs ĐÚNG
        </span>
        <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{title}</span>
      </div>
      <div className="min-h-0 flex-1">
        <DiffEditor
          original={original}
          modified={modified}
          language={diffLanguage}
          theme={dark ? "vs-dark" : "vs"}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 20,
            scrollBeyondLastLine: false,
            renderOverviewRuler: false,
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: { vertical: "auto", horizontal: "auto" },
          }}
        />
      </div>
    </div>
  );
}
