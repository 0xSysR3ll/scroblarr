import { CustomCheckbox } from "@components/ui/CustomCheckbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@components/ui/dialog";
import { Spinner } from "@components/ui/spinner";
import {
  importUsers,
  getServerUsers,
  getSettings,
  getJellyfinUsers,
  importJellyfinUsers,
  type ServerUser,
  type User,
  type Settings,
  type JellyfinUser,
} from "@services/api";
import { showSuccess, showError } from "@utils/toast";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  FaPlus,
  FaExclamationTriangle,
  FaUsers,
  FaTimes,
  FaCheckCircle,
} from "react-icons/fa";

interface UserImportProps {
  isOpen: boolean;
  onClose: () => void;
  existingUsers?: User[];
  onUsersImported?: () => void;
}

type ServiceType = "plex" | "jellyfin";

interface ServiceConfig {
  type: ServiceType;
  configured: boolean;
}

export function UserImport({
  isOpen,
  onClose,
  existingUsers = [],
  onUsersImported,
}: UserImportProps) {
  const { t } = useTranslation();
  const [configuredServices, setConfiguredServices] = useState<ServiceConfig[]>(
    []
  );
  const [activeTab, setActiveTab] = useState<ServiceType | null>(null);
  const [selectedServerUrl, setSelectedServerUrl] = useState("");

  const [plexUsers, setPlexUsers] = useState<ServerUser[]>([]);
  const [selectedPlexUsernames, setSelectedPlexUsernames] = useState<
    Set<string>
  >(new Set());
  const [loadingPlexUsers, setLoadingPlexUsers] = useState(false);

  const [jellyfinUsers, setJellyfinUsers] = useState<JellyfinUser[]>([]);
  const [selectedJellyfinUsernames, setSelectedJellyfinUsernames] = useState<
    Set<string>
  >(new Set());
  const [loadingJellyfinUsers, setLoadingJellyfinUsers] = useState(false);

  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loading, setLoading] = useState(false);

  const existingPlexUsernames = new Set(
    existingUsers.map((u) => u.plexUsername).filter(Boolean)
  );
  const existingJellyfinUsernames = new Set(
    existingUsers.map((u) => u.jellyfinUsername).filter(Boolean)
  );

  const availablePlexUsers = plexUsers.filter(
    (user) => !existingPlexUsernames.has(user.username)
  );
  const availableJellyfinUsers = jellyfinUsers.filter(
    (user) => !existingJellyfinUsernames.has(user.username)
  );

  useEffect(() => {
    if (!isOpen) return;

    async function loadSettings() {
      try {
        setLoadingSettings(true);
        const loadedSettings = await getSettings().catch(
          () => ({}) as Settings
        );

        const services: ServiceConfig[] = [];
        if (loadedSettings.plexServerUrl) {
          services.push({ type: "plex", configured: true });
        }
        if (loadedSettings.jellyfinHost) {
          services.push({ type: "jellyfin", configured: true });
        }
        setConfiguredServices(services);

        if (services.length > 0) {
          setActiveTab(services[0].type);
          if (services[0].type === "plex" && loadedSettings.plexServerUrl) {
            setSelectedServerUrl(loadedSettings.plexServerUrl);
          }
        }
      } catch (err) {
        showError(
          err instanceof Error
            ? err.message
            : t("userImport.loadSettingsFailed", {
                defaultValue: "Failed to load settings",
              })
        );
      } finally {
        setLoadingSettings(false);
      }
    }

    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPlexUsernames(new Set());
      setSelectedJellyfinUsernames(new Set());
      setPlexUsers([]);
      setJellyfinUsers([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    async function fetchPlexUsers() {
      if (activeTab !== "plex" || !selectedServerUrl) {
        return;
      }

      try {
        setLoadingPlexUsers(true);
        const users = await getServerUsers(selectedServerUrl);
        setPlexUsers(users);
        setSelectedPlexUsernames(new Set());
      } catch (err) {
        showError(
          err instanceof Error
            ? err.message
            : t("userImport.loadServerUsersFailed", {
                defaultValue: "Failed to load server users",
              })
        );
        setPlexUsers([]);
      } finally {
        setLoadingPlexUsers(false);
      }
    }

    fetchPlexUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServerUrl, activeTab, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    async function fetchJellyfinUsers() {
      if (activeTab !== "jellyfin") {
        return;
      }

      try {
        setLoadingJellyfinUsers(true);
        const users = await getJellyfinUsers();
        setJellyfinUsers(users);
        setSelectedJellyfinUsernames(new Set());
      } catch (err) {
        showError(
          err instanceof Error
            ? err.message
            : t("userImport.loadServerUsersFailed", {
                defaultValue: "Failed to load server users",
              })
        );
        setJellyfinUsers([]);
      } finally {
        setLoadingJellyfinUsers(false);
      }
    }

    fetchJellyfinUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isOpen]);

  function handlePlexUserToggle(username: string) {
    const newSelected = new Set(selectedPlexUsernames);
    if (newSelected.has(username)) {
      newSelected.delete(username);
    } else {
      newSelected.add(username);
    }
    setSelectedPlexUsernames(newSelected);
  }

  function handleJellyfinUserToggle(username: string) {
    const newSelected = new Set(selectedJellyfinUsernames);
    if (newSelected.has(username)) {
      newSelected.delete(username);
    } else {
      newSelected.add(username);
    }
    setSelectedJellyfinUsernames(newSelected);
  }

  function handlePlexSelectAll() {
    if (selectedPlexUsernames.size === availablePlexUsers.length) {
      setSelectedPlexUsernames(new Set());
    } else {
      setSelectedPlexUsernames(
        new Set(availablePlexUsers.map((u) => u.username))
      );
    }
  }

  function handleJellyfinSelectAll() {
    if (selectedJellyfinUsernames.size === availableJellyfinUsers.length) {
      setSelectedJellyfinUsernames(new Set());
    } else {
      setSelectedJellyfinUsernames(
        new Set(availableJellyfinUsers.map((u) => u.username))
      );
    }
  }

  async function handleImport() {
    if (activeTab === "plex") {
      if (!selectedServerUrl) {
        showError(
          t("userImport.selectServer", {
            defaultValue: "Please select a server",
          })
        );
        return;
      }

      if (selectedPlexUsernames.size === 0) {
        showError(
          t("userImport.selectUsers", {
            defaultValue: "Please select at least one user to import",
          })
        );
        return;
      }

      try {
        setLoading(true);
        await importUsers(selectedServerUrl, Array.from(selectedPlexUsernames));

        showSuccess(
          t("userImport.importSuccess", {
            defaultValue: "Users imported successfully",
          })
        );
        setSelectedPlexUsernames(new Set());

        onClose();

        if (onUsersImported) {
          onUsersImported();
        }
      } catch (err) {
        showError(
          err instanceof Error
            ? err.message
            : t("userImport.importFailed", {
                defaultValue: "Failed to import users",
              })
        );
      } finally {
        setLoading(false);
      }
    } else if (activeTab === "jellyfin") {
      if (selectedJellyfinUsernames.size === 0) {
        showError(
          t("userImport.selectUsers", {
            defaultValue: "Please select at least one user to import",
          })
        );
        return;
      }

      try {
        setLoading(true);
        await importJellyfinUsers(Array.from(selectedJellyfinUsernames));

        showSuccess(
          t("userImport.importSuccess", {
            defaultValue: "Users imported successfully",
          })
        );
        setSelectedJellyfinUsernames(new Set());

        if (onUsersImported) {
          onUsersImported();
        }

        setTimeout(() => {
          onClose();
        }, 1500);
      } catch (err) {
        showError(
          err instanceof Error
            ? err.message
            : t("userImport.importFailed", {
                defaultValue: "Failed to import users",
              })
        );
      } finally {
        setLoading(false);
      }
    }
  }

  if (!isOpen) return null;

  const currentLoadingUsers =
    activeTab === "plex" ? loadingPlexUsers : loadingJellyfinUsers;
  const currentSelectedCount =
    activeTab === "plex"
      ? selectedPlexUsernames.size
      : selectedJellyfinUsernames.size;
  const currentAvailableUsers =
    activeTab === "plex" ? availablePlexUsers : availableJellyfinUsers;
  const currentAllUsers = activeTab === "plex" ? plexUsers : jellyfinUsers;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogDescription className="sr-only">
          {t("userImport.importUsersTitle", {
            defaultValue: "Import Users",
          })}
        </DialogDescription>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-6">
          <DialogTitle className="text-xl font-semibold text-foreground">
            {configuredServices.length === 1 &&
            configuredServices[0].type === "plex"
              ? t("userImport.importFromPlex", {
                  defaultValue: "Import Users from Plex Server",
                })
              : configuredServices.length === 1 &&
                  configuredServices[0].type === "jellyfin"
                ? t("userImport.importFromJellyfin", {
                    defaultValue: "Import Users from Jellyfin Server",
                  })
                : t("userImport.importUsersTitle", {
                    defaultValue: "Import Users",
                  })}
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-muted"
            aria-label={t("common.close", { defaultValue: "Close" })}
          >
            <FaTimes className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingSettings ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="xl" />
              <span className="ml-3 text-muted-foreground">
                {t("common.loading", { defaultValue: "Loading..." })}
              </span>
            </div>
          ) : configuredServices.length === 0 ? (
            <div className="bg-yellow-50 dark:bg-yellow-950 border-l-4 border-yellow-400 dark:border-yellow-600 p-4 rounded">
              <div className="flex">
                <div className="flex-shrink-0">
                  <FaExclamationTriangle className="h-5 w-5 text-yellow-400 dark:text-yellow-500" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    {t("userImport.noServerConfigured", {
                      defaultValue:
                        "No server configured. Please configure Plex or Jellyfin in Settings.",
                    })}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Service Tabs */}
              {configuredServices.length > 1 && (
                <div className="border-b border-border">
                  <nav className="-mb-px flex space-x-8">
                    {configuredServices.map((service) => (
                      <button
                        key={service.type}
                        onClick={() => setActiveTab(service.type)}
                        className={`border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                          activeTab === service.type
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:border-muted hover:text-foreground"
                        }`}
                      >
                        {service.type === "plex"
                          ? t("userImport.plex", { defaultValue: "Plex" })
                          : t("userImport.jellyfin", {
                              defaultValue: "Jellyfin",
                            })}
                      </button>
                    ))}
                  </nav>
                </div>
              )}

              {/* Loading Users */}
              {currentLoadingUsers && (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="xl" />
                  <span className="ml-3 text-muted-foreground">
                    {t("userImport.loadingUsers", {
                      defaultValue: "Loading users from server...",
                    })}
                  </span>
                </div>
              )}

              {/* User Selection */}
              {!currentLoadingUsers && currentAvailableUsers.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-sm font-medium text-foreground">
                      {t("userImport.selectUsersLabel", {
                        defaultValue:
                          "Select Users to Import ({{available}} available)",
                        available: currentAvailableUsers.length,
                      })}
                    </label>
                    <button
                      type="button"
                      onClick={
                        activeTab === "plex"
                          ? handlePlexSelectAll
                          : handleJellyfinSelectAll
                      }
                      className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
                    >
                      {(activeTab === "plex"
                        ? selectedPlexUsernames.size
                        : selectedJellyfinUsernames.size) ===
                      currentAvailableUsers.length
                        ? t("userImport.deselectAll", {
                            defaultValue: "Deselect All",
                          })
                        : t("userImport.selectAll", {
                            defaultValue: "Select All",
                          })}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-1">
                    {currentAvailableUsers.map((user) => {
                      const isSelected =
                        activeTab === "plex"
                          ? selectedPlexUsernames.has(user.username)
                          : selectedJellyfinUsernames.has(user.username);
                      return (
                        <label
                          key={user.username}
                          className={`relative flex cursor-pointer items-center rounded-lg border-2 p-4 transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-sm"
                              : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
                          }`}
                        >
                          <div className="flex-shrink-0 mr-3">
                            <CustomCheckbox
                              checked={isSelected}
                              onChange={() => {
                                if (activeTab === "plex") {
                                  handlePlexUserToggle(user.username);
                                } else {
                                  handleJellyfinUserToggle(user.username);
                                }
                              }}
                            />
                          </div>
                          <div className="flex-shrink-0 mr-3">
                            {user.thumb ? (
                              <img
                                src={user.thumb}
                                alt={user.username}
                                className="h-12 w-12 rounded-full border-2 border-border object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=6366f1&color=fff&size=128`;
                                }}
                              />
                            ) : (
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
                                <span className="text-lg font-semibold text-primary">
                                  {user.username.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div
                              className={`truncate font-medium ${isSelected ? "text-primary" : "text-foreground"}`}
                            >
                              {user.displayName || user.username}
                            </div>
                            {user.email && (
                              <div className="truncate text-sm text-muted-foreground">
                                {user.email}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <div className="flex-shrink-0 ml-2">
                              <FaCheckCircle className="h-5 w-5 text-primary" />
                            </div>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  {currentSelectedCount > 0 && (
                    <div className="mt-4 text-sm text-muted-foreground">
                      {t("userImport.usersSelected", {
                        count: currentSelectedCount,
                        plural: currentSelectedCount !== 1 ? "s" : "",
                        defaultValue: "{{count}} user{{plural}} selected",
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* No Users Available */}
              {!currentLoadingUsers &&
                activeTab &&
                ((activeTab === "plex" && selectedServerUrl) ||
                  activeTab === "jellyfin") &&
                currentAvailableUsers.length === 0 && (
                  <div className="rounded-lg border border-border bg-muted/40 p-6 text-center">
                    <FaUsers className="mx-auto h-12 w-12 text-muted-foreground/60" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      {currentAllUsers.length === 0
                        ? t("userImport.noUsersFound", {
                            defaultValue: "No users found on this server.",
                          })
                        : t("userImport.allUsersImported", {
                            defaultValue:
                              "All users from this server have already been imported.",
                          })}
                    </p>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loadingSettings && configuredServices.length > 0 && (
          <div className="flex gap-3 border-t border-border p-6">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              onClick={handleImport}
              disabled={
                loading ||
                (activeTab === "plex" && !selectedServerUrl) ||
                currentSelectedCount === 0
              }
              className="flex flex-1 items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Spinner size="lg" variant="onPrimary" className="mr-2" />
                  {t("common.loading", { defaultValue: "Loading..." })}
                </>
              ) : (
                <>
                  <FaPlus className="h-5 w-5 mr-2" />
                  {t("userImport.importUsers", {
                    count: currentSelectedCount,
                    plural: currentSelectedCount !== 1 ? "s" : "",
                    defaultValue: "Import {{count}} User{{plural}}",
                  })}
                </>
              )}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
