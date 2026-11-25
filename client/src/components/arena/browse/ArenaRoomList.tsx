import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Clock, Eye, ListOrdered, LogIn, Plus, Trash2, Users, Zap } from "lucide-react";
import api from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { isStaff as checkIsStaff } from "../../../lib/roles";
import { languageForCourse } from "../../../lib/courseExperience";
import { useAuthContext } from "../../../contexts/AuthContext";
import { useConfirmContext } from "../../../hooks/useConfirm";
import { useToast } from "../../../hooks/useToast";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card, CardContent } from "../../ui/card";
import { Input } from "../../ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { EmptyState } from "../../ui/StateViews";
import { arenaStatusBadge, type ArenaTypeConfig } from "./arenaBrowseConfig";
import type { ArenaListItem } from "../../../lib/arenaTypes";

/**
 * The room browser for both arenas: open rooms, a practice launcher, and (for
 * staff) create + hide. `cfg` carries everything type-specific.
 *
 * Join errors go through `useToast()`. The debug page used to build the
 * `codeclass:toast` CustomEvent by hand, which meant its own `id`/`duration`
 * conventions and one more place to keep in sync with ToastContainer.
 */
export function ArenaRoomList({ cfg }: { cfg: ArenaTypeConfig }) {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const isStaff = checkIsStaff(user?.role);
  const queryClient = useQueryClient();
  const confirm = useConfirmContext();
  const toast = useToast();
  const { Icon } = cfg;

  const [practiceOpen, setPracticeOpen] = useState(false);
  const [count, setCount] = useState(5);
  const [language, setLanguage] = useState("python");
  // Once the learner picks a language by hand, the course dropdown stops
  // steering it.
  const [languageTouched, setLanguageTouched] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [prompt, setPrompt] = useState("");

  const listKey = ["arenas", cfg.type];

  const { data: rooms = [], isLoading } = useQuery<ArenaListItem[]>({
    queryKey: listKey,
    queryFn: () => api.get(`/arenas?type=${cfg.type}`).then((r) => r.data),
  });

  // Only fetched once the dialog is open — the list itself doesn't need them.
  const { data: courses = [] } = useQuery<{ id: string; title: string; description?: string | null }[]>({
    queryKey: ["courses-list"],
    queryFn: () => api.get("/courses").then((r) => r.data),
    enabled: practiceOpen,
  });
  const { data: modules = [] } = useQuery<{ id: string; title: string }[]>({
    queryKey: ["modules-list", courseId],
    queryFn: () => api.get(`/courses/${courseId}/modules`).then((r) => r.data),
    enabled: practiceOpen && !!courseId,
  });

  const practiceMu = useMutation({
    mutationFn: () =>
      api
        .post("/arenas/practice", {
          arenaType: cfg.type,
          questionCount: count,
          secondsPerQuestion: cfg.practice.seconds,
          revealSeconds: cfg.practice.reveal,
          languages: cfg.languages ? [language] : ["python"],
          courseId: courseId || undefined,
          moduleId: moduleId || undefined,
          customPrompt: prompt || undefined,
        })
        .then((r) => r.data),
    onSuccess: (match) => navigate(`${cfg.base}/${match.id}`),
    onError: (err: any) =>
      toast.error({
        title: "Không tạo được bài luyện tập",
        message: err?.response?.data?.error || "Đã có lỗi xảy ra.",
      }),
  });

  const joinMu = useMutation({
    mutationFn: (arenaId: string) => api.post(`/arenas/${arenaId}/join`).then((r) => r.data),
    onSuccess: (_data, arenaId) => navigate(`${cfg.base}/${arenaId}`),
    onError: (err: any) =>
      toast.error({
        title: "Không thể tham gia",
        message: err?.response?.data?.error || "Đã có lỗi xảy ra.",
        duration: 4000,
      }),
  });

  const deleteMu = useMutation({
    mutationFn: (arenaId: string) => api.delete(`/arenas/${arenaId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
    onError: (err: any) =>
      toast.error({ title: "Không xóa được", message: err?.response?.data?.error || "Đã có lỗi xảy ra." }),
  });

  const askDelete = async (arenaId: string) => {
    const ok = await confirm({
      title: "Xóa phòng",
      message: "Phòng sẽ biến mất khỏi danh sách, nhưng điểm và lịch sử làm bài vẫn được giữ lại.",
      variant: "danger",
    });
    if (ok) deleteMu.mutate(arenaId);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-white">
            <Icon className="h-6 w-6 text-blue-600" /> {cfg.listTitle}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{cfg.listBlurb}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => navigate(cfg.historyTo)}
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground"
          >
            <Clock className="h-4 w-4" /> Lịch sử
          </Button>
          <Button onClick={() => setPracticeOpen(true)} variant="outline" className="gap-2">
            <Zap className="h-4 w-4 text-blue-600" /> Luyện tập
          </Button>
          {isStaff && (
            <Button onClick={() => navigate(`${cfg.base}/new`)} className="gap-2">
              <Plus className="h-4 w-4" /> Tạo phòng
            </Button>
          )}
        </div>
      </div>

      <Dialog open={practiceOpen} onOpenChange={setPracticeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-600" /> Luyện tập {cfg.type === "quiz" ? "Quiz" : "Debug"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Số câu hỏi</span>
              <Input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 5)))}
                className="mt-1"
              />
            </label>

            {cfg.languages && (
              <div>
                <span className="text-xs font-semibold text-muted-foreground">Ngôn ngữ</span>
                <div className="mt-1 flex gap-2">
                  {["python", "cpp"].map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => {
                        setLanguageTouched(true);
                        setLanguage(l);
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-semibold transition",
                        language === l
                          ? "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {l === "cpp" ? "C++" : "Python"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {courses.length > 0 && (
              <label className="block">
                <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                  <BookOpen className="h-3 w-3" /> Khóa học
                </span>
                <select
                  value={courseId}
                  onChange={(e) => {
                    const nextCourseId = e.target.value;
                    setCourseId(nextCourseId);
                    setModuleId("");
                    // Same course-follows-language rule as the create form.
                    if (cfg.languages && !languageTouched) {
                      const lang = languageForCourse(courses.find((c) => c.id === nextCourseId));
                      if (lang) setLanguage(lang);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Toàn bộ kiến thức</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {modules.length > 0 && (
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">Giới hạn đến chương</span>
                <select
                  value={moduleId}
                  onChange={(e) => setModuleId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Tự động</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Lưu ý cho AI (không bắt buộc)</span>
              <Input
                placeholder={cfg.promptPlaceholder}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="mt-1"
              />
            </label>

            <p className="text-[11px] text-muted-foreground">{cfg.practiceNote}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPracticeOpen(false)}>
              Hủy
            </Button>
            <Button
              disabled={practiceMu.isPending}
              onClick={() => practiceMu.mutate()}
              className="gap-1 bg-blue-600 hover:bg-blue-700"
            >
              {practiceMu.isPending ? "Đang tạo..." : "Bắt đầu luyện tập"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={<Icon className="h-5 w-5" />}
          title="Chưa có phòng nào"
          text={isStaff ? 'Nhấn "Tạo phòng" để mở một trận mới, hoặc "Luyện tập" để tự chơi.' : "Bấm “Luyện tập” để tự chơi một mình."}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rooms.map((room) => {
            const badge = arenaStatusBadge(room.status, room.phase);
            const joined = room.players?.some((p) => p.user?.id === user?.id);
            const deletable = room.status !== "in_progress" && room.status !== "generating";
            return (
              <Card
                key={room.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`${cfg.base}/${room.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="flex items-center gap-1.5 truncate font-bold text-gray-900 dark:text-white">
                        {room.title}
                        {!joined && room.status === "in_progress" && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            <Eye className="h-2.5 w-2.5" /> Xem live
                          </span>
                        )}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <ListOrdered className="h-3 w-3" /> {room.questionCount} câu
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" /> {room.players?.length || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> ~{Math.round(room.questionCount * 2.5)} phút
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground/80">
                        Tạo bởi {room.createdBy?.fullName || "—"}
                        {joined && <span className="ml-1 text-blue-600 dark:text-blue-300">· bạn đã tham gia</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge className={badge.className}>{badge.label}</Badge>
                      {isStaff && deletable && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                          title="Ẩn phòng khỏi danh sách"
                          disabled={deleteMu.isPending}
                          onClick={(event) => {
                            event.stopPropagation();
                            void askDelete(room.id);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {!isStaff && !joined && room.status === "lobby" && room.mode !== "practice" && (
                    <Button
                      size="sm"
                      className="mt-3 w-full gap-1 bg-blue-600 hover:bg-blue-700"
                      disabled={joinMu.isPending}
                      onClick={(event) => {
                        event.stopPropagation();
                        joinMu.mutate(room.id);
                      }}
                    >
                      <LogIn className="h-3.5 w-3.5" /> Tham gia phòng
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
