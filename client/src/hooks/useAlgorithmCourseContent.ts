import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStructuredCourseSlug, normalizeText } from "../lib/courseExperience";

export interface CourseContent {
  schemaVersion: string;
  course: {
    slug: string;
    title: string;
    description?: string;
    level?: string;
    language?: string;
  };
  modules: StructuredModule[];
}

export interface StructuredModule {
  slug: string;
  order: number;
  title: string;
  summary?: string;
  outcomes?: string[];
  lessons: StructuredLesson[];
}

export interface StructuredLesson {
  slug: string;
  order: number;
  title: string;
  estimatedMinutes?: number;
  video?: {
    url?: string;
    durationSeconds?: number | null;
    transcript?: string;
    chapters?: Array<{ title: string; startSeconds: number }>;
  };
  objectives?: string[];
  blocks: StructuredBlock[];
  exercises: Record<"support" | "core" | "challenge", StructuredExercise[]>;
  checklist?: string[];
}

export interface Figure {
  src?: string;
  alt?: string;
  caption?: string;
  imagePrompt?: string;
}

/**
 * Sân khấu bên trái của một block — khai báo tường minh trong JSON để UI không phải đoán.
 * - `figure`: ảnh chiếm trọn sân khấu (nhiều ảnh ⇒ carousel). Ưu tiên cao nhất.
 * - `code`: editor Python chạy được.
 * - `viz`: minh họa dữ liệu động (sieve, two_pointers, …).
 * - `inherit`: giữ nguyên sân khấu của block trước — dùng khi chữ đi tiếp mà hình không đổi.
 */
export type BlockStage =
  | { mode: "figure"; figures: Figure[] }
  | { mode: "code"; code: string; stdin?: string; expectedOutput?: string; editable?: boolean; label?: string; highlightLines?: number[]; revealAfterRun?: boolean }
  | { mode: "predict"; code: string; stdin?: string; revealAfterRun?: boolean; label?: string }
  | { mode: "compare"; label?: string }
  | { mode: "viz"; kind: string; config?: Record<string, any> }
  | { mode: "inherit" };

interface BlockBase {
  title: string;
  contentMd?: string;
  stage?: BlockStage;
}

export type StructuredBlock = BlockBase &
  (
    | { type: "text" | "concept" | "line_by_line" | "mini_challenge"; codeSnippets?: string[] }
    | { type: "example"; stdin?: string; expectedOutput?: string }
    | { type: "code_runner"; language?: string; code: string; stdin?: string; expectedOutput?: string; editable?: boolean }
    | { type: "visualization"; kind: string; config?: Record<string, any> }
    | { type: "common_mistakes"; mistakes?: Array<{ title: string; description?: string; wrongCode?: string; correctCode?: string }> }
    | { type: "summary"; keyPoints?: string[] }
    | { type: "quiz_gate"; quizSlug?: string }
  );

export interface StructuredExercise {
  slug: string;
  level: "support" | "core" | "challenge";
  title: string;
  estimatedMinutes?: number;
  statement?: string;
  inputFormat?: string;
  outputFormat?: string;
  constraints?: string[];
  sampleTests?: Array<{ input: string; output: string }>;
  starterCode?: string;
  hints?: string[];
  solution?: { code?: string; explanation?: string };
  tags?: string[];
  source?: string;
}

export function useCourseContent(slug: string | null | undefined, enabled = true) {
  return useQuery<CourseContent>({
    queryKey: ["course-content", slug],
    queryFn: () => fetch(`/course-content/${slug}.json`).then((res) => {
      if (!res.ok) throw new Error(`Cannot load course content: ${slug}`);
      return res.json();
    }),
    enabled: enabled && !!slug,
    staleTime: 60_000,
  });
}

export function useStructuredCourseContent(course: any, enabled = true) {
  return useCourseContent(getStructuredCourseSlug(course), enabled);
}

export function useAlgorithmCourseContent(enabled = true) {
  return useCourseContent("tu-duy-thuat-toan-co-ban", enabled);
}

export function useStructuredLesson(courseContent: CourseContent | undefined, lesson: any) {
  return useMemo(() => findStructuredLesson(courseContent, lesson), [courseContent, lesson?.title, lesson?.module?.title]);
}

export function findStructuredLesson(courseContent: CourseContent | undefined, lesson: any) {
  if (!courseContent || !lesson) return null;
  const lessonTitle = comparableLessonTitle(lesson.title);
  const moduleTitle = normalizeText(lesson.module?.title || "");

  for (const module of courseContent.modules || []) {
    const moduleMatches = !moduleTitle || normalizeText(module.title).includes(moduleTitle) || moduleTitle.includes(normalizeText(module.title));
    for (const item of module.lessons || []) {
      const itemTitle = comparableLessonTitle(item.title);
      if (itemTitle === lessonTitle || itemTitle.includes(lessonTitle) || lessonTitle.includes(itemTitle)) {
        if (!moduleTitle || moduleMatches) return { module, lesson: item };
      }
    }
  }

  return null;
}

function comparableLessonTitle(title?: string | null) {
  return normalizeText(title)
    .replace(/^bai\s+\d+\s*:?\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}
