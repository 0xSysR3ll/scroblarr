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
  mediaBrowserType?: "jellyfin" | "emby";
  formOpen?: boolean;
  onFormOpenChange?: (open: boolean) => void;
  onJellyfinSettingsChange: (settings: {
    hostname: string;
    port: number;
    useSsl: boolean;
    urlBase: string;
    apiKey: string;
    mediaBrowserType: "jellyfin" | "emby";
  }) => void;
  onSettingsUpdated?: () => void;
  webhookApiKey?: string;
}

export function JellyfinSettingsTab({
  settings,
  mediaBrowserType = "jellyfin",
  formOpen,
  onFormOpenChange,
  onJellyfinSettingsChange,
  onSettingsUpdated,
  webhookApiKey,
}: JellyfinSettingsTabProps) {
  const { t } = useTranslation();
  const { checkAuth, isAdmin } = useAuth();
  const isEmby = mediaBrowserType === "emby";
  const brandName = isEmby ? "Emby" : "Jellyfin";
  const brandLogo = isEmby ? "/logos/emby.svg" : "/logos/jellyfin.svg";
  const [jellyfinUsername, setJellyfinUsername] = useState("");
  const [jellyfinPassword, setJellyfinPassword] = useState("");
  const [linkingJellyfin, setLinkingJellyfin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authProviders, setAuthProviders] = useState<{
    hasAdmin: boolean;
    plexConfigured: boolean;
    jellyfinConfigured: boolean;
    embyConfigured?: boolean;
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
      onFormOpenChange?.(true);
    }
  }, [
    settings.jellyfinHost,
    settings.jellyfinPort,
    settings.jellyfinUseSsl,
    settings.jellyfinUrlBase,
    settings.jellyfinApiKey,
  ]);

  useEffect(() => {
    if (formOpen !== false) {
      return;
    }
    if (hostname && apiKey) {
      return;
    }
    setShowForm(false);
  }, [formOpen, hostname, apiKey]);

  useEffect(() => {
    if (showForm) {
      onJellyfinSettingsChange({
        hostname,
        port,
        useSsl,
        urlBase,
        apiKey,
        mediaBrowserType,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostname, port, useSsl, urlBase, apiKey, showForm, mediaBrowserType]);

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
        isEmby
          ? t("settings.embyServerRemoved", {
              defaultValue: "Emby server removed successfully",
            })
          : t("settings.jellyfinServerRemoved", {
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

  const title = isEmby
    ? t("settings.embyServer", { defaultValue: "Emby Server" })
    : t("settings.jellyfinServer", { defaultValue: "Jellyfin Server" });
  const description = isEmby
    ? t("settings.embyServerDescription", {
        defaultValue:
          "Configure your Emby server connection for importing users and poster lookups.",
      })
    : t("settings.jellyfinServerDescription", {
        defaultValue:
          "Configure your Jellyfin server connection for importing users and poster lookups.",
      });
  const icon = <img src={brandLogo} alt="" className="w-5 h-5" />;
  const showEmptyState = !showForm && !isConfigured;

  return (
    <>
      <CollapsibleSettingsCard
        title={title}
        description={description}
        icon={icon}
      >
        {showEmptyState ? (
          <div className="surface-tile p-6 text-center">
            <p className="mb-4 text-sm text-muted-foreground">
              {isEmby
                ? t("settings.embyNotConfigured", {
                    defaultValue: "Emby is not configured yet.",
                  })
                : t("settings.jellyfinNotConfigured", {
                    defaultValue: "Jellyfin is not configured yet.",
                  })}
            </p>
            <button
              type="button"
              onClick={() => {
                onFormOpenChange?.(true);
                setShowForm(true);
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <FaPlus className="w-4 h-4" />
              {isEmby
                ? t("settings.addEmbyServer", {
                    defaultValue: "Add Emby Server",
                  })
                : t("settings.addJellyfinServer", {
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
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-destructive hover:text-destructive/80 disabled:cursor-not-allowed disabled:opacity-50"
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
                <label
                  htmlFor={`${isEmby ? "emby" : "jellyfin"}-hostname`}
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  {t(
                    isEmby
                      ? "auth.emby.serverHostname"
                      : "auth.jellyfin.serverHostname",
                    {
                      defaultValue: "Server Hostname",
                    }
                  )}
                </label>
                <div className="flex rounded-md shadow-sm">
                  <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                    {useSsl ? "https://" : "http://"}
                  </span>
                  <input
                    id={`${isEmby ? "emby" : "jellyfin"}-hostname`}
                    type="text"
                    value={hostname}
                    onChange={(e) => handleHostnameChange(e.target.value)}
                    placeholder={t(
                      isEmby
                        ? "auth.emby.hostnamePlaceholder"
                        : "auth.jellyfin.hostnamePlaceholder",
                      {
                        defaultValue: isEmby
                          ? "emby.example.com"
                          : "jellyfin.example.com",
                      }
                    )}
                    className="flex-1 rounded-r-md border border-input bg-background px-3 py-2 text-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor={`${isEmby ? "emby" : "jellyfin"}-port`}
                    className="mb-1 block text-sm font-medium text-foreground"
                  >
                    {isEmby
                      ? t("auth.emby.port", { defaultValue: "Port" })
                      : t("auth.jellyfin.port", { defaultValue: "Port" })}
                  </label>
                  <input
                    id={`${isEmby ? "emby" : "jellyfin"}-port`}
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
                      ariaLabel={t(
                        isEmby ? "auth.emby.useSsl" : "auth.jellyfin.useSsl",
                        {
                          defaultValue: "Use SSL",
                        }
                      )}
                    />
                    <span className="ml-2">
                      {t(isEmby ? "auth.emby.useSsl" : "auth.jellyfin.useSsl", {
                        defaultValue: "Use SSL",
                      })}
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label
                  htmlFor={`${isEmby ? "emby" : "jellyfin"}-url-base`}
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  {t(isEmby ? "auth.emby.urlBase" : "auth.jellyfin.urlBase", {
                    defaultValue: "URL Base (optional)",
                  })}
                </label>
                <input
                  id={`${isEmby ? "emby" : "jellyfin"}-url-base`}
                  type="text"
                  value={urlBase}
                  onChange={(e) => handleUrlBaseChange(e.target.value)}
                  placeholder={t(
                    isEmby
                      ? "auth.emby.urlBasePlaceholder"
                      : "auth.jellyfin.urlBasePlaceholder",
                    {
                      defaultValue: isEmby ? "/emby" : "/jellyfin",
                    }
                  )}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </div>

              {!apiKey && isAdmin && (
                <div className="rounded border-l-4 border-primary bg-primary/5 p-4">
                  <p className="mb-3 text-sm text-primary">
                    {isEmby
                      ? t("settings.embyLoginRequired", {
                          defaultValue:
                            "Login with your Emby credentials to automatically generate an API key. If key creation fails, paste one from Emby Dashboard → Advanced → Security.",
                        })
                      : t("settings.jellyfinLoginRequired", {
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
                        placeholder={
                          isEmby
                            ? t("auth.emby.username", {
                                defaultValue: "Username",
                              })
                            : t("auth.jellyfin.username", {
                                defaultValue: "Username",
                              })
                        }
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
                          className="w-full rounded-md border border-input bg-background px-3 py-2 pr-12 text-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-1 top-1/2 inline-flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
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
                            urlBase,
                            mediaBrowserType
                          );
                          setJellyfinPassword("");
                          setJellyfinUsername("");
                          showSuccess(
                            isEmby
                              ? t("settings.embyApiKeyGenerated", {
                                  defaultValue:
                                    "API key generated successfully!",
                                })
                              : t("settings.jellyfinApiKeyGenerated", {
                                  defaultValue:
                                    "API key generated successfully!",
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
                      className="cursor-pointer rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {linkingJellyfin
                        ? t("common.loading", { defaultValue: "Loading..." })
                        : isEmby
                          ? t("settings.embyLoginAndGenerateKey", {
                              defaultValue: "Login & Generate API Key",
                            })
                          : t("settings.jellyfinLoginAndGenerateKey", {
                              defaultValue: "Login & Generate API Key",
                            })}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="jellyfin-api-key"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  {isEmby
                    ? t("settings.embyApiKey", { defaultValue: "API Key" })
                    : t("settings.jellyfinApiKey", { defaultValue: "API Key" })}
                </label>
                <div className="relative">
                  <input
                    id="jellyfin-api-key"
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 pr-12 font-mono text-sm text-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                    placeholder={t("settings.noApiKey", {
                      defaultValue: "No API key configured",
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-1 top-1/2 inline-flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                    aria-label={
                      showApiKey
                        ? t("settings.hideApiKey", {
                            defaultValue: "Hide API key",
                          })
                        : t("settings.showApiKey", {
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
                    ? isEmby
                      ? t("settings.embyApiKeyDescription", {
                          defaultValue:
                            "API key is automatically generated during setup when possible. You can paste one from Emby Dashboard → Advanced → Security if needed.",
                        })
                      : t("settings.jellyfinApiKeyDescription", {
                          defaultValue:
                            "API key is automatically generated during setup. You can manually update it here if needed.",
                        })
                    : isEmby
                      ? t("settings.embyApiKeyDescriptionNoKey", {
                          defaultValue:
                            "Login with your Emby credentials above to generate an API key, or paste one from Emby Dashboard → Advanced → Security.",
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
                <WebhookSetupPanel
                  source={isEmby ? "emby" : "jellyfin"}
                  webhookApiKey={webhookApiKey}
                />
              )}
            </div>
          </>
        )}
      </CollapsibleSettingsCard>

      <Dialog open={showRemoveModal} onOpenChange={setShowRemoveModal}>
        <DialogContent className="max-w-md">
          <DialogTitle>
            {t(
              isEmby
                ? "settings.removeEmbyServerTitle"
                : "settings.removeJellyfinServerTitle",
              {
                defaultValue: `Remove ${brandName} Server`,
              }
            )}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {t(
              isEmby
                ? "settings.removeEmbyServerMessage"
                : "settings.removeJellyfinServerMessage",
              {
                defaultValue: `Are you sure you want to remove the ${brandName} server configuration? This will:\n\n• Clear all ${brandName} server settings\n• Prevent importing new users from ${brandName}\n• Prevent syncing for existing ${brandName} users\n• Keep existing users and their sync history\n\nThis action cannot be undone.`,
              }
            )}
          </DialogDescription>
          {isAdmin && !authProviders?.plexConfigured && (
            <div className="mb-4 rounded border-l-4 border-warning-400 bg-warning-50 p-3 dark:border-warning-600 dark:bg-warning-950">
              <p className="text-sm text-warning-700 dark:text-warning-300">
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
