import { Spinner } from "@components/ui/spinner";
import type { SyncItemStatus } from "@utils/syncHistory";
import { useTranslation } from "react-i18next";
import { FaTrash, FaCheck, FaTimes, FaRedo } from "react-icons/fa";

interface SyncHistoryItemActionsProps {
  syncStatus: SyncItemStatus;
  isConfirming: boolean;
  isDeleting: boolean;
  isRetrying: boolean;
  isAnyRetrying: boolean;
  size?: "compact" | "default";
  onDelete: () => void;
  onCancelDelete: () => void;
  onRetry: () => void;
}

export function SyncHistoryItemActions({
  syncStatus,
  isConfirming,
  isDeleting,
  isRetrying,
  isAnyRetrying,
  size = "default",
  onDelete,
  onCancelDelete,
  onRetry,
}: SyncHistoryItemActionsProps) {
  const { t } = useTranslation();
  const spinnerSize = size === "compact" ? "sm" : "md";
  const actionIconClass = size === "compact" ? "h-3.5 w-3.5" : "h-4 w-4";
  const trashIconClass = size === "compact" ? "h-4 w-4" : "h-5 w-5";
  const confirmClass =
    size === "compact"
      ? "inline-flex size-8 cursor-pointer items-center justify-center text-destructive hover:text-destructive/80 disabled:opacity-50"
      : "inline-flex size-8 cursor-pointer items-center justify-center text-success-600 hover:text-success-800 disabled:opacity-50 dark:text-success-400 dark:hover:text-success-300";
  const containerClass =
    size === "compact"
      ? "flex items-center gap-1"
      : "flex items-center justify-end gap-1.5";

  if (isConfirming) {
    return (
      <div className={containerClass}>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className={confirmClass}
          title={t("sync.confirmDelete", {
            defaultValue: "Confirm delete",
          })}
          aria-label={t("sync.confirmDelete", {
            defaultValue: "Confirm delete",
          })}
        >
          {isDeleting ? (
            <Spinner size={spinnerSize} />
          ) : (
            <FaCheck className={actionIconClass} />
          )}
        </button>
        <button
          type="button"
          onClick={onCancelDelete}
          disabled={isDeleting}
          className="inline-flex size-8 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
          title={t("sync.cancel", {
            defaultValue: "Cancel",
          })}
          aria-label={t("sync.cancel", {
            defaultValue: "Cancel",
          })}
        >
          <FaTimes className={actionIconClass} />
        </button>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      {(syncStatus === "failed" || syncStatus === "partial") && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isAnyRetrying}
          className="inline-flex size-8 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          title={t("sync.retryItemTitle", {
            defaultValue: "Retry this sync",
          })}
          aria-label={t("sync.retryItemTitle", {
            defaultValue: "Retry this sync",
          })}
        >
          {isRetrying ? (
            <Spinner size={spinnerSize} />
          ) : (
            <FaRedo className={actionIconClass} />
          )}
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex size-8 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-destructive"
        title={t("sync.deleteItemTitle", {
          defaultValue: "Delete this item",
        })}
        aria-label={t("sync.deleteItemTitle", {
          defaultValue: "Delete this item",
        })}
      >
        <FaTrash className={trashIconClass} />
      </button>
    </div>
  );
}
