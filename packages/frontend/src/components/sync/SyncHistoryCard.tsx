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

  return (
    <div
      className={`dark:bg-[#121212] bg-white rounded-lg shadow-sm p-2.5 border transition-colors ${
        isConfirming
          ? "border-red-500 dark:border-red-600 bg-red-50 dark:bg-red-950"
          : isSelected
            ? "border-orange-500 dark:border-orange-600 bg-orange-50 dark:bg-orange-950"
            : "border-gray-200 dark:border-[#2d2d2d] hover:border-gray-300 dark:hover:border-[#3d3d3d]"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="pt-0.5">
          <CustomCheckbox checked={isSelected} onChange={onSelect} />
        </div>
        {getPosterUrl(item) && (
          <img
            src={getPosterUrl(item)}
            alt={formatMediaTitle(item)}
            className="w-12 h-16 object-cover rounded flex-shrink-0 shadow-sm"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="flex-1 min-w-0">
          {/* Header: Title + Status + Delete */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm dark:text-white text-gray-900 line-clamp-1">
                {formatMediaTitle(item)}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {item.success ? (
                <FaCheckCircle className="h-4 w-4 text-green-500 dark:text-green-400 flex-shrink-0" />
              ) : (
                <FaExclamationCircle className="h-4 w-4 text-red-500 dark:text-red-400 flex-shrink-0" />
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
                      <FaSpinner className="animate-spin h-3.5 w-3.5" />
                    ) : (
                      <FaCheck className="h-3.5 w-3.5" />
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
                    <FaTimes className="h-3.5 w-3.5" />
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
                  <FaTrash className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Metadata: Time + Type + Rewatched */}
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs dark:text-slate-400 text-gray-500">
              {formatRelativeTime(item.syncedAt, t)}
            </span>
            <span className="text-xs text-gray-300 dark:text-slate-600">•</span>
            <span className="px-1.5 py-0.5 text-xs rounded dark:bg-[#1e1e1e] bg-gray-100 dark:text-slate-400 text-gray-600 uppercase tracking-wide">
              {item.mediaType}
            </span>
            {item.success && item.wasRewatched && (
              <>
                <span className="text-xs text-gray-300 dark:text-slate-600">
                  •
                </span>
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
                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#fff4d6] text-[#915c00] dark:bg-[#231706] dark:text-[#ffdd8a]">
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
                <span className="text-xs dark:text-slate-400 text-gray-500 capitalize">
                  {item.source}
                </span>
              )}
            </div>
          )}

          {/* Destinations */}
          {item.destinations && item.destinations.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
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
            </div>
          )}

          {/* External Links */}
          {getMediaLinks(item).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
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
