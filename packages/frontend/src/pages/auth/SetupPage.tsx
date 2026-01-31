import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FaMoon, FaSun, FaDesktop, FaEye, FaEyeSlash } from "react-icons/fa";
import { useAuth } from "@contexts/AuthContext";
import { useTheme } from "@contexts/ThemeContext";
import { usePlexLogin } from "@hooks/auth/usePlexLogin";
import { CustomCheckbox } from "@components/ui/CustomCheckbox";
import { setupAdmin, setupJellyfinAdmin } from "@services/api";
import validator from "validator";

type SetupMethod = "choose" | "plex" | "jellyfin";

export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, checkAuth, setUserFromLogin } = useAuth();
  const [setupMethod, setSetupMethod] = useState<SetupMethod>("choose");
  const [jellyfinFormData, setJellyfinFormData] = useState({
    username: "",
    password: "",
    hostname: "",
    port: 8096,
    useSsl: false,
    urlBase: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [hostnameError, setHostnameError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const { loading: plexLoading, login: plexLogin } = usePlexLogin({
    onAuthToken: async (authToken: string) => {
      try {
        const response = await setupAdmin(authToken);
        if (response) {
          localStorage.setItem("plexAccessToken", authToken);
          localStorage.setItem("authSource", "plex");
          setUserFromLogin({
            id: response.id,
            username: response.username,
            displayName: response.displayName,
            email: response.email,
            isAdmin: response.isAdmin,
            plexUsername: response.username,
          });
          await checkAuth();
          navigate("/", { replace: true });
        }
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : t("auth.setupAdminFailed", {
                defaultValue: "Failed to setup admin",
              })
        );
      }
    },
    onError: (message: string) => {
      setError(message);
    },
  });

  const [jellyfinLoading, setJellyfinLoading] = useState(false);

  async function handleJellyfinSetup() {
    try {
      setError(null);
      setHostnameError(null);

      const hostname = jellyfinFormData.hostname.trim();
      if (!hostname) {
        setHostnameError(
          t("auth.jellyfin.hostnameRequired", {
            defaultValue: "Server hostname is required",
          })
        );
        return;
      }

      const isValidHostname =
        hostname === "localhost" ||
        validator.isIP(hostname) ||
        validator.isFQDN(hostname, {
          require_tld: false,
          allow_underscores: false,
        });

      if (!isValidHostname) {
        setHostnameError(
          t("auth.jellyfin.hostnameInvalid", {
            defaultValue:
              "Please enter a valid hostname (for example: jellyfin.local, localhost or 192.168.0.10)",
          })
        );
        return;
      }
      setJellyfinLoading(true);
      const response = await setupJellyfinAdmin(
        jellyfinFormData.username,
        jellyfinFormData.password,
        hostname,
        jellyfinFormData.port,
        jellyfinFormData.useSsl,
        jellyfinFormData.urlBase
      );
      if (response) {
        localStorage.setItem("jellyfinAccessToken", response.accessToken);
        localStorage.setItem("authSource", "jellyfin");
        setUserFromLogin({
          id: response.user.id,
          username: response.user.username,
          displayName: response.user.displayName,
          email: response.user.email,
          isAdmin: response.user.isAdmin,
          jellyfinUsername: response.user.username,
        });
        await checkAuth();
        navigate("/", { replace: true });
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t("auth.setupJellyfinAdminFailed", {
              defaultValue: "Failed to setup Jellyfin admin",
            })
      );
    } finally {
      setJellyfinLoading(false);
    }
  }

  if (isAuthenticated) {
    return null;
  }

  if (setupMethod === "choose") {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 relative">
        <ThemeToggleButton />
        <div className="max-w-2xl w-full dark:bg-[#121212] bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-900 dark:text-white">
            {t("auth.setupAdmin", { defaultValue: "Setup Admin Account" })}
          </h1>
          <p className="text-gray-600 dark:text-slate-400 text-center mb-8">
            {t("auth.welcome", {
              defaultValue:
                "Welcome to Scroblarr! Choose how you'd like to set up your admin account.",
            })}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setSetupMethod("plex")}
              className="p-6 border-2 border-blue-500 dark:border-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors text-left"
            >
              <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                {t("auth.plex", { defaultValue: "Plex" })}
              </h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                {t("auth.plexDescription", {
                  defaultValue: "Connect using Plex OAuth",
                })}
              </p>
            </button>

            <button
              onClick={() => setSetupMethod("jellyfin")}
              className="p-6 border-2 border-blue-500 dark:border-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors text-left"
            >
              <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                {t("auth.jellyfinService", { defaultValue: "Jellyfin" })}
              </h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                {t("auth.jellyfinDescription", {
                  defaultValue: "Connect using Jellyfin credentials",
                })}
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (setupMethod === "plex") {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 relative">
        <ThemeToggleButton />
        <div className="max-w-md w-full dark:bg-[#121212] bg-white rounded-lg shadow-lg p-8">
          <button
            onClick={() => setSetupMethod("choose")}
            className="mb-4 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
          >
            ← {t("auth.back", { defaultValue: "Back" })}
          </button>
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-900 dark:text-white">
            {t("auth.setupWithPlex", { defaultValue: "Setup with Plex" })}
          </h1>
          <p className="text-gray-600 dark:text-slate-400 text-center mb-8">
            {t("auth.plexConnectPrompt", {
              defaultValue: "Connect your Plex account to get started",
            })}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 rounded text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={plexLogin}
            disabled={plexLoading}
            className="w-full flex items-center justify-center gap-2 bg-[#e5a00d] text-black py-3 px-4 rounded-lg hover:bg-[#f5c14a] disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-sm transition-colors"
          >
            {plexLoading ? (
              <span>{t("common.loading", { defaultValue: "Loading..." })}</span>
            ) : (
              <>
                <img src="/logos/plex.svg" alt="Plex" className="h-4 w-4" />
                <span>Plex OAuth</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (setupMethod === "jellyfin") {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 relative">
        <ThemeToggleButton />
        <div className="max-w-md w-full dark:bg-[#121212] bg-white rounded-lg shadow-lg p-8">
          <button
            onClick={() => setSetupMethod("choose")}
            className="mb-4 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
          >
            ← {t("auth.back", { defaultValue: "Back" })}
          </button>
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-900 dark:text-white">
            {t("auth.setupWithJellyfin", {
              defaultValue: "Setup with Jellyfin",
            })}
          </h1>
          <p className="text-gray-600 dark:text-slate-400 text-center mb-8">
            {t("auth.jellyfinConnectPrompt", {
              defaultValue: "Enter your Jellyfin server details",
            })}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 rounded text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-slate-300">
                {t("auth.jellyfin.serverHostname", {
                  defaultValue: "Server Hostname",
                })}
              </label>
              <div className="flex rounded-md shadow-sm">
                <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 dark:border-[#2d2d2d] border-gray-300 dark:bg-[#2d2d2d] bg-gray-100 px-3 dark:text-slate-300 text-gray-700 sm:text-sm">
                  {jellyfinFormData.useSsl ? "https://" : "http://"}
                </span>
                <input
                  type="text"
                  value={jellyfinFormData.hostname}
                  onChange={(e) =>
                    setJellyfinFormData({
                      ...jellyfinFormData,
                      hostname: e.target.value,
                    })
                  }
                  placeholder={t("auth.jellyfin.hostnamePlaceholder", {
                    defaultValue: "jellyfin.example.com",
                  })}
                  className="flex-1 rounded-r-md border border-gray-300 dark:border-[#2d2d2d] bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {hostnameError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {hostnameError}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-slate-300">
                  {t("auth.jellyfin.port", { defaultValue: "Port" })}
                </label>
                <input
                  type="number"
                  value={jellyfinFormData.port}
                  onChange={(e) =>
                    setJellyfinFormData({
                      ...jellyfinFormData,
                      port: parseInt(e.target.value) || 8096,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-[#2d2d2d] rounded-lg bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                  <CustomCheckbox
                    checked={jellyfinFormData.useSsl}
                    onChange={() =>
                      setJellyfinFormData({
                        ...jellyfinFormData,
                        useSsl: !jellyfinFormData.useSsl,
                        port: !jellyfinFormData.useSsl ? 443 : 8096,
                      })
                    }
                  />
                  <span className="ml-2">
                    {t("auth.jellyfin.useSsl", { defaultValue: "Use SSL" })}
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-slate-300">
                {t("auth.jellyfin.urlBase", {
                  defaultValue: "URL Base (optional)",
                })}
              </label>
              <input
                type="text"
                value={jellyfinFormData.urlBase}
                onChange={(e) =>
                  setJellyfinFormData({
                    ...jellyfinFormData,
                    urlBase: e.target.value,
                  })
                }
                placeholder={t("auth.jellyfin.urlBasePlaceholder", {
                  defaultValue: "/jellyfin",
                })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-[#2d2d2d] rounded-lg bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-slate-300">
                {t("auth.jellyfin.username", { defaultValue: "Username" })}
              </label>
              <input
                type="text"
                value={jellyfinFormData.username}
                onChange={(e) =>
                  setJellyfinFormData({
                    ...jellyfinFormData,
                    username: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-[#2d2d2d] rounded-lg bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-slate-300">
                {t("auth.jellyfin.password", { defaultValue: "Password" })}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={jellyfinFormData.password}
                  onChange={(e) =>
                    setJellyfinFormData({
                      ...jellyfinFormData,
                      password: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-[#2d2d2d] rounded-lg bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              onClick={handleJellyfinSetup}
              disabled={
                jellyfinLoading ||
                !jellyfinFormData.hostname ||
                !jellyfinFormData.username ||
                !jellyfinFormData.password
              }
              className="w-full flex items-center justify-center gap-2 border border-[#8b5cff]/60 py-3 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-sm transition-colors bg-white text-[#8b5cff] hover:bg-[#f3ebff] dark:bg-[#120c2b] dark:text-white dark:hover:bg-[#1e1840]"
            >
              {jellyfinLoading ? (
                <span>
                  {t("common.loading", { defaultValue: "Loading..." })}
                </span>
              ) : (
                <>
                  <img
                    src="/logos/jellyfin.svg"
                    alt="Jellyfin"
                    className="h-4 w-4"
                  />
                  <span>
                    {t("auth.jellyfin.setupAdmin", {
                      defaultValue: "Setup Admin",
                    })}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function ThemeToggleButton() {
  const { themeMode, toggleTheme } = useTheme();
  const { t } = useTranslation();

  const getIcon = () => {
    if (themeMode === "auto") {
      return <FaDesktop className="h-5 w-5" />;
    }
    if (themeMode === "light") {
      return <FaSun className="h-5 w-5" />;
    }
    return <FaMoon className="h-5 w-5" />;
  };

  const getAriaLabel = () => {
    if (themeMode === "auto") {
      return t("theme.auto", { defaultValue: "Auto (system)" });
    }
    if (themeMode === "light") {
      return t("theme.light", { defaultValue: "Light mode" });
    }
    return t("theme.dark", { defaultValue: "Dark mode" });
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="absolute top-4 right-4 p-2 rounded-lg text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e1e1e] transition-colors"
      aria-label={getAriaLabel()}
      title={getAriaLabel()}
    >
      {getIcon()}
    </button>
  );
}
