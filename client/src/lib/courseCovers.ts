import { isAlgorithmCourse, isCppBasicCourse, isPythonBasicCourse } from "./courseExperience";

export const PYTHON_BASIC_COVER = "/course-covers/python-co-ban.png";
export const ALGORITHM_BASIC_COVER = "/course-covers/thuat-toan-co-ban.png";
export const CPP_BASIC_COVER = "/course-covers/cpp-co-ban.svg";

export function getCourseCoverUrl(course?: { coverImageUrl?: string | null; title?: string | null; description?: string | null } | null) {
  if (!course) return null;
  if (course.coverImageUrl) return course.coverImageUrl;
  if (isPythonBasicCourse(course)) return PYTHON_BASIC_COVER;
  if (isCppBasicCourse(course)) return CPP_BASIC_COVER;
  if (isAlgorithmCourse(course)) return ALGORITHM_BASIC_COVER;
  return null;
}
