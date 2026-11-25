import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Flame, TrendingUp, TrendingDown, Minus, BookOpen, Users, ArrowRight, Trophy, Coins, Gift, HelpCircle, Radar, CalendarDays, ChevronRight, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import type { SkillState, Recommendation, TopicGroup } from "../../lib/api";
import { RadarChart, groupSkillsByTopic, topicsForLanguage, skillsForLanguage, type RadarDataPoint, type SkillLanguage } from "../../components/skills/RadarChart";
import { ErrorState } from "../../components/ui/StateViews";
import { useAuthContext } from "../../contexts/AuthContext";
import { useMascot, msgGreet } from "../../components/mascot";
import { Button, buttonVariants } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { cn, getAnimalAvatarUrl, getAvatarBgColor } from "../../lib/utils";
import { DailyStudyPlanCard } from "../../components/skills/DailyStudyPlanCard";
import { StudentName } from "../../components/ui/StudentName";

export default function Dashboard() {
  const { user } = useAuthContext();
  const isStaff = user?.role === "teacher" || user?.role === "teaching_assistant" || user?.role === "admin";
  if (isStaff) return <TeacherDashboard />;
  return <StudentDashboard />;
}

function StudentDashboard() {
  const { user } = useAuthContext();
  const { say } = useMascot();
  const [showRewardInfo, setShowRewardInfo] = useState(false);
  const dashQ = useQuery({
    queryKey: ["dashboard-gamification"],
    queryFn: () => api.get("/dashboard").then((r) => r.data),
  });
  const lbQ = useQuery<{ leaderboard: LeaderboardEntry[] }>({
    queryKey: ["leaderboard", "all"],
    queryFn: () => api.get("/leaderboard?period=all&limit=10").then((r) => r.data),
  });

  // Mascot chào học sinh khi dữ liệu dashboard tải xong (một lần).
  const greetedRef = useRef(false);
  useEffect(() => {
    if (greetedRef.current) return;
    if (dashQ.data) {
      greetedRef.current = true;
      say("idle", msgGreet({ name: user?.nickname || user?.fullName, streak: dashQ.data?.streak }), { holdMs: 9000 });
    }
  }, [dashQ.data, user?.fullName, user?.nickname, say]);

  if (dashQ.isLoading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Đang tải...</div>;

  const leaderboard = lbQ.data?.leaderboard || [];
  const streak = dashQ.data?.streak ?? 0;
  const longestStreak = dashQ.data?.longestStreak ?? 0;
  const streakReward = Math.min(3 + (streak - 1) * 2, 30); // rough estimate
  const currentUserId = user?.id;
  const myRank = leaderboard.findIndex((e) => e.userId === currentUserId);
  const inTop3Daily = myRank >= 0 && myRank < 3;
  const inTop3Weekly = myRank >= 0 && myRank < 3;

  return (
    <div className="stagger-in space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Xin chào,</p>
              <h1 className="text-2xl font-semibold tracking-tight text-card-foreground">{user?.nickname || user?.fullName || "Học viên"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Kế hoạch học của bạn hôm nay.</p>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
              <div className="bg-card px-4 py-3" title={streak > 0 ? `Kỷ lục: ${longestStreak} ngày · +${streakReward} tokens/ngày` : undefined}>
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Flame className={cn("size-3.5", streak > 0 && "text-orange-500")} /> Streak
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{streak} ngày</p>
              </div>
              <div className="bg-card px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Cấp độ</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">Lv.{dashQ.data?.level ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{dashQ.data?.leagueName}</p>
              </div>
              <div className="bg-card px-4 py-3 sm:min-w-44">
                <p className="text-xs font-medium text-muted-foreground">Kinh nghiệm</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{(dashQ.data?.xp ?? 0).toLocaleString("vi-VN")} XP</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                    style={{ width: `${dashQ.data?.levelProgress ?? 0}%` }}
                  />
                </div>
              </div>
              <Link to="/tokens" className="bg-card px-4 py-3 transition-colors hover:bg-muted/60">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Coins className="size-3.5" /> Tokens</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{(dashQ.data?.tokenBalance ?? 0).toLocaleString("vi-VN")}</p>
              </Link>
            </div>
          </div>
          <DailyStudyPlanCard compact />
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="size-4 text-muted-foreground" /> Bảng xếp hạng
            </h3>
            <div className="flex items-center gap-2">
              {/* Gift boxes */}
              <div className="flex items-center gap-1" title={inTop3Daily ? "Bạn đang trong top 3 — sẽ nhận thưởng hôm nay!" : "Vào top 3 để nhận thưởng mỗi ngày"}>
                <Gift className={cn("size-5", inTop3Daily ? "text-primary" : "text-muted-foreground/30")} />
                <Gift className={cn("size-5", inTop3Weekly ? "text-primary" : "text-muted-foreground/30")} />
              </div>
              <button onClick={() => setShowRewardInfo(true)} className="text-muted-foreground hover:text-foreground" title="Xem thông tin thưởng">
                <HelpCircle className="size-4" />
              </button>
              <Link to="/leaderboard" className="text-xs text-primary hover:underline flex items-center gap-1">Xem tất cả <ArrowRight className="size-3" /></Link>
            </div>
          </div>
          {leaderboard.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            <div className="divide-y divide-border">
              {leaderboard.slice(0, 8).map((entry, i) => (
                <div key={entry.userId} className={cn("flex items-center gap-3 px-4 py-2.5", i === 0 ? "bg-muted/50" : "")}>
                  <span className={cn("w-6 text-center text-xs font-semibold tabular-nums", i < 3 ? "text-foreground" : "text-muted-foreground")}>
                    {i + 1}
                  </span>
                  <img src={entry.avatarUrl || getAnimalAvatarUrl(entry.fullName)} alt="" className="size-7 rounded-full object-cover" style={{ backgroundColor: getAvatarBgColor(entry.fullName) }} />
                  <span className="flex-1 truncate text-sm font-medium">{entry.fullName}</span>
                  <span className="text-xs text-muted-foreground">Lv.{entry.level}</span>
                  <span className="w-16 text-right text-xs font-semibold tabular-nums text-foreground">{entry.xp.toLocaleString("vi-VN")} XP</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reward info popup */}
      <Dialog open={showRewardInfo} onOpenChange={(open) => setShowRewardInfo(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Gift className="size-5 text-primary" /> Thưởng Bảng Xếp Hạng</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="font-semibold flex items-center gap-1.5"><CalendarDays className="size-4 text-muted-foreground" /> Mỗi ngày</p>
              <p className="text-xs text-muted-foreground mt-0.5">Hạng 1: <b>5</b> · Hạng 2: <b>4</b> · Hạng 3: <b>3</b> tokens</p>
              <p className="text-xs text-muted-foreground">Top 3 nhận thưởng cuối ngày</p>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="font-semibold flex items-center gap-1.5"><Trophy className="size-4 text-muted-foreground" /> Mỗi tuần</p>
              <p className="text-xs text-muted-foreground mt-0.5">Hạng 1: <b>50</b> · Hạng 2: <b>40</b> · Hạng 3: <b>30</b> tokens</p>
              <p className="text-xs text-muted-foreground">Top 3 nhận thưởng vào Chủ Nhật</p>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="font-semibold flex items-center gap-1.5"><Flame className="size-4 text-muted-foreground" /> Streak điểm danh</p>
              <p className="text-xs text-muted-foreground mt-0.5">Điểm danh mỗi ngày, streak càng dài càng nhiều tokens (tối đa <b>30</b>/ngày)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full" onClick={() => setShowRewardInfo(false)}>Đã hiểu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Skill Profile Section ── */}
      <SkillProfileSection userId={user?.id || ""} />
    </div>
  );
}

interface LeaderboardEntry {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  xp: number;
  level: number;
}

function TeacherDashboard() {
  const { data: courses = [] } = useQuery<any[]>({
    queryKey: ["courses"],
    queryFn: () => api.get("/courses").then((r) => (Array.isArray(r.data) ? r.data : r.data?.courses ?? [])),
  });
  const studentsQ = useQuery<Array<{ id: string; fullName: string; nickname?: string | null; email: string; avatarUrl: string | null; status?: string }>>({
    queryKey: ["students", "all"],
    queryFn: () => api.get("/students").then((r) => r.data),
  });
  const students = studentsQ.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Bảng tin</h1>
        <p className="text-sm text-muted-foreground">Tổng quan học sinh và khóa học</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Khóa học</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{courses.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Học sinh</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{students.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to="/attendance" className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
          <Users className="size-4" /> Điểm danh học sinh <ArrowRight className="size-4" />
        </Link>
        <Link to="/courses" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}>
          <BookOpen className="size-4" /> Quản lý khóa học
        </Link>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">Tất cả học sinh</h2>
              <p className="text-xs text-muted-foreground">Chọn một học sinh để xem hồ sơ và tiến độ học tập.</p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums">{students.length}</span>
          </div>
          {studentsQ.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Đang tải học sinh...</p>
          ) : studentsQ.isError ? (
            <ErrorState title="Không thể tải danh sách học sinh" />
          ) : students.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Chưa có học sinh nào.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {students.map((student) => (
                <Link key={student.id} to={`/students/${student.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/60">
                  <img src={student.avatarUrl || getAnimalAvatarUrl(student.fullName)} alt="" className="size-10 rounded-full object-cover" style={{ backgroundColor: getAvatarBgColor(student.fullName) }} />
                  <span className="min-w-0 flex-1">
                  <StudentName fullName={student.fullName} nickname={student.nickname} primaryClassName="text-sm font-semibold" />
                    <span className="block truncate text-xs text-muted-foreground">{student.email}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Skill Profile Section (Student Dashboard) ──

function SkillProfileSection({ userId }: { userId: string }) {
  const [skills, setSkills] = useState<SkillState[]>([]);
  const [topics, setTopics] = useState<TopicGroup[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<SkillLanguage>("py");
  const [langTouched, setLangTouched] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/skills/${userId}`).then((r) => r.data).catch(() => []),
      api.get(`/skills/${userId}/recommendations`).then((r) => r.data).catch(() => []),
      api.get(`/skills`).then((r) => r.data).catch(() => []),
    ])
      .then(([s, r, t]) => {
        setSkills(s);
        setRecs(r);
        setTopics(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (langTouched || loading || skills.length === 0) return;
    const cppEvidence = skills.filter((s) => s.skillId.startsWith("cpp.") && s.hasEvidence).length;
    const pyEvidence = skills.filter((s) => s.skillId.startsWith("py.") && s.hasEvidence).length;
    if (cppEvidence > pyEvidence) setLang("cpp");
    else setLang("py");
  }, [skills, loading, langTouched]);

  if (loading || skills.length === 0) return null;

  const scopedTopics = topicsForLanguage(topics, lang);
  const scopedSkills = skillsForLanguage(skills, lang);
  const radarData = groupSkillsByTopic(
    scopedSkills.map((s) => ({
      skillId: s.skillId,
      name: s.name,
      // Unknown skills must not look like a real 50% score on the chart.
      mastery: s.hasEvidence ? s.mastery : 0,
      trend: s.trend,
      hasEvidence: s.hasEvidence,
    })),
    scopedTopics.map((t) => ({ topicId: t.topicId, topicName: t.topicName, skillIds: t.skills.map((sk) => sk.skillId) })),
    lang,
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Hồ sơ kỹ năng</h3>
          <div className="ml-auto flex items-center gap-1 rounded-lg bg-muted p-0.5" role="tablist" aria-label="Chọn ngôn ngữ">
            <button
              type="button"
              role="tab"
              aria-selected={lang === "py"}
              onClick={() => { setLangTouched(true); setLang("py"); }}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                lang === "py" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              Python
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={lang === "cpp"}
              onClick={() => { setLangTouched(true); setLang("cpp"); }}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                lang === "cpp" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              C++
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:items-center">
          {/* Cột trái: Radar tổng quan theo topic */}
          {radarData.length >= 3 ? (
            <div className="flex justify-center py-2">
              <RadarChart data={radarData} size={260} />
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Chưa đủ dữ liệu để vẽ radar.
            </p>
          )}

          {/* Cột phải: Chi tiết từng kỹ năng, group theo topic (mặc định thu gọn) */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Chi tiết theo kỹ năng</p>
            <SkillDetailList skills={scopedSkills} topics={scopedTopics} />
          </div>
        </div>

        {recs.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            {recs.slice(0, 2).map((rec) => (
              <div key={rec.id} className="rounded-lg bg-muted/60 p-3 text-xs">
                <p className="font-semibold">{rec.title}</p>
                <p className="mt-0.5 text-muted-foreground">{rec.reason}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Danh sách skill chi tiết, group theo topic, mặc định thu gọn ──
function SkillDetailList({
  skills,
  topics,
}: {
  skills: SkillState[];
  topics: TopicGroup[];
}) {
  // Mặc định thu gọn hết — chỉ mở topic khi user bấm
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (topicId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  // Map skillId → topic
  const skillToTopic = new Map<string, { topicId: string; topicName: string }>();
  for (const t of topics) {
    for (const sk of t.skills) {
      skillToTopic.set(sk.skillId, { topicId: t.topicId, topicName: t.topicName });
    }
  }

  // Group skills theo topic, giữ thứ tự curriculum
  const groups: { topicId: string; topicName: string; items: SkillState[] }[] = [];
  for (const t of topics) {
    const items = skills.filter((s) => skillToTopic.get(s.skillId)?.topicId === t.topicId);
    if (items.length > 0) groups.push({ topicId: t.topicId, topicName: t.topicName, items });
  }
  // Skills không map được → gom "Khác"
  const mapped = new Set(groups.flatMap((g) => g.items.map((i) => i.skillId)));
  const others = skills.filter((s) => !mapped.has(s.skillId));
  if (others.length > 0) groups.push({ topicId: "_other", topicName: "Khác", items: others });

  const TrendIcon = { up: TrendingUp, down: TrendingDown, flat: Minus };
  const trendColor = { up: "text-emerald-500", down: "text-red-500", flat: "text-muted-foreground" };
  const barColor = (m: number) =>
    m >= 0.75 ? "bg-emerald-500" : m >= 0.5 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-1">
      {groups.map((g) => {
        const known = g.items.filter((x) => x.hasEvidence);
        const avg = known.length > 0
          ? known.reduce((s, x) => s + x.mastery, 0) / known.length
          : 0;
        const isOpen = expanded.has(g.topicId);
        return (
          <div key={g.topicId} className="rounded-md">
            {/* Header: toggle + tên topic + % tổng */}
            <button
              onClick={() => toggle(g.topicId)}
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60"
            >
              {isOpen ? (
                <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 truncate text-[11px] font-bold text-foreground/80">{g.topicName}</span>
              {/* Thanh mini overall */}
              <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                {known.length > 0 && (
                  <div
                    className={`h-full rounded-full ${barColor(avg)}`}
                    style={{ width: `${Math.round(avg * 100)}%` }}
                  />
                )}
              </div>
              <span className="w-8 shrink-0 text-right text-[11px] font-bold tabular-nums text-foreground/80">
                {known.length > 0 ? `${Math.round(avg * 100)}%` : "—"}
              </span>
            </button>

            {/* Body: list skills (chỉ hiện khi expand) */}
            {isOpen && (
              <div className="space-y-1 pb-1 pl-1">
                {g.items.map((s) => {
                  const TI = TrendIcon[s.trend];
                  const hasInterval = s.hasEvidence && s.lowerBound != null && s.upperBound != null;
                  const lower = hasInterval ? s.lowerBound! : s.mastery;
                  const upper = hasInterval ? s.upperBound! : s.mastery;
                  const intervalLabel = hasInterval
                    ? `${Math.round(lower * 100)}–${Math.round(upper * 100)}%`
                    : "—";
                  return (
                    <div key={s.skillId} className="flex items-center gap-2 py-0.5 pl-3 text-xs">
                      <span className="w-28 shrink-0 truncate text-muted-foreground" title={s.name}>
                        {s.name}
                      </span>
                      <div
                        className="relative h-2 flex-1 rounded-full bg-muted"
                        title={hasInterval ? `Ước lượng ${Math.round(s.mastery * 100)}%, khoảng ${intervalLabel}` : undefined}
                      >
                        {s.hasEvidence && hasInterval && (
                          <>
                            <div className={`absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-35 ${barColor(s.mastery)}`} style={{ left: `${lower * 100}%`, width: `${Math.max(1, (upper - lower) * 100)}%` }} />
                            <span className={`absolute top-1/2 h-3 w-0.5 -translate-y-1/2 ${barColor(s.mastery)}`} style={{ left: `${lower * 100}%` }} />
                            <span className={`absolute top-1/2 h-3 w-0.5 -translate-y-1/2 ${barColor(s.mastery)}`} style={{ left: `${upper * 100}%` }} />
                            <span className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background ${barColor(s.mastery)}`} style={{ left: `${s.mastery * 100}%` }} />
                          </>
                        )}
                      </div>
                      <span className="w-8 shrink-0 text-right font-medium tabular-nums">
                        {s.hasEvidence ? `${Math.round(s.mastery * 100)}%` : "—"}
                      </span>
                      {s.hasEvidence ? <TI className={`size-3 shrink-0 ${trendColor[s.trend]}`} /> : (
                        <span className="size-3 shrink-0 text-center text-[10px] text-muted-foreground">?</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
