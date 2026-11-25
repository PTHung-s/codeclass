import { Heart, Maximize, AlertTriangle, HeartCrack, Timer } from "lucide-react";

/** Heart display: filled = ❤️, empty = 🖤 */
export function Hearts({ hearts, maxHearts }: { hearts: number; maxHearts: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: maxHearts }).map((_, i) => (
        <Heart
          key={i}
          className={`h-4 w-4 transition-all duration-300 ${i < hearts ? "fill-red-500 text-red-500" : "fill-muted-foreground/25 text-muted-foreground/40"}`}
        />
      ))}
    </span>
  );
}

/** Fullscreen prompt modal — strictly mandatory, no bypass */
export function FullscreenModal({ onEnter }: { onEnter: () => void; onBypass?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-2xl dark:bg-card">
        <Maximize className="mx-auto h-12 w-12 text-primary animate-pulse" />
        <h2 className="mt-4 text-lg font-bold text-foreground dark:text-foreground">Bắt buộc toàn màn hình</h2>
        <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground">
          Bài kiểm tra yêu cầu chế độ toàn màn hình để chống gian lận (không được chia đôi màn hình hoặc mở cửa sổ khác).
        </p>
        <button
          onClick={onEnter}
          className="mt-5 w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 transition active:scale-95"
        >
          <Maximize className="inline h-4 w-4 mr-1.5" />
          Vào toàn màn hình để làm bài
        </button>
      </div>
    </div>
  );
}

/** Violation toast — shows briefly then fades */
export function ViolationToast({ reason }: { reason: string }) {
  return (
    <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 animate-slide-down rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 shadow-lg dark:border-red-900/50 dark:bg-red-950/50">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500 animate-bounce" />
        <span className="text-sm font-semibold text-red-700 dark:text-red-400">
          {reason} — <span className="text-red-500">-1 ❤️</span>
        </span>
      </div>
    </div>
  );
}

/** Away countdown banner — warns student when they are out of the test window */
export function AwayCountdownToast({ seconds }: { seconds: number }) {
  return (
    <div className="fixed top-16 left-1/2 z-50 -translate-x-1/2 animate-pulse rounded-xl border border-amber-300 bg-amber-500 px-4 py-2.5 text-white shadow-xl">
      <div className="flex items-center gap-2">
        <Timer className="h-5 w-5 animate-spin" />
        <span className="text-sm font-bold">
          Quay lại bài làm ngay! Trừ tiếp 1 ❤️ sau: <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-base">{seconds}s</span>
        </span>
      </div>
    </div>
  );
}

/** Game over modal — shown when all hearts are lost */
export function GameOverModal({ onExit, mode = "abandon" }: { onExit: () => void; mode?: "submit" | "abandon" }) {
  const isSubmit = mode === "submit";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-2xl dark:bg-card animate-scale-in">
        <HeartCrack className="mx-auto h-14 w-14 text-red-500" />
        <h2 className="mt-4 text-xl font-extrabold text-foreground dark:text-foreground">Hết máu!</h2>
        <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground leading-relaxed">
          Bạn đã vi phạm quy định làm bài quá nhiều lần.<br />
          {isSubmit
            ? "Bài làm sẽ được nộp với các câu đã trả lời."
            : "Bài làm sẽ bị hủy và không được tính điểm."}
        </p>
        <div className="mt-2 flex justify-center gap-0.5">
          {[1,2,3].map(i => <Heart key={i} className="h-6 w-6 fill-muted-foreground/30 text-muted-foreground/50" />)}
        </div>
        <button
          onClick={onExit}
          className="mt-5 w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-md hover:bg-red-700 transition active:scale-95"
        >
          {isSubmit ? "Nộp bài và thoát" : "Thoát bài làm"}
        </button>
      </div>
    </div>
  );
}
