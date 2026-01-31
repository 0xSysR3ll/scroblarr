import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FaMoon, FaSun, FaDesktop, FaEye, FaEyeSlash } from "react-icons/fa";
import { useAuth } from "@contexts/AuthContext";
import { useTheme } from "@contexts/ThemeContext";
import { usePlexLogin } from "@hooks/auth/usePlexLogin";
import { useJellyfinLogin } from "@hooks/auth/useJellyfinLogin";
import { loginWithPlex, getAuthProviders } from "@services/api";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, checkAuth } = useAuth();
  const [authProviders, setAuthProviders] = useState<{
    hasAdmin: boolean;
    plexConfigured: boolean;
    jellyfinConfigured: boolean;
  } | null>(null);
  const [jellyfinFormData, setJellyfinFormData] = useState({
    username: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const { loading: plexLoading, login: plexLogin } = usePlexLogin({
    onAuthToken: async (authToken: string) => {
      try {
        const response = await loginWithPlex(authToken);
        if (response) {
          localStorage.setItem("plexAccessToken", authToken);
          localStorage.setItem("authSource", "plex");
          await checkAuth();
        }
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : t("auth.loginFailed", { defaultValue: "Failed to login" })
        );
      }
    },
    onError: (message: string) => {
      setError(message);
    },
  });

  const { loading: jellyfinLoading, login: jellyfinLogin } = useJellyfinLogin({
    onSuccess: async (response) => {
      if (response.accessToken) {
        localStorage.setItem("jellyfinAccessToken", response.accessToken);
      }
      localStorage.setItem("authSource", "jellyfin");
      await checkAuth();
    },
    onError: (message: string) => {
      setError(message);
    },
  });

  useEffect(() => {
    async function loadAuthProviders() {
      try {
        const data = await getAuthProviders();
        setAuthProviders(data);
      } catch {
        // Ignore errors
      }
    }
    loadAuthProviders();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  async function handleJellyfinLogin() {
    try {
      setError(null);
      if (!jellyfinFormData.username || !jellyfinFormData.password) {
        setError(
          t("auth.usernamePasswordRequired", {
            defaultValue: "Please enter your username and password",
          })
        );
        return;
      }
      await jellyfinLogin(jellyfinFormData.username, jellyfinFormData.password);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t("auth.loginWithJellyfinFailed", {
              defaultValue: "Failed to login with Jellyfin",
            })
      );
    }
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 relative">
      <ThemeToggleButton />
      <div className="relative z-10 max-w-md w-full">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 dark:bg-black/40 shadow-sm border border-gray-200/60 dark:border-white/10">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-gray-600 dark:text-slate-300">
              {t("auth.welcomeBadge", {
                defaultValue: "Welcome back to Scroblarr",
              })}
            </span>
          </div>
        </div>

        <div className="dark:bg-[#050816]/90 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200/80 dark:border-white/5 px-6 py-6 sm:px-8 sm:py-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              {t("auth.login", { defaultValue: "Login" })}
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-slate-400">
              {t("auth.signInPrompt", {
                defaultValue: "Sign in to access Scroblarr.",
              })}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 rounded text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {(authProviders?.plexConfigured || authProviders?.hasAdmin) && (
            <button
              onClick={plexLogin}
              disabled={plexLoading}
              className="w-full flex items-center justify-center gap-2 bg-[#e5a00d] text-black py-3 px-4 rounded-lg hover:bg-[#f5c14a] disabled:opacity-50 disabled:cursor-not-allowed font-semibold mb-6 shadow-sm transition-colors"
            >
              {plexLoading ? (
                <span>
                  {t("common.loading", { defaultValue: "Loading..." })}
                </span>
              ) : (
                <>
                  <img src="/logos/plex.svg" alt="Plex" className="h-4 w-4" />
                  <span>Plex OAuth</span>
                </>
              )}
            </button>
          )}

          {(authProviders?.plexConfigured || authProviders?.hasAdmin) &&
            authProviders?.jellyfinConfigured && (
              <div className="flex items-center my-4">
                <div className="flex-1 h-px bg-gray-200 dark:bg-[#1e1e1e]" />
                <span className="px-3 text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  {t("auth.or", { defaultValue: "Or" })}
                </span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-[#1e1e1e]" />
              </div>
            )}

          {authProviders?.jellyfinConfigured && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1">
                  Jellyfin username
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
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1">
                  Jellyfin password
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
                    autoComplete="current-password"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleJellyfinLogin();
                      }
                    }}
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
                onClick={handleJellyfinLogin}
                disabled={
                  jellyfinLoading ||
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
                    <span>Jellyfin Login</span>
                  </>
                )}
              </button>
            </div>
          )}

          {!authProviders?.hasAdmin &&
            !authProviders?.plexConfigured &&
            !authProviders?.jellyfinConfigured && (
              <div className="text-center text-gray-600 dark:text-slate-400">
                <p>
                  {t("auth.noServiceConfigured", {
                    defaultValue:
                      "No authentication service configured. Please contact an administrator.",
                  })}
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
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
