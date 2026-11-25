import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

type WorkspaceShellProps = {
  sidebar?: ReactNode;
  children: ReactNode;
  sidebarClassName?: string;
  mainClassName?: string;
};

type WorkspacePanelProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  minHeightClassName?: string;
  /** When nested inside another bordered section, drop the panel's own frame. */
  bare?: boolean;
};

type WorkspaceTabProps = {
  active: boolean;
  icon?: ReactNode;
  onClick: () => void;
  children: ReactNode;
};

export function StudentWorkspaceShell({
  sidebar,
  children,
  sidebarClassName = "",
  mainClassName = "",
}: WorkspaceShellProps) {
  return (
    <div className={sidebar ? "grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]" : "grid gap-4"}>
      {sidebar && (
        <aside className={`space-y-3 lg:sticky lg:top-24 lg:self-start ${sidebarClassName}`}>
          {sidebar}
        </aside>
      )}
      <main className={`min-w-0 ${mainClassName}`}>{children}</main>
    </div>
  );
}

export function StudentWorkspacePanel({
  eyebrow,
  title,
  action,
  tabs,
  children,
  minHeightClassName = "min-h-[680px]",
  bare = false,
}: WorkspacePanelProps) {
  return (
    <section
      className={cn(
        "overflow-hidden",
        bare
          ? "rounded-none border-0 bg-transparent shadow-none"
          : "rounded-xl border border-border bg-card shadow-card"
      )}
    >
      <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p> : null}
          <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {tabs ? <div className="flex border-b border-border bg-muted/40 px-5">{tabs}</div> : null}
      <div className={minHeightClassName}>{children}</div>
    </section>
  );
}

export function StudentWorkspaceTab({ active, icon, onClick, children }: WorkspaceTabProps) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-1 py-3 text-sm font-semibold transition ${
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
