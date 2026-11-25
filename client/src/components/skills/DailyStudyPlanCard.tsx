import { useEffect, useState } from "react";
import { BrainCircuit, Check, CheckCircle2, Clock3, Loader2, Play } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import type { DailyStudyPlan } from "../../lib/api";
import { Button, buttonVariants } from "../ui/button";
import { cn } from "../../lib/utils";

export function DailyStudyPlanCard({ compact = false }: { compact?: boolean }) {
  const [plan, setPlan] = useState<DailyStudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .post<DailyStudyPlan>("/skills/daily-plan/today")
      .then((response) => {
        if (active) setPlan(response.data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const completeItem = async (itemId: string) => {
    setCompletingId(itemId);
    try {
      const response = await api.post<DailyStudyPlan>(
        `/skills/daily-plan/items/${itemId}/complete`,
      );
      setPlan(response.data);
    } finally {
      setCompletingId(null);
    }
  };

  if (loading) {
    return (
      <div className={cn("flex items-center gap-3 text-sm text-muted-foreground", compact ? "border-t pt-4" : "rounded-xl border p-5")}>
          <Loader2 className="size-4 animate-spin" /> Đang chuẩn bị kế hoạch ôn hôm nay...
      </div>
    );
  }

  if (!plan) return null;

  const completedCount = plan.items.filter((item) => item.status === "completed").length;
  const progress = plan.items.length > 0 ? (completedCount / plan.items.length) * 100 : 0;

  return (
    <section className={cn(!compact && "overflow-hidden rounded-xl border border-blue-200/80 dark:border-blue-900/60")}>
      {!compact && <div className="h-1 bg-blue-600" />}
      <div className={cn("space-y-4", compact ? "border-t pt-4" : "p-5")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-100 p-2.5 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
              <BrainCircuit className="size-5" />
            </div>
            <div>
              <h2 className="font-bold text-foreground">Ôn tập thông minh hôm nay</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Chỉ chọn kiến thức em đã học nhưng còn chưa vững.
              </p>
            </div>
          </div>
          {plan.items.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              <Clock3 className="size-3.5" /> {plan.estimatedMinutes} phút
            </div>
          )}
        </div>

        {plan.status === "empty" || plan.items.length === 0 ? (
          <div className="rounded-xl bg-emerald-50 p-4 text-sm dark:bg-emerald-950/20">
            <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4" /> Hôm nay chưa có kỹ năng đã học nào cần ôn thêm.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Kế hoạch sẽ xuất hiện khi có đủ kết quả quiz hoặc bài luyện tập đã được gắn skill.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {plan.items.map((item, index) => {
                const done = item.status === "completed";
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center",
                      done && "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20",
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        done ? "bg-emerald-500 text-white" : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
                      )}
                    >
                      {done ? <Check className="size-4" /> : index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-semibold", done && "line-through opacity-70")}>{item.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.reason}</p>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground/80">{item.evidence}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!done && (
                        <Link
                          to={item.actionUrl}
                          className={buttonVariants({ size: "sm", className: "h-8 gap-1.5 text-xs" })}
                        >
                          <Play className="size-3.5" /> Bắt đầu
                        </Link>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant={done ? "secondary" : "outline"}
                        className="h-8 text-xs"
                        disabled={done || completingId === item.id}
                        onClick={() => completeItem(item.id)}
                      >
                        {completingId === item.id ? <Loader2 className="size-3.5 animate-spin" /> : done ? "Đã xong" : "Đánh dấu xong"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                <span>Tiến độ hôm nay</span>
                <span>{completedCount}/{plan.items.length}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
