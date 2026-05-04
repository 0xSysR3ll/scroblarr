import * as React from "react";

import { cn } from "@/lib/utils";

const spinnerSizes = {
  xs: "size-3 border-2",
  sm: "size-3.5 border-2",
  md: "size-4 border-2",
  lg: "size-5 border-2",
  xl: "size-8 border-2",
  "2xl": "size-9 border-2",
} as const;

const spinnerVariants = {
  /** Muted ring with primary accent (page and inline loading). */
  default: "border-muted border-t-primary",
  /** For use on solid primary buttons. */
  onPrimary: "border-primary-foreground/30 border-t-primary-foreground",
} as const;

export type SpinnerProps = React.HTMLAttributes<HTMLDivElement> & {
  size?: keyof typeof spinnerSizes;
  variant?: keyof typeof spinnerVariants;
};

export function Spinner({
  className,
  size = "md",
  variant = "default",
  "aria-label": ariaLabel = "Loading",
  ...props
}: SpinnerProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
      className={cn(
        "box-border shrink-0 animate-spin rounded-full border-solid",
        spinnerSizes[size],
        spinnerVariants[variant],
        className
      )}
      {...props}
    />
  );
}
