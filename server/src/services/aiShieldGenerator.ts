import { SKILL_SEEDS, skillIdToName } from "../utils/skillGraph";
import { chatCompletion, hasLLM } from "../utils/llmClient";

/** Whitelist for AI-emitted skill tags — anything outside is dropped at parse time. */
const VALID_SKILL_IDS = new Set(SKILL_SEEDS.map((s) => s.skillId));

export interface AIGeneratedChallenge {
  title: string;
  problemStatement: string;
  constraints: string;
  samples: { input: string; output: string }[];
  hints: string[];
  /** Skill tag (AI-suggested, whitelist-validated) for the generated challenge. */
  skillId?: string;
}

const SYSTEM_PROMPT = `Bạn là một chuyên gia tạo đề bài lập trình cho học sinh Việt Nam (11-18 tuổi).

Nhiệm vụ: Nhận code mẫu + input + output, tạo ra một đề bài lập trình HOÀN CHỈNH bằng tiếng Việt.

QUY TẮC NGHIÊM NGẶT:
1. Đề bài phải MÔ TẢ RÕ RÀNG yêu cầu, không được lộ code mẫu hay thuật toán giải
2. Input/Output phải được mô tả chính xác bằng lời, KHÔNG copy nguyên input/output gốc
3. Phải có ít nhất 3 sample test case (KHÁC với input/output gốc)
4. Tự suy luận constraints phù hợp dựa trên code mẫu
5. Hints phải là gợi ý từng bước, không được giải toàn bộ bài toán
6. Tiếng Việt chuẩn, dễ hiểu, phù hợp học sinh
7. "skillId": chọn mã skill phù hợp nhất với kiến thức cần có để giải bài, từ danh sách hợp lệ được cung cấp trong yêu cầu (nếu có).

Định dạng JSON:
{
  "title": "Tiêu đề ngắn gọn (5-10 từ)",
  "problemStatement": "Mô tả đề bài đầy đủ bằng markdown, bao gồm: bối cảnh, yêu cầu, định dạng input, định dạng output",
  "constraints": "Ràng buộc: kích thước input, giới hạn thời gian, bộ nhớ (nếu có)",
  "samples": [
    {"input": "input mẫu 1", "output": "output mẫu 1"},
    {"input": "input mẫu 2", "output": "output mẫu 2"},
    {"input": "input mẫu 3", "output": "output mẫu 3"}
  ],
  "hints": ["Gợi ý 1: gợi ý nhẹ", "Gợi ý 2: gợi ý mạnh hơn"],
  "skillId": "mã skill phù hợp nhất"
}`;

export async function generateShieldChallenge(
  sourceCode: string,
  language: string,
  originalInput: string,
  originalOutput: string,
  skillScope?: string[],
): Promise<AIGeneratedChallenge | null> {
  if (!hasLLM()) {
    console.warn("LLM not configured — skipping AI generation");
    return null;
  }

  const validScope = (skillScope || []).filter((id) => VALID_SKILL_IDS.has(id));
  const skillSection = validScope.length
    ? `\n\nDanh sách skillId hợp lệ (PHẢI chọn đúng 1 mã, KHÔNG được bịa):\n${validScope
        .map((id) => `- ${id} — ${skillIdToName(id)}`)
        .join("\n")}`
    : "";

  const userPrompt = `Hãy tạo đề bài lập trình từ code mẫu sau:

NGÔN NGỮ: ${language === "cpp" ? "C++" : "Python"}

CODE MẪU (CHỈ ĐỂ THAM KHẢO, KHÔNG ĐƯỢC LỘ):
\`\`\`${language}
${sourceCode}
\`\`\`

INPUT GỐC:
${originalInput}

OUTPUT GỐC:
${originalOutput}

LƯU Ý: Tạo ít nhất 3 sample test cases KHÁC với input/output gốc ở trên.${skillSection}`;

  try {
    const result = await chatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.3, max_tokens: 2000, response_format: { type: "json_object" }, timeoutMs: 45000 },
    );

    const content = result?.content;
    if (!content) {
      console.error("AI generation returned empty content");
      return null;
    }

    const parsed = JSON.parse(content);

    // Validate required fields
    if (!parsed.title || !parsed.problemStatement) {
      console.error("AI generation missing required fields:", Object.keys(parsed));
      return null;
    }

    return {
      title: String(parsed.title),
      problemStatement: String(parsed.problemStatement),
      constraints: String(parsed.constraints || ""),
      samples: Array.isArray(parsed.samples) ? parsed.samples.slice(0, 5) : [
        { input: originalInput, output: originalOutput },
      ],
      hints: Array.isArray(parsed.hints) ? parsed.hints.slice(0, 3).map(String) : [],
      // skillId: trust the model only inside the whitelist; otherwise fall back
      // to the batch's scope so the challenge carries a usable tag.
      skillId: (() => {
        const raw = String(parsed.skillId || "").trim().slice(0, 80);
        if (raw && VALID_SKILL_IDS.has(raw)) return raw;
        return validScope[0];
      })(),
    };
  } catch (err: any) {
    console.error("AI shield generation error:", err?.response?.data || err?.message);
    return null;
  }
}
