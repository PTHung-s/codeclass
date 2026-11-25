import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Shared mascot side panel for Login/Register (previously copy-pasted and
 * diverged in each page).
 */
export function AuthMascotPanel({ message }: { message: string }) {
  return (
    <aside className="hidden items-center justify-center bg-muted/50 lg:flex">
      <div className="flex w-[280px] flex-col items-center">
        <div className="relative mb-1.5 inline-block max-w-[336px] rounded-2xl border border-border bg-card px-4 py-3 text-center text-sm leading-relaxed shadow-sm">
          {message}
          <div className="absolute left-1/2 top-full -translate-x-1/2">
            <div className="border-x-8 border-t-8 border-x-transparent border-t-card" />
            <div className="absolute left-1/2 top-0 -z-10 -translate-x-1/2 translate-y-px border-x-8 border-t-8 border-x-transparent border-t-border" />
          </div>
        </div>
        <img
          src="/mascot/idle.gif"
          alt="Mascot CodeClass"
          className="h-[280px] w-[280px] object-contain"
        />
      </div>
    </aside>
  );
}

interface AuthLayoutProps {
  children: ReactNode;
  mascotMessage: string;
}

/**
 * Two-column auth shell: form on the left, mascot panel on the right.
 * Neutral palette, identical brand header on Login and Register.
 */
export function AuthLayout({ children, mascotMessage }: AuthLayoutProps) {
  return (
    <main className="grid min-h-[100dvh] bg-background text-foreground lg:grid-cols-2">
      <div className="flex items-center justify-center p-6 lg:p-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <AuthMascotPanel message={mascotMessage} />
    </main>
  );
}

export function AuthBrand() {
  return (
    <Link to="/login" className="mb-8 flex w-fit items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
      <img src="/codeclass-mark-round.png?v=round-1" alt="" className="h-8 w-8" />
      CodeClass
    </Link>
  );
}
