import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@components/ui/dialog";
import { Spinner } from "@components/ui/spinner";
import { UserImport } from "@components/users/UserImport";
import { UserList } from "@components/users/UserList";
import { useAuth } from "@contexts/AuthContext";
import { useUsers } from "@hooks/users/useUsers";
import { showSuccess, showError } from "@utils/toast";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaPlus, FaTrash } from "react-icons/fa";

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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">
          {t("common.loading", { defaultValue: "Loading..." })}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-destructive">
          {t("common.error", { defaultValue: "Error" })}: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            {t("users.title", { defaultValue: "Users" })}
          </h1>
          {isAdmin && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteModal(true)}
                  disabled={bulkDeleting}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-highlight-600 px-3 py-2 text-sm font-medium text-white shadow-md transition-colors hover:bg-highlight-700 disabled:cursor-not-allowed disabled:opacity-50 hover:shadow-lg"
                >
                  {bulkDeleting ? (
                    <>
                      <Spinner size="lg" />
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
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-md transition-colors hover:bg-primary/90 hover:shadow-lg"
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

      <Dialog open={showBulkDeleteModal} onOpenChange={setShowBulkDeleteModal}>
        <DialogContent className="max-w-md rounded-xl shadow-xl">
          <DialogTitle>
            {t("users.modals.bulkDeleteTitle", {
              defaultValue: "Delete Selected Users",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("users.modals.bulkDeleteMessage", {
              count: selectedIds.size,
              plural: selectedIds.size > 1 ? "s" : "",
              defaultValue:
                "Are you sure you want to delete {{count}} user{{plural}}? This action cannot be undone.",
            })}
          </DialogDescription>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowBulkDeleteModal(false)}
              disabled={bulkDeleting}
              className="rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/80 disabled:opacity-50"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 rounded-md bg-highlight-600 px-3 py-2 text-sm font-medium text-white hover:bg-highlight-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkDeleting ? (
                <>
                  <Spinner size="md" />
                  {t("users.modals.deleting", {
                    defaultValue: "Deleting...",
                  })}
                </>
              ) : (
                t("users.modals.delete", { defaultValue: "Delete" })
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
