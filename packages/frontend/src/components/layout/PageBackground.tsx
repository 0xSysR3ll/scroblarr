import type { ReactNode } from "react";

interface PageBackgroundProps {
  children: ReactNode;
}

export function PageBackground({ children }: PageBackgroundProps) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,_oklch(0.72_0.1_245_/_0.07),_transparent_60%)] dark:bg-[radial-gradient(120%_80%_at_50%_-10%,_oklch(0.5_0.12_245_/_0.1),_transparent_55%)]" />
        <div
          className="absolute inset-0 opacity-[0.04] dark:opacity-[0.05]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            backgroundRepeat: "repeat",
            backgroundSize: "180px 180px",
          }}
        />
      </div>
      <div className="relative z-10 flex min-h-screen flex-col">{children}</div>
    </div>
  );
}
