import { runPythonCode } from "../utils/pythonRunner";
import { runCppCode } from "../utils/cppRunner";
import { SKILL_SEEDS, skillIdToName } from "../utils/skillGraph";
import { chatCompletion, hasLLM } from "../utils/llmClient";

/** Whitelist for AI-emitted skill tags — anything outside is dropped at parse time. */
const VALID_SKILL_IDS = new Set(SKILL_SEEDS.map((s) => s.skillId));

// ── Circuit breaker: stop calling AI after repeated failures ──
// An invalid key / down provider otherwise spawns a flood of requests that
// saturate SQLite and crash the box. The shared client already falls back
// across providers, so a trip here means every provider failed.
interface CircuitState {
  consecutiveAuthFailures: number;
  cooldownUntil: number;
}
const CIRCUIT_MAX_FAILURES = 3;
const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000;
const circuit: CircuitState = { consecutiveAuthFailures: 0, cooldownUntil: 0 };

function circuitIsOpen(): boolean {
  if (!hasLLM()) return true;
  if (circuit.consecutiveAuthFailures < CIRCUIT_MAX_FAILURES) return false;
  if (Date.now() > circuit.cooldownUntil) {
    circuit.consecutiveAuthFailures = 0;
    return false;
  }
  return true;
}

function circuitRecordAuthFailure(): void {
  circuit.consecutiveAuthFailures++;
  if (circuit.consecutiveAuthFailures >= CIRCUIT_MAX_FAILURES) {
    circuit.cooldownUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    console.warn(`[CodeDuelGen] Circuit breaker TRIPPED after ${CIRCUIT_MAX_FAILURES} auth failures. Waiting ${CIRCUIT_COOLDOWN_MS / 60000}min.`);
  }
}

function circuitRecordSuccess(): void {
  circuit.consecutiveAuthFailures = 0;
}

// ── Types ──

export interface AIProblemDraft {
  title: string;
  statement: string;
  difficulty: "easy" | "medium" | "hard";
  timeLimitSeconds: number;
  topic: string;
  algorithm: string;
  starterCode: string;
  /** Phần "Ràng buộc" (constraints) markdown — giới hạn kích thước & giá trị. */
  constraints: string;
  /** Kích thước chính TỐI ĐA (n / độ dài mảng-xâu) bài toán được thiết kế. */
  maxInputSize: number;
  /** Python program that reads an int `size` (≤ maxInputSize) from stdin and prints ONE test input. */
  generator: string;
  /** Reference solution in the chosen language (python | cpp). */
  referenceSolution: string;
  /** 2–3 visible sample cases for the student. */
  publicSamples: { input: string; output: string }[];
  /** Skill tag (AI-suggested, whitelist-validated) — teacher confirms at finalize. */
  skillId?: string;
}

export interface TestCaseGen {
  input: string;
  output: string;
  hidden?: boolean;
}

/** Fallback max input size by difficulty when the AI omits `maxInputSize`. */
const DEFAULT_MAX_BY_DIFFICULTY: Record<string, number> = { easy: 500, medium: 10000, hard: 100000 };

/**
 * Build the compact dedup context for the AI from the match's already-locked
 * rounds. Only summaries (title/topic/algorithm/difficulty) — never the full
 * solution or generator, so a later question can't leak an earlier answer.
 */
export function buildRoundSummary(round: {
  title: string;
  topic: string | null;
  algorithm: string | null;
  difficulty: string;
}): string {
  return `- "${round.title}" (${round.difficulty}) — chủ đề: ${round.topic || "?"}; thuật toán: ${round.algorithm || "?"}`;
}

export function buildContextSummary(rounds: {
  title: string;
  topic: string | null;
  algorithm: string | null;
  difficulty: string;
}[]): string {
  if (!rounds.length) return "Chưa có câu hỏi nào trong trận này.";
  return "Các câu hỏi ĐÃ CHỐT trong trận này (KHÔNG được trùng chủ đề/ý tưởng):\n" + rounds.map(buildRoundSummary).join("\n");
}

const DRAFT_SYSTEM_PROMPT = `Bạn là chuyên gia ra đề lập trình cho học sinh Việt Nam (11-18 tuổi) trong một trò chơi thi đấu code nhanh real-time.

Nhiệm vụ: Dựa trên yêu cầu của giáo viên, tạo ra MỘT đề bài HOÀN CHỈNH kèm lời giải mẫu và một chương trình SINH INPUT.

QUY TẮC NGHIÊM NGẶT:
1. Đề bài bằng tiếng Việt có dấu, phù hợp học sinh cấp 2/3, rõ định dạng input/output.
2. CHỈ dùng kiến thức trong phạm vi học sinh đã học (không vượt quá).
3. KHÔNG trùng chủ đề/ý tưởng với bất kỳ câu nào trong danh sách đã chốt được cung cấp.
4. "generator" là code PYTHON thuần (chỉ dùng hàm thường, KHÔNG import os/subprocess/socket/shutil/file). Code đọc ĐÚNG MỘT số nguyên size (1 ≤ size ≤ maxInputSize) từ dòng ĐẦU TIÊN của stdin. size là THAM SỐ ĐỘ LỚN của test: dùng nó để sinh input "khó dần" theo đúng bản chất bài toán. Nếu bài có số lượng phần tử thay đổi (mảng, dãy) thì size CHÍNH LÀ số phần tử n. Nếu bài có số lượng input CỐ ĐỊNH (VD đúng 3 số a,b,c) thì KHÔNG thay đổi số lượng — hãy dùng size để scale ĐỘ LỚN GIÁ TRỊ (VD giá trị ngẫu nhiên trong khoảng [-size, size] hoặc [-10^9, 10^9]) sao cho vẫn nằm trong "Ràng buộc" đã ghi. LUÔN sinh input hợp lệ với định dạng đề bài. Không in thêm gì khác.
5. "referenceSolution" là lời giải CHÍNH XÁC đọc input từ stdin và in kết quả, viết bằng đúng ngôn ngữ được yêu cầu (python hoặc cpp).
6. "starterCode" là khung code cho học sinh (đọc input, rỗng phần xử lý).
7. "publicSamples" gồm 2-3 bộ input/output MẪU (nhỏ, dễ hiểu) để học sinh đọc hiểu đề.
8. timeLimitSeconds nên 60-300 tùy độ khó.
9. generator và referenceSolution KHÔNG được dùng os/subprocess/socket/network/file.
10. "statement" là markdown thuần. Ví dụ input/output PHẢI đặt trong khối code \`\`\` (KHÔNG dùng bảng, KHÔNG dùng thẻ <br>, KHÔNG dùng chuỗi "\\n" — dùng xuống dòng thật). Phải có phần "Ràng buộc" ghi đúng các giới hạn của bài: nếu bài có n thì ghi giới hạn n; nếu bài có số lượng cố định (VD 3 số) thì KHÔNG ghi n, chỉ ghi giới hạn giá trị (VD "-10^9 ≤ a, b, c ≤ 10^9").
11. "constraints" là chuỗi markdown tóm tắt giới hạn PHÙ HỢP VỚI ĐỀ (VD bài mảng: "1 ≤ n ≤ 10^5; 1 ≤ a[i] ≤ 10^9"; VD bài 3 số: "-10^9 ≤ a, b, c ≤ 10^9"). "maxInputSize" là số nguyên = độ lớn tối đa bài toán thiết kế cho độ khó này: easy ≤ 1000, medium ≤ 10000, hard ≤ 100000 (với bài có n thì là n tối đa; với bài cố định số lượng thì là độ lớn giá trị tối đa). generator và referenceSolution PHẢI chạy đúng và tôn trọng các giới hạn này.

Trả về JSON:
{
  "title": "tiêu đề ngắn (5-10 từ)",
  "statement": "đề bài markdown đầy đủ",
  "difficulty": "easy|medium|hard",
  "timeLimitSeconds": 120,
  "topic": "chủ đề (5-10 từ)",
  "algorithm": "thuật toán áp dụng (VD: vòng lặp, mảng, hai con trỏ...)",
  "skillId": "mã skill phù hợp nhất từ danh sách hợp lệ được cung cấp (nếu có)",
  "starterCode": "code khung",
  "constraints": "giới hạn phù hợp với đề (chỉ ghi n nếu đề có n)",
  "maxInputSize": 100000,
  "generator": "code python sinh input",
  "referenceSolution": "lời giải mẫu",
  "publicSamples": [{"input":"...","output":"..."}]
}`;

const REVISE_SYSTEM_PROMPT = `Bạn là chuyên gia ra đề lập trình cho học sinh Việt Nam (11-18 tuổi).

Nhiệm vụ: CHỈNH SỬA đề bài HIỆN CÓ (giáo viên cung cấp dạng JSON) theo đúng yêu cầu chỉnh sửa cụ thể, rồi trả về TOÀN BỘ đề đã chỉnh sửa.

QUY TẮC NGHIÊM NGẶT:
1. Chỉ thay đổi phần giáo viên yêu cầu; giữ nguyên các phần còn lại.
2. Nếu thay đổi làm đổi logic bài toán (định dạng input/output, ràng buộc, cách tính kết quả), PHẢI cập nhật "generator", "referenceSolution" và "publicSamples" cho nhất quán với đề mới.
3. Nếu giáo viên chỉ chỉnh câu chữ/định dạng đề bài, giữ nguyên "generator", "referenceSolution" và "publicSamples".
4. "generator" là code PYTHON thuần (KHÔNG import os/subprocess/socket/shutil/file), đọc ĐÚNG MỘT số nguyên size (1 ≤ size ≤ maxInputSize) từ dòng ĐẦU TIÊN của stdin. size là THAM SỐ ĐỘ LỚN của test: nếu bài có số lượng phần tử thay đổi thì size = số phần tử n; nếu bài có số lượng input CỐ ĐỊNH (VD 3 số a,b,c) thì KHÔNG đổi số lượng, dùng size để scale ĐỘ LỚN GIÁ TRỊ (VD trong [-size, size] hoặc [-10^9, 10^9]) miễn nằm trong "Ràng buộc". LUÔN sinh input hợp lệ với định dạng đề bài.
5. "referenceSolution" là lời giải CHÍNH XÁC bằng đúng ngôn ngữ được yêu cầu (python hoặc cpp).
6. "publicSamples" gồm 2-3 bộ input/output mẫu nhất quán với đề.
7. "statement" là markdown thuần: ví dụ input/output đặt trong khối code \`\`\`, không dùng bảng, không dùng thẻ <br>, không dùng chuỗi "\\n". Phải có phần "Ràng buộc" ghi đúng giới hạn của bài: nếu bài có n thì ghi giới hạn n; nếu bài cố định số lượng thì chỉ ghi giới hạn giá trị (KHÔNG ghi n).
8. "constraints" là chuỗi markdown tóm tắt giới hạn PHÙ HỢP VỚI ĐỀ, "maxInputSize" là số nguyên = độ lớn tối đa cho độ khó (easy ≤ 1000, medium ≤ 10000, hard ≤ 100000). Đảm bảo generator và referenceSolution tôn trọng các giới hạn này.

Trả về JSON đầy đủ cùng cấu trúc:
{
  "title": "...",
  "statement": "đề bài markdown đã sửa",
  "difficulty": "easy|medium|hard",
  "timeLimitSeconds": 120,
  "topic": "...",
  "algorithm": "...",
  "skillId": "giữ nguyên skillId của đề hiện tại (trừ khi yêu cầu chỉnh sửa nói khác)",
  "starterCode": "...",
  "constraints": "...",
  "maxInputSize": 100000,
  "generator": "...",
  "referenceSolution": "...",
  "publicSamples": [{"input":"...","output":"..."}]
}`;

/**
 * Phase 1 — teacher drafts a problem with the AI. Returns a full spec the
 * teacher can review/edit BEFORE the platform runs code to build tests.
 * When `currentDraft` is provided the same call becomes a REVISION: the AI
 * edits only the requested parts of the existing draft instead of inventing a
 * new problem. Returns null if the AI key is missing or the call fails.
 */
export async function generateProblemDraft(
  prompt: string,
  language: "python" | "cpp",
  previousSummaryText: string,
  currentDraft?: Partial<AIProblemDraft> | null,
  skillScope?: string[],
): Promise<AIProblemDraft | null> {
  if (circuitIsOpen()) {
    console.warn("[CodeDuelGen] Skipping AI draft — circuit open / no key.");
    return null;
  }

  const langLabel = language === "cpp" ? "C++" : "Python";
  const validScope = (skillScope || []).filter((id) => VALID_SKILL_IDS.has(id));
  const skillSection = validScope.length
    ? `\n\nDanh sách skillId hợp lệ (PHẢI chọn đúng 1 mã trong danh sách này, KHÔNG được bịa):\n${validScope
        .map((id) => `- ${id} — ${skillIdToName(id)}`)
        .join("\n")}`
    : "";
  const userPrompt = currentDraft
    ? `NGÔN NGỮ LỜI GIẢI: ${langLabel}\n\n` +
      `ĐỀ BÀI HIỆN TẠI (JSON):\n${JSON.stringify(currentDraft, null, 2)}\n\n` +
      `YÊU CẦU CHỈNH SỬA CỤ THỂ CỦA GIÁO VIÊN:\n${prompt}${skillSection}`
    : `NGÔN NGỮ LỜI GIẢI: ${langLabel}\n\n` +
      `BỐI CẢNH CÁC CÂU ĐÃ CHỐT (tránh trùng):\n${previousSummaryText}\n\n` +
      `YÊU CẦU CỦA GIÁO VIÊN:\n${prompt}${skillSection}`;

  const result = await chatCompletion(
    [
      { role: "system", content: currentDraft ? REVISE_SYSTEM_PROMPT : DRAFT_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.4, max_tokens: 3000, response_format: { type: "json_object" }, timeoutMs: 60000 },
  );
  if (!result) {
    circuitRecordAuthFailure();
    return null;
  }
  circuitRecordSuccess();

  try {
    const parsed = JSON.parse(result.content);
    if (!parsed.title || !parsed.statement || !parsed.generator || !parsed.referenceSolution) {
      console.error("[CodeDuelGen] Draft missing required fields:", Object.keys(parsed));
      return null;
    }
    return {
      title: String(parsed.title).slice(0, 200),
      statement: cleanStatement(String(parsed.statement)),
      difficulty: ["easy", "medium", "hard"].includes(parsed.difficulty) ? parsed.difficulty : "easy",
      timeLimitSeconds: clampInt(parsed.timeLimitSeconds, 30, 600, 120),
      topic: String(parsed.topic || "").slice(0, 200),
      algorithm: String(parsed.algorithm || "").slice(0, 200),
      // skillId: trust the model only inside the whitelist; otherwise keep the
      // draft's existing tag (revision flow) or leave it to the teacher.
      skillId: (() => {
        const raw = String(parsed.skillId || "").trim().slice(0, 80);
        if (raw && VALID_SKILL_IDS.has(raw)) return raw;
        const kept = String(currentDraft?.skillId || "").trim();
        return (kept && VALID_SKILL_IDS.has(kept) ? kept : undefined) as string | undefined;
      })(),
      starterCode: String(parsed.starterCode || ""),
      constraints: cleanStatement(String(parsed.constraints || "")),
      maxInputSize: clampInt(parsed.maxInputSize, 1, 1_000_000, DEFAULT_MAX_BY_DIFFICULTY[parsed.difficulty] || 1000),
      generator: String(parsed.generator),
      referenceSolution: String(parsed.referenceSolution),
      publicSamples: Array.isArray(parsed.publicSamples)
        ? parsed.publicSamples.slice(0, 3).map((s: any) => ({
            input: cleanCaseText(String(s?.input || "")),
            output: cleanCaseText(String(s?.output || "")),
          }))
        : [],
    };
  } catch (err: any) {
    console.error("[CodeDuelGen] Draft parse error:", err?.message);
    return null;
  }
}

/**
 * Phase 2 — "Chốt câu hỏi": the platform RUNS the generator + reference
 * solution to produce tiered test cases (easy→hard). Test size grows with the
 * difficulty tier. The first `publicCount` cases are marked visible (samples);
 * the rest are hidden.
 *
 * Returns null feed if the reference solution can't produce a valid output, so
 * the caller can retry the whole spec.
 */
export async function buildTestCases(
  spec: {
    generator: string;
    referenceSolution: string;
    difficulty: string;
    timeLimitSeconds: number;
    maxInputSize?: number;
    targetHiddenCount?: number;
    publicSamples: { input: string; output: string }[];
  },
  language: "python" | "cpp",
): Promise<{ testCases: TestCaseGen[]; generatedCount: number } | null> {
  // Test sizes are DERIVED from the problem's own maxInputSize (the largest n
  // the problem is designed for), sampled as ascending fractions (2% → 100%).
  const maxInput = Math.max(1, Math.round(Number(spec.maxInputSize) || (DEFAULT_MAX_BY_DIFFICULTY[spec.difficulty] ?? 500)));
  const targetHidden = Math.max(3, Math.min(30, Number(spec.targetHiddenCount) || 8));
  const sizes = sizesFor(maxInput, targetHidden);

  // 2 public samples become the visible cases; the rest are hidden.
  const publicCount = Math.min(2, spec.publicSamples.length);

  const testCases: TestCaseGen[] = [];
  // Seed with the AI's public samples as the visible cases.
  for (const sample of spec.publicSamples.slice(0, publicCount)) {
    if (sample.input !== undefined && sample.input !== null && sample.output) {
      testCases.push({ input: sample.input, output: sample.output, hidden: false });
    }
  }

  // Generate the rest from the generator, running overseas once per size.
  for (const size of sizes) {
    const input = await runGenerator(spec.generator, size);
    if (!input) continue; // generator failed for this size — skip
    const output = await runReference(spec.referenceSolution, language, input);
    if (!output) continue; // reference crashed on this input — skip
    testCases.push({ input, output, hidden: true });
  }

  if (testCases.length < 3) return null; // not enough valid cases → retry spec
  const cleaned = testCases.map((c) => ({
    ...c,
    input: cleanCaseText(c.input),
    output: cleanCaseText(c.output),
  }));
  return { testCases: cleaned, generatedCount: cleaned.length - publicCount };
}

/** Convert stray literal escapes (backslash-n / backslash-t) into real newlines
 *  and tabs. A real newline never contains a backslash, so this is safe. */
function cleanCaseText(value: string): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

/** Normalize an AI markdown statement: collapse HTML <br>/<br/> tags and stray
 *  literal \n / \t escapes into real line breaks so the renderer shows clean
 *  newlines instead of raw "<br>" / "\n" text. Safe: real newlines carry no
 *  backslash and raw <br> only appears where the model mis-formatted. */
function cleanStatement(value: string): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

/** Derive ascending test sizes from the problem's own maxInputSize as fractions.
 *  Default targetCount = 8 hidden tests (combined with 2 public = 10 total tests). */
function sizesFor(maxInputSize: number, targetCount = 8): number[] {
  // Standard ascending distribution (from 1% up to 100% stress test)
  const baseFractions = [0.01, 0.03, 0.06, 0.12, 0.25, 0.5, 0.75, 1.0];
  let fractions = baseFractions;
  if (targetCount !== 8) {
    fractions = Array.from({ length: targetCount }, (_, i) => {
      const p = (i + 1) / targetCount;
      return Math.pow(p, 2); // quadratic distribution for more gradual scaling
    });
  }
  const out: number[] = [];
  for (const f of fractions) {
    const s = Math.max(1, Math.round(maxInputSize * f));
    if (out[out.length - 1] !== s) out.push(s);
  }
  return out;
}

/** Generator output can be large (a full test input — e.g. n=100000 ints is
 *  ~1 MB), so it needs a much bigger output budget than the 20 KB default. */
const GENERATOR_MAX_OUTPUT = 5 * 1024 * 1024; // 5 MB

/** Run the AI's generator (always Python) with a size → one input string.
 *  The generator reads the size as the FIRST line of stdin (pure Python, no
 *  subprocess — the validator blocks system calls). */
async function runGenerator(generatorCode: string, size: number): Promise<string | null> {
  const run = await runPythonCode(generatorCode, `${size}\n`, { maxOutputLength: GENERATOR_MAX_OUTPUT });
  if (run.status !== "success" || !run.output.trim()) return null;
  return run.output;
}

/** Run the reference solution (python or cpp) on an input → expected output. */
async function runReference(code: string, language: string, input: string): Promise<string | null> {
  try {
    if (language === "cpp") {
      const r = await runCppCode(code, input, { maxOutputLength: GENERATOR_MAX_OUTPUT });
      if (r.status !== "success" || !r.stdout.trim()) return null;
      return r.stdout;
    }
    const r = await runPythonCode(code, input, { maxOutputLength: GENERATOR_MAX_OUTPUT });
    if (r.status !== "success" || !r.stdout.trim()) return null;
    return r.stdout;
  } catch {
    return null;
  }
}

function clampInt(v: any, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}