import { Bug, Sparkles, type LucideIcon } from "lucide-react";

/**
 * Everything that differs between the two arena types on the browse/create
 * screens. `ArenaRoomList` and `ArenaCreateForm` are shared; this is the only
 * place the two products are allowed to disagree.
 *
 * The old pages were two independent copies, which is how Quiz Arena ended up
 * without a history button and Debug Arena ended up with a hand-rolled toast.
 */
export interface ArenaTypeConfig {
  type: "debug" | "quiz";
  /** Route prefix — also where "back" goes. */
  base: string;
  /** ArenaHistory is one component on two routes; quiz needs the type param. */
  historyTo: string;
  listTitle: string;
  listBlurb: string;
  createTitle: string;
  createBlurb: string;
  Icon: LucideIcon;
  /** Defaults that sit inside the server's clamps (see clampInt in debugArena.ts). */
  practice: { seconds: number; reveal: number };
  create: { seconds: number; reveal: number };
  /** Debug questions are per-language; quiz questions are language-agnostic. */
  languages: boolean;
  /** Chaos powers only exist in versus debug matches. */
  chaos: boolean;
  practiceNote: string;
  promptPlaceholder: string;
}

export const DEBUG_ARENA: ArenaTypeConfig = {
  type: "debug",
  base: "/arena",
  historyTo: "/arena/history",
  listTitle: "Code Debug Arena",
  listBlurb: "Thi đấu real-time: tìm dòng code sai và sửa cho ra output đúng.",
  createTitle: "Tạo Code Debug Arena",
  createBlurb: "AI ra đề theo phạm vi kiến thức của lớp, mỗi câu đúng một bug.",
  Icon: Bug,
  practice: { seconds: 90, reveal: 15 },
  create: { seconds: 120, reveal: 30 },
  languages: true,
  chaos: true,
  practiceNote: "Bài luyện tập cá nhân, bạn chơi một mình. Có kinh nghiệm (XP), không có tokens.",
  promptPlaceholder: "vd: tập trung bug off-by-one, tránh câu về chuỗi...",
};

export const QUIZ_ARENA: ArenaTypeConfig = {
  type: "quiz",
  base: "/quiz-arena",
  historyTo: "/quiz-arena/history?type=quiz",
  listTitle: "Quiz Arena",
  listBlurb: "Đấu trường trắc nghiệm real-time, độ khó câu hỏi được hiệu chỉnh sau mỗi lượt.",
  createTitle: "Tạo Quiz Arena",
  createBlurb: "AI ra đề trắc nghiệm theo topic của lớp, mỗi câu có đúng một đáp án.",
  Icon: Sparkles,
  practice: { seconds: 75, reveal: 15 },
  create: { seconds: 75, reveal: 20 },
  languages: false,
  chaos: false,
  practiceNote: "Bài luyện tập cá nhân, bạn chơi một mình. Có kinh nghiệm (XP), không có tokens.",
  promptPlaceholder: "vd: vòng lặp, xử lý số, câu hỏi đọc code...",
};

/** Status pill shared by the list cards and the history rows. */
export function arenaStatusBadge(status: string, phase?: string) {
  if (status === "lobby")
    return {
      label: "Sảnh chờ",
      className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
    };
  if (status === "generating")
    return {
      label: "AI ra đề...",
      className:
        "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
    };
  if (status === "in_progress")
    return phase === "podium"
      ? {
          label: "Trao giải",
          className:
            "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
        }
      : {
          label: "Đang diễn ra",
          className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
        };
  return { label: "Kết thúc", className: "border-border bg-muted text-muted-foreground" };
}
