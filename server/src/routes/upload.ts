import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".zip", ".rar", ".7z", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".py", ".cpp", ".c", ".java", ".js", ".ts", ".txt"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} is not allowed`));
    }
  },
});

// Chat images: smaller + image-only (png/jpg/jpeg/gif/webp, max 3MB)
const chatImageUpload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Chỉ chấp nhận ảnh PNG, JPG, GIF hoặc WEBP"));
    }
  },
});

// Upload file
router.post("/", authenticate, upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.status(201).json({
      fileUrl,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// Live chat image attachment
router.post("/chat-image", authenticate, (req: Request, res: Response) => {
  chatImageUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      const isLimit = typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "LIMIT_FILE_SIZE";
      res.status(400).json({ error: isLimit ? "Ảnh tối đa 3MB" : message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Chưa chọn ảnh" });
      return;
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.status(201).json({
      fileUrl,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  });
});

export default router;
