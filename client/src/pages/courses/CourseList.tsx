import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, BookOpen, ChevronLeft, ChevronRight, FlaskConical, Plus, Search } from "lucide-react";
import { stripCourseMetaMarkers } from "../../lib/courseExperience";
import { SkeletonCard } from "../../components/ui/skeletons";
import { ErrorState, EmptyState } from "../../components/ui/StateViews";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PageHeader } from "../../components/ui/page-header";
import { CourseStatusBadge } from "../../components/courses/CourseStatusBadge";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import { useConfirmContext } from "../../hooks/useConfirm";
import { useToast } from "../../hooks/useToast";
import api from "../../lib/api";
import { getCourseCoverUrl } from "../../lib/courseCovers";

const statusOptions = [
  { value: "current", label: "Đang mở" },
  { value: "draft", label: "Bản nháp" },
  { value: "archived", label: "Đã lưu trữ" },
  { value: "all", label: "Tất cả" },
];

export default function CourseList() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirmContext();
  const toast = useToast();
  const isTeacher = isStaff(user?.role);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("current");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  const { data, isLoading, isError, refetch } = useQuery<{ courses: any[]; total: number; totalPages: number }>({
    queryKey: ["courses", search, statusFilter, page],
    queryFn: () =>
      api
        .get("/courses", {
          params: {
            search: search || undefined,
            status: statusFilter,
            page,
            limit: PAGE_SIZE,
          },
        })
        .then((r) => {
          if (Array.isArray(r.data)) {
            return { courses: r.data, total: r.data.length, totalPages: 1 };
          }
          return {
            courses: Array.isArray(r.data?.courses) ? r.data.courses : [],
            total: typeof r.data?.total === "number" ? r.data.total : 0,
            totalPages: Math.max(1, r.data?.totalPages || 1),
          };
        }),
  });
  const courses = data?.courses || [];
  const totalPages = data?.totalPages || 1;

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/courses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses"] });
      toast.success({ title: "Đã lưu trữ", message: "Khóa học đã được ẩn khỏi danh sách đang dùng." });
    },
    onError: (err: any) => {
      toast.error({
        title: "Không lưu trữ được",
        message: err.response?.data?.error || "Vui lòng thử lại.",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/courses/${id}`, { status }),
    onSuccess: (_res, { status }) => {
      qc.invalidateQueries({ queryKey: ["courses"] });
      const label = status === "active" ? "Đã kích hoạt" : status === "draft" ? "Đã chuyển về nháp" : "Đã lưu trữ";
      toast.success({ title: label, message: status === "active" ? "Học sinh có thể thấy khóa học này." : "Khóa học đã được cập nhật trạng thái." });
    },
    onError: (err: any) => {
      toast.error({ title: "Không cập nhật được", message: err.response?.data?.error || "Vui lòng thử lại." });
    },
  });

  const createSessionCourse = useMutation({
    mutationFn: () =>
      api
        .post("/courses", {
          title: "Lập trình thi đấu nhập môn",
          description: "Khóa học theo buổi — giáo viên thêm từng buổi sau khi dạy, học sinh hoàn thành quiz để mở khóa buổi tiếp theo.",
          kind: "session",
          visibility: "private",
        })
        .then((r) => r.data),
    onSuccess: (course) => {
      qc.invalidateQueries({ queryKey: ["courses"] });
      toast.success({ title: "Đã tạo", message: "Khóa học lập trình thi đấu đã được tạo. Mở nó để thêm buổi học đầu tiên." });
      navigate(`/course/${course.id}`);
    },
    onError: (err: any) => {
      toast.error({ title: "Không tạo được", message: err.response?.data?.error || "Vui lòng thử lại." });
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard count={6} />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Không tải được danh sách khóa học"
        message="Đã có lỗi khi kết nối tới máy chủ. Vui lòng thử lại."
        onRetry={() => refetch()}
      />
    );
  }

  const filtered = courses;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Khóa học của tôi"
        actions={
          isTeacher ? (
            <>
              <Button variant="outline" size="sm" onClick={() => createSessionCourse.mutate()} disabled={createSessionCourse.isPending}>
                <FlaskConical className="size-3.5" /> Tạo khóa thi đấu
              </Button>
              <Button size="sm" onClick={() => navigate("/courses/new")}>
                <Plus className="size-3.5" /> Tạo khóa học
              </Button>
            </>
          ) : undefined
        }
      />

      {courses.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] max-w-xs flex-1" role="search">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="course-search" className="sr-only">
              Tìm kiếm khóa học
            </label>
            <Input
              id="course-search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm kiếm khóa học..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {statusOptions.map((option) => (
              <Button
                key={option.value}
                onClick={() => {
                  setStatusFilter(option.value);
                  setPage(1);
                }}
                variant={statusFilter === option.value ? "secondary" : "outline"}
                size="xs"
                className="h-7 rounded-full px-2.5 text-[11px]"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {!filtered.length ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="Không tìm thấy khóa học"
          text={courses.length ? "Thử thay đổi bộ lọc." : "Tạo khóa học đầu tiên để bắt đầu tổ chức lớp học."}
          action={!courses.length && isTeacher ? (
            <Button onClick={() => navigate("/courses/new")}><Plus className="h-4 w-4" /> 
              Tạo khóa học
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="stagger-in grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((course: any) => (
            <CourseCard
              key={course.id}
              course={course}
              canArchive={isTeacher}
              isArchiving={archiveMutation.isPending && archiveMutation.variables === course.id}
              isUpdatingStatus={statusMutation.isPending && statusMutation.variables?.id === course.id}
              onOpen={() => navigate(course.kind === "session" ? `/course/${course.id}` : `/courses/${course.id}`)}
              onArchive={async () => {
                const ok = await confirm({
                  title: "Lưu trữ khóa học",
                  message: "Khóa học sẽ được ẩn khỏi danh sách đang dùng. Dữ liệu học viên, bài học và bài nộp vẫn được giữ lại.",
                  variant: "danger",
                });
                if (ok) archiveMutation.mutate(course.id);
              }}
              onStatusChange={(status) => statusMutation.mutate({ id: course.id, status })}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> Trước
          </Button>
          <span className="text-sm text-muted-foreground">
            Trang {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Sau <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function CourseCard({
  course,
  canArchive,
  isArchiving,
  isUpdatingStatus,
  onOpen,
  onArchive,
  onStatusChange,
}: {
  course: any;
  canArchive: boolean;
  isArchiving: boolean;
  isUpdatingStatus: boolean;
  onOpen: () => void;
  onArchive: () => void;
  onStatusChange: (status: string) => void;
}) {
  const archived = course.status === "archived";
  const coverUrl = getCourseCoverUrl(course);
  const cleanDescription = stripCourseMetaMarkers(course.description);
  const fallbackGradients = [
    "from-slate-800 via-blue-950 to-slate-900",
    "from-slate-800 via-indigo-950 to-slate-900",
    "from-slate-800 via-emerald-950 to-slate-900",
    "from-slate-800 via-sky-950 to-slate-900",
  ];
  const gradIdx = Math.abs(String(course.title || "").split("").reduce((s, ch) => s + ch.charCodeAt(0), 0)) % fallbackGradients.length;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Mở khóa học ${course.title || ""}`}
      className="surface-interactive group cursor-pointer overflow-hidden rounded-xl border border-border bg-card shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="relative flex h-36 items-center justify-center overflow-hidden bg-secondary">
        {coverUrl ? (
          <>
            <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-black/25" />
          </>
        ) : (
          <div className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br ${fallbackGradients[gradIdx]} px-4 text-center text-white`}>
            <BookOpen className="size-7 text-white/35" />
            <span className="line-clamp-1 text-xs font-semibold tracking-wide text-white/85">{course.title}</span>
          </div>
        )}
        {!canArchive && (
          <div className="absolute left-3 top-3">
            <CourseStatusBadge status={course.status} onImage />
          </div>
        )}
        {canArchive && !archived ? (
          <Button
            onClick={(event) => {
              event.stopPropagation();
              onArchive();
            }}
            disabled={isArchiving}
            variant="ghost"
            size="icon-sm"
            className="absolute right-3 top-3 size-7 bg-card/85 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-card hover:text-destructive"
            title="Lưu trữ khóa học"
            aria-label="Lưu trữ khóa học"
          >
            <Archive className="size-3.5" />
          </Button>
        ) : null}
      </div>
      <div className="p-3.5">
        <h3 className="mb-0.5 line-clamp-1 text-sm font-semibold text-foreground">{course.title}</h3>
        <p className="mb-2.5 line-clamp-1 text-xs text-muted-foreground">
          {cleanDescription || "Chưa có mô tả"}
        </p>
        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
          <p className="truncate text-[11px] text-muted-foreground">bởi {course.owner?.fullName || "CodeClass"}</p>
          {canArchive ? (
            <select
              data-slot="course-status-select"
              aria-label={`Trạng thái khóa học ${course.title || ""}`}
              value={course.status || "draft"}
              disabled={isUpdatingStatus}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                event.stopPropagation();
                onStatusChange(event.target.value);
              }}
              className="h-6 max-w-[130px] rounded-md border border-border bg-card px-1.5 text-[11px] font-medium text-muted-foreground outline-none focus:border-ring disabled:opacity-60"
            >
              <option value="draft">Nháp</option>
              <option value="active">Đang hoạt động</option>
              <option value="archived">Lưu trữ</option>
            </select>
          ) : null}
        </div>
      </div>
    </div>
  );
}
