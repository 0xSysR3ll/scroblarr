import type { ReactNode } from "react";

interface PageBackgroundProps {
  children: ReactNode;
}

export function PageBackground({ children }: PageBackgroundProps) {
  return (
    <div className="min-h-screen dark:bg-[#020617] bg-gray-100 relative">
      <div className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-70 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/40 dark:bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/40 dark:bg-indigo-500/20 rounded-full blur-3xl" />
      </div>
      <div className="relative z-10 flex flex-col min-h-screen">{children}</div>
    </div>
  );
}
