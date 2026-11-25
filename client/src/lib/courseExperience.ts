export function normalizeText(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isAlgorithmCourse(course?: { title?: string | null; description?: string | null } | null) {
  if (!course) return false;
  // Title is the primary signal; a course whose description merely mentions
  // algorithms (or python) must not be misclassified.
  const title = normalizeText(course.title);
  const marker = `${title} ${normalizeText(course.description)}`;
  return title.includes("thuat toan") || marker.includes("course-type:algorithm");
}

export function isPythonBasicCourse(course?: { title?: string | null; description?: string | null } | null) {
  if (!course) return false;
  const title = normalizeText(course.title);
  const marker = `${title} ${normalizeText(course.description)}`;
  return title.includes("python") || marker.includes("course-type:python-basic");
}

export function isCppBasicCourse(course?: { title?: string | null; description?: string | null } | null) {
  if (!course) return false;
  const title = normalizeText(course.title);
  const marker = `${title} ${normalizeText(course.description)}`;
  return title.includes("c++") || title.includes("cpp") || marker.includes("course-type:cpp-basic");
}

/** Khóa lập trình thi đấu (C++): render bằng AlgorithmLessonView với structured JSON riêng. */
export function isCompetitiveCourse(course?: { title?: string | null; description?: string | null } | null) {
  if (!course) return false;
  const title = normalizeText(course.title);
  const marker = `${title} ${normalizeText(course.description)}`;
  return marker.includes("course-type:competitive");
}

export function isStructuredCourse(course?: { title?: string | null; description?: string | null } | null) {
  return isAlgorithmCourse(course) || isPythonBasicCourse(course) || isCppBasicCourse(course) || isCompetitiveCourse(course);
}

export function getStructuredCourseSlug(course?: { title?: string | null; description?: string | null } | null) {
  if (isPythonBasicCourse(course)) return "python-co-ban";
  if (isCppBasicCourse(course)) return "cpp-co-ban";
  if (isAlgorithmCourse(course)) return "tu-duy-thuat-toan-co-ban";
  if (isCompetitiveCourse(course)) return "lap-trinh-thi-dau-nhap-mon";
  return null;
}

export function getStructuredCourseKind(course?: { title?: string | null; description?: string | null } | null) {
  if (isPythonBasicCourse(course)) return "python-basic";
  if (isCppBasicCourse(course)) return "cpp-basic";
  if (isAlgorithmCourse(course)) return "algorithm";
  if (isCompetitiveCourse(course)) return "competitive";
  return "default";
}

/**
 * Which programming language a course is taught in, or null when the course
 * doesn't imply one (algorithm/thinking courses, ad-hoc courses).
 *
 * Arena forms use this to follow the teacher's course choice: picking a chapter
 * of the C++ course while the language toggle still says Python produced
 * questions whose focus was C++ loops but whose code was Python.
 */
export function languageForCourse(course?: { title?: string | null; description?: string | null } | null) {
  if (isCppBasicCourse(course)) return "cpp";
  if (isPythonBasicCourse(course)) return "python";
  return null;
}

export function getAlgorithmVisualizationKind(title?: string | null) {
  const text = normalizeText(title);
  if (text.includes("sang eratosthenes")) return "sieve";
  if (text.includes("nguyen to trong doan")) return "prime-prefix";
  if (text.includes("tien xu ly")) return "preprocessing";
  if (text.includes("danh dau")) return "marker-array";
  if (text.includes("tan suat")) return "frequency-array";
  if (text.includes("prefix")) return "prefix-sum";
  return "algorithm-flow";
}

export const exerciseLevels = [
  {
    key: "support",
    label: "Support",
    tone: "emerald",
    description: "Củng cố nền, phù hợp học sinh cần thêm bước đệm.",
  },
  {
    key: "core",
    label: "Core",
    tone: "blue",
    description: "Bài bắt buộc để xác nhận đã hiểu trọng tâm.",
  },
  {
    key: "challenge",
    label: "Challenge",
    tone: "amber",
    description: "Mở rộng cho học sinh khá giỏi hoặc muốn tăng tốc.",
  },
] as const;

export type ExerciseLevelKey = (typeof exerciseLevels)[number]["key"];
