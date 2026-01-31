import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FaCog, FaFileAlt, FaServer, FaCheckCircle } from "react-icons/fa";
import {
  getSettings,
  updateSettings,
  getPlexServers,
  type PlexServer,
  type Settings,
  linkPlexAccount,
} from "@services/api";
import { useAuth } from "@contexts/AuthContext";
import { usePlexLogin } from "@hooks/auth/usePlexLogin";
import { useTabNavigation } from "@hooks/useTabNavigation";
import { GeneralSettingsTab } from "@components/settings/GeneralSettingsTab";
import { MediaServerSettingsTab } from "@components/settings/MediaServerSettingsTab";
import { LogsTab } from "@components/settings/LogsTab";
import { showSuccess, showError } from "@utils/toast";

type SettingsTab = "general" | "mediaServer" | "logs";

const SETTINGS_TABS = ["general", "mediaServer", "logs"] as const;

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
  const [plexLinkError, setPlexLinkError] = useState<string | null>(null);
  const [linkingPlex, setLinkingPlex] = useState(false);

  const fetchAndSetPlexServers = useCallback(
    async (configuredServerUrl?: string) => {
      try {
        const serversData = await getPlexServers();
        setServers(serversData);

        if (configuredServerUrl) {
          const isValid = serversData.some((server) =>
            server.connections.some((conn) => conn.uri === configuredServerUrl)
          );
          if (isValid) {
            setSelectedServerUrl(configuredServerUrl);
          } else if (
            serversData.length > 0 &&
            serversData[0].connections.length > 0
          ) {
            setSelectedServerUrl(serversData[0].url);
          }
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
    onAuthToken: async (authToken: string) => {
      try {
        setPlexLinkError(null);
        setLinkingPlex(true);
        await linkPlexAccount(authToken);
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
              await updateSettings({ plexServerUrl: firstServerUrl });
              setSettings({
                ...currentSettings,
                plexServerUrl: firstServerUrl,
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
    async function loadData() {
      try {
        setLoading(true);
        const settingsData = await getSettings();
        setSettings(settingsData);

        if (settingsData.syncHistoryLimit) {
          setSyncHistoryLimit(parseInt(settingsData.syncHistoryLimit, 10));
        }

        if (settingsData.apiKey) {
          setApiKey(settingsData.apiKey);
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
          await fetchAndSetPlexServers(settingsData.plexServerUrl);
        } else {
          setServers([]);
          setSelectedServerUrl("");
        }
      } catch (err) {
        showError(
          err instanceof Error ? err.message : "Failed to load settings"
        );
      } finally {
        setLoading(false);
      }
    }

    if (isAdmin) {
      loadData();
    }
  }, [isAdmin, user?.plexUsername, fetchAndSetPlexServers]);

  async function handleSave() {
    try {
      setSaving(true);

      const updated: Record<string, string | number | boolean> = {
        syncHistoryLimit: syncHistoryLimit,
      };

      if (activeTab === "general" && apiKey) {
        updated.apiKey = apiKey;
      }

      if (activeTab === "mediaServer") {
        if (selectedServerUrl) {
          updated.plexServerUrl = selectedServerUrl;
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 dark:text-slate-400 text-gray-600">
            {t("common.loading", { defaultValue: "Loading..." })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-gray-900 dark:text-white">
        {t("settings.title", { defaultValue: "Settings" })}
      </h1>

      <div className="dark:bg-[#121212] bg-white rounded-lg shadow-lg">
        {/* Tabs */}
        <div className="border-b dark:border-[#2d2d2d] border-gray-200 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <nav className="flex -mb-px" aria-label="Tabs">
            <button
              onClick={() => changeTab("general")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "general"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent dark:text-slate-400 text-gray-500 hover:dark:text-slate-300 hover:text-gray-700"
              }`}
            >
              <FaCog className="w-4 h-4" />
              <span className="hidden sm:inline">
                {t("settings.tabs.general", { defaultValue: "General" })}
              </span>
              <span className="sm:hidden">General</span>
            </button>
            <button
              onClick={() => changeTab("mediaServer")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors flex-shrink-0 ${
                activeTab === "mediaServer"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent dark:text-slate-400 text-gray-500 hover:dark:text-slate-300 hover:text-gray-700"
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
              onClick={() => changeTab("logs")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "logs"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent dark:text-slate-400 text-gray-500 hover:dark:text-slate-300 hover:text-gray-700"
              }`}
            >
              <FaFileAlt className="w-4 h-4" />
              <span className="hidden sm:inline">
                {t("logs.title", { defaultValue: "Logs" })}
              </span>
              <span className="sm:hidden">Logs</span>
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

          {/* Save Button */}
          {activeTab !== "logs" && (
            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t dark:border-[#2d2d2d] border-gray-200">
              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-blue-600 text-white py-2 px-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors shadow-sm"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
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
