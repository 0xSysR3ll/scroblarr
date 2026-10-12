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
  getSyncStatus,
  shouldShowRewatchedBadge,
} from "@utils/syncHistory";
import { useTranslation } from "react-i18next";
import { FaCheckCircle, FaExclamationCircle } from "react-icons/fa";

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
          ? "bg-destructive/10"
          : isSelected
            ? "bg-warning-50 dark:bg-warning-950"
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
              <SyncHistoryMediaLinks item={item} />
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
            <SyncHistorySourceBadge source={item.source} />
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
            <FaCheckCircle className="h-4 w-4 text-success-500" />
          ) : syncStatus === "partial" ? (
            <FaExclamationCircle className="h-4 w-4 text-warning-500" />
          ) : (
            <FaExclamationCircle className="h-4 w-4 text-destructive" />
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
          <div className="mt-1 max-w-xs truncate text-xs text-destructive">
            {item.errorMessage}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-right">
        <SyncHistoryItemActions
          syncStatus={syncStatus}
          isConfirming={isConfirming}
          isDeleting={isDeleting}
          isRetrying={isRetrying}
          isAnyRetrying={isAnyRetrying}
          onDelete={onDelete}
          onCancelDelete={onCancelDelete}
          onRetry={onRetry}
        />
      </td>
    </tr>
  );
}
