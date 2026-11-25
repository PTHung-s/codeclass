import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "../../lib/api";
import MDEditor from "@uiw/react-md-editor";
import Editor from "@monaco-editor/react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";

const fieldLabel = "mb-1.5 block text-sm font-medium text-foreground";
const selectClass =
  "h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30";
const textareaClass =
  "w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30";

export default function ProblemForm() {
  const { problemId } = useParams();
  const navigate = useNavigate();
  const isEdit = !!problemId;

  const { data: existing } = useQuery({
    queryKey: ["problem", problemId],
    queryFn: () => api.get(`/problems/${problemId}`).then((r) => r.data),
    enabled: isEdit,
  });

  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [statement, setStatement] = useState("");
  const [difficulty, setDifficulty] = useState("easy");
  const [estimatedTime, setEstimatedTime] = useState("");
  const [starterCode, setStarterCode] = useState("");
  const [sampleInput, setSampleInput] = useState("");
  const [sampleOutput, setSampleOutput] = useState("");
  const [requirementsText, setRequirementsText] = useState("");
  const [rubric, setRubric] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [teacherSolution, setTeacherSolution] = useState("");
  const [hints, setHints] = useState<string[]>([""]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (existing) {
      setTitle(existing.title || "");
      setShortDescription(existing.shortDescription || "");
      setStatement(existing.statement || "");
      setDifficulty(existing.difficulty || "easy");
      setEstimatedTime(existing.estimatedTime?.toString() || "");
      setStarterCode(existing.starterCode || "");
      setSampleInput(existing.sampleInput || "");
      setSampleOutput(existing.sampleOutput || "");
      setRequirementsText(existing.requirementsText || "");
      setRubric(existing.rubric || "");
      setTagsInput(existing.tags?.map((t: any) => t.tag).join(", ") || "");
      setTeacherSolution(existing.teacherSolution || "");
      if (isEdit && problemId) {
        api
          .get(`/problems/${problemId}/hints`)
          .then((r) => {
            if (r.data?.length) setHints(r.data.map((h: any) => h.content));
          })
          .catch(() => {});
      }
    }
  }, [existing, isEdit, problemId]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = isEdit
        ? await api.patch(`/problems/${problemId}`, data)
        : await api.post("/problems", data);
      const problemIdResult = res.data.id;
      const validHints = hints.filter((h) => h.trim()).map((h) => ({ content: h }));
      await api.put(`/problems/${problemIdResult}/hints`, { hints: validHints });
      return res;
    },
    onSuccess: (res) => navigate(`/problems/${isEdit ? problemId : res.data.id}`),
    onError: (err: any) => setError(err.response?.data?.error || "Lưu thất bại"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!title) {
      setError("Vui lòng nhập tiêu đề");
      return;
    }

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    mutation.mutate({
      title,
      shortDescription,
      statement,
      difficulty,
      estimatedTime: estimatedTime ? parseInt(estimatedTime) : undefined,
      starterCode,
      sampleInput,
      sampleOutput,
      requirementsText,
      rubric,
      tags,
      teacherSolution,
      status: isEdit ? undefined : "draft",
    });
  };

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/problems");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={isEdit ? "Chỉnh sửa đề bài" : "Tạo đề bài mới"}
        description={
          isEdit
            ? "Cập nhật đề, gợi ý và lời giải cho giáo viên."
            : "Soạn đề bài, sample I/O và gợi ý progressive."
        }
        onBack={goBack}
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
              <label htmlFor="problem-title" className={fieldLabel}>
                Tiêu đề *
              </label>
              <Input
                id="problem-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="problem-short" className={fieldLabel}>
                Mô tả ngắn
              </label>
              <Input
                id="problem-short"
                type="text"
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="problem-difficulty" className={fieldLabel}>
                  Độ khó
                </label>
                <select
                  id="problem-difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className={selectClass}
                >
                  <option value="easy">Dễ</option>
                  <option value="medium">Trung bình</option>
                  <option value="hard">Khó</option>
                </select>
              </div>
              <div>
                <label htmlFor="problem-time" className={fieldLabel}>
                  Thời gian (phút)
                </label>
                <Input
                  id="problem-time"
                  type="number"
                  value={estimatedTime}
                  onChange={(e) => setEstimatedTime(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="problem-tags" className={fieldLabel}>
                  Thẻ (phân cách bởi dấu phẩy)
                </label>
                <Input
                  id="problem-tags"
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="vòng lặp, toán học"
                />
              </div>
            </div>

            <div>
              <label className={fieldLabel}>Đề bài</label>
              <div data-color-mode="light" className="overflow-hidden rounded-lg border border-border">
                <MDEditor value={statement} onChange={(val) => setStatement(val || "")} height={300} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="problem-sample-in" className={fieldLabel}>
                  Input mẫu
                </label>
                <textarea
                  id="problem-sample-in"
                  value={sampleInput}
                  onChange={(e) => setSampleInput(e.target.value)}
                  rows={3}
                  className={textareaClass}
                />
              </div>
              <div>
                <label htmlFor="problem-sample-out" className={fieldLabel}>
                  Output mẫu
                </label>
                <textarea
                  id="problem-sample-out"
                  value={sampleOutput}
                  onChange={(e) => setSampleOutput(e.target.value)}
                  rows={3}
                  className={textareaClass}
                />
              </div>
            </div>

            <div>
              <label className={fieldLabel}>Code khởi tạo</label>
              <div className="overflow-hidden rounded-lg border border-border">
                <Editor
                  height="200px"
                  defaultLanguage="python"
                  value={starterCode}
                  onChange={(val) => setStarterCode(val || "")}
                  theme="vs-light"
                  options={{ minimap: { enabled: false }, fontSize: 14 }}
                />
              </div>
            </div>

            <div>
              <label className={fieldLabel}>Yêu cầu</label>
              <div data-color-mode="light" className="overflow-hidden rounded-lg border border-border">
                <MDEditor
                  value={requirementsText}
                  onChange={(val) => setRequirementsText(val || "")}
                  height={200}
                />
              </div>
            </div>

            <div>
              <label className={fieldLabel}>Thang điểm</label>
              <div data-color-mode="light" className="overflow-hidden rounded-lg border border-border">
                <MDEditor value={rubric} onChange={(val) => setRubric(val || "")} height={200} />
              </div>
            </div>

            <div>
              <label className={fieldLabel}>Lời giải (chỉ giáo viên xem được)</label>
              <div className="overflow-hidden rounded-lg border border-border">
                <Editor
                  height="300px"
                  defaultLanguage="python"
                  value={teacherSolution}
                  onChange={(val) => setTeacherSolution(val || "")}
                  theme="vs-light"
                  options={{ minimap: { enabled: false }, fontSize: 14 }}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="mb-0 block text-sm font-medium text-foreground">
                  Gợi ý (Progressive Hints)
                </label>
                <Button type="button" variant="ghost" size="xs" onClick={() => setHints([...hints, ""])}>
                  + Thêm gợi ý
                </Button>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Học sinh sẽ thấy từng gợi ý một, mỗi lần click sẽ hiện hint tiếp theo.
              </p>
              <div className="space-y-2">
                {hints.map((hint, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="w-6 shrink-0 pt-2.5 text-right text-xs text-muted-foreground">
                      {i + 1}.
                    </span>
                    <textarea
                      value={hint}
                      onChange={(e) => {
                        const next = [...hints];
                        next[i] = e.target.value;
                        setHints(next);
                      }}
                      rows={2}
                      className={`${textareaClass} flex-1`}
                      placeholder={`Gợi ý ${i + 1}: Gợi ý nhẹ nhàng, không tiết lộ đáp án...`}
                    />
                    {hints.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="mt-1 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setHints(hints.filter((_, j) => j !== i))}
                        aria-label={`Xóa gợi ý ${i + 1}`}
                      >
                        ✕
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo đề bài"}
              </Button>
              <Button type="button" variant="outline" onClick={goBack}>
                Hủy
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
