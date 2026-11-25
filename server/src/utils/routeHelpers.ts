import { Request } from "express";
import prisma from "./prisma";

/** Extract a URL parameter as string */
export function param(req: Request, name: string): string {
  return String(req.params[name]);
}

/** Extract an optional query parameter as string */
export function query(req: Request, name: string): string | undefined {
  const val = req.query[name];
  return val ? String(val) : undefined;
}

export interface ListPagination {
  /** True when the client sent page/limit — respond with the envelope instead of a bare array. */
  hasPagination: boolean;
  page: number;
  limit: number;
  skip: number;
  /** Spread into a Prisma findMany: applies skip/take only when the client opted in. */
  clause: { skip: number; take: number } | Record<string, never>;
  /** Standard paginated envelope: { [itemsKey], total, page, limit, totalPages }. */
  envelope(itemsKey: string, items: unknown, total: number): Record<string, unknown>;
}

/**
 * Opt-in list pagination: only active when the client sends page/limit,
 * so legacy callers that expect a bare array keep working.
 */
export function paginate(
  req: Request,
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): ListPagination {
  const { defaultLimit = 20, maxLimit = 50 } = opts;
  const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit) || defaultLimit));
  return {
    hasPagination,
    page,
    limit,
    skip: (page - 1) * limit,
    clause: hasPagination ? { skip: (page - 1) * limit, take: limit } : {},
    envelope: (itemsKey, items, total) => ({
      [itemsKey]: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }),
  };
}

/**
 * Check if a user can access a course.
 *
 * Simplified authorization model:
 *  - Staff (admin/teacher/teaching_assistant) have full access to every course.
 *  - Students can view every course (no membership gating).
 * The CourseMember table is no longer used as an access gate.
 */
export async function checkCourseAccess(
  _userId: string,
  role: string,
  _courseId: string,
) {
  return isStaff(role) || role === "student";
}

/** Strip hidden test cases, returning only public ones as JSON string */
export function publicTestCases(value?: string | null) {
  if (!value) return value;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return JSON.stringify(
      parsed
        .filter((tc: any) => !tc?.hidden)
        .map((tc: any) => ({
          input: typeof tc.input === "string" ? tc.input : "",
          output: typeof tc.output === "string" ? tc.output : "",
          hidden: false,
        }))
        .filter((tc: any) => tc.output.length > 0),
    );
  } catch {
    return null;
  }
}

/** Remove teacher-only fields from a problem object before sending to student */
export function sanitizeProblemForStudent(
  problem: any,
  includePublicTests: boolean = true,
) {
  const result = { ...problem };
  delete result.teacherSolution;
  delete result.rubric;
  if (includePublicTests) {
    result.testCases = publicTestCases(result.testCases);
  } else {
    delete result.testCases;
  }
  return result;
}

/** Check if role has staff-level access */
export function isStaff(role: string): boolean {
  return role === "admin" || role === "teacher" || role === "teaching_assistant";
}

/** Format HTML content to plain-text preview snippet */
export function formatProblemPreview(value?: string | null) {
  if (!value) return value;
  return String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
