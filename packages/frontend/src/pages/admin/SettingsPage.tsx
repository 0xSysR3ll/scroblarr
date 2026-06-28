import { AboutSettingsTab } from "@components/settings/AboutSettingsTab";
import { GeneralSettingsTab } from "@components/settings/GeneralSettingsTab";
import { LogsTab } from "@components/settings/LogsTab";
import { MediaServerSettingsTab } from "@components/settings/MediaServerSettingsTab";
import { Spinner } from "@components/ui/spinner";
import { useAuth } from "@contexts/AuthContext";
import { usePlexLogin } from "@hooks/auth/usePlexLogin";
import { useTabNavigation } from "@hooks/useTabNavigation";
import {
  getSettings,
  updateSettings,
  getPlexServers,
  type PlexServer,
  type Settings,
  linkPlexAccount,
} from "@services/api";
import { getAppVersion, type AppVersionInfo } from "@services/api/meta";
import { showSuccess, showError } from "@utils/toast";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  FaCog,
  FaFileAlt,
  FaServer,
  FaCheckCircle,
  FaInfoCircle,
} from "react-icons/fa";

type SettingsTab = "general" | "mediaServer" | "logs" | "about";

const SETTINGS_TABS = ["general", "mediaServer", "logs", "about"] as const;

export function SettingsPage() {
  const { t } = useTranslation();
  const { user, isAdmin, checkAuth } = useAuth();

  const { activeTab, changeTab } = useTabNavigation<SettingsTab>({
    validTabs: SETTINGS_TABS,
    basePath: "/settings",
    defaultTab: "general",
  });
  const [settings, setSettings] = useState<Settings>({});
  const [servers, setServers] = useState<PlexServer[]>([]);
  const [selectedServerUrl, setSelectedServerUrl] = useState("");
  const [editingServer, setEditingServer] = useState<string | null>(null);
  const [syncHistoryLimit, setSyncHistoryLimit] = useState<number>(100);
  const [apiKey, setApiKey] = useState<string>("");
  const [tmdbAccessToken, setTmdbAccessToken] = useState<string>("");
  const [jellyfinSettings, setJellyfinSettings] = useState<{
    hostname: string;
    port: number;
    useSsl: boolean;
    urlBase: string;
    apiKey: string;
  }>({
    hostname: "",
    port: 8096,
    useSsl: false,
    urlBase: "",
    apiKey: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingPlexServers, setRefreshingPlexServers] = useState(false);
  const [plexLinkError, setPlexLinkError] = useState<string | null>(null);
  const [linkingPlex, setLinkingPlex] = useState(false);
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(null);

  const fetchAndSetPlexServers = useCallback(
    async (
      configuredServerUrl?: string,
      shouldApplyResult: () => boolean = () => true
    ) => {
      try {
        const serversData = await getPlexServers();
        if (!shouldApplyResult()) {
          return;
        }

        setServers(serversData);

        if (configuredServerUrl) {
          // Keep custom/manual URLs even if they are not in discovered connections.
          setSelectedServerUrl(configuredServerUrl);
        } else if (
          serversData.length > 0 &&
          serversData[0].connections.length > 0
        ) {
          setSelectedServerUrl(serversData[0].url);
        }
      } catch {
        // Silently fail if Plex servers can't be fetched
      }
    },
    []
  );

  const { loading: plexLoading, login: plexLogin } = usePlexLogin({
    onAuthToken: async ({ authToken, clientIdentifier }) => {
      try {
        setPlexLinkError(null);
        setLinkingPlex(true);
        await linkPlexAccount(authToken, clientIdentifier);
        localStorage.setItem("plexAccessToken", authToken);
        localStorage.setItem("authSource", "plex");
        await checkAuth();

        try {
          const serversData = await getPlexServers();
          setServers(serversData);
          if (serversData.length > 0 && serversData[0].connections.length > 0) {
            const firstServerUrl = serversData[0].url;
            setSelectedServerUrl(firstServerUrl);
            const currentSettings = await getSettings();
            if (!currentSettings.plexServerUrl) {
              await updateSettings({
                plexServerUrl: firstServerUrl,
                ...(serversData[0].machineIdentifier
                  ? {
                      plexServerMachineIdentifier:
                        serversData[0].machineIdentifier,
                    }
                  : {}),
              });
              setSettings({
                ...currentSettings,
                plexServerUrl: firstServerUrl,
                ...(serversData[0].machineIdentifier
                  ? {
                      plexServerMachineIdentifier:
                        serversData[0].machineIdentifier,
                    }
                  : {}),
              });
            }
          }
        } catch {
          // If servers can't be fetched, leave it to the UI message
        }
      } catch (err) {
        setPlexLinkError(
          err instanceof Error
            ? err.message
            : t("auth.loginFailed", { defaultValue: "Failed to login" })
        );
      } finally {
        setLinkingPlex(false);
      }
    },
    onError: (message: string) => {
      setPlexLinkError(message);
    },
  });

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        const settingsData = await getSettings();

        if (!isMounted) {
          return;
        }

        setSettings(settingsData);

        if (settingsData.syncHistoryLimit) {
          setSyncHistoryLimit(parseInt(settingsData.syncHistoryLimit, 10));
        }

        if (settingsData.apiKey) {
          setApiKey(settingsData.apiKey);
        }

        if (settingsData.tmdbAccessToken) {
          setTmdbAccessToken(settingsData.tmdbAccessToken);
        }

        if (settingsData.jellyfinHost) {
          const hostname = settingsData.jellyfinHost
            .replace(/^https?:\/\//, "")
            .split(":")[0]
            .split("/")[0];
          const portMatch = settingsData.jellyfinHost.match(/:(\d+)/);
          const port = portMatch
            ? parseInt(portMatch[1], 10)
            : settingsData.jellyfinPort
              ? parseInt(settingsData.jellyfinPort, 10)
              : 8096;
          setJellyfinSettings({
            hostname,
            port,
            useSsl: settingsData.jellyfinUseSsl === "true",
            urlBase: settingsData.jellyfinUrlBase || "",
            apiKey: settingsData.jellyfinApiKey || "",
          });
        }

        if (settingsData.plexServerUrl && user?.plexUsername) {
          setSelectedServerUrl(settingsData.plexServerUrl);
          void fetchAndSetPlexServers(
            settingsData.plexServerUrl,
            () => isMounted
          );
        } else {
          setServers([]);
          setSelectedServerUrl("");
        }

        void getAppVersion()
          .then((version) => {
            if (isMounted) {
              setVersionInfo(version);
            }
          })
          .catch(() => {
            if (isMounted) {
              setVersionInfo(null);
            }
          });
      } catch (err) {
        showError(
          err instanceof Error ? err.message : "Failed to load settings"
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    if (isAdmin) {
      loadData();
    }

    return () => {
      isMounted = false;
    };
  }, [isAdmin, user?.plexUsername, fetchAndSetPlexServers]);

  async function handleSave() {
    try {
      setSaving(true);

      const updated: Record<string, string | number | boolean> = {
        syncHistoryLimit: syncHistoryLimit,
      };

      if (activeTab === "general") {
        if (apiKey) {
          updated.apiKey = apiKey;
        }
        if (tmdbAccessToken) {
          updated.tmdbAccessToken = tmdbAccessToken;
        } else if (settings.tmdbAccessToken) {
          updated.tmdbAccessToken = "";
        }
      }

      if (activeTab === "mediaServer") {
        if (selectedServerUrl) {
          updated.plexServerUrl = selectedServerUrl;
          const srv = servers.find((s) =>
            s.connections.some((c) => c.uri === selectedServerUrl)
          );
          if (srv?.machineIdentifier) {
            updated.plexServerMachineIdentifier = srv.machineIdentifier;
          }
        }
        if (jellyfinSettings.hostname && jellyfinSettings.apiKey) {
          const protocol = jellyfinSettings.useSsl ? "https" : "http";
          const basePath = jellyfinSettings.urlBase
            ? jellyfinSettings.urlBase.replace(/^\/+|\/+$/g, "")
            : "";
          updated.jellyfinHost = `${protocol}://${jellyfinSettings.hostname}:${jellyfinSettings.port}${basePath ? `/${basePath}` : ""}`;
          updated.jellyfinPort = jellyfinSettings.port;
          updated.jellyfinUseSsl = jellyfinSettings.useSsl;
          updated.jellyfinUrlBase = jellyfinSettings.urlBase;
          updated.jellyfinApiKey = jellyfinSettings.apiKey;
        }
      }

      const finalUpdated = await updateSettings(updated);
      setSettings(finalUpdated);
      setEditingServer(null);
      showSuccess(
        t("settings.saved", {
          defaultValue: "Settings saved successfully!",
        })
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleRefreshPlexServers() {
    try {
      setRefreshingPlexServers(true);
      await fetchAndSetPlexServers(selectedServerUrl || settings.plexServerUrl);
      showSuccess(
        t("settings.plexServersRefreshed", {
          defaultValue: "Plex servers refreshed",
        })
      );
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : t("settings.refreshPlexServersFailed", {
              defaultValue: "Failed to refresh Plex servers",
            })
      );
    } finally {
      setRefreshingPlexServers(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 dark:bg-red-950 border-l-4 border-red-400 dark:border-red-600 p-4 rounded">
          <p className="text-sm text-red-700 dark:text-red-300">
            {t("settings.accessDenied", {
              defaultValue: "Access denied. Admin privileges required.",
            })}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <Spinner size="xl" />
          <span className="ml-3 text-muted-foreground">
            {t("common.loading", { defaultValue: "Loading..." })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8">
      <h1 className="mb-4 text-2xl font-bold text-foreground sm:mb-6 sm:text-3xl">
        {t("settings.title", { defaultValue: "Settings" })}
      </h1>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card text-card-foreground shadow-lg">
        {/* Tabs */}
        <div className="overflow-x-auto overflow-y-hidden border-b border-border [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden">
          <nav className="-mb-px flex flex-nowrap" aria-label="Tabs">
            <button
              type="button"
              onClick={() => changeTab("general")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === "general"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FaCog className="w-4 h-4" />
              <span className="hidden sm:inline">
                {t("settings.tabs.general", { defaultValue: "General" })}
              </span>
              <span className="sm:hidden">General</span>
            </button>
            <button
              type="button"
              onClick={() => changeTab("mediaServer")}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === "mediaServer"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FaServer className="w-4 h-4" />
              <span className="hidden sm:inline">
                {t("settings.tabs.mediaServer", {
                  defaultValue: "Media Server",
                })}
              </span>
              <span className="sm:hidden">
                {t("settings.tabs.mediaServer", {
                  defaultValue: "Media Server",
                })}
              </span>
            </button>
            <button
              type="button"
              onClick={() => changeTab("logs")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === "logs"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FaFileAlt className="w-4 h-4" />
              <span className="hidden sm:inline">
                {t("logs.title", { defaultValue: "Logs" })}
              </span>
              <span className="sm:hidden">Logs</span>
            </button>
            <button
              type="button"
              onClick={() => changeTab("about")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === "about"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FaInfoCircle className="w-4 h-4" />
              <span className="hidden sm:inline">
                {t("settings.tabs.about", { defaultValue: "About" })}
              </span>
              <span className="sm:hidden">
                {t("settings.tabs.about", { defaultValue: "About" })}
              </span>
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {activeTab === "general" && (
            <GeneralSettingsTab
              syncHistoryLimit={syncHistoryLimit}
              onSyncHistoryLimitChange={setSyncHistoryLimit}
              apiKey={apiKey}
              onApiKeyChange={setApiKey}
              tmdbAccessToken={tmdbAccessToken}
              onTmdbAccessTokenChange={setTmdbAccessToken}
            />
          )}

          {activeTab === "mediaServer" && (
            <MediaServerSettingsTab
              servers={servers}
              selectedServerUrl={selectedServerUrl}
              savedServerUrl={settings.plexServerUrl}
              editingServer={editingServer}
              onSelectedServerUrlChange={setSelectedServerUrl}
              onEditingServerChange={setEditingServer}
              onCancelEdit={() => {
                setEditingServer(null);
                if (settings.plexServerUrl) {
                  setSelectedServerUrl(settings.plexServerUrl);
                }
              }}
              hasPlexAccount={!!user?.plexUsername}
              onPlexAuthenticate={plexLogin}
              plexAuthLoading={plexLoading || linkingPlex}
              plexRefreshLoading={refreshingPlexServers}
              onRefreshPlexServers={handleRefreshPlexServers}
              plexLinkError={plexLinkError}
              settings={settings}
              onJellyfinSettingsChange={setJellyfinSettings}
              onSettingsUpdated={async () => {
                try {
                  const updatedSettings = await getSettings();
                  setSettings(updatedSettings);

                  if (!updatedSettings.plexServerUrl) {
                    setServers([]);
                    setSelectedServerUrl("");
                  } else {
                    setSelectedServerUrl(updatedSettings.plexServerUrl);
                    await fetchAndSetPlexServers(updatedSettings.plexServerUrl);
                  }

                  await checkAuth();
                } catch {
                  // Ignore errors
                }
              }}
            />
          )}

          {activeTab === "logs" && <LogsTab />}

          {activeTab === "about" && (
            <AboutSettingsTab versionInfo={versionInfo} />
          )}

          {/* Save Button */}
          {(activeTab === "general" || activeTab === "mediaServer") && (
            <div className="mt-6 border-t border-border pt-4 sm:mt-8 sm:pt-6">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {saving ? (
                    <>
                      <Spinner size="md" variant="onPrimary" />
                      <span>
                        {t("common.loading", { defaultValue: "Loading..." })}
                      </span>
                    </>
                  ) : (
                    <>
                      <FaCheckCircle className="w-4 h-4" />
                      <span>{t("common.save", { defaultValue: "Save" })}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
