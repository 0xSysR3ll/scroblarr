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
import { useState, useEffect, useId } from "react";
import { useTranslation } from "react-i18next";
import {
  FaTrash,
  FaCheck,
  FaExclamationCircle,
  FaSyncAlt,
} from "react-icons/fa";

import { CollapsibleSettingsCard } from "./CollapsibleSettingsCard";
import { WebhookSetupPanel } from "./WebhookSetupPanel";

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
  webhookApiKey?: string;
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
  webhookApiKey,
}: PlexSettingsTabProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualServerUrl, setManualServerUrl] = useState(selectedServerUrl);
  const connectionGroupLabelId = useId();
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

  const title = t("settings.plexServer", { defaultValue: "Plex Server" });
  const description = t("settings.plexServerDescription", {
    defaultValue:
      "Select the Plex server connection to use for importing users. Click 'Save' to apply your selection.",
  });
  const icon = <img src="/logos/plex.svg" alt="" className="w-5 h-5" />;

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
      <CollapsibleSettingsCard
        title={title}
        description={description}
        icon={icon}
      >
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
              className="mt-1 cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            >
              {plexAuthLoading
                ? t("common.loading", { defaultValue: "Loading..." })
                : t("auth.plexAuth", {
                    defaultValue: "Authenticate with Plex",
                  })}
            </button>
          </div>
          {plexLinkError && (
            <p className="text-xs text-destructive">{plexLinkError}</p>
          )}
        </div>
      </CollapsibleSettingsCard>
    );
  }

  return (
    <>
      <CollapsibleSettingsCard
        title={title}
        description={description}
        icon={icon}
        headerMeta={
          hasUnsavedChanges ? (
            <span className="inline-flex items-center gap-1 rounded bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-800 dark:bg-warning-900 dark:text-warning-200">
              <FaExclamationCircle className="w-3 h-3" />
              {t("settings.unsavedChanges", { defaultValue: "Unsaved" })}
            </span>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefreshPlexServers}
            disabled={plexRefreshLoading}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-destructive hover:text-destructive/80 disabled:cursor-not-allowed disabled:opacity-50"
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

        <div className="space-y-4">
          <div className="surface-tile p-3 sm:p-4">
            <label
              htmlFor="plex-manual-connection-url"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              {t("settings.manualConnectionUrl", {
                defaultValue: "Manual Connection URL",
              })}
            </label>
            <div>
              <input
                id="plex-manual-connection-url"
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
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 md:text-sm"
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
                className="surface-tile p-3 sm:p-4"
              >
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
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
                      className="inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 hover:text-primary/80"
                    >
                      {t("settings.changeConnection", {
                        defaultValue: "Change",
                      })}
                    </button>
                  )}
                  {isEditing && (
                    <button
                      onClick={onCancelEdit}
                      className="inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {t("common.cancel", { defaultValue: "Cancel" })}
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {connectionsToShow.length > 0 && (
                    <>
                      <p
                        id={connectionGroupLabelId}
                        className="mb-2 block text-sm font-medium text-foreground"
                      >
                        {isEditing
                          ? t("settings.selectConnection", {
                              defaultValue: "Select Connection",
                            })
                          : t("settings.currentConnection", {
                              defaultValue: "Current Connection",
                            })}
                      </p>
                      <div
                        role="radiogroup"
                        aria-labelledby={connectionGroupLabelId}
                        className="space-y-2"
                      >
                        {connectionsToShow.map((connection) => (
                          <label
                            key={connection.uri}
                            className={`flex cursor-pointer items-start rounded-lg border p-2.5 transition-colors sm:items-center sm:p-3 ${
                              selectedServerUrl === connection.uri
                                ? "border-primary bg-primary/10"
                                : "border-border/50 bg-background/50 hover:border-muted-foreground/40"
                            }`}
                          >
                            <div className="mr-3 mt-0.5 shrink-0 sm:mt-0">
                              <CustomRadio
                                name={`server-${server.machineIdentifier}`}
                                value={connection.uri}
                                checked={selectedServerUrl === connection.uri}
                                onChange={() =>
                                  onSelectedServerUrlChange(connection.uri)
                                }
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center">
                                <span className="break-all font-medium text-foreground sm:break-words">
                                  {connection.uri}
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                  {connection.local && (
                                    <span className="whitespace-nowrap rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                                      Local
                                    </span>
                                  )}
                                  {connection.reachable === false && (
                                    <span className="whitespace-nowrap rounded bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
                                      {t("settings.unreachableConnection", {
                                        defaultValue: "Unreachable",
                                      })}
                                    </span>
                                  )}
                                  {connection.reachable === true && (
                                    <span className="whitespace-nowrap rounded bg-success-100 px-2 py-0.5 text-xs font-semibold text-success-800 dark:bg-success-900 dark:text-success-200">
                                      {t("settings.reachableConnection", {
                                        defaultValue: "Reachable",
                                      })}
                                    </span>
                                  )}
                                  {connection.relay && (
                                    <span className="whitespace-nowrap rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                                      Relay
                                    </span>
                                  )}
                                  {!connection.local && !connection.relay && (
                                    <span className="whitespace-nowrap rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
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
                    <div className="rounded border-l-4 border-warning-400 bg-warning-50 p-4 dark:border-warning-600 dark:bg-warning-950">
                      <p className="mb-2 text-sm text-warning-700 dark:text-warning-300">
                        {t("settings.noConnectionSelected", {
                          defaultValue:
                            "No connection selected for this server.",
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

        {!!savedServerUrl && (
          <div className="space-y-4">
            <WebhookSetupPanel source="plex" webhookApiKey={webhookApiKey} />
            <WebhookSetupPanel
              source="tautulli"
              webhookApiKey={webhookApiKey}
            />
          </div>
        )}
      </CollapsibleSettingsCard>

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
            <div className="mb-4 rounded border-l-4 border-warning-400 bg-warning-50 p-3 dark:border-warning-600 dark:bg-warning-950">
              <p className="text-sm text-warning-700 dark:text-warning-300">
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
              className="cursor-pointer rounded-lg bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing || !canRemove}
              className="cursor-pointer rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
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
    </>
  );
}
