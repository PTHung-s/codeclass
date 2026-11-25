import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Plus, Trash2 } from "lucide-react";
import api from "../../lib/api";
import { Button } from "../ui/button";

interface QuizFormDialogProps {
  open: boolean;
  onClose: () => void;
  quizId?: string;
  lessonId?: string;
  onSuccess: () => void;
}

interface QuizQuestion {
  id?: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  difficulty?: number;
}

export default function QuizFormDialog({ open, onClose, quizId, lessonId, onSuccess }: QuizFormDialogProps) {
  const isEdit = !!quizId;
  const [title, setTitle] = useState("");
  const [passScore, setPassScore] = useState("80");
  const [questionCount, setQuestionCount] = useState("15");
  const [shuffle, setShuffle] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [error, setError] = useState("");

  // Fetch existing quiz if editing
  const { data: existing } = useQuery({
    queryKey: ["quiz", quizId],
    queryFn: async () => {
      const quiz = await api.get(`/quizzes/${quizId}`).then((r) => r.data);
      const qs = await api.get(`/quizzes/${quizId}/questions`).then((r) => r.data);
      return { ...quiz, questions: qs };
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      setTitle(existing.title || "");
      setPassScore(existing.passScore?.toString() || "80");
      setQuestionCount(existing.questionCount?.toString() || "15");
      setShuffle(existing.shuffle ?? true);
      setQuestions(
        existing.questions?.map((q: any) => ({
          id: q.id,
          question: q.question,
          options: JSON.parse(q.options || "[]"),
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          difficulty: q.difficulty,
        })) || []
      );
    }
  }, [existing]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEdit) {
        await api.patch(`/quizzes/${quizId}`, {
          title: data.title,
          passScore: data.passScore,
          questionCount: data.questionCount,
          shuffle: data.shuffle,
        });
        // Update questions separately
        for (const q of data.questions) {
          if (q.id) {
            await api.patch(`/quizzes/${quizId}/questions/${q.id}`, {
              question: q.question,
              options: JSON.stringify(q.options),
              correctIndex: q.correctIndex,
              explanation: q.explanation,
              difficulty: q.difficulty,
            });
          } else {
            await api.post(`/quizzes/${quizId}/questions`, {
              question: q.question,
              options: JSON.stringify(q.options),
              correctIndex: q.correctIndex,
              explanation: q.explanation,
              difficulty: q.difficulty,
            });
          }
        }
      } else {
        const created = await api.post(`/lessons/${lessonId}/quizzes`, {
          title: data.title,
          passScore: data.passScore,
          questionCount: data.questionCount,
          shuffle: data.shuffle,
        });
        for (const q of data.questions) {
          await api.post(`/quizzes/${created.data.id}/questions`, {
            question: q.question,
            options: JSON.stringify(q.options),
            correctIndex: q.correctIndex,
            explanation: q.explanation,
            difficulty: q.difficulty,
          });
        }
      }
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || "Lưu thất bại");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("Vui lòng nhập tiêu đề");
      return;
    }
    if (questions.length === 0) {
      setError("Cần ít nhất 1 câu hỏi");
      return;
    }

    mutation.mutate({
      title,
      passScore: parseInt(passScore) || 80,
      questionCount: parseInt(questionCount) || 15,
      shuffle,
      questions,
    });
  };

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        question: "",
        options: ["", "", "", ""],
        correctIndex: 0,
        difficulty: 3,
      },
    ]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: keyof QuizQuestion, value: any) => {
    const updated = [...questions];
    (updated[index] as any)[field] = value;
    setQuestions(updated);
  };

  const updateOption = (qIndex: number, optIndex: number, value: string) => {
    const updated = [...questions];
    updated[qIndex].options[optIndex] = value;
    setQuestions(updated);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-card dark:bg-background rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold text-foreground dark:text-foreground">
            {isEdit ? "Chỉnh sửa quiz" : "Tạo quiz mới"}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Quiz meta */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-foreground dark:text-muted-foreground mb-1">
                Tiêu đề quiz *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none dark:bg-card"
                placeholder="Ví dụ: Kiểm tra nhanh về biến"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground dark:text-muted-foreground mb-1">
                Điểm đạt (%)
              </label>
              <input
                type="number"
                value={passScore}
                onChange={(e) => setPassScore(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none dark:bg-card"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground dark:text-muted-foreground mb-1">
                Số câu mỗi lần (random)
              </label>
              <input
                type="number"
                value={questionCount}
                onChange={(e) => setQuestionCount(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none dark:bg-card"
              />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-muted-foreground">
                <input
                  type="checkbox"
                  checked={shuffle}
                  onChange={(e) => setShuffle(e.target.checked)}
                  className="rounded border-border"
                />
                Trộn thứ tự câu hỏi
              </label>
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground dark:text-foreground">Câu hỏi</h3>
              <Button type="button" size="sm" onClick={addQuestion}>
                <Plus className="h-4 w-4 mr-1" />
                Thêm câu hỏi
              </Button>
            </div>

            {questions.map((q, qIdx) => (
              <div key={qIdx} className="border border-border rounded-lg p-4 space-y-3 dark:border-border">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-foreground dark:text-muted-foreground mb-1">
                      Câu {qIdx + 1} *
                    </label>
                    <textarea
                      value={q.question}
                      onChange={(e) => updateQuestion(qIdx, "question", e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none resize-none dark:bg-card"
                      placeholder="Nhập câu hỏi..."
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeQuestion(qIdx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {q.options.map((opt, optIdx) => (
                    <div key={optIdx} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${qIdx}`}
                        checked={q.correctIndex === optIdx}
                        onChange={() => updateQuestion(qIdx, "correctIndex", optIdx)}
                        className="shrink-0"
                      />
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => updateOption(qIdx, optIdx, e.target.value)}
                        className="flex-1 px-3 py-2 border border-border rounded-lg text-sm outline-none dark:bg-card"
                        placeholder={`Đáp án ${optIdx + 1}`}
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Giải thích (optional)</label>
                    <input
                      type="text"
                      value={q.explanation || ""}
                      onChange={(e) => updateQuestion(qIdx, "explanation", e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none dark:bg-card"
                      placeholder="Giải thích đáp án đúng..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Độ khó (1-5)</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={q.difficulty || 3}
                      onChange={(e) => updateQuestion(qIdx, "difficulty", parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none dark:bg-card"
                    />
                  </div>
                </div>
              </div>
            ))}

            {questions.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Chưa có câu hỏi nào. Bấm "Thêm câu hỏi" để bắt đầu.
              </div>
            )}
          </div>

          {/* Footer buttons */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo quiz"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
