import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import api from "../../lib/api";
import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { Badge } from "./badge";
import { Button } from "./button";

interface PlagiarismStudent {
  id: string;
  name: string;
  nickname?: string | null;
  score?: number | null;
  code: string;
  language: string;
}

interface PlagiarismPair {
  studentA: PlagiarismStudent;
  studentB: PlagiarismStudent;
  similarity: number;
  jaccard: number;
  containment: number;
  sharedFingerprints: number;
  tokenCountA: number;
  tokenCountB: number;
  questionId?: string;
  questionLabel?: string;
}

interface PlagiarismResponse {
  scannedStudents: number;
  scannedQuestions?: number;
  threshold: number;
  pairs: PlagiarismPair[];
}

export default function PlagiarismDialog({
  open,
  onClose,
  endpoint,
  title,
}: {
  open: boolean;
  onClose: () => void;
  endpoint: string;
  title: string;
}) {
  const [thresholdPct, setThresholdPct] = useState(72);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const query = useQuery<PlagiarismResponse>({
    queryKey: ["plagiarism-scan", endpoint, thresholdPct],
    queryFn: () =>
      api.get(endpoint, { params: { threshold: thresholdPct / 100 } }).then((r) => r.data),
    enabled: open && Boolean(endpoint),
  });

  const pairs = query.data?.pairs || [];
  const activePair = pairs[selectedIdx] || pairs[0] || null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-medium text-foreground">
                Ngưỡng nghi ngờ: <strong className="tabular-nums text-primary">{thresholdPct}%</strong>
              </span>
              <input
                type="range"
                min={55}
                max={95}
                step={5}
                value={thresholdPct}
                onChange={(e) => {
                  setSelectedIdx(0);
                  setThresholdPct(Number(e.target.value));
                }}
                className="w-36 accent-primary"
              />
            </div>
            {query.data && (
              <span className="text-muted-foreground tabular-nums">
                Đã quét <strong>{query.data.scannedStudents}</strong> học sinh · Phát hiện{" "}
                <strong className={pairs.length ? "text-rose-600 dark:text-rose-400" : "text-emerald-600"}>
                  {pairs.length}
                </strong>{" "}
                cặp tương đồng cấu trúc
              </span>
            )}
          </div>

          {query.isLoading ? (
            <div className="flex items-center justify-center py-14 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang chuẩn hóa AST/token &amp; quét vân tay Winnowing...
            </div>
          ) : query.isError ? (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-700 dark:text-rose-300">
              Không quét được tương đồng code. Vui lòng thử lại.
            </div>
          ) : pairs.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-9 w-9 text-emerald-500" />
              <p className="text-sm font-medium text-foreground">Không phát hiện cặp bài giống nhau vượt {thresholdPct}%</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Thuật toán đã tự động bỏ qua chú thích, khoảng trắng và đổi tên biến trước khi so sánh.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
              {/* Pair list */}
              <div className="max-h-[56vh] space-y-1.5 overflow-y-auto pr-1">
                {pairs.map((p, i) => {
                  const pct = Math.round(p.similarity * 100);
                  const severe = pct >= 90;
                  const active = (activePair === p);
                  return (
                    <button
                      key={`${p.questionId || "p"}-${p.studentA.id}-${p.studentB.id}-${i}`}
                      type="button"
                      onClick={() => setSelectedIdx(i)}
                      className={cn(
                        "w-full rounded-lg border p-2.5 text-left text-xs transition-colors",
                        active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card hover:bg-muted/40",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] font-bold tabular-nums",
                            severe
                              ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                          )}
                        >
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          {pct}% giống
                        </Badge>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {p.sharedFingerprints} cụm khớp
                        </span>
                      </div>
                      {p.questionLabel && (
                        <p className="mt-1 truncate text-[10px] font-medium text-primary">
                          {p.questionLabel}
                        </p>
                      )}
                      <p className="mt-1 truncate font-semibold text-foreground">
                        {p.studentA.name} ↔ {p.studentB.name}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Side-by-side comparison */}
              {activePair && (
                <div className="space-y-2 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      Jaccard: <strong>{Math.round(activePair.jaccard * 100)}%</strong> · Containment:{" "}
                      <strong>{Math.round(activePair.containment * 100)}%</strong>
                    </span>
                    <span>
                      {activePair.tokenCountA} vs {activePair.tokenCountB} tokens chuẩn hóa
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {[activePair.studentA, activePair.studentB].map((st, idx) => (
                      <div key={`${st.id}-${idx}`} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-200">
                          <span className="truncate font-semibold">{st.name}</span>
                          <span className="shrink-0 text-[10px] uppercase text-slate-400">
                            {st.language} {st.score != null ? `· ${st.score}đ` : ""}
                          </span>
                        </div>
                        <pre className="max-h-[48vh] overflow-auto p-3 font-mono text-[11px] leading-relaxed text-slate-100">
                          {st.code}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end border-t pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
