import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Code2,
  FileText,
  HelpCircle,
  Play,
  Lock,
} from "lucide-react";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/utils";

function LessonItem({
  title,
  description,
  icon,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex w-full items-center gap-4 rounded-xl border border-border px-4 py-4 text-left transition",
        disabled
          ? "cursor-not-allowed bg-muted/40 text-muted-foreground"
          : "bg-card text-foreground hover:bg-muted/50",
      )}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-muted text-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
      </span>
      {disabled ? (
        <Lock className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
      )}
    </button>
  );
}

function VideoPreview({ src, title, onClick }: { src: string; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group w-full overflow-hidden rounded-xl border border-border bg-foreground text-left shadow-sm transition"
      aria-label={`Xem video: ${title}`}
    >
      <div className="relative aspect-video overflow-hidden">
        <video
          src={src}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-100"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
        <span className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-white/40 bg-black/50 text-white">
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        </span>
        <span className="absolute inset-x-4 bottom-4">
          <span className="block font-semibold text-white">Video bài giảng</span>
          <span className="mt-1 block text-sm text-white/80">Xem lại bản ghi của buổi học</span>
        </span>
      </div>
    </button>
  );
}

export default function SessionLessonHomePage() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["session-lesson", lessonId],
    queryFn: () => api.get(`/session-course/lesson/${lessonId}`).then((response) => response.data),
    enabled: !!lessonId,
  });

  if (isLoading || isError || !data) {
    return (
      <div className="mx-auto max-w-5xl py-16 text-center text-sm text-muted-foreground">
        {isLoading ? (
          "Đang tải buổi học..."
        ) : (
          <>
            Không tải được buổi học.{" "}
            <button
              className="font-semibold text-primary hover:underline"
              onClick={() => navigate(`/course/${courseId}`)}
            >
              Quay lại khóa học
            </button>
          </>
        )}
      </div>
    );
  }

  const { lesson, quiz } = data;
  const go = (suffix: string) => navigate(`/course/${courseId}/lesson/${lessonId}${suffix}`);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={() => navigate(`/course/${courseId}`)}
      >
        <ArrowLeft className="h-4 w-4" />
        Tất cả buổi học
      </Button>

      <Card>
        <CardContent className="p-6 md:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Buổi {String(lesson.orderIndex).padStart(2, "0")}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {lesson.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge className="border border-primary/20 bg-primary/10 text-primary">
              <BookOpen className="mr-1 h-3.5 w-3.5" />
              Nội dung buổi học
            </Badge>
            {lesson.quizCompleted ? (
              <Badge className="border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Đã đạt quiz · {lesson.quizScore ?? 0} điểm
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">Nội dung học tập</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Hoàn thành quiz để mở khóa buổi học tiếp theo.
          </p>
        </div>
        <div
          className={cn(
            "grid gap-0 divide-y divide-border",
            lesson.video ? "md:grid-cols-2 md:divide-x md:divide-y-0" : "",
          )}
        >
          {lesson.video ? (
            <div className="p-4">
              <VideoPreview src={lesson.video.url} title={lesson.title} onClick={() => go("/video")} />
            </div>
          ) : null}
          <div className="space-y-3 p-4">
            {lesson.readingContent ? (
              <LessonItem
                title="Bài đọc"
                description="Nội dung tóm tắt và ghi chú"
                icon={<BookOpen className="h-4 w-4" />}
                onClick={() => go("/reading")}
              />
            ) : null}
            {data.codeFiles.length > 0 ? (
              <LessonItem
                title="Mã nguồn"
                description={`${data.codeFiles.length} file dùng trong buổi học`}
                icon={<Code2 className="h-4 w-4" />}
                onClick={() => go("/code")}
              />
            ) : null}
            {data.materials.length > 0 ? (
              <LessonItem
                title="Tài liệu đính kèm"
                description={`${data.materials.length} tài liệu để tải về`}
                icon={<FileText className="h-4 w-4" />}
                onClick={() => go("/reading#materials")}
              />
            ) : null}
            {quiz ? (
              <LessonItem
                title="Bài kiểm tra"
                description={`${quiz.questionCount} câu hỏi · bắt buộc hoàn thành`}
                icon={<HelpCircle className="h-4 w-4" />}
                onClick={() => go("/quiz")}
              />
            ) : (
              <LessonItem
                title="Bài kiểm tra"
                description="Giáo viên chưa soạn quiz"
                icon={<HelpCircle className="h-4 w-4" />}
                onClick={() => {}}
                disabled
              />
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
