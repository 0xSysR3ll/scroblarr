import type { SyncHistoryItem } from "@services/api";
import { formatMediaTitle, getPosterUrl } from "@utils/syncHistory";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaImage } from "react-icons/fa";

const sizeClasses = {
  compact: "w-12 h-16",
  default: "w-14 h-20",
} as const;

const iconClasses = {
  compact: "h-5 w-5",
  default: "h-6 w-6",
} as const;

interface SyncHistoryPosterProps {
  item: SyncHistoryItem;
  size?: keyof typeof sizeClasses;
}

export function SyncHistoryPoster({
  item,
  size = "default",
}: SyncHistoryPosterProps) {
  const { t } = useTranslation();
  const posterUrl = getPosterUrl(item);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [item.id, posterUrl]);

  const placeholderLabel = t("sync.posterPlaceholder", {
    defaultValue: "No poster available",
  });

  const showImage = Boolean(posterUrl) && !loadFailed;
  const frame = `${sizeClasses[size]} shrink-0 overflow-hidden rounded shadow-sm border border-border/60 bg-muted`;

  if (showImage) {
    return (
      <div className={frame}>
        <img
          src={posterUrl}
          alt={formatMediaTitle(item)}
          className="h-full w-full object-cover"
          onError={() => setLoadFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`${frame} flex items-center justify-center text-muted-foreground`}
      role="img"
      aria-label={placeholderLabel}
      title={placeholderLabel}
    >
      <FaImage className={`${iconClasses[size]} opacity-45`} aria-hidden />
    </div>
  );
}
