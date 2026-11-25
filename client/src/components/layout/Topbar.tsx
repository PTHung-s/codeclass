import { useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import { Bell, LogOut, Menu, ChevronRight, Sun, Moon } from "lucide-react";
import { useDarkMode } from "../../hooks/useDarkMode";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../hooks/useNotifications";
import NotificationDropdown from "../ui/NotificationDropdown";
import ProfileDropdown from "../profile/ProfileDropdown";
import GlobalSearch from "../ui/GlobalSearch";
import { Button } from "../ui/button";
import { getAnimalAvatarUrl, getAvatarBgColor } from "../../lib/utils";
import api from "../../lib/api";

// Route-to-label mapping
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
};

function getLabelForSegment(segment: string): string {
  return routeLabels[segment] || segment;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const breadcrumbResources: Record<string, { endpoint: (id: string) => string; fallback: string }> = {
  courses: { endpoint: (id) => `/courses/${id}`, fallback: "Khóa học" },
  course: { endpoint: (id) => `/courses/${id}`, fallback: "Khóa học" },
  lessons: { endpoint: (id) => `/lessons/${id}`, fallback: "Bài học" },
  problems: { endpoint: (id) => `/problems/${id}`, fallback: "Bài tập" },
  materials: { endpoint: (id) => `/materials/${id}`, fallback: "Tài nguyên" },
  contests: { endpoint: (id) => `/contests/${id}`, fallback: "Phòng thi" },
  arena: { endpoint: (id) => `/arena/${id}`, fallback: "Đấu trường" },
  "quiz-arena": { endpoint: (id) => `/quiz-arena/${id}`, fallback: "Quiz Arena" },
  students: { endpoint: (id) => `/students/${id}`, fallback: "Học viên" },
  "code-duel": { endpoint: (id) => `/code-duel/${id}`, fallback: "Trận Code Duel" },
  "bug-reports": { endpoint: (id) => `/bug-reports/${id}`, fallback: "Báo lỗi" },
};

function entityTitle(data: any, fallback: string): string {
  const value = data?.title || data?.name || data?.fullName || data?.match?.title || data?.course?.title || data?.problem?.title || data?.arena?.title;
  return typeof value === "string" && value.trim() ? value : fallback;
}

export default function Topbar({
  onToggleMobileSidebar,
}: {
  onToggleMobileSidebar: () => void;
}) {
  const { user, logout } = useAuthContext();
  const { unreadCount } = useNotifications();
  const { dark, toggle: toggleDark } = useDarkMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const dynamicSegments = useMemo(
    () => pathSegments.flatMap((segment, index) => {
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

  // Build breadcrumb segments from pathname
  const breadcrumbs = useMemo(() => {
    const segments = pathSegments;
    const crumbs: { label: string; path: string }[] = [];

    if (segments.length === 0) return crumbs;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const path = "/" + segments.slice(0, i + 1).join("/");

      if (UUID_PATTERN.test(segment)) {
        // UUIDs are implementation details, never useful navigation labels.
        // Show a concise type label while its actual title is loading.
        crumbs.push({ label: resolvedNames.get(segment) || "Chi tiết", path });
      } else if (segment === "new" || segment === "edit") {
        crumbs.push({
          label: segment === "new" ? "Tạo mới" : "Chỉnh sửa",
          path,
        });
      } else {
        crumbs.push({ label: getLabelForSegment(segment), path });
      }
    }

    return crumbs;
  }, [location.pathname, resolvedNames]);

  const roleLabel = isStaff(user?.role)
    ? "Bảng tin giáo viên"
    : "Bảng tin học viên";

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Hamburger - mobile: toggle drawer | desktop: toggle sidebar collapse */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleMobileSidebar}
          className="lg:hidden -ml-1"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </Button>

        {/* Breadcrumb - visible on sm+ */}
        <nav aria-label="Breadcrumb" className="hidden sm:block min-w-0">
          <ol className="flex items-center gap-1 text-sm">
            {breadcrumbs.length === 0 ? (
              <li>
                <h2 className="text-base font-medium text-foreground">
                  {roleLabel}
                </h2>
              </li>
            ) : (
              breadcrumbs.map((crumb, i) => (
                <li
                  key={crumb.path}
                  className="flex items-center gap-1 min-w-0"
                >
                  {i > 0 && (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                  )}
                  {i === breadcrumbs.length - 1 ? (
                    <h2 className="text-base font-medium text-foreground truncate">
                      {crumb.label}
                    </h2>
                  ) : (
                    <button
                      onClick={() => navigate(crumb.path)}
                      className="text-muted-foreground hover:text-foreground font-medium truncate transition-colors"
                    >
                      {crumb.label}
                    </button>
                  )}
                </li>
              ))
            )}
          </ol>
        </nav>

        {/* Fallback title for mobile */}
        <h2 className="text-base font-medium text-foreground sm:hidden truncate">
          {breadcrumbs.length > 0
            ? breadcrumbs[breadcrumbs.length - 1].label
            : roleLabel}
        </h2>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Global search */}
        <div className="hidden md:block">
          <GlobalSearch />
        </div>

        {/* Dark mode toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDark}
          aria-label={dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
          title={dark ? "Chế độ sáng" : "Chế độ tối"}
        >
          {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>

        {/* Notification bell */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative"
            aria-label="Thông báo"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1 ring-2 ring-card">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Button>
          <NotificationDropdown
            open={notifOpen}
            onClose={() => setNotifOpen(false)}
          />
        </div>

        {/* Profile avatar */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="relative inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-white transition-opacity hover:opacity-80"
            aria-label="Hồ sơ"
            style={{ backgroundColor: getAvatarBgColor(user?.fullName || "") }}
          >
            <img
              src={user?.avatarUrl || getAnimalAvatarUrl(user?.fullName || user?.email || "")}
              alt=""
              className="absolute inset-0 size-full rounded-full object-cover"
            />
          </button>
          <ProfileDropdown
            open={profileOpen}
            onClose={() => setProfileOpen(false)}
          />
        </div>

        {/* Logout */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Đăng xuất</span>
        </Button>
      </div>
    </header>
  );
}
