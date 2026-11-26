import { useParams, useNavigate, useLocation } from"react-router-dom";
import { useQuery, useMutation, useQueryClient } from"@tanstack/react-query";
import { useEffect, useRef, useState, useMemo, useCallback } from"react";
import api from"../../lib/api";
import { useToast } from"../../hooks/useToast";
import { useAuthContext } from"../../contexts/AuthContext";
import { isStaff } from"../../lib/roles";
import DinoGame from"../../components/ui/DinoGame";
import MatchPairs from"../../components/ui/MatchPairs";
import PythonRunner from"../../components/ui/PythonRunner";
import AlgorithmLessonView from"./AlgorithmLessonView";
import { isStructuredCourse } from"../../lib/courseExperience";
import {
 ArrowLeft, ArrowRight, ChevronRight, Clock, BookOpen, CheckCircle2, List,
 ChevronDown, ChevronUp, Eye, Lock, ClipboardCheck,
} from"lucide-react";
import { Button } from"../../components/ui/button";
import { Badge } from"../../components/ui/badge";
import { Skeleton } from"../../components/ui/skeleton";

interface FlatLesson {
 id: string;
 title: string;
 moduleId: string;
 moduleTitle: string;
 estimatedDuration: number;
 completed: boolean;
 hasQuiz?: boolean;
 quizPassed?: boolean;
 locked?: boolean;
}

interface TocItem {
 level: 2 | 3;
 text: string;
 id: string;
}

interface ContentSegment {
 type:"html" |"python_run" |"challenge" |"dino_game" |"match_pairs";
 content: string;
 expected?: string;
 code?: string;
}

function slugify(text: string): string {
 return text
 .toLowerCase()
 .normalize("NFD")
 .replace(/[̀-ͯ]/g,"")
 .replace(/[^a-z0-9]+/g,"-")
 .replace(/^-+|-+$/g,"")
 .replace(/--+/g,"-");
}

function parseToc(html: string): TocItem[] {
 const div = document.createElement("div");
 div.innerHTML = html;
 const headings = div.querySelectorAll("h2, h3");
 const items: TocItem[] = [];
 const usedIds = new Set<string>();
 headings.forEach((h) => {
 let id = h.id || slugify(h.textContent?.trim() ||"");
 let base = id;
 let counter = 1;
 while (usedIds.has(id)) {
 id = `${base}-${counter}`;
 counter++;
 }
 usedIds.add(id);
 items.push({
 level: (h.tagName ==="H2" ? 2 : 3) as 2 | 3,
 text: h.textContent?.trim() ||"",
 id,
 });
 });
 return items;
}

function injectHeadingIds(html: string): string {
 const div = document.createElement("div");
 div.innerHTML = html;
 const headings = div.querySelectorAll("h2, h3");
 const usedIds = new Set<string>();
 headings.forEach((h) => {
 if (h.id) { usedIds.add(h.id); return; }
 let id = slugify(h.textContent?.trim() ||"");
 let base = id;
 let counter = 1;
 while (usedIds.has(id)) {
 id = `${base}-${counter}`;
 counter++;
 }
 usedIds.add(id);
 h.id = id;
 });
 return div.innerHTML;
}

function parseContentSegments(html: string): ContentSegment[] {
 const segments: ContentSegment[] = [];

 // Regex for paired blocks (PYTHON_RUN, CHALLENGE) and simple markers (DINO_GAME, MATCH_PAIRS)
 const markerRegex = /<!--(PYTHON_RUN|CHALLENGE)\s*({[^}]*})?\s*-->([\s\S]*?)<!--\/\1-->|<!--(DINO_GAME|MATCH_PAIRS)-->/g;
 let lastIndex = 0;
 let match: RegExpExecArray | null;

 while ((match = markerRegex.exec(html)) !== null) {
 // Push preceding HTML
 if (match.index > lastIndex) {
 const before = html.slice(lastIndex, match.index).trim();
 if (before) {
 // Convert any <pre><code> blocks in this HTML chunk to python_run segments
 segments.push(...splitHtmlWithCodeBlocks(before));
 }
 }

 // Simple marker (DINO_GAME or MATCH_PAIRS)
 if (match[4]) {
 segments.push({ type: match[4].toLowerCase() as"dino_game" |"match_pairs", content:"" });
 lastIndex = markerRegex.lastIndex;
 continue;
 }

 const markerType = match[1]; // PYTHON_RUN or CHALLENGE
 const configJson = match[2]; // {...} or undefined
 const innerHtml = match[3];

 // Extract code from <pre><code> block
 const codeMatch = innerHtml.match(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/i);
 const rawCode = codeMatch ? codeMatch[1] : innerHtml;

 // Decode HTML entities and trim
 const code = rawCode
 .replace(/&lt;/g,"<")
 .replace(/&gt;/g,">")
 .replace(/&amp;/g,"&")
 .replace(/&quot;/g, '"')
 .trim();

 if (markerType ==="CHALLENGE" && configJson) {
 try {
 const config = JSON.parse(configJson);
 segments.push({
 type:"challenge",
 content: innerHtml,
 code,
 expected: config.expected ||"",
 });
 } catch {
 // Fallback: treat as python_run if JSON is invalid
 segments.push({ type:"python_run", content: innerHtml, code });
 }
 } else {
 segments.push({ type:"python_run", content: innerHtml, code });
 }

 lastIndex = markerRegex.lastIndex;
 }

 // Push remaining HTML after last marker
 if (lastIndex < html.length) {
 const after = html.slice(lastIndex).trim();
 if (after) {
 // Convert any <pre><code> blocks in remaining HTML to python_run segments
 segments.push(...splitHtmlWithCodeBlocks(after));
 }
 }

 // If no markers found at all, return the full HTML as one segment
 if (segments.length === 0) {
 segments.push({ type:"html", content: html });
 }

 return segments;
}

// Split HTML content into segments, converting <pre><code> blocks to python_run
// so students can run/read-only code examples interactively.
function splitHtmlWithCodeBlocks(html: string): ContentSegment[] {
 const segments: ContentSegment[] = [];
 const preRegex = /<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi;
 let lastIndex = 0;
 let match: RegExpExecArray | null;

 while ((match = preRegex.exec(html)) !== null) {
 // Push preceding HTML (text between code blocks)
 if (match.index > lastIndex) {
 const before = html.slice(lastIndex, match.index).trim();
 if (before) segments.push({ type:"html", content: before });
 }

 // Decode HTML entities to get raw code
 const rawCode = match[1];
 const code = rawCode
 .replace(/&lt;/g,"<")
 .replace(/&gt;/g,">")
 .replace(/&amp;/g,"&")
 .replace(/&quot;/g, '"')
 .replace(/&#39;/g,"'")
 .replace(/&nbsp;/g,"")
 .trim();

 if (code) {
 segments.push({ type:"python_run", content:"", code });
 }

 lastIndex = preRegex.lastIndex;
 }

 // Push remaining HTML after last code block
 if (lastIndex < html.length) {
 const after = html.slice(lastIndex).trim();
 if (after) segments.push({ type:"html", content: after });
 }

 // If no code blocks found at all, return the original as single HTML segment
 if (segments.length === 0) {
 segments.push({ type:"html", content: html });
 }

 return segments;
}

export default function LessonView() {
 const { lessonId } = useParams<{ lessonId: string }>();
 const navigate = useNavigate();
 const location = useLocation();
 const qc = useQueryClient();
 const toast = useToast();
 const { user } = useAuthContext();
 const staff = isStaff(user?.role);

 const { data: lesson, isLoading, error } = useQuery({
 queryKey: ["lesson", lessonId],
 queryFn: () => api.get(`/lessons/${lessonId}`).then((r) => r.data),
 enabled: !!lessonId,
 });

 const courseId = lesson?.courseId;

 const { data: course } = useQuery({
 queryKey: ["course", courseId],
 queryFn: () => api.get(`/courses/${courseId}`).then((r) => r.data),
 enabled: !!courseId,
 });

 const { data: flatLessons } = useQuery({
 queryKey: ["course-lessons-flat", courseId],
 queryFn: () => api.get(`/courses/${courseId}/lessons/flat`).then((r) => r.data as FlatLesson[]),
 enabled: !!courseId,
 });

 const markRead = useMutation({
 mutationFn: () => api.post(`/lessons/${lessonId}/progress`),
 onSuccess: (res) => {
 if (res?.data?.tokensAwarded > 0) {
 toast.success({ title: `+${res.data.tokensAwarded} tokens`, message:"Hoàn thành bài học" });
 }
 qc.invalidateQueries({ queryKey: ["course-lessons-flat", courseId] });
 qc.invalidateQueries({ queryKey: ["course-modules"] });
 qc.invalidateQueries({ queryKey: ["course-all-lessons"] });
 },
 });

 // Scroll position memory
 const scrollKeyRef = useRef(`lesson_scroll_${lessonId}`);

 useEffect(() => {
 const key = `lesson_scroll_${lessonId}`;
 scrollKeyRef.current = key;
 const savedPos = localStorage.getItem(key);
 if (savedPos) {
 const mainEl = document.querySelector("main");
 if (mainEl) {
 requestAnimationFrame(() => {
 mainEl.scrollTo(0, parseInt(savedPos, 10));
 });
 }
 }
 }, [lessonId]);

 useEffect(() => {
 let ticking = false;
 const handleScroll = () => {
 if (!ticking) {
 requestAnimationFrame(() => {
 const mainEl = document.querySelector("main");
 if (mainEl && scrollKeyRef.current) {
 localStorage.setItem(scrollKeyRef.current, String(mainEl.scrollTop));
 }
 ticking = false;
 });
 ticking = true;
 }
 };
 const mainEl = document.querySelector("main");
 if (mainEl) {
 mainEl.addEventListener("scroll", handleScroll, { passive: true });
 return () => mainEl.removeEventListener("scroll", handleScroll);
 }
 }, []);

 // Scroll progress for sticky top bar
 const [scrollProgress, setScrollProgress] = useState(0);
 useEffect(() => {
 const mainEl = document.querySelector("main");
 if (!mainEl) return;
 const handleScroll = () => {
 const scrollTop = mainEl.scrollTop;
 const scrollHeight = mainEl.scrollHeight - mainEl.clientHeight;
 if (scrollHeight <= 0) { setScrollProgress(0); return; }
 setScrollProgress(Math.min((scrollTop / scrollHeight) * 100, 100));
 };
 mainEl.addEventListener("scroll", handleScroll, { passive: true });
 handleScroll();
 return () => mainEl.removeEventListener("scroll", handleScroll);
 }, [lessonId]);

 // Mark-complete: scroll to bottom sentinel
 const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
 const bottomSentinelRef = useRef<HTMLDivElement>(null);
 useEffect(() => {
 setHasScrolledToBottom(false);
 const el = bottomSentinelRef.current;
 if (!el) return;
 const mainEl = document.querySelector("main");
 const observer = new IntersectionObserver(
 ([entry]) => { if (entry.isIntersecting) setHasScrolledToBottom(true); },
 { root: mainEl, threshold: 0.5 }
 );
 observer.observe(el);
 return () => observer.disconnect();
 }, [lessonId, lesson?.content]);

 // Table of Contents
 const processedContent = useMemo(() => {
 if (!lesson?.content) return"";
 return injectHeadingIds(lesson.content);
 }, [lesson?.content]);

 const tocItems = useMemo(() => {
 if (!lesson?.content) return [];
 return parseToc(lesson.content);
 }, [lesson?.content]);

 const contentSegments = useMemo(() => {
 if (!processedContent) return [];
 return parseContentSegments(processedContent);
 }, [processedContent]);

 const [activeTocId, setActiveTocId] = useState<string>("");
 useEffect(() => {
 if (tocItems.length === 0) return;
 const mainEl = document.querySelector("main");
 const observers: IntersectionObserver[] = [];
 tocItems.forEach((item) => {
 const el = document.getElementById(item.id);
 if (!el) return;
 const observer = new IntersectionObserver(
 ([entry]) => { if (entry.isIntersecting) setActiveTocId(item.id); },
 { root: mainEl, rootMargin:"-80px 0px -60% 0px", threshold: 0 }
 );
 observer.observe(el);
 observers.push(observer);
 });
 return () => observers.forEach((o) => o.disconnect());
 }, [tocItems, lessonId]);

 const scrollToHeading = useCallback((id: string) => {
 const el = document.getElementById(id);
 if (el) el.scrollIntoView({ behavior:"smooth", block:"start" });
 }, []);

 const [mobileTocOpen, setMobileTocOpen] = useState(false);

 const currentIndex = flatLessons ? flatLessons.findIndex((l) => l.id === lessonId) : -1;
 const prevLesson = currentIndex > 0 ? flatLessons![currentIndex - 1] : null;
 const nextLesson = currentIndex >= 0 && currentIndex < flatLessons!.length - 1 ? flatLessons![currentIndex + 1] : null;
 const totalLessons = flatLessons?.length || 0;
 const progress = flatLessons ? flatLessons.filter((l) => l.completed).length : 0;
 const currentLesson = flatLessons ? flatLessons.find(l => l.id === lessonId) : null;
 const isCompleted = currentLesson?.completed ?? false;
 const hasQuiz = !!currentLesson?.hasQuiz;
 const quizPassed = !!currentLesson?.quizPassed;
 const isLocked = !!currentLesson?.locked;
 const nextLocked = !!nextLesson?.locked;
 const effectiveCompleted = isCompleted || quizPassed;
 const isMarkingRead = markRead.isPending;
 const hasToc = tocItems.length > 1;
 const estimatedMinutes = lesson?.estimatedDuration;
 const estimatedWords = lesson?.content?.replace(/<[^>]*>/g,"").split(/\s+/).length || 0;
 const estimatedReadMinutes = Math.max(1, Math.ceil(estimatedWords / 200));

 // Loading
 if (isLoading) {
 return (
 <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
 <div className="space-y-6">
 <Skeleton className="h-5 w-1/4" />
 <Skeleton className="h-8 w-2/3" />
 <Skeleton className="h-4 w-1/3" />
 <div className="space-y-3 mt-8">
 <Skeleton className="h-4 w-full" />
 <Skeleton className="h-4 w-5/6" />
 <Skeleton className="h-4 w-4/6" />
 </div>
 <Skeleton className="h-48 mt-6" />
 </div>
 </div>
 );
 }

 // Error / Not found
 if (error || !lesson) {
 return (
 <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
 <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
 <BookOpen className="w-10 h-10 text-muted-foreground/50" />
 </div>
 <p className="text-foreground font-semibold text-lg">Không tìm thấy bài học</p>
 <p className="text-muted-foreground text-sm mt-1 mb-6">Bài học này có thể đã bị xóa hoặc bạn không có quyền truy cập.</p>
 <Button variant="default" onClick={() => {
 if (window.history.length > 1 && location.key !=="default") navigate(-1);
 else navigate(`/courses/${courseId}/curriculum`);
 }} className="gap-2 px-5 py-2.5">
 <ArrowLeft className="w-4 h-4" /> Quay lại
 </Button>
 </div>
 );
 }

 if (isStructuredCourse(course)) {
 return (
 <AlgorithmLessonView
 lesson={lesson}
 flatLessons={flatLessons}
 lessonId={lessonId}
 course={course}
 markRead={{ mutate: () => markRead.mutate(), isPending: markRead.isPending }}
 />
 );
 }

 return (
 <div className="mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-7xl">
 {/* Global scroll progress bar */}
 <div className="fixed top-0 left-0 right-0 z-50 h-[3px] bg-muted">
 <div
 className="h-full bg-primary transition-[width] duration-200 ease-out"
 style={{ width: `${scrollProgress}%` }}
 />
 </div>

 {/* Back link */}
 <Button variant="ghost" size="sm"
 onClick={() => location.key !=="default" ? navigate(-1) : navigate(`/courses/${courseId}/curriculum`)}
 className="gap-1.5 -ml-2 px-2 text-muted-foreground hover:bg-transparent hover:text-foreground mb-4"
 >
 <ArrowLeft className="w-4 h-4" />
 <span>Quay lại chương trình học</span>
 </Button>

 {/* Progress strip */}
 {flatLessons && totalLessons > 0 && (
 <div className="mb-5 rounded-xl border border-border bg-card shadow-card overflow-hidden">
 <div className="px-4 py-2.5 flex items-center gap-4">
 <span className="text-xs font-medium text-muted-foreground tabular-nums">
 Bài {currentIndex + 1}/{totalLessons}
 </span>
 <div className="flex-1 flex items-center gap-2">
 <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[200px]">
 <div
 className="h-full bg-primary rounded-full transition-all duration-500"
 style={{ width: `${(progress / totalLessons) * 100}%` }}
 />
 </div>
 <span className="text-[11px] text-muted-foreground tabular-nums">{progress}/{totalLessons}</span>
 </div>
 <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
 <Clock className="w-3 h-3" />~{estimatedReadMinutes}p đọc
 </span>
 </div>
 </div>
 )}

 {/* Main: ToC sidebar + content */}
 <div className={`flex gap-6 lg:gap-8 ${hasToc ?"" :"justify-center"}`}>
 {/* Desktop ToC */}
 {hasToc && (
 <aside className="w-56 shrink-0 hidden lg:block">
 <div className="sticky top-20">
 <div className="flex items-center gap-2 mb-3 pl-1">
 <List className="w-3.5 h-3.5 text-muted-foreground" />
 <h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Mục lục</h4>
 <span className="text-[10px] text-muted-foreground/60 ml-auto">{tocItems.length} mục</span>
 </div>
 <nav className="space-y-0.5 border-l border-border pl-3">
 {tocItems.map((item) => (
 <Button
 key={item.id}
 variant="ghost"
 size="xs"
 onClick={() => scrollToHeading(item.id)}
 className={`w-full justify-start text-left truncate border-l-2 -ml-[13px] pl-4 rounded-md ${ activeTocId === item.id ?"border-foreground bg-muted text-foreground font-medium" :"border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60" } ${item.level === 3 ?"ml-0" :""}`}
 >
 {item.text}
 </Button>
 ))}
 </nav>
 </div>
 </aside>
 )}

 {/* Content column */}
 <div className={`${hasToc ?"flex-1 min-w-0 max-w-[760px]" :"w-full max-w-[760px]"}`}>
 {/* Mobile ToC + lesson header */}
 <div className="mb-8">
 {hasToc && (
 <div className="lg:hidden mb-4">
 <Button variant="outline"
 onClick={() => setMobileTocOpen(!mobileTocOpen)}
 className="gap-2 w-full px-4 py-2.5 h-auto justify-start"
 >
 <List className="w-4 h-4" />
 <span className="font-medium">Mục lục</span>
 <span className="text-xs">({tocItems.length} mục)</span>
 <span className="ml-auto">{mobileTocOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
 </Button>
 {mobileTocOpen && (
 <nav className="mt-2 rounded-xl border border-border bg-card p-2 space-y-0.5 max-h-64 overflow-y-auto shadow-card">
 {tocItems.map((item) => (
 <Button
 key={item.id}
 variant="ghost"
 size="xs"
 onClick={() => { scrollToHeading(item.id); setMobileTocOpen(false); }}
 className={`w-full justify-start text-left truncate rounded-lg ${
 activeTocId === item.id ?"bg-muted text-foreground font-medium" :"text-muted-foreground hover:bg-muted"
 } ${item.level === 3 ?"pl-7" :""}`}
 >
 {item.text}
 </Button>
 ))}
 </nav>
 )}
 </div>
 )}

 {/* Module + status */}
 <div className="flex items-center gap-2 text-xs mb-3">
 <span className="flex items-center gap-1.5 text-muted-foreground">
 <BookOpen className="w-3.5 h-3.5" />
 {lesson.module?.title}
 </span>
 {isCompleted && (
 <Badge variant="secondary" className="gap-1 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">
 <CheckCircle2 className="w-3 h-3" /> Đã hoàn thành
 </Badge>
 )}
 </div>

 {/* Title */}
 <h1 className="text-2xl font-semibold text-foreground leading-tight tracking-tight mb-3">
 {lesson.title}
 </h1>

 {/* Meta row */}
 <div className="flex flex-wrap items-center gap-3">
 {lesson.description && (
 <p className="text-muted-foreground text-sm leading-relaxed flex-1 min-w-[200px]">{lesson.description}</p>
 )}
 <div className="flex flex-wrap items-center gap-2">
 {estimatedMinutes && (
 <Badge variant="secondary" className="gap-1.5 px-2.5 py-1">
 <Clock className="w-3.5 h-3.5" />{estimatedMinutes}p
 </Badge>
 )}
 <Badge variant="secondary" className="gap-1.5 px-2.5 py-1">
 <Eye className="w-3.5 h-3.5" />~{estimatedReadMinutes}p đọc
 </Badge>
 {scrollProgress > 0 && scrollProgress < 100 && (
 <span className="text-[11px] text-muted-foreground tabular-nums">Đã đọc {Math.round(scrollProgress)}%</span>
 )}
 {staff && lesson && (
 <Button
  variant="outline"
  size="xs"
  className="h-7 gap-1 text-xs"
  onClick={() =>
    navigate(
      `/assignments?quickType=lesson&quickId=${encodeURIComponent(lesson.id)}&quickTitle=${encodeURIComponent(lesson.title)}`,
    )
  }
 >
  <ClipboardCheck className="w-3.5 h-3.5" /> Giao bài học
 </Button>
 )}
 </div>
 </div>
 </div>

 {/* Content card */}
 <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
 {lesson.content ? (
 <div className="p-6 sm:p-8">
 <div className="lesson-content">
 {contentSegments.map((seg, i) => {
 if (seg.type ==="html") {
 return <div key={i} dangerouslySetInnerHTML={{ __html: seg.content }} />;
 }
 if (seg.type ==="dino_game") {
 return <DinoGame key={i} />;
 }
 if (seg.type ==="match_pairs") {
 return (
 <MatchPairs
 key={i}
 title="Nối mỗi bước nấu ăn với code Python tương ứng"
 description="Kéo từ chấm tròn bên trái sang chấm tròn bên phải để nối."
 pairs={[
 { id: 0, left: { emoji:"🥚", label:"Lấy 2 quả trứng" }, right: { text: 'so_trung = 2' } },
 { id: 1, left: { emoji:"🍳", label:"Đập trứng vào chảo" }, right: { text: 'print("Đập trứng vào chảo 🍳")' } },
 { id: 2, left: { emoji:"⏱️", label:"Chiên 3 phút" }, right: { text: 'print("Đợi 3 phút... ⏱️")' } },
 { id: 3, left: { emoji:"😋", label:"Bày ra đĩa, thưởng thức!" }, right: { text: 'print("Xong rồi! 😋")' } },
 ]}
 />
 );
 }
 if (seg.type ==="python_run") {
 return (
 <PythonRunner
 key={i}
 initialCode={seg.code ||""}
 saveKey={lessonId ? `${lessonId}_${i}` : undefined}
 recordAs={lessonId ? { lessonId, challengeKey: `${lessonId}_${i}`, title:"Chạy thử" } : undefined}
 className="my-5"
 />
 );
 }
 if (seg.type ==="challenge") {
 return (
 <PythonRunner
 key={i}
 initialCode={seg.code ||""}
 expectedOutput={seg.expected}
 saveKey={lessonId ? `${lessonId}_${i}` : undefined}
 recordAs={lessonId ? { lessonId, challengeKey: `${lessonId}_${i}`, title:"Challenge" } : undefined}
 className="my-5"
 />
 );
 }
 return null;
 })}
 </div>
 </div>
 ) : (
 <div className="text-center py-16 px-6">
 <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
 <BookOpen className="w-8 h-8 text-muted-foreground/50" />
 </div>
 <p className="text-foreground font-medium">Bài học này chưa có nội dung</p>
 <p className="text-muted-foreground text-sm mt-1">Giáo viên sẽ cập nhật nội dung sau.</p>
 </div>
 )}
 </div>

 {/* Quizzes live on a dedicated page: /lessons/:lessonId/quiz */}

 {/* Bottom sentinel */}
 <div ref={bottomSentinelRef} className="h-1" />

 {/* Completion section — one consistent card pattern */}
 <div className="mt-10">
 {effectiveCompleted ? (
 <div className="rounded-xl border border-border bg-card p-6 text-center shadow-card">
 <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
 <CheckCircle2 className="h-6 w-6" />
 </div>
 <h3 className="text-lg font-semibold tracking-tight text-foreground mb-1">Bài học đã hoàn thành!</h3>
 <p className="text-sm text-muted-foreground mb-4">Bạn đã nắm được kiến thức của bài này.</p>
 {nextLesson && (
 <Button variant="default"
 onClick={() => navigate(`/lessons/${nextLesson.id}`)}
 className="gap-2 px-6 py-3"
 >
 Học bài tiếp theo <ArrowRight className="w-4 h-4" />
 </Button>
 )}
 </div>
 ) : hasQuiz ? (
 <div className="rounded-xl border border-border bg-card p-6 text-center shadow-card">
 <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
 <ClipboardCheck className="w-7 h-7 text-primary" />
 </div>
 <h3 className="text-lg font-semibold tracking-tight text-foreground mb-1">Làm bài kiểm tra để hoàn thành</h3>
 <p className="text-sm text-muted-foreground">Đạt bài kiểm tra để đánh dấu đã học xong và mở khóa bài tiếp theo.</p>
 <Button variant="default"
 onClick={() => navigate(`/lessons/${lessonId}/quiz`)}
 className="mt-4 gap-2 px-6 py-2.5"
 >
 Vào làm bài kiểm tra <ChevronRight className="h-4 w-4" />
 </Button>
 </div>
 ) : hasScrolledToBottom ? (
 <div className="rounded-xl border border-border bg-card p-8 text-center shadow-card">
 <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
 <CheckCircle2 className="w-7 h-7 text-primary" />
 </div>
 <h3 className="text-lg font-semibold tracking-tight text-foreground mb-1">Bạn đã đọc xong bài học!</h3>
 <p className="text-sm text-muted-foreground mb-2">
 {estimatedReadMinutes} phút đọc{hasToc ? ` • ${tocItems.length} mục` :""}
 </p>
 <div className="w-32 h-1 bg-muted rounded-full mx-auto mb-5">
 <div className="h-full bg-primary rounded-full w-full" />
 </div>
 <Button variant="default"
 onClick={() => markRead.mutate()}
 disabled={isMarkingRead}
 className="gap-2 px-7 py-3"
 >
 <CheckCircle2 className="w-5 h-5" />
 {isMarkingRead ?"Đang lưu..." :"Đánh dấu đã hoàn thành"}
 </Button>
 {nextLesson && (
 <p className="text-xs text-muted-foreground mt-3">
 Hoặc học tiếp{""}
 <Button variant="link" onClick={() => navigate(`/lessons/${nextLesson.id}`)} className="text-primary font-medium">
 {nextLesson.title}
 </Button>
 </p>
 )}
 </div>
 ) : (
 <div className="text-center py-6">
 <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted/60 border border-border rounded-full">
 <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
 <p className="text-xs text-muted-foreground">
 Còn <span className="font-semibold text-foreground">{Math.round(100 - scrollProgress)}%</span> nữa — kéo xuống cuối để hoàn thành
 </p>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>

 {/* Bottom navigation */}
 {flatLessons && totalLessons > 0 && (
 <div className="mt-10 pt-6 border-t border-border">
 <div className="flex gap-3 max-w-[760px] mx-auto">
 {prevLesson ? (
 <Button variant="outline"
 onClick={() => navigate(`/lessons/${prevLesson.id}`)}
 className="flex-1 gap-3 px-5 py-3.5 h-auto justify-start"
 >
 <ArrowLeft className="w-5 h-5 text-muted-foreground shrink-0 transition-colors" />
 <div className="text-left min-w-0">
 <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">← Quay lại</span>
 <p className="text-sm truncate text-foreground font-medium">{prevLesson.title}</p>
 </div>
 </Button>
 ) : <div className="flex-1" />}
 {nextLesson && (
 <Button variant={nextLocked ?"outline" :"default"}
 onClick={() => !nextLocked && navigate(`/lessons/${nextLesson.id}`)}
 disabled={nextLocked}
 className={`flex-1 gap-3 px-5 py-3.5 h-auto justify-end ${nextLocked ?"cursor-not-allowed opacity-60" :""}`}
 >
 <div className="text-right min-w-0">
 <span className={`text-[10px] uppercase tracking-wider font-medium flex items-center justify-end gap-1 ${nextLocked ?"text-muted-foreground" :"text-primary-foreground/70"}`}>
 {nextLocked ? <><Lock className="w-3 h-3" /> Chưa mở khóa</> : <>Tiếp theo →</>}
 </span>
 <p className={`text-sm truncate font-medium ${nextLocked ?"text-muted-foreground" :"text-primary-foreground"}`}>{nextLesson.title}</p>
 </div>
 {nextLocked ? <Lock className="w-5 h-5 shrink-0" /> : <ArrowRight className="w-5 h-5 text-primary-foreground/70 shrink-0" />}
 </Button>
 )}
 </div>
 </div>
 )}
 </div>
 );
}
