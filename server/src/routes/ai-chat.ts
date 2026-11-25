import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { skillIdToName } from "../utils/skillGraph";
import { chatCompletion, hasLLM } from "../utils/llmClient";

const router = Router();

const SYSTEM_PROMPT = `Anh là trợ lý học tập AI cho nền tảng CodeClass, chuyên dạy lập trình Python cho học sinh cấp 2 (11-15 tuổi). Anh xưng "Anh" và gọi học sinh là "em". Trả lời bằng tiếng Việt, thân thiện, ngắn gọn.

NGUYÊN TẮC:
1. TRẢ LỜI NGẮN GỌN: Tối đa 3-5 câu với câu hỏi đơn giản. Với câu hỏi phức tạp, tối đa 8-10 câu. Đi thẳng vào vấn đề, không vòng vo.
2. Dùng phương pháp Socratic: đặt câu hỏi dẫn dắt để em tự tìm ra câu trả lời, KHÔNG đưa đáp án ngay lập tức
3. Khi em hỏi về code: giải thích từng dòng code, ý nghĩa. Chỉ đưa code mẫu sau khi đã giải thích
4. Dùng ví dụ đơn giản, gần gũi
5. Luôn động viên: "Rất tốt!", "Em giỏi quá!", "Đúng rồi đó em!"
6. Nếu em sai, nhẹ nhàng chỉ lỗi và gợi ý sửa
7. Giải thích bằng ngôn ngữ đơn giản, KHÔNG dùng thuật ngữ phức tạp
8. Từ chối nhẹ nhàng câu hỏi không liên quan đến học tập/lập trình

ĐỊNH DẠNG MARKDOWN:
- Dùng **in đậm** cho từ khóa quan trọng
- Dùng \`code\` cho tên biến, hàm
- Dùng \`\`\`python cho code block
- Dùng - cho danh sách
- Dùng $công thức$ cho toán học (ví dụ: $S = n(n+1)/2$)
- Dùng > cho trích dẫn/lưu ý

KHI CÓ PAGE CONTEXT:
- Dùng để hiểu em đang học gì, không cần nhắc lại toàn bộ
- Có thể tham chiếu: "Dựa trên bài em đang đọc về..."

KHI EM BÔI ĐEN VĂN BẢN:
- Tập trung giải thích đoạn được chọn, ngắn gọn xúc tích`;

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

router.post(
  "/chat",
  authenticate,
  requireRole("admin", "teacher", "teaching_assistant"),
  async (req: Request, res: Response): Promise<void> => {
    const { messages, pageContext, lessonId } = req.body as {
      messages?: ChatMessage[];
      pageContext?: string;
      lessonId?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "Thiếu messages" });
      return;
    }

    if (!hasLLM()) {
      res.status(500).json({ error: "Chưa cấu hình LLM (VILAO_API_KEY hoặc DEEPSEEK_API_KEY) trong .env" });
      return;
    }

    const systemMessages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Lesson context: tells the assistant which skill the current page teaches,
    // so its explanations stay on-topic for the student's current lesson.
    if (typeof lessonId === "string" && lessonId) {
      try {
        // Regular lesson first, then session-course lesson (different table).
        let title: string | null = null;
        let description: string | null = null;
        const lesson = await prisma.lesson.findUnique({
          where: { id: lessonId },
          select: { title: true, description: true },
        });
        if (lesson) {
          title = lesson.title;
          description = lesson.description;
        } else {
          const sessionLesson = await prisma.sessionLesson.findUnique({
            where: { id: lessonId },
            select: { title: true },
          });
          if (sessionLesson) title = sessionLesson.title;
        }
        if (title) {
          // Skill scope comes only from approved question tags on the lesson's
          // quizzes; title-based guessing was removed (see
          // docs/architecture/skill-assessment.md).
          const tagRows = await prisma.quizQuestion.findMany({
            where: { skillTagStatus: "approved", skillId: { not: null }, quiz: { lessonId } },
            select: { skillId: true },
          });
          const skills = [
            ...new Set(tagRows.map((r) => r.skillId).filter((s): s is string => Boolean(s))),
          ];
          const skillNote = skills.length
            ? skills.map((id) => `${id} (${skillIdToName(id)})`).join(", ")
            : "chưa xác định";
          systemMessages.push({
            role: "system",
            content: `[CONTEXT] Bài học hiện tại: "${title}" — skillId gợi ý: ${skillNote}. Hãy bám sát phạm vi kiến thức của bài học này khi trả lời.`,
          });
        }
      } catch { /* lesson context is best-effort */ }
    }

    if (pageContext) {
      systemMessages.push({
        role: "system",
        content: `[CONTEXT - Học sinh đang xem trang này. Dùng để hiểu ngữ cảnh, không cần nhắc lại toàn bộ nội dung]:\n${pageContext.slice(0, 3000)}`,
      });
    }

    try {
      const result = await chatCompletion(
        [...systemMessages, ...messages.slice(-20)],
        { temperature: 0.7, max_tokens: 1024, timeoutMs: 30000 },
      );

      const reply = result?.content || "Xin lỗi, tôi chưa hiểu câu hỏi của em.";

      res.json({ reply });
    } catch (err: any) {
      console.error("AI Chat error:", err?.response?.data || err.message);
      res.status(500).json({
        error: err?.response?.data?.error?.message || err.message || "Lỗi AI chat",
      });
    }
  }
);

export default router;
