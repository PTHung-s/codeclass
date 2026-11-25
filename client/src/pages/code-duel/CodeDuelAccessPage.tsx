import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, LockKeyhole, RotateCcw, UserRoundX } from "lucide-react";
import api from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { StudentName } from "../../components/ui/StudentName";

type KickedPlayer = {
  userId: string;
  fullName: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  totalScore: number;
  outTabCount: number;
  joinedAt: string;
};

export default function CodeDuelAccessPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [title, setTitle] = useState("Trận Code Duel");
  const [players, setPlayers] = useState<KickedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [match, kicked] = await Promise.all([
        api.get(`/code-duel/${id}`),
        api.get<KickedPlayer[]>(`/code-duel/${id}/kicked-players`),
      ]);
      setTitle(match.data?.match?.title || "Trận Code Duel");
      setPlayers(Array.isArray(kicked.data) ? kicked.data : []);
    } catch (err: any) {
      toast.error({ title: "Không tải được quản lý truy cập", message: err?.response?.data?.error || "Đã có lỗi." });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  const unlock = async (player: KickedPlayer) => {
    if (!id) return;
    setUnlocking(player.userId);
    try {
      await api.post(`/code-duel/${id}/unlock`, { userId: player.userId });
      setPlayers((current) => current.filter((item) => item.userId !== player.userId));
      toast.success({ title: "Đã mở khóa", message: `${player.fullName} có thể vào lại phòng ngay.` });
    } catch (err: any) {
      toast.error({ title: "Không mở khóa được", message: err?.response?.data?.error || "Đã có lỗi." });
    } finally {
      setUnlocking(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={`/code-duel/${id}/monitor`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Về giám sát trận đấu
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-foreground">
            <LockKeyhole className="h-5 w-5 text-primary" /> Quản lý quyền vào phòng
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{title}</p>
        </div>
        <Link to={`/code-duel/${id}/authoring`} className="rounded-lg border border-input px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
          Quản lý bài thi
        </Link>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">Học sinh đã bị loại</h2>
          <p className="mt-1 text-sm text-muted-foreground">Mở khóa sẽ cho phép học sinh vào lại phòng, không xóa điểm và bài nộp trước đó.</p>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : players.length === 0 ? (
          <div className="p-12 text-center">
            <UserRoundX className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">Không có học sinh nào đang bị khóa</p>
            <p className="mt-1 text-sm text-muted-foreground">Danh sách này sẽ xuất hiện khi giáo viên loại một học sinh khỏi trận.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {players.map((player) => (
              <div key={player.userId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {player.avatarUrl ? (
                    <img src={player.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                      {player.fullName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <StudentName fullName={player.fullName} nickname={player.nickname} primaryClassName="font-semibold text-foreground" />
                    <p className="mt-1 text-xs text-muted-foreground">Điểm: {player.totalScore} · Rời tab: {player.outTabCount}</p>
                  </div>
                </div>
                <button
                  onClick={() => unlock(player)}
                  disabled={unlocking === player.userId}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary disabled:opacity-60"
                >
                  {unlocking === player.userId ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Mở khóa
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
