import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";

const fieldLabel = "mb-1.5 block text-sm font-medium text-foreground";
const fieldHint = "mt-1.5 text-xs text-muted-foreground";
const selectClass =
  "h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30";
const textareaClass =
  "min-h-[104px] w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30";

export default function CourseForm() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const isEdit = !!courseId;

  const { data: existing } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => api.get(`/courses/${courseId}`).then((r) => r.data),
    enabled: isEdit,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [status, setStatus] = useState("draft");
  const [error, setError] = useState("");

  useEffect(() => {
    if (existing) {
      setTitle(existing.title || "");
      setDescription(existing.description || "");
      setStartDate(existing.startDate?.split("T")[0] || "");
      setEndDate(existing.endDate?.split("T")[0] || "");
      setVisibility(existing.visibility || "private");
      setStatus(existing.status || "draft");
    }
  }, [existing]);

  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit ? api.patch(`/courses/${courseId}`, data) : api.post("/courses", data),
    onSuccess: (res) => {
      navigate(`/courses/${isEdit ? courseId : res.data.id}`);
    },
    onError: (err: any) => setError(err.response?.data?.error || "Lưu thất bại"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!title) {
      setError("Vui lòng nhập tên khóa học");
      return;
    }
    mutation.mutate({ title, description, startDate, endDate, visibility, status });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={isEdit ? "Chỉnh sửa khóa học" : "Tạo khóa học mới"}
        description={
          isEdit
            ? "Cập nhật thông tin, trạng thái và quyền truy cập."
            : "Thiết lập khóa học trước khi thêm bài học."
        }
        onBack={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate("/courses");
        }}
        backLabel="Quay lại"
      />

      <Card>
        <CardContent className="p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? (
              <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div>
              <label htmlFor="course-title" className={fieldLabel}>
                Tên khóa học *
              </label>
              <Input
                id="course-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Python Cơ Bản"
              />
            </div>

            <div>
              <label htmlFor="course-description" className={fieldLabel}>
                Mô tả
              </label>
              <textarea
                id="course-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className={textareaClass}
                placeholder="Mô tả khóa học..."
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="course-start" className={fieldLabel}>
                  Ngày bắt đầu
                </label>
                <Input
                  id="course-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="course-end" className={fieldLabel}>
                  Ngày kết thúc
                </label>
                <Input
                  id="course-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="course-status" className={fieldLabel}>
                Trạng thái hiển thị
              </label>
              <select
                id="course-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={selectClass}
              >
                <option value="draft">Nháp — chỉ giáo viên/quản trị viên thấy</option>
                <option value="active">Đang hoạt động — học sinh thấy khóa học</option>
                <option value="archived">Lưu trữ — ẩn khỏi học sinh</option>
              </select>
              <p className={fieldHint}>
                Publish bài học không tự kích hoạt khóa; hãy đặt khóa thành “Đang hoạt động” khi
                sẵn sàng cho học sinh.
              </p>
            </div>

            <div>
              <label htmlFor="course-visibility" className={fieldLabel}>
                Quyền truy cập
              </label>
              <select
                id="course-visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className={selectClass}
              >
                <option value="public">Công khai trong CodeClass</option>
                <option value="private">Riêng tư</option>
                <option value="invite-only">Chỉ tham gia theo lời mời</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo khóa học"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (window.history.length > 1) navigate(-1);
                  else navigate("/courses");
                }}
              >
                Hủy
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
