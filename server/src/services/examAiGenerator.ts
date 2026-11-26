import prisma from "../utils/prisma";
import { chatCompletion, hasLLM } from "../utils/llmClient";
import { SKILL_SEEDS, skillIdToName } from "../utils/skillGraph";
import type { ExamCodeLang, ExamJsonCauHoi } from "./examTypes";

const VALID_SKILL_IDS = new Set(SKILL_SEEDS.map((s) => s.skillId));

export interface GenerateExamDraftInput {
  prompt: string;
  courseId?: string;
  mcqCount: number;
  shortAnswerCount: number;
  codingCount: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  codeLanguage: ExamCodeLang;
  existingStems?: string[];
}

export interface GeneratedExamDraft {
  tieu_de: string;
  mo_ta: string;
  thoi_gian_phut: number;
  cau_hoi: ExamJsonCauHoi[];
  provider?: string;
  model?: string;
}

/**
 * Extract the outermost JSON object from an LLM reply (supports raw JSON or ```json fenced output).
 */
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("AI không trả về JSON đề thi hợp lệ.");
  }
}

function clampDifficulty(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(5, n));
}

function positivePoints(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n * 100) / 100;
}

function filterValidSkills(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const id = String(item || "").trim();
    if (id && VALID_SKILL_IDS.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Validate and normalize a parsed JSON payload from LLM into ExamJsonCauHoi items.
 */
export function normalizeAiExamDraft(
  raw: unknown,
  fallbackLang: ExamCodeLang = "python",
): Omit<GeneratedExamDraft, "provider" | "model"> {
  if (!raw || typeof raw !== "object") {
    throw new Error("Dữ liệu AI trả về không đúng cấu trúc.");
  }
  const obj = raw as Record<string, unknown>;
  const meta = (obj.de_thi && typeof obj.de_thi === "object" ? obj.de_thi : obj) as Record<string, unknown>;
  const rawList = Array.isArray(obj.cau_hoi) ? obj.cau_hoi : Array.isArray(obj.questions) ? obj.questions : [];

  const tieu_de = String(meta.tieu_de || obj.tieu_de || "Đề kiểm tra tổng hợp").trim().slice(0, 160);
  const mo_ta = String(meta.mo_ta || obj.mo_ta || "").trim().slice(0, 500);
  const rawDuration = Math.round(Number(meta.thoi_gian_phut || obj.thoi_gian_phut || 45));
  const thoi_gian_phut = Number.isFinite(rawDuration) ? Math.max(10, Math.min(240, rawDuration)) : 45;

  const normalized: ExamJsonCauHoi[] = [];

  for (const entry of rawList) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const loai = String(item.loai || "").trim();
    const stem = String(item.stem || "").trim();
    if (!stem) continue;

    const ma_cau = `C${String(normalized.length + 1).padStart(2, "0")}`;
    const do_kho = clampDifficulty(item.do_kho);
    const ky_nang = filterValidSkills(item.ky_nang);

    if (loai === "trac_nghiem") {
      const lua_chon = Array.isArray(item.lua_chon)
        ? item.lua_chon.map((s) => String(s ?? "").trim()).filter(Boolean).slice(0, 6)
        : [];
      if (lua_chon.length < 2) continue;
      const rawIdx = Math.round(Number(item.dap_an_index ?? 0));
      const dap_an_index = Number.isFinite(rawIdx) ? Math.max(0, Math.min(lua_chon.length - 1, rawIdx)) : 0;
      const giai_thich = typeof item.giai_thich === "string" && item.giai_thich.trim() ? item.giai_thich.trim() : undefined;
      normalized.push({
        ma_cau,
        loai: "trac_nghiem",
        do_kho,
        diem: positivePoints(item.diem, 1),
        stem,
        lua_chon,
        dap_an_index,
        giai_thich,
        ky_nang,
      });
    } else if (loai === "tra_loi_ngan") {
      const rawAnswers = Array.isArray(item.dap_an)
        ? item.dap_an
        : typeof item.dap_an === "string"
          ? item.dap_an.split(/\n|;/)
          : [];
      const dap_an = rawAnswers.map((s) => String(s ?? "").trim()).filter(Boolean);
      if (dap_an.length === 0) continue;
      const huong_dan_cham =
        typeof item.huong_dan_cham === "string" && item.huong_dan_cham.trim()
          ? item.huong_dan_cham.trim()
          : undefined;
      normalized.push({
        ma_cau,
        loai: "tra_loi_ngan",
        do_kho,
        diem: positivePoints(item.diem, 1.5),
        stem,
        dap_an,
        huong_dan_cham,
        ky_nang,
      });
    } else if (loai === "thuc_hanh") {
      const ngon_ngu: ExamCodeLang = item.ngon_ngu === "cpp" || item.ngon_ngu === "python" ? item.ngon_ngu : fallbackLang;
      const code_dap_an = typeof item.code_dap_an === "string" ? item.code_dap_an.trim() : "";
      const rawCases = Array.isArray(item.testcase_mau) ? item.testcase_mau : [];
      const testcase_mau = rawCases
        .filter((tc): tc is Record<string, unknown> => !!tc && typeof tc === "object")
        .map((tc) => ({
          input: String(tc.input ?? ""),
          output: String(tc.output ?? ""),
        }))
        .filter((tc) => tc.output.trim().length > 0);
      if (!code_dap_an || testcase_mau.length === 0) continue;
      const rang_buoc =
        typeof item.rang_buoc === "string" && item.rang_buoc.trim() ? item.rang_buoc.trim() : undefined;
      normalized.push({
        ma_cau,
        loai: "thuc_hanh",
        do_kho,
        diem: positivePoints(item.diem, 3),
        stem,
        ngon_ngu,
        code_dap_an,
        rang_buoc,
        testcase_mau,
        ky_nang,
      });
    }
  }

  if (normalized.length === 0) {
    throw new Error("AI không sinh được câu hỏi hợp lệ nào. Hãy mô tả rõ hơn và thử lại.");
  }

  return { tieu_de, mo_ta, thoi_gian_phut, cau_hoi: normalized };
}

const SYSTEM_PROMPT = `Bạn là chuyên gia biên soạn đề thi lập trình và khoa học máy tính cho học sinh Việt Nam (11-18 tuổi).
Nhiệm vụ: Tạo một đề thi hoặc bộ câu hỏi chất lượng cao bằng tiếng Việt có dấu dưới dạng JSON hợp lệ.

QUY TẮC BẮT BUỘC:
1. Chỉ trả về MỘT JSON object duy nhất có cấu trúc:
{
  "tieu_de": "Tiêu đề đề thi ngắn gọn, rõ chủ đề",
  "mo_ta": "Mô tả ngắn 1 câu về phạm vi kiến thức",
  "thoi_gian_phut": 45,
  "cau_hoi": [ ... ]
}
2. Có 3 loại câu hỏi hợp lệ (dùng đúng tên trường tiếng Việt):
- Trắc nghiệm ("loai": "trac_nghiem"):
  {
    "loai": "trac_nghiem",
    "do_kho": 1..5,
    "diem": 1,
    "stem": "Nội dung câu hỏi rõ ràng (có thể chứa khối code markdown)",
    "lua_chon": ["Phương án A", "Phương án B", "Phương án C", "Phương án D"],
    "dap_an_index": 0,
    "giai_thich": "Giải thích ngắn gọn vì sao đáp án đúng",
    "ky_nang": ["skillId hợp lệ nếu khớp"]
  }
- Trả lời ngắn ("loai": "tra_loi_ngan"):
  {
    "loai": "tra_loi_ngan",
    "do_kho": 1..5,
    "diem": 1.5,
    "stem": "Câu hỏi yêu cầu trả lời ngắn / kết quả đầu ra",
    "dap_an": ["đáp án chuẩn", "biến thể chấp nhận nếu có"],
    "huong_dan_cham": "Gợi ý chấm cho giáo viên / AI",
    "ky_nang": []
  }
- Thực hành lập trình ("loai": "thuc_hanh"):
  {
    "loai": "thuc_hanh",
    "do_kho": 1..5,
    "diem": 3,
    "stem": "Đề bài đầy đủ: Mô tả bài toán, Input, Output, Ví dụ",
    "ngon_ngu": "python" hoặc "cpp",
    "rang_buoc": "Ví dụ: 1 <= n <= 10^5",
    "code_dap_an": "Code lời giải HOÀN CHỈNH đọc stdin bằng input()/cin và in stdout bằng print()/cout",
    "testcase_mau": [{"input": "...", "output": "..."}],
    "ky_nang": []
  }
3. Với câu "thuc_hanh", code_dap_an PHẢI chạy đúng và cho kết quả khớp chính xác từng ký tự/dòng với testcase_mau. Không dùng thư viện ngoài hay os/subprocess/file.
4. "ky_nang" CHỈ chọn từ danh sách mã kỹ năng hợp lệ được cung cấp (hoặc để mảng rỗng []).
5. KHÔNG trùng lặp ý tưởng với danh sách câu hỏi đã có (nếu được cung cấp).`;

export async function generateExamDraft(input: GenerateExamDraftInput): Promise<GeneratedExamDraft> {
  if (!hasLLM()) {
    const err = new Error("Chưa cấu hình AI (LLM) trên hệ thống — vui lòng thiết lập khóa API trong mục Cài đặt AI.");
    (err as any).statusCode = 503;
    throw err;
  }

  let courseContext = "";
  let preferredSkillIds: string[] = [];

  if (input.courseId) {
    const course = await prisma.course.findUnique({
      where: { id: input.courseId },
      select: {
        title: true,
        description: true,
        modules: {
          orderBy: { orderIndex: "asc" },
          select: {
            title: true,
            lessons: {
              orderBy: { orderIndex: "asc" },
              select: { title: true },
            },
          },
        },
      },
    });

    if (course) {
      const moduleSummary = course.modules
        .slice(0, 10)
        .map((m) => `- ${m.title}: ${m.lessons.slice(0, 6).map((l) => l.title).join(", ")}`)
        .join("\n");
      courseContext = `\nNgữ cảnh khóa học "${course.title}"${course.description ? ` (${course.description.slice(0, 150)})` : ""}:\n${moduleSummary || "(Chưa có bài học chi tiết)"}`;

      const skillRows = await prisma.quizQuestion.findMany({
        where: {
          quiz: { lesson: { courseId: input.courseId } },
          skillId: { not: null },
        },
        select: { skillId: true },
        distinct: ["skillId"],
        take: 20,
      });
      preferredSkillIds = skillRows.map((r) => r.skillId).filter((id): id is string => !!id && VALID_SKILL_IDS.has(id));
    }
  }

  const skillHints = (preferredSkillIds.length > 0 ? preferredSkillIds : SKILL_SEEDS.slice(0, 25).map((s) => s.skillId))
    .map((id) => `${id} (${skillIdToName(id)})`)
    .join(", ");

  const diffDesc =
    input.difficulty === "easy"
      ? "Cơ bản (do_kho 1-2)"
      : input.difficulty === "medium"
        ? "Trung bình (do_kho 2-4)"
        : input.difficulty === "hard"
          ? "Nâng cao / vận dụng cao (do_kho 4-5)"
          : "Phân hóa hỗn hợp từ cơ bản đến nâng cao (do_kho 1-5)";

  const existingSection =
    input.existingStems && input.existingStems.length > 0
      ? `\nCác câu hỏi ĐÃ CÓ trong đề (KHÔNG được lặp lại):\n${input.existingStems
          .slice(0, 25)
          .map((s, i) => `${i + 1}. ${s.replace(/\s+/g, " ").slice(0, 120)}`)
          .join("\n")}`
      : "";

  const userPrompt = [
    `Yêu cầu nội dung của giáo viên: ${input.prompt || "Bám sát chương trình khóa học bên dưới"}`,
    courseContext,
    `\nSố lượng câu hỏi cần tạo CHÍNH XÁC:`,
    `- Trắc nghiệm (trac_nghiem): ${input.mcqCount} câu`,
    `- Trả lời ngắn (tra_loi_ngan): ${input.shortAnswerCount} câu`,
    `- Thực hành code (thuc_hanh, ngôn ngữ ${input.codeLanguage}): ${input.codingCount} câu`,
    `Độ khó mục tiêu: ${diffDesc}`,
    `Danh sách mã kỹ năng hợp lệ tham khảo: ${skillHints}`,
    existingSection,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await chatCompletion(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    {
      temperature: 0.4,
      max_tokens: 6000,
      response_format: { type: "json_object" },
      timeoutMs: 90_000,
    },
  );

  if (!res?.content) {
    const err = new Error("AI không phản hồi được đề thi lúc này. Vui lòng kiểm tra cấu hình AI hoặc thử lại sau.");
    (err as any).statusCode = 502;
    throw err;
  }

  const parsed = extractJsonObject(res.content);
  const normalized = normalizeAiExamDraft(parsed, input.codeLanguage);

  return {
    ...normalized,
    provider: res.provider,
    model: res.model,
  };
}
