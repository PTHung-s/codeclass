import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import { PageHeader } from "../../components/ui/page-header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Gamepad2,
  Play,
  Plus,
  Sparkles,
  Swords,
  Users,
} from "lucide-react";

interface ArenaRow {
  id: string;
  title: string;
  status: string;
  phase: string;
  mode: string;
  arenaType: string;
  questionCount: number;
  createdAt: string;
  _count?: { players: number };
}

interface DuelRow {
  id: string;
  title: string;
  status: string;
  language: string;
  createdAt: string;
  _count?: { players: number; rounds: number };
}

export default function GameHub() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const staff = isStaff(user?.role);

  const debugQ = useQuery<ArenaRow[]>({
    queryKey: ["gamehub-debug"],
    queryFn: () => api.get("/arenas", { params: { arenaType: "debug" } }).then((r) => (Array.isArray(r.data) ? r.data : [])),
    refetchInterval: 10_000,
  });

  const quizQ = useQuery<ArenaRow[]>({
    queryKey: ["gamehub-quiz"],
    queryFn: () => api.get("/arenas", { params: { arenaType: "quiz" } }).then((r) => (Array.isArray(r.data) ? r.data : [])),
    refetchInterval: 10_000,
  });

  const duelQ = useQuery<DuelRow[]>({
    queryKey: ["gamehub-duel"],
    queryFn: () => api.get("/code-duel").then((r) => (Array.isArray(r.data) ? r.data : [])),
    refetchInterval: 10_000,
  });

  const activeRooms = useMemo(() => {
    const rooms: Array<{
      key: string;
      game: "Debug Arena" | "Quiz Arena" | "Code Duel";
      title: string;
      statusLabel: string;
      players: number;
      to: string;
      tone: string;
    }> = [];

    for (const a of debugQ.data || []) {
      if (a.mode === "practice" || a.status === "finished") continue;
      rooms.push({
        key: `debug-${a.id}`,
        game: "Debug Arena",
        title: a.title,
        statusLabel: a.status === "lobby" ? "Đang chờ" : "Đang diễn ra",
        players: a._count?.players ?? 0,
        to: `/arena/${a.id}`,
        tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
      });
    }
    for (const q of quizQ.data || []) {
      if (q.mode === "practice" || q.status === "finished") continue;
      rooms.push({
        key: `quiz-${q.id}`,
        game: "Quiz Arena",
        title: q.title,
        statusLabel: q.status === "lobby" ? "Đang chờ" : "Đang diễn ra",
        players: q._count?.players ?? 0,
        to: `/quiz-arena/${q.id}`,
        tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
      });
    }
    for (const d of duelQ.data || []) {
      if (d.status === "finished" || d.status === "podium" || (!staff && d.status === "draft")) continue;
      rooms.push({
        key: `duel-${d.id}`,
        game: "Code Duel",
        title: d.title,
        statusLabel: d.status === "draft" ? "Nháp" : d.status === "lobby" ? "Đang chờ" : "Đang thi đấu",
        players: d._count?.players ?? 0,
        to: d.status === "draft" && staff ? `/code-duel/${d.id}/authoring` : `/code-duel/${d.id}`,
        tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
      });
    }
    return rooms;
  }, [debugQ.data, quizQ.data, duelQ.data, staff]);

  const modes = [
    {
      name: "Debug Arena",
      desc: "Tìm dòng bug & sửa code chạy đúng nhanh nhất. Có phép Chaos cúp điện đối kháng.",
      icon: Gamepad2,
      tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
      listPath: "/arena",
      createPath: "/arena/new",
      openCount: (debugQ.data || []).filter((a) => a.mode !== "practice" && a.status !== "finished").length,
    },
    {
      name: "Quiz Arena",
      desc: "Đấu trắc nghiệm tốc độ từ Ngân hàng câu hỏi hoặc AI, tự hiệu chỉnh độ khó.",
      icon: Sparkles,
      tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
      listPath: "/quiz-arena",
      createPath: "/quiz-arena/new",
      openCount: (quizQ.data || []).filter((a) => a.mode !== "practice" && a.status !== "finished").length,
    },
    {
      name: "Code Duel",
      desc: "Đấu lập trình nhiều vòng kiểu ICPC, chấm testcase ẩn realtime và xếp hạng tốc độ AC.",
      icon: Swords,
      tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
      listPath: "/code-duel",
      createPath: "/code-duel/new",
      openCount: (duelQ.data || []).filter((d) => d.status !== "finished" && d.status !== "podium" && (staff || d.status !== "draft")).length,
    },
  ];

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader
          eyebrow="Giải trí & Thi đấu"
          title="Sảnh trò chơi"
          description="Tất cả phòng đấu trực tiếp và chế độ tự luyện cho học viên trong lớp."
        />

        {/* 3 game launchers */}
        <div className="grid gap-4 md:grid-cols-3">
          {modes.map((m) => (
            <Card key={m.name} className="surface-interactive flex flex-col justify-between">
              <CardContent className="flex flex-1 flex-col justify-between gap-4 p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className={`grid size-9 place-items-center rounded-xl ${m.tone}`}>
                      <m.icon className="size-4.5" />
                    </div>
                    {m.openCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                        {m.openCount} phòng mở
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-bold text-foreground">{m.name}</h2>
                  <p className="text-xs leading-relaxed text-muted-foreground">{m.desc}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" variant="default" className="flex-1" onClick={() => navigate(m.listPath)}>
                    Vào sảnh <ArrowRight className="ml-1 size-3.5" />
                  </Button>
                  {staff && (
                    <Button size="sm" variant="outline" onClick={() => navigate(m.createPath)}>
                      <Plus className="mr-1 size-3.5" /> Tạo phòng
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Live rooms across all 3 games */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="size-4 text-primary" />
                Phòng đang mở &amp; Đang diễn ra ({activeRooms.length})
              </h2>
            </div>

            {!activeRooms.length ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Hiện chưa có phòng thi đấu nào đang mở. {staff ? "Bạn có thể bấm “Tạo phòng” ở phía trên." : "Bạn có thể vào từng game để tự luyện nhé!"}
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border">
                {activeRooms.map((r) => (
                  <Link
                    key={r.key}
                    to={r.to}
                    className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 text-xs transition-colors hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${r.tone}`}>
                        {r.game}
                      </span>
                      <span className="truncate font-semibold text-foreground">{r.title}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1 text-muted-foreground tabular-nums">
                        <Users className="size-3.5" /> {r.players}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" /> {r.statusLabel}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-primary">
                        <Play className="size-3" /> Tham gia
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ErrorBoundary>
  );
}
