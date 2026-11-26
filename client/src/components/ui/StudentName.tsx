import { useAuthContext } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";

type StudentNameProps = {
  fullName: string;
  nickname?: string | null;
  className?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
  title?: string;
  inline?: boolean;
};

/**
 * Keeps student identity consistent across staff UI without increasing a row's
 * visual weight: real name stays primary; the optional nickname is one compact
 * muted line below it (or inline when `inline` is set). Students continue to see only their public nickname.
 */
export function StudentName({
  fullName,
  nickname,
  className,
  primaryClassName,
  secondaryClassName,
  title,
  inline = false,
}: StudentNameProps) {
  const { user } = useAuthContext();
  const isStaff = user?.role === "admin" || user?.role === "teacher" || user?.role === "teaching_assistant";
  const normalizedNickname = nickname?.trim() || "";
  const showNickname = isStaff && normalizedNickname && normalizedNickname !== fullName;
  const primaryName = isStaff ? fullName : normalizedNickname || fullName;

  if (inline) {
    return (
      <span className={cn("block min-w-0 truncate leading-tight", className)} title={title ?? fullName}>
        <span className={primaryClassName}>{primaryName}</span>
        {showNickname && (
          <span className={cn("ml-1 text-[10px] font-normal text-muted-foreground", secondaryClassName)}>
            · {normalizedNickname}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={cn("min-w-0 leading-tight", className)} title={title ?? fullName}>
      <span className={cn("block truncate", primaryClassName)}>{primaryName}</span>
      {showNickname && (
        <span className={cn("mt-0.5 block truncate text-[10px] font-normal leading-3 text-muted-foreground", secondaryClassName)}>
          {normalizedNickname}
        </span>
      )}
    </span>
  );
}
