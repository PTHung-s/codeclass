import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import ExamMarkdown from "../../components/ui/ExamMarkdown";
import { ArrowLeft, Check, RefreshCw, Sparkles, Trash2 } from "lucide-react";

export default function ExamTestcases() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeQ, setActiveQ] = useState<string | null>(null);
  const [log, setLog] = useState<string>("");

  const examQ = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => api.get(`/exams/${examId}`).then((r) => r.data),
    enabled: !!examId,
  });

  const coding = (examQ.data?.questions || []).filter((q: any) => q.loai === "thuc_hanh");
  const currentId = activeQ || coding[0]?.id;
  const current = coding.find((q: any) => q.id === currentId);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["exam", examId] });

  const genMut = useMutation({
    mutationFn: () => api.post(`/exams/${examId}/questions/${currentId}/generate-tests`).then((r) => r.data),
    onSuccess: (data) => {
      setLog(`Tạo ${data.created}/${data.inputs} case. Fail: ${(data.failures || []).join("; ") || "không"}`);
      invalidate();
    },
    onError: (err: any) => setLog(err?.response?.data?.error || "Sinh thất bại"),
  });

  const regenMut = useMutation({
    mutationFn: () => api.post(`/exams/${examId}/questions/${currentId}/regenerate-tests`).then((r) => r.data),
    onSuccess: (data) => {
      setLog(`Sinh lại: ${data.created} case`);
      invalidate();
    },
    onError: (err: any) => setLog(err?.response?.data?.error || "Sinh lại thất bại"),
  });

  const approveMut = useMutation({
    mutationFn: () => api.post(`/exams/${examId}/questions/${currentId}/testcases/approve`, {}).then((r) => r.data),
    onSuccess: (data) => {
      setLog(`Đã duyệt ${data.approved} testcase`);
      invalidate();
    },
  });

  const preflightMut = useMutation({
    mutationFn: () => api.post(`/exams/${examId}/questions/${currentId}/preflight`).then((r) => r.data),
    onSuccess: (data) => {
      setLog(
        data.ok
          ? `Preflight OK — solution pass ${data.passed}/${data.total} sample`
          : `Preflight FAIL — ${data.passed}/${data.total}. ${(data.failures || []).map((f: any) => `#${f.testNum}: ${f.error}`).join("; ")}`,
      );
    },
    onError: (err: any) => setLog(err?.response?.data?.error || "Preflight thất bại"),
  });

  const patchMut = useMutation({
    mutationFn: (testcases: any[]) =>
      api.patch(`/exams/${examId}/questions/${currentId}/testcases`, { testcases }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  if (examQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">Đang tải…</div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={() => navigate(`/exams/${examId}/edit`)}>
        <ArrowLeft className="h-4 w-4" /> Về soạn đề
      </Button>
      <h1 className="text-2xl font-semibold">Testcase thực hành</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        LLM sinh generator → runner tạo input → chạy code đáp án lấy output. Duyệt trước khi mở đề.
      </p>

      {coding.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">Đề không có câu thực hành.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {coding.map((q: any) => (
          <button
            key={q.id}
            type="button"
            onClick={() => setActiveQ(q.id)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              currentId === q.id ? "border-primary bg-primary/10 font-medium" : "border-border bg-card"
            }`}
          >
            {q.ma_cau} · {q.ngon_ngu}
          </button>
        ))}
      </div>

      {current && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">{current.ma_cau}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 uppercase">{current.ngon_ngu}</span>
              <span>{current.diem} điểm</span>
              <span>độ khó {current.do_kho}</span>
            </div>
            <div className="mt-2">
              <ExamMarkdown content={current.stem} compact />
            </div>
            {current.rang_buoc && (
              <p className="mt-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200">
                <span className="font-semibold uppercase tracking-wide">Giới hạn: </span>
                {current.rang_buoc}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => preflightMut.mutate()} disabled={preflightMut.isPending}>
                {preflightMut.isPending ? "Đang kiểm…" : "Kiểm tra đáp án (sample)"}
              </Button>
              <Button size="sm" onClick={() => genMut.mutate()} disabled={genMut.isPending}>
                <Sparkles className="h-4 w-4" /> {genMut.isPending ? "Đang sinh…" : "Sinh testcase"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => regenMut.mutate()} disabled={regenMut.isPending}>
                <RefreshCw className="h-4 w-4" /> Sinh lại (xóa pending)
              </Button>
              <Button size="sm" variant="secondary" onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
                <Check className="h-4 w-4" /> Duyệt tất cả đang chờ
              </Button>
            </div>
            {log && <p className="mt-2 text-xs text-muted-foreground">{log}</p>}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Sample (HS thấy)</h3>
            <div className="space-y-2">
              {(current.testcase_mau || []).map((t: any, i: number) => (
                <pre key={t.id || i} className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-2 text-xs">
                  <span className="text-muted-foreground">#{i + 1} input</span>
                  {"\n"}{t.input}
                  <span className="text-muted-foreground">output</span>
                  {"\n"}{t.output}
                </pre>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Hidden ({(current.testCases || current.testcase_an || []).filter((t: any) => t.kind === "an" || !t.kind).length})</h3>
            <div className="space-y-3">
              {(current.testCases || [])
                .filter((t: any) => t.kind === "an")
                .map((t: any) => (
                  <div key={t.id} className="rounded-xl border border-border bg-card p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono">#{t.thu_tu}</span>
                      <span>mức {t.muc_do}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5">{t.status}</span>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => patchMut.mutate([{ id: t.id, status: "da_duyet" }])}
                      >
                        Duyệt
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => patchMut.mutate([{ id: t.id, status: "loai_bo" }])}
                      >
                        <Trash2 className="h-3 w-3" /> Loại
                      </Button>
                    </div>
                    <label className="block text-[11px] text-muted-foreground">Input
                      <textarea
                        className="mt-0.5 h-16 w-full rounded border border-border bg-background p-2 font-mono text-xs"
                        defaultValue={t.input}
                        onBlur={(e) => {
                          if (e.target.value !== t.input) {
                            patchMut.mutate([{ id: t.id, input: e.target.value }]);
                          }
                        }}
                      />
                    </label>
                    <label className="mt-2 block text-[11px] text-muted-foreground">Output
                      <textarea
                        className="mt-0.5 h-16 w-full rounded border border-border bg-background p-2 font-mono text-xs"
                        defaultValue={t.output}
                        onBlur={(e) => {
                          if (e.target.value !== t.output) {
                            patchMut.mutate([{ id: t.id, output: e.target.value }]);
                          }
                        }}
                      />
                    </label>
                  </div>
                ))}
              {(current.testCases || []).filter((t: any) => t.kind === "an").length === 0 && (
                <p className="text-sm text-muted-foreground">Chưa có hidden test — bấm Sinh testcase.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
