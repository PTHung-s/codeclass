import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications, Notification } from "../../hooks/useNotifications";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import {
  Award,
  Bell,
  FileText,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  MessageSquare,
  BellOff,
  CheckCheck,
  ClipboardList,
  Coins,
  Heart,
  BookOpenCheck,
  Bug,
} from "lucide-react";

interface NotificationDropdownProps {
  open: boolean;
  onClose: () => void;
}

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  assignment: ClipboardList,
  assignment_published: ClipboardList,
  assignment_reminder: AlertTriangle,
  assignment_reward: Award,
  new_submission: FileText,
  late_submission: AlertTriangle,
  submission_reviewed: CheckCircle2,
  revision_requested: RefreshCw,
  honour_praise: Heart,
  exam_published: BookOpenCheck,
  exam_graded: CheckCircle2,
  reward_redemption: Coins,
  badge: Award,
  bug_report: Bug,
};

const typeLabels: Record<string, string> = {
  assignment: "Bài tập",
  assignment_published: "Bài tập",
  assignment_reminder: "Nhắc hạn",
  assignment_reward: "Thưởng bài tập",
  new_submission: "Bài nộp",
  late_submission: "Nộp muộn",
  submission_reviewed: "Đã chấm",
  revision_requested: "Cần sửa",
  honour_praise: "Lời khen",
  exam_published: "Phòng thi",
  exam_graded: "Điểm thi",
  reward_redemption: "Đổi thưởng",
  badge: "Huy hiệu",
  bug_report: "Báo lỗi",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  if (days < 7) return `${days} ngày trước`;
  return new Date(dateStr).toLocaleDateString("vi-VN");
}

export default function NotificationDropdown({ open, onClose }: NotificationDropdownProps) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { user } = useAuthContext();
  const staff = isStaff(user?.role);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  if (!open) return null;

  const handleClick = (n: Notification) => {
    markRead(n.id);
    const id = n.relatedEntityId;
    const entityType = n.relatedEntityType;

    if (entityType === "course" && id) {
      navigate(`/courses/${id}`);
    } else if (entityType === "session_course" && id) {
      navigate(`/course/${id}`);
    } else if (entityType === "assignment" || entityType === "submission") {
      navigate(staff ? "/assignments" : "/my-assignments");
    } else if (entityType === "checklist") {
      navigate("/checklist");
    } else if (entityType === "exam" && id) {
      navigate(n.type === "exam_graded" && !staff ? `/exams/${id}/result` : `/exams/${id}`);
    } else if (entityType === "problem" && id) {
      navigate(`/problems/${id}`);
    } else if (entityType === "reward_redemption") {
      navigate("/tokens");
    } else if (entityType === "badge") {
      navigate("/dashboard");
    } else if (entityType === "HonourPraise") {
      navigate("/leaderboard");
    } else if (entityType === "bug_report" && id) {
      navigate(`/bug-reports/${id}`);
    }
    onClose();
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-elevated"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Thông báo</h3>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
              {unreadCount}
            </span>
          ) : null}
        </div>
        {unreadCount > 0 ? (
          <button
            onClick={() => markAllRead()}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Đọc tất cả
          </button>
        ) : null}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <BellOff className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">Không có thông báo</p>
            <p className="mt-1 text-xs text-muted-foreground">Thông báo mới sẽ xuất hiện ở đây</p>
          </div>
        ) : (
          notifications.map((n) => {
            const Icon = typeIcons[n.type] || MessageSquare;
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/60 ${
                  !n.isRead ? "bg-primary/5" : ""
                }`}
              >
                <div
                  className={`shrink-0 rounded-lg p-1.5 ${
                    n.isRead ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm ${
                      !n.isRead ? "font-semibold text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {n.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{n.message}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {typeLabels[n.type] || "Thông báo"}
                    </span>
                    <span className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                  </div>
                </div>
                {!n.isRead ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
