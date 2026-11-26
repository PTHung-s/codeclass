import { NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthContext } from "../../contexts/AuthContext";
import { useNotifications } from "../../hooks/useNotifications";
import { useEffect, useState } from "react";
import api from "../../lib/api";
import { cn } from "../../lib/utils";
import {
  Activity,
  BookOpen,
  Bug,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Code,
  Coins,
  Database,
  DollarSign,
  FileEdit,
  FileText,
  Gamepad2,
  LayoutDashboard,
  Map,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Tag,
  Terminal,
  Trophy,
  Video,
  Wand2,
  X,
} from "lucide-react";

interface LinkItem {
  to: string;
  icon: any;
  label: string;
  badgeKey?: string;
  /** Chỉ những link pinned mới xuất hiện trên rail thu gọn. */
  pinned?: boolean;
}

const teacherLinks: LinkItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Bảng tin", pinned: true },
  { to: "/courses", icon: BookOpen, label: "Khóa học", pinned: true },
  { to: "/assignments", icon: ClipboardCheck, label: "Bài tập", pinned: true },
  { to: "/code-lab", icon: Terminal, label: "Code Lab", pinned: true },
  { to: "/problems", icon: Code, label: "Thư viện đề", pinned: true },
  { to: "/materials", icon: FileText, label: "Tài nguyên" },
  { to: "/checklist", icon: Map, label: "Lộ trình" },
  { to: "/meet", icon: Video, label: "Meeting" },
  { to: "/exams", icon: ClipboardList, label: "Phòng thi", pinned: true },
  { to: "/attendance", icon: CalendarCheck, label: "Điểm danh", badgeKey: "pendingAttendance", pinned: true },
  { to: "/monitor", icon: Radar, label: "Giám sát học sinh" },
  { to: "/tuition", icon: DollarSign, label: "Học phí" },
  { to: "/admin/content", icon: FileEdit, label: "Quản lý nội dung" },
  { to: "/admin/quiz-bank", icon: Database, label: "Quiz Bank" },
  { to: "/games", icon: Gamepad2, label: "Sảnh trò chơi", pinned: true },
  { to: "/arena", icon: Gamepad2, label: "Debug Arena" },
  { to: "/quiz-arena", icon: Sparkles, label: "Quiz Arena" },
  { to: "/code-duel", icon: Swords, label: "Code Duel" },
  { to: "/leaderboard", icon: Trophy, label: "Bảng xếp hạng", pinned: true },
  { to: "/bug-reports", icon: Bug, label: "Báo cáo lỗi" },
  { to: "/tokens", icon: Coins, label: "Ví & Hộp quà" },
  { to: "/gamification-settings", icon: SlidersHorizontal, label: "Cấu hình điểm" },
  { to: "/admin/ai-tools", icon: Wand2, label: "AI Playground" },
  { to: "/admin/server", icon: Activity, label: "Hiệu năng server" },
  { to: "/settings", icon: SettingsIcon, label: "Cài đặt", pinned: true },
];

const studentLinks: LinkItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Bảng tin", pinned: true },
  { to: "/courses", icon: BookOpen, label: "Khóa học", pinned: true },
  { to: "/my-assignments", icon: ClipboardCheck, label: "Bài tập của tôi", pinned: true },
  { to: "/code-lab", icon: Terminal, label: "Code Lab", pinned: true },
  { to: "/problems", icon: Code, label: "Luyện tập", pinned: true },
  { to: "/materials", icon: FileText, label: "Tài liệu" },
  { to: "/checklist", icon: Map, label: "Lộ trình" },
  { to: "/meet", icon: Video, label: "Meeting" },
  { to: "/exams", icon: ClipboardList, label: "Phòng thi", pinned: true },
  { to: "/my-attendance", icon: CalendarCheck, label: "Điểm danh", pinned: true },
  { to: "/games", icon: Gamepad2, label: "Sảnh trò chơi", pinned: true },
  { to: "/arena", icon: Gamepad2, label: "Debug Arena" },
  { to: "/quiz-arena", icon: Sparkles, label: "Quiz Arena" },
  { to: "/code-duel", icon: Swords, label: "Code Duel" },
  { to: "/leaderboard", icon: Trophy, label: "Bảng xếp hạng", pinned: true },
  { to: "/bug-reports", icon: Bug, label: "Báo cáo lỗi" },
  { to: "/tokens", icon: Coins, label: "Ví & Hộp quà" },
  { to: "/settings", icon: SettingsIcon, label: "Cài đặt", pinned: true },
];

const adminLinks: LinkItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Bảng tin", pinned: true },
  { to: "/courses", icon: BookOpen, label: "Khóa học", pinned: true },
  { to: "/assignments", icon: ClipboardCheck, label: "Bài tập", pinned: true },
  { to: "/code-lab", icon: Terminal, label: "Code Lab", pinned: true },
  { to: "/problems", icon: Code, label: "Thư viện đề", pinned: true },
  { to: "/materials", icon: FileText, label: "Tài nguyên" },
  { to: "/checklist", icon: Map, label: "Lộ trình" },
  { to: "/meet", icon: Video, label: "Meeting" },
  { to: "/exams", icon: ClipboardList, label: "Phòng thi", pinned: true },
  { to: "/attendance", icon: CalendarCheck, label: "Điểm danh", badgeKey: "pendingAttendance", pinned: true },
  { to: "/monitor", icon: Radar, label: "Giám sát học sinh" },
  { to: "/tuition", icon: DollarSign, label: "Học phí" },
  { to: "/admin/content", icon: FileEdit, label: "Quản lý nội dung" },
  { to: "/admin/quiz-bank", icon: Database, label: "Quiz Bank" },
  { to: "/admin/skill-tags", icon: Tag, label: "Duyệt tag kỹ năng" },
  { to: "/games", icon: Gamepad2, label: "Sảnh trò chơi", pinned: true },
  { to: "/arena", icon: Gamepad2, label: "Debug Arena" },
  { to: "/quiz-arena", icon: Sparkles, label: "Quiz Arena" },
  { to: "/code-duel", icon: Swords, label: "Code Duel" },
  { to: "/leaderboard", icon: Trophy, label: "Bảng xếp hạng", pinned: true },
  { to: "/bug-reports", icon: Bug, label: "Báo cáo lỗi" },
  { to: "/tokens", icon: Coins, label: "Ví & Hộp quà" },
  { to: "/gamification-settings", icon: SlidersHorizontal, label: "Cấu hình điểm" },
  { to: "/admin", icon: SettingsIcon, label: "Quản trị" },
  { to: "/admin/ai-tools", icon: Wand2, label: "AI Playground" },
  { to: "/admin/server", icon: Activity, label: "Hiệu năng server" },
  { to: "/settings", icon: SettingsIcon, label: "Cài đặt", pinned: true },
];

const navigationSections = [
  { id: "overview", label: "Tổng quan", collapsible: false, routes: ["/dashboard"] },
  {
    id: "learning",
    label: "Học tập",
    collapsible: true,
    routes: ["/courses", "/assignments", "/my-assignments", "/code-lab", "/problems", "/materials", "/checklist", "/meet"],
  },
  {
    id: "classroom",
    label: "Lớp học & Quản lý",
    collapsible: true,
    routes: ["/exams", "/attendance", "/my-attendance", "/monitor", "/tuition", "/admin/content", "/admin/quiz-bank", "/admin/skill-tags"],
  },
  { id: "arena", label: "Đấu trường", collapsible: true, routes: ["/arena", "/quiz-arena", "/code-duel"] },
  { id: "community", label: "Cộng đồng", collapsible: true, routes: ["/leaderboard", "/bug-reports"] },
  {
    id: "system",
    label: "Tài khoản & Hệ thống",
    collapsible: true,
    routes: ["/tokens", "/gamification-settings", "/admin", "/admin/ai-tools", "/admin/server", "/settings"],
  },
];

const COLLAPSED_SECTIONS_KEY = "codeclass.sidebarSections.v1";
const SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggleDesktop?: () => void;
  collapsed?: boolean;
}

export default function Sidebar({ mobileOpen, onCloseMobile, onToggleDesktop, collapsed = false }: SidebarProps) {
  const { user } = useAuthContext();
  const { unreadCount } = useNotifications();

  const links =
    user?.role === "admin"
      ? adminLinks
      : user?.role === "teacher" || user?.role === "teaching_assistant"
        ? teacherLinks
        : studentLinks;

  return (
    <>
      <div
        className={`hidden h-full shrink-0 overflow-hidden border-r border-border bg-sidebar transition-[width] duration-200 ease-out lg:block ${
          collapsed ? "w-[56px]" : "w-56"
        }`}
      >
        {collapsed ? (
          <CollapsedRail links={links} unreadCount={unreadCount} onToggleDesktop={onToggleDesktop} />
        ) : (
          <ExpandedSidebar
            links={links}
            unreadCount={unreadCount}
            onCloseMobile={onCloseMobile}
            onToggleDesktop={onToggleDesktop}
            animated
          />
        )}
      </div>

      <div
        className={`fixed inset-y-0 left-0 z-[70] w-56 transform transition-transform duration-200 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0 shadow-elevated" : "-translate-x-full"
        }`}
      >
        <ExpandedSidebar
          links={links}
          unreadCount={unreadCount}
          onCloseMobile={onCloseMobile}
          onToggleDesktop={onToggleDesktop}
        />
      </div>
    </>
  );
}

function ExpandedSidebar({
  links,
  unreadCount,
  onCloseMobile,
  onToggleDesktop,
  animated = false,
}: {
  links: LinkItem[];
  unreadCount: number;
  onCloseMobile: () => void;
  onToggleDesktop?: () => void;
  animated?: boolean;
}) {
  const { user } = useAuthContext();
  const location = useLocation();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <aside className="flex h-full w-56 flex-col bg-sidebar">
      {/* Brand + collapse button (48px matching Topbar) */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <img src="/codeclass-mark-round.png?v=round-1" alt="" className="size-6 shrink-0 select-none" />
          <span className="truncate text-sm font-semibold tracking-tight text-foreground">CodeClass</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleDesktop}
            className="hidden size-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
            aria-label="Thu gọn sidebar"
            title="Thu gọn sidebar"
          >
            <PanelLeftClose className="size-4" />
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="inline-flex size-7 items-center justify-center rounded-[6px] text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Đóng menu"
            title="Đóng menu"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <nav className="scrollbar-none flex-1 space-y-3 overflow-y-auto px-2.5 py-2.5">
        {navigationSections.map((section) => {
          const sectionLinks = links.filter((link) => section.routes.includes(link.to));
          if (sectionLinks.length === 0) return null;

          const hasActiveRoute = sectionLinks.some((link) =>
            link.to === "/dashboard"
              ? location.pathname === "/dashboard"
              : location.pathname.startsWith(link.to),
          );
          const isClosed = section.collapsible && collapsedSections[section.id] && !hasActiveRoute;

          return (
            <section key={section.id} aria-label={section.label}>
              {section.collapsible ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="mb-1 flex w-full items-center justify-between rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  <span>{section.label}</span>
                  <ChevronDown className={cn("size-3 transition-transform duration-150", isClosed && "-rotate-90")} />
                </button>
              ) : (
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {section.label}
                </p>
              )}

              <AnimatePresence initial={false}>
                {!isClosed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-0.5 overflow-hidden"
                  >
                    {sectionLinks.map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        end={link.to === "/dashboard"}
                        onClick={onCloseMobile}
                        className={({ isActive }) =>
                          cn(
                            "relative flex items-center justify-between rounded-[7px] px-2 py-1.5 text-[13px] transition-colors duration-150",
                            isActive
                              ? "font-medium text-foreground"
                              : "font-normal text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive &&
                              (animated ? (
                                <motion.span
                                  layoutId="sidebar-nav-active"
                                  className="absolute inset-0 rounded-[7px] bg-sidebar-accent"
                                  transition={SPRING}
                                />
                              ) : (
                                <span className="absolute inset-0 rounded-[7px] bg-sidebar-accent" />
                              ))}
                            <span className="relative z-10 flex min-w-0 items-center gap-2">
                              <link.icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "opacity-80")} />
                              <span className="truncate">{link.label}</span>
                            </span>
                            {link.badgeKey === "pendingAttendance" && unreadCount > 0 && (
                              <span className="relative z-10">
                                <Badge count={unreadCount} />
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}
      </nav>

      <UserBlock user={user} />
    </aside>
  );
}

function CollapsedRail({
  links,
  unreadCount,
  onToggleDesktop,
}: {
  links: LinkItem[];
  unreadCount: number;
  onToggleDesktop?: () => void;
}) {
  const [logoHover, setLogoHover] = useState(false);
  const location = useLocation();

  // Only show pinned links + currently active route so the rail stays clean & uncluttered
  const visibleLinks = links.filter(
    (link) =>
      link.pinned ||
      (link.to === "/dashboard" ? location.pathname === "/dashboard" : location.pathname.startsWith(link.to)),
  );

  return (
    <aside className="flex h-full w-[56px] flex-col items-center bg-sidebar py-2">
      <div
        className="relative mb-2 flex h-8 w-8 shrink-0 items-center justify-center"
        onMouseEnter={() => setLogoHover(true)}
        onMouseLeave={() => setLogoHover(false)}
      >
        <img
          src="/codeclass-mark-round.png?v=round-1"
          alt=""
          className={cn("size-7 select-none transition-opacity duration-150", logoHover ? "opacity-0" : "opacity-100")}
        />
        <button
          type="button"
          onClick={onToggleDesktop}
          aria-label="Mở rộng sidebar"
          title="Mở rộng sidebar"
          className={cn(
            "absolute inset-0 grid place-items-center rounded-[7px] text-muted-foreground transition-opacity duration-150 hover:bg-muted hover:text-foreground",
            logoHover ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <PanelLeftOpen className="size-4" />
        </button>
      </div>

      <nav className="scrollbar-none no-scrollbar flex flex-1 flex-col items-center gap-1.5 overflow-y-auto px-1.5 py-1">
        {visibleLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/dashboard"}
            title={link.label}
            className={({ isActive }) =>
              cn(
                "relative flex size-9 items-center justify-center rounded-[8px] transition-colors duration-150",
                isActive ? "text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="rail-nav-active"
                    className="absolute inset-0 rounded-[8px] bg-sidebar-accent"
                    transition={SPRING}
                  />
                )}
                <link.icon className="relative z-10 size-[18px]" />
                {link.badgeKey === "pendingAttendance" && unreadCount > 0 && (
                  <span className="absolute right-1 top-1 z-20 size-2 rounded-full border-2 border-sidebar bg-destructive" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function UserBlock({ user }: { user: any }) {
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  useEffect(() => {
    api.get("/tokens/balance").then((r) => setTokenBalance(r.data.balance)).catch(() => {});
  }, []);
  return (
    <div className="shrink-0 border-t border-sidebar-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">{user?.fullName}</p>
          <p className="text-[11px] text-muted-foreground">{roleLabel(user?.role)}</p>
        </div>
        {tokenBalance != null && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            <Coins className="size-3" />
            {tokenBalance.toLocaleString("vi-VN")}
          </span>
        )}
      </div>
    </div>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function roleLabel(role?: string) {
  if (role === "teacher") return "Giáo viên";
  if (role === "student") return "Học viên";
  if (role === "admin") return "Quản trị";
  if (role === "teaching_assistant") return "Trợ giảng";
  return role || "";
}
