import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Download, FileText } from "lucide-react";
import api from "../../lib/api";
import { ArenaMarkdown } from "../../components/arena/ArenaMarkdown";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";

export default function SessionReadingPage() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["session-lesson", lessonId],
    queryFn: () => api.get(`/session-course/lesson/${lessonId}`).then((r) => r.data),
    enabled: !!lessonId,
  });

  if (isLoading || isError || !data) {
    return (
      <div className="mx-auto max-w-6xl py-16 text-center text-sm text-muted-foreground">
        {isLoading ? "Đang tải..." : "Không tải được bài đọc."}
      </div>
    );
  }

  const { lesson } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={() => navigate(`/course/${courseId}/lesson/${lessonId}`)}
      >
        <ArrowLeft className="h-4 w-4" /> Quay lại buổi học
      </Button>

      <Card>
        <CardContent className="p-4 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Buổi {String(lesson.orderIndex).padStart(2, "0")}
          </p>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {lesson.title}
          </h1>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
            <BookOpen className="h-4 w-4" /> Bài đọc và tài liệu tham khảo
          </p>

          <div className="mt-5 border-t border-border pt-5">
            <article className="min-w-0 text-[0.95rem] leading-7 text-foreground">
              {lesson.readingContent ? (
                <ArenaMarkdown
                  content={lesson.readingContent}
                  variant="document"
                  className="text-[0.95rem] leading-7 text-foreground"
                />
              ) : (
                <p className="text-muted-foreground">Chưa có bài đọc cho buổi này.</p>
              )}
            </article>

            {data.materials?.length > 0 ? (
              <section id="materials" className="mt-10 border-t border-border pt-6">
                <div className="flex items-center gap-2 text-foreground">
                  <FileText className="h-4 w-4" />
                  <h2 className="font-semibold">Tài liệu đính kèm</h2>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.materials.map((material: any) => (
                    <a
                      key={material.id}
                      href={material.storageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/50"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{material.name}</span>
                      <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
