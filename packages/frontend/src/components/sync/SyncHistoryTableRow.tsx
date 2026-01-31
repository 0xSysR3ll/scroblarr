import {
  FaTrash,
  FaSpinner,
  FaCheck,
  FaTimes,
  FaCheckCircle,
  FaExclamationCircle,
  FaExternalLinkAlt,
} from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { CustomCheckbox } from "@components/ui/CustomCheckbox";
import type { SyncHistoryItem } from "@services/api";
import {
  formatMediaTitle,
  formatRelativeTime,
  getMediaLinks,
  getPosterUrl,
} from "@utils/syncHistory";

interface SyncHistoryTableRowProps {
  item: SyncHistoryItem;
  isSelected: boolean;
  confirmDeleteId: string | null;
  deleting: string | null;
  onSelect: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}

export function SyncHistoryTableRow({
  item,
  isSelected,
  confirmDeleteId,
  deleting,
  onSelect,
  onDelete,
  onCancelDelete,
}: SyncHistoryTableRowProps) {
  const { t } = useTranslation();
  const isConfirming = confirmDeleteId === item.id;
  const isDeleting = deleting === item.id;

  return (
    <tr
      className={
        isConfirming
          ? "bg-red-50 dark:bg-red-950"
          : isSelected
            ? "bg-orange-50 dark:bg-orange-950"
            : "hover:bg-gray-50 dark:hover:bg-[#2d2d2d]"
      }
    >
      <td className="px-4 py-2.5 whitespace-nowrap">
        <CustomCheckbox checked={isSelected} onChange={onSelect} />
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <div className="text-xs dark:text-slate-400 text-gray-500">
          {formatRelativeTime(item.syncedAt, t)}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          {getPosterUrl(item) && (
            <img
              src={getPosterUrl(item)}
              alt={formatMediaTitle(item)}
              className="w-14 h-20 object-cover rounded flex-shrink-0 shadow-sm"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-semibold text-sm dark:text-white text-gray-900 truncate">
              {formatMediaTitle(item)}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {getMediaLinks(item).map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                    link.needsDarkBg
                      ? "bg-gray-800 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600"
                      : "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900"
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
        <span className="px-1.5 py-0.5 text-xs rounded dark:bg-[#1e1e1e] bg-gray-100 dark:text-slate-400 text-gray-600 uppercase tracking-wide">
          {item.mediaType}
        </span>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {item.source ? (
          <div className="flex items-center justify-center">
            {item.source === "plex" ? (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#fff4d6] text-[#915c00] dark:bg-[#231706] dark:text-[#ffdd8a]">
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
              <span className="text-xs dark:text-slate-400 text-gray-500 capitalize">
                {item.source}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs dark:text-slate-500 text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {item.destinations && item.destinations.length > 0 ? (
            <>
              {item.destinations.includes("TVTime") && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded">
                  <img
                    src="/logos/tvtime.png"
                    alt="TVTime"
                    className="w-2.5 h-2.5"
                  />
                  <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300">
                    {t("sync.destinations.tvtime", {
                      defaultValue: "TVTime",
                    })}
                  </span>
                </div>
              )}
              {item.destinations.includes("Trakt") && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900 rounded">
                  <img
                    src="/logos/trakt.svg"
                    alt="Trakt"
                    className="w-2.5 h-2.5"
                  />
                  <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                    {t("sync.destinations.trakt", {
                      defaultValue: "Trakt",
                    })}
                  </span>
                </div>
              )}
            </>
          ) : (
            <span className="text-xs dark:text-slate-500 text-gray-400">-</span>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <div className="flex items-center gap-2">
          {item.success ? (
            <FaCheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
          ) : (
            <FaExclamationCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
          )}
          <span className="text-xs font-medium dark:text-slate-300 text-gray-700">
            {item.success
              ? t("common.success", { defaultValue: "Success" })
              : t("common.failed", { defaultValue: "Failed" })}
          </span>
          {item.success && item.wasRewatched && (
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
                <FaSpinner className="animate-spin h-4 w-4" />
              ) : (
                <FaCheck className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={onCancelDelete}
              disabled={isDeleting}
              className="text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 p-1"
              title={t("sync.cancel", {
                defaultValue: "Cancel",
              })}
            >
              <FaTimes className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onDelete}
            className="text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 p-1 transition-colors"
            title={t("sync.deleteItemTitle", {
              defaultValue: "Delete this item",
            })}
          >
            <FaTrash className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}
