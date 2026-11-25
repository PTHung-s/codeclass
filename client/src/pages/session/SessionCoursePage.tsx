import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, ClipboardList, Lock, PlayCircle, Plus } from "lucide-react";
import { useState } from "react";
import api from "../../lib/api";
import { useAuthContext } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";
import { cn } from "../../lib/utils";

type Filter = "all" | "verified" | "current" | "locked";

const COURSE_STATUS_OPTIONS = [
  { value: "draft", label: "Nháp" },
  { value: "active", label: "Đang hoạt động" },
  { value: "archived", label: "Lưu trữ" },
];

const lessonState = {
  verified: {
    label: "Đã hoàn thành",
    icon: CheckCircle2,
    tone: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  current: {
    label: "Đang học",
    icon: PlayCircle,
    tone: "border-primary/25 bg-primary/10 text-primary",
  },
  locked: {
    label: "Chưa mở",
    icon: Lock,
    tone: "border-border bg-muted text-muted-foreground",
  },
} as const;

export default function SessionCoursePage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const isStaff =
    user?.role === "teacher" || user?.role === "admin" || user?.role === "teaching_assistant";

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["session-course", courseId],
    queryFn: () => api.get(`/session-course/course/${courseId}`).then((response) => response.data),
    enabled: !!courseId,
  });

  const createLesson = useMutation({
    mutationFn: () =>
      api
        .post(`/session-course/teacher/lesson`, { courseId, title: "Buổi học mới" })
        .then((response) => response.data),
    onSuccess: (response: any) => {
      qc.invalidateQueries({ queryKey: ["session-course", courseId] });
      navigate(`/teacher/course/${courseId}/lesson/${response.lesson.id}`);
    },
    onError: (error: any) =>
      toast.error({
        title: "Không tạo được buổi học",
        message: error.response?.data?.error || "Vui lòng thử lại.",
      }),
  });

  const updateCourseStatus = useMutation({
    mutationFn: (status: string) =>
      api.patch(`/courses/${courseId}`, { status }).then((response) => response.data),
    onSuccess: (_response, status) => {
      qc.invalidateQueries({ queryKey: ["session-course", courseId] });
      qc.invalidateQueries({ queryKey: ["courses"] });
      toast.success({
        title: "Đã cập nhật trạng thái",
        message:
          status === "active"
            ? "Khóa học hiện có thể xuất hiện với học sinh."
            : "Trạng thái hiển thị đã được thay đổi.",
      });
    },
    onError: (error: any) =>
      toast.error({
        title: "Không cập nhật được",
        message: error.response?.data?.error || "Vui lòng thử lại.",
      }),
  });

  if (isLoading || isError || !data) {
    return (
      <div className="mx-auto max-w-6xl py-16 text-center text-sm text-muted-foreground">
        {isLoading ? "Đang tải khóa học..." : "Không tải được khóa học."}
      </div>
    );
  }

  const { course, lessons } = data;
  const filteredLessons = lessons.filter(
    (lesson: any) => filter === "all" || lesson.userStatus === filter,
  );
  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "Tất cả" },
    { value: "current", label: "Đang học" },
    { value: "verified", label: "Đã hoàn thành" },
    { value: "locked", label: "Chưa mở" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={course.title || "Khóa học theo buổi"}
        description={course.description || "Hoàn thành quiz từng buổi để mở khóa buổi tiếp theo."}
        actions={
          isStaff ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Trạng thái khóa học"
                value={course.status || "draft"}
                disabled={updateCourseStatus.isPending}
                onChange={(event) => updateCourseStatus.mutate(event.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 dark:bg-input/30"
              >
                {COURSE_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button onClick={() => createLesson.mutate()} disabled={createLesson.isPending}>
                <Plus className="h-4 w-4" />
                {createLesson.isPending ? "Đang tạo..." : "Thêm buổi học"}
              </Button>
            </div>
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-3">
          {filters.map((item) => (
            <Button
              key={item.value}
              size="xs"
              variant={filter === item.value ? "secondary" : "ghost"}
              className="rounded-full"
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <CardContent className="divide-y divide-border p-0">
          {filteredLessons.map((lesson: any) => {
            const statusKey: keyof typeof lessonState =
              lesson.userStatus === "verified" ||
              lesson.userStatus === "current" ||
              lesson.userStatus === "locked"
                ? lesson.userStatus
                : "locked";
            const state = lessonState[statusKey];
            const StateIcon = state.icon;
            const disabled = !isStaff && statusKey === "locked";
            return (
              <button
                key={lesson.id}
                disabled={disabled}
                onClick={() =>
                  navigate(
                    isStaff
                      ? `/teacher/course/${courseId}/lesson/${lesson.id}`
                      : `/course/${courseId}/lesson/${lesson.id}`,
                  )
                }
                className={cn(
                  "group flex w-full items-center gap-4 px-5 py-4 text-left transition-[background-color,transform,box-shadow] duration-150",
                  disabled
                    ? "cursor-not-allowed bg-muted/30 text-muted-foreground"
                    : "row-interactive text-foreground hover:bg-muted/50",
                  !disabled && statusKey === "current" && "row-current bg-primary/[0.03]",
                  !disabled && statusKey === "verified" && "opacity-95",
                )}
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-sm font-bold tabular-nums transition-colors",
                    statusKey === "current"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : statusKey === "verified"
                        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-border bg-muted text-foreground",
                    disabled && "opacity-60",
                  )}
                >
                  {statusKey === "verified" && !isStaff ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : statusKey === "locked" && !isStaff ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    String(lesson.orderIndex).padStart(2, "0")
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {lesson.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {isStaff
                      ? "Mở trang chuẩn bị nội dung"
                      : statusKey === "locked"
                        ? "Hoàn thành buổi trước để mở khóa"
                        : statusKey === "verified"
                          ? "Xem lại nội dung buổi học"
                          : "Tiếp tục buổi học"}
                  </span>
                </span>
                <span
                  className={cn(
                    "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold sm:inline-flex",
                    state.tone,
                  )}
                >
                  <StateIcon className="h-3.5 w-3.5" />
                  {state.label}
                </span>
                {!disabled ? (
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
                ) : null}
              </button>
            );
          })}

          {!filteredLessons.length ? (
            <div className="px-6 py-14 text-center text-sm text-muted-foreground">
              Không có buổi học nào trong nhóm này.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {lessons.length === 0 && isStaff ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardList className="h-4 w-4" />
          Bắt đầu bằng cách thêm buổi học đầu tiên.
        </p>
      ) : null}
    </div>
  );
}
