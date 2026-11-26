/**
 * quizLibrary — thư viện đề trắc nghiệm lưu cục bộ (localStorage) + Xuất/Nhập JSON
 * giúp giáo viên không mất đề sau khi phát và tái sử dụng cho nhiều ca dạy.
 */
import type { Quiz, QuizQuestion } from '../types/quiz';

const LS_KEY = 'meet:quizLibrary:v1';
const MAX_SAVED = 20;

export interface SavedQuizTemplate {
  id: string;
  title: string;
  timeLimit?: number;
  questions: QuizQuestion[];
  savedAt: number;
}

export function loadQuizLibrary(): SavedQuizTemplate[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((q) => q && typeof q.title === 'string' && Array.isArray(q.questions));
  } catch {
    return [];
  }
}

export function saveQuizToLibrary(quiz: Pick<Quiz, 'title' | 'questions' | 'timeLimit'>): SavedQuizTemplate[] {
  const title = String(quiz.title || '').trim() || 'Đề trắc nghiệm';
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) return loadQuizLibrary();

  const existing = loadQuizLibrary();
  const entry: SavedQuizTemplate = {
    id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    timeLimit: quiz.timeLimit || undefined,
    questions: quiz.questions.map((q) => ({
      ...q,
      id: q.id || Math.random().toString(36).slice(2, 10),
    })),
    savedAt: Date.now(),
  };

  // Tránh lưu trùng y hệt tiêu đề + số câu liên tiếp
  const filtered = existing.filter(
    (item) => !(item.title === entry.title && item.questions.length === entry.questions.length),
  );
  const next = [entry, ...filtered].slice(0, MAX_SAVED);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* quota full */
  }
  return next;
}

export function deleteQuizFromLibrary(id: string): SavedQuizTemplate[] {
  const next = loadQuizLibrary().filter((item) => item.id !== id);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
  return next;
}

export function exportQuizJson(quiz: { title?: string; timeLimit?: number; questions?: QuizQuestion[] }): void {
  const payload = {
    version: 1,
    title: quiz.title || 'De-trac-nghiem',
    timeLimit: quiz.timeLimit || 0,
    exportedAt: new Date().toISOString(),
    questions: (quiz.questions || []).map((q) => ({
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer ?? 0,
      explanation: q.explanation || '',
      ...(q.difficulty ? { difficulty: q.difficulty } : {}),
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (payload.title || 'quiz').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 48) || 'quiz';
  a.href = url;
  a.download = `${safeName}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseImportedQuizJson(rawText: string): { title: string; timeLimit?: number; questions: QuizQuestion[] } {
  const data = JSON.parse(rawText);
  const list = Array.isArray(data) ? data : Array.isArray(data?.questions) ? data.questions : null;
  if (!list || list.length === 0) {
    throw new Error('File JSON không có danh sách câu hỏi hợp lệ.');
  }
  const questions: QuizQuestion[] = [];
  for (const item of list) {
    if (!item || typeof item.question !== 'string' || !item.question.trim()) continue;
    if (!Array.isArray(item.options) || item.options.length < 2) continue;
    const opts = item.options.slice(0, 4).map((o: any) => String(o ?? '').trim());
    while (opts.length < 4) opts.push('');
    const ca = Number(item.correctAnswer);
    questions.push({
      id: Math.random().toString(36).slice(2, 11),
      question: item.question.trim(),
      options: opts,
      correctAnswer: Number.isInteger(ca) && ca >= 0 && ca < 4 ? ca : 0,
      explanation: typeof item.explanation === 'string' ? item.explanation : '',
      difficulty:
        item.difficulty === 'easy' || item.difficulty === 'medium' || item.difficulty === 'hard'
          ? item.difficulty
          : undefined,
    });
  }
  if (questions.length === 0) {
    throw new Error('Không tìm thấy câu hỏi nào hợp lệ trong file JSON.');
  }
  const title = typeof data?.title === 'string' && data.title.trim() ? data.title.trim() : 'Đề nhập từ JSON';
  const timeLimit = Number(data?.timeLimit) > 0 ? Math.min(3600, Math.round(Number(data.timeLimit))) : undefined;
  return { title, timeLimit, questions };
}
