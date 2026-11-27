import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, FileJson, Loader2, PackagePlus, Upload } from "lucide-react";
import api from "../../lib/api";
import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";
import { Badge } from "./badge";

interface BuiltInPackSummary {
  packId: string;
  title: string;
  tier: string;
  description: string;
  problemCount: number;
  alreadyImportedCount: number;
  difficulties: { easy: number; medium: number; hard: number };
  tags: string[];
}

interface ImportResponse {
  ok: boolean;
  summary: { total: number; created: number; updated: number; skipped: number };
  results: Array<{ packId: string; title: string; created: number; updated: number; skipped: number; errors: string[] }>;
}

export default function ProblemPackImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"builtin" | "upload">("builtin");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"skip" | "upsert">("skip");
  const [uploadedPack, setUploadedPack] = useState<{ name: string; data: any } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const packsQuery = useQuery<{ packs: BuiltInPackSummary[] }>({
    queryKey: ["problem-packs"],
    queryFn: () => api.get("/problems/packs").then((r) => r.data),
    enabled: open,
  });

  const packs = packsQuery.data?.packs || [];

  const importMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<ImportResponse>("/problems/import-pack", payload).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["problems"] });
      qc.invalidateQueries({ queryKey: ["problem-packs"] });
    },
  });

  const toggleId = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = () => setSelectedIds(packs.map((p) => p.packId));
  const clearAll = () => setSelectedIds([]);

  const handleFileChange = async (file?: File | null) => {
    setParseError(null);
    setResult(null);
    if (!file) {
      setUploadedPack(null);
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed?.problems) || parsed.problems.length === 0) {
        setParseError("File JSON phải có mảng `problems` không rỗng.");
        setUploadedPack(null);
        return;
      }
      setUploadedPack({ name: file.name, data: parsed });
    } catch {
      setParseError("Không đọc được file JSON. Vui lòng kiểm tra cú pháp JSON.");
      setUploadedPack(null);
    }
  };

  const handleImportBuiltIn = () => {
    if (!selectedIds.length) return;
    setResult(null);
    importMut.mutate({ packIds: selectedIds, mode, publish: true });
  };

  const handleImportFile = () => {
    if (!uploadedPack) return;
    setResult(null);
    importMut.mutate({ pack: uploadedPack.data, mode, publish: true });
  };

  const totalSelectedProblems = packs
    .filter((p) => selectedIds.includes(p.packId))
    .reduce((sum, p) => sum + p.problemCount, 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setResult(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <PackagePlus className="h-4 w-4 text-primary" />
            Import kho đề Lập trình Thi đấu
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex items-center justify-between gap-2 border-b pb-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                setTab("builtin");
                setResult(null);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === "builtin"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              Kho đề có sẵn ({packs.length} gói)
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("upload");
                setResult(null);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === "upload"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Upload className="h-3.5 w-3.5" />
              Tải lên JSON
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">Khi trùng tên:</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "skip" | "upsert")}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              <option value="skip">Bỏ qua bài đã có</option>
              <option value="upsert">Cập nhật đề &amp; test mới</option>
            </select>
          </div>
        </div>

        {tab === "builtin" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Mỗi bài gồm đề Markdown/KaTeX, 15–18 test phân tầng đã kiểm chứng, gợi ý 3 mức, lời giải C++17 &amp; Python 3 và gắn sẵn Skill Graph.
              </span>
              <div className="flex shrink-0 gap-1.5">
                <Button type="button" variant="ghost" size="xs" onClick={selectAll}>
                  Chọn tất cả
                </Button>
                <Button type="button" variant="ghost" size="xs" onClick={clearAll}>
                  Bỏ chọn
                </Button>
              </div>
            </div>

            {packsQuery.isLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tải danh sách gói đề...
              </div>
            ) : packs.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Chưa có gói đề built-in nào trong <code>server/data/cp-packs</code>.
              </div>
            ) : (
              <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                {packs.map((pack) => {
                  const checked = selectedIds.includes(pack.packId);
                  const allDone = pack.alreadyImportedCount >= pack.problemCount && pack.problemCount > 0;
                  return (
                    <button
                      key={pack.packId}
                      type="button"
                      onClick={() => toggleId(pack.packId)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                        checked
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border bg-card hover:bg-muted/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40",
                        )}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px]">
                            {pack.tier}
                          </Badge>
                          <span className="text-xs font-semibold text-foreground">{pack.title}</span>
                          <span className="ml-auto text-[11px] font-medium tabular-nums text-muted-foreground">
                            {pack.problemCount} bài ({pack.difficulties.easy}D · {pack.difficulties.medium}TB · {pack.difficulties.hard}K)
                          </span>
                        </div>
                        {pack.description && (
                          <p className="mt-1 text-[11px] text-muted-foreground">{pack.description}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {pack.alreadyImportedCount > 0 && (
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10px]",
                                allDone
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                  : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                              )}
                            >
                              Đã có {pack.alreadyImportedCount}/{pack.problemCount} bài
                            </Badge>
                          )}
                          {pack.tags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t pt-3">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Đóng
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!selectedIds.length || importMut.isPending}
                onClick={handleImportBuiltIn}
              >
                {importMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PackagePlus className="h-3.5 w-3.5" />
                )}
                Import {selectedIds.length ? `${selectedIds.length} gói (${totalSelectedProblems} bài)` : "gói đã chọn"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
              <FileJson className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-xs font-medium">Chọn file gói đề chuẩn JSON của CodeClass</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Cấu trúc: <code>{`{ "packId", "title", "problems": [{ "title", "statement", "difficulty", "testCases": [...] }] }`}</code>
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => void handleFileChange(e.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" /> Chọn file .json
              </Button>
              {uploadedPack && (
                <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Đã chọn: {uploadedPack.name} ({uploadedPack.data.problems.length} bài)
                </p>
              )}
              {parseError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{parseError}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-3">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Đóng
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!uploadedPack || importMut.isPending}
                onClick={handleImportFile}
              >
                {importMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Import file JSON
              </Button>
            </div>
          </div>
        )}

        {importMut.isError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            {(importMut.error as any)?.response?.data?.error || "Import thất bại"}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Import hoàn tất: thêm mới {result.summary.created} bài · cập nhật {result.summary.updated} bài · bỏ qua {result.summary.skipped} bài trùng
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
