import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Code2, Copy, Download, Eye, FileCode2, FileText, Check } from "lucide-react";
import { useState } from "react";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { cn } from "../../lib/utils";

function Action({
  icon,
  text,
  onClick,
}: {
  icon: React.ReactNode;
  text: string;
  onClick?: () => void;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="gap-1.5">
      {icon} {text}
    </Button>
  );
}

export default function SessionCodePage() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["session-lesson", lessonId],
    queryFn: () => api.get(`/session-course/lesson/${lessonId}`).then((r) => r.data),
    enabled: !!lessonId,
  });

  if (isLoading || isError || !data) {
    return (
      <div className="mx-auto max-w-6xl py-16 text-center text-sm text-muted-foreground">
        Đang tải...
      </div>
    );
  }

  const { lesson, codeFiles, materials } = data;
  const file = codeFiles[Math.min(active, Math.max(0, codeFiles.length - 1))];

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const downloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <CardContent className="p-6 md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Buổi {String(lesson.orderIndex).padStart(2, "0")}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {lesson.title}
          </h1>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Code2 className="h-4 w-4" />
            Xem, sao chép và tải mã nguồn của buổi học
          </p>

          <div
            className={cn(
              "mt-7 grid gap-6 border-t border-border pt-7",
              codeFiles.length ? "lg:grid-cols-[320px_minmax(0,1fr)]" : "",
            )}
          >
            {codeFiles.length > 0 ? (
              <div>
                <h2 className="text-lg font-semibold text-foreground">Danh sách file code</h2>
                <div className="mt-4 space-y-3">
                  {codeFiles.map((f: any, i: number) => (
                    <div
                      key={f.id}
                      className={cn(
                        "rounded-xl border border-border p-4",
                        i === active ? "bg-muted/60" : "bg-card",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "rounded-lg p-2",
                            i === active
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground",
                          )}
                        >
                          <FileCode2 className="h-5 w-5" />
                        </div>
                        <button
                          className={cn(
                            "font-semibold text-left",
                            i === active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                          )}
                          onClick={() => setActive(i)}
                        >
                          {f.filename}
                        </button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Action icon={<Eye className="h-4 w-4" />} text="Xem" onClick={() => setActive(i)} />
                        <Action
                          icon={
                            copied === f.id ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )
                          }
                          text={copied === f.id ? "Đã chép" : "Copy"}
                          onClick={() => copyText(f.id, f.content)}
                        />
                        <Action
                          icon={<Download className="h-4 w-4" />}
                          text="Download"
                          onClick={() => downloadText(f.filename, f.content)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">
                  {file ? file.filename : "Nội dung file"}
                </h2>
                {file ? (
                  <div className="flex gap-2">
                    <Action
                      icon={
                        copied === file.id ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )
                      }
                      text={copied === file.id ? "Đã chép" : "Copy code"}
                      onClick={() => copyText(file.id, file.content)}
                    />
                    <Action
                      icon={<Download className="h-4 w-4" />}
                      text="Download file"
                      onClick={() => downloadText(file.filename, file.content)}
                    />
                  </div>
                ) : null}
              </div>
              {file ? (
                <pre className="mt-3 max-h-[70vh] overflow-auto rounded-xl border border-border bg-foreground p-5 font-mono text-sm leading-6 text-background">
                  {file.content}
                </pre>
              ) : (
                <p className="mt-3 text-muted-foreground">Buổi này chưa có file code.</p>
              )}
            </div>
          </div>

          {materials.length > 0 ? (
            <div className="mt-6 border-t border-border pt-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <FileText className="h-5 w-5" />
                Tài liệu đính kèm
              </h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {materials.map((m: any) => (
                  <a
                    key={m.id}
                    href={m.storageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-foreground transition hover:bg-muted/50"
                  >
                    <div className="rounded-lg bg-muted p-2 text-muted-foreground">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{m.name}</div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Download className="h-3.5 w-3.5" />
                        Tải xuống
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
