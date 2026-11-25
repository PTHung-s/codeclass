import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import {
  Activity,
  Bell,
  BookOpen,
  Brain,
  ChevronRight,
  ClipboardList,
  Code2,
  Gamepad2,
  Menu,
  MonitorPlay,
  Moon,
  Sun,
  Trophy,
  Users,
} from "lucide-react";
import { useDarkMode } from "../../hooks/useDarkMode";
import { useNotifications } from "../../hooks/useNotifications";
import { usePresence, type PresenceStudent } from "../../hooks/usePresence";
import NotificationDropdown from "../ui/NotificationDropdown";
import ProfileDropdown from "../profile/ProfileDropdown";
import GlobalSearch from "../ui/GlobalSearch";
import { StudentName } from "../ui/StudentName";
import { cn, getAnimalAvatarUrl, getAvatarBgColor } from "../../lib/utils";
import api from "../../lib/api";

const routeLabels: Record<string, string> = {
  dashboard: "Bảng tin",
  courses: "Khóa học",
  problems: "Thư viện đề",
  contests: "Phòng thi",
  exams: "Phòng thi",
  materials: "Tài nguyên",
  settings: "Cài đặt",
  admin: "AI Admin",
  content: "Quản lý nội dung",
  server: "Hiệu năng server",
  "skill-tags": "Duyệt tag kỹ năng",
  "engine-config": "Cấu hình engine",
  "rec-logs": "Log gợi ý",
  students: "Học viên",
  lessons: "Bài học",
  grades: "Sổ điểm",
  curriculum: "Nội dung khóa học",
  leaderboard: "Bảng xếp hạng",
  overview: "Tổng quan",
  reviews: "Nhận xét",
  "code-duel": "Code Duel",
  game: "Thi đấu",
  authoring: "Soạn câu hỏi",
  monitor: "Giám sát",
  history: "Lịch sử",
  "quiz-arena": "Quiz Arena",
  arena: "Đấu trường",
  "code-lab": "Code Lab",
  "bug-reports": "Báo lỗi",
  course: "Khóa học",
  student: "Học viên",
  tracking: "Theo dõi",
  edit: "Chỉnh sửa",
  new: "Tạo mới",
  tokens: "Ví & Hộp quà",
  attendance: "Điểm danh",
  "my-attendance": "Điểm danh",
  tuition: "Học phí",
  checklist: "Lộ trình",
  "gamification-settings": "Cấu hình điểm",
  "adaptive-test": "Bài kiểm tra thích ứng",
  "adaptive-history": "Lịch sử thích ứng",
  quiz: "Bài kiểm tra",
  assignments: "Bài tập",
  "my-assignments": "Bài tập của tôi",
  lesson: "Buổi học",
  result: "Kết quả",
  grading: "Chấm bài",
  ranking: "Bảng xếp hạng",
  testcases: "Bộ test",
  take: "Làm bài",
  preview: "Xem trước",
  quests: "Nhiệm vụ",
  meet: "Phòng học",
};

function getLabelForSegment(segment: string): string {
  return routeLabels[segment] || segment;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const breadcrumbResources: Record<string, { endpoint: (id: string) => string; fallback: string }> = {
  courses: { endpoint: (id) => `/courses/${id}`, fallback: "Khóa học" },
  course: { endpoint: (id) => `/courses/${id}`, fallback: "Khóa học" },
  lesson: { endpoint: (id) => `/session-course/lesson/${id}`, fallback: "Buổi học" },
  lessons: { endpoint: (id) => `/lessons/${id}`, fallback: "Bài học" },
  problems: { endpoint: (id) => `/problems/${id}`, fallback: "Bài tập" },
  materials: { endpoint: (id) => `/materials/${id}`, fallback: "Tài nguyên" },
  contests: { endpoint: (id) => `/contests/${id}`, fallback: "Phòng thi" },
  exams: { endpoint: (id) => `/exams/${id}`, fallback: "Phòng thi" },
  arena: { endpoint: (id) => `/arena/${id}`, fallback: "Đấu trường" },
  "quiz-arena": { endpoint: (id) => `/quiz-arena/${id}`, fallback: "Quiz Arena" },
  students: { endpoint: (id) => `/students/${id}`, fallback: "Học viên" },
  "code-duel": { endpoint: (id) => `/code-duel/${id}`, fallback: "Trận Code Duel" },
  "bug-reports": { endpoint: (id) => `/bug-reports/${id}`, fallback: "Báo lỗi" },
};

function entityTitle(data: any, fallback: string): string {
  const value =
    data?.title ||
    data?.name ||
    data?.fullName ||
    data?.exam?.title ||
    data?.lesson?.title ||
    data?.match?.title ||
    data?.course?.title ||
    data?.problem?.title ||
    data?.arena?.title;
  return typeof value === "string" && value.trim() ? value : fallback;
}

export default function Topbar({
  onToggleMobileSidebar,
}: {
  onToggleMobileSidebar: () => void;
}) {
  const { user } = useAuthContext();
  const { unreadCount } = useNotifications();
  const { dark, toggle: toggleDark } = useDarkMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const pathSegments = location.pathname.split("/").filter(Boolean);
  const dynamicSegments = useMemo(
    () =>
      pathSegments.flatMap((segment, index) => {
        const resource = breadcrumbResources[pathSegments[index - 1]];
        return UUID_PATTERN.test(segment) && resource
          ? [{ segment, index, resource }]
          : [];
      }),
    [location.pathname],
  );

  const dynamicQueries = useQueries({
    queries: dynamicSegments.map(({ segment, resource }) => ({
      queryKey: ["breadcrumb", resource.endpoint(segment)],
      queryFn: () => api.get(resource.endpoint(segment)).then((response) => response.data),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const resolvedNames = useMemo(() => {
    const names = new Map<string, string>();
    dynamicSegments.forEach(({ segment, resource }, index) => {
      names.set(segment, entityTitle(dynamicQueries[index]?.data, resource.fallback));
    });
    return names;
  }, [dynamicSegments, dynamicQueries]);

  const breadcrumbs = useMemo(() => {
    const segments = pathSegments;
    const crumbs: { label: string; path: string }[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const path = "/" + segments.slice(0, i + 1).join("/");
      if (UUID_PATTERN.test(segment)) {
        crumbs.push({ label: resolvedNames.get(segment) || "Chi tiết", path });
      } else if (segment === "new" || segment === "edit") {
        crumbs.push({ label: segment === "new" ? "Tạo mới" : "Chỉnh sửa", path });
      } else {
        crumbs.push({ label: getLabelForSegment(segment), path });
      }
    }
    return crumbs;
  }, [location.pathname, resolvedNames]);

  const staff = isStaff(user?.role);
  const roleLabel = staff ? "Bảng tin giáo viên" : "Bảng tin học viên";

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-border bg-card/95 px-3 backdrop-blur-sm transition-colors md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="-ml-1 inline-flex size-8 items-center justify-center rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          aria-label="Mở menu"
        >
          <Menu className="size-4" />
        </button>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="hidden min-w-0 sm:block">
          <ol className="flex items-center gap-1 text-[13px]">
            {breadcrumbs.length === 0 ? (
              <li>
                <h2 className="font-semibold text-foreground">{roleLabel}</h2>
              </li>
            ) : (
              breadcrumbs.map((crumb, i) => (
                <li key={crumb.path} className="flex min-w-0 items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />}
                  {i === breadcrumbs.length - 1 ? (
                    <h2 className="truncate font-semibold text-foreground">{crumb.label}</h2>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate(crumb.path)}
                      className="truncate font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {crumb.label}
                    </button>
                  )}
                </li>
              ))
            )}
          </ol>
        </nav>

        {/* Mobile title */}
        <h2 className="truncate text-sm font-semibold text-foreground sm:hidden">
          {breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].label : roleLabel}
        </h2>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="hidden md:block">
          <GlobalSearch />
        </div>

        {/* Staff online students indicator (replaces floating bottom-right widget) */}
        {staff && <TopbarPresenceButton />}

        {/* Dark mode toggle */}
        <button
          type="button"
          onClick={toggleDark}
          aria-label={dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
          title={dark ? "Chế độ sáng" : "Chế độ tối"}
          className="inline-flex size-8 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>

        {/* Notification bell */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setProfileOpen(false);
              setNotifOpen((v) => !v);
            }}
            className="relative inline-flex size-8 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Thông báo"
            title="Thông báo"
          >
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground ring-2 ring-card">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
          <NotificationDropdown open={notifOpen} onClose={() => setNotifOpen(false)} />
        </div>

        {/* Profile avatar + menu (includes Settings & Logout) */}
        <div className="relative ml-0.5">
          <button
            type="button"
            onClick={() => {
              setNotifOpen(false);
              setProfileOpen((v) => !v);
            }}
            className="relative inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white ring-1 ring-border transition-opacity hover:opacity-85"
            aria-label="Hồ sơ và tài khoản"
            title={user?.nickname || user?.fullName || "Hồ sơ"}
            style={{ backgroundColor: getAvatarBgColor(user?.fullName || "") }}
          >
            <img
              src={user?.avatarUrl || getAnimalAvatarUrl(user?.fullName || user?.email || "")}
              alt=""
              className="absolute inset-0 size-full rounded-full object-cover"
            />
          </button>
          <ProfileDropdown open={profileOpen} onClose={() => setProfileOpen(false)} />
        </div>
      </div>
    </header>
  );
}

const STATUS_DOT = {
  online: "bg-emerald-500",
  idle: "bg-amber-500",
  away: "bg-rose-500",
  offline: "bg-muted-foreground/50",
} as const;

const ACTIVITY_ICON: Record<string, typeof Code2> = {
  problem: Code2,
  problems: Code2,
  lesson: BookOpen,
  course: BookOpen,
  quiz: Brain,
  arena: Gamepad2,
  assignment: ClipboardList,
  assignments: ClipboardList,
  leaderboard: Trophy,
  dashboard: Activity,
  monitor: MonitorPlay,
};

function timeAgo(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return "vừa xong";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}ph`;
  return `${Math.floor(m / 60)}h`;
}

function TopbarPresenceButton() {
  const students = usePresence();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 3000);
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      clearInterval(t);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const onlineCount = students.filter((s) => s.status === "online").length;
  const idleCount = students.filter((s) => s.status === "idle").length;
  const awayCount = students.filter((s) => s.status === "away").length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Học sinh đang trực tuyến"
        aria-label={`${onlineCount} học sinh đang trực tuyến`}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-[7px] border px-2 text-xs font-medium transition-colors",
          open
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <span className={cn("size-1.5 rounded-full", onlineCount > 0 ? "bg-emerald-500" : "bg-muted-foreground/40")} />
        <Users className="size-3.5" />
        <span className="tabular-nums">{onlineCount}</span>
      </button>

      {open && (
        <div className="dropdown-in absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold">Học sinh trực tuyến</span>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500" /> {onlineCount}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-amber-500" /> {idleCount}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-rose-500" /> {awayCount}
              </span>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-1.5">
            {students.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Chưa có học sinh online</p>
            ) : (
              students.map((s) => <PresenceRow key={s.userId} student={s} now={now} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PresenceRow({ student, now }: { student: PresenceStudent; now: number }) {
  const ActivityIcon = ACTIVITY_ICON[student.activityType] || Activity;
  const dotCls = STATUS_DOT[student.status] || STATUS_DOT.offline;

  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60">
      <span className="relative shrink-0">
        <img
          src={student.avatarUrl || getAnimalAvatarUrl(student.fullName)}
          alt=""
          className="size-7 rounded-full object-cover"
          style={{ backgroundColor: getAvatarBgColor(student.fullName) }}
        />
        <span className={cn("absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-popover", dotCls)} />
      </span>
      <div className="min-w-0 flex-1">
        <StudentName fullName={student.fullName} nickname={student.nickname} primaryClassName="text-xs font-medium leading-tight" />
        <p className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
          <ActivityIcon className="size-2.5 shrink-0" />
          <span className="truncate">{student.activityLabel}</span>
        </p>
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{timeAgo(student.lastActiveAt, now)}</span>
    </div>
  );
}
