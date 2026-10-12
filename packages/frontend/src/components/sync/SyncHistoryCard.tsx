import { SyncDestinationBadges } from "@components/sync/SyncDestinationBadges";
import { SyncHistoryItemActions } from "@components/sync/SyncHistoryItemActions";
import { SyncHistoryMediaLinks } from "@components/sync/SyncHistoryMediaLinks";
import { SyncHistoryPoster } from "@components/sync/SyncHistoryPoster";
import { SyncHistorySourceBadge } from "@components/sync/SyncHistorySourceBadge";
import { CustomCheckbox } from "@components/ui/CustomCheckbox";
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
import { FaCheckCircle, FaExclamationCircle } from "react-icons/fa";

interface SyncHistoryCardProps {
  item: SyncHistoryItem;
  isSelected: boolean;
  confirmDeleteId: string | null;
  deleting: string | null;
  retrying: string | null;
  onSelect: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
  onRetry: () => void;
}

export function SyncHistoryCard({
  item,
  isSelected,
  confirmDeleteId,
  deleting,
  retrying,
  onSelect,
  onDelete,
  onCancelDelete,
  onRetry,
}: SyncHistoryCardProps) {
  const { t } = useTranslation();
  const isConfirming = confirmDeleteId === item.id;
  const isDeleting = deleting === item.id;
  const isRetrying = retrying === item.id;
  const isAnyRetrying = retrying !== null;
  const syncStatus = getSyncStatus(item);

  return (
    <div
      className={`surface-panel p-2.5 transition-colors ${
        isConfirming
          ? "border-destructive bg-destructive/10"
          : isSelected
            ? "border-warning-500 bg-warning-50 dark:border-warning-600 dark:bg-warning-950"
            : "hover:border-muted-foreground/40"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="pt-0.5">
          <CustomCheckbox
            checked={isSelected}
            onChange={onSelect}
            ariaLabel={t("sync.selectHistoryItem", {
              defaultValue: "Select {{title}}",
              title: formatMediaTitle(item),
            })}
          />
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
                <FaCheckCircle className="h-4 w-4 shrink-0 text-success-500" />
              ) : syncStatus === "partial" ? (
                <FaExclamationCircle className="h-4 w-4 shrink-0 text-warning-500" />
              ) : (
                <FaExclamationCircle className="h-4 w-4 shrink-0 text-destructive" />
              )}
              <SyncHistoryItemActions
                syncStatus={syncStatus}
                isConfirming={isConfirming}
                isDeleting={isDeleting}
                isRetrying={isRetrying}
                isAnyRetrying={isAnyRetrying}
                size="compact"
                onDelete={onDelete}
                onCancelDelete={onCancelDelete}
                onRetry={onRetry}
              />
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
              <SyncHistorySourceBadge
                source={item.source}
                iconClassName="w-2.5 h-2.5"
              />
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
              <SyncHistoryMediaLinks item={item} />
            </div>
          )}

          {/* Error Message */}
          {!item.success && item.errorMessage && (
            <div className="mt-1.5 rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              {item.errorMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
