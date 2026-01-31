import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaPlus, FaTrash, FaSpinner } from "react-icons/fa";
import { useUsers } from "@hooks/users/useUsers";
import { UserList } from "@components/users/UserList";
import { UserImport } from "@components/users/UserImport";
import { useAuth } from "@contexts/AuthContext";
import { showSuccess, showError } from "@utils/toast";

export function UsersPage() {
  const { t } = useTranslation();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const {
    users,
    loading,
    error,
    removeUser,
    removeUsers,
    modifyUser,
    loadUsers,
  } = useUsers();
  const { isAdmin } = useAuth();

  async function handleBulkDelete() {
    if (!isAdmin || selectedIds.size === 0) return;

    try {
      setBulkDeleting(true);
      await removeUsers(Array.from(selectedIds));
      setSelectedIds(new Set());
      setShowBulkDeleteModal(false);
      await loadUsers();
      showSuccess(
        t("users.bulkDeleteSuccess", {
          defaultValue: "Users deleted successfully",
        })
      );
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : t("users.deleteFailed", { defaultValue: "Failed to delete user" })
      );
    } finally {
      setBulkDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-[#0a0a0a]">
        <p className="dark:text-slate-400 text-gray-600">
          {t("common.loading", { defaultValue: "Loading..." })}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-[#0a0a0a]">
        <p className="text-red-600 dark:text-red-400">
          {t("common.error", { defaultValue: "Error" })}: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            {t("users.title", { defaultValue: "Users" })}
          </h1>
          {isAdmin && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setShowBulkDeleteModal(true)}
                  disabled={bulkDeleting}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-md hover:shadow-lg transition-colors"
                >
                  {bulkDeleting ? (
                    <>
                      <FaSpinner className="animate-spin h-5 w-5" />
                      {t("users.modals.deleting", {
                        defaultValue: "Deleting...",
                      })}
                    </>
                  ) : (
                    <>
                      <FaTrash className="h-5 w-5" />
                      {t("users.deleteSelected", {
                        defaultValue: "Delete Selected",
                      })}{" "}
                      ({selectedIds.size})
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center justify-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-md hover:shadow-lg"
              >
                <FaPlus className="h-5 w-5" />
                {t("userImport.importUsersButton", {
                  defaultValue: "Import Users",
                })}
              </button>
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <UserImport
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          existingUsers={users}
          onUsersImported={loadUsers}
        />
      )}

      <UserList
        users={users}
        onDelete={isAdmin ? removeUser : undefined}
        onBulkDelete={isAdmin ? removeUsers : undefined}
        onToggleEnabled={
          isAdmin
            ? async (id, enabled) => {
                await modifyUser(id, { enabled });
              }
            : undefined
        }
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
      />

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
                {t("users.modals.bulkDeleteTitle", {
                  defaultValue: "Delete Selected Users",
                })}
              </h3>
              <p className="text-sm dark:text-slate-400 text-gray-500 mb-6">
                {t("users.modals.bulkDeleteMessage", {
                  count: selectedIds.size,
                  plural: selectedIds.size > 1 ? "s" : "",
                  defaultValue:
                    "Are you sure you want to delete {{count}} user{{plural}}? This action cannot be undone.",
                })}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowBulkDeleteModal(false)}
                  disabled={bulkDeleting}
                  className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-[#121212] border border-gray-300 dark:border-[#1e1e1e] rounded-md hover:bg-gray-50 dark:hover:bg-[#2d2d2d] disabled:opacity-50"
                >
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="px-3 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {bulkDeleting ? (
                    <>
                      <FaSpinner className="animate-spin h-4 w-4" />
                      {t("users.modals.deleting", {
                        defaultValue: "Deleting...",
                      })}
                    </>
                  ) : (
                    t("users.modals.delete", { defaultValue: "Delete" })
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
