import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import api from "../../lib/api";
import { Button } from "../ui/button";
import MDEditor from "@uiw/react-md-editor";

interface LessonFormDialogProps {
  open: boolean;
  onClose: () => void;
  lessonId?: string;
  moduleId?: string;
  onSuccess: () => void;
}

export default function LessonFormDialog({ open, onClose, lessonId, moduleId, onSuccess }: LessonFormDialogProps) {
  const isEdit = !!lessonId;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("draft");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [error, setError] = useState("");

  // Fetch existing lesson if editing
  const { data: existing } = useQuery({
    queryKey: ["lesson", lessonId],
    queryFn: () => api.get(`/lessons/${lessonId}`).then((r) => r.data),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      setTitle(existing.title || "");
      setDescription(existing.description || "");
      setContent(existing.content || "");
      setStatus(existing.status || "draft");
      setEstimatedDuration(existing.estimatedDuration?.toString() || "");
    }
  }, [existing]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEdit) {
        return api.patch(`/lessons/${lessonId}`, data);
      } else {
        return api.post(`/modules/${moduleId}/lessons`, data);
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

    mutation.mutate({
      title,
      description,
      content,
      status,
      estimatedDuration: estimatedDuration ? parseInt(estimatedDuration) : undefined,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-card dark:bg-background rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold text-foreground dark:text-foreground">
            {isEdit ? "Chỉnh sửa bài học" : "Tạo bài học mới"}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground dark:text-muted-foreground mb-1">
              Tiêu đề *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none dark:bg-card"
              placeholder="Ví dụ: Biến và kiểu dữ liệu"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground dark:text-muted-foreground mb-1">
              Mô tả
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none resize-none dark:bg-card"
              placeholder="Mô tả ngắn về bài học..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground dark:text-muted-foreground mb-1">
                Trạng thái
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none dark:bg-card"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground dark:text-muted-foreground mb-1">
                Thời gian ước tính (phút)
              </label>
              <input
                type="number"
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none dark:bg-card"
                placeholder="30"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground dark:text-muted-foreground mb-1">
              Nội dung (Markdown)
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Hỗ trợ Markdown, HTML comments cho code runners: {`<!--PYTHON_RUN-->code<!--/PYTHON_RUN-->`}
            </p>
            <div data-color-mode="light" className="border border-border rounded-lg overflow-hidden">
              <MDEditor
                value={content}
                onChange={(val) => setContent(val || "")}
                height={400}
              />
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo bài học"}
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
