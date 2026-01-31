import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaCheck, FaTimes, FaTrash, FaSpinner, FaCrown } from "react-icons/fa";
import { User } from "@services/api";
import { useAuth } from "@contexts/AuthContext";
import { CustomCheckbox } from "@components/ui/CustomCheckbox";
import { showSuccess, showError } from "@utils/toast";

interface UserListProps {
  users: User[];
  onDelete?: (id: string) => Promise<void>;
  onBulkDelete?: (ids: string[]) => Promise<void>;
  onToggleEnabled?: (id: string, enabled: boolean) => Promise<void>;
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (ids: Set<string>) => void;
}

export function UserList({
  users,
  onDelete,
  onBulkDelete,
  onToggleEnabled,
  selectedIds: externalSelectedIds,
  onSelectedIdsChange,
}: UserListProps) {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(
    new Set()
  );
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const selectedIds = externalSelectedIds ?? internalSelectedIds;
  const setSelectedIds = onSelectedIdsChange ?? setInternalSelectedIds;

  async function handleDelete(userId: string) {
    if (!onDelete) return;

    if (confirmDeleteId !== userId) {
      setConfirmDeleteId(userId);
      return;
    }

    try {
      setDeletingId(userId);
      await onDelete(userId);
      setConfirmDeleteId(null);
      if (selectedIds.has(userId)) {
        const newSelected = new Set(selectedIds);
        newSelected.delete(userId);
        setSelectedIds(newSelected);
      }
      showSuccess(
        t("users.deleteSuccess", { defaultValue: "User deleted successfully" })
      );
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : t("users.deleteFailed", { defaultValue: "Failed to delete user" })
      );
    } finally {
      setDeletingId(null);
    }
  }

  function cancelDelete() {
    setConfirmDeleteId(null);
  }

  function handleSelectAll() {
    const deletableUsers = users.filter(
      (u) => u.id !== currentUser?.id && !u.isAdmin
    );
    if (selectedIds.size === deletableUsers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(deletableUsers.map((u) => u.id)));
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

  async function handleToggleEnabled(userId: string, currentEnabled: boolean) {
    if (!onToggleEnabled) return;

    try {
      setTogglingId(userId);
      await onToggleEnabled(userId, !currentEnabled);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : t("users.toggleEnabledFailed", {
              defaultValue: "Failed to update user status",
            })
      );
    } finally {
      setTogglingId(null);
    }
  }

  if (users.length === 0) {
    return (
      <div className="dark:bg-[#121212] bg-white rounded-lg shadow p-6">
        <p className="dark:text-slate-400 text-gray-500">
          {t("users.noUsersFound", { defaultValue: "No users found" })}
        </p>
      </div>
    );
  }

  const deletableUsers = users.filter(
    (u) => u.id !== currentUser?.id && !u.isAdmin
  );
  const allSelected =
    deletableUsers.length > 0 && selectedIds.size === deletableUsers.length;

  return (
    <>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {onBulkDelete && deletableUsers.length > 0 && (
          <div className="flex items-center gap-3 p-3 dark:bg-[#121212] bg-white rounded-lg shadow border border-gray-200 dark:border-[#2d2d2d]">
            <CustomCheckbox checked={allSelected} onChange={handleSelectAll} />
            <span className="text-sm font-medium dark:text-white text-gray-900">
              {allSelected
                ? t("users.deselectAll", { defaultValue: "Deselect All" })
                : t("users.selectAll", { defaultValue: "Select All" })}
            </span>
          </div>
        )}
        {users.map((user) => {
          const isCurrentUser = currentUser?.id === user.id;
          const canDelete = onDelete && !isCurrentUser && !user.isAdmin;
          const canSelect = onBulkDelete && !isCurrentUser && !user.isAdmin;
          const isSelected = selectedIds.has(user.id);

          return (
            <div
              key={user.id}
              className={`dark:bg-[#121212] bg-white rounded-lg shadow p-4 border ${
                confirmDeleteId === user.id
                  ? "border-red-500 dark:border-red-600"
                  : isSelected
                    ? "border-orange-500 dark:border-orange-600"
                    : "border-gray-200 dark:border-[#2d2d2d]"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {onBulkDelete && (
                    <CustomCheckbox
                      checked={isSelected}
                      onChange={() => handleSelectItem(user.id)}
                      disabled={!canSelect}
                    />
                  )}
                  <img
                    src={
                      user.thumb ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        user.displayName || user.plexUsername || "User"
                      )}&background=6366f1&color=fff&size=128`
                    }
                    alt={user.displayName || user.plexUsername}
                    className="h-12 w-12 rounded-full object-cover border-2 dark:border-[#2d2d2d] border-gray-200 flex-shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          user.displayName || user.plexUsername || "User"
                        )}&background=6366f1&color=fff&size=128`;
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm dark:text-white text-gray-900 truncate">
                      {user.displayName || "-"}
                    </div>
                    {user.email && (
                      <div className="text-xs dark:text-slate-400 text-gray-500 truncate mt-1">
                        {user.email}
                      </div>
                    )}
                  </div>
                </div>
                {onDelete && canDelete && (
                  <div className="flex-shrink-0">
                    {confirmDeleteId === user.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-600 dark:text-red-400">
                          {t("users.deleteUser", {
                            defaultValue: "Delete?",
                          })}
                        </span>
                        <button
                          onClick={() => handleDelete(user.id)}
                          disabled={deletingId === user.id}
                          className="text-red-600 dark:text-red-500 hover:text-red-900 dark:hover:text-red-400 disabled:opacity-50"
                          title={t("users.confirmDelete", {
                            defaultValue: "Confirm delete",
                          })}
                        >
                          {deletingId === user.id ? (
                            <FaSpinner className="animate-spin h-4 w-4" />
                          ) : (
                            <FaCheck className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={cancelDelete}
                          disabled={deletingId === user.id}
                          className="text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
                          title={t("common.cancel", {
                            defaultValue: "Cancel",
                          })}
                        >
                          <FaTimes className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="text-red-600 dark:text-red-500 hover:text-red-900 dark:hover:text-red-400"
                        title={t("users.deleteUserTitle", {
                          defaultValue: "Delete user",
                        })}
                      >
                        <FaTrash className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {user.isAdmin && (
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 rounded-full">
                      <FaCrown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                        {t("users.admin", { defaultValue: "Admin" })}
                      </span>
                    </div>
                  )}
                  {user.plexUsername && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#fff4d6] text-[#915c00] dark:bg-[#231706] dark:text-[#ffdd8a]">
                      <img
                        src="/logos/plex.svg"
                        alt="Plex"
                        className="w-3 h-3"
                      />
                      <span className="text-xs font-medium">
                        {t("users.plex", { defaultValue: "Plex" })}
                      </span>
                    </div>
                  )}
                  {user.jellyfinUsername && (
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900 rounded-full">
                      <img
                        src="/logos/jellyfin.svg"
                        alt="Jellyfin"
                        className="w-3 h-3"
                      />
                      <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                        {t("users.jellyfin", { defaultValue: "Jellyfin" })}
                      </span>
                    </div>
                  )}
                  {user.traktUsername && (
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900 rounded-full">
                      <img
                        src="/logos/trakt.svg"
                        alt="Trakt"
                        className="w-3 h-3"
                      />
                      <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                        {t("users.trakt", { defaultValue: "Trakt" })}
                      </span>
                    </div>
                  )}
                  {user.tvtimeUsername && (
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded-full">
                      <img
                        src="/logos/tvtime.png"
                        alt="TVTime"
                        className="w-3 h-3"
                      />
                      <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300">
                        {t("users.tvtime", { defaultValue: "TVTime" })}
                      </span>
                    </div>
                  )}
                  {onToggleEnabled && !isCurrentUser ? (
                    <button
                      onClick={() => handleToggleEnabled(user.id, user.enabled)}
                      disabled={togglingId === user.id}
                      className={`px-2 py-0.5 text-xs font-semibold rounded-full transition-colors ${
                        user.enabled
                          ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800"
                          : "dark:bg-[#1e1e1e] bg-gray-100 text-gray-800 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-[#1e1e1e]"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      title={
                        user.enabled
                          ? t("users.disableUser", {
                              defaultValue: "Disable user",
                            })
                          : t("users.enableUser", {
                              defaultValue: "Enable user",
                            })
                      }
                    >
                      {togglingId === user.id ? (
                        <FaSpinner className="animate-spin h-3 w-3" />
                      ) : user.enabled ? (
                        t("users.enabled", { defaultValue: "Enabled" })
                      ) : (
                        t("users.disabled", { defaultValue: "Disabled" })
                      )}
                    </button>
                  ) : (
                    <span
                      className={`px-2 py-0.5 inline-flex text-xs font-semibold rounded-full ${
                        user.enabled
                          ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                          : "dark:bg-[#1e1e1e] bg-gray-100 text-gray-800 dark:text-slate-200"
                      }`}
                    >
                      {user.enabled
                        ? t("users.enabled", { defaultValue: "Enabled" })
                        : t("users.disabled", { defaultValue: "Disabled" })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block dark:bg-[#121212] bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
            <thead className="dark:bg-[#121212] bg-gray-50">
              <tr>
                {onBulkDelete && (
                  <th className="px-2 sm:px-4 md:px-6 py-3 text-left">
                    <CustomCheckbox
                      checked={allSelected}
                      onChange={handleSelectAll}
                    />
                  </th>
                )}
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-xs font-medium dark:text-slate-400 text-gray-500 uppercase tracking-wider">
                  {t("users.user", { defaultValue: "User" })}
                </th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-xs font-medium dark:text-slate-400 text-gray-500 uppercase tracking-wider">
                  {t("users.accounts", { defaultValue: "Accounts" })}
                </th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-xs font-medium dark:text-slate-400 text-gray-500 uppercase tracking-wider">
                  {t("users.email", { defaultValue: "Email" })}
                </th>
                {onDelete && (
                  <th className="px-2 sm:px-4 md:px-6 py-3 text-right text-xs font-medium dark:text-slate-400 text-gray-500 uppercase tracking-wider">
                    {t("users.actions", { defaultValue: "Actions" })}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="dark:bg-[#121212] bg-white divide-y divide-gray-200">
              {users.map((user) => {
                const isCurrentUser = currentUser?.id === user.id;
                const canDelete = onDelete && !isCurrentUser && !user.isAdmin;
                const canSelect =
                  onBulkDelete && !isCurrentUser && !user.isAdmin;
                const isSelected = selectedIds.has(user.id);

                return (
                  <tr
                    key={user.id}
                    className={
                      confirmDeleteId === user.id
                        ? "bg-red-50 dark:bg-red-950"
                        : isSelected
                          ? "bg-orange-50 dark:bg-orange-950"
                          : ""
                    }
                  >
                    {onBulkDelete && (
                      <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap">
                        <CustomCheckbox
                          checked={isSelected}
                          onChange={() => handleSelectItem(user.id)}
                          disabled={!canSelect}
                        />
                      </td>
                    )}
                    <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap text-sm dark:text-white text-gray-900">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <img
                          src={
                            user.thumb ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(
                              user.displayName || user.plexUsername || "User"
                            )}&background=6366f1&color=fff&size=128`
                          }
                          alt={user.displayName || user.plexUsername}
                          className="h-8 w-8 sm:h-10 sm:w-10 rounded-full object-cover border-2 dark:border-[#2d2d2d] border-gray-200"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                user.displayName || user.plexUsername || "User"
                              )}&background=6366f1&color=fff&size=128`;
                          }}
                        />
                        <span className="truncate">
                          {user.displayName || "-"}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {user.isAdmin && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 rounded-full">
                            <FaCrown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                              {t("users.admin", { defaultValue: "Admin" })}
                            </span>
                          </div>
                        )}
                        {user.plexUsername && (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#fff4d6] text-[#915c00] dark:bg-[#231706] dark:text-[#ffdd8a]">
                            <img
                              src="/logos/plex.svg"
                              alt="Plex"
                              className="w-3 h-3"
                            />
                            <span className="text-xs font-medium">
                              {t("users.plex", { defaultValue: "Plex" })}
                            </span>
                          </div>
                        )}
                        {user.jellyfinUsername && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900 rounded-full">
                            <img
                              src="/logos/jellyfin.svg"
                              alt="Jellyfin"
                              className="w-3 h-3"
                            />
                            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                              {t("users.jellyfin", {
                                defaultValue: "Jellyfin",
                              })}
                            </span>
                          </div>
                        )}
                        {user.traktUsername && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900 rounded-full">
                            <img
                              src="/logos/trakt.svg"
                              alt="Trakt"
                              className="w-3 h-3"
                            />
                            <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                              {t("users.trakt", {
                                defaultValue: "Trakt",
                              })}
                            </span>
                          </div>
                        )}
                        {user.tvtimeUsername && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded-full">
                            <img
                              src="/logos/tvtime.png"
                              alt="TVTime"
                              className="w-3 h-3"
                            />
                            <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300">
                              {t("users.tvtime", {
                                defaultValue: "TVTime",
                              })}
                            </span>
                          </div>
                        )}
                        {!user.isAdmin &&
                          !user.plexUsername &&
                          !user.jellyfinUsername &&
                          !user.traktUsername &&
                          !user.tvtimeUsername && (
                            <span className="text-xs dark:text-slate-500 text-gray-400">
                              -
                            </span>
                          )}
                        {onToggleEnabled && !isCurrentUser ? (
                          <button
                            onClick={() =>
                              handleToggleEnabled(user.id, user.enabled)
                            }
                            disabled={togglingId === user.id}
                            className={`px-2 py-0.5 text-xs font-semibold rounded-full transition-colors ${
                              user.enabled
                                ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800"
                                : "dark:bg-[#1e1e1e] bg-gray-100 text-gray-800 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-[#1e1e1e]"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title={
                              user.enabled
                                ? t("users.disableUser", {
                                    defaultValue: "Disable user",
                                  })
                                : t("users.enableUser", {
                                    defaultValue: "Enable user",
                                  })
                            }
                          >
                            {togglingId === user.id ? (
                              <FaSpinner className="animate-spin h-3 w-3" />
                            ) : user.enabled ? (
                              t("users.enabled", { defaultValue: "Enabled" })
                            ) : (
                              t("users.disabled", { defaultValue: "Disabled" })
                            )}
                          </button>
                        ) : (
                          <span
                            className={`px-2 py-0.5 inline-flex text-xs font-semibold rounded-full ${
                              user.enabled
                                ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                                : "dark:bg-[#1e1e1e] bg-gray-100 text-gray-800 dark:text-slate-200"
                            }`}
                          >
                            {user.enabled
                              ? t("users.enabled", { defaultValue: "Enabled" })
                              : t("users.disabled", {
                                  defaultValue: "Disabled",
                                })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap text-sm dark:text-slate-400 text-gray-500">
                      <span className="truncate block max-w-[150px] sm:max-w-none">
                        {user.email || "-"}
                      </span>
                    </td>
                    {onDelete && (
                      <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {canDelete ? (
                          confirmDeleteId === user.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-red-600 dark:text-red-400 mr-2">
                                {t("users.deleteUser", {
                                  defaultValue: "Delete this user?",
                                })}
                              </span>
                              <button
                                onClick={() => handleDelete(user.id)}
                                disabled={deletingId === user.id}
                                className="text-red-600 dark:text-red-500 hover:text-red-900 dark:hover:text-red-400 disabled:opacity-50"
                                title={t("users.confirmDelete", {
                                  defaultValue: "Confirm delete",
                                })}
                              >
                                {deletingId === user.id ? (
                                  <FaSpinner className="animate-spin h-4 w-4" />
                                ) : (
                                  <FaCheck className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                onClick={cancelDelete}
                                disabled={deletingId === user.id}
                                className="text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
                                title={t("common.cancel", {
                                  defaultValue: "Cancel",
                                })}
                              >
                                <FaTimes className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="text-red-600 dark:text-red-500 hover:text-red-900 dark:hover:text-red-400"
                              title={t("users.deleteUserTitle", {
                                defaultValue: "Delete user",
                              })}
                            >
                              <FaTrash className="h-5 w-5" />
                            </button>
                          )
                        ) : (
                          <span className="text-gray-400 dark:text-slate-500 text-xs">
                            {isCurrentUser
                              ? t("users.currentUser", {
                                  defaultValue: "Current user",
                                })
                              : user.isAdmin
                                ? t("users.admin", { defaultValue: "Admin" })
                                : "-"}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
