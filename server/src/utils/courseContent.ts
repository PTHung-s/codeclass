import fs from "fs";
import path from "path";

// ── Types ──

interface JsonLesson {
  title: string;
  order: number;
  slug: string;
  objectives?: string[];
}

interface JsonModule {
  title: string;
  order: number;
  slug: string;
  summary?: string;
  outcomes?: string[];
  lessons: JsonLesson[];
}

interface JsonCourseContent {
  modules: JsonModule[];
}

/** What a teacher-selected chapter actually teaches, for AI prompts. */
export interface ModuleContext {
  title: string;
  summary: string | null;
  outcomes: string[];
  lessons: Array<{ title: string; objectives: string[] }>;
}

// ── Cache ──

const contentCache = new Map<string, JsonCourseContent>();
const objectivesCache = new Map<string, Map<string, string[]>>(); // cacheKey → (normalizedTitle → objectives)

// ── Paths ──

/**
 * Built client output is the source of truth in production. In development the
 * Vite build may not have run yet, so fall back to the source copy under
 * client/public — same fallback the C++ course seeder uses.
 */
function getContentCandidates(slug: string): string[] {
  const base = path.resolve(__dirname, "..", "..", "..", "client");
  return [
    path.join(base, "dist", "course-content", `${slug}.json`),
    path.join(base, "public", "course-content", `${slug}.json`),
  ];
}

// ── Slug detection ──

/**
 * Mirrors `getStructuredCourseSlug` in client/src/lib/courseExperience.ts.
 * Keep the two in sync: a course the client renders from a content JSON must
 * resolve to the same JSON here, or AI prompts silently lose the lesson detail.
 */
function detectSlug(course: { title: string; description?: string | null }): string | null {
  const title = (course.title || "").toLowerCase();
  const desc = (course.description || "").toLowerCase();
  const marker = `${title} ${desc}`;

  // C++ first: "C++ Cơ Bản" is the most specific signal and must not be
  // swallowed by a looser match below.
  if (title.includes("c++") || title.includes("cpp") || marker.includes("course-type:cpp-basic")) {
    return "cpp-co-ban";
  }
  if (title.includes("python") || marker.includes("course-type:python-basic")) {
    return "python-co-ban";
  }
  if (title.includes("thuật toán") || title.includes("tư duy") || marker.includes("course-type:algorithm")) {
    return "tu-duy-thuat-toan-co-ban";
  }
  return null;
}

// ── Loading ──

function loadContent(slug: string): JsonCourseContent | null {
  if (contentCache.has(slug)) return contentCache.get(slug)!;

  for (const filePath of getContentCandidates(slug)) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, "utf-8");
      const content = JSON.parse(raw) as JsonCourseContent;
      contentCache.set(slug, content);
      return content;
    } catch {
      // Try the next candidate rather than giving up on a single bad read.
    }
  }
  return null;
}

// ── Title normalization ──

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^bài\s+\d+\s*:?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Build objectives lookup ──

function buildMap(courseId: string, slug: string): Map<string, string[]> | null {
  const key = `${courseId}:${slug}`;
  if (objectivesCache.has(key)) return objectivesCache.get(key)!;

  const content = loadContent(slug);
  if (!content) {
    objectivesCache.set(key, null as any);
    return null;
  }

  const map = new Map<string, string[]>();
  for (const mod of content.modules) {
    for (const lesson of mod.lessons) {
      if (lesson.objectives && lesson.objectives.length > 0) {
        map.set(normalizeTitle(lesson.title), lesson.objectives);
      }
    }
  }
  objectivesCache.set(key, map);
  return map;
}

// ── Public API ──

/**
 * Get objectives for a single lesson. Returns null if not found.
 */
export function getLessonObjectives(
  course: { id: string; title: string; description?: string | null },
  lessonTitle: string,
): string[] | null {
  const slug = detectSlug(course);
  if (!slug) return null;
  const map = buildMap(course.id, slug);
  if (!map) return null;
  return map.get(normalizeTitle(lessonTitle)) ?? null;
}

/**
 * Bulk fetch objectives for many lessons. Returns a Map from lessonTitle → objectives[].
 * Missing lessons are simply not in the map.
 */
export function getBulkLessonObjectives(
  course: { id: string; title: string; description?: string | null },
  lessonTitles: string[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const slug = detectSlug(course);
  if (!slug) return result;
  const map = buildMap(course.id, slug);
  if (!map) return result;
  for (const title of lessonTitles) {
    const obj = map.get(normalizeTitle(title));
    if (obj) result.set(title, obj);
  }
  return result;
}

/**
 * Format objectives into a compact string for AI prompts.
 */
export function formatObjectives(objectives: string[]): string {
  return objectives.map((o) => `    ✓ ${o}`).join("\n");
}

/**
 * Everything a teacher-selected chapter actually teaches: its summary, the
 * outcomes students should reach, and the objectives of each lesson in it.
 *
 * The database only reliably holds lesson *titles* — the C++ course seeder
 * writes no description and no content — so a prompt built from Prisma rows
 * alone tells the AI nothing beyond a list of names. The content JSON is where
 * the real teaching material lives, and this is how it reaches the prompt.
 *
 * Matching is by normalized title because module/lesson ids in the database are
 * seeder-generated and don't appear in the JSON.
 */
export function getModuleContext(
  course: { id: string; title: string; description?: string | null },
  moduleTitle: string,
): ModuleContext | null {
  const slug = detectSlug(course);
  if (!slug) return null;
  const content = loadContent(slug);
  if (!content) return null;

  const wanted = normalizeTitle(moduleTitle);
  const mod = content.modules.find((m) => normalizeTitle(m.title) === wanted);
  if (!mod) return null;

  return {
    title: mod.title,
    summary: mod.summary?.trim() || null,
    outcomes: Array.isArray(mod.outcomes) ? mod.outcomes.filter(Boolean) : [],
    lessons: mod.lessons.map((l) => ({
      title: l.title,
      objectives: Array.isArray(l.objectives) ? l.objectives.filter(Boolean) : [],
    })),
  };
}

/**
 * Render a ModuleContext as the chapter-focus block of an AI prompt.
 * Kept here so Debug Arena and Quiz Arena describe a chapter identically.
 */
export function formatModuleContext(ctx: ModuleContext): string {
  const lines: string[] = [`Nội dung chương "${ctx.title}":`];
  if (ctx.summary) lines.push(`  Tóm tắt: ${ctx.summary}`);
  if (ctx.outcomes.length > 0) {
    lines.push(`  Sau chương này học sinh phải:`);
    for (const outcome of ctx.outcomes) lines.push(`    ✓ ${outcome}`);
  }
  if (ctx.lessons.length > 0) {
    lines.push(`  Các bài trong chương:`);
    for (const lesson of ctx.lessons) {
      lines.push(`  - ${lesson.title}`);
      for (const objective of lesson.objectives) lines.push(`      ✓ ${objective}`);
    }
  }
  return lines.join("\n");
}
