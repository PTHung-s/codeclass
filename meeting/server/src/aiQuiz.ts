import { SchemaType, type ResponseSchema } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { UPLOADS_ROOT } from './sockets/shared.js';

export type QuizDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';
export type QuizQuestionType = 'mixed' | 'code_output' | 'find_bug' | 'theory';

export interface NormalizedQuizQuestion {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctAnswer: number;
  explanation: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  skillId?: string;
}

export const QUIZ_ITEM_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    question: { type: SchemaType.STRING },
    options: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    correctAnswer: { type: SchemaType.INTEGER },
    explanation: { type: SchemaType.STRING },
    difficulty: { type: SchemaType.STRING },
    skillId: { type: SchemaType.STRING },
  },
  required: ['question', 'options', 'correctAnswer', 'explanation'],
};

export const QUIZ_LIST_SCHEMA: ResponseSchema = {
  type: SchemaType.ARRAY,
  items: QUIZ_ITEM_SCHEMA,
};

export const QUIZ_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    questions: QUIZ_LIST_SCHEMA,
  },
  required: ['questions'],
};

export const ADAPTIVE_RECOMMEND_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    topics: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          reason: { type: SchemaType.STRING },
          suggestedDifficulty: { type: SchemaType.STRING },
        },
        required: ['title', 'reason'],
      },
    },
  },
  required: ['topics'],
};

export const ADAPTIVE_GENERATE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    versionA: QUIZ_LIST_SCHEMA,
    versionB: QUIZ_LIST_SCHEMA,
  },
  required: ['versionA', 'versionB'],
};

/** Xóa tiền tố thừa AI hay sinh ra như "A. ", "B) ", "(C) ", "D: " tránh lặp nhãn trên UI */
export function stripOptionPrefix(opt: string): string {
  return String(opt || '')
    .trim()
    .replace(/^\s*(?:\(?[A-Da-d]\)|[A-Da-d][.:-])\s+/, '')
    .trim();
}

const normalizeKey = (text: string): string =>
  String(text || '')
    .toLowerCase()
    .replace(/[`*_~#\s]+/g, ' ')
    .trim()
    .slice(0, 140);

/**
 * Chuẩn hóa 1 câu hỏi từ AI và xáo trộn ngẫu nhiên 4 lựa chọn (Fisher-Yates)
 * để triệt tiêu thiên vị đáp án A/B của LLM, đồng thời giữ chính xác `correctAnswer`.
 */
export function shuffleQuizQuestion(
  raw: any,
  rng: () => number = Math.random,
): NormalizedQuizQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const question = String(raw.question || '').trim();
  if (question.length < 4) return null;

  const rawOpts = Array.isArray(raw.options) ? raw.options.map(stripOptionPrefix) : [];
  if (rawOpts.length < 4) return null;
  const fourOpts = rawOpts.slice(0, 4);
  if (fourOpts.some((o: string) => !o)) return null;

  const origIdx = Number(raw.correctAnswer);
  if (!Number.isInteger(origIdx) || origIdx < 0 || origIdx > 3) return null;

  const indexed = fourOpts.map((text: string, idx: number) => ({ text, isCorrect: idx === origIdx }));
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
  }

  const nextCorrect = indexed.findIndex((x: { text: string; isCorrect: boolean }) => x.isCorrect);
  if (nextCorrect < 0 || nextCorrect > 3) return null;

  const diffRaw = String(raw.difficulty || '').toLowerCase();
  const difficulty: 'easy' | 'medium' | 'hard' | undefined =
    diffRaw === 'easy' || diffRaw === 'medium' || diffRaw === 'hard' ? diffRaw : undefined;

  const rawSkill = typeof raw.skillId === 'string' ? raw.skillId.trim() : '';

  return {
    id: nanoid(10),
    question,
    options: [indexed[0].text, indexed[1].text, indexed[2].text, indexed[3].text],
    correctAnswer: nextCorrect,
    explanation: String(raw.explanation || '').trim(),
    ...(difficulty ? { difficulty } : {}),
    ...(rawSkill ? { skillId: rawSkill } : {}),
  };
}

export function normalizeQuizQuestions(
  rawList: any[],
  existingQuestions: string[] = [],
  rng: () => number = Math.random,
): NormalizedQuizQuestion[] {
  const seen = new Set<string>(existingQuestions.map(normalizeKey).filter(Boolean));
  const out: NormalizedQuizQuestion[] = [];
  if (!Array.isArray(rawList)) return out;

  for (const item of rawList) {
    const norm = shuffleQuizQuestion(item, rng);
    if (!norm) continue;
    const key = normalizeKey(norm.question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out;
}

export function parseJsonSafely(rawText: string): any {
  let jsonText = String(rawText || '').trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json/, '').replace(/```$/, '').trim();
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```/, '').replace(/```$/, '').trim();
  }

  try {
    return JSON.parse(jsonText);
  } catch {
    // Trích đoạn mảng hoặc object JSON bên ngoài nếu model có lỡ kèm chữ thừa
    const firstArr = jsonText.indexOf('[');
    const firstObj = jsonText.indexOf('{');
    let start = -1;
    let end = -1;
    if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
      start = firstArr;
      end = jsonText.lastIndexOf(']');
    } else if (firstObj !== -1) {
      start = firstObj;
      end = jsonText.lastIndexOf('}');
    }
    const sliced = start !== -1 && end > start ? jsonText.substring(start, end + 1) : jsonText;
    try {
      return JSON.parse(sliced);
    } catch {
      const fixedJson = sliced.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) =>
        match.replace(/\n/g, '\\n').replace(/\r/g, '\\r'),
      );
      return JSON.parse(fixedJson);
    }
  }
}

/**
 * Tóm tắt lịch sử câu hỏi Adaptive kèm phân tích các phương án sai phổ biến (distractor analysis)
 * để AI hiểu học sinh đang nhầm lẫn cụ thể ở lỗi tư duy nào.
 */
export function buildDistractorSummary(questionHistory: any[]): string {
  if (!Array.isArray(questionHistory) || questionHistory.length === 0) {
    return 'Chưa có câu hỏi nào.';
  }
  return questionHistory
    .slice(-15)
    .map((qr: any, idx: number) => {
      const total = Number(qr?.totalCount) || 0;
      const correct = Number(qr?.correctCount) || 0;
      const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
      const qText = String(qr?.question?.question || '').replace(/\s+/g, ' ').slice(0, 180);
      const opts: string[] = Array.isArray(qr?.question?.options) ? qr.question.options : [];
      const correctIdx = Number(qr?.question?.correctAnswer);

      const wrongCounts = new Map<number, number>();
      if (Array.isArray(qr?.results)) {
        for (const r of qr.results) {
          const sel = Number(r?.selectedOption);
          if (Number.isInteger(sel) && sel >= 0 && sel < opts.length && sel !== correctIdx) {
            wrongCounts.set(sel, (wrongCounts.get(sel) || 0) + 1);
          }
        }
      }

      const topWrong = Array.from(wrongCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([optIdx, cnt]) => {
          const letter = String.fromCharCode(65 + optIdx);
          const snippet = String(opts[optIdx] || '').replace(/\s+/g, ' ').slice(0, 60);
          return `chọn nhầm ${letter} ("${snippet}"): ${cnt}/${total} em`;
        });

      const wrongNote = topWrong.length > 0 ? ` | Lỗi phổ biến: ${topWrong.join('; ')}` : '';
      return `Câu ${idx + 1}: "${qText}" — ${pct}% đúng (${correct}/${total})${wrongNote}`;
    })
    .join('\n');
}

export function difficultyInstruction(difficulty?: string): string {
  switch (difficulty) {
    case 'easy':
      return 'Độ khó: DỄ (nhận biết cú pháp, khái niệm cơ bản, ví dụ ngắn gọn dễ theo dõi).';
    case 'medium':
      return 'Độ khó: TRUNG BÌNH (vận dụng logic, đọc hiểu luồng chạy, xử lý trường hợp biên phổ biến).';
    case 'hard':
      return 'Độ khó: KHÓ (tình huống bẫy tinh tế, độ phức tạp thuật toán, edge-case, tối ưu hoặc bug ẩn).';
    default:
      return 'Độ khó: HỖN HỢP (phân bổ hợp lý từ dễ -> trung bình -> khó).';
  }
}

export function questionTypeInstruction(qType?: string): string {
  switch (qType) {
    case 'code_output':
      return 'Dạng câu hỏi ưu tiên: ĐỌC HIỂU & ĐOÁN OUTPUT CODE (mỗi câu có đoạn code ngắn rõ ràng và hỏi kết quả in ra / giá trị biến).';
    case 'find_bug':
      return 'Dạng câu hỏi ưu tiên: TÌM LỖI BUG / SỬA CODE (đưa đoạn code có lỗi logic hoặc runtime và hỏi nguyên nhân / cách sửa đúng).';
    case 'theory':
      return 'Dạng câu hỏi ưu tiên: LÝ THUYẾT & KHÁI NIỆM (hiểu bản chất, so sánh cấu trúc dữ liệu, nguyên lý hoạt động).';
    default:
      return 'Dạng câu hỏi: TỔNG HỢP (kết hợp linh hoạt lý thuyết ngắn, đọc hiểu output code và nhận diện lỗi phổ biến).';
  }
}

/** Đọc an toàn ảnh đề bài đã lưu trên đĩa dưới UPLOADS_ROOT để gửi inlineData cho Gemini Vision */
export function loadUploadedAssignmentImage(
  uploadPath?: string,
): { data: string; mimeType: string } | null {
  if (!uploadPath || typeof uploadPath !== 'string' || !uploadPath.startsWith('/uploads/')) return null;
  const rel = uploadPath.slice('/uploads/'.length);
  const full = path.resolve(UPLOADS_ROOT, rel);
  const root = path.resolve(UPLOADS_ROOT);
  if (!full.startsWith(root + path.sep) && full !== root) return null;
  const ext = path.extname(full).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };
  const mimeType = mimeMap[ext];
  if (!mimeType) return null;
  try {
    const stat = fs.statSync(full);
    if (stat.size > 4 * 1024 * 1024) return null;
    const buf = fs.readFileSync(full);
    return { data: buf.toString('base64'), mimeType };
  } catch {
    return null;
  }
}
