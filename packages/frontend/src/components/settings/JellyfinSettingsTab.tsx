import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FaEye, FaEyeSlash, FaPlus, FaTrash } from "react-icons/fa";
import { CustomCheckbox } from "@components/ui/CustomCheckbox";
import {
  linkJellyfinAccount,
  removeJellyfinServer,
  getAuthProviders,
} from "@services/api";
import { useAuth } from "@contexts/AuthContext";
import { showSuccess, showError } from "@utils/toast";
import type { Settings } from "@services/api";

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
}

export function JellyfinSettingsTab({
  settings,
  onJellyfinSettingsChange,
  onSettingsUpdated,
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

  if (!showForm && !isConfigured) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg flex-shrink-0">
            <img src="/logos/jellyfin.svg" alt="Jellyfin" className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              {t("settings.jellyfinServer", {
                defaultValue: "Jellyfin Server",
              })}
            </h2>
            <p className="text-xs sm:text-sm dark:text-slate-400 text-gray-600">
              {t("settings.jellyfinServerDescription", {
                defaultValue:
                  "Configure your Jellyfin server connection settings.",
              })}
            </p>
          </div>
        </div>

        <div className="border dark:border-[#2d2d2d] border-gray-200 rounded-lg p-6 text-center">
          <p className="text-sm dark:text-slate-400 text-gray-600 mb-4">
            {t("settings.jellyfinNotConfigured", {
              defaultValue: "No Jellyfin server has been configured yet.",
            })}
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <FaPlus className="w-4 h-4" />
            {t("settings.addJellyfinServer", {
              defaultValue: "Add Jellyfin Server",
            })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="mb-4 sm:mb-6 relative">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg flex-shrink-0">
            <img src="/logos/jellyfin.svg" alt="Jellyfin" className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              {t("settings.jellyfinServer", {
                defaultValue: "Jellyfin Server",
              })}
            </h2>
            <p className="text-xs sm:text-sm dark:text-slate-400 text-gray-600">
              {t("settings.jellyfinServerDescription", {
                defaultValue:
                  "Configure your Jellyfin server connection settings.",
              })}
            </p>
          </div>
        </div>
        {isConfigured && (
          <div className="mt-3 sm:mt-0 sm:absolute sm:top-0 sm:right-0">
            <button
              type="button"
              onClick={() => setShowRemoveModal(true)}
              disabled={!canRemove}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1">
            {t("auth.jellyfin.serverHostname", {
              defaultValue: "Server Hostname",
            })}
          </label>
          <div className="flex rounded-md shadow-sm">
            <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 dark:border-[#2d2d2d] border-gray-300 dark:bg-[#2d2d2d] bg-gray-100 px-3 dark:text-slate-300 text-gray-700 sm:text-sm">
              {useSsl ? "https://" : "http://"}
            </span>
            <input
              type="text"
              value={hostname}
              onChange={(e) => handleHostnameChange(e.target.value)}
              placeholder={t("auth.jellyfin.hostnamePlaceholder", {
                defaultValue: "jellyfin.example.com",
              })}
              className="flex-1 rounded-r-md border border-gray-300 dark:border-[#2d2d2d] bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-slate-100 px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1">
              {t("auth.jellyfin.port", { defaultValue: "Port" })}
            </label>
            <input
              type="number"
              value={port}
              onChange={(e) =>
                handlePortChange(parseInt(e.target.value) || 8096)
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-[#2d2d2d] rounded-md bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-slate-100"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
              <CustomCheckbox
                checked={useSsl}
                onChange={() => handleSslChange(!useSsl)}
              />
              <span className="ml-2">
                {t("auth.jellyfin.useSsl", { defaultValue: "Use SSL" })}
              </span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1">
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
            className="w-full px-3 py-2 border border-gray-300 dark:border-[#2d2d2d] rounded-md bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-slate-100"
          />
        </div>

        {!apiKey && isAdmin && (
          <div className="bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-400 dark:border-blue-600 p-4 rounded">
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
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
                  className="px-3 py-2 border border-gray-300 dark:border-[#2d2d2d] rounded-md bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-slate-100"
                />
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={jellyfinPassword}
                    onChange={(e) => setJellyfinPassword(e.target.value)}
                    placeholder={t("auth.password", {
                      defaultValue: "Password",
                    })}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-[#2d2d2d] rounded-md bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 focus:outline-none"
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
                  if (!jellyfinUsername || !jellyfinPassword) {
                    showError(
                      t("users.jellyfinCredentialsRequired", {
                        defaultValue: "Username and password are required",
                      })
                    );
                    return;
                  }
                  if (!hostname) {
                    showError(
                      t("settings.jellyfinHostnameRequired", {
                        defaultValue: "Server hostname is required",
                      })
                    );
                    return;
                  }
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
                className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <label className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1">
            {t("settings.jellyfinApiKey", { defaultValue: "API Key" })}
          </label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-[#2d2d2d] rounded-md bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-slate-100 font-mono text-sm"
              placeholder={t("settings.noApiKey", {
                defaultValue: "No API key configured",
              })}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 focus:outline-none"
              aria-label={
                showApiKey
                  ? t("auth.hidePassword", { defaultValue: "Hide API key" })
                  : t("auth.showPassword", { defaultValue: "Show API key" })
              }
            >
              {showApiKey ? (
                <FaEyeSlash className="w-5 h-5" />
              ) : (
                <FaEye className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="mt-1 text-xs dark:text-slate-400 text-gray-500">
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
          <div className="bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-400 dark:border-blue-600 p-4 rounded">
            <p className="text-sm text-blue-700 dark:text-blue-300">
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
                {t("settings.removeJellyfinServerTitle", {
                  defaultValue: "Remove Jellyfin Server",
                })}
              </h3>
              <p className="text-sm dark:text-slate-400 text-gray-500 mb-6 whitespace-pre-line">
                {t("settings.removeJellyfinServerMessage", {
                  defaultValue:
                    "Are you sure you want to remove the Jellyfin server configuration? This will:\n\n• Clear all Jellyfin server settings\n• Prevent importing new users from Jellyfin\n• Prevent syncing for existing Jellyfin users\n• Keep existing users and their sync history\n\nThis action cannot be undone.",
                })}
              </p>
              {isAdmin && !authProviders?.plexConfigured && (
                <div className="bg-yellow-50 dark:bg-yellow-950 border-l-4 border-yellow-400 dark:border-yellow-600 p-3 rounded mb-4">
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
                    : t("settings.removeJellyfinServer", {
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
