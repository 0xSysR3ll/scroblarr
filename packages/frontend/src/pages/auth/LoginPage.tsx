import { useAuth } from "@contexts/AuthContext";
import { useTheme } from "@contexts/ThemeContext";
import { useJellyfinLogin } from "@hooks/auth/useJellyfinLogin";
import { usePlexLogin } from "@hooks/auth/usePlexLogin";
import { loginWithPlex, getAuthProviders } from "@services/api";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaMoon, FaSun, FaDesktop, FaEye, FaEyeSlash } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    onAuthToken: async ({ authToken, clientIdentifier }) => {
      try {
        const response = await loginWithPlex(authToken, clientIdentifier);
        if (response) {
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
    onSuccess: async (_response) => {
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
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8">
      <ThemeToggleButton />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-success-500" />
            <span>
              {t("auth.welcomeBadge", {
                defaultValue: "Welcome back to Scroblarr",
              })}
            </span>
          </div>
        </div>

        <Card className="border-border/80 shadow-xl backdrop-blur-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl sm:text-3xl">
              {t("auth.login", { defaultValue: "Login" })}
            </CardTitle>
            <CardDescription className="text-base">
              {t("auth.signInPrompt", {
                defaultValue: "Sign in to access Scroblarr.",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            {(authProviders?.plexConfigured || authProviders?.hasAdmin) && (
              <button
                type="button"
                onClick={plexLogin}
                disabled={plexLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--auth-plex-oauth-bg)] px-4 py-3 font-semibold text-[var(--auth-plex-oauth-fg)] shadow-sm transition-colors hover:bg-[var(--auth-plex-oauth-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
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
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("auth.or", { defaultValue: "Or" })}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}

            {authProviders?.jellyfinConfigured && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="jellyfin-username">Jellyfin username</Label>
                  <Input
                    id="jellyfin-username"
                    type="text"
                    value={jellyfinFormData.username}
                    onChange={(e) =>
                      setJellyfinFormData({
                        ...jellyfinFormData,
                        username: e.target.value,
                      })
                    }
                    autoComplete="username"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="jellyfin-password">Jellyfin password</Label>
                  <div className="relative">
                    <Input
                      id="jellyfin-password"
                      type={showPassword ? "text" : "password"}
                      value={jellyfinFormData.password}
                      onChange={(e) =>
                        setJellyfinFormData({
                          ...jellyfinFormData,
                          password: e.target.value,
                        })
                      }
                      className="pr-10"
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
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-hidden"
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
                        <FaEyeSlash className="h-5 w-5" />
                      ) : (
                        <FaEye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-primary/45 bg-background font-semibold text-primary hover:bg-primary/10 dark:border-primary/40 dark:hover:bg-primary/15"
                  onClick={handleJellyfinLogin}
                  disabled={
                    jellyfinLoading ||
                    !jellyfinFormData.username ||
                    !jellyfinFormData.password
                  }
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
                </Button>
              </div>
            )}

            {!authProviders?.hasAdmin &&
              !authProviders?.plexConfigured &&
              !authProviders?.jellyfinConfigured && (
                <p className="text-center text-sm text-muted-foreground">
                  {t("auth.noServiceConfigured", {
                    defaultValue:
                      "No authentication service configured. Please contact an administrator.",
                  })}
                </p>
              )}
          </CardContent>
        </Card>
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
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="absolute right-4 top-4"
      onClick={toggleTheme}
      aria-label={getAriaLabel()}
      title={getAriaLabel()}
    >
      {getIcon()}
    </Button>
  );
}
