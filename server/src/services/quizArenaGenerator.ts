import { chatCompletion, hasLLM } from "../utils/llmClient";
import crypto from "node:crypto";
import { SKILL_SEEDS, skillIdToName } from "../utils/skillGraph";

/** Whitelist for AI-emitted skill tags — anything outside is dropped at parse time. */
const VALID_SKILL_IDS = new Set(SKILL_SEEDS.map((s) => s.skillId));

export interface QuizQuestionSpec {
  title: string;
  statement: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  topic: string;
  difficulty: number;
  skillId?: string;
}

export interface QuizGenerationContext {
  topicNote?: string | null;
  scopeNote?: string | null;
  targetDifficulty: number;
  previousTitles: string[];
  previousFingerprints: string[];
  performanceSummary?: string | null;
  /** Valid skillIds for this batch — injected into the prompt; parse-time fallback. */
  skillScope?: string[];
}

/**
 * Verdict of the review pass.
 *   ok        — question is sound and clearly written, keep as-is
 *   fix_prose — answer key is right but the wording needs replacing
 *   reject    — answer key is wrong or more than one option is defensible
 */
export interface QuizReviewResult {
  verdict: "ok" | "fix_prose" | "reject";
  reason: string;
  statement?: string;
  explanation?: string;
}

function clampDifficulty(value: unknown): number {
  if (typeof value === "string") {
    const map: Record<string, number> = { easy: 2, medium: 3, hard: 4 };
    if (map[value.toLowerCase()]) return map[value.toLowerCase()];
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(5, Math.round(number))) : 3;
}

function cleanText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

export function quizItemFingerprint(item: Pick<QuizQuestionSpec, "statement" | "options" | "correctIndex">): string {
  const normalized = JSON.stringify({
    statement: item.statement.toLowerCase().replace(/\s+/g, " ").trim(),
    options: item.options.map((option) => option.toLowerCase().replace(/\s+/g, " ").trim()),
    correctIndex: item.correctIndex,
  });
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function parsePair(content: string, skillScope?: string[]): QuizQuestionSpec[] {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const rawItems = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : parsed?.question ? [parsed.question] : [];
  if (!Array.isArray(rawItems)) return [];

  // skillId: trust the model only inside the whitelist; otherwise fall back to
  // the batch's scope so every generated item carries a usable tag.
  const fallbackSkill = skillScope?.find((id) => VALID_SKILL_IDS.has(id));

  const result: QuizQuestionSpec[] = [];
  for (const raw of rawItems.slice(0, 2)) {
    const options = Array.isArray(raw?.options) ? raw.options.map((option: unknown) => cleanText(option, 500)).filter(Boolean) : [];
    const correctIndex = Number(raw?.correctIndex);
    const rawSkill = cleanText(raw?.skillId, 80);
    const item: QuizQuestionSpec = {
      title: cleanText(raw?.title, 180),
      statement: cleanText(raw?.statement, 1800),
      options,
      correctIndex,
      explanation: cleanText(raw?.explanation, 1200),
      topic: cleanText(raw?.topic, 120),
      difficulty: clampDifficulty(raw?.difficulty),
      skillId: (rawSkill && VALID_SKILL_IDS.has(rawSkill) ? rawSkill : fallbackSkill) || undefined,
    };
    if (!item.title || !item.statement || !item.explanation || item.options.length !== 4) continue;
    if (!Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex >= item.options.length) continue;
    if (new Set(item.options.map((option) => option.toLowerCase())).size !== item.options.length) continue;
    result.push(item);
  }
  return result;
}

export async function generateQuizPair(context: QuizGenerationContext): Promise<QuizQuestionSpec[]> {
  if (!hasLLM()) return [];
  const previous = context.previousTitles.length
    ? context.previousTitles.map((title, index) => `${index + 1}. ${title}`).join("\n")
    : "(chưa có)";
  const generateOne = async (slot: number): Promise<QuizQuestionSpec | null> => {
    const skillScope = (context.skillScope || []).filter((id) => VALID_SKILL_IDS.has(id));
    const skillBlock = skillScope.length
      ? `\nDanh sách skillId hợp lệ (PHẢI chọn đúng 1 mã trong danh sách này, KHÔNG được bịa mã khác):\n${skillScope
          .map((id) => `- ${id} — ${skillIdToName(id)}`)
          .join("\n")}\n`
      : "";
    const prompt = `
Tạo đúng 1 câu hỏi trắc nghiệm lập trình bằng tiếng Việt cho Quiz Arena.
Đây là ứng viên ${slot + 1}/2 của một batch sinh song song; hãy chọn góc tiếp cận khác ứng viên còn lại.

Chủ đề giáo viên yêu cầu:
${context.topicNote || "Tự chọn trong phạm vi kiến thức học sinh đã học."}

Phạm vi kiến thức:
${context.scopeNote || "Python cơ bản và tư duy thuật toán."}
${skillBlock}
Độ khó mục tiêu: ${Math.max(1, Math.min(5, context.targetDifficulty))}/5.
${context.performanceSummary ? `Kết quả gần nhất của học sinh/nhóm:\n${context.performanceSummary}` : ""}

Câu đã dùng, tuyệt đối không lặp lại ý tưởng:
${previous}

Yêu cầu:
- Trả về đúng JSON dạng {"question":{...}}.
- Mỗi câu có title, statement, options đúng 4 phần tử, correctIndex từ 0 đến 3, explanation, topic, difficulty từ 1 đến 5${skillScope.length ? " và skillId (bắt buộc, chọn từ danh sách hợp lệ ở trên)" : " và skillId nếu xác định được"}.
- Một câu kiểm tra một ý rõ ràng; các phương án sai phải hợp lý nhưng chỉ có một đáp án đúng.
- Không nhắc đáp án đúng trong statement.
- Không lặp title, nội dung, số liệu, bối cảnh hoặc cách hỏi với danh sách đã dùng.
 - Câu hỏi phải phù hợp với độ khó mục tiêu, không tạo bài vượt quá phạm vi kiến thức.
`.trim();
    try {
      const result = await chatCompletion(
        [
          { role: "system", content: "Bạn là chuyên gia biên soạn câu hỏi lập trình. Chỉ trả JSON hợp lệ, không markdown." },
          { role: "user", content: prompt },
        ],
        { temperature: 0.7, max_tokens: 1500, response_format: { type: "json_object" }, timeoutMs: 45000 },
      );
      const content = result?.content;
      return content ? parsePair(content, context.skillScope)[0] || null : null;
    } catch (error: any) {
      console.error(`Quiz Arena generation error (candidate ${slot + 1}):`, error?.response?.data || error?.message);
      return null;
    }
  };

  const generated = await Promise.allSettled([generateOne(0), generateOne(1)]);
  const unique = new Map<string, QuizQuestionSpec>();
  for (const result of generated) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const fingerprint = quizItemFingerprint(result.value);
    if (!context.previousFingerprints.includes(fingerprint)) unique.set(fingerprint, result.value);
  }
  return [...unique.values()].slice(0, 2);
}

// ── Review pass ──

const REVIEW_SYSTEM_PROMPT = `Bạn là giáo viên phản biện, soát lại câu hỏi trắc nghiệm lập trình trước khi đưa cho học sinh Việt Nam (11-18 tuổi) thi đấu.

Không giống bài debug, câu trắc nghiệm KHÔNG chạy thử được — không có gì kiểm tra đáp án ngoài bạn. Hãy soát thật kỹ.

VIỆC CỦA BẠN:

A. ĐÁP ÁN CÓ THẬT SỰ ĐÚNG KHÔNG? (quan trọng nhất)
   - Tự giải lại câu hỏi từ đầu, ĐỪNG tin correctIndex cho sẵn.
   - Nếu có đoạn code, hãy chạy tâm minh từng dòng rồi mới kết luận.
   - So kết quả của bạn với phương án tại correctIndex. Lệch nhau → reject.

B. CÁC PHƯƠNG ÁN SAI CÓ THẬT SỰ SAI KHÔNG?
   - Đọc từng phương án còn lại. Nếu có phương án thứ hai cũng đúng, hoặc đúng một phần, hoặc đúng tùy cách hiểu → reject (câu phải có DUY NHẤT một đáp án đúng).
   - Nếu các phương án sai lộ liễu đến mức đoán được mà không cần hiểu bài → reject.
   - Nếu đáp án đúng dài hơn hẳn các phương án khác (học sinh đoán được nhờ độ dài) → reject.

C. PHẦN GIẢI THÍCH CÓ NGẮN VÀ DỄ HIỂU KHÔNG?
   - "explanation" là câu học sinh đọc NGAY SAU KHI hết giờ, trong vài giây. Nó phải:
     * TỐI ĐA 3 câu, dưới 400 ký tự.
     * Nói RÕ vì sao đáp án đúng là đúng, bằng lời lẽ học sinh hiểu ngay.
     * KHÔNG lan man, KHÔNG giảng lại toàn bộ lý thuyết, KHÔNG dùng từ hàn lâm.
   - Nếu nó dài dòng, vòng vo, hoặc giải thích SAI → viết lại.
   - "statement" phải gọn và không được lộ đáp án. Dài dòng thì viết lại, GIỮ NGUYÊN ý nghĩa.

QUY TẮC TRẢ VỀ:
- verdict="ok": đáp án đúng, phương án sai đều sai, giải thích đã gọn rõ.
- verdict="fix_prose": đáp án ĐÚNG nhưng chữ cần sửa. BẮT BUỘC trả về CẢ statement và explanation (bản đã viết lại; phần nào vốn đã tốt thì copy y nguyên). KHÔNG được đổi thứ tự hay nội dung các phương án.
- verdict="reject": đáp án sai / có nhiều đáp án đúng / phương án sai lộ liễu. Nêu "reason" ngắn gọn.
- Ưu tiên "fix_prose" hơn "reject": chỉ reject khi lỗi KHÔNG thể chữa bằng cách viết lại chữ.
- Tiếng Việt có dấu.

Định dạng JSON BẮT BUỘC:
{
  "verdict": "ok" | "fix_prose" | "reject",
  "reason": "lý do ngắn gọn (1 câu)",
  "statement": "đề bài (chỉ khi fix_prose)",
  "explanation": "giải thích ngắn gọn dưới 400 ký tự (chỉ khi fix_prose)"
}`;

const MAX_EXPLANATION = 400;

/**
 * Second opinion on a generated quiz item.
 *
 * A multiple-choice question has no equivalent of "run the code and see" — the
 * only checks today are structural (four options, index in range, no duplicate
 * text), and none of them can tell whether the option marked correct actually
 * is. This pass re-solves the question independently and rejects the item when
 * its answer disagrees.
 *
 * Options are deliberately immutable: a reviewer that reworded them would
 * invalidate the fingerprint used for deduplication and the calibration history
 * keyed to it. Only the prose may be replaced.
 *
 * Returns null when review is unavailable (no key, API error, unparseable
 * reply) — callers treat that as "keep the question", so a flaky reviewer
 * degrades quality but never blocks a game.
 */
export async function reviewQuizQuestion(
  spec: QuizQuestionSpec,
  context: Pick<QuizGenerationContext, "topicNote" | "scopeNote">,
): Promise<QuizReviewResult | null> {
  if (!hasLLM()) return null;

  const optionLines = spec.options
    .map((option, index) => `${index}. ${option}${index === spec.correctIndex ? "   ← ĐANG ĐÁNH DẤU LÀ ĐÁP ÁN ĐÚNG" : ""}`)
    .join("\n");

  const prompt = `Soát lại câu hỏi trắc nghiệm sau.
${context.topicNote ? `\nGIÁO VIÊN YÊU CẦU (câu hỏi phải nằm trong phạm vi này):\n${context.topicNote}\n` : ""}${context.scopeNote ? `\nPHẠM VI KIẾN THỨC HỌC SINH:\n${context.scopeNote}\n` : ""}
TIÊU ĐỀ: ${spec.title}

ĐỀ BÀI:
${spec.statement}

CÁC PHƯƠNG ÁN:
${optionLines}

GIẢI THÍCH HIỆN TẠI (phần học sinh đọc ở màn hình đáp án):
${spec.explanation}

Hãy soát theo đúng 3 nhóm A/B/C và trả về JSON đúng định dạng.`;

  try {
    const result = await chatCompletion(
      [
        { role: "system", content: REVIEW_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      {
        // Reviewing is a judgement call, not a creative one — keep it steady.
        temperature: 0.2,
        max_tokens: 900,
        response_format: { type: "json_object" },
        timeoutMs: 30000,
      },
    );
    const content = result?.content;
    if (!content) return null;

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("[QuizReview] JSON parse failed. Raw (first 200 chars):", content.slice(0, 200));
      return null;
    }
    return sanitizeReview(parsed);
  } catch (error: any) {
    console.error("[QuizReview] review error:", error?.response?.data || error?.message);
    return null;
  }
}

function sanitizeReview(parsed: any): QuizReviewResult | null {
  if (!parsed) return null;
  const raw = String(parsed.verdict || "").trim().toLowerCase();
  const verdict: QuizReviewResult["verdict"] =
    raw === "reject" ? "reject" : raw === "fix_prose" ? "fix_prose" : "ok";
  const reason = cleanText(parsed.reason, 300);

  if (verdict !== "fix_prose") return { verdict, reason };

  // fix_prose is only actionable with replacement text. A reviewer that asks for
  // a rewrite but supplies nothing usable is treated as "keep the question".
  const statement = cleanText(parsed.statement, 1800);
  const explanation = cleanText(parsed.explanation, MAX_EXPLANATION);
  if (!statement && !explanation) return { verdict: "ok", reason };

  return {
    verdict: "fix_prose",
    reason,
    statement: statement || undefined,
    explanation: explanation || undefined,
  };
}

/**
 * Run every candidate through review concurrently and return the survivors,
 * with any prose rewrites applied. Rejected items are dropped; the caller's
 * existing retry loop tops the batch back up.
 */
export async function reviewQuizBatch(
  items: QuizQuestionSpec[],
  context: Pick<QuizGenerationContext, "topicNote" | "scopeNote">,
): Promise<QuizQuestionSpec[]> {
  if (!items.length) return items;
  const reviews = await Promise.allSettled(items.map((item) => reviewQuizQuestion(item, context)));

  const kept: QuizQuestionSpec[] = [];
  for (let i = 0; i < items.length; i++) {
    const result = reviews[i];
    const review = result.status === "fulfilled" ? result.value : null;
    if (review?.verdict === "reject") {
      console.log(`[QuizReview] dropped "${items[i].title}" — ${review.reason}`);
      continue;
    }
    if (review?.verdict === "fix_prose") {
      console.log(`[QuizReview] rewrote prose for "${items[i].title}" — ${review.reason}`);
      kept.push({
        ...items[i],
        statement: review.statement || items[i].statement,
        explanation: review.explanation || items[i].explanation,
      });
      continue;
    }
    kept.push(items[i]);
  }
  return kept;
}
