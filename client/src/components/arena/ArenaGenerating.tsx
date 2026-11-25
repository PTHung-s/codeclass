import { ReactNode, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "../ui/button";

const PROGRAMMING_FACTS = [
  "Bug đầu tiên trong lịch sử là một con bọ thật — bị kẹt trong rơ-le máy tính năm 1947.",
  "Python được đặt tên theo nhóm hài Monty Python, không phải con trăn.",
  "Code đọc nhiều lần hơn là viết — hãy viết cho người đọc tiếp theo.",
  "80% lỗi phần mềm đến từ 20% code — nguyên lý Pareto cũng đúng trong lập trình.",
  "Tốc độ của Python: range() nhanh hơn list khi chỉ cần duyệt.",
  "Một vòng lặp for trong Python chậm hơn while, nhưng dễ đọc hơn nhiều.",
  "Đừng tối ưu sớm — 'premature optimization is the root of all evil'.",
  "Hàm len() trong Python là O(1) — nó lưu sẵn độ dài.",
  "Comment giải thích TẠI SAO, không phải CÁI GÌ — code đã nói cái gì rồi.",
  "Off-by-one là lỗi kinh điển: `range(n)` chạy n lần, từ 0 đến n-1.",
  "Debug gấp 10 lần viết code — hãy nghĩ kỹ trước khi gõ.",
  "Biến trong Python là nhãn dán lên giá trị, không phải chiếc hộp.",
  "None, 0, '', [], {} đều là falsy — nhớ khi viết điều kiện if.",
  "Đọc code của người giỏi là cách học nhanh nhất.",
  "Mỗi lỗi bạn sửa hôm nay là một skill bạn có cho ngày mai.",
];

/**
 * The wait while the AI writes the questions.
 *
 * `error` is the important part: the server broadcasts `arena_generation_failed`
 * and rolls the match back to the lobby when generation gives up, but nothing
 * listened for it, so the room sat on this spinner forever. Now the failure is
 * shown, with a retry for whoever can start the match.
 */
export function ArenaGenerating({
  icon,
  error,
  onRetry,
  retrying,
}: {
  icon: ReactNode;
  error?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * PROGRAMMING_FACTS.length));
  useEffect(() => {
    if (error) return;
    const id = setInterval(() => {
      setFactIndex(
        (prev) => (prev + 1 + Math.floor(Math.random() * (PROGRAMMING_FACTS.length - 1))) % PROGRAMMING_FACTS.length,
      );
    }, 6000);
    return () => clearInterval(id);
  }, [error]);

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15">
          <AlertTriangle className="h-8 w-8 text-amber-400" />
        </div>
        <p className="text-lg font-bold text-slate-100">Chưa tạo được câu hỏi</p>
        <p className="max-w-md text-sm text-slate-400">{error}</p>
        {onRetry && (
          <Button onClick={onRetry} disabled={retrying} className="mt-1 gap-2 bg-blue-600 hover:bg-blue-500">
            <RotateCw className={retrying ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Thử lại
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
        {icon}
      </motion.div>
      <p className="text-lg font-bold text-slate-100">Đang lựa chọn câu hỏi phù hợp...</p>
      <p className="text-sm text-slate-400">Hệ thống chuẩn bị đề theo trình độ của bạn</p>
      <motion.div
        key={factIndex}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-4 max-w-md rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">💡 Bạn có biết</p>
        <p className="mt-1 text-sm text-slate-200">{PROGRAMMING_FACTS[factIndex]}</p>
      </motion.div>
    </div>
  );
}

export function ArenaCountdown({ seconds }: { seconds: number }) {
  const n = Math.max(1, seconds);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
      <p className="text-sm font-semibold uppercase tracking-widest text-blue-300">Chuẩn bị</p>
      <motion.div
        key={n}
        initial={{ scale: 1.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.5, opacity: 0 }}
        className="text-8xl font-black tabular-nums text-blue-400"
      >
        {n}
      </motion.div>
      <p className="text-sm text-slate-400">Câu hỏi đầu tiên sắp xuất hiện!</p>
    </div>
  );
}
