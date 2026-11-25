/**
 * LLM generates a Python *input generator* script; we run it, then run the
 * official solution (python|cpp) to obtain outputs. Never trust LLM outputs.
 */
import prisma from "../utils/prisma";
import { runPythonCode } from "../utils/pythonRunner";
import { runCppCode } from "../utils/cppRunner";
import { chatCompletion, hasLLM } from "../utils/llmClient";

// LLM 1M context input → prompt thoải mái; output nới lên 16k token, timeout 3 phút.
// Client chung tự fallback về deepseek-chat nếu model chính trả content rỗng.
const MAX_TOKENS = 16384;
const LLM_TIMEOUT_MS = 180_000;
// Input mỗi test tối đa 12MB (đủ cho n = 10^6 số nguyên ~11MB); quá thì bỏ qua có ghi chú.
const MAX_TEST_INPUT_CHARS = 12_000_000;

function extractCodeFence(text: string): string {
  const m = text.match(/```(?:python)?\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  return text.trim();
}

function splitInputs(stdout: string, expected: number): string[] {
  const parts = stdout
    .replace(/\r\n/g, "\n")
    .split(/\n\s*---CASE---\s*\n/i)
    .map((s) => s.trimEnd())
    .filter((s) => s.length > 0);
  if (parts.length >= expected) return parts.slice(0, expected);
  // Fallback: if generator printed N blocks separated by blank lines
  if (parts.length === 1) {
    const blocks = stdout
      .replace(/\r\n/g, "\n")
      .trim()
      .split(/\n{2,}/)
      .map((s) => s.trimEnd())
      .filter(Boolean);
    if (blocks.length >= expected) return blocks.slice(0, expected);
  }
  return parts;
}

async function askGeneratorScript(params: {
  stem: string;
  statementExtra?: string | null;
  constraints?: string | null;
  solutionLang: string;
  solutionCode: string;
  sampleInput: string;
  count: number;
  note?: string;
}): Promise<string> {
  if (!hasLLM()) throw new Error("Chưa cấu hình LLM (VILAO_API_KEY hoặc DEEPSEEK_API_KEY) — không thể sinh testcase bằng LLM");

  const system = `Bạn là chuyên gia tạo test case lập trình thi đấu.
Nhiệm vụ: viết một SCRIPT PYTHON in ra đúng ${params.count} INPUT test (không in output).
Quy tắc bắt buộc:
1. Chỉ in INPUT; mỗi test cách nhau bằng một dòng đúng bằng: ---CASE---
2. Input phải hợp lệ theo đề và ràng buộc; mức độ từ DỄ → MAX CONSTRAINTS.
3. Không đọc file, không mạng, không import lạ (chỉ random, sys được phép).
4. Không in gì khác ngoài các input và dấu ---CASE---.
5. Trả về DUY NHẤT code Python (có thể bọc trong \`\`\`python).`;

  const user = `Đề:
${params.stem}

Mô tả thêm:
${params.statementExtra || "(không)"}

Ràng buộc:
${params.constraints || "(không)"}

Ngôn ngữ solution: ${params.solutionLang}
Code đáp án (tham khảo format I/O):
\`\`\`
${params.solutionCode}
\`\`\`

Sample input hợp lệ:
\`\`\`
${params.sampleInput}
\`\`\`

Ghi chú thêm: ${params.note || "phủ biên và random"}
Số lượng: ${params.count}`;

  const result = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.4, max_tokens: MAX_TOKENS, timeoutMs: LLM_TIMEOUT_MS },
  );
  const content = result?.content;
  if (!content || typeof content !== "string") throw new Error("LLM không trả về nội dung generator");
  return extractCodeFence(content);
}

async function runSolution(
  language: string,
  code: string,
  stdin: string,
): Promise<{ ok: boolean; output: string; error?: string }> {
  if (language === "cpp") {
    const r = await runCppCode(code, stdin);
    if (r.status !== "success") {
      return { ok: false, output: "", error: r.stderr || r.status };
    }
    return { ok: true, output: r.stdout };
  }
  const r = await runPythonCode(code, stdin);
  if (r.status !== "success") {
    return { ok: false, output: "", error: r.stderr || r.status };
  }
  return { ok: true, output: r.stdout };
}

export interface GenerateTestsResult {
  created: number;
  inputs: number;
  generatorSource: string;
  failures: string[];
  testCaseIds: string[];
}

/** Replace pending hidden tests for a coding question. Keeps samples. */
export async function generateHiddenTestcases(
  questionId: string,
  opts?: { count?: number; replacePending?: boolean },
): Promise<GenerateTestsResult> {
  const q = await prisma.examQuestion.findUnique({
    where: { id: questionId },
    include: { testCases: true },
  });
  if (!q) throw new Error("Không tìm thấy câu hỏi");
  if (q.type !== "thuc_hanh") throw new Error("Chỉ sinh testcase cho câu thực hành");
  if (!q.solutionCode?.trim()) throw new Error("Thiếu code_dap_an");
  if (!q.language) throw new Error("Thiếu ngôn ngữ solution");

  const genCfg = (() => {
    try {
      return q.genConfigJson ? JSON.parse(q.genConfigJson) : {};
    } catch {
      return {};
    }
  })() as { so_luong?: number; ghi_chu_cho_llm?: string };

  const count = Math.min(40, Math.max(1, opts?.count ?? genCfg.so_luong ?? 10));
  const sample = q.testCases.find((t) => t.kind === "mau") || q.testCases[0];
  const sampleInput = sample?.input ?? "1 1\n";

  const generatorSource = await askGeneratorScript({
    stem: q.stem,
    statementExtra: q.statementExtra,
    constraints: q.constraints,
    solutionLang: q.language,
    solutionCode: q.solutionCode,
    sampleInput,
    count,
    note: genCfg.ghi_chu_cho_llm,
  });

  const genRun = await runPythonCode(generatorSource, "");
  if (genRun.status !== "success") {
    throw new Error(`Generator chạy lỗi: ${genRun.stderr || genRun.status}`);
  }

  const inputs = splitInputs(genRun.stdout || genRun.output || "", count);
  if (inputs.length === 0) throw new Error("Generator không sinh được input nào");

  if (opts?.replacePending !== false) {
    await prisma.examTestCase.deleteMany({
      where: {
        questionId,
        kind: "an",
        status: { in: ["nhap", "cho_duyet"] },
      },
    });
  }

  const failures: string[] = [];
  const testCaseIds: string[] = [];
  let orderBase = await prisma.examTestCase.count({ where: { questionId, kind: "an" } });

  for (let i = 0; i < inputs.length; i++) {
    if (inputs[i].length > MAX_TEST_INPUT_CHARS) {
      failures.push(`Case ${i + 1}: input quá lớn (${inputs[i].length} ký tự > ${MAX_TEST_INPUT_CHARS}) — bỏ qua`);
      continue;
    }
    const input = inputs[i].endsWith("\n") ? inputs[i] : `${inputs[i]}\n`;
    const sol = await runSolution(q.language, q.solutionCode, input);
    if (!sol.ok) {
      failures.push(`Case ${i + 1}: solution fail — ${sol.error}`);
      continue;
    }
    const output = sol.output.endsWith("\n") ? sol.output : `${sol.output}\n`;
    const muc = Math.min(10, Math.max(1, Math.round(((i + 1) / inputs.length) * 10)));
    const row = await prisma.examTestCase.create({
      data: {
        questionId,
        kind: "an",
        input,
        output,
        orderIndex: orderBase++,
        difficultyLevel: muc,
        status: "cho_duyet",
        generatorSource,
        runnerLanguage: q.language,
        note: `auto-${i + 1}/${inputs.length}`,
      },
    });
    testCaseIds.push(row.id);
  }

  if (testCaseIds.length === 0) {
    throw new Error(`Không tạo được testcase nào. ${failures.join("; ")}`);
  }

  return {
    created: testCaseIds.length,
    inputs: inputs.length,
    generatorSource,
    failures,
    testCaseIds,
  };
}

export async function approveTestcases(questionId: string, testCaseIds?: string[]) {
  const where = testCaseIds?.length
    ? { questionId, id: { in: testCaseIds }, kind: "an" as const }
    : { questionId, kind: "an" as const, status: "cho_duyet" };

  const result = await prisma.examTestCase.updateMany({
    where,
    data: { status: "da_duyet" },
  });
  return result.count;
}

/** Compile/run official solution against sample tests before approve/publish. */
export async function preflightSolution(questionId: string): Promise<{
  ok: boolean;
  language: string;
  passed: number;
  total: number;
  failures: Array<{ testNum: number; error: string; status?: string }>;
}> {
  const q = await prisma.examQuestion.findUnique({
    where: { id: questionId },
    include: { testCases: { where: { kind: "mau" }, orderBy: { orderIndex: "asc" } } },
  });
  if (!q) throw new Error("Không tìm thấy câu hỏi");
  if (q.type !== "thuc_hanh") throw new Error("Chỉ preflight câu thực hành");
  if (!q.solutionCode?.trim()) throw new Error("Thiếu code_dap_an");
  const language = (q.language || "python").toLowerCase();
  const samples = q.testCases;
  if (samples.length === 0) throw new Error("Chưa có testcase mẫu để preflight");

  const failures: Array<{ testNum: number; error: string; status?: string }> = [];
  let passed = 0;
  for (let i = 0; i < samples.length; i++) {
    const tc = samples[i];
    const sol = await runSolution(language, q.solutionCode, tc.input);
    if (!sol.ok) {
      failures.push({ testNum: i + 1, error: sol.error || "runtime", status: "fail" });
      continue;
    }
    const got = (sol.output || "").replace(/\r\n/g, "\n").trimEnd();
    const exp = (tc.output || "").replace(/\r\n/g, "\n").trimEnd();
    if (got !== exp) {
      failures.push({
        testNum: i + 1,
        error: `output lệch (got ${JSON.stringify(got.slice(0, 80))} expected ${JSON.stringify(exp.slice(0, 80))})`,
        status: "wa",
      });
      continue;
    }
    passed++;
  }
  return { ok: failures.length === 0 && passed === samples.length, language, passed, total: samples.length, failures };
}

/** Preflight every coding question on an exam (for publish gate). */
export async function preflightExamSolutions(examId: string) {
  const questions = await prisma.examQuestion.findMany({
    where: { examId, type: "thuc_hanh" },
    select: { id: true, code: true },
  });
  const results = [];
  for (const q of questions) {
    try {
      const r = await preflightSolution(q.id);
      results.push({ questionId: q.id, ma_cau: q.code, ...r });
    } catch (err: any) {
      results.push({
        questionId: q.id,
        ma_cau: q.code,
        ok: false,
        language: "?",
        passed: 0,
        total: 0,
        failures: [{ testNum: 0, error: err?.message || String(err) }],
      });
    }
  }
  return {
    ok: results.every((r) => r.ok),
    results,
  };
}

/** Recompute exam ready flag when all coding questions have ≥1 approved hidden OR no coding Q. */
export async function refreshExamReadyStatus(examId: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      questions: { include: { testCases: true } },
    },
  });
  if (!exam) return;
  if (exam.status === "published" || exam.status === "closed" || exam.status === "archived") return;

  const coding = exam.questions.filter((q) => q.type === "thuc_hanh");
  const allOk =
    coding.length === 0 ||
    coding.every((q) => q.testCases.some((t) => t.kind === "an" && t.status === "da_duyet"));

  const next = allOk ? "ready" : "draft";
  if (exam.status !== next) {
    await prisma.exam.update({ where: { id: examId }, data: { status: next } });
  }
}
