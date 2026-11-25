/** Shared Exam Room types — docs/architecture/exam-room.md */

export type ExamStatus = "draft" | "ready" | "published" | "closed" | "archived";
export type ExamQuestionType = "trac_nghiem" | "tra_loi_ngan" | "thuc_hanh";
export type ExamCodeLang = "python" | "cpp";
export type TestCaseKind = "mau" | "an";
export type TestCaseStatus = "nhap" | "cho_duyet" | "da_duyet" | "loai_bo";
export type AttemptStatus = "in_progress" | "submitted" | "expired";
export type GradeStatus = "pending" | "grading" | "graded" | "needs_review";
export type AntiCheatMode = "nghiem" | "ghi_log";

export interface ExamJsonDeThi {
  tieu_de: string;
  mo_ta?: string;
  mon?: string;
  thoi_gian_phut: number;
  thang_diem?: number;
  che_do_chat?: AntiCheatMode;
  cho_xem_ket_qua?: boolean;
  ngon_ngu_code?: ExamCodeLang[];
  ghi_chu_giao_vien?: string;
}

export interface ExamJsonTestMau {
  input: string;
  output: string;
  mo_ta?: string;
}

export interface ExamJsonSinhTc {
  so_luong?: number;
  chien_luoc?: string;
  ghi_chu_cho_llm?: string;
}

export interface ExamJsonCauHoi {
  ma_cau: string;
  loai: ExamQuestionType;
  do_kho: number;
  diem: number;
  stem: string;
  lua_chon?: string[];
  dap_an_index?: number;
  giai_thich?: string;
  dap_an?: string[];
  huong_dan_cham?: string;
  ngon_ngu?: ExamCodeLang;
  mo_ta_de?: string;
  rang_buoc?: string;
  goi_y_io?: { dinh_dang_input?: string; dinh_dang_output?: string };
  code_dap_an?: string;
  testcase_mau?: ExamJsonTestMau[];
  sinh_testcase?: ExamJsonSinhTc;
  ky_nang?: string[];
  tags?: string[];
}

export interface ExamJsonDocument {
  phien_ban: string;
  de_thi: ExamJsonDeThi;
  cau_hoi: ExamJsonCauHoi[];
}

export const SUPPORTED_EXAM_JSON_VERSIONS = new Set(["1.0"]);
export const STAFF_ROLES = ["admin", "teacher", "teaching_assistant"] as const;

export function isStaffRole(role?: string | null): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x));
}
