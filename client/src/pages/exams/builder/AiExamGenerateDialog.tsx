import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import api from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";

export function AiExamGenerateDialog({
  open,
  onClose,
  courseId,
  courseTitle,
  existingStems,
  hasExistingContent,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle: string;
  existingStems: string[];
  hasExistingContent: boolean;
  onApply: (result: any, mode: "replace" | "append") => void;
}) {
  const [mode, setMode] = useState<"replace" | "append">(hasExistingContent ? "append" : "replace");
  const [prompt, setPrompt] = useState("");
  const [mcqCount, setMcqCount] = useState(5);
  const [shortAnswerCount, setShortAnswerCount] = useState(2);
  const [codingCount, setCodingCount] = useState(1);
  const [difficulty, setDifficulty] = useState<"mixed" | "easy" | "medium" | "hard">("mixed");
  const [codeLanguage, setCodeLanguage] = useState<"python" | "cpp">("python");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const totalCount = mcqCount + shortAnswerCount + codingCount;

  const generateMut = useMutation({
    mutationFn: () =>
      api
        .post(
          "/exams/ai-generate",
          {
            prompt: prompt.trim(),
            courseId: courseId || undefined,
            mcqCount,
            shortAnswerCount,
            codingCount,
            difficulty,
            codeLanguage,
            existingStems: mode === "append" ? existingStems : undefined,
          },
          { timeout: 95_000 },
        )
        .then((r) => r.data),
    onSuccess: (data) => {
      setErrMsg(null);
      onApply(data, mode);
    },
    onError: (err: any) => {
      setErrMsg(err?.response?.data?.error || err?.message || "AI chưa tạo được câu hỏi. Vui lòng thử lại.");
    },
  });

  const handleGenerate = () => {
    setErrMsg(null);
    if (!prompt.trim() && !courseId) {
      setErrMsg("Vui lòng nhập chủ đề/mô tả hoặc chọn khóa học trước khi sinh đề.");
      return;
    }
    if (totalCount < 1 || totalCount > 25) {
      setErrMsg("Tổng số câu hỏi cần sinh phải nằm trong khoảng 1 đến 25.");
      return;
    }
    generateMut.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !generateMut.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> AI tạo đề thi &amp; câu hỏi
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setMode("replace")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                mode === "replace" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Tạo trọn bộ đề mới
            </button>
            <button
              type="button"
              onClick={() => setMode("append")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                mode === "append" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sinh thêm vào đề hiện tại
            </button>
          </div>

          {courseTitle && (
            <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-primary">
              AI sẽ tự tham khảo nội dung &amp; kỹ năng của khóa học: <span className="font-semibold">{courseTitle}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Chủ đề / Phạm vi kiến thức / Yêu cầu riêng {courseId ? "(tùy chọn)" : "*"}
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ví dụ: Vòng lặp for/while và danh sách trong Python lớp 10, chú trọng bẫy chỉ số mảng và bài toán đếm tần suất..."
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Trắc nghiệm (0–20)</label>
              <Input
                type="number"
                min={0}
                max={20}
                className="mt-1 h-8 text-xs"
                value={mcqCount}
                onChange={(e) => setMcqCount(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Trả lời ngắn (0–10)</label>
              <Input
                type="number"
                min={0}
                max={10}
                className="mt-1 h-8 text-xs"
                value={shortAnswerCount}
                onChange={(e) => setShortAnswerCount(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Thực hành code (0–6)</label>
              <Input
                type="number"
                min={0}
                max={6}
                className="mt-1 h-8 text-xs"
                value={codingCount}
                onChange={(e) => setCodingCount(Math.max(0, Math.min(6, Number(e.target.value) || 0)))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Độ khó</label>
              <select
                className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
              >
                <option value="mixed">Hỗn hợp (Cơ bản → Nâng cao)</option>
                <option value="easy">Cơ bản (Dễ)</option>
                <option value="medium">Trung bình</option>
                <option value="hard">Nâng cao (Khó)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Ngôn ngữ bài code</label>
              <select
                className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
                value={codeLanguage}
                onChange={(e) => setCodeLanguage(e.target.value === "cpp" ? "cpp" : "python")}
              >
                <option value="python">Python</option>
                <option value="cpp">C++</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Tổng số câu sẽ tạo: <strong className="text-foreground">{totalCount}</strong> / tối đa 25</span>
            <span>Bạn có thể chỉnh sửa lại từng câu sau khi tạo.</span>
          </div>

          {errMsg && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {errMsg}
            </div>
          )}

          {generateMut.isPending && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
              <span>AI đang biên soạn câu hỏi và đáp án chuẩn, quá trình này có thể mất 15–40 giây...</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" disabled={generateMut.isPending} onClick={onClose}>
              Hủy
            </Button>
            <Button type="button" size="sm" disabled={generateMut.isPending} onClick={handleGenerate}>
              {generateMut.isPending ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Đang tạo...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 size-3.5" /> Tạo câu hỏi bằng AI
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
