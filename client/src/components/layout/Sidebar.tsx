import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthContext } from "../../contexts/AuthContext";
import { useNotifications } from "../../hooks/useNotifications";
import { useEffect, useState } from "react";
import api from "../../lib/api";
import { cn } from "../../lib/utils";
import {
  BookOpen,
  Bug,
  ClipboardList,
  Code,
  Coins,
  Database,
  FileText,
  FileEdit,
  Gamepad2,
  LayoutDashboard,
  Map,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon,
  Sparkles,
  SlidersHorizontal,
  Tag,
  Swords,
  Trophy,
  ClipboardCheck,
  Wand2,
  X,
  Radar,
  CalendarCheck,
  DollarSign,
  Terminal,
  Video,
} from "lucide-react";
import { Button } from "../ui/button";

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
  { to: "/code-lab", icon: Terminal, label: "Code Lab" },
  { to: "/meet", icon: Video, label: "Meeting" },
  { to: "/exams", icon: ClipboardList, label: "Phòng thi", pinned: true },
  { to: "/attendance", icon: CalendarCheck, label: "Điểm danh", badgeKey: "pendingAttendance", pinned: true },
  { to: "/tuition", icon: DollarSign, label: "Học phí" },
  { to: "/monitor", icon: Radar, label: "Giám sát học sinh" },
  { to: "/admin/content", icon: FileEdit, label: "Quản lý nội dung" },
  { to: "/problems", icon: Code, label: "Thư viện đề", pinned: true },
  { to: "/arena", icon: Gamepad2, label: "Debug Arena" },
  { to: "/quiz-arena", icon: Sparkles, label: "Quiz Arena" },
  { to: "/code-duel", icon: Swords, label: "Code Duel" },
  { to: "/materials", icon: FileText, label: "Tài nguyên" },
  { to: "/bug-reports", icon: Bug, label: "Báo cáo lỗi" },
  { to: "/admin/ai-tools", icon: Wand2, label: "AI Playground" },
  { to: "/admin/server", icon: Activity, label: "Hiệu năng server" },
  { to: "/leaderboard", icon: Trophy, label: "Bảng xếp hạng", pinned: true },
  { to: "/tokens", icon: Coins, label: "Ví tokens & Hộp quà" },
  { to: "/gamification-settings", icon: SlidersHorizontal, label: "Cấu hình điểm" },
  { to: "/checklist", icon: Map, label: "Lộ trình" },
  { to: "/admin/quiz-bank", icon: Database, label: "Quiz Bank" },
  { to: "/settings", icon: SettingsIcon, label: "Cài đặt", pinned: true },
];

const studentLinks: LinkItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Bảng tin", pinned: true },
  { to: "/courses", icon: BookOpen, label: "Khóa học", pinned: true },
  { to: "/my-assignments", icon: ClipboardCheck, label: "Bài tập của tôi", pinned: true },
  { to: "/code-lab", icon: Terminal, label: "Code Lab" },
  { to: "/meet", icon: Video, label: "Meeting" },
  { to: "/exams", icon: ClipboardList, label: "Phòng thi", pinned: true },
  { to: "/my-attendance", icon: CalendarCheck, label: "Điểm danh", pinned: true },
  { to: "/problems", icon: Code, label: "Luyện tập", pinned: true },
  { to: "/arena", icon: Gamepad2, label: "Debug Arena" },
  { to: "/quiz-arena", icon: Sparkles, label: "Quiz Arena" },
  { to: "/code-duel", icon: Swords, label: "Code Duel" },
  { to: "/bug-reports", icon: Bug, label: "Báo cáo lỗi" },
  { to: "/leaderboard", icon: Trophy, label: "Bảng xếp hạng", pinned: true },
  { to: "/tokens", icon: Coins, label: "Ví & Hộp quà" },
  { to: "/materials", icon: FileText, label: "Tài liệu" },
  { to: "/checklist", icon: Map, label: "Lộ trình" },
  { to: "/settings", icon: SettingsIcon, label: "Cài đặt", pinned: true },
];

const adminLinks: LinkItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Bảng tin", pinned: true },
  { to: "/courses", icon: BookOpen, label: "Khóa học", pinned: true },
  { to: "/assignments", icon: ClipboardCheck, label: "Bài tập", pinned: true },
  { to: "/code-lab", icon: Terminal, label: "Code Lab" },
  { to: "/meet", icon: Video, label: "Meeting" },
  { to: "/exams", icon: ClipboardList, label: "Phòng thi", pinned: true },
  { to: "/attendance", icon: CalendarCheck, label: "Điểm danh", badgeKey: "pendingAttendance", pinned: true },
  { to: "/tuition", icon: DollarSign, label: "Học phí" },
  { to: "/monitor", icon: Radar, label: "Giám sát học sinh" },
  { to: "/admin/content", icon: FileEdit, label: "Quản lý nội dung" },
  { to: "/problems", icon: Code, label: "Thư viện đề", pinned: true },
  { to: "/arena", icon: Gamepad2, label: "Debug Arena" },
  { to: "/quiz-arena", icon: Sparkles, label: "Quiz Arena" },
  { to: "/code-duel", icon: Swords, label: "Code Duel" },
  { to: "/materials", icon: FileText, label: "Tài nguyên" },
  { to: "/bug-reports", icon: Bug, label: "Báo cáo lỗi" },
  { to: "/admin", icon: SettingsIcon, label: "Quản trị" },
  { to: "/admin/ai-tools", icon: Wand2, label: "AI Playground" },
  { to: "/admin/server", icon: Activity, label: "Hiệu năng server" },
  { to: "/tokens", icon: Coins, label: "Ví & Hộp quà" },
  { to: "/gamification-settings", icon: SlidersHorizontal, label: "Cấu hình điểm" },
  { to: "/checklist", icon: Map, label: "Lộ trình" },
  { to: "/admin/skill-tags", icon: Tag, label: "Duyệt tag kỹ năng" },
  { to: "/admin/quiz-bank", icon: Database, label: "Quiz Bank" },
  { to: "/settings", icon: SettingsIcon, label: "Cài đặt", pinned: true },
];

const navigationSections = [
  { label: "TỔNG QUAN", routes: ["/dashboard"] },
  { label: "HỌC TẬP", routes: ["/courses", "/assignments", "/my-assignments", "/code-lab", "/meet", "/exams", "/attendance", "/my-attendance", "/monitor", "/admin/content", "/problems", "/materials", "/checklist", "/admin/skill-tags", "/admin/quiz-bank"] },
  { label: "THỬ THÁCH", routes: ["/arena", "/quiz-arena", "/code-duel"] },
  { label: "TÀI CHÍNH", routes: ["/tuition"] },
  { label: "CỘNG ĐỒNG", routes: ["/leaderboard", "/bug-reports"] },
  { label: "CÁ NHÂN", routes: ["/tokens", "/gamification-settings", "/admin", "/admin/ai-tools", "/admin/server", "/settings"] },
];

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
        className={`hidden h-full shrink-0 overflow-hidden border-r border-border bg-sidebar transition-[width] duration-300 ease-out lg:block ${
          collapsed ? "w-[68px]" : "w-64"
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
        className={`fixed inset-y-0 left-0 z-[70] w-64 transform transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0 shadow-elevated" : "-translate-x-full"
        }`}
      >
        {/* Drawer mobile KHÔNG dùng motion pill: nó luôn được mount (chỉ ẩn bằng
            CSS) và layoutId trùng với bản desktop khiến framer-motion bay pill
            về vị trí ngoài màn hình. */}
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
  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar">
      {/* Brand + toggle nằm trong sidebar (nút duy nhất để thu gọn trên desktop) */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/codeclass-mark-round.png?v=round-1" alt="" className="h-8 w-8 shrink-0 select-none" />
          <span className="truncate text-base font-semibold tracking-tight text-foreground">CodeClass</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleDesktop}
            className="hidden lg:inline-flex text-muted-foreground hover:text-foreground"
            aria-label="Thu gọn sidebar"
            title="Thu gọn sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onCloseMobile}
            className="lg:hidden text-muted-foreground"
            aria-label="Đóng menu"
            title="Đóng menu"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <nav className="scrollbar-none flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navigationSections.map((section) => {
          const sectionLinks = links.filter((link) => section.routes.includes(link.to));
          if (sectionLinks.length === 0) return null;

          return (
            <section key={section.label} aria-label={section.label}>
              <p className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">{section.label}</p>
              <div className="space-y-0.5">
                {sectionLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === "/dashboard"}
                    onClick={onCloseMobile}
                    className={({ isActive }) =>
                      cn(
                        "relative flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors duration-150",
                        isActive
                          ? "font-medium text-foreground"
                          : "font-normal text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (animated ? (
                          <motion.span
                            layoutId="sidebar-nav-active"
                            className="absolute inset-0 rounded-lg bg-sidebar-accent"
                            transition={SPRING}
                          />
                        ) : (
                          <span className="absolute inset-0 rounded-lg bg-sidebar-accent" />
                        ))}
                        <span className="relative z-10 flex min-w-0 items-center gap-2.5">
                          <link.icon className="h-[18px] w-[18px] shrink-0" />
                          <span className="truncate">{link.label}</span>
                        </span>
                        {link.badgeKey === "pendingAttendance" && unreadCount > 0 && (
                          <span className="relative z-10"><Badge count={unreadCount} /></span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
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
  // Ưu tiên logo; rê chuột vào logo thì logo hoá thành nút mở rộng.
  const [logoHover, setLogoHover] = useState(false);

  return (
    <aside className="flex h-full w-[68px] flex-col items-center bg-sidebar py-3">
      <div
        className="relative mb-4 h-9 w-9 shrink-0"
        onMouseEnter={() => setLogoHover(true)}
        onMouseLeave={() => setLogoHover(false)}
      >
        <img
          src="/codeclass-mark-round.png?v=round-1"
          alt=""
          className={cn("h-9 w-9 select-none transition-opacity duration-150", logoHover ? "opacity-0" : "opacity-100")}
        />
        <button
          onClick={onToggleDesktop}
          aria-label="Mở rộng sidebar"
          title="Mở rộng sidebar"
          className={cn(
            "absolute inset-0 grid place-items-center rounded-lg text-muted-foreground transition-opacity duration-150 hover:bg-muted hover:text-foreground",
            logoHover ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <PanelLeftOpen className="h-[18px] w-[18px]" />
        </button>
      </div>

      <nav className="scrollbar-none flex flex-1 flex-col items-center gap-3 overflow-y-auto px-2 py-1 no-scrollbar">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/dashboard"}
            title={link.label}
            className={({ isActive }) =>
              cn(
                "relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-150",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="rail-nav-active"
                    className="absolute inset-0 rounded-xl bg-sidebar-accent"
                    transition={SPRING}
                  />
                )}
                <link.icon className="relative z-10 h-5 w-5" />
                {link.badgeKey === "pendingAttendance" && unreadCount > 0 && (
                  <span className="absolute right-1 top-1 z-20 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-destructive" />
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
    <div className="shrink-0 border-t border-sidebar-border px-4 py-3">
      <p className="truncate text-sm font-medium text-foreground">{user?.fullName}</p>
      <p className="text-xs capitalize text-muted-foreground">{roleLabel(user?.role)}</p>
      {tokenBalance != null && (
        <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-foreground/80">
          <Coins className="size-3.5 text-amber-500" /> {tokenBalance.toLocaleString("vi-VN")} tokens
        </p>
      )}
    </div>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground shadow-sm">
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
