import { SyncDestinationBadges } from "@components/sync/SyncDestinationBadges";
import { SyncHistoryPoster } from "@components/sync/SyncHistoryPoster";
import { CustomCheckbox } from "@components/ui/CustomCheckbox";
import { Spinner } from "@components/ui/spinner";
import type { SyncHistoryItem } from "@services/api";
import {
  formatDate,
  formatMediaTitle,
  formatRelativeTime,
  getMediaLinks,
  getSyncStatus,
  shouldShowRewatchedBadge,
} from "@utils/syncHistory";
import { useTranslation } from "react-i18next";
import {
  FaTrash,
  FaCheck,
  FaTimes,
  FaCheckCircle,
  FaExclamationCircle,
  FaExternalLinkAlt,
} from "react-icons/fa";

interface SyncHistoryCardProps {
  item: SyncHistoryItem;
  isSelected: boolean;
  confirmDeleteId: string | null;
  deleting: string | null;
  onSelect: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}

export function SyncHistoryCard({
  item,
  isSelected,
  confirmDeleteId,
  deleting,
  onSelect,
  onDelete,
  onCancelDelete,
}: SyncHistoryCardProps) {
  const { t } = useTranslation();
  const isConfirming = confirmDeleteId === item.id;
  const isDeleting = deleting === item.id;
  const syncStatus = getSyncStatus(item);

  return (
    <div
      className={`rounded-lg border bg-card p-2.5 text-card-foreground shadow-sm transition-colors ${
        isConfirming
          ? "border-red-500 dark:border-red-600 bg-red-50 dark:bg-red-950"
          : isSelected
            ? "border-orange-500 dark:border-orange-600 bg-orange-50 dark:bg-orange-950"
            : "border-border hover:border-muted-foreground/40"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="pt-0.5">
          <CustomCheckbox checked={isSelected} onChange={onSelect} />
        </div>
        <SyncHistoryPoster item={item} size="compact" />
        <div className="flex-1 min-w-0">
          {/* Header: Title + Status + Delete */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex-1 min-w-0">
              <div className="line-clamp-1 text-sm font-semibold text-foreground">
                {formatMediaTitle(item)}
              </div>
            </div>
            <div
              className="flex items-center gap-1.5 shrink-0"
              title={item.errorMessage}
            >
              {syncStatus === "success" ? (
                <FaCheckCircle className="h-4 w-4 text-green-500 dark:text-green-400 shrink-0" />
              ) : syncStatus === "partial" ? (
                <FaExclamationCircle className="h-4 w-4 text-yellow-500 dark:text-yellow-400 shrink-0" />
              ) : (
                <FaExclamationCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0" />
              )}
              {isConfirming ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="text-red-600 dark:text-red-500 hover:text-red-900 dark:hover:text-red-400 disabled:opacity-50 p-1"
                    title={t("sync.confirmDelete", {
                      defaultValue: "Confirm delete",
                    })}
                  >
                    {isDeleting ? (
                      <Spinner size="sm" />
                    ) : (
                      <FaCheck className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={onCancelDelete}
                    disabled={isDeleting}
                    className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    title={t("sync.cancel", {
                      defaultValue: "Cancel",
                    })}
                  >
                    <FaTimes className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={onDelete}
                  className="p-1 text-muted-foreground transition-colors hover:text-destructive"
                  title={t("sync.deleteItemTitle", {
                    defaultValue: "Delete this item",
                  })}
                >
                  <FaTrash className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Metadata: Time + Type + Rewatched */}
          <div className="flex items-center gap-1.5 mb-2">
            <span
              className="text-xs text-muted-foreground"
              title={formatDate(item.syncedAt)}
            >
              {formatRelativeTime(item.syncedAt, t)}
            </span>
            <span className="text-xs text-muted-foreground/50">•</span>
            <span className="rounded px-1.5 py-0.5 text-xs uppercase tracking-wide bg-muted text-muted-foreground">
              {item.mediaType}
            </span>
            {shouldShowRewatchedBadge(item) && (
              <>
                <span className="text-xs text-muted-foreground/50">•</span>
                <span
                  className="px-1.5 py-0.5 text-xs rounded bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 font-medium"
                  title={t("sync.rewatched", {
                    defaultValue: "Rewatched",
                  })}
                >
                  {t("sync.rewatched", { defaultValue: "Rewatched" })}
                </span>
              </>
            )}
          </div>

          {/* Source */}
          {item.source && (
            <div className="mb-2">
              {item.source === "plex" ? (
                <div className="inline-flex items-center gap-1 rounded bg-[var(--plex-chip-bg)] px-1.5 py-0.5 text-[var(--plex-chip-fg)]">
                  <img
                    src="/logos/plex.svg"
                    alt="Plex"
                    className="w-2.5 h-2.5"
                  />
                  <span className="text-xs font-medium">
                    {t("sync.sources.plex", {
                      defaultValue: "Plex",
                    })}
                  </span>
                </div>
              ) : item.source === "jellyfin" ? (
                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900 rounded">
                  <img
                    src="/logos/jellyfin.svg"
                    alt="Jellyfin"
                    className="w-2.5 h-2.5"
                  />
                  <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                    {t("sync.sources.jellyfin", {
                      defaultValue: "Jellyfin",
                    })}
                  </span>
                </div>
              ) : (
                <span className="text-xs capitalize text-muted-foreground">
                  {item.source}
                </span>
              )}
            </div>
          )}

          {/* Destinations */}
          <SyncDestinationBadges
            item={item}
            className="mb-2 flex flex-wrap items-center gap-1.5"
          />

          {/* External Links */}
          {getMediaLinks(item).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {getMediaLinks(item).map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
                    link.needsDarkBg
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                  title={`${link.label}: ${link.url}`}
                >
                  <img
                    src={link.logoPath}
                    alt={link.label}
                    className="h-3 w-auto"
                  />
                  <FaExternalLinkAlt className="h-2.5 w-2.5" />
                </a>
              ))}
            </div>
          )}

          {/* Error Message */}
          {!item.success && item.errorMessage && (
            <div className="mt-1.5 text-xs dark:text-red-300 text-red-600 bg-red-50 dark:bg-red-950 rounded px-2 py-1.5 border border-red-200 dark:border-red-800">
              {item.errorMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
