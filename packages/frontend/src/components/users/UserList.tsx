import { CustomCheckbox } from "@components/ui/CustomCheckbox";
import { Spinner } from "@components/ui/spinner";
import { useAuth } from "@contexts/AuthContext";
import { User } from "@services/api";
import { showSuccess, showError } from "@utils/toast";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaCheck, FaTimes, FaTrash, FaCrown } from "react-icons/fa";

import { UserAvatar } from "@/components/ui/UserAvatar";

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
      <div className="surface-panel p-6">
        <p className="text-muted-foreground">
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
          <div className="surface-panel flex items-center gap-3 p-3">
            <CustomCheckbox
              checked={allSelected}
              onChange={handleSelectAll}
              ariaLabel={t("users.selectAll", { defaultValue: "Select All" })}
            />
            <span className="text-sm font-medium text-foreground">
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
              className={`surface-panel p-4 ${
                confirmDeleteId === user.id
                  ? "border-destructive"
                  : isSelected
                    ? "border-warning-500 dark:border-warning-600"
                    : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {onBulkDelete && (
                    <CustomCheckbox
                      checked={isSelected}
                      onChange={() => handleSelectItem(user.id)}
                      disabled={!canSelect}
                      ariaLabel={t("users.selectUser", {
                        defaultValue: "Select {{name}}",
                        name: user.displayName || user.plexUsername,
                      })}
                    />
                  )}
                  <UserAvatar
                    name={user.displayName || user.plexUsername || "User"}
                    src={user.thumb}
                    size="lg"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {user.displayName || "-"}
                    </div>
                    {user.email && (
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {user.email}
                      </div>
                    )}
                  </div>
                </div>
                {onDelete && canDelete && (
                  <div className="shrink-0">
                    {confirmDeleteId === user.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-destructive">
                          {t("users.deleteUser", {
                            defaultValue: "Delete?",
                          })}
                        </span>
                        <button
                          onClick={() => handleDelete(user.id)}
                          disabled={deletingId === user.id}
                          aria-label={t("users.confirmDelete", {
                            defaultValue: "Confirm delete",
                          })}
                          className="inline-flex size-8 cursor-pointer items-center justify-center text-destructive hover:text-destructive/80 disabled:opacity-50"
                          title={t("users.confirmDelete", {
                            defaultValue: "Confirm delete",
                          })}
                        >
                          {deletingId === user.id ? (
                            <Spinner size="md" />
                          ) : (
                            <FaCheck className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={cancelDelete}
                          disabled={deletingId === user.id}
                          className="inline-flex size-8 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
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
                        aria-label={t("users.deleteUserTitle", {
                          defaultValue: "Delete user",
                        })}
                        className="inline-flex size-8 cursor-pointer items-center justify-center text-destructive hover:text-destructive/80"
                        title={t("users.deleteUserTitle", {
                          defaultValue: "Delete user",
                        })}
                      >
                        <FaTrash className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {user.isAdmin && (
                    <div className="chip bg-primary/15">
                      <FaCrown className="h-3 w-3 text-primary" />
                      <span className="text-xs font-medium text-primary">
                        {t("users.admin", { defaultValue: "Admin" })}
                      </span>
                    </div>
                  )}
                  {user.plexUsername && (
                    <div className="chip bg-(--plex-chip-bg) text-(--plex-chip-fg)">
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
                    <div className="chip bg-indigo-100 dark:bg-indigo-900">
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
                    <div className="chip bg-purple-100 dark:bg-purple-900">
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
                  {user.simklUsername && (
                    <div className="chip bg-emerald-100 dark:bg-emerald-900">
                      <img
                        src="/logos/simkl.svg"
                        alt="Simkl"
                        className="w-3 h-3"
                      />
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        {t("users.simkl", { defaultValue: "Simkl" })}
                      </span>
                    </div>
                  )}
                  {onToggleEnabled && !isCurrentUser ? (
                    <button
                      onClick={() => handleToggleEnabled(user.id, user.enabled)}
                      disabled={togglingId === user.id}
                      className={`chip cursor-pointer font-semibold transition-colors ${
                        user.enabled
                          ? "bg-success-100 text-success-800 hover:bg-success-200 dark:bg-success-900 dark:text-success-200 dark:hover:bg-success-800"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
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
                        <Spinner size="xs" />
                      ) : user.enabled ? (
                        t("users.enabled", { defaultValue: "Enabled" })
                      ) : (
                        t("users.disabled", { defaultValue: "Disabled" })
                      )}
                    </button>
                  ) : (
                    <span
                      className={`chip font-semibold ${
                        user.enabled
                          ? "bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200"
                          : "bg-muted text-muted-foreground"
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
      <div className="surface-panel hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                {onBulkDelete && (
                  <th className="px-2 sm:px-4 md:px-6 py-3 text-left">
                    <CustomCheckbox
                      checked={allSelected}
                      onChange={handleSelectAll}
                      ariaLabel={t("users.selectAll", {
                        defaultValue: "Select All",
                      })}
                    />
                  </th>
                )}
                <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:px-4 md:px-6">
                  {t("users.user", { defaultValue: "User" })}
                </th>
                <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:px-4 md:px-6">
                  {t("users.accounts", { defaultValue: "Accounts" })}
                </th>
                <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:px-4 md:px-6">
                  {t("users.email", { defaultValue: "Email" })}
                </th>
                {onDelete && (
                  <th className="px-2 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground sm:px-4 md:px-6">
                    {t("users.actions", { defaultValue: "Actions" })}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card text-card-foreground">
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
                        ? "bg-destructive/10"
                        : isSelected
                          ? "bg-warning-50 dark:bg-warning-950"
                          : ""
                    }
                  >
                    {onBulkDelete && (
                      <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap">
                        <CustomCheckbox
                          checked={isSelected}
                          onChange={() => handleSelectItem(user.id)}
                          disabled={!canSelect}
                          ariaLabel={t("users.selectUser", {
                            defaultValue: "Select {{name}}",
                            name: user.displayName || user.plexUsername,
                          })}
                        />
                      </td>
                    )}
                    <td className="px-2 py-4 text-sm whitespace-nowrap text-foreground sm:px-4 md:px-6">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <UserAvatar
                          name={user.displayName || user.plexUsername || "User"}
                          src={user.thumb}
                          size="sm"
                          className="sm:h-10 sm:w-10 sm:text-sm"
                        />
                        <span className="truncate">
                          {user.displayName || "-"}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {user.isAdmin && (
                          <div className="chip bg-primary/15">
                            <FaCrown className="h-3 w-3 text-primary" />
                            <span className="text-xs font-medium text-primary">
                              {t("users.admin", { defaultValue: "Admin" })}
                            </span>
                          </div>
                        )}
                        {user.plexUsername && (
                          <div className="chip bg-(--plex-chip-bg) text-(--plex-chip-fg)">
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
                          <div className="chip bg-indigo-100 dark:bg-indigo-900">
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
                          <div className="chip bg-purple-100 dark:bg-purple-900">
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
                        {user.simklUsername && (
                          <div className="chip bg-emerald-100 dark:bg-emerald-900">
                            <img
                              src="/logos/simkl.svg"
                              alt="Simkl"
                              className="w-3 h-3"
                            />
                            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                              {t("users.simkl", {
                                defaultValue: "Simkl",
                              })}
                            </span>
                          </div>
                        )}
                        {!user.isAdmin &&
                          !user.plexUsername &&
                          !user.jellyfinUsername &&
                          !user.traktUsername &&
                          !user.simklUsername && (
                            <span className="text-xs text-muted-foreground/60">
                              -
                            </span>
                          )}
                        {onToggleEnabled && !isCurrentUser ? (
                          <button
                            onClick={() =>
                              handleToggleEnabled(user.id, user.enabled)
                            }
                            disabled={togglingId === user.id}
                            className={`chip cursor-pointer font-semibold transition-colors ${
                              user.enabled
                                ? "bg-success-100 text-success-800 hover:bg-success-200 dark:bg-success-900 dark:text-success-200 dark:hover:bg-success-800"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            } disabled:cursor-not-allowed disabled:opacity-50`}
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
                              <Spinner size="xs" />
                            ) : user.enabled ? (
                              t("users.enabled", { defaultValue: "Enabled" })
                            ) : (
                              t("users.disabled", { defaultValue: "Disabled" })
                            )}
                          </button>
                        ) : (
                          <span
                            className={`chip font-semibold ${
                              user.enabled
                                ? "bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200"
                                : "bg-muted text-muted-foreground"
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
                    <td className="px-2 py-4 text-sm whitespace-nowrap text-muted-foreground sm:px-4 md:px-6">
                      <span className="truncate block max-w-[150px] sm:max-w-none">
                        {user.email || "-"}
                      </span>
                    </td>
                    {onDelete && (
                      <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {canDelete ? (
                          confirmDeleteId === user.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-destructive mr-2">
                                {t("users.deleteUser", {
                                  defaultValue: "Delete this user?",
                                })}
                              </span>
                              <button
                                onClick={() => handleDelete(user.id)}
                                disabled={deletingId === user.id}
                                aria-label={t("users.confirmDelete", {
                                  defaultValue: "Confirm delete",
                                })}
                                className="inline-flex size-8 cursor-pointer items-center justify-center text-destructive hover:text-destructive/80 disabled:opacity-50"
                                title={t("users.confirmDelete", {
                                  defaultValue: "Confirm delete",
                                })}
                              >
                                {deletingId === user.id ? (
                                  <Spinner size="md" />
                                ) : (
                                  <FaCheck className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                onClick={cancelDelete}
                                disabled={deletingId === user.id}
                                className="inline-flex size-8 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
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
                              aria-label={t("users.deleteUserTitle", {
                                defaultValue: "Delete user",
                              })}
                              className="inline-flex size-8 cursor-pointer items-center justify-center text-destructive hover:text-destructive/80"
                              title={t("users.deleteUserTitle", {
                                defaultValue: "Delete user",
                              })}
                            >
                              <FaTrash className="h-4 w-4" />
                            </button>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground/70">
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
