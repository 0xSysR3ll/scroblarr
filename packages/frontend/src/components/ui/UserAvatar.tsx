import { useState } from "react";

import { cn } from "@/lib/utils";

function getInitials(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-10 w-10 text-sm",
  xl: "h-12 w-12 text-lg",
} as const;

type UserAvatarSize = keyof typeof sizeClasses;

interface UserAvatarProps {
  name?: string | null;
  src?: string | null;
  alt?: string;
  size?: UserAvatarSize;
  className?: string;
}

export function UserAvatar({
  name,
  src,
  alt,
  size = "md",
  className,
}: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const label = alt ?? name ?? "User";
  const showImage = Boolean(src) && src !== failedSrc;

  if (src && showImage) {
    return (
      <img
        src={src}
        alt={label}
        className={cn(
          "shrink-0 rounded-full border-2 border-border object-cover",
          sizeClasses[size],
          className
        )}
        onError={() => setFailedSrc(src)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border-2 border-border bg-primary font-semibold text-primary-foreground",
        sizeClasses[size],
        className
      )}
    >
      <span aria-hidden="true">{getInitials(name)}</span>
    </div>
  );
}
