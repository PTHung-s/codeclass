import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lightbulb, ExternalLink, ShieldAlert } from "lucide-react";
import { cn } from "../../lib/utils";
import api from "../../lib/api";
import type { Recommendation } from "../../lib/api";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

export function RecommendationBanner({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const active = recommendations.filter((r) => !dismissed.has(r.id));
  if (active.length === 0) return null;

  const handleDismiss = async (id: string) => {
    try {
      await api.post(`/skills/recommendations/${id}/dismiss`);
    } catch {
      // best-effort
    }
    setDismissed((prev) => new Set(prev).add(id));
  };

  return (
    <div className="space-y-2">
      {active.map((rec) => (
        <motion.div
          key={rec.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className={cn(
            "relative flex flex-col gap-2 rounded-xl border p-4 shadow-sm",
            rec.mandatory
              ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
              : "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20",
          )}
        >
          <button
            onClick={() => handleDismiss(rec.id)}
            className="absolute right-3 top-3 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Ẩn đề xuất"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            {rec.mandatory ? (
              <ShieldAlert className="h-5 w-5 text-red-500" />
            ) : (
              <Lightbulb className="h-5 w-5 text-amber-500" />
            )}
            <h4 className="text-sm font-bold">{rec.title}</h4>
            <Badge variant="outline" className="text-[10px]">
              {rec.ruleId}
            </Badge>
            {rec.detailLevel && (
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px]",
                  rec.detailLevel === "nang"
                    ? "bg-red-100 text-red-700"
                    : rec.detailLevel === "vua"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-blue-100 text-blue-700",
                )}
              >
                {rec.detailLevel === "nang" ? "Nặng" : rec.detailLevel === "vua" ? "Vừa" : "Nhẹ"}
              </Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground">{rec.reason}</p>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Độ tin cậy: {Math.round(rec.confidence * 100)}%</span>
            <span>·</span>
            <span className="truncate">{rec.evidence}</span>
          </div>

          {rec.lessonId && (
            <a
              href={`/lessons/${rec.lessonId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-muted transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Học ngay
            </a>
          )}
        </motion.div>
      ))}
    </div>
  );
}
