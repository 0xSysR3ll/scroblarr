import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  FaSpinner,
  FaChevronLeft,
  FaChevronRight,
  FaAngleDoubleLeft,
  FaAngleDoubleRight,
  FaFilter,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaTimesCircle,
  FaSearch,
  FaDownload,
  FaCalendar,
  FaTrash,
  FaChevronDown,
} from "react-icons/fa";
import {
  getSyncHistory,
  clearSyncHistory,
  deleteSyncHistoryItem,
  deleteSyncHistoryItems,
  type SyncHistoryItem,
} from "@services/api";
import { CustomCheckbox } from "@components/ui/CustomCheckbox";
import { SyncHistoryCard } from "@components/sync/SyncHistoryCard";
import { SyncHistoryTableRow } from "@components/sync/SyncHistoryTableRow";
import {
  formatMediaTitle,
  formatDate,
  exportToCSV,
  exportToJSON,
} from "@utils/syncHistory";
import { showError, showSuccess } from "@utils/toast";

type QuickFilter = "all" | "last7days" | "last30days" | "failed" | "success";

interface GroupedHistory {
  label: string;
  items: SyncHistoryItem[];
}

export function SyncDashboardPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [history, setHistory] = useState<SyncHistoryItem[]>([]);
  const [allHistory, setAllHistory] = useState<SyncHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showClearModal, setShowClearModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [filters, setFilters] = useState<{
    mediaType?: string;
    success?: boolean;
    source?: string;
  }>({});
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<string>("syncedAt");
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("DESC");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [groupByDate, setGroupByDate] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const filter = searchParams.get("filter");
    const mediaType = searchParams.get("mediaType");
    const source = searchParams.get("source");
    if (filter === "failed") {
      setQuickFilter("failed");
    } else if (filter === "success") {
      setQuickFilter("success");
    }
    setFilters((prev) => {
      const next = { ...prev };
      if (mediaType != null && mediaType !== "") next.mediaType = mediaType;
      if (source != null && source !== "") next.source = source;
      if (filter === "failed") next.success = false;
      else if (filter === "success") next.success = true;
      return next;
    });
  }, [searchParams]);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);

      // Load first page to get total count
      const firstPage = await getSyncHistory(
        1,
        100, // Max page size allowed by backend
        filters,
        sortBy,
        sortOrder
      );

      // For client-side search/filtering, load up to 500 items (5 pages)
      // This allows search and quick filters to work on recent history
      const maxItemsForClientSide = 500;
      const maxPages = Math.min(5, Math.ceil(firstPage.pagination.total / 100));

      const allItems = [...firstPage.data];

      if (maxPages > 1 && firstPage.pagination.total <= maxItemsForClientSide) {
        // Load remaining pages
        const remainingPages = [];
        for (let p = 2; p <= maxPages; p++) {
          remainingPages.push(
            getSyncHistory(p, 100, filters, sortBy, sortOrder)
          );
        }
        const responses = await Promise.all(remainingPages);
        responses.forEach((response) => {
          allItems.push(...response.data);
        });
      }

      setAllHistory(allItems);
      setHistory(allItems);
    } catch {
      showError(
        t("sync.errors.loadFailed", {
          defaultValue: "Failed to load sync history",
        })
      );
    } finally {
      setLoading(false);
    }
  }, [filters, sortBy, sortOrder, t]);

  useEffect(() => {
    setPage(1);
  }, [filters, sortBy, sortOrder, quickFilter, searchQuery]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setShowExportMenu(false);
      }
    }

    if (showExportMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showExportMenu]);

  const filteredHistory = useMemo(() => {
    let filtered = [...allHistory];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.mediaTitle.toLowerCase().includes(query) ||
          item.source?.toLowerCase().includes(query) ||
          item.errorMessage?.toLowerCase().includes(query)
      );
    }

    if (quickFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter((item) => {
        const itemDate = new Date(item.syncedAt);
        switch (quickFilter) {
          case "last7days":
            return (
              now.getTime() - itemDate.getTime() <= 7 * 24 * 60 * 60 * 1000
            );
          case "last30days":
            return (
              now.getTime() - itemDate.getTime() <= 30 * 24 * 60 * 60 * 1000
            );
          case "failed":
            return !item.success;
          case "success":
            return item.success;
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [allHistory, searchQuery, quickFilter]);

  const groupedHistory = useMemo((): GroupedHistory[] => {
    if (!groupByDate) {
      return [{ label: "", items: filteredHistory }];
    }

    const groups: GroupedHistory[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const startOfWeek = new Date(today);
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startOfWeek.setDate(today.getDate() - daysToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const groupsMap = new Map<string, SyncHistoryItem[]>();

    filteredHistory.forEach((item) => {
      const itemDate = new Date(item.syncedAt);
      let groupLabel = "";

      if (itemDate >= today) {
        groupLabel = t("sync.dateGroups.today", { defaultValue: "Today" });
      } else if (itemDate >= yesterday) {
        groupLabel = t("sync.dateGroups.yesterday", {
          defaultValue: "Yesterday",
        });
      } else if (itemDate >= startOfWeek) {
        groupLabel = t("sync.dateGroups.thisWeek", {
          defaultValue: "This Week",
        });
      } else if (itemDate >= startOfMonth) {
        groupLabel = t("sync.dateGroups.thisMonth", {
          defaultValue: "This Month",
        });
      } else {
        groupLabel = t("sync.dateGroups.older", {
          defaultValue: "Older",
        });
      }

      if (!groupsMap.has(groupLabel)) {
        groupsMap.set(groupLabel, []);
      }
      groupsMap.get(groupLabel)!.push(item);
    });

    const groupOrder = [
      t("sync.dateGroups.today", { defaultValue: "Today" }),
      t("sync.dateGroups.yesterday", { defaultValue: "Yesterday" }),
      t("sync.dateGroups.thisWeek", { defaultValue: "This Week" }),
      t("sync.dateGroups.thisMonth", { defaultValue: "This Month" }),
      t("sync.dateGroups.older", { defaultValue: "Older" }),
    ];

    groupOrder.forEach((label) => {
      if (groupsMap.has(label)) {
        groups.push({ label, items: groupsMap.get(label)! });
      }
    });

    return groups;
  }, [filteredHistory, groupByDate, t]);

  const paginatedGroups = useMemo(() => {
    if (!groupByDate) {
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      return [{ label: "", items: filteredHistory.slice(start, end) }];
    }

    let itemsProcessed = 0;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const result: GroupedHistory[] = [];

    for (const group of groupedHistory) {
      if (itemsProcessed + group.items.length <= start) {
        itemsProcessed += group.items.length;
        continue;
      }

      if (itemsProcessed >= end) {
        break;
      }

      const groupStart = Math.max(0, start - itemsProcessed);
      const groupEnd = Math.min(group.items.length, end - itemsProcessed);
      const paginatedItems = group.items.slice(groupStart, groupEnd);

      if (paginatedItems.length > 0) {
        result.push({ label: group.label, items: paginatedItems });
      }

      itemsProcessed += group.items.length;
      if (itemsProcessed >= end) {
        break;
      }
    }

    return result;
  }, [groupedHistory, page, pageSize, groupByDate, filteredHistory]);

  const displayHistory = groupByDate
    ? paginatedGroups.flatMap((g) => g.items)
    : paginatedGroups.flatMap((g) => g.items);

  const displayTotal = filteredHistory.length;
  const displayTotalPages = Math.ceil(displayTotal / pageSize);

  function handleSort(column: string) {
    if (sortBy === column) {
      setSortOrder(sortOrder === "ASC" ? "DESC" : "ASC");
    } else {
      setSortBy(column);
      setSortOrder("DESC");
    }
  }

  function getSortIcon(column: string) {
    if (sortBy !== column) {
      return <FaSort className="h-3 w-3 text-gray-400 dark:text-slate-500" />;
    }
    return sortOrder === "ASC" ? (
      <FaSortUp className="h-3 w-3 text-blue-600 dark:text-blue-400" />
    ) : (
      <FaSortDown className="h-3 w-3 text-blue-600 dark:text-blue-400" />
    );
  }

  function handleFilterChange(key: "mediaType" | "success", value: string) {
    if (value === "all") {
      const newFilters = { ...filters };
      delete newFilters[key];
      setFilters(newFilters);
    } else {
      setFilters({
        ...filters,
        [key]: key === "success" ? value === "true" : value,
      });
    }
  }

  function clearFilters() {
    setFilters({});
    setQuickFilter("all");
    setSearchQuery("");
  }

  const hasActiveFilters =
    Object.keys(filters).length > 0 ||
    quickFilter !== "all" ||
    searchQuery.trim() !== "";

  async function handleClear() {
    try {
      setClearing(true);
      await clearSyncHistory();
      setSelectedIds(new Set());
      setShowClearModal(false);
      await loadHistory();
      showSuccess(
        t("sync.success.clearSuccess", {
          defaultValue: "Sync history cleared successfully",
        })
      );
    } catch {
      showError(
        t("sync.errors.clearFailed", {
          defaultValue: "Failed to clear sync history",
        })
      );
    } finally {
      setClearing(false);
    }
  }

  async function handleDeleteItem(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }

    try {
      setDeleting(id);
      await deleteSyncHistoryItem(id);
      setConfirmDeleteId(null);
      await loadHistory();
      showSuccess(
        t("sync.success.deleteItemSuccess", {
          defaultValue: "Sync history item deleted successfully",
        })
      );
    } catch {
      showError(
        t("sync.errors.deleteItemFailed", {
          defaultValue: "Failed to delete sync history item",
        })
      );
    } finally {
      setDeleting(null);
    }
  }

  function cancelDelete() {
    setConfirmDeleteId(null);
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;

    try {
      setDeleting("bulk");
      await deleteSyncHistoryItems(Array.from(selectedIds));
      setSelectedIds(new Set());
      setShowBulkDeleteModal(false);
      await loadHistory();
      showSuccess(
        t("sync.success.deleteItemsSuccess", {
          defaultValue: "Sync history items deleted successfully",
        })
      );
    } catch {
      showError(
        t("sync.errors.deleteItemsFailed", {
          defaultValue: "Failed to delete sync history items",
        })
      );
    } finally {
      setDeleting(null);
    }
  }

  function handleSelectAll() {
    if (selectedIds.size === displayHistory.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayHistory.map((item) => item.id)));
    }
  }

  function handleSelectItem(id: string) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  }

  const handleExportCSV = useCallback(() => {
    exportToCSV(filteredHistory, formatMediaTitle, formatDate);
  }, [filteredHistory]);

  const handleExportJSON = useCallback(() => {
    exportToJSON(filteredHistory, formatMediaTitle);
  }, [filteredHistory]);

  if (loading && history.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="dark:bg-[#121212] bg-white rounded-lg shadow p-4 animate-pulse"
            >
              <div className="flex items-start gap-3">
                <div className="w-16 h-24 bg-gray-200 dark:bg-[#2d2d2d] rounded"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-[#2d2d2d] rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 dark:bg-[#2d2d2d] rounded w-1/2"></div>
                  <div className="flex gap-2 mt-2">
                    <div className="h-5 bg-gray-200 dark:bg-[#2d2d2d] rounded w-16"></div>
                    <div className="h-5 bg-gray-200 dark:bg-[#2d2d2d] rounded w-20"></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8">
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            {t("sync.title", { defaultValue: "My Sync History" })}
          </h1>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setShowBulkDeleteModal(true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium w-full sm:w-auto"
                >
                  <FaTrash className="h-4 w-4" />
                  <span>
                    {t("sync.deleteSelected", {
                      defaultValue: "Delete Selected",
                    })}{" "}
                    ({selectedIds.size})
                  </span>
                </button>
              )}
              <button
                onClick={() => setShowClearModal(true)}
                disabled={history.length === 0}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium w-full sm:w-auto"
              >
                <FaTrash className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {t("sync.clearHistory", { defaultValue: "Clear My History" })}
                </span>
                <span className="sm:hidden">
                  {t("sync.clearHistory", { defaultValue: "Clear" })}
                </span>
              </button>
            </div>
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={filteredHistory.length === 0}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium w-full sm:w-auto"
                title={t("sync.export", { defaultValue: "Export" })}
              >
                <FaDownload className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {t("sync.export", { defaultValue: "Export" })}
                </span>
                <FaChevronDown className="h-3 w-3" />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 sm:right-0 left-0 sm:left-auto mt-2 w-full sm:w-40 bg-white dark:bg-[#121212] rounded-lg shadow-lg py-1 z-50 border border-gray-200 dark:border-[#2d2d2d]">
                  <button
                    onClick={() => {
                      handleExportCSV();
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e1e1e] flex items-center gap-1.5"
                  >
                    <FaDownload className="h-3 w-3" />
                    {t("sync.exportCSV", { defaultValue: "Export as CSV" })}
                  </button>
                  <button
                    onClick={() => {
                      handleExportJSON();
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e1e1e] flex items-center gap-1.5"
                  >
                    <FaDownload className="h-3 w-3" />
                    {t("sync.exportJSON", { defaultValue: "Export as JSON" })}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Search and Quick Filters */}
      <div className="mb-4 dark:bg-[#121212] bg-white rounded-lg shadow-lg p-4">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1 relative">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("sync.searchPlaceholder", {
                defaultValue: "Search by title, source, or error...",
              })}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-[#2d2d2d] rounded-md bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setGroupByDate(!groupByDate)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                groupByDate
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-[#1e1e1e] text-gray-700 dark:text-slate-300"
              }`}
              title={t("sync.toggleGrouping", {
                defaultValue: "Toggle date grouping",
              })}
            >
              <FaCalendar className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={() => setQuickFilter("all")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              quickFilter === "all"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-[#1e1e1e] text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-[#2d2d2d]"
            }`}
          >
            {t("sync.quickFilters.all", { defaultValue: "All" })}
          </button>
          <button
            onClick={() => setQuickFilter("last7days")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              quickFilter === "last7days"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-[#1e1e1e] text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-[#2d2d2d]"
            }`}
          >
            {t("sync.quickFilters.last7Days", { defaultValue: "Last 7 Days" })}
          </button>
          <button
            onClick={() => setQuickFilter("last30days")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              quickFilter === "last30days"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-[#1e1e1e] text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-[#2d2d2d]"
            }`}
          >
            {t("sync.quickFilters.last30Days", {
              defaultValue: "Last 30 Days",
            })}
          </button>
          <button
            onClick={() => setQuickFilter("failed")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              quickFilter === "failed"
                ? "bg-red-600 text-white"
                : "bg-gray-100 dark:bg-[#1e1e1e] text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-[#2d2d2d]"
            }`}
          >
            {t("sync.quickFilters.failed", { defaultValue: "Failed Only" })}
          </button>
          <button
            onClick={() => setQuickFilter("success")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              quickFilter === "success"
                ? "bg-green-600 text-white"
                : "bg-gray-100 dark:bg-[#1e1e1e] text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-[#2d2d2d]"
            }`}
          >
            {t("sync.quickFilters.success", { defaultValue: "Success Only" })}
          </button>
        </div>

        {/* Advanced Filters */}
        <div className="flex items-center justify-between pt-3 border-t dark:border-[#2d2d2d] border-gray-200">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white"
          >
            <FaFilter className="h-4 w-4" />
            {t("sync.filters", { defaultValue: "Advanced Filters" })}
            {hasActiveFilters && (
              <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                {Object.keys(filters).length +
                  (quickFilter !== "all" ? 1 : 0) +
                  (searchQuery.trim() ? 1 : 0)}
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              {t("sync.clearFilters", { defaultValue: "Clear all filters" })}
            </button>
          )}
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t dark:border-[#2d2d2d] border-gray-200 mt-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                {t("sync.mediaType", { defaultValue: "Media Type" })}
              </label>
              <select
                value={filters.mediaType || "all"}
                onChange={(e) =>
                  handleFilterChange("mediaType", e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-[#2d2d2d] rounded-md bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-slate-100"
              >
                <option value="all">
                  {t("sync.all", { defaultValue: "All" })}
                </option>
                <option value="episode">
                  {t("sync.episodes", { defaultValue: "Episodes" })}
                </option>
                <option value="movie">
                  {t("sync.movies", { defaultValue: "Movies" })}
                </option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                {t("sync.status", { defaultValue: "Status" })}
              </label>
              <select
                value={
                  filters.success === undefined
                    ? "all"
                    : filters.success
                      ? "true"
                      : "false"
                }
                onChange={(e) => handleFilterChange("success", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-[#2d2d2d] rounded-md bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-slate-100"
              >
                <option value="all">
                  {t("sync.all", { defaultValue: "All" })}
                </option>
                <option value="true">
                  {t("common.success", { defaultValue: "Success" })}
                </option>
                <option value="false">
                  {t("common.failed", { defaultValue: "Failed" })}
                </option>
              </select>
            </div>
          </div>
        )}
      </div>

      {allHistory.length >= 500 && (
        <div className="mb-4 bg-yellow-50 dark:bg-yellow-950 border-l-4 border-yellow-400 dark:border-yellow-600 p-4 rounded">
          <div className="flex">
            <div className="flex-shrink-0">
              <FaTimesCircle className="h-5 w-5 text-yellow-400 dark:text-yellow-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                {t("sync.largeHistoryNotice", {
                  defaultValue:
                    "You have more than 500 sync history items. Search and quick filters work on the most recent 500 items. Use advanced filters and pagination to view older items.",
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {displayHistory.length === 0 && !loading ? (
        <div className="dark:bg-[#121212] bg-white rounded-lg shadow-lg p-12 text-center">
          <FaTimesCircle className="mx-auto h-12 w-12 text-gray-400 dark:text-slate-500 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {hasActiveFilters
              ? t("sync.noResults", {
                  defaultValue: "No results found",
                })
              : t("sync.noHistory", {
                  defaultValue: "No sync history available",
                })}
          </h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {hasActiveFilters
              ? t("sync.noResultsDescription", {
                  defaultValue:
                    "Try adjusting your filters or search query to see more results.",
                })
              : t("sync.noHistoryDescription", {
                  defaultValue:
                    "Your sync history will appear here once you start scrobbling media.",
                })}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-4 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              {t("sync.clearFilters", { defaultValue: "Clear all filters" })}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {displayHistory.length > 0 && (
              <div className="flex items-center gap-3 p-3 dark:bg-[#121212] bg-white rounded-lg shadow border border-gray-200 dark:border-[#2d2d2d]">
                <CustomCheckbox
                  checked={
                    displayHistory.length > 0 &&
                    selectedIds.size === displayHistory.length
                  }
                  onChange={handleSelectAll}
                />
                <span className="text-sm font-medium dark:text-white text-gray-900">
                  {selectedIds.size === displayHistory.length
                    ? t("sync.deselectAll", { defaultValue: "Deselect All" })
                    : t("sync.selectAll", { defaultValue: "Select All" })}
                </span>
              </div>
            )}
            {paginatedGroups.map((group, groupIndex) => (
              <div key={groupIndex}>
                {groupByDate && group.label && (
                  <h2 className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-2 px-1 uppercase tracking-wider">
                    {group.label}
                  </h2>
                )}
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <SyncHistoryCard
                      key={item.id}
                      item={item}
                      isSelected={selectedIds.has(item.id)}
                      confirmDeleteId={confirmDeleteId}
                      deleting={deleting}
                      onSelect={() => handleSelectItem(item.id)}
                      onDelete={() => handleDeleteItem(item.id)}
                      onCancelDelete={cancelDelete}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block dark:bg-[#121212] bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                <thead className="bg-gray-50 dark:bg-[#121212]">
                  <tr>
                    <th className="px-4 py-2.5 text-left">
                      <CustomCheckbox
                        checked={
                          displayHistory.length > 0 &&
                          selectedIds.size === displayHistory.length
                        }
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th
                      className="px-4 py-2.5 text-left text-xs font-medium dark:text-slate-400 text-gray-500 uppercase tracking-wider cursor-pointer hover:dark:bg-[#1e1e1e] hover:bg-gray-100 select-none"
                      onClick={() => handleSort("syncedAt")}
                    >
                      <div className="flex items-center gap-2">
                        {t("sync.tableHeaders.time", { defaultValue: "Time" })}
                        {getSortIcon("syncedAt")}
                      </div>
                    </th>
                    <th
                      className="px-4 py-2.5 text-left text-xs font-medium dark:text-slate-400 text-gray-500 uppercase tracking-wider cursor-pointer hover:dark:bg-[#1e1e1e] hover:bg-gray-100 select-none"
                      onClick={() => handleSort("mediaTitle")}
                    >
                      <div className="flex items-center gap-2">
                        {t("sync.tableHeaders.media", {
                          defaultValue: "Media",
                        })}
                        {getSortIcon("mediaTitle")}
                      </div>
                    </th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium dark:text-slate-400 text-gray-500 uppercase tracking-wider">
                      {t("sync.tableHeaders.mediaType", {
                        defaultValue: "Type",
                      })}
                    </th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium dark:text-slate-400 text-gray-500 uppercase tracking-wider">
                      {t("sync.tableHeaders.source", {
                        defaultValue: "Source",
                      })}
                    </th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium dark:text-slate-400 text-gray-500 uppercase tracking-wider">
                      {t("sync.tableHeaders.destinations", {
                        defaultValue: "Destinations",
                      })}
                    </th>
                    <th
                      className="px-4 py-2.5 text-left text-xs font-medium dark:text-slate-400 text-gray-500 uppercase tracking-wider cursor-pointer hover:dark:bg-[#1e1e1e] hover:bg-gray-100 select-none"
                      onClick={() => handleSort("success")}
                    >
                      <div className="flex items-center gap-2">
                        {t("sync.tableHeaders.status", {
                          defaultValue: "Status",
                        })}
                        {getSortIcon("success")}
                      </div>
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium dark:text-slate-400 text-gray-500 uppercase tracking-wider">
                      {t("sync.tableHeaders.actions", {
                        defaultValue: "Actions",
                      })}
                    </th>
                  </tr>
                </thead>
                <tbody className="dark:bg-[#121212] bg-white divide-y divide-gray-200 dark:divide-slate-700">
                  {paginatedGroups.map((group, groupIndex) => (
                    <React.Fragment key={groupIndex}>
                      {groupByDate && group.label && (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-1.5 bg-gray-100 dark:bg-[#1e1e1e] text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider sticky top-0 z-10"
                          >
                            {group.label}
                          </td>
                        </tr>
                      )}
                      {group.items.map((item) => (
                        <SyncHistoryTableRow
                          key={item.id}
                          item={item}
                          isSelected={selectedIds.has(item.id)}
                          confirmDeleteId={confirmDeleteId}
                          deleting={deleting}
                          onSelect={() => handleSelectItem(item.id)}
                          onDelete={() => handleDeleteItem(item.id)}
                          onCancelDelete={cancelDelete}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {displayTotalPages > 1 && (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {displayTotal > 0
                  ? t("sync.pagination.showing", {
                      from: Math.min((page - 1) * pageSize + 1, displayTotal),
                      to: Math.min(page * pageSize, displayTotal),
                      total: displayTotal,
                      defaultValue:
                        "Showing {{from}} to {{to}} of {{total}} results",
                    })
                  : t("sync.pagination.noResults", {
                      defaultValue: "No results",
                    })}
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setPage(1)}
                  disabled={page === 1 || loading}
                  aria-label="First page"
                  className="px-2 py-1 text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-100 bg-gray-50 dark:bg-[#1e1e1e] border border-gray-300 dark:border-[#2d2d2d] rounded-md hover:bg-gray-100 dark:hover:bg-[#242424] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <FaAngleDoubleLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  aria-label={t("sync.pagination.previous", {
                    defaultValue: "Previous",
                  })}
                  className="px-2 py-1 text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-100 bg-gray-50 dark:bg-[#1e1e1e] border border-gray-300 dark:border-[#2d2d2d] rounded-md hover:bg-gray-100 dark:hover:bg-[#242424] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <FaChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                </button>
                {/* Page number buttons */}
                {Array.from({ length: displayTotalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    if (p === 1 || p === displayTotalPages) return true;
                    return p >= page - 2 && p <= page + 2;
                  })
                  .map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      disabled={loading}
                      className={`px-2 py-1 text-xs sm:text-sm font-medium rounded-md border ${
                        p === page
                          ? "bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500"
                          : "bg-gray-50 text-gray-700 border-gray-300 dark:bg-[#1e1e1e] dark:text-slate-100 dark:border-[#2d2d2d] hover:bg-gray-100 dark:hover:bg-[#242424]"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {p}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() =>
                    setPage((p) => Math.min(displayTotalPages, p + 1))
                  }
                  disabled={page === displayTotalPages || loading}
                  aria-label={t("sync.pagination.next", {
                    defaultValue: "Next",
                  })}
                  className="px-2 py-1 text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-100 bg-gray-50 dark:bg-[#1e1e1e] border border-gray-300 dark:border-[#2d2d2d] rounded-md hover:bg-gray-100 dark:hover:bg-[#242424] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <FaChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage(displayTotalPages)}
                  disabled={page === displayTotalPages || loading}
                  aria-label="Last page"
                  className="px-2 py-1 text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-100 bg-gray-50 dark:bg-[#1e1e1e] border border-gray-300 dark:border-[#2d2d2d] rounded-md hover:bg-gray-100 dark:hover:bg-[#242424] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <FaAngleDoubleRight className="h-3 w-3 sm:h-4 sm:w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals remain the same */}
      {showClearModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowClearModal(false)}
        >
          <div
            className="dark:bg-[#121212] bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-lg font-medium dark:text-white text-gray-900 mb-4">
                {t("sync.modals.clearTitle", {
                  defaultValue: "Clear All Sync History",
                })}
              </h3>
              <p className="text-sm dark:text-slate-400 text-gray-500 mb-6">
                {t("sync.modals.clearMessage", {
                  defaultValue:
                    "Are you sure you want to clear all sync history? This action cannot be undone.",
                })}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowClearModal(false)}
                  disabled={clearing}
                  className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 dark:bg-[#121212] bg-white border dark:border-[#1e1e1e] border-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-[#2d2d2d] disabled:opacity-50"
                >
                  {t("sync.cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  onClick={handleClear}
                  disabled={clearing}
                  className="px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {clearing ? (
                    <>
                      <FaSpinner className="animate-spin h-4 w-4" />
                      {t("sync.modals.clearing", {
                        defaultValue: "Clearing...",
                      })}
                    </>
                  ) : (
                    t("sync.modals.clearAll", { defaultValue: "Clear All" })
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowBulkDeleteModal(false)}
        >
          <div
            className="dark:bg-[#121212] bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-lg font-medium dark:text-white text-gray-900 mb-4">
                {t("sync.modals.bulkDeleteTitle", {
                  defaultValue: "Delete Selected Items",
                })}
              </h3>
              <p className="text-sm dark:text-slate-400 text-gray-500 mb-6">
                {t("sync.modals.bulkDeleteMessage", {
                  count: selectedIds.size,
                  plural: selectedIds.size > 1 ? "s" : "",
                  defaultValue:
                    "Are you sure you want to delete {{count}} sync history item{{plural}}? This action cannot be undone.",
                })}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowBulkDeleteModal(false)}
                  disabled={deleting === "bulk"}
                  className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 dark:bg-[#121212] bg-white border dark:border-[#1e1e1e] border-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-[#2d2d2d] disabled:opacity-50"
                >
                  {t("sync.cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={deleting === "bulk"}
                  className="px-3 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {deleting === "bulk" ? (
                    <>
                      <FaSpinner className="animate-spin h-4 w-4" />
                      {t("sync.modals.deleting", {
                        defaultValue: "Deleting...",
                      })}
                    </>
                  ) : (
                    t("sync.modals.delete", { defaultValue: "Delete" })
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
