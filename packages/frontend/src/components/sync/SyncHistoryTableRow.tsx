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
  FaRedo,
} from "react-icons/fa";

interface SyncHistoryTableRowProps {
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

export function SyncHistoryTableRow({
  item,
  isSelected,
  confirmDeleteId,
  deleting,
  retrying,
  onSelect,
  onDelete,
  onCancelDelete,
  onRetry,
}: SyncHistoryTableRowProps) {
  const { t } = useTranslation();
  const isConfirming = confirmDeleteId === item.id;
  const isDeleting = deleting === item.id;
  const isRetrying = retrying === item.id;
  const isAnyRetrying = retrying !== null;
  const syncStatus = getSyncStatus(item);
  const statusLabel =
    syncStatus === "success"
      ? t("common.success", { defaultValue: "Success" })
      : syncStatus === "partial"
        ? t("sync.statuses.partial", { defaultValue: "Partial" })
        : t("common.failed", { defaultValue: "Failed" });

  return (
    <tr
      className={
        isConfirming
          ? "bg-red-50 dark:bg-red-950"
          : isSelected
            ? "bg-orange-50 dark:bg-orange-950"
            : "hover:bg-muted/50"
      }
    >
      <td className="px-4 py-2.5 whitespace-nowrap">
        <CustomCheckbox
          checked={isSelected}
          onChange={onSelect}
          ariaLabel={t("sync.selectHistoryItem", {
            defaultValue: "Select {{title}}",
            title: formatMediaTitle(item),
          })}
        />
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <div
          className="text-xs text-muted-foreground"
          title={formatDate(item.syncedAt)}
        >
          {formatRelativeTime(item.syncedAt, t)}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <SyncHistoryPoster item={item} size="default" />
          <div className="flex flex-col gap-1 min-w-0">
            <span className="truncate text-sm font-semibold text-foreground">
              {formatMediaTitle(item)}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
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
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-center">
        <span className="rounded px-1.5 py-0.5 text-xs uppercase tracking-wide bg-muted text-muted-foreground">
          {item.mediaType}
        </span>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {item.source ? (
          <div className="flex items-center justify-center">
            {item.source === "plex" ? (
              <div className="flex items-center gap-1 rounded bg-(--plex-chip-bg) px-2 py-0.5 text-(--plex-chip-fg)">
                <img src="/logos/plex.svg" alt="Plex" className="w-3 h-3" />
                <span className="text-xs font-medium">
                  {t("sync.sources.plex", {
                    defaultValue: "Plex",
                  })}
                </span>
              </div>
            ) : item.source === "jellyfin" ? (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900 rounded">
                <img
                  src="/logos/jellyfin.svg"
                  alt="Jellyfin"
                  className="w-3 h-3"
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
        ) : (
          <span className="text-xs text-muted-foreground/50">-</span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          <SyncDestinationBadges
            item={item}
            emptyFallback={
              <span className="text-xs text-muted-foreground/50">-</span>
            }
          />
        </div>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <div className="flex items-center gap-2" title={item.errorMessage}>
          {syncStatus === "success" ? (
            <FaCheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
          ) : syncStatus === "partial" ? (
            <FaExclamationCircle className="h-4 w-4 text-yellow-500 dark:text-yellow-400" />
          ) : (
            <FaExclamationCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
          )}
          <span className="text-xs font-medium text-foreground/90">
            {statusLabel}
          </span>
          {shouldShowRewatchedBadge(item) && (
            <span
              className="px-1.5 py-0.5 text-xs rounded bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 font-medium"
              title={t("sync.rewatched", {
                defaultValue: "Rewatched",
              })}
            >
              {t("sync.rewatched", { defaultValue: "Rewatched" })}
            </span>
          )}
        </div>
        {!item.success && item.errorMessage && (
          <div className="mt-1 text-xs dark:text-red-300 text-red-600 max-w-xs truncate">
            {item.errorMessage}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-right">
        {isConfirming ? (
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="text-green-600 dark:text-green-500 hover:text-green-900 dark:hover:text-green-400 disabled:opacity-50 p-1"
              title={t("sync.confirmDelete", {
                defaultValue: "Confirm delete",
              })}
            >
              {isDeleting ? (
                <Spinner size="md" />
              ) : (
                <FaCheck className="h-4 w-4" />
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
              <FaTimes className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1.5">
            {syncStatus === "failed" && (
              <button
                type="button"
                onClick={onRetry}
                disabled={isAnyRetrying}
                className="p-1 text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                title={t("sync.retryItemTitle", {
                  defaultValue: "Retry this sync",
                })}
                aria-label={t("sync.retryItemTitle", {
                  defaultValue: "Retry this sync",
                })}
              >
                {isRetrying ? (
                  <Spinner size="md" />
                ) : (
                  <FaRedo className="h-4 w-4" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              className="p-1 text-muted-foreground transition-colors hover:text-destructive"
              title={t("sync.deleteItemTitle", {
                defaultValue: "Delete this item",
              })}
            >
              <FaTrash className="h-4 w-4" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
