import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { exec } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { chatCompletion, hasLLM } from "../utils/llmClient";

const router = Router();

const SYSTEM_PROMPT = `Bạn là trợ lý AI cho nền tảng CodeClass - nền tảng dạy lập trình Python cho học sinh cấp 2 (tuổi 11-15). Bạn trả lời bằng tiếng Việt, thân thiện và hữu ích.

CÓ 2 CHẾ ĐỘ TRẢ LỜI:

CHẾ ĐỘ 1 - TRÒ CHUYỆN (khi người dùng chào hỏi, hỏi thông tin, hoặc không yêu cầu thao tác dữ liệu):
- Trả lời tự nhiên, thân thiện bằng tiếng Việt
- Giải thích về nền tảng, cách dùng, các tính năng
- KHÔNG sinh code TypeScript
- Ví dụ: "Xin chào" → chào lại và giới thiệu những việc bạn có thể giúp

CHẾ ĐỘ 2 - THAO TÁC DỮ LIỆU (khi người dùng yêu cầu tạo/sửa/xóa nội dung):
1. Giải thích ngắn gọn bằng tiếng Việt bạn sẽ làm gì
2. Đưa code TypeScript HOÀN CHỈNH trong block \`\`\`typescript
3. Code phải standalone — tự import, tự disconnect PrismaClient
4. Dùng PrismaClient để thao tác database trực tiếp

=== DATABASE SCHEMA (Prisma + SQLite) ===

User: id, fullName, email, passwordHash, role (student|teacher|teaching_assistant|admin), avatarUrl?, phone?, bio?, status, createdAt, updatedAt, lastLoginAt?
Teacher mặc định: email="teacher@codeclass.com", pass="password123"

Course: id, title, description?, coverImageUrl?, ownerId→User, status (draft|active|archived), visibility (private|public), startDate?, endDate?, createdAt, updatedAt
CourseMember: id, courseId, userId, roleInCourse (teacher|teaching_assistant|student), joinedAt, status
Module: id, courseId→Course, title, description?, orderIndex, status, createdAt, updatedAt
Lesson: id, courseId, moduleId, title, description?, content? (HTML), orderIndex, status, estimatedDuration?, createdAt, updatedAt
Problem: id, title, shortDescription?, statement?, difficulty (easy|medium|hard), estimatedTime?, starterCode?, sampleInput?, sampleOutput?, requirementsText?, rubric?, hints?, teacherSolution?, status, createdById→User
ProblemTag: id, problemId, tag
Assignment: id, courseId, moduleId?, lessonId?, problemId?, title, description?, instructions?, submissionType (code-text|file-upload|link|text), deadline?, maxScore (default 10), allowLateSubmission, latePenaltyRule?, status, createdById→User
LessonProgress: id, userId, lessonId, completedAt
Material: id, title, description?, type (pdf|slide|image|code|note|link|video|markdown), fileUrl?, linkUrl?, visibility (teacher-only|student-visible), createdById→User
LessonMaterial: id, lessonId, materialId
CourseMaterial: id, courseId, materialId

=== CODE PATTERNS ===

Mẫu import:
\`\`\`typescript
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const p = new PrismaClient();
async function main() {
  // your code here
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
\`\`\`

Truy vấn: p.course.findMany / p.module.findFirst / p.lesson.findUnique / p.problem.create / p.assignment.update / etc.
Luôn dùng select/include để giới hạn field.
Tìm theo tên: { title: { contains: "keyword" } }
Hash password: await bcrypt.hash(password, 12)

Tìm teacher: const teacher = await p.user.findFirst({ where: { email: "teacher@codeclass.com" } });
Tìm course active: const course = await p.course.findFirst({ where: { status: "active" } });

=== INTERACTIVE ELEMENTS (nhúng vào Lesson.content) ===

Code Editor:
<textarea id="ce" style="width:100%;height:150px;background:#1e293b;color:#e2e8f0;font-family:monospace;padding:1rem;border-radius:8px;border:none" spellcheck="false">code here</textarea>
<button onclick="try { eval(document.getElementById('ce').value) } catch(e) { alert(e) }" style="margin-top:0.5rem;padding:0.5rem 1rem;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer">▶ Chạy</button>

Quiz trắc nghiệm:
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:1rem;margin:1rem 0">
  <p><strong>Câu hỏi?</strong></p>
  <label style="display:block;padding:0.3rem 0;cursor:pointer"><input type="radio" name="q" value="a"> A</label>
  <label style="display:block;padding:0.3rem 0;cursor:pointer"><input type="radio" name="q" value="b"> B (Đúng)</label>
  <button onclick="checkQuiz()" style="margin-top:0.5rem;padding:0.3rem 1rem;background:#2563eb;color:white;border:none;border-radius:4px;cursor:pointer">Kiểm tra</button>
  <p id="quiz-result" style="margin-top:0.5rem"></p>
</div>
<script>
function checkQuiz() { const q = document.querySelector('input[name="q"]:checked'); if (!q) { document.getElementById('quiz-result').textContent='Chọn đáp án'; return; } if (q.value==='b') document.getElementById('quiz-result').innerHTML='✅ Đúng!'; else document.getElementById('quiz-result').innerHTML='❌ Sai!'; }
</script>

Accordion:
<details style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:1rem;margin:1rem 0">
  <summary style="cursor:pointer;font-weight:600">📖 Xem lời giải</summary>
  <pre><code>solution</code></pre>
</details>

Step-by-step:
<div style="counter-increment:step;margin-bottom:1rem;padding:1rem;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0"><strong>Bước N:</strong> mô tả</div>

Highlight box:
<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:1rem;margin:1rem 0"><strong>⚠️ Lưu ý:</strong> nội dung</div>
<div style="background:#dbeafe;border:1px solid #3b82f6;border-radius:8px;padding:1rem;margin:1rem 0"><strong>💡 Mẹo:</strong> nội dung</div>

Canvas vẽ đồ thị:
<canvas id="chart" width="400" height="200" style="background:white;border:1px solid #e2e8f0;border-radius:8px"></canvas>
<script>(function(){const c=document.getElementById('chart').getContext('2d');const d=[30,50,80,45];const w=50,g=15,b=180;d.forEach((v,i)=>{c.fillStyle='#3b82f6';c.fillRect(i*(w+g),b-v,w,v);c.fillStyle='#1e293b';c.fillText(v,i*(w+g)+15,b-v-5)})})()</script>

QUAN TRỌNG: Trả lời bằng tiếng Việt. Code trong block \`\`\`typescript riêng biệt.`;

router.post(
  "/admin",
  authenticate,
  requireRole("teacher", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const { prompt, mode = "preview" } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      res.status(400).json({ error: "Thiếu prompt" });
      return;
    }

    if (!["preview", "execute"].includes(mode)) {
      res.status(400).json({ error: "mode phải là preview hoặc execute" });
      return;
    }

    if (!hasLLM()) {
      res.status(500).json({ error: "Chưa cấu hình LLM (VILAO_API_KEY hoặc DEEPSEEK_API_KEY) trong .env" });
      return;
    }

    const userId = req.user!.userId;

    try {
      const result = await chatCompletion(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        { temperature: 0.3, max_tokens: 4096, timeoutMs: 60000 },
      );

      const aiMessage = result?.content;
      if (!aiMessage) {
        res.status(500).json({ error: "AI không trả về phản hồi hợp lệ" });
        return;
      }

      const codeMatch = aiMessage.match(/```typescript\s*([\s\S]*?)```/);
      const code = codeMatch ? codeMatch[1].trim() : null;

      const explanation = aiMessage
        .replace(/```typescript[\s\S]*?```/g, "")
        .trim();

      if (mode === "preview") {
        await prisma.aILog.create({
          data: {
            userId,
            prompt: prompt.trim(),
            mode: "preview",
            code,
            status: "success",
          },
        });

        res.json({
          explanation,
          code,
          mode: "preview",
        });
        return;
      }

      if (!code) {
        await prisma.aILog.create({
          data: {
            userId,
            prompt: prompt.trim(),
            mode: mode,
            status: "success",
            result: explanation || "(trả lời trò chuyện, không có code)",
          },
        });

        res.json({
          explanation,
          code: null,
          mode,
          status: "success",
        });
        return;
      }

      // Safety: disable execute in production unless explicitly enabled
      if (process.env.NODE_ENV === "production" && process.env.AI_EXEC_ENABLED !== "true") {
        res.status(403).json({ error: "Execute mode is disabled in production. Set AI_EXEC_ENABLED=true to enable." });
        return;
      }

      const sanitized = code.replace(/process\.exit|require\(|import\s*\(/g, "// blocked: $&");
      const filename = `temp-ai-${Date.now()}.ts`;
      const filepath = join(__dirname, "..", "..", "scripts", filename);

      writeFileSync(filepath, sanitized, "utf-8");

      exec(
        `npx tsx scripts/${filename}`,
        { cwd: join(__dirname, "..", ".."), timeout: 30000 },
        async (error, stdout, stderr) => {
          try { unlinkSync(filepath); } catch {}

          const output = [stdout?.trim(), stderr?.trim()].filter(Boolean).join("\n");

          const status = error ? "error" : "success";

          await prisma.aILog.create({
            data: {
              userId,
              prompt: prompt.trim(),
              mode: "execute",
              code,
              result: output || (error ? `Exit code: ${error.code}` : "OK"),
              status,
            },
          });

          res.json({
            explanation,
            code,
            mode: "execute",
            output: output || "OK",
            status,
          });
        }
      );
    } catch (err: any) {
      console.error("AI Admin error:", err?.response?.data || err.message);

      await prisma.aILog.create({
        data: {
          userId,
          prompt: prompt.trim(),
          mode: "preview",
          status: "error",
          result: err?.response?.data?.error?.message || err.message || "Unknown error",
        },
      });

      res.status(500).json({
        error: err?.response?.data?.error?.message || err.message || "Lỗi không xác định",
      });
    }
  }
);

router.get(
  "/history",
  authenticate,
  requireRole("teacher", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const logs = await prisma.aILog.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        prompt: true,
        mode: true,
        code: true,
        result: true,
        status: true,
        createdAt: true,
      },
    });
    res.json(logs);
  }
);

export default router;
