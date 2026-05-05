import { CustomRadio } from "@components/ui/CustomRadio";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@components/ui/dialog";
import { Spinner } from "@components/ui/spinner";
import { useAuth } from "@contexts/AuthContext";
import {
  removePlexServer,
  getAuthProviders,
  updateSettings,
} from "@services/api";
import type { PlexServer } from "@services/api";
import { showSuccess, showError } from "@utils/toast";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  FaTrash,
  FaCheck,
  FaExclamationCircle,
  FaSyncAlt,
} from "react-icons/fa";

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
  plexRefreshLoading: boolean;
  onRefreshPlexServers: () => void;
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
  plexRefreshLoading,
  onRefreshPlexServers,
  plexLinkError,
  onSettingsUpdated,
}: PlexSettingsTabProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualServerUrl, setManualServerUrl] = useState(selectedServerUrl);
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

  useEffect(() => {
    setManualServerUrl(selectedServerUrl);
  }, [selectedServerUrl]);

  async function handleSave() {
    if (!selectedServerUrl || !hasUnsavedChanges) return;

    try {
      setSaving(true);
      const server = servers.find((s) =>
        s.connections.some((c) => c.uri === selectedServerUrl)
      );
      await updateSettings({
        plexServerUrl: selectedServerUrl,
        ...(server?.machineIdentifier
          ? { plexServerMachineIdentifier: server.machineIdentifier }
          : {}),
      });
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
          <div className="flex-shrink-0 rounded-lg bg-primary/15 p-2">
            <img src="/logos/plex.svg" alt="Plex" className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground sm:text-xl">
              {t("settings.plexServer", { defaultValue: "Plex Server" })}
            </h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {t("settings.plexServerDescription", {
                defaultValue:
                  "Select the Plex server connection to use for importing users. This setting will be saved and used automatically.",
              })}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded border-l-4 border-primary bg-primary/5 p-4">
            <p className="mb-2 text-sm text-primary">
              {t("settings.plexAuthRequired", {
                defaultValue:
                  "To configure a Plex server, first authenticate with your Plex account as the admin. This will link your account and let Scroblarr discover your servers.",
              })}
            </p>
            <button
              type="button"
              onClick={onPlexAuthenticate}
              disabled={plexAuthLoading}
              className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
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
          <div className="flex-shrink-0 rounded-lg bg-primary/15 p-2">
            <img src="/logos/plex.svg" alt="Plex" className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground sm:text-xl">
                {t("settings.plexServer", { defaultValue: "Plex Server" })}
              </h2>
              {hasUnsavedChanges && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                  <FaExclamationCircle className="w-3 h-3" />
                  {t("settings.unsavedChanges", { defaultValue: "Unsaved" })}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {t("settings.plexServerDescription", {
                defaultValue:
                  "Select the Plex server connection to use for importing users. Click 'Save' to apply your selection.",
              })}
            </p>
          </div>
        </div>
        {hasPlexAccount && (
          <div className="mt-3 sm:mt-0 sm:absolute sm:top-0 sm:right-0 flex items-center gap-2">
            <button
              type="button"
              onClick={onRefreshPlexServers}
              disabled={plexRefreshLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {plexRefreshLoading ? (
                <>
                  <Spinner size="sm" />
                  {t("common.loading", { defaultValue: "Loading..." })}
                </>
              ) : (
                <>
                  <FaSyncAlt className="w-3 h-3" />
                  {t("settings.refreshServers", {
                    defaultValue: "Refresh servers",
                  })}
                </>
              )}
            </button>
            {isConfigured && hasUnsavedChanges && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Spinner size="sm" variant="onPrimary" />
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
            {isConfigured && (
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
            )}
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
        <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t("settings.manualConnectionUrl", {
              defaultValue: "Manual Connection URL",
            })}
          </label>
          <div>
            <input
              type="url"
              value={manualServerUrl}
              onChange={(e) => setManualServerUrl(e.target.value)}
              onBlur={() => {
                const trimmed = manualServerUrl.trim();
                if (trimmed && trimmed !== selectedServerUrl) {
                  onSelectedServerUrlChange(trimmed);
                }
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const trimmed = manualServerUrl.trim();
                if (trimmed && trimmed !== selectedServerUrl) {
                  onSelectedServerUrlChange(trimmed);
                }
              }}
              placeholder="http://192.168.1.10:32400"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("settings.manualConnectionHelp", {
              defaultValue:
                "Use this if auto-discovered Plex connections are unreachable from your Docker network.",
            })}
          </p>
        </div>

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
              className="rounded-lg border border-border bg-muted/30 p-4 sm:p-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <h3 className="mb-1 truncate text-base font-semibold text-foreground sm:text-lg">
                    {server.name}
                  </h3>
                  <p className="break-words text-xs text-muted-foreground sm:text-sm">
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
                    className="flex-shrink-0 whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 hover:text-primary/80"
                  >
                    {t("settings.changeConnection", { defaultValue: "Change" })}
                  </button>
                )}
                {isEditing && (
                  <button
                    onClick={onCancelEdit}
                    className="flex-shrink-0 whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {t("common.cancel", { defaultValue: "Cancel" })}
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {connectionsToShow.length > 0 && (
                  <>
                    <label className="mb-2 block text-sm font-medium text-foreground">
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
                              ? "border-primary bg-primary/10"
                              : "border-border bg-card hover:border-muted-foreground/40"
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
                              <span className="break-all font-medium text-foreground sm:break-words">
                                {connection.uri}
                              </span>
                              <div className="flex items-center gap-2 flex-wrap">
                                {connection.local && (
                                  <span className="whitespace-nowrap rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                                    Local
                                  </span>
                                )}
                                {connection.reachable === false && (
                                  <span className="whitespace-nowrap rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900 dark:text-red-200">
                                    {t("settings.unreachableConnection", {
                                      defaultValue: "Unreachable",
                                    })}
                                  </span>
                                )}
                                {connection.reachable === true && (
                                  <span className="whitespace-nowrap rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                                    {t("settings.reachableConnection", {
                                      defaultValue: "Reachable",
                                    })}
                                  </span>
                                )}
                                {connection.relay && (
                                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 whitespace-nowrap">
                                    Relay
                                  </span>
                                )}
                                {!connection.local && !connection.relay && (
                                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 whitespace-nowrap">
                                    Remote
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="mt-1 break-words text-xs text-muted-foreground">
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
                      className="text-sm font-medium text-primary hover:text-primary/80"
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

      <Dialog open={showRemoveModal} onOpenChange={setShowRemoveModal}>
        <DialogContent className="max-w-md">
          <DialogTitle>
            {t("settings.removePlexServerTitle", {
              defaultValue: "Remove Plex Server",
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {t("settings.removePlexServerMessage", {
              defaultValue:
                "Are you sure you want to remove the Plex server configuration? This will:\n\n• Clear the Plex server URL setting\n• Prevent importing new users from Plex\n• Prevent syncing for existing Plex users\n• Keep existing users and their sync history\n\nThis action cannot be undone.",
            })}
          </DialogDescription>
          {isAdmin && !authProviders?.jellyfinConfigured && (
            <div className="mb-4 rounded border-l-4 border-yellow-400 bg-yellow-50 p-3 dark:border-yellow-600 dark:bg-yellow-950">
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
              className="rounded-lg bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing || !canRemove}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {removing
                ? t("common.loading", { defaultValue: "Loading..." })
                : t("settings.removePlexServer", {
                    defaultValue: "Remove Server",
                  })}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
