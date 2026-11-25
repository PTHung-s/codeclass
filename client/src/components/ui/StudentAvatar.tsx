import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { cn, getAnimalAvatarUrl, getAvatarBgColor } from "../../lib/utils";
import { StudentName } from "./StudentName";

interface StudentAvatarProps {
  studentId?: string | null;
  fullName: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  showName?: boolean;
  showEmail?: boolean;
  email?: string;
  className?: string;
  clickable?: boolean;
}

const sizeClasses = {
  sm: "size-6 text-[10px]",
  md: "size-8",
  lg: "size-10",
  xl: "!size-16 text-xl font-bold",
};

export default function StudentAvatar({
  studentId,
  fullName,
  nickname,
  avatarUrl,
  size = "md",
  showName = true,
  showEmail = false,
  email,
  className = "",
  clickable = true,
}: StudentAvatarProps) {
  const initial = fullName?.charAt(0) || "?";
  const canNavigate = clickable && Boolean(studentId);
  // Use custom avatar if set, otherwise use animal avatar API
  const animalUrl = getAnimalAvatarUrl(fullName);
  const src = avatarUrl || animalUrl;

  const bgColor = getAvatarBgColor(fullName);
  const avatar = (
    <div className={cn("relative shrink-0 inline-flex overflow-hidden rounded-full", sizeClasses[size])} style={{ backgroundColor: bgColor }}>
      <img
        src={src}
        alt={fullName}
        className="relative z-10 size-full rounded-full object-cover"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
      <div className="absolute inset-0 z-0 flex size-full items-center justify-center rounded-full font-bold text-white text-sm">
        {initial}
      </div>
    </div>
  );

  if (!canNavigate) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        {avatar}
        {showName && (
          <div className="min-w-0">
            <StudentName fullName={fullName} nickname={nickname} primaryClassName="text-sm font-medium text-gray-900 dark:text-white" />
            {showEmail && email && (
              <p className="text-xs text-gray-500 truncate dark:text-gray-400">{email}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      to={`/students/${studentId}`}
      className={cn("group flex items-center gap-3 rounded-lg p-1 -m-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors", className)}
      title={`Xem hồ sơ ${fullName}`}
    >
      <div className="relative shrink-0">
        {avatar}
        <ExternalLink className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 rounded-full p-0.5" />
      </div>
      {showName && (
        <div className="min-w-0">
          <StudentName fullName={fullName} nickname={nickname} primaryClassName="text-sm font-medium text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors" />
          {showEmail && email && (
            <p className="text-xs text-gray-500 truncate dark:text-gray-400">{email}</p>
          )}
        </div>
      )}
    </Link>
  );
}
