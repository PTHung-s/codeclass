import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "../../lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  className?: string;
}

/**
 * The one page header recipe: optional back link, semibold tracking-tight
 * title, muted description, right-aligned actions. Replaces the ~6 ad-hoc
 * header patterns that existed across pages.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  onBack,
  backLabel = "Quay lại",
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {onBack ? (
          <button
            onClick={onBack}
            className="mb-1.5 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {backLabel}
          </button>
        ) : null}
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
