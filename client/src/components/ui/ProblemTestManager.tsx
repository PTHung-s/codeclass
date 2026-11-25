import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, Plus, Save, Trash2 } from "lucide-react";
import api from "../../lib/api";
import { useToast } from "../../hooks/useToast";

interface TestRow {
  input: string;
  output: string;
  hidden: boolean;
}

export default function ProblemTestManager({ problemId }: { problemId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [rows, setRows] = useState<TestRow[]>([]);
  const [dirty, setDirty] = useState(false);

  const testsQuery = useQuery({
    queryKey: ["problemTests", problemId],
    queryFn: () => api.get(`/problems/${problemId}/tests`).then((r) => r.data as TestRow[]),
  });

  useEffect(() => {
    if (testsQuery.data && !dirty) {
      setRows(testsQuery.data.map((t) => ({ input: t.input || "", output: t.output || "", hidden: !!t.hidden })));
    }
  }, [testsQuery.data, dirty]);

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/problems/${problemId}/tests`, { tests: rows }).then((r) => r.data),
    onSuccess: (data: { count: number }) => {
      qc.invalidateQueries({ queryKey: ["problemTests", problemId] });
      qc.invalidateQueries({ queryKey: ["problem", problemId] });
      setDirty(false);
      toast.success({ title: "Đã lưu bộ test", message: `${data.count} test được cập nhật.` });
    },
    onError: (err: any) => {
      toast.error({ title: "Không lưu được", message: err.response?.data?.error || "Vui lòng thử lại." });
    },
  });

  const updateRow = (index: number, patch: Partial<TestRow>) => {
    setDirty(true);
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    setDirty(true);
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setDirty(true);
    setRows((prev) => [...prev, { input: "", output: "", hidden: true }]);
  };

  if (testsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải bộ test...
      </div>
    );
  }

  if (testsQuery.isError) {
    return <div className="py-10 text-center text-sm text-destructive">Không tải được bộ test. Vui lòng thử lại.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Bộ test của đề ({rows.length} test)</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Hai test đầu không ẩn đóng vai trò ví dụ hiển thị cho học sinh. Test còn lại nên ẩn.
          Output sẽ được tự cắt khoảng trắng thừa ở cuối.
        </p>
      </div>

      {rows.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">Chưa có test nào. Bấm "Thêm test" để bắt đầu.</div>
      )}

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className={`rounded-xl border p-3 ${row.hidden ? "border-border bg-card" : "border-emerald-500/40 bg-emerald-500/[0.04]"}`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={!row.hidden}
                  onChange={(e) => updateRow(index, { hidden: !e.target.checked })}
                  className="h-3.5 w-3.5 accent-emerald-600"
                />
                {row.hidden ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground"><EyeOff className="h-3 w-3" /> Test ẩn</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Eye className="h-3 w-3" /> Hiển thị cho học sinh</span>
                )}
              </label>
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" /> Xóa
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Input</span>
                <textarea
                  value={row.input}
                  onChange={(e) => updateRow(index, { input: e.target.value })}
                  rows={4}
                  spellCheck={false}
                  className="w-full resize-y rounded-lg border border-input bg-card px-2.5 py-1.5 font-mono text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Output mong đợi</span>
                <textarea
                  value={row.output}
                  onChange={(e) => updateRow(index, { output: e.target.value })}
                  rows={4}
                  spellCheck={false}
                  className="w-full resize-y rounded-lg border border-input bg-card px-2.5 py-1.5 font-mono text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/60"
        >
          <Plus className="h-4 w-4" /> Thêm test
        </button>
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saveMutation.isPending ? "Đang lưu..." : "Lưu bộ test"}
        </button>
        {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Có thay đổi chưa lưu</span>}
      </div>
    </div>
  );
}
