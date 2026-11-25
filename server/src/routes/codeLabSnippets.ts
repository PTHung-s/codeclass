import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import { param } from "../utils/routeHelpers";

const router = Router();
router.use(authenticate);

const MAX_SNIPPETS_PER_USER = 30;
const MAX_CODE_CHARS = 65_536;
const MAX_INPUT_CHARS = 16_384;

function normalizeLanguage(lang: unknown): "python" | "cpp" | null {
  if (lang === "python" || lang === "cpp") return lang;
  return null;
}

/** Danh sách snippet Code Lab đã lưu trên server của user hiện tại. */
router.get("/snippets", async (req: Request, res: Response) => {
  try {
    const snippets = await prisma.codeLabSnippet.findMany({
      where: { userId: req.user!.userId },
      orderBy: { updatedAt: "desc" },
      take: MAX_SNIPPETS_PER_USER,
    });
    res.json(snippets);
  } catch {
    res.status(500).json({ error: "Không tải được danh sách snippet" });
  }
});

/** Lưu một snippet mới lên server. */
router.post("/snippets", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const language = normalizeLanguage(req.body?.language);
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const inputText = typeof req.body?.inputText === "string" ? req.body.inputText : "";

    if (!title || title.length > 80) {
      res.status(400).json({ error: "Tên snippet phải từ 1 đến 80 ký tự" });
      return;
    }
    if (!language) {
      res.status(400).json({ error: "Ngôn ngữ không hợp lệ" });
      return;
    }
    if (code.length > MAX_CODE_CHARS) {
      res.status(400).json({ error: "Mã nguồn vượt quá 64 KB" });
      return;
    }
    if (inputText.length > MAX_INPUT_CHARS) {
      res.status(400).json({ error: "Dữ liệu input vượt quá 16 KB" });
      return;
    }

    const existingCount = await prisma.codeLabSnippet.count({ where: { userId } });
    if (existingCount >= MAX_SNIPPETS_PER_USER) {
      res.status(400).json({ error: `Bạn chỉ lưu được tối đa ${MAX_SNIPPETS_PER_USER} snippet. Hãy xóa bớt trước khi lưu thêm.` });
      return;
    }

    const snippet = await prisma.codeLabSnippet.create({
      data: { userId, title, language, code, inputText },
    });
    res.status(201).json(snippet);
  } catch {
    res.status(500).json({ error: "Không lưu được snippet" });
  }
});

/** Cập nhật snippet đã có (chỉ chủ sở hữu). */
router.put("/snippets/:id", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const userId = req.user!.userId;
    const existing = await prisma.codeLabSnippet.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      res.status(404).json({ error: "Không tìm thấy snippet" });
      return;
    }

    const data: Record<string, string> = {};
    if (req.body?.title !== undefined) {
      const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
      if (!title || title.length > 80) {
        res.status(400).json({ error: "Tên snippet phải từ 1 đến 80 ký tự" });
        return;
      }
      data.title = title;
    }
    if (req.body?.language !== undefined) {
      const language = normalizeLanguage(req.body.language);
      if (!language) {
        res.status(400).json({ error: "Ngôn ngữ không hợp lệ" });
        return;
      }
      data.language = language;
    }
    if (req.body?.code !== undefined) {
      const code = typeof req.body.code === "string" ? req.body.code : "";
      if (code.length > MAX_CODE_CHARS) {
        res.status(400).json({ error: "Mã nguồn vượt quá 64 KB" });
        return;
      }
      data.code = code;
    }
    if (req.body?.inputText !== undefined) {
      const inputText = typeof req.body.inputText === "string" ? req.body.inputText : "";
      if (inputText.length > MAX_INPUT_CHARS) {
        res.status(400).json({ error: "Dữ liệu input vượt quá 16 KB" });
        return;
      }
      data.inputText = inputText;
    }

    const updated = await prisma.codeLabSnippet.update({ where: { id }, data });
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Không cập nhật được snippet" });
  }
});

/** Xóa snippet (chỉ chủ sở hữu). */
router.delete("/snippets/:id", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const userId = req.user!.userId;
    const existing = await prisma.codeLabSnippet.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      res.status(404).json({ error: "Không tìm thấy snippet" });
      return;
    }
    await prisma.codeLabSnippet.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Không xóa được snippet" });
  }
});

export default router;
