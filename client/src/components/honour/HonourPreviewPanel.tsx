import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PlayCircle, Sparkles, Trophy } from "lucide-react";
import api from "../../lib/api";
import { useAuthContext } from "../../contexts/AuthContext";
import { previewHonourCards, type HonourCard } from "../../hooks/useHonourCards";

/** Stand-ins used when the week has fewer than 3 ranked students yet, so the
 *  rehearsal can still show a full 3-card layout. */
const PLACEHOLDERS: HonourCard[] = [
  { userId: "demo-1", fullName: "Nguyễn Văn A", rank: 1, xp: 320, avatarName: "Hổ Vằn",
    avatarUrl: "https://anonymous-animals.azurewebsites.net/animal/Tiger", selfCard: false, praiseRequired: true },
  { userId: "demo-2", fullName: "Trần Thị B", rank: 2, xp: 275, avatarName: "Cáo Đỏ",
    avatarUrl: "https://anonymous-animals.azurewebsites.net/animal/Fox", selfCard: false, praiseRequired: true },
  { userId: "demo-3", fullName: "Lê Văn C", rank: 3, xp: 210, avatarName: "Gấu Trúc",
    avatarUrl: "https://anonymous-animals.azurewebsites.net/animal/Panda", selfCard: false, praiseRequired: true },
];

/**
 * Staff-only rehearsal panel for the daily honour ceremony.
 *
 * Students only ever see their cards once per honouree per day, which makes the
 * feature awkward to check by hand. These buttons render the same overlay from
 * local data: nothing is recorded as shown and no praise is sent, so trying it
 * cannot consume a real student's card.
 */
export default function HonourPreviewPanel() {
  const { user } = useAuthContext();
  const isStaff = user?.role === "admin" || user?.role === "teacher" || user?.role === "teaching_assistant";
  const [lastCount, setLastCount] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["honour-top3"],
    queryFn: () => api.get("/honour/top3").then((r) => r.data),
    enabled: isStaff,
    staleTime: 60_000,
  });

  if (!isStaff) return null;

  const real: HonourCard[] = (data?.top3 || []).map((h: any) => ({
    userId: h.userId,
    fullName: h.fullName,
    rank: h.rank,
    xp: h.xp,
    avatarUrl: h.avatarUrl,
    avatarName: h.avatarName,
    selfCard: h.userId === user?.id,
    praiseRequired: h.userId !== user?.id,
  }));

  const show = (count: number) => {
    // Prefer the real daily top 3; pad with placeholders only if today does not
    // have that many ranked students yet.
    const picked = [...real.slice(0, count)];
    while (picked.length < count) {
      const filler = PLACEHOLDERS[picked.length];
      picked.push({ ...filler, rank: picked.length + 1 });
    }
    previewHonourCards(picked);
    setLastCount(count);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
            <Trophy className="h-4 w-4 text-amber-500" /> Thử hiển thị thẻ vinh danh
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Xem trước hiệu ứng thẻ bay vào. Không ghi nhận đã xem, không gửi lời khen thật.
          </p>
        </div>
        {isLoading && <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            onClick={() => show(n)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <PlayCircle className="h-3.5 w-3.5" /> {n} thẻ
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
        {data?.dayKey && (
          <p>
            Ngày <span className="font-semibold text-gray-700 dark:text-gray-300">{data.dayKey}</span> ·
            {real.length > 0 ? (
              <> top 3 hôm nay: {real.map((h) => `#${h.rank} ${h.fullName}`).join(" · ")}</>
            ) : (
              <> chưa có học sinh nào có hoạt động hôm nay — sẽ dùng thẻ mẫu</>
            )}
          </p>
        )}
        {real.length > 0 && real.length < 3 && (
          <p>Chỉ có {real.length} học sinh xếp hạng, các thẻ còn lại là mẫu.</p>
        )}
        {lastCount !== null && (
          <p className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
            <Sparkles className="h-3 w-3" /> Đã mở {lastCount} thẻ · nhấn Esc để đóng
          </p>
        )}
      </div>
    </div>
  );
}
