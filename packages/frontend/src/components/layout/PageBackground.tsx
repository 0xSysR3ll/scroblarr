import type { ReactNode } from "react";

interface PageBackgroundProps {
  children: ReactNode;
}

export function PageBackground({ children }: PageBackgroundProps) {
  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-50 dark:opacity-60"
        aria-hidden
      >
        <div className="absolute -top-32 -right-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl dark:bg-primary/15" />
        <div className="absolute top-1/3 -left-28 h-64 w-64 rounded-full bg-accent/40 blur-3xl dark:bg-accent/20" />
        <div className="absolute -bottom-36 right-1/4 h-80 w-80 rounded-full bg-primary/15 blur-3xl dark:bg-primary/10" />
      </div>
      <div className="relative z-10 flex min-h-screen flex-col">{children}</div>
    </div>
  );
}
