import { CustomCheckbox } from "@components/ui/CustomCheckbox";
import { useAuth } from "@contexts/AuthContext";
import { useTheme } from "@contexts/ThemeContext";
import { usePlexLogin } from "@hooks/auth/usePlexLogin";
import { setupAdmin, setupJellyfinAdmin } from "@services/api";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaMoon, FaSun, FaDesktop, FaEye, FaEyeSlash } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import validator from "validator";

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
    onAuthToken: async ({ authToken, clientIdentifier }) => {
      try {
        const response = await setupAdmin(authToken, clientIdentifier);
        if (response) {
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
      <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8">
        <ThemeToggleButton />
        <Card className="w-full max-w-2xl border-border/80 shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">
              {t("auth.setupAdmin", { defaultValue: "Setup Admin Account" })}
            </CardTitle>
            <CardDescription className="text-base">
              {t("auth.welcome", {
                defaultValue:
                  "Welcome to Scroblarr! Choose how you'd like to set up your admin account.",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setSetupMethod("plex")}
                className="rounded-xl border-2 border-primary/40 bg-card p-6 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <h2 className="mb-2 text-xl font-semibold text-foreground">
                  {t("auth.plex", { defaultValue: "Plex" })}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("auth.plexDescription", {
                    defaultValue: "Connect using Plex OAuth",
                  })}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSetupMethod("jellyfin")}
                className="rounded-xl border-2 border-primary/40 bg-card p-6 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <h2 className="mb-2 text-xl font-semibold text-foreground">
                  {t("auth.jellyfinService", { defaultValue: "Jellyfin" })}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("auth.jellyfinDescription", {
                    defaultValue: "Connect using Jellyfin credentials",
                  })}
                </p>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (setupMethod === "plex") {
    return (
      <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8">
        <ThemeToggleButton />
        <Card className="w-full max-w-md border-border/80 shadow-xl">
          <CardHeader>
            <Button
              type="button"
              variant="ghost"
              className="mb-2 -ml-2 w-fit px-2 text-primary hover:text-primary/80"
              onClick={() => setSetupMethod("choose")}
            >
              ← {t("auth.back", { defaultValue: "Back" })}
            </Button>
            <CardTitle className="text-center text-3xl">
              {t("auth.setupWithPlex", { defaultValue: "Setup with Plex" })}
            </CardTitle>
            <CardDescription className="text-center text-base">
              {t("auth.plexConnectPrompt", {
                defaultValue: "Connect your Plex account to get started",
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
          </CardContent>
        </Card>
      </div>
    );
  }

  if (setupMethod === "jellyfin") {
    return (
      <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8">
        <ThemeToggleButton />
        <Card className="w-full max-w-md border-border/80 shadow-xl">
          <CardHeader>
            <Button
              type="button"
              variant="ghost"
              className="mb-2 -ml-2 w-fit px-2 text-primary hover:text-primary/80"
              onClick={() => setSetupMethod("choose")}
            >
              ← {t("auth.back", { defaultValue: "Back" })}
            </Button>
            <CardTitle className="text-center text-3xl">
              {t("auth.setupWithJellyfin", {
                defaultValue: "Setup with Jellyfin",
              })}
            </CardTitle>
            <CardDescription className="text-center text-base">
              {t("auth.jellyfinConnectPrompt", {
                defaultValue: "Enter your Jellyfin server details",
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

            <div className="space-y-2">
              <Label htmlFor="jf-hostname">
                {t("auth.jellyfin.serverHostname", {
                  defaultValue: "Server Hostname",
                })}
              </Label>
              <div className="flex overflow-hidden rounded-lg border border-input shadow-sm">
                <span className="inline-flex cursor-default items-center border-r border-border bg-muted px-3 text-sm text-muted-foreground">
                  {jellyfinFormData.useSsl ? "https://" : "http://"}
                </span>
                <Input
                  id="jf-hostname"
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
                  className="rounded-none border-0 shadow-none focus-visible:ring-0 md:text-sm"
                />
              </div>
              {hostnameError && (
                <p className="text-xs text-destructive">{hostnameError}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="jf-port">
                  {t("auth.jellyfin.port", { defaultValue: "Port" })}
                </Label>
                <Input
                  id="jf-port"
                  type="number"
                  value={jellyfinFormData.port}
                  onChange={(e) =>
                    setJellyfinFormData({
                      ...jellyfinFormData,
                      port: parseInt(e.target.value) || 8096,
                    })
                  }
                />
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex cursor-pointer items-center text-sm text-foreground">
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

            <div className="space-y-2">
              <Label htmlFor="jf-urlbase">
                {t("auth.jellyfin.urlBase", {
                  defaultValue: "URL Base (optional)",
                })}
              </Label>
              <Input
                id="jf-urlbase"
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
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="jf-user">
                {t("auth.jellyfin.username", { defaultValue: "Username" })}
              </Label>
              <Input
                id="jf-user"
                type="text"
                value={jellyfinFormData.username}
                onChange={(e) =>
                  setJellyfinFormData({
                    ...jellyfinFormData,
                    username: e.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="jf-pass">
                {t("auth.jellyfin.password", { defaultValue: "Password" })}
              </Label>
              <div className="relative">
                <Input
                  id="jf-pass"
                  type={showPassword ? "text" : "password"}
                  value={jellyfinFormData.password}
                  onChange={(e) =>
                    setJellyfinFormData({
                      ...jellyfinFormData,
                      password: e.target.value,
                    })
                  }
                  className="pr-10"
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
              onClick={handleJellyfinSetup}
              disabled={
                jellyfinLoading ||
                !jellyfinFormData.hostname ||
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
                  <span>
                    {t("auth.jellyfin.setupAdmin", {
                      defaultValue: "Setup Admin",
                    })}
                  </span>
                </>
              )}
            </Button>
          </CardContent>
        </Card>
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
