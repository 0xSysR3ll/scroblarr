import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  FaPlus,
  FaExclamationTriangle,
  FaUsers,
  FaTimes,
  FaCheckCircle,
} from "react-icons/fa";
import { CustomCheckbox } from "@components/ui/CustomCheckbox";
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
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="dark:bg-[#121212] bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-[#2d2d2d]">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
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
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1e1e1e] transition-colors"
            aria-label={t("common.close", { defaultValue: "Close" })}
          >
            <FaTimes className="h-5 w-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingSettings ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
              <span className="ml-3 dark:text-slate-400 text-gray-600">
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
                <div className="border-b border-gray-200 dark:border-[#2d2d2d]">
                  <nav className="-mb-px flex space-x-8">
                    {configuredServices.map((service) => (
                      <button
                        key={service.type}
                        onClick={() => setActiveTab(service.type)}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                          activeTab === service.type
                            ? "border-blue-500 text-blue-600 dark:text-blue-400"
                            : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 hover:border-gray-300 dark:hover:border-[#2d2d2d]"
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
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
                  <span className="ml-3 dark:text-slate-400 text-gray-600">
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
                    <label className="block text-sm font-medium dark:text-slate-300 text-gray-700">
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
                      className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
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
                          className={`relative flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            isSelected
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-md"
                              : "dark:border-[#2d2d2d] border-gray-200 dark:bg-[#121212] bg-white hover:dark:border-[#1e1e1e] hover:border-gray-300 hover:shadow-sm"
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
                                className="h-12 w-12 rounded-full object-cover border-2 dark:border-[#2d2d2d] border-gray-200"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=6366f1&color=fff&size=128`;
                                }}
                              />
                            ) : (
                              <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                                <span className="text-blue-600 dark:text-blue-300 font-semibold text-lg">
                                  {user.username.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div
                              className={`font-medium truncate ${isSelected ? "text-blue-900 dark:text-blue-100" : "dark:text-white text-gray-900"}`}
                            >
                              {user.displayName || user.username}
                            </div>
                            {user.email && (
                              <div className="text-sm dark:text-slate-400 text-gray-500 truncate">
                                {user.email}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <div className="flex-shrink-0 ml-2">
                              <FaCheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  {currentSelectedCount > 0 && (
                    <div className="mt-4 text-sm dark:text-slate-400 text-gray-600">
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
                  <div className="dark:bg-[#121212] bg-gray-50 border dark:border-[#2d2d2d] border-gray-200 rounded-lg p-6 text-center">
                    <FaUsers className="mx-auto h-12 w-12 text-gray-400 dark:text-slate-500" />
                    <p className="mt-2 text-sm dark:text-slate-400 text-gray-600">
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
          <div className="p-6 border-t border-gray-200 dark:border-[#2d2d2d] flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-3 py-2 text-sm font-medium dark:text-slate-300 text-gray-700 dark:bg-[#121212] bg-white border dark:border-[#1e1e1e] border-gray-300 rounded-lg hover:dark:bg-[#1e1e1e] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
              className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-md hover:shadow-lg transition-all flex items-center justify-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
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
      </div>
    </div>
  );
}
