import { CustomCheckbox } from "@components/ui/CustomCheckbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@components/ui/dialog";
import { useAuth } from "@contexts/AuthContext";
import {
  linkJellyfinAccount,
  removeJellyfinServer,
  getAuthProviders,
} from "@services/api";
import type { Settings } from "@services/api";
import { showSuccess, showError } from "@utils/toast";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FaEye, FaEyeSlash, FaPlus, FaTrash } from "react-icons/fa";

import { CollapsibleSettingsCard } from "./CollapsibleSettingsCard";
import { WebhookSetupPanel } from "./WebhookSetupPanel";

interface JellyfinSettingsTabProps {
  settings: Settings;
  onJellyfinSettingsChange: (settings: {
    hostname: string;
    port: number;
    useSsl: boolean;
    urlBase: string;
    apiKey: string;
  }) => void;
  onSettingsUpdated?: () => void;
  scroblarrApiKey?: string;
}

export function JellyfinSettingsTab({
  settings,
  onJellyfinSettingsChange,
  onSettingsUpdated,
  scroblarrApiKey,
}: JellyfinSettingsTabProps) {
  const { t } = useTranslation();
  const { checkAuth, isAdmin } = useAuth();
  const [jellyfinUsername, setJellyfinUsername] = useState("");
  const [jellyfinPassword, setJellyfinPassword] = useState("");
  const [linkingJellyfin, setLinkingJellyfin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authProviders, setAuthProviders] = useState<{
    hasAdmin: boolean;
    plexConfigured: boolean;
    jellyfinConfigured: boolean;
  } | null>(null);

  const parseHostname = (host: string | undefined): string => {
    if (!host) return "";
    return host
      .replace(/^https?:\/\//, "")
      .split(":")[0]
      .split("/")[0];
  };

  const parsePort = (
    host: string | undefined,
    portStr: string | undefined
  ): number => {
    if (portStr) return parseInt(portStr, 10);
    if (host) {
      const match = host.match(/:(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
    return 8096;
  };

  const [hostname, setHostname] = useState(
    parseHostname(settings.jellyfinHost)
  );
  const [port, setPort] = useState(
    parsePort(settings.jellyfinHost, settings.jellyfinPort)
  );
  const [useSsl, setUseSsl] = useState(settings.jellyfinUseSsl === "true");
  const [urlBase, setUrlBase] = useState(settings.jellyfinUrlBase || "");
  const [apiKey, setApiKey] = useState(settings.jellyfinApiKey || "");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removing, setRemoving] = useState(false);

  const isConfigured = !!(hostname && apiKey);
  const canRemove = !isAdmin || !!authProviders?.plexConfigured;

  useEffect(() => {
    const parsedHostname = parseHostname(settings.jellyfinHost);
    const parsedPort = parsePort(settings.jellyfinHost, settings.jellyfinPort);
    const parsedUseSsl = settings.jellyfinUseSsl === "true";
    const parsedUrlBase = settings.jellyfinUrlBase || "";
    const parsedApiKey = settings.jellyfinApiKey || "";

    setHostname(parsedHostname);
    setPort(parsedPort);
    setUseSsl(parsedUseSsl);
    setUrlBase(parsedUrlBase);
    setApiKey(parsedApiKey);

    if (parsedHostname && parsedApiKey) {
      setShowForm(true);
    }
  }, [
    settings.jellyfinHost,
    settings.jellyfinPort,
    settings.jellyfinUseSsl,
    settings.jellyfinUrlBase,
    settings.jellyfinApiKey,
  ]);

  useEffect(() => {
    if (showForm) {
      onJellyfinSettingsChange({ hostname, port, useSsl, urlBase, apiKey });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostname, port, useSsl, urlBase, apiKey, showForm]);

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

  function handleHostnameChange(value: string) {
    setHostname(value);
  }

  function handlePortChange(value: number) {
    setPort(value);
  }

  function handleSslChange(checked: boolean) {
    setUseSsl(checked);
    const newPort = checked ? 443 : 8096;
    setPort(newPort);
  }

  function handleUrlBaseChange(value: string) {
    setUrlBase(value);
  }

  function buildBaseUrl(): string {
    const protocol = useSsl ? "https" : "http";
    const basePath = urlBase ? urlBase.replace(/^\/+|\/+$/g, "") : "";
    return `${protocol}://${hostname}:${port}${basePath ? `/${basePath}` : ""}`;
  }

  async function handleRemove() {
    try {
      setRemoving(true);
      await removeJellyfinServer();
      setShowForm(false);
      setHostname("");
      setPort(8096);
      setUseSsl(false);
      setUrlBase("");
      setApiKey("");
      setShowRemoveModal(false);
      showSuccess(
        t("settings.jellyfinServerRemoved", {
          defaultValue: "Jellyfin server removed successfully",
        })
      );
      if (onSettingsUpdated) {
        onSettingsUpdated();
      }
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : t("settings.removeJellyfinServerFailed", {
              defaultValue: "Failed to remove Jellyfin server",
            })
      );
    } finally {
      setRemoving(false);
    }
  }

  const title = t("settings.jellyfinServer", {
    defaultValue: "Jellyfin Server",
  });
  const description = t("settings.jellyfinServerDescription", {
    defaultValue: "Configure your Jellyfin server connection settings.",
  });
  const icon = <img src="/logos/jellyfin.svg" alt="" className="w-5 h-5" />;
  const showEmptyState = !showForm && !isConfigured;

  return (
    <>
      <CollapsibleSettingsCard
        title={title}
        description={description}
        icon={icon}
      >
        {showEmptyState ? (
          <div className="rounded-lg border border-border bg-muted/30 p-6 text-center">
            <p className="mb-4 text-sm text-muted-foreground">
              {t("settings.jellyfinNotConfigured", {
                defaultValue: "No Jellyfin server has been configured yet.",
              })}
            </p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <FaPlus className="w-4 h-4" />
              {t("settings.addJellyfinServer", {
                defaultValue: "Add Jellyfin Server",
              })}
            </button>
          </div>
        ) : (
          <>
            {isConfigured && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRemoveModal(true)}
                  disabled={!canRemove}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                  title={
                    !canRemove
                      ? t("settings.cannotRemoveOnlyServer", {
                          service: "Plex",
                          defaultValue:
                            "Cannot remove the only configured server. Configure Plex first.",
                        })
                      : undefined
                  }
                >
                  <FaTrash className="w-4 h-4" />
                  {t("settings.removeJellyfinServer", {
                    defaultValue: "Remove Server",
                  })}
                </button>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  {t("auth.jellyfin.serverHostname", {
                    defaultValue: "Server Hostname",
                  })}
                </label>
                <div className="flex rounded-md shadow-sm">
                  <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                    {useSsl ? "https://" : "http://"}
                  </span>
                  <input
                    type="text"
                    value={hostname}
                    onChange={(e) => handleHostnameChange(e.target.value)}
                    placeholder={t("auth.jellyfin.hostnamePlaceholder", {
                      defaultValue: "jellyfin.example.com",
                    })}
                    className="flex-1 rounded-r-md border border-input bg-background px-3 py-2 text-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    {t("auth.jellyfin.port", { defaultValue: "Port" })}
                  </label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) =>
                      handlePortChange(parseInt(e.target.value) || 8096)
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex cursor-pointer items-center text-sm text-foreground">
                    <CustomCheckbox
                      checked={useSsl}
                      onChange={() => handleSslChange(!useSsl)}
                      ariaLabel={t("auth.jellyfin.useSsl", {
                        defaultValue: "Use SSL",
                      })}
                    />
                    <span className="ml-2">
                      {t("auth.jellyfin.useSsl", { defaultValue: "Use SSL" })}
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  {t("auth.jellyfin.urlBase", {
                    defaultValue: "URL Base (optional)",
                  })}
                </label>
                <input
                  type="text"
                  value={urlBase}
                  onChange={(e) => handleUrlBaseChange(e.target.value)}
                  placeholder={t("auth.jellyfin.urlBasePlaceholder", {
                    defaultValue: "/jellyfin",
                  })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </div>

              {!apiKey && isAdmin && (
                <div className="rounded border-l-4 border-primary bg-primary/5 p-4">
                  <p className="mb-3 text-sm text-primary">
                    {t("settings.jellyfinLoginRequired", {
                      defaultValue:
                        "Login with your Jellyfin credentials to automatically generate an API key.",
                    })}
                  </p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={jellyfinUsername}
                        onChange={(e) => setJellyfinUsername(e.target.value)}
                        placeholder={t("auth.jellyfin.username", {
                          defaultValue: "Username",
                        })}
                        className="rounded-md border border-input bg-background px-3 py-2 text-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                      />
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={jellyfinPassword}
                          onChange={(e) => setJellyfinPassword(e.target.value)}
                          placeholder={t("auth.password", {
                            defaultValue: "Password",
                          })}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                          aria-label={
                            showPassword
                              ? t("auth.hidePassword", {
                                  defaultValue: "Hide password",
                                })
                              : t("auth.showPassword", {
                                  defaultValue: "Show password",
                                })
                          }
                        >
                          {showPassword ? (
                            <FaEyeSlash className="w-5 h-5" />
                          ) : (
                            <FaEye className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setLinkingJellyfin(true);
                          await linkJellyfinAccount(
                            jellyfinUsername,
                            jellyfinPassword,
                            hostname,
                            port,
                            useSsl,
                            urlBase
                          );
                          setJellyfinPassword("");
                          setJellyfinUsername("");
                          showSuccess(
                            t("settings.jellyfinApiKeyGenerated", {
                              defaultValue: "API key generated successfully!",
                            })
                          );
                          await checkAuth();
                          if (onSettingsUpdated) {
                            onSettingsUpdated();
                          }
                        } catch (err) {
                          showError(
                            err instanceof Error
                              ? err.message
                              : t("auth.loginFailed", {
                                  defaultValue: "Failed to login",
                                })
                          );
                        } finally {
                          setLinkingJellyfin(false);
                        }
                      }}
                      disabled={
                        linkingJellyfin ||
                        !jellyfinUsername ||
                        !jellyfinPassword ||
                        !hostname
                      }
                      className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {linkingJellyfin
                        ? t("common.loading", { defaultValue: "Loading..." })
                        : t("settings.jellyfinLoginAndGenerateKey", {
                            defaultValue: "Login & Generate API Key",
                          })}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  {t("settings.jellyfinApiKey", { defaultValue: "API Key" })}
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 font-mono text-sm text-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                    placeholder={t("settings.noApiKey", {
                      defaultValue: "No API key configured",
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label={
                      showApiKey
                        ? t("auth.hidePassword", {
                            defaultValue: "Hide API key",
                          })
                        : t("auth.showPassword", {
                            defaultValue: "Show API key",
                          })
                    }
                  >
                    {showApiKey ? (
                      <FaEyeSlash className="w-5 h-5" />
                    ) : (
                      <FaEye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {apiKey
                    ? t("settings.jellyfinApiKeyDescription", {
                        defaultValue:
                          "API key is automatically generated during setup. You can manually update it here if needed.",
                      })
                    : t("settings.jellyfinApiKeyDescriptionNoKey", {
                        defaultValue:
                          "Login with your Jellyfin credentials above to automatically generate an API key, or enter one manually.",
                      })}
                </p>
              </div>

              {hostname && port && (
                <div className="rounded border-l-4 border-primary bg-primary/5 p-4">
                  <p className="text-sm text-primary">
                    <strong>
                      {t("settings.currentConnection", {
                        defaultValue: "Current Connection",
                      })}
                      :
                    </strong>{" "}
                    {buildBaseUrl()}
                  </p>
                </div>
              )}

              {!!(settings.jellyfinHost && settings.jellyfinApiKey) && (
                <WebhookSetupPanel source="jellyfin" apiKey={scroblarrApiKey} />
              )}
            </div>
          </>
        )}
      </CollapsibleSettingsCard>

      <Dialog open={showRemoveModal} onOpenChange={setShowRemoveModal}>
        <DialogContent className="max-w-md">
          <DialogTitle>
            {t("settings.removeJellyfinServerTitle", {
              defaultValue: "Remove Jellyfin Server",
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {t("settings.removeJellyfinServerMessage", {
              defaultValue:
                "Are you sure you want to remove the Jellyfin server configuration? This will:\n\n• Clear all Jellyfin server settings\n• Prevent importing new users from Jellyfin\n• Prevent syncing for existing Jellyfin users\n• Keep existing users and their sync history\n\nThis action cannot be undone.",
            })}
          </DialogDescription>
          {isAdmin && !authProviders?.plexConfigured && (
            <div className="mb-4 rounded border-l-4 border-yellow-400 bg-yellow-50 p-3 dark:border-yellow-600 dark:bg-yellow-950">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                {t("settings.removeServerAdminWarning", {
                  defaultValue:
                    "As an admin, you must have at least one server configured. If you remove Jellyfin and only Jellyfin is configured, you may lose access. Please ensure Plex is configured first.",
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
                : t("settings.removeJellyfinServer", {
                    defaultValue: "Remove Server",
                  })}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
