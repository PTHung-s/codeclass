import prisma from "../utils/prisma";
import { SKILL_SEEDS, skillIdToName } from "../utils/skillGraph";
import { chatCompletion, hasLLM } from "../utils/llmClient";

/** Whitelist for AI-emitted skill tags — anything outside is dropped at parse time. */
const VALID_SKILL_IDS = new Set(SKILL_SEEDS.map((s) => s.skillId));

// ── Circuit breaker: stop calling AI after repeated failures ──
// Without this, every arena game triggers 4 retries × N questions of AI calls.
// With providers down, each call fails fast, but the sheer volume of parallel
// calls + fallback DB writes saturates SQLite and crashes the server. The
// shared client already falls back across providers, so a trip here means
// every provider failed.
interface CircuitState {
  consecutiveAuthFailures: number;
  lastAuthFailureTime: number;
  cooldownUntil: number;
}
const circuit: CircuitState = {
  consecutiveAuthFailures: 0,
  lastAuthFailureTime: 0,
  cooldownUntil: 0,
};
const CIRCUIT_MAX_FAILURES = 3; // trip after 3 consecutive failures
const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown before retrying

function circuitIsOpen(): boolean {
  if (!hasLLM()) return true; // no provider at all → skip
  if (circuit.consecutiveAuthFailures < CIRCUIT_MAX_FAILURES) return false;
  if (Date.now() > circuit.cooldownUntil) {
    // Cooldown expired — allow one probe call
    circuit.consecutiveAuthFailures = 0;
    return false;
  }
  return true; // still in cooldown
}

function circuitRecordAuthFailure(): void {
  circuit.consecutiveAuthFailures++;
  circuit.lastAuthFailureTime = Date.now();
  if (circuit.consecutiveAuthFailures >= CIRCUIT_MAX_FAILURES) {
    circuit.cooldownUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    console.warn(
      `[ArenaGen] Circuit BREAKER TRIPPED: ${circuit.consecutiveAuthFailures} consecutive LLM failures. ` +
      `Skipping AI calls for ${CIRCUIT_COOLDOWN_MS / 60000} minutes. All questions will use fallbacks. ` +
      `Check VILAO_API_KEY / DEEPSEEK_API_KEY in .env.`
    );
  }
}

function circuitRecordSuccess(): void {
  circuit.consecutiveAuthFailures = 0;
}

// ── Types ──

export interface RawDebugQuestion {
  title: string;
  statement: string;
  language: "python" | "cpp";
  input: string;
  correctCode: string;
  buggyCode: string;
  bugDescription: string;
}

export interface DebugQuestionSpec {
  title: string;
  statement: string;
  language: "python" | "cpp";
  input: string;
  correctCode: string;
  buggyCode: string;
  bugDescription: string;
  /** Skill tag emitted by the generator (whitelist-validated). Groundwork for
   *  future bug-locate skill linkage; not consumed by mastery yet. */
  skillId?: string;
}

export interface PlanItem {
  topic: string;
  bugType: string;
  difficulty: "easy" | "medium" | "hard";
  titleHint: string;
  skillId?: string;
}

/**
 * Verdict of the review pass.
 *   ok        — question is sound and clearly written, keep as-is
 *   fix_prose — question is sound but the wording needs replacing
 *   reject    — question is wrong or unfair, throw it away and regenerate
 */
export interface DebugReviewResult {
  verdict: "ok" | "fix_prose" | "reject";
  reason: string;
  statement?: string;
  bugDescription?: string;
}

// ── System Prompts ──

const PLAN_SYSTEM_PROMPT = `Bạn là chuyên gia thiết kế đề bài lập trình "debug" cho học sinh Việt Nam (11-18 tuổi) trong một trò chơi thi đấu real-time.

Nhiệm vụ: Lên kế hoạch cho N câu hỏi debug ĐA DẠNG.

QUY TẮC NGHIÊM NGẶT:
1. MỖI CÂU MỘT CHỦ ĐỀ KHÁC NHAU để đa dạng — NHƯNG nếu có "YÊU CẦU TỪ GIÁO VIÊN" chỉ định CHƯƠNG TRỌNG TÂM hoặc chủ đề cụ thể, TẤT CẢ câu hỏi phải thuộc trọng tâm đó; chỉ đa dạng TRONG phạm vi trọng tâm (không được lạc sang chủ đề khác).
2. MỖI CÂU MỘT LOẠI BUG KHÁC NHAU — ví dụ: off-by-one, sai điều kiện (< vs <=), nhầm tên biến, sai thứ tự lệnh, quên ép kiểu, sai chỉ mục, chia 0, quên xử lý rỗng, lỗi logic điều kiện...
3. Bug phải TINH TẾ và KHÔNG ĐƯỢC GÂY CRASH. Cấm các loại bug: "sai thứ tự lệnh gây NameError", "quên ép kiểu gây TypeError", "truy cập ngoài mảng", "chia cho 0". Bug phải làm code chạy hết nhưng cho KẾT QUẢ SAI.
4. RẤT QUAN TRỌNG — CHỌN CHỦ ĐỀ ĐƠN GIẢN, có thể tạo bug ĐÚNG 1 DÒNG tinh tế. TRÁNH các chủ đề phức tạp cần nhiều thao tác (VD: số đối xứng, đảo ngược chuỗi, đệ quy, xử lý nhiều bước, đổi số sang chữ) vì rất khó tạo bug 1 dòng mà không crash. ƯU TIÊN các chủ đề gọn: tính tổng/đếm/tìm max-min/in ra pattern/kiểm tra điều kiện đơn giản/hoán đổi giá trị/tính tổng chữ số/đếm số chẵn lẻ.
5. Phân bổ độ khó: ~40% dễ, ~40% trung bình, ~20% khó.
6. TUYỆT ĐỐI KHÔNG trùng chủ đề hay ý tưởng với bất kỳ câu nào trong danh sách đã có.
7. Chỉ dùng kiến thức trong phạm vi cho phép. Không vượt phạm vi.
8. Tiếng Việt có dấu.

Trả về MỘT JSON array, mỗi phần tử:
{
  "topic": "chủ đề (5-10 từ tiếng Việt)",
  "bugType": "loại bug (VD: off-by-one, sai điều kiện, nhầm biến...)",
  "difficulty": "easy|medium|hard",
  "titleHint": "tiêu đề câu hỏi gợi ý ngắn (5-10 từ)"
}`;

const GENERATE_SYSTEM_PROMPT = `Bạn là chuyên gia ra đề lập trình "debug" cho học sinh Việt Nam (11-18 tuổi) trong một trò chơi thi đấu real-time.

Nhiệm vụ: Tạo ra MỘT bài toán lập trình nhỏ kèm giải pháp ĐÚNG và một phiên bản CÓ BUG tinh tế DỰA TRÊN KẾ HOẠCH ĐƯỢC GIAO.

QUY TẮC NGHIÊM NGẶT:
1. Đề bài PHẢI CỰC KỲ NGẮN GỌN — mô tả yêu cầu + input + output trong 2-3 dòng.
2. "correctCode" phải GIẢI ĐÚNG bài toán với input đã cho (đọc từ stdin, in ra stdout).
   - Với C++: BẮT BUỘC #include <iostream>, <string>, <vector>, <algorithm> đầy đủ, using namespace std;, int main() kết thúc bằng return 0;.
3. "buggyCode" phải KHÁC "correctCode" ở CHÍNH XÁC MỘT DÒNG DUY NHẤT (dòng chứa bug) và KHÔNG KHÁC ở dòng nào khác. Hai phiên bản phải có CÙNG số dòng, CÙNG cấu trúc, CÙNG tên biến. KHÔNG đổi cấu trúc vòng lặp, KHÔNG thêm/bớt dòng, KHÔNG viết lại toàn bộ. Bug phải nằm gọn trong 1 dòng.
4. Sự khác biệt ở dòng bug phải làm OUTPUT KHÁC với correctCode KHI CHẠY VỚI ĐÚNG input mẫu ở trường "input". KHÔNG được là bug vô nghĩa (không đổi kết quả), và KHÔNG được là bug chỉ lộ khi dùng input khác — bug phải lộ NGAY với đúng input mẫu bạn đã cho.
5. "buggyCode" phải CHẠY ĐẾN CUỐI CÙNG, in ra output (dù sai) — TUYỆT ĐỐI KHÔNG crash:
   - KHÔNG NameError (dùng biến chưa định nghĩa, gọi biến trước khi gán)
   - KHÔNG TypeError (cộng chuỗi với số, gọi method sai kiểu)
   - KHÔNG IndexError/KeyError/ZeroDivisionError
   - KHÔNG SyntaxError/IndentationError
   Code phải chạy hết, in ra màn hình rồi mới kết thúc, KHÔNG được ngắt giữa chừng.
6. KHÔNG dùng import os/subprocess/socket, KHÔNG dùng file/eval/exec. Code chỉ nhập/xuất chuẩn.
7. "bugDescription" mô tả ngắn gọn lỗi (dưới 150 ký tự, dùng ở phần reveal cho học sinh).
8. Tiếng Việt chuẩn, dễ hiểu.
9. KIỂM TRA LẠI TRƯỚC KHI TRẢ VỀ (RẤT QUAN TRỌNG):
   - So sánh từng dòng correctCode vs buggyCode: chúng PHẢI khác nhau ĐÚNG 1 DÒNG và có CÙNG số dòng.
   - Mô phỏng chạy tâm minh cả 2 code với đúng input mẫu: 2 output PHẢI KHÁC NHAU.

Định dạng JSON trả về BẮT BUỘC:
{
  "title": "Tiêu đề ngắn (5-12 từ)",
  "statement": "Mô tả đề bài cực ngắn (2-3 dòng): yêu cầu + input + output",
  "language": "python",
  "input": "input mẫu ngắn",
  "correctCode": "toàn bộ code đúng",
  "buggyCode": "toàn bộ code có bug",
  "bugDescription": "mô tả ngắn gọn lỗi trong buggyCode",
  "skillId": "mã skill từ danh sách được cung cấp trong đề bài (nếu có)"
}`;

const REVIEW_SYSTEM_PROMPT = `Bạn là giáo viên phản biện, soát lại đề "debug" trước khi đưa cho học sinh Việt Nam (11-18 tuổi) thi đấu.

Đề đã được HỆ THỐNG CHẠY THỬ và xác nhận về mặt kỹ thuật:
- correctCode chạy được, cho đúng output mẫu.
- buggyCode chạy được, KHÔNG crash, và cho output KHÁC correctCode.
- Hai code khác nhau đúng 1 dòng.
=> ĐỪNG kiểm tra lại những điều trên, và TUYỆT ĐỐI KHÔNG đề nghị sửa code.

VIỆC CỦA BẠN — soát 2 nhóm vấn đề mà việc chạy code KHÔNG phát hiện được:

A. ĐỀ BÀI CÓ KHỚP VỚI CODE KHÔNG?
   - Đọc "statement", rồi đọc "correctCode". correctCode có thực sự làm ĐÚNG việc mà statement yêu cầu không?
   - "input" mẫu có hợp với mô tả input trong statement không?
   - expectedOutput có phải là kết quả ĐÚNG theo yêu cầu của đề không? (không chỉ là "code chạy ra thế", mà là "đề đòi thế")
   - Nếu đề nói một chuyện mà code làm chuyện khác → reject.

B. PHẦN GIẢI THÍCH CÓ NGẮN VÀ DỄ HIỂU KHÔNG?
   - "bugDescription" là câu học sinh đọc NGAY SAU KHI hết giờ, trong vài giây. Nó phải:
     * TỐI ĐA 2 câu, dưới 200 ký tự.
     * Nói RÕ dòng nào sai và sai ở đâu, bằng lời lẽ học sinh hiểu ngay.
     * KHÔNG lan man, KHÔNG kể lại toàn bộ thuật toán, KHÔNG dùng từ hàn lâm.
   - Nếu nó dài dòng, vòng vo, mơ hồ, hoặc mô tả SAI cái bug thật sự → viết lại.
   - Xác định bug thật bằng cách so 2 code, rồi kiểm tra bugDescription có nói đúng cái đó không.
   - "statement" cũng vậy: phải cực ngắn (2-3 dòng). Dài dòng thì viết lại gọn, GIỮ NGUYÊN ý nghĩa và yêu cầu.

C. ĐỀ CÓ CÔNG BẰNG KHÔNG?
   - Bug có mơ hồ đến mức nhiều dòng đều "có thể là lỗi" không? → reject.
   - Đề có đòi kiến thức ngoài phạm vi cho phép không? → reject.

QUY TẮC TRẢ VỀ:
- verdict="ok": đề khớp code, giải thích đã ngắn gọn rõ ràng. Không cần trả statement/bugDescription.
- verdict="fix_prose": đề ĐÚNG nhưng chữ cần sửa. BẮT BUỘC trả về CẢ statement và bugDescription (bản đã viết lại; phần nào vốn đã tốt thì copy lại y nguyên).
- verdict="reject": đề sai bản chất / không khớp code / không công bằng. Nêu "reason" ngắn gọn.
- Ưu tiên "fix_prose" hơn "reject": chỉ reject khi lỗi KHÔNG thể chữa bằng cách viết lại chữ.
- Tiếng Việt có dấu.

Định dạng JSON BẮT BUỘC:
{
  "verdict": "ok" | "fix_prose" | "reject",
  "reason": "lý do ngắn gọn (1 câu)",
  "statement": "đề bài (chỉ khi fix_prose)",
  "bugDescription": "mô tả lỗi ngắn gọn dưới 200 ký tự (chỉ khi fix_prose)"
}`;

// ── Dedup: get recent question titles ──

export async function getRecentQuestionTitles(days = 30, limit = 60): Promise<string[]> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const rows = await prisma.debugArenaQuestion.findMany({
      where: { createdAt: { gte: since } },
      select: { title: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      distinct: ["title"],
    });
    return rows.map((r) => r.title);
  } catch {
    return [];
  }
}

// ── Stage 1: Plan ──

export async function planQuestions(
  count: number,
  scopeNote: string | null,
  language: "python" | "cpp",
  previousTitles: string[] = [],
  teacherNote: string | null = null,
): Promise<PlanItem[]> {
  // Circuit breaker: skip AI if providers are known bad
  if (!hasLLM() || circuitIsOpen()) {
    if (circuitIsOpen() && hasLLM()) {
      console.warn("[ArenaGen] Circuit open — using fallback plan");
    } else {
      console.warn("LLM not configured — using fallback plan");
    }
    return buildFallbackPlan(count, language);
  }

  const langLabel = language === "cpp" ? "C++" : "Python";

  const avoidSection = previousTitles.length > 0
    ? `\nCÂU HỎI ĐÃ TỪNG CÓ (TUYỆT ĐỐI KHÔNG TRÙNG):\n${previousTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n`
    : "";

  const userPrompt = `Hãy lên kế hoạch cho ${count} câu hỏi debug.

NGÔN NGỮ: ${langLabel}
SỐ LƯỢNG: ${count} câu
${teacherNote ? `\n★★★ YÊU CẦU TỪ GIÁO VIÊN (ƯU TIÊN CAO NHẤT — BẮT BUỘC PHẢI TUÂN THỦ) ★★★\n${teacherNote}\n` : ""}${scopeNote ? `\nKiến thức nền học sinh đã biết (chỉ tham khảo, không phải trọng tâm):\n${scopeNote}` : ""}${avoidSection}
Yêu cầu:
- Đa dạng chủ đề, không trùng lặp ý tưởng (nhưng luôn nằm trong trọng tâm giáo viên yêu cầu nếu có).
- Đa dạng loại bug, không dùng bug "sai phép toán đơn thuần".
- Phân bổ độ khó: ${Math.round(count * 0.4)} dễ, ${Math.round(count * 0.4)} trung bình, ${Math.max(1, Math.round(count * 0.2))} khó.

Trả về JSON array đúng định dạng.`;

  const result = await chatCompletion(
    [
      { role: "system", content: PLAN_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.7, max_tokens: 600, response_format: { type: "json_object" }, timeoutMs: 30000 },
  );
  if (!result) {
    circuitRecordAuthFailure();
    return buildFallbackPlan(count, language);
  }
  circuitRecordSuccess();

  try {
    const parsed = JSON.parse(result.content);
    // Handle both { items: [...] } and [...] format
    const items: any[] = Array.isArray(parsed) ? parsed : (parsed.items || parsed.questions || []);
    if (!items.length) throw new Error("Empty plan");

    return items.slice(0, count).map((item: any) => ({
      topic: String(item.topic || "").slice(0, 100),
      bugType: String(item.bugType || "").slice(0, 100),
      difficulty: (["easy", "medium", "hard"].includes(item.difficulty) ? item.difficulty : "medium") as PlanItem["difficulty"],
      titleHint: String(item.titleHint || item.title_hint || "").slice(0, 100),
    }));
  } catch (err: any) {
    console.error("Plan generation error:", err?.message);
    return buildFallbackPlan(count, language);
  }
}

function buildFallbackPlan(count: number, language: "python" | "cpp"): PlanItem[] {
  const plans: PlanItem[] = [
    { topic: "Vòng lặp for cơ bản", bugType: "off-by-one", difficulty: "easy", titleHint: "Tính tổng từ 1 đến N" },
    { topic: "Chuỗi và chỉ mục", bugType: "sai chỉ mục", difficulty: "easy", titleHint: "In ký tự giữa chuỗi" },
    { topic: "Điều kiện if/else", bugType: "sai điều kiện (< vs <=)", difficulty: "medium", titleHint: "Kiểm tra số trong khoảng" },
    { topic: "List và duyệt mảng", bugType: "nhầm biến đếm", difficulty: "medium", titleHint: "Đếm số chẵn trong dãy" },
    { topic: "Ép kiểu dữ liệu", bugType: "quên ép kiểu int()", difficulty: "easy", titleHint: "Tổng các chữ số" },
    { topic: "Thứ tự thực thi", bugType: "sai thứ tự lệnh", difficulty: "medium", titleHint: "Hoán đổi giá trị 2 biến" },
    { topic: "Vòng lặp while", bugType: "vòng lặp vô hạn", difficulty: "hard", titleHint: "Tìm chữ số đầu tiên" },
    { topic: "Mảng 2 chiều", bugType: "nhầm hàng/cột", difficulty: "hard", titleHint: "Tổng đường chéo chính" },
    { topic: "Xử lý biên", bugType: "không xử lý rỗng", difficulty: "medium", titleHint: "Tìm max trong dãy" },
    { topic: "Đệ quy đơn giản", bugType: "thiếu điều kiện dừng", difficulty: "hard", titleHint: "Tính giai thừa" },
    { topic: "Dictionary", bugType: "sai key", difficulty: "medium", titleHint: "Đếm tần suất ký tự" },
    { topic: "Sắp xếp", bugType: "sai logic so sánh", difficulty: "medium", titleHint: "Sắp xếp dãy tăng dần" },
  ];
  // Shuffle and pick unique ones
  const shuffled = [...plans].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ── Stage 2: Generate ──

export async function generateDebugQuestion(
  language: "python" | "cpp",
  scopeNote: string | null,
  index: number,
  previousTitles: string[] = [],
  plan?: PlanItem,
  teacherNote: string | null = null,
  skillScope?: string[],
): Promise<DebugQuestionSpec | null> {
  // Circuit breaker: skip AI when providers are known bad (avoids cascading failure)
  if (!hasLLM()) {
    console.warn("LLM not configured — cannot generate debug questions");
    return null;
  }
  if (circuitIsOpen()) {
    // Don't log per-call — planQuestions already logged the warning
    return null;
  }

  const langLabel = language === "cpp" ? "C++" : "Python";

  const avoidList = previousTitles.length > 0
    ? `\nCÂU HỎI ĐÃ CÓ TRƯỚC ĐÓ (TUYỆT ĐỐI KHÔNG TRÙNG ý tưởng):\n${previousTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n`
    : "";

  const planSection = plan
    ? `\nKẾ HOẠCH CHO CÂU NÀY:\n- Chủ đề: ${plan.topic}\n- Loại bug: ${plan.bugType}\n- Độ khó: ${plan.difficulty}\n- Tiêu đề gợi ý: ${plan.titleHint}\n`
    : "";

  const validScope = (skillScope || []).filter((id) => VALID_SKILL_IDS.has(id));
  const skillSection = validScope.length
    ? `\nDanh sách skillId hợp lệ (chọn đúng 1 mã, KHÔNG được bịa):\n${validScope
        .map((id) => `- ${id} — ${skillIdToName(id)}`)
        .join("\n")}\n`
    : "";

  const userPrompt = `Hãy tạo câu hỏi debug #${index + 1}.

NGÔN NGỮ: ${langLabel}
${teacherNote ? `\n★★★ YÊU CẦU TỪ GIÁO VIÊN (ƯU TIÊN CAO NHẤT — BẮT BUỘC PHẢI TUÂN THỦ) ★★★\n${teacherNote}\n` : ""}${planSection}${skillSection}${scopeNote ? `\nKiến thức nền học sinh đã biết (chỉ tham khảo):\n${scopeNote}` : ""}${avoidList}
Yêu cầu thêm:
- Code NGẮN GỌN (dưới 10 dòng, lý tưởng 3-7 dòng).
- Input NGẮN (1 dòng, vài số hoặc 1 chuỗi ngắn).
- Bug PHẢI TINH TẾ — học sinh cần đọc kỹ mới thấy, không lộ liễu.
- Đề bài CỰC KỲ NGẮN — 2-3 dòng là đủ.
- ${language === "cpp" ? "Dùng #include <bits/stdc++.h> hoặc các header chuẩn, đọc bằng cin, in bằng cout." : "Đọc bằng input(), in bằng print()."}
- Nếu giáo viên chỉ định chương/chủ đề trọng tâm ở trên, câu hỏi này PHẢI thuộc trọng tâm đó.
- CUỐI CÙNG: hãy chạy tâm minh correctCode và buggyCode với đúng input mẫu. Nếu 2 code giống nhau hoặc cho cùng output → VIẾT LẠI buggyCode trước khi trả về.

Trả về JSON đúng định dạng.`;

  const result = await chatCompletion(
    [
      { role: "system", content: GENERATE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.4, max_tokens: 2500, response_format: { type: "json_object" }, timeoutMs: 45000 },
  );
  if (!result) {
    circuitRecordAuthFailure();
    return null;
  }

  const content = result.content;
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    // AI sometimes emits malformed JSON (unescaped chars / truncation). Retry.
    console.error("Debug question JSON parse failed. Raw (first 300 chars):", content.slice(0, 300));
    return null;
  }
  const q = sanitizeQuestion(parsed, language, validScope);
  circuitRecordSuccess(); // API call succeeded → reset circuit
  return q;
}

function cleanProse(value: string): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .trim();
}

function sanitizeQuestion(parsed: any, language: "python" | "cpp", skillScope?: string[]): DebugQuestionSpec | null {
  if (!parsed) return null;
  const title = cleanProse(String(parsed.title || "Câu hỏi debug")).slice(0, 200);
  const statement = cleanProse(String(parsed.statement || ""));
  const correctCode = String(parsed.correctCode || "").trim();
  const buggyCode = String(parsed.buggyCode || "").trim();
  if (!statement || !correctCode || !buggyCode) return null;
  // skillId: trust the model only inside the whitelist; otherwise fall back to
  // the batch's scope so generated content carries a usable tag.
  const rawSkill = String(parsed.skillId || "").trim().slice(0, 80);
  const fallbackSkill = skillScope?.find((id) => VALID_SKILL_IDS.has(id));
  const skillId = (rawSkill && VALID_SKILL_IDS.has(rawSkill) ? rawSkill : fallbackSkill) || undefined;
  return {
    title,
    statement,
    language,
    input: String(parsed.input || ""),
    correctCode,
    buggyCode,
    bugDescription: cleanProse(String(parsed.bugDescription || "Có một lỗi logic trong code.")).slice(0, 300),
    skillId,
  };
}

// ── Stage 3: Review ──

/**
 * Second opinion on a question that already passed execution validation.
 *
 * Running the code proves the bug is real and changes the output; it proves
 * nothing about whether the statement describes what the code does, or whether
 * the explanation students read at the reveal is accurate and short enough to
 * absorb in a few seconds. That is what this pass is for.
 *
 * Deliberately cannot touch correctCode / buggyCode / input: those are already
 * verified by execution, and letting the reviewer rewrite them would invalidate
 * the expectedOutput and buggy-line numbers computed from them.
 *
 * Returns null when the review itself is unavailable (no key, circuit open, API
 * error, unparseable reply) — callers treat that as "keep the question", so a
 * flaky reviewer degrades quality but never blocks a game.
 */
export async function reviewDebugQuestion(
  spec: DebugQuestionSpec,
  expectedOutput: string,
  buggyOutput: string,
  scopeNote: string | null,
  teacherNote: string | null = null,
): Promise<DebugReviewResult | null> {
  if (!hasLLM() || circuitIsOpen()) return null;

  const langLabel = spec.language === "cpp" ? "C++" : "Python";
  const userPrompt = `Soát lại đề debug sau.

NGÔN NGỮ: ${langLabel}
${teacherNote ? `\nGIÁO VIÊN YÊU CẦU (đề phải nằm trong phạm vi này):\n${teacherNote}\n` : ""}${scopeNote ? `\nPHẠM VI KIẾN THỨC HỌC SINH:\n${scopeNote}\n` : ""}
TIÊU ĐỀ: ${spec.title}

ĐỀ BÀI:
${spec.statement}

INPUT MẪU:
${spec.input}

CODE ĐÚNG:
${spec.correctCode}

CODE CÓ BUG (đây là code học sinh nhìn thấy):
${spec.buggyCode}

OUTPUT KHI CHẠY CODE ĐÚNG (đã chạy thật): ${expectedOutput.trim()}
OUTPUT KHI CHẠY CODE BUG (đã chạy thật): ${buggyOutput.trim()}

MÔ TẢ LỖI HIỆN TẠI (phần học sinh đọc ở màn hình đáp án):
${spec.bugDescription}

Hãy soát theo đúng 3 nhóm A/B/C và trả về JSON đúng định dạng.`;

  const result = await chatCompletion(
    [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    {
      // Reviewing is a judgement call, not a creative one — keep it steady.
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: "json_object" },
      timeoutMs: 30000,
    },
  );
  if (!result) {
    circuitRecordAuthFailure();
    return null;
  }

  const content = result.content;
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("[ArenaReview] JSON parse failed. Raw (first 200 chars):", content.slice(0, 200));
    return null;
  }
  circuitRecordSuccess();
  return sanitizeReview(parsed);
}

const MAX_BUG_DESCRIPTION = 200;

function sanitizeReview(parsed: any): DebugReviewResult | null {
  if (!parsed) return null;
  const raw = String(parsed.verdict || "").trim().toLowerCase();
  const verdict: DebugReviewResult["verdict"] =
    raw === "reject" ? "reject" : raw === "fix_prose" ? "fix_prose" : raw === "ok" ? "ok" : "ok";
  const reason = String(parsed.reason || "").slice(0, 300);

  if (verdict !== "fix_prose") return { verdict, reason };

  // fix_prose is only actionable with replacement text. A reviewer that asks for
  // a rewrite but supplies nothing usable is treated as "keep the question".
  const statement = String(parsed.statement || "").trim();
  const bugDescription = String(parsed.bugDescription || "").trim();
  if (!statement && !bugDescription) return { verdict: "ok", reason };

  return {
    verdict: "fix_prose",
    reason,
    statement: statement || undefined,
    bugDescription: bugDescription ? bugDescription.slice(0, MAX_BUG_DESCRIPTION) : undefined,
  };
}
