import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FaTrash, FaCheck, FaExclamationCircle } from "react-icons/fa";
import { CustomRadio } from "@components/ui/CustomRadio";
import {
  removePlexServer,
  getAuthProviders,
  updateSettings,
} from "@services/api";
import { useAuth } from "@contexts/AuthContext";
import { showSuccess, showError } from "@utils/toast";
import type { PlexServer } from "@services/api";

interface PlexSettingsTabProps {
  servers: PlexServer[];
  selectedServerUrl: string;
  savedServerUrl?: string;
  editingServer: string | null;
  onSelectedServerUrlChange: (url: string) => void;
  onEditingServerChange: (serverId: string | null) => void;
  onCancelEdit: () => void;
  hasPlexAccount: boolean;
  onPlexAuthenticate: () => void;
  plexAuthLoading: boolean;
  plexLinkError: string | null;
  onSettingsUpdated?: () => void;
}

export function PlexSettingsTab({
  servers,
  selectedServerUrl,
  savedServerUrl,
  editingServer,
  onSelectedServerUrlChange,
  onEditingServerChange,
  onCancelEdit,
  hasPlexAccount,
  onPlexAuthenticate,
  plexAuthLoading,
  plexLinkError,
  onSettingsUpdated,
}: PlexSettingsTabProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authProviders, setAuthProviders] = useState<{
    hasAdmin: boolean;
    plexConfigured: boolean;
    jellyfinConfigured: boolean;
  } | null>(null);

  const isConfigured =
    hasPlexAccount && servers.length > 0 && !!selectedServerUrl;
  const canRemove = !isAdmin || !!authProviders?.jellyfinConfigured;
  const hasUnsavedChanges =
    selectedServerUrl !== savedServerUrl && !!selectedServerUrl;

  useEffect(() => {
    async function loadAuthProviders() {
      try {
        const providers = await getAuthProviders();
        setAuthProviders(providers);
      } catch {
        // Ignore errors
      }
    }
    loadAuthProviders();
  }, []);

  async function handleSave() {
    if (!selectedServerUrl || !hasUnsavedChanges) return;

    try {
      setSaving(true);
      await updateSettings({ plexServerUrl: selectedServerUrl });
      showSuccess(
        t("settings.plexServerSaved", {
          defaultValue: "Plex server saved successfully",
        })
      );
      if (onSettingsUpdated) {
        await onSettingsUpdated();
      }
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : t("settings.savePlexServerFailed", {
              defaultValue: "Failed to save Plex server",
            })
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    try {
      setRemoving(true);
      await removePlexServer();
      setShowRemoveModal(false);
      showSuccess(
        t("settings.plexServerRemoved", {
          defaultValue: "Plex server removed successfully",
        })
      );
      if (onCancelEdit) {
        onCancelEdit();
      }
      if (onSettingsUpdated) {
        await onSettingsUpdated();
      }
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : t("settings.removePlexServerFailed", {
              defaultValue: "Failed to remove Plex server",
            })
      );
    } finally {
      setRemoving(false);
    }
  }

  function getSelectedConnection(server: PlexServer) {
    return (
      server.connections.find((conn) => conn.uri === selectedServerUrl) ||
      server.connections[0]
    );
  }

  if (!hasPlexAccount || servers.length === 0) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg flex-shrink-0">
            <img src="/logos/plex.svg" alt="Plex" className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              {t("settings.plexServer", { defaultValue: "Plex Server" })}
            </h2>
            <p className="text-xs sm:text-sm dark:text-slate-400 text-gray-600">
              {t("settings.plexServerDescription", {
                defaultValue:
                  "Select the Plex server connection to use for importing users. This setting will be saved and used automatically.",
              })}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-400 dark:border-blue-600 p-4 rounded">
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
              {t("settings.plexAuthRequired", {
                defaultValue:
                  "To configure a Plex server, first authenticate with your Plex account as the admin. This will link your account and let Scroblarr discover your servers.",
              })}
            </p>
            <button
              type="button"
              onClick={onPlexAuthenticate}
              disabled={plexAuthLoading}
              className="mt-1 px-3 py-1.5 text-xs sm:text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {plexAuthLoading
                ? t("common.loading", { defaultValue: "Loading..." })
                : t("auth.plexAuth", {
                    defaultValue: "Authenticate with Plex",
                  })}
            </button>
          </div>
          {plexLinkError && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {plexLinkError}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="mb-4 sm:mb-6 relative">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg flex-shrink-0">
            <img src="/logos/plex.svg" alt="Plex" className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                {t("settings.plexServer", { defaultValue: "Plex Server" })}
              </h2>
              {hasUnsavedChanges && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                  <FaExclamationCircle className="w-3 h-3" />
                  {t("settings.unsavedChanges", { defaultValue: "Unsaved" })}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm dark:text-slate-400 text-gray-600">
              {t("settings.plexServerDescription", {
                defaultValue:
                  "Select the Plex server connection to use for importing users. Click 'Save' to apply your selection.",
              })}
            </p>
          </div>
        </div>
        {isConfigured && (
          <div className="mt-3 sm:mt-0 sm:absolute sm:top-0 sm:right-0 flex items-center gap-2">
            {hasUnsavedChanges && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                    {t("common.loading", { defaultValue: "Saving..." })}
                  </>
                ) : (
                  <>
                    <FaCheck className="w-3 h-3" />
                    {t("common.save", { defaultValue: "Save" })}
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowRemoveModal(true)}
              disabled={!canRemove}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                !canRemove
                  ? t("settings.cannotRemoveOnlyServer", {
                      service: "Jellyfin",
                      defaultValue:
                        "Cannot remove the only configured server. Configure Jellyfin first.",
                    })
                  : undefined
              }
            >
              <FaTrash className="w-4 h-4" />
              {t("settings.removePlexServer", {
                defaultValue: "Remove Server",
              })}
            </button>
          </div>
        )}
      </div>

      {hasPlexAccount && servers.length === 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border-l-4 border-yellow-400 dark:border-yellow-600 p-4 rounded">
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            {t("settings.noServersFound", {
              defaultValue:
                "No Plex servers found. Make sure your Plex Media Server is signed in to your Plex account.",
            })}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {servers.map((server) => {
          const isEditing = editingServer === server.machineIdentifier;
          const selectedConnection = getSelectedConnection(server);
          const connectionsToShow = isEditing
            ? server.connections
            : selectedConnection
              ? [selectedConnection]
              : [];

          return (
            <div
              key={server.machineIdentifier}
              className="border dark:border-[#2d2d2d] border-gray-200 rounded-lg p-4 sm:p-6 bg-gray-50 dark:bg-[#1e1e1e]"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-1 truncate">
                    {server.name}
                  </h3>
                  <p className="text-xs sm:text-sm dark:text-slate-400 text-gray-500 break-words">
                    Version {server.version} •{" "}
                    <span className="break-all">
                      {server.machineIdentifier}
                    </span>
                  </p>
                </div>
                {!isEditing && selectedConnection && (
                  <button
                    onClick={() =>
                      onEditingServerChange(server.machineIdentifier)
                    }
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium px-3 py-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    {t("settings.changeConnection", { defaultValue: "Change" })}
                  </button>
                )}
                {isEditing && (
                  <button
                    onClick={onCancelEdit}
                    className="text-sm dark:text-slate-400 text-gray-600 hover:text-gray-800 dark:hover:text-gray-300 font-medium px-3 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-[#2d2d2d] transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    {t("common.cancel", { defaultValue: "Cancel" })}
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {connectionsToShow.length > 0 && (
                  <>
                    <label className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-2">
                      {isEditing
                        ? t("settings.selectConnection", {
                            defaultValue: "Select Connection",
                          })
                        : t("settings.currentConnection", {
                            defaultValue: "Current Connection",
                          })}
                    </label>
                    <div className="space-y-2">
                      {connectionsToShow.map((connection, index) => (
                        <label
                          key={index}
                          className={`flex items-start sm:items-center p-3 sm:p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            selectedServerUrl === connection.uri
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                              : "dark:border-[#2d2d2d] border-gray-200 hover:dark:border-[#1e1e1e] hover:border-gray-300 bg-white dark:bg-[#121212]"
                          }`}
                        >
                          <div className="mr-3 flex-shrink-0 mt-0.5 sm:mt-0">
                            <CustomRadio
                              name={`server-${server.machineIdentifier}`}
                              value={connection.uri}
                              checked={selectedServerUrl === connection.uri}
                              onChange={() =>
                                onSelectedServerUrlChange(connection.uri)
                              }
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
                              <span className="font-medium dark:text-white text-gray-900 break-all sm:break-words">
                                {connection.uri}
                              </span>
                              <div className="flex items-center gap-2 flex-wrap">
                                {connection.local && (
                                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 whitespace-nowrap">
                                    Local
                                  </span>
                                )}
                                {connection.relay && (
                                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 whitespace-nowrap">
                                    Relay
                                  </span>
                                )}
                                {!connection.local && !connection.relay && (
                                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 whitespace-nowrap">
                                    Remote
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-xs dark:text-slate-400 text-gray-500 mt-1 break-words">
                              {connection.protocol.toUpperCase()} •{" "}
                              {connection.address}:{connection.port}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                )}
                {!selectedConnection && !isEditing && (
                  <div className="bg-yellow-50 dark:bg-yellow-950 border-l-4 border-yellow-400 dark:border-yellow-600 p-4 rounded">
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                      {t("settings.noConnectionSelected", {
                        defaultValue: "No connection selected for this server.",
                      })}
                    </p>
                    <button
                      onClick={() =>
                        onEditingServerChange(server.machineIdentifier)
                      }
                      className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                    >
                      {t("settings.selectConnection", {
                        defaultValue: "Select Connection",
                      })}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showRemoveModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowRemoveModal(false)}
        >
          <div
            className="dark:bg-[#121212] bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-lg font-medium dark:text-white text-gray-900 mb-4">
                {t("settings.removePlexServerTitle", {
                  defaultValue: "Remove Plex Server",
                })}
              </h3>
              <p className="text-sm dark:text-slate-400 text-gray-500 mb-6 whitespace-pre-line">
                {t("settings.removePlexServerMessage", {
                  defaultValue:
                    "Are you sure you want to remove the Plex server configuration? This will:\n\n• Clear the Plex server URL setting\n• Prevent importing new users from Plex\n• Prevent syncing for existing Plex users\n• Keep existing users and their sync history\n\nThis action cannot be undone.",
                })}
              </p>
              {isAdmin && !authProviders?.jellyfinConfigured && (
                <div className="bg-yellow-50 dark:bg-yellow-950 border-l-4 border-yellow-400 dark:border-yellow-600 p-3 rounded mb-4">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    {t("settings.removeServerAdminWarning", {
                      defaultValue:
                        "As an admin, you must have at least one server configured. If you remove Plex and only Plex is configured, you may lose access. Please ensure Jellyfin is configured first.",
                    })}
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowRemoveModal(false)}
                  disabled={removing}
                  className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-[#2d2d2d] rounded-lg hover:bg-gray-200 dark:hover:bg-[#3d3d3d] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={removing || !canRemove}
                  className="px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {removing
                    ? t("common.loading", { defaultValue: "Loading..." })
                    : t("settings.removePlexServer", {
                        defaultValue: "Remove Server",
                      })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
