import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  FaCheckCircle,
  FaTimesCircle,
  FaUnlink,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";
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
} from "@services/api";
import { CustomCheckbox } from "@components/ui/CustomCheckbox";
import { updateProfile } from "@services/api";
import { showSuccess, showError } from "@utils/toast";
import { OAuthPopup } from "@utils/OAuthPopup";

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

  const loadTVTimeProfile = useCallback(async (status: TVTimeStatus) => {
    if (!status.linked) {
      setTVTimeProfile(null);
      return;
    }

    try {
      setLoadingProfile(true);
      const profile = await getTVTimeProfile();
      setTVTimeProfile(profile);
    } catch {
      setTVTimeProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  }, []);

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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 dark:text-slate-400 text-gray-600">
          {t("common.loading", { defaultValue: "Loading..." })}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
          {t("profile.integrations.title", {
            defaultValue: "Integrations",
          })}
        </h2>
        <p className="text-sm dark:text-slate-400 text-gray-600 mb-4">
          {t("profile.integrations.description", {
            defaultValue:
              "Connect your syncing service accounts to automatically sync your watched episodes.",
          })}
        </p>
      </div>

      <div className="border dark:border-[#2d2d2d] border-gray-200 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <img
              src="/logos/tvtime.png"
              alt="TVTime"
              className="w-8 h-8 object-contain flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                TVTime
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 break-words">
                {t("tvtime.description", {
                  defaultValue:
                    "Sync your watched episodes automatically. Your credentials are stored securely.",
                })}
              </p>
            </div>
          </div>
          {tvtimeStatus?.linked && (
            <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
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
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm dark:text-slate-400 text-gray-600">
                  {t("common.loading", {
                    defaultValue: "Loading profile...",
                  })}
                </span>
              </div>
            ) : tvtimeProfile ? (
              <div className="pt-3 border-t dark:border-[#2d2d2d] border-gray-200">
                <div className="flex items-start gap-4">
                  {tvtimeProfile.image && (
                    <img
                      src={tvtimeProfile.image}
                      alt="Profile"
                      className="w-16 h-16 rounded-full flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 space-y-2">
                    {tvtimeProfile.username && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-0.5">
                          {t("tvtime.profile.username", {
                            defaultValue: "Username",
                          })}
                        </p>
                        <p className="text-sm text-gray-900 dark:text-white">
                          {tvtimeProfile.username}
                        </p>
                      </div>
                    )}
                    {tvtimeProfile.email && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-0.5">
                          {t("tvtime.profile.email", {
                            defaultValue: "Email",
                          })}
                        </p>
                        <p className="text-sm text-gray-900 dark:text-white">
                          {tvtimeProfile.email}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-3 border-t dark:border-[#2d2d2d] border-gray-200">
                <p className="text-sm text-gray-900 dark:text-white">
                  {tvtimeStatus.email}
                </p>
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

            <div className="border-t dark:border-[#2d2d2d] border-gray-200 pt-4 mt-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                {t("tvtime.settings.title", {
                  defaultValue: "Sync Settings",
                })}
              </h4>
              <p className="text-xs dark:text-slate-400 text-gray-600 mb-4">
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
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium dark:text-slate-300 text-gray-700">
                      {t("tvtime.settings.markMoviesAsRewatched", {
                        defaultValue: "Mark movies as rewatched",
                      })}
                    </div>
                    <p className="text-xs dark:text-slate-400 text-gray-500 mt-1">
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
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium dark:text-slate-300 text-gray-700">
                      {t("tvtime.settings.markEpisodesAsRewatched", {
                        defaultValue: "Mark episodes as rewatched",
                      })}
                    </div>
                    <p className="text-xs dark:text-slate-400 text-gray-500 mt-1">
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
                    className="flex items-center gap-2 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors text-sm"
                  >
                    {savingSettings ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
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
                <label className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1.5">
                  {t("tvtime.email", { defaultValue: "Email" })}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border dark:border-[#1e1e1e] border-gray-300 rounded-lg dark:bg-[#1e1e1e] dark:text-white bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder={t("tvtime.emailPlaceholder", {
                    defaultValue: "Enter your TVTime email",
                  })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1.5">
                  {t("tvtime.password", { defaultValue: "Password" })}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border dark:border-[#1e1e1e] border-gray-300 rounded-lg dark:bg-[#1e1e1e] dark:text-white bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-3">
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
                            ? "text-blue-600 dark:text-blue-400 font-medium"
                            : "text-gray-400 dark:text-slate-500"
                      }`}
                    >
                      <div className="flex-shrink-0">
                        {index < linkProgress.currentStep ? (
                          <FaCheckCircle className="w-4 h-4" />
                        ) : index === linkProgress.currentStep ? (
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <div className="w-4 h-4 border-2 dark:border-[#1e1e1e] border-gray-300 rounded-full"></div>
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
            <div className="flex-shrink-0">
              <FaTimesCircle className="h-5 w-5 text-red-400 dark:text-red-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Trakt Integration */}
      <div className="border dark:border-[#2d2d2d] border-gray-200 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <img
              src="/logos/trakt.svg"
              alt="Trakt"
              className="w-8 h-8 object-contain flex-shrink-0"
              onError={(e) => {
                // Fallback if logo doesn't exist
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Trakt
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 break-words">
                {t("trakt.description", {
                  defaultValue:
                    "Sync your watched movies and episodes to Trakt. Uses OAuth for secure authentication.",
                })}
              </p>
            </div>
          </div>
          {traktStatus?.linked && (
            <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
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
          <div className="pt-3 border-t dark:border-[#2d2d2d] border-gray-200">
            <div className="flex items-start gap-4">
              {traktStatus.image && (
                <img
                  src={traktStatus.image}
                  alt="Profile"
                  className="w-16 h-16 rounded-full flex-shrink-0"
                />
              )}
              <div className="flex-1 space-y-2">
                {traktStatus.username && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-0.5">
                      {t("trakt.profile.username", {
                        defaultValue: "Username",
                      })}
                    </p>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {traktStatus.username}
                    </p>
                  </div>
                )}
              </div>
            </div>
            {traktStatus?.linked && (
              <div className="flex sm:hidden items-center gap-3 pt-3 mt-3 border-t dark:border-[#2d2d2d] border-gray-200">
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
            {traktError && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <FaTimesCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
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
                <div className="space-y-3 border-b dark:border-[#2d2d2d] border-gray-200 pb-4">
                  <div>
                    <label className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1.5">
                      {t("trakt.clientId", { defaultValue: "Client ID" })}
                    </label>
                    <input
                      type="text"
                      value={traktClientId}
                      onChange={(e) => setTraktClientId(e.target.value)}
                      placeholder={t("trakt.clientIdPlaceholder", {
                        defaultValue: "Enter your Trakt Client ID",
                      })}
                      className="w-full px-3 py-2 border dark:border-[#1e1e1e] border-gray-300 rounded-lg dark:bg-[#1e1e1e] dark:text-white bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1.5">
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
                        className="w-full px-3 py-2 pr-10 border dark:border-[#1e1e1e] border-gray-300 rounded-lg dark:bg-[#1e1e1e] dark:text-white bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTraktSecret(!showTraktSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 focus:outline-none"
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
                <p className="text-sm dark:text-slate-300 text-gray-700 mb-2">
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
                  <label className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1.5">
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
                    className="w-full px-3 py-2 border dark:border-[#1e1e1e] border-gray-300 rounded-lg dark:bg-[#1e1e1e] dark:text-white bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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

      {showTraktUnlinkModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowTraktUnlinkModal(false)}
        >
          <div
            className="dark:bg-[#121212] bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-lg font-medium dark:text-white text-gray-900 mb-4">
                {t("trakt.unlinkTitle", {
                  defaultValue: "Unlink Trakt Account",
                })}
              </h3>
              <p className="text-sm dark:text-slate-400 text-gray-500 mb-6">
                {t("trakt.unlinkMessage", {
                  defaultValue:
                    "Are you sure you want to unlink your Trakt account? This will stop syncing to Trakt.",
                })}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowTraktUnlinkModal(false)}
                  className="px-3 py-2 text-sm font-medium dark:text-slate-300 text-gray-700 dark:bg-[#121212] bg-white border dark:border-[#1e1e1e] border-gray-300 rounded-lg hover:dark:bg-[#1e1e1e] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {t("trakt.cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  onClick={confirmUnlinkTrakt}
                  disabled={traktSaving}
                  className="px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {traktSaving
                    ? t("common.loading", { defaultValue: "Loading..." })
                    : t("trakt.confirm", { defaultValue: "Confirm" })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUnlinkModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowUnlinkModal(false)}
        >
          <div
            className="dark:bg-[#121212] bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-2">
                {t("tvtime.unlinkConfirmTitle", {
                  defaultValue: "Unlink TVTime Account",
                })}
              </h3>
              <p className="text-sm dark:text-slate-400 text-gray-600 mb-6">
                {t("tvtime.unlinkConfirmMessage", {
                  defaultValue:
                    "This will remove your TVTime account connection and all associated data. You will need to link your account again to sync watched episodes.",
                })}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowUnlinkModal(false)}
                  className="px-3 py-2 text-sm font-medium dark:text-slate-300 text-gray-700 dark:bg-[#121212] bg-white border dark:border-[#1e1e1e] border-gray-300 rounded-lg hover:dark:bg-[#1e1e1e] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {t("tvtime.cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  onClick={confirmUnlinkTVTime}
                  disabled={saving}
                  className="px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving
                    ? t("common.loading", { defaultValue: "Loading..." })
                    : t("tvtime.confirm", { defaultValue: "Confirm" })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
