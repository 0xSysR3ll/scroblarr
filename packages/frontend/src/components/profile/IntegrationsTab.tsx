import { CustomCheckbox } from "@components/ui/CustomCheckbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@components/ui/dialog";
import { Spinner } from "@components/ui/spinner";
import {
  getTVTimeStatus,
  linkTVTime,
  unlinkTVTime,
  getTVTimeProfile,
  type TVTimeStatus,
  type TVTimeProfile,
  getTraktStatus,
  getTraktAuthorizeUrl,
  linkTrakt,
  unlinkTrakt,
  type TraktStatus,
  updateProfile,
} from "@services/api";
import { OAuthPopup } from "@utils/OAuthPopup";
import { showSuccess, showError } from "@utils/toast";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  FaCheckCircle,
  FaTimesCircle,
  FaUnlink,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";

const DOCS_URL =
  (import.meta as { env?: { VITE_DOCS_URL?: string } }).env?.VITE_DOCS_URL ||
  "https://0xsysr3ll.github.io/scroblarr/docs";
const TRAKT_DOCS_URL = `${DOCS_URL}/configuration/trakt`;

interface IntegrationsTabProps {
  tvtimeMarkMoviesAsRewatched?: boolean;
  tvtimeMarkEpisodesAsRewatched?: boolean;
  onProfileUpdated?: () => void;
}

export function IntegrationsTab({
  tvtimeMarkMoviesAsRewatched = false,
  tvtimeMarkEpisodesAsRewatched = false,
  onProfileUpdated,
}: IntegrationsTabProps) {
  const { t } = useTranslation();
  const [tvtimeStatus, setTVTimeStatus] = useState<TVTimeStatus | null>(null);
  const [tvtimeProfile, setTVTimeProfile] = useState<TVTimeProfile | null>(
    null
  );
  const [profileLoadWarning, setProfileLoadWarning] = useState<string | null>(
    null
  );
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [linkProgress, setLinkProgress] = useState<{
    currentStep: number;
    steps: string[];
  } | null>(null);
  const [showUnlinkModal, setShowUnlinkModal] = useState(false);
  const [markMoviesAsRewatched, setMarkMoviesAsRewatched] = useState(
    tvtimeMarkMoviesAsRewatched
  );
  const [markEpisodesAsRewatched, setMarkEpisodesAsRewatched] = useState(
    tvtimeMarkEpisodesAsRewatched
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [traktStatus, setTraktStatus] = useState<TraktStatus | null>(null);
  const [traktLoading, setTraktLoading] = useState(true);
  const [traktSaving, setTraktSaving] = useState(false);
  const [traktError, setTraktError] = useState<string | null>(null);
  const [traktCode, setTraktCode] = useState("");
  const [traktClientId, setTraktClientId] = useState("");
  const [traktClientSecret, setTraktClientSecret] = useState("");
  const [showTraktSecret, setShowTraktSecret] = useState(false);
  const [traktAuthUrl, setTraktAuthUrl] = useState<string | null>(null);
  const [showTraktUnlinkModal, setShowTraktUnlinkModal] = useState(false);
  const [traktOAuthPopup] = useState(() => new OAuthPopup());

  const loadTVTimeProfile = useCallback(
    async (status: TVTimeStatus) => {
      if (!status.linked) {
        setTVTimeProfile(null);
        setProfileLoadWarning(null);
        return;
      }

      try {
        setLoadingProfile(true);
        setProfileLoadWarning(null);
        const profile = await getTVTimeProfile();
        setTVTimeProfile(profile);
      } catch (err) {
        setTVTimeProfile(null);
        const message =
          err instanceof Error
            ? err.message
            : t("tvtime.profileFailed", {
                defaultValue: "Failed to load TVTime profile",
              });
        const isTemporaryFailure =
          /502|503|504|bad gateway|temporarily unavailable|service unavailable|gateway timeout/i.test(
            message
          );
        if (isTemporaryFailure) {
          setProfileLoadWarning(
            t("tvtime.profileUnavailable", {
              defaultValue:
                "Your account is linked. Profile details could not be loaded (TVTime service temporarily unavailable). Syncing should still work.",
            })
          );
          setError(null);
        } else {
          setProfileLoadWarning(null);
          setError(message);
        }
      } finally {
        setLoadingProfile(false);
      }
    },
    [t]
  );

  useEffect(() => {
    setMarkMoviesAsRewatched(tvtimeMarkMoviesAsRewatched);
    setMarkEpisodesAsRewatched(tvtimeMarkEpisodesAsRewatched);
  }, [tvtimeMarkMoviesAsRewatched, tvtimeMarkEpisodesAsRewatched]);

  useEffect(() => {
    async function loadTVTimeStatus() {
      try {
        setLoading(true);
        const status = await getTVTimeStatus();
        setTVTimeStatus(status);
        if (status.email) {
          setEmail(status.email);
        }
        if (status.linked) {
          loadTVTimeProfile(status);
        } else {
          setTVTimeProfile(null);
        }
      } catch {
        // Error handled by UI state
      } finally {
        setLoading(false);
      }
    }

    loadTVTimeStatus();
  }, [loadTVTimeProfile]);

  useEffect(() => {
    async function loadTraktStatus() {
      try {
        setTraktLoading(true);
        const status = await getTraktStatus();
        setTraktStatus(status);
      } catch {
        // Error handled by UI state
      } finally {
        setTraktLoading(false);
      }
    }

    loadTraktStatus();
  }, []);

  useEffect(() => {
    return () => {
      traktOAuthPopup.closePopup();
    };
  }, [traktOAuthPopup]);

  async function handleGetTraktAuthUrl() {
    try {
      setTraktError(null);

      try {
        traktOAuthPopup.preparePopup("Trakt Auth");
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to open authentication window. Please allow popups and try again.";
        setTraktError(errorMessage);
        return;
      }

      setTimeout(async () => {
        try {
          const clientId = traktClientId.trim() || undefined;
          const clientSecret = traktClientSecret.trim() || undefined;

          const response = await getTraktAuthorizeUrl(clientId, clientSecret);
          setTraktAuthUrl(response.authUrl);

          traktOAuthPopup.navigateToUrl(response.authUrl);
        } catch (err) {
          setTraktError(
            err instanceof Error
              ? err.message
              : t("trakt.getAuthUrlFailed", {
                  defaultValue: "Failed to get authorization URL",
                })
          );
        }
      }, 1500);
    } catch (err) {
      setTraktError(
        err instanceof Error
          ? err.message
          : t("trakt.getAuthUrlFailed", {
              defaultValue: "Failed to get authorization URL",
            })
      );
    }
  }

  async function handleLinkTrakt() {
    if (!traktCode.trim()) {
      setTraktError(
        t("trakt.codeRequired", {
          defaultValue: "Authorization code is required",
        })
      );
      return;
    }

    const clientId = traktClientId.trim() || undefined;
    const clientSecret = traktClientSecret.trim() || undefined;

    try {
      setTraktSaving(true);
      setTraktError(null);
      await linkTrakt(traktCode.trim(), clientId, clientSecret);
      setTraktCode("");
      setTraktClientId("");
      setTraktClientSecret("");
      setTraktAuthUrl(null);
      traktOAuthPopup.closePopup();
      const status = await getTraktStatus();
      setTraktStatus(status);
      showSuccess(
        t("trakt.linked", {
          defaultValue: "Trakt account linked successfully",
        })
      );
      onProfileUpdated?.();
    } catch (err) {
      setTraktError(
        err instanceof Error
          ? err.message
          : t("trakt.linkFailed", {
              defaultValue: "Failed to link Trakt account",
            })
      );
    } finally {
      setTraktSaving(false);
    }
  }

  async function handleUnlinkTrakt() {
    setShowTraktUnlinkModal(true);
  }

  async function confirmUnlinkTrakt() {
    setShowTraktUnlinkModal(false);

    try {
      setTraktSaving(true);
      setTraktError(null);
      await unlinkTrakt();
      setTraktCode("");
      setTraktAuthUrl(null);
      setTraktClientId("");
      setTraktClientSecret("");
      const status = await getTraktStatus();
      setTraktStatus(status);
      showSuccess(
        t("trakt.unlinked", {
          defaultValue: "Trakt account unlinked successfully",
        })
      );
      onProfileUpdated?.();
    } catch (err) {
      setTraktError(
        err instanceof Error
          ? err.message
          : t("trakt.unlinkFailed", {
              defaultValue: "Failed to unlink Trakt account",
            })
      );
    } finally {
      setTraktSaving(false);
    }
  }

  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      await updateProfile({
        tvtimeMarkMoviesAsRewatched: markMoviesAsRewatched,
        tvtimeMarkEpisodesAsRewatched: markEpisodesAsRewatched,
      });
      showSuccess(
        t("profile.saved", { defaultValue: "Settings saved successfully!" })
      );
      onProfileUpdated?.();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const hasSettingsChanges =
    markMoviesAsRewatched !== tvtimeMarkMoviesAsRewatched ||
    markEpisodesAsRewatched !== tvtimeMarkEpisodesAsRewatched;

  async function handleLinkTVTime() {
    try {
      setSaving(true);
      setError(null);
      setLinkProgress({
        currentStep: 0,
        steps: [
          t("tvtime.progress.launchingBrowser", {
            defaultValue: "Launching browser (Puppeteer)...",
          }),
          t("tvtime.progress.loadingAuthPage", {
            defaultValue: "Loading TVTime authentication page...",
          }),
          t("tvtime.progress.extractingJwt", {
            defaultValue: "Extracting JWT token from browser...",
          }),
          t("tvtime.progress.authenticating", {
            defaultValue: "Authenticating with your credentials...",
          }),
          t("tvtime.progress.saving", {
            defaultValue: "Saving account information...",
          }),
          t("tvtime.progress.loadingProfile", {
            defaultValue: "Loading profile information...",
          }),
        ],
      });

      if (!email || !password) {
        setError(
          t("tvtime.emailPasswordRequired", {
            defaultValue: "Email and password are required",
          })
        );
        setLinkProgress(null);
        return;
      }

      setLinkProgress((prev) => (prev ? { ...prev, currentStep: 1 } : null));
      await new Promise((resolve) => setTimeout(resolve, 500));

      setLinkProgress((prev) => (prev ? { ...prev, currentStep: 2 } : null));
      await new Promise((resolve) => setTimeout(resolve, 500));

      setLinkProgress((prev) => (prev ? { ...prev, currentStep: 3 } : null));
      await linkTVTime(email, password);

      setLinkProgress((prev) => (prev ? { ...prev, currentStep: 4 } : null));
      const status = await getTVTimeStatus();
      setTVTimeStatus(status);
      setPassword("");

      if (status.linked) {
        setLinkProgress((prev) => (prev ? { ...prev, currentStep: 5 } : null));
        await loadTVTimeProfile(status);
      }

      setLinkProgress(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("tvtime.linkFailed", {
              defaultValue: "Failed to link TVTime account",
            })
      );
      setLinkProgress(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlinkTVTime() {
    setShowUnlinkModal(true);
  }

  async function confirmUnlinkTVTime() {
    setShowUnlinkModal(false);

    try {
      setSaving(true);
      setError(null);

      await unlinkTVTime();
      setTVTimeProfile(null);
      setEmail("");
      setPassword("");

      const status = await getTVTimeStatus();
      setTVTimeStatus(status);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("tvtime.unlinkFailed", {
              defaultValue: "Failed to unlink TVTime account",
            })
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading && !tvtimeStatus) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="xl" />
        <span className="ml-3 text-muted-foreground">
          {t("common.loading", { defaultValue: "Loading..." })}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2 text-foreground">
          {t("profile.integrations.title", {
            defaultValue: "Integrations",
          })}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t("profile.integrations.description", {
            defaultValue:
              "Connect your syncing service accounts to automatically sync your watched episodes.",
          })}
        </p>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <img
              src="/logos/tvtime.png"
              alt="TVTime"
              className="w-8 h-8 object-contain shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-foreground">
                TVTime
              </h3>
              <p className="text-xs text-muted-foreground wrap-break-word">
                {t("tvtime.description", {
                  defaultValue:
                    "Sync your watched episodes automatically. Your credentials are stored securely.",
                })}
              </p>
            </div>
          </div>
          {tvtimeStatus?.linked && (
            <div className="hidden sm:flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <FaCheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">
                  {t("profile.linkedAccounts.linked", {
                    defaultValue: "Linked",
                  })}
                </span>
              </div>
              <button
                onClick={handleUnlinkTVTime}
                disabled={saving}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={t("tvtime.unlink", {
                  defaultValue: "Unlink",
                })}
              >
                <FaUnlink className="w-3.5 h-3.5" />
                <span>
                  {t("tvtime.unlink", {
                    defaultValue: "Unlink",
                  })}
                </span>
              </button>
            </div>
          )}
        </div>

        {tvtimeStatus?.linked ? (
          <div className="space-y-4">
            {loadingProfile ? (
              <div className="flex items-center gap-2 py-2">
                <Spinner size="md" />
                <span className="text-sm text-muted-foreground">
                  {t("common.loading", {
                    defaultValue: "Loading profile...",
                  })}
                </span>
              </div>
            ) : tvtimeProfile ? (
              <div className="pt-3 border-t border-border">
                <div className="flex items-start gap-4">
                  {tvtimeProfile.image && (
                    <img
                      src={tvtimeProfile.image}
                      alt="Profile"
                      className="w-16 h-16 rounded-full shrink-0"
                    />
                  )}
                  <div className="flex-1 space-y-2">
                    {tvtimeProfile.username && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-0.5">
                          {t("tvtime.profile.username", {
                            defaultValue: "Username",
                          })}
                        </p>
                        <p className="text-sm text-foreground">
                          {tvtimeProfile.username}
                        </p>
                      </div>
                    )}
                    {tvtimeProfile.email && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-0.5">
                          {t("tvtime.profile.email", {
                            defaultValue: "Email",
                          })}
                        </p>
                        <p className="text-sm text-foreground">
                          {tvtimeProfile.email}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-3 border-t border-border space-y-3">
                <p className="text-sm text-foreground">{tvtimeStatus.email}</p>
                {profileLoadWarning && (
                  <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm text-primary">
                    {profileLoadWarning}
                  </div>
                )}
              </div>
            )}

            {tvtimeStatus?.linked && (
              <div className="flex sm:hidden items-center gap-3 pt-2">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <FaCheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    {t("profile.linkedAccounts.linked", {
                      defaultValue: "Linked",
                    })}
                  </span>
                </div>
                <button
                  onClick={handleUnlinkTVTime}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t("tvtime.unlink", {
                    defaultValue: "Unlink",
                  })}
                >
                  <FaUnlink className="w-3.5 h-3.5" />
                  <span>
                    {t("tvtime.unlink", {
                      defaultValue: "Unlink",
                    })}
                  </span>
                </button>
              </div>
            )}

            <div className="border-t border-border pt-4 mt-4">
              <h4 className="text-sm font-semibold text-foreground mb-3">
                {t("tvtime.settings.title", {
                  defaultValue: "Sync Settings",
                })}
              </h4>
              <p className="text-xs text-muted-foreground mb-4">
                {t("tvtime.settings.description", {
                  defaultValue:
                    "Mark media as rewatched only if it has been synced before.",
                })}
              </p>

              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="mt-0.5">
                    <CustomCheckbox
                      checked={markMoviesAsRewatched}
                      onChange={() =>
                        setMarkMoviesAsRewatched(!markMoviesAsRewatched)
                      }
                      ariaLabel={t("tvtime.settings.markMoviesAsRewatched", {
                        defaultValue: "Mark movies as rewatched",
                      })}
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground/90">
                      {t("tvtime.settings.markMoviesAsRewatched", {
                        defaultValue: "Mark movies as rewatched",
                      })}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("tvtime.settings.markMoviesAsRewatchedDescription", {
                        defaultValue:
                          "When enabled, movies that have been synced before will be marked as rewatches in TVTime.",
                      })}
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="mt-0.5">
                    <CustomCheckbox
                      checked={markEpisodesAsRewatched}
                      onChange={() =>
                        setMarkEpisodesAsRewatched(!markEpisodesAsRewatched)
                      }
                      ariaLabel={t("tvtime.settings.markEpisodesAsRewatched", {
                        defaultValue: "Mark episodes as rewatched",
                      })}
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground/90">
                      {t("tvtime.settings.markEpisodesAsRewatched", {
                        defaultValue: "Mark episodes as rewatched",
                      })}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("tvtime.settings.markEpisodesAsRewatchedDescription", {
                        defaultValue:
                          "When enabled, episodes that have been synced before will be marked as rewatches in TVTime.",
                      })}
                    </p>
                  </div>
                </label>
              </div>

              {hasSettingsChanges && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingSettings ? (
                      <>
                        <Spinner size="md" variant="onPrimary" />
                        <span>
                          {t("common.saving", { defaultValue: "Saving..." })}
                        </span>
                      </>
                    ) : (
                      <>
                        <FaCheckCircle className="w-4 h-4" />
                        <span>
                          {t("common.save", { defaultValue: "Save" })}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1.5">
                  {t("tvtime.email", { defaultValue: "Email" })}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                  placeholder={t("tvtime.emailPlaceholder", {
                    defaultValue: "Enter your TVTime email",
                  })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1.5">
                  {t("tvtime.password", { defaultValue: "Password" })}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                  placeholder={t("tvtime.passwordPlaceholder", {
                    defaultValue: "Enter your TVTime password",
                  })}
                />
              </div>
            </div>

            <button
              onClick={handleLinkTVTime}
              disabled={saving || !email || !password}
              className="w-full px-3 py-2 text-sm font-medium bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving
                ? t("common.loading", { defaultValue: "Loading..." })
                : t("tvtime.link", {
                    defaultValue: "Link TVTime Account",
                  })}
            </button>

            {linkProgress && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
                <p className="mb-3 text-xs font-medium text-primary">
                  {t("tvtime.progress.title", {
                    defaultValue: "Linking your account...",
                  })}
                </p>
                <div className="space-y-2.5">
                  {linkProgress.steps.map((step, index) => (
                    <div
                      key={index}
                      className={`flex items-center gap-3 ${
                        index < linkProgress.currentStep
                          ? "text-green-600 dark:text-green-400"
                          : index === linkProgress.currentStep
                            ? "font-medium text-primary"
                            : "text-muted-foreground/70"
                      }`}
                    >
                      <div className="shrink-0">
                        {index < linkProgress.currentStep ? (
                          <FaCheckCircle className="w-4 h-4" />
                        ) : index === linkProgress.currentStep ? (
                          <Spinner size="md" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted"></div>
                        )}
                      </div>
                      <span className="text-xs">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border-l-4 border-red-400 dark:border-red-600 p-4 rounded">
          <div className="flex">
            <div className="shrink-0">
              <FaTimesCircle className="h-5 w-5 text-red-400 dark:text-red-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Trakt Integration */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <img
              src="/logos/trakt.svg"
              alt="Trakt"
              className="w-8 h-8 object-contain shrink-0"
              onError={(e) => {
                // Fallback if logo doesn't exist
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-foreground">Trakt</h3>
              <p className="text-xs text-muted-foreground wrap-break-word">
                {t("trakt.description", {
                  defaultValue:
                    "Sync your watched movies and episodes to Trakt. Uses OAuth for secure authentication.",
                })}
              </p>
            </div>
          </div>
          {traktStatus?.linked && (
            <div className="hidden sm:flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <FaCheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">
                  {t("profile.linkedAccounts.linked", {
                    defaultValue: "Linked",
                  })}
                </span>
              </div>
              <button
                onClick={handleUnlinkTrakt}
                disabled={traktSaving}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={t("trakt.unlink", {
                  defaultValue: "Unlink",
                })}
              >
                <FaUnlink className="w-3.5 h-3.5" />
                <span>
                  {t("trakt.unlink", {
                    defaultValue: "Unlink",
                  })}
                </span>
              </button>
            </div>
          )}
        </div>

        {traktStatus?.linked ? (
          <div className="pt-3 border-t border-border">
            <div className="flex items-start gap-4">
              {traktStatus.image && (
                <img
                  src={traktStatus.image}
                  alt="Profile"
                  className="w-16 h-16 rounded-full shrink-0"
                />
              )}
              <div className="flex-1 space-y-2">
                {traktStatus.username && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">
                      {t("trakt.profile.username", {
                        defaultValue: "Username",
                      })}
                    </p>
                    <p className="text-sm text-foreground">
                      {traktStatus.username}
                    </p>
                  </div>
                )}
              </div>
            </div>
            {traktStatus?.linked && (
              <div className="flex sm:hidden items-center gap-3 pt-3 mt-3 border-t border-border">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <FaCheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    {t("profile.linkedAccounts.linked", {
                      defaultValue: "Linked",
                    })}
                  </span>
                </div>
                <button
                  onClick={handleUnlinkTrakt}
                  disabled={traktSaving}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t("trakt.unlink", {
                    defaultValue: "Unlink",
                  })}
                >
                  <FaUnlink className="w-3.5 h-3.5" />
                  <span>
                    {t("trakt.unlink", {
                      defaultValue: "Unlink",
                    })}
                  </span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("trakt.docsHint", {
                defaultValue: "See the",
              })}{" "}
              <a
                href={TRAKT_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-600 dark:text-purple-400 hover:underline font-medium"
              >
                {t("trakt.docsLink", {
                  defaultValue: "documentation",
                })}
              </a>{" "}
              {t("trakt.docsHintSuffix", {
                defaultValue: "to learn how to link your Trakt account.",
              })}
            </p>
            {traktError && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <FaTimesCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-800 dark:text-red-200 mb-2">
                      {traktError}
                    </p>
                    {traktAuthUrl && (
                      <a
                        href={traktAuthUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-red-800 dark:text-red-200 underline hover:text-red-900 dark:hover:text-red-100 break-all"
                      >
                        {traktAuthUrl}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {!traktStatus?.hasCredentials && (
                <div className="space-y-3 border-b border-border pb-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground/90 mb-1.5">
                      {t("trakt.clientId", { defaultValue: "Client ID" })}
                    </label>
                    <input
                      type="text"
                      value={traktClientId}
                      onChange={(e) => setTraktClientId(e.target.value)}
                      placeholder={t("trakt.clientIdPlaceholder", {
                        defaultValue: "Enter your Trakt Client ID",
                      })}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground/90 mb-1.5">
                      {t("trakt.clientSecret", {
                        defaultValue: "Client Secret",
                      })}
                    </label>
                    <div className="relative">
                      <input
                        type={showTraktSecret ? "text" : "password"}
                        value={traktClientSecret}
                        onChange={(e) => setTraktClientSecret(e.target.value)}
                        placeholder={t("trakt.clientSecretPlaceholder", {
                          defaultValue: "Enter your Trakt Client Secret",
                        })}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTraktSecret(!showTraktSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                        aria-label={
                          showTraktSecret
                            ? t("auth.hidePassword", { defaultValue: "Hide" })
                            : t("auth.showPassword", { defaultValue: "Show" })
                        }
                      >
                        {showTraktSecret ? (
                          <FaEyeSlash className="w-5 h-5" />
                        ) : (
                          <FaEye className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm text-foreground/90">
                  {t("trakt.oauthInstructions", {
                    defaultValue:
                      "Click 'Authorize' to open Trakt in a new window. After authorizing, you'll receive an authorization code. Paste it below to complete the linking process.",
                  })}
                </p>
                <button
                  onClick={handleGetTraktAuthUrl}
                  disabled={
                    traktSaving ||
                    traktLoading ||
                    (!traktStatus?.hasCredentials &&
                      (!traktClientId.trim() || !traktClientSecret.trim()))
                  }
                  className="w-full sm:w-auto px-3 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("trakt.authorize", { defaultValue: "Authorize" })}
                </button>
              </div>

              {traktAuthUrl && (
                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1.5">
                    {t("trakt.authorizationCode", {
                      defaultValue: "Authorization Code",
                    })}
                  </label>
                  <input
                    type="text"
                    value={traktCode}
                    onChange={(e) => setTraktCode(e.target.value)}
                    placeholder={t("trakt.codePlaceholder", {
                      defaultValue: "Paste the authorization code here",
                    })}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                  <button
                    onClick={handleLinkTrakt}
                    disabled={
                      traktSaving ||
                      !traktCode.trim() ||
                      (!traktStatus?.hasCredentials &&
                        (!traktClientId.trim() || !traktClientSecret.trim()))
                    }
                    className="mt-2 w-full sm:w-auto px-3 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {traktSaving
                      ? t("common.loading", { defaultValue: "Linking..." })
                      : t("trakt.link", { defaultValue: "Link Account" })}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={showTraktUnlinkModal}
        onOpenChange={setShowTraktUnlinkModal}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>
            {t("trakt.unlinkTitle", {
              defaultValue: "Unlink Trakt Account",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("trakt.unlinkMessage", {
              defaultValue:
                "Are you sure you want to unlink your Trakt account? This will stop syncing to Trakt.",
            })}
          </DialogDescription>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowTraktUnlinkModal(false)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {t("trakt.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              onClick={confirmUnlinkTrakt}
              disabled={traktSaving}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {traktSaving
                ? t("common.loading", { defaultValue: "Loading..." })
                : t("trakt.confirm", { defaultValue: "Confirm" })}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showUnlinkModal} onOpenChange={setShowUnlinkModal}>
        <DialogContent className="max-w-md">
          <DialogTitle>
            {t("tvtime.unlinkConfirmTitle", {
              defaultValue: "Unlink TVTime Account",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("tvtime.unlinkConfirmMessage", {
              defaultValue:
                "Are you sure you want to unlink your TVTime account? This will stop syncing to TVTime.",
            })}
          </DialogDescription>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowUnlinkModal(false)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {t("tvtime.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              onClick={confirmUnlinkTVTime}
              disabled={saving}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? t("common.loading", { defaultValue: "Loading..." })
                : t("tvtime.confirm", { defaultValue: "Confirm" })}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
