import { CollapsibleSettingsCard } from "@components/settings/CollapsibleSettingsCard";
import { CustomCheckbox } from "@components/ui/CustomCheckbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@components/ui/dialog";
import { Spinner } from "@components/ui/spinner";
import { useAuth } from "@contexts/AuthContext";
import {
  getTraktStatus,
  getTraktAuthorizeUrl,
  linkTrakt,
  unlinkTrakt,
  type TraktStatus,
  getSimklStatus,
  getSimklAuthorizeUrl,
  linkSimkl,
  unlinkSimkl,
  type SimklStatus,
  getBingersStatus,
  linkBingers,
  unlinkBingers,
  updateBingersSettings,
  BINGERS_MOBILE_SIGNIN_URL,
  type BingersStatus,
} from "@services/api";
import { OAuthPopup } from "@utils/OAuthPopup";
import { showSuccess } from "@utils/toast";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimesCircle,
  FaUnlink,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";

const DOCS_URL =
  (import.meta as { env?: { VITE_DOCS_URL?: string } }).env?.VITE_DOCS_URL ||
  "https://0xsysr3ll.github.io/scroblarr/docs";
const TRAKT_DOCS_URL = `${DOCS_URL}/configuration/trakt`;
const SIMKL_DOCS_URL = `${DOCS_URL}/configuration/simkl`;

function simklReconnectDismissKey(userId: string): string {
  return `simkl-reconnect-dismissed:${userId}`;
}

function isPinAuthPendingMessage(message: string): boolean {
  return /authorization pending/i.test(message);
}

function isPinAuthSlowDownMessage(message: string): boolean {
  return /slow down/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function IntegrationErrorBanner({
  message,
  detail,
}: {
  message: string;
  detail?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
      <div className="flex items-start gap-2">
        <FaTimesCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        {detail ? (
          <div className="flex-1">
            <p className="mb-2 text-sm text-destructive">{message}</p>
            {detail}
          </div>
        ) : (
          <p className="text-sm text-destructive">{message}</p>
        )}
      </div>
    </div>
  );
}

function LinkedStatusBadge({
  warning,
  warningLabel,
  linkedLabel,
}: {
  warning?: boolean;
  warningLabel: string;
  linkedLabel: string;
}) {
  if (warning) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-warning-600 dark:text-warning-400">
        <FaExclamationTriangle className="h-4 w-4" />
        {warningLabel}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success-600 dark:text-success-400">
      <FaCheckCircle className="h-4 w-4" />
      {linkedLabel}
    </span>
  );
}

function SimklPinPanel({
  code,
  authUrl,
  pinMessage,
  pinPolling,
  saving,
  onCheck,
}: {
  code: string;
  authUrl: string;
  pinMessage: string | null;
  pinPolling: boolean;
  saving: boolean;
  onCheck: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
            {t("simkl.authorizationCode", {
              defaultValue: "PIN Code",
            })}
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.25em] text-foreground">
            {code}
          </p>
        </div>
        <a
          href={authUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit cursor-pointer items-center rounded-md border border-emerald-300 bg-background px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
        >
          {t("simkl.openPinPage", {
            defaultValue: "Open Simkl PIN page",
          })}
        </a>
      </div>
      {pinMessage && (
        <div className="mt-3 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-200">
          {pinPolling && <Spinner size="sm" />}
          <span>{pinMessage}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onCheck}
        disabled={saving || !code.trim()}
        className="mt-3 w-full cursor-pointer rounded-md border border-emerald-300 bg-background px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
      >
        {saving
          ? t("simkl.checkingPin", {
              defaultValue: "Checking...",
            })
          : t("simkl.checkPin", {
              defaultValue: "Check approval now",
            })}
      </button>
    </div>
  );
}

type PinPollResult = "linked" | "pending" | "slow_down" | "failed";

interface IntegrationsTabProps {
  onProfileUpdated?: () => void;
}

export function IntegrationsTab({ onProfileUpdated }: IntegrationsTabProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [traktStatus, setTraktStatus] = useState<TraktStatus | null>(null);
  const [traktLoading, setTraktLoading] = useState(true);
  const [traktSaving, setTraktSaving] = useState(false);
  const [traktError, setTraktError] = useState<string | null>(null);
  const [traktCode, setTraktCode] = useState("");
  const [traktClientId, setTraktClientId] = useState("");
  const [traktClientSecret, setTraktClientSecret] = useState("");
  const [showTraktSecret, setShowTraktSecret] = useState(false);
  const [traktAuthUrl, setTraktAuthUrl] = useState<string | null>(null);
  const [traktPinPolling, setTraktPinPolling] = useState(false);
  const [traktPinMessage, setTraktPinMessage] = useState<string | null>(null);
  const [showTraktUnlinkModal, setShowTraktUnlinkModal] = useState(false);
  const [traktOAuthPopup] = useState(() => new OAuthPopup());
  const [simklStatus, setSimklStatus] = useState<SimklStatus | null>(null);
  const [simklLoading, setSimklLoading] = useState(true);
  const [simklSaving, setSimklSaving] = useState(false);
  const [simklError, setSimklError] = useState<string | null>(null);
  const [simklCode, setSimklCode] = useState("");
  const [simklAuthUrl, setSimklAuthUrl] = useState<string | null>(null);
  const [simklPinPolling, setSimklPinPolling] = useState(false);
  const [simklPinMessage, setSimklPinMessage] = useState<string | null>(null);
  const [simklReconnectDismissed, setSimklReconnectDismissed] = useState(false);
  const [showSimklUnlinkModal, setShowSimklUnlinkModal] = useState(false);
  const [simklOAuthPopup] = useState(() => new OAuthPopup());
  const [bingersStatus, setBingersStatus] = useState<BingersStatus | null>(
    null
  );
  const [bingersLoading, setBingersLoading] = useState(true);
  const [bingersSaving, setBingersSaving] = useState(false);
  const [bingersError, setBingersError] = useState<string | null>(null);
  const [bingersMagicLink, setBingersMagicLink] = useState("");
  const [showBingersUnlinkModal, setShowBingersUnlinkModal] = useState(false);
  const [bingersOAuthPopup] = useState(() => new OAuthPopup());
  const [bingersMarkMoviesAsRewatched, setBingersMarkMoviesAsRewatched] =
    useState(false);
  const [bingersMarkEpisodesAsRewatched, setBingersMarkEpisodesAsRewatched] =
    useState(false);
  const [
    bingersSavedMarkMoviesAsRewatched,
    setBingersSavedMarkMoviesAsRewatched,
  ] = useState(false);
  const [
    bingersSavedMarkEpisodesAsRewatched,
    setBingersSavedMarkEpisodesAsRewatched,
  ] = useState(false);
  const [bingersSavingSettings, setBingersSavingSettings] = useState(false);
  const traktPinPollIdRef = useRef(0);
  const simklPinPollIdRef = useRef(0);
  const bingersStatusRequestIdRef = useRef(0);

  useEffect(() => {
    async function loadTraktStatus() {
      try {
        setTraktLoading(true);
        const status = await getTraktStatus({ force: true });
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
    async function loadSimklStatus() {
      try {
        setSimklLoading(true);
        const status = await getSimklStatus();
        setSimklStatus(status);
      } catch {
        // Error handled by UI state
      } finally {
        setSimklLoading(false);
      }
    }

    loadSimklStatus();
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setSimklReconnectDismissed(false);
      return;
    }
    setSimklReconnectDismissed(
      localStorage.getItem(simklReconnectDismissKey(user.id)) === "1"
    );
  }, [user?.id]);

  useEffect(() => {
    const requestId = ++bingersStatusRequestIdRef.current;

    async function loadBingersStatus() {
      try {
        setBingersLoading(true);
        const status = await getBingersStatus({ force: true });
        if (requestId !== bingersStatusRequestIdRef.current) {
          return;
        }
        setBingersStatus(status);
        applyBingersRewatchSettings(status);
        setBingersError(null);
      } catch {
        if (requestId !== bingersStatusRequestIdRef.current) {
          return;
        }
        setBingersError(
          t("bingers.statusLoadFailed", {
            defaultValue: "Failed to load Bingers status",
          })
        );
      } finally {
        setBingersLoading(false);
      }
    }

    loadBingersStatus();

    return () => {
      bingersStatusRequestIdRef.current += 1;
    };
  }, []);

  function applyBingersRewatchSettings(status: BingersStatus) {
    const movies = !!status.markMoviesAsRewatched;
    const episodes = !!status.markEpisodesAsRewatched;
    setBingersMarkMoviesAsRewatched(movies);
    setBingersMarkEpisodesAsRewatched(episodes);
    setBingersSavedMarkMoviesAsRewatched(movies);
    setBingersSavedMarkEpisodesAsRewatched(episodes);
  }

  const bingersHasSettingsChanges =
    bingersMarkMoviesAsRewatched !== bingersSavedMarkMoviesAsRewatched ||
    bingersMarkEpisodesAsRewatched !== bingersSavedMarkEpisodesAsRewatched;

  async function handleSaveBingersSettings() {
    try {
      setBingersSavingSettings(true);
      setBingersError(null);
      const updated = await updateBingersSettings({
        markMoviesAsRewatched: bingersMarkMoviesAsRewatched,
        markEpisodesAsRewatched: bingersMarkEpisodesAsRewatched,
      });
      setBingersSavedMarkMoviesAsRewatched(updated.markMoviesAsRewatched);
      setBingersSavedMarkEpisodesAsRewatched(updated.markEpisodesAsRewatched);
      setBingersMarkMoviesAsRewatched(updated.markMoviesAsRewatched);
      setBingersMarkEpisodesAsRewatched(updated.markEpisodesAsRewatched);
      showSuccess(
        t("profile.saved", { defaultValue: "Settings saved successfully!" })
      );
      onProfileUpdated?.();
    } catch (err) {
      setBingersError(
        err instanceof Error
          ? err.message
          : t("bingers.settingsSaveFailed", {
              defaultValue: "Failed to save Bingers settings",
            })
      );
    } finally {
      setBingersSavingSettings(false);
    }
  }

  useEffect(() => {
    return () => {
      traktPinPollIdRef.current += 1;
      traktOAuthPopup.closePopup();
    };
  }, [traktOAuthPopup]);

  useEffect(() => {
    return () => {
      simklPinPollIdRef.current += 1;
      simklOAuthPopup.closePopup();
    };
  }, [simklOAuthPopup]);

  useEffect(() => {
    return () => {
      bingersOAuthPopup.closePopup();
    };
  }, [bingersOAuthPopup]);

  async function completeTraktLink(
    userCode: string,
    clientId: string | undefined,
    clientSecret: string | undefined,
    showPendingError = true
  ): Promise<PinPollResult> {
    let result: PinPollResult = "failed";
    try {
      if (showPendingError) {
        setTraktSaving(true);
      }
      setTraktError(null);
      await linkTrakt(userCode.trim(), clientId, clientSecret);
      traktPinPollIdRef.current += 1;
      setTraktPinPolling(false);
      setTraktPinMessage(null);
      setTraktCode("");
      setTraktClientId("");
      setTraktClientSecret("");
      setTraktAuthUrl(null);
      traktOAuthPopup.closePopup();
      const status = await getTraktStatus({ force: true });
      setTraktStatus(status);
      showSuccess(
        t("trakt.linked", {
          defaultValue: "Trakt account linked successfully",
        })
      );
      onProfileUpdated?.();
      result = "linked";
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : t("trakt.linkFailed", {
              defaultValue: "Failed to link Trakt account",
            });
      if (!showPendingError && isPinAuthSlowDownMessage(errorMessage)) {
        result = "slow_down";
      } else if (!showPendingError && isPinAuthPendingMessage(errorMessage)) {
        result = "pending";
      } else {
        setTraktError(errorMessage);
        if (!showPendingError) {
          setTraktPinPolling(false);
          setTraktPinMessage(null);
        }
        result = "failed";
      }
    }
    if (showPendingError) {
      setTraktSaving(false);
    }
    return result;
  }

  async function startTraktPinPolling(
    userCode: string,
    clientId: string | undefined,
    clientSecret: string | undefined,
    interval: number,
    expiresIn: number,
    pollId: number
  ): Promise<void> {
    let intervalMs = Math.max(interval, 5) * 1000;
    const expiresAt = Date.now() + expiresIn * 1000;

    setTraktPinPolling(true);
    setTraktPinMessage(
      t("trakt.pinWaiting", {
        defaultValue: "Waiting for approval on Trakt...",
      })
    );

    while (Date.now() < expiresAt && pollId === traktPinPollIdRef.current) {
      await sleep(intervalMs);
      if (pollId !== traktPinPollIdRef.current) {
        return;
      }

      const result = await completeTraktLink(
        userCode,
        clientId,
        clientSecret,
        false
      );
      if (result === "linked" || result === "failed") {
        return;
      }
      if (result === "slow_down") {
        intervalMs += 5000;
      }
    }

    if (pollId === traktPinPollIdRef.current) {
      setTraktPinPolling(false);
      setTraktPinMessage(
        t("trakt.pinExpired", {
          defaultValue:
            "The Trakt PIN expired. Generate a new one to try again.",
        })
      );
    }
  }

  async function completeSimklLink(
    userCode: string,
    showPendingError = true
  ): Promise<PinPollResult> {
    let result: PinPollResult = "failed";
    try {
      if (showPendingError) {
        setSimklSaving(true);
      }
      setSimklError(null);
      await linkSimkl(userCode.trim());
      simklPinPollIdRef.current += 1;
      setSimklPinPolling(false);
      setSimklPinMessage(null);
      setSimklCode("");
      setSimklAuthUrl(null);
      simklOAuthPopup.closePopup();
      if (user?.id) {
        localStorage.removeItem(simklReconnectDismissKey(user.id));
        setSimklReconnectDismissed(false);
      }
      const status = await getSimklStatus();
      setSimklStatus(status);
      showSuccess(
        t("simkl.linked", {
          defaultValue: "Simkl account linked successfully",
        })
      );
      onProfileUpdated?.();
      result = "linked";
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : t("simkl.linkFailed", {
              defaultValue: "Failed to link Simkl account",
            });
      if (!showPendingError && isPinAuthSlowDownMessage(errorMessage)) {
        result = "slow_down";
      } else if (!showPendingError && isPinAuthPendingMessage(errorMessage)) {
        result = "pending";
      } else {
        setSimklError(errorMessage);
        if (!showPendingError) {
          setSimklPinPolling(false);
          setSimklPinMessage(null);
        }
        result = "failed";
      }
    }
    if (showPendingError) {
      setSimklSaving(false);
    }
    return result;
  }

  async function startSimklPinPolling(
    userCode: string,
    interval: number,
    expiresIn: number,
    pollId: number
  ): Promise<void> {
    let intervalMs = Math.max(interval, 5) * 1000;
    const expiresAt = Date.now() + expiresIn * 1000;

    setSimklPinPolling(true);
    setSimklPinMessage(
      t("simkl.pinWaiting", {
        defaultValue: "Waiting for approval on Simkl...",
      })
    );

    while (Date.now() < expiresAt && pollId === simklPinPollIdRef.current) {
      await sleep(intervalMs);
      if (pollId !== simklPinPollIdRef.current) {
        return;
      }

      const result = await completeSimklLink(userCode, false);
      if (result === "linked" || result === "failed") {
        return;
      }
      if (result === "slow_down") {
        intervalMs += 5000;
      }
    }

    if (pollId === simklPinPollIdRef.current) {
      setSimklPinPolling(false);
      setSimklPinMessage(
        t("simkl.pinExpired", {
          defaultValue:
            "The Simkl PIN expired. Generate a new one to try again.",
        })
      );
    }
  }

  async function handleGetTraktAuthUrl() {
    setTraktError(null);
    setTraktPinMessage(null);
    setTraktSaving(true);
    setTraktPinPolling(false);
    const pollId = traktPinPollIdRef.current + 1;
    traktPinPollIdRef.current = pollId;

    try {
      traktOAuthPopup.preparePopup("Trakt Auth");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to open authentication window. Please allow popups and try again.";
      setTraktError(errorMessage);
      setTraktSaving(false);
      return;
    }

    setTimeout(async () => {
      try {
        const clientId = traktClientId.trim() || undefined;
        const clientSecret = traktClientSecret.trim() || undefined;

        const response = await getTraktAuthorizeUrl(clientId, clientSecret);
        if (pollId !== traktPinPollIdRef.current) {
          return;
        }

        setTraktCode(response.userCode);
        setTraktAuthUrl(response.verificationUrl);

        traktOAuthPopup.navigateToUrl(response.verificationUrl);
        void startTraktPinPolling(
          response.userCode,
          clientId,
          clientSecret,
          response.interval,
          response.expiresIn,
          pollId
        );
      } catch (err) {
        if (pollId !== traktPinPollIdRef.current) {
          return;
        }
        traktOAuthPopup.closePopup();
        setTraktError(
          err instanceof Error
            ? err.message
            : t("trakt.getAuthUrlFailed", {
                defaultValue: "Failed to get Trakt PIN code",
              })
        );
      } finally {
        if (pollId === traktPinPollIdRef.current) {
          setTraktSaving(false);
        }
      }
    }, 1500);
  }

  async function handleLinkTrakt() {
    const clientId = traktClientId.trim() || undefined;
    const clientSecret = traktClientSecret.trim() || undefined;
    await completeTraktLink(traktCode.trim(), clientId, clientSecret);
  }

  async function handleUnlinkTrakt() {
    setShowTraktUnlinkModal(true);
  }

  async function confirmUnlinkTrakt() {
    setShowTraktUnlinkModal(false);

    try {
      setTraktSaving(true);
      setTraktError(null);
      setTraktPinMessage(null);
      setTraktPinPolling(false);
      traktPinPollIdRef.current += 1;
      await unlinkTrakt();
      setTraktCode("");
      setTraktAuthUrl(null);
      setTraktClientId("");
      setTraktClientSecret("");
      const status = await getTraktStatus({ force: true });
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

  async function handleGetSimklAuthUrl() {
    setSimklError(null);
    setSimklPinMessage(null);
    setSimklSaving(true);
    setSimklPinPolling(false);
    const pollId = simklPinPollIdRef.current + 1;
    simklPinPollIdRef.current = pollId;

    try {
      simklOAuthPopup.preparePopup("Simkl Auth");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to open authentication window. Please allow popups and try again.";
      setSimklError(errorMessage);
      setSimklSaving(false);
      return;
    }

    setTimeout(async () => {
      try {
        const response = await getSimklAuthorizeUrl();
        if (pollId !== simklPinPollIdRef.current) {
          return;
        }

        setSimklCode(response.userCode);
        setSimklAuthUrl(response.verificationUrl);

        simklOAuthPopup.navigateToUrl(response.verificationUrl);
        void startSimklPinPolling(
          response.userCode,
          response.interval,
          response.expiresIn,
          pollId
        );
      } catch (err) {
        if (pollId !== simklPinPollIdRef.current) {
          return;
        }
        simklOAuthPopup.closePopup();
        setSimklError(
          err instanceof Error
            ? err.message
            : t("simkl.getAuthUrlFailed", {
                defaultValue: "Failed to get Simkl PIN code",
              })
        );
      } finally {
        if (pollId === simklPinPollIdRef.current) {
          setSimklSaving(false);
        }
      }
    }, 1500);
  }

  async function handleLinkSimkl() {
    await completeSimklLink(simklCode.trim());
  }

  function dismissSimklReconnectNote() {
    if (user?.id) {
      localStorage.setItem(simklReconnectDismissKey(user.id), "1");
    }
    setSimklReconnectDismissed(true);
  }

  async function handleUnlinkSimkl() {
    setShowSimklUnlinkModal(true);
  }

  async function confirmUnlinkSimkl() {
    setShowSimklUnlinkModal(false);

    try {
      setSimklSaving(true);
      setSimklError(null);
      setSimklPinMessage(null);
      setSimklPinPolling(false);
      simklPinPollIdRef.current += 1;
      await unlinkSimkl();
      setSimklCode("");
      setSimklAuthUrl(null);
      const status = await getSimklStatus();
      setSimklStatus(status);
      showSuccess(
        t("simkl.unlinked", {
          defaultValue: "Simkl account unlinked successfully",
        })
      );
      onProfileUpdated?.();
    } catch (err) {
      setSimklError(
        err instanceof Error
          ? err.message
          : t("simkl.unlinkFailed", {
              defaultValue: "Failed to unlink Simkl account",
            })
      );
    } finally {
      setSimklSaving(false);
    }
  }

  async function handleOpenBingersSignIn() {
    setBingersError(null);
    try {
      bingersOAuthPopup.preparePopup("Bingers Sign-in");
      bingersOAuthPopup.navigateToUrl(BINGERS_MOBILE_SIGNIN_URL);
    } catch (error) {
      bingersOAuthPopup.closePopup();
      // Avoid "noopener" in window features: browsers then return null even when
      // the tab opens. Detect a real window, then drop opener for isolation.
      const fallback = window.open(BINGERS_MOBILE_SIGNIN_URL, "_blank");
      if (fallback) {
        fallback.opener = null;
        return;
      }
      const errorMessage =
        error instanceof Error
          ? error.message
          : t("bingers.openSignInFailed", {
              defaultValue:
                "Failed to open sign-in window. Please allow popups and try again.",
            });
      setBingersError(errorMessage);
    }
  }

  async function handleLinkBingers() {
    setBingersError(null);

    try {
      setBingersSaving(true);
      await linkBingers(bingersMagicLink.trim());
      setBingersMagicLink("");
      bingersOAuthPopup.closePopup();
      const requestId = ++bingersStatusRequestIdRef.current;
      try {
        const status = await getBingersStatus({ force: true });
        if (requestId === bingersStatusRequestIdRef.current) {
          setBingersStatus(status);
          applyBingersRewatchSettings(status);
        }
      } catch {
        if (requestId === bingersStatusRequestIdRef.current) {
          const linkedStatus: BingersStatus = {
            linked: true,
            needsReauthorization: false,
            username: null,
            image: null,
            markMoviesAsRewatched: false,
            markEpisodesAsRewatched: false,
          };
          setBingersStatus(linkedStatus);
          applyBingersRewatchSettings(linkedStatus);
        }
      }
      showSuccess(
        t("bingers.linked", {
          defaultValue: "Bingers account linked successfully",
        })
      );
      onProfileUpdated?.();
    } catch (err) {
      setBingersError(
        err instanceof Error
          ? err.message
          : t("bingers.linkFailed", {
              defaultValue: "Failed to link Bingers account",
            })
      );
    } finally {
      setBingersSaving(false);
    }
  }

  async function handleUnlinkBingers() {
    setShowBingersUnlinkModal(true);
  }

  async function confirmUnlinkBingers() {
    setShowBingersUnlinkModal(false);

    try {
      setBingersSaving(true);
      setBingersError(null);
      await unlinkBingers();
      setBingersMagicLink("");
      try {
        const requestId = ++bingersStatusRequestIdRef.current;
        const status = await getBingersStatus({ force: true });
        if (requestId === bingersStatusRequestIdRef.current) {
          setBingersStatus(status);
          applyBingersRewatchSettings(status);
        }
      } catch {
        const unlinkedStatus: BingersStatus = {
          linked: false,
          needsReauthorization: false,
          username: null,
          image: null,
          markMoviesAsRewatched: false,
          markEpisodesAsRewatched: false,
        };
        setBingersStatus(unlinkedStatus);
        applyBingersRewatchSettings(unlinkedStatus);
      }
      showSuccess(
        t("bingers.unlinked", {
          defaultValue: "Bingers account unlinked successfully",
        })
      );
      onProfileUpdated?.();
    } catch (err) {
      setBingersError(
        err instanceof Error
          ? err.message
          : t("bingers.unlinkFailed", {
              defaultValue: "Failed to unlink Bingers account",
            })
      );
    } finally {
      setBingersSaving(false);
    }
  }

  if (
    traktLoading &&
    simklLoading &&
    bingersLoading &&
    !traktStatus &&
    !simklStatus &&
    !bingersStatus
  ) {
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

      {/* Trakt Integration */}
      <CollapsibleSettingsCard
        key={traktStatus?.needsReauthorization ? "trakt-reauth" : "trakt"}
        title="Trakt"
        description={t("trakt.description", {
          defaultValue:
            "Sync your watched movies and episodes to Trakt. Uses Trakt PIN authorization for secure authentication.",
        })}
        icon={
          <img
            src="/logos/trakt.svg"
            alt=""
            className="h-5 w-5 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        }
        defaultOpen={!!traktStatus?.needsReauthorization}
        headerMeta={
          traktStatus?.linked ? (
            <LinkedStatusBadge
              warning={traktStatus.needsReauthorization}
              warningLabel={t("profile.linkedAccounts.reauthRequired", {
                defaultValue: "Re-authorization required",
              })}
              linkedLabel={t("profile.linkedAccounts.linked", {
                defaultValue: "Linked",
              })}
            />
          ) : undefined
        }
      >
        {traktStatus?.linked ? (
          <div className="space-y-4">
            {traktError && <IntegrationErrorBanner message={traktError} />}
            {traktStatus.needsReauthorization && (
              <div className="flex items-start gap-2 rounded-lg border border-warning-500/30 bg-warning-500/10 px-3 py-2 text-warning-700 dark:text-warning-300">
                <FaExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm">
                  {t("trakt.needsReauthorization", {
                    defaultValue:
                      "Trakt authorization expired or was revoked. Unlink and link your account again to resume syncing.",
                  })}
                </p>
              </div>
            )}
            <div className="flex items-start gap-4">
              {traktStatus.image && (
                <img
                  src={traktStatus.image}
                  alt="Profile"
                  className="h-16 w-16 shrink-0 rounded-full"
                />
              )}
              <div className="flex-1 space-y-2">
                {traktStatus.username && (
                  <div>
                    <p className="mb-0.5 text-xs font-medium text-muted-foreground">
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
            <button
              type="button"
              onClick={handleUnlinkTrakt}
              disabled={traktSaving}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
              title={t("trakt.unlink", {
                defaultValue: "Unlink",
              })}
            >
              <FaUnlink className="h-3.5 w-3.5" />
              <span>
                {t("trakt.unlink", {
                  defaultValue: "Unlink",
                })}
              </span>
            </button>
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
                className="font-medium text-purple-600 hover:underline dark:text-purple-400"
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
              <IntegrationErrorBanner
                message={traktError}
                detail={
                  traktAuthUrl ? (
                    <a
                      href={traktAuthUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-sm text-destructive underline hover:text-destructive/80"
                    >
                      {traktAuthUrl}
                    </a>
                  ) : undefined
                }
              />
            )}

            <div className="space-y-4">
              {!traktStatus?.hasCredentials && (
                <div className="space-y-3 border-b border-border pb-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground/90">
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
                    <label className="mb-1.5 block text-sm font-medium text-foreground/90">
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
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-12 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 md:text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTraktSecret(!showTraktSecret)}
                        className="absolute right-1 top-1/2 inline-flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                        aria-label={
                          showTraktSecret
                            ? t("auth.hidePassword", { defaultValue: "Hide" })
                            : t("auth.showPassword", { defaultValue: "Show" })
                        }
                      >
                        {showTraktSecret ? (
                          <FaEyeSlash className="h-5 w-5" />
                        ) : (
                          <FaEye className="h-5 w-5" />
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
                      "Click 'Authorize' to get a Trakt PIN code, then enter that code on Trakt's activation page.",
                  })}
                </p>
                <button
                  type="button"
                  onClick={handleGetTraktAuthUrl}
                  disabled={
                    traktSaving ||
                    traktLoading ||
                    (!traktStatus?.hasCredentials &&
                      (!traktClientId.trim() || !traktClientSecret.trim()))
                  }
                  className="w-full cursor-pointer rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {t("trakt.authorize", { defaultValue: "Authorize" })}
                </button>
              </div>

              {traktAuthUrl && (
                <div
                  data-testid="trakt-auth-panel"
                  className="rounded-lg border border-purple-200 bg-purple-50/70 p-3 dark:border-purple-900 dark:bg-purple-950/30"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-purple-800 dark:text-purple-200">
                        {t("trakt.authorizationCode", {
                          defaultValue: "PIN Code",
                        })}
                      </p>
                      <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.25em] text-foreground">
                        {traktCode}
                      </p>
                    </div>
                    <a
                      href={traktAuthUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit cursor-pointer items-center rounded-md border border-purple-300 bg-background px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-950"
                    >
                      {t("trakt.openAuthPage", {
                        defaultValue: "Open Trakt activation page",
                      })}
                    </a>
                  </div>
                  {traktPinMessage && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-purple-800 dark:text-purple-200">
                      {traktPinPolling && <Spinner size="sm" />}
                      <span>{traktPinMessage}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleLinkTrakt}
                    disabled={
                      traktSaving ||
                      !traktCode.trim() ||
                      (!traktStatus?.hasCredentials &&
                        (!traktClientId.trim() || !traktClientSecret.trim()))
                    }
                    className="mt-3 w-full cursor-pointer rounded-md border border-purple-300 bg-background px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-950"
                  >
                    {traktSaving
                      ? t("trakt.checkingPin", {
                          defaultValue: "Checking...",
                        })
                      : t("trakt.checkPin", {
                          defaultValue: "Check approval now",
                        })}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </CollapsibleSettingsCard>

      {/* Simkl Integration */}
      <CollapsibleSettingsCard
        key={
          simklStatus?.linked && simklStatus.needsReconnect
            ? "simkl-reconnect"
            : "simkl"
        }
        title="Simkl"
        description={t("simkl.description", {
          defaultValue:
            "Sync your watched movies and episodes to Simkl. Uses Simkl PIN authorization for secure authentication.",
        })}
        icon={
          <img
            src="/logos/simkl.svg"
            alt=""
            className="h-5 w-5 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        }
        defaultOpen={!!(simklStatus?.linked && simklStatus.needsReconnect)}
        headerMeta={
          simklStatus?.linked ? (
            <LinkedStatusBadge
              warning={simklStatus.needsReconnect}
              warningLabel={t("simkl.reconnectRecommended", {
                defaultValue: "Reconnect recommended",
              })}
              linkedLabel={t("profile.linkedAccounts.linked", {
                defaultValue: "Linked",
              })}
            />
          ) : undefined
        }
      >
        {simklStatus?.linked ? (
          <div className="space-y-4">
            {simklError && <IntegrationErrorBanner message={simklError} />}
            {simklStatus.needsReconnect && !simklReconnectDismissed && (
              <div className="rounded-lg border border-warning-500/30 bg-warning-500/10 px-3 py-2 text-warning-700 dark:text-warning-300">
                <div className="flex items-start gap-2">
                  <FaExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <p className="text-sm">
                      {t("simkl.needsReconnect", {
                        defaultValue:
                          "Reconnect once to use Scroblarr's official Simkl app. Your existing link still works until you do.",
                      })}{" "}
                      <a
                        href={SIMKL_DOCS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:no-underline"
                      >
                        {t("simkl.learnMore", { defaultValue: "Learn more" })}
                      </a>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleGetSimklAuthUrl}
                        disabled={simklSaving || simklLoading}
                        className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("simkl.reconnect", { defaultValue: "Reconnect" })}
                      </button>
                      <button
                        type="button"
                        onClick={dismissSimklReconnectNote}
                        className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-warning-800 hover:bg-warning-500/20 dark:text-warning-200"
                      >
                        {t("simkl.dismissReconnect", {
                          defaultValue: "Dismiss",
                        })}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {simklAuthUrl && simklStatus.needsReconnect && (
              <SimklPinPanel
                code={simklCode}
                authUrl={simklAuthUrl}
                pinMessage={simklPinMessage}
                pinPolling={simklPinPolling}
                saving={simklSaving}
                onCheck={handleLinkSimkl}
              />
            )}
            <div className="flex items-start gap-4">
              {simklStatus.image && (
                <img
                  src={simklStatus.image}
                  alt="Profile"
                  className="h-16 w-16 shrink-0 rounded-full"
                />
              )}
              <div className="flex-1 space-y-2">
                {simklStatus.username && (
                  <div>
                    <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                      {t("simkl.profile.username", {
                        defaultValue: "Username",
                      })}
                    </p>
                    <p className="text-sm text-foreground">
                      {simklStatus.username}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleUnlinkSimkl}
              disabled={simklSaving}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
              title={t("simkl.unlink", {
                defaultValue: "Unlink",
              })}
            >
              <FaUnlink className="h-3.5 w-3.5" />
              <span>
                {t("simkl.unlink", {
                  defaultValue: "Unlink",
                })}
              </span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("simkl.docsHint", {
                defaultValue: "Link your Simkl account with a one-time PIN.",
              })}{" "}
              <a
                href={SIMKL_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline"
              >
                {t("simkl.learnMore", { defaultValue: "Learn more" })}
              </a>
            </p>
            {simklError && (
              <IntegrationErrorBanner
                message={simklError}
                detail={
                  simklAuthUrl ? (
                    <a
                      href={simklAuthUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-sm text-destructive underline hover:text-destructive/80"
                    >
                      {simklAuthUrl}
                    </a>
                  ) : undefined
                }
              />
            )}

            <div className="space-y-4">
              <div>
                <button
                  type="button"
                  onClick={handleGetSimklAuthUrl}
                  disabled={simklSaving || simklLoading}
                  className="w-full cursor-pointer rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {t("simkl.authorize", { defaultValue: "Authorize" })}
                </button>
              </div>

              {simklAuthUrl && (
                <SimklPinPanel
                  code={simklCode}
                  authUrl={simklAuthUrl}
                  pinMessage={simklPinMessage}
                  pinPolling={simklPinPolling}
                  saving={simklSaving}
                  onCheck={handleLinkSimkl}
                />
              )}
            </div>
          </div>
        )}
      </CollapsibleSettingsCard>

      {/* Bingers Integration */}
      <CollapsibleSettingsCard
        key={bingersStatus?.needsReauthorization ? "bingers-reauth" : "bingers"}
        title="Bingers"
        description={t("bingers.description", {
          defaultValue:
            "Sync your watched movies and episodes to Bingers. Uses magic-link email sign-in for secure authentication.",
        })}
        icon={
          <img
            src="/logos/bingers.png"
            alt=""
            className="h-5 w-5"
            aria-hidden
          />
        }
        defaultOpen={!!bingersStatus?.needsReauthorization}
        headerMeta={
          bingersStatus?.linked ? (
            <LinkedStatusBadge
              linkedLabel={t("profile.linkedAccounts.linked", {
                defaultValue: "Linked",
              })}
              warningLabel={t("profile.linkedAccounts.reauthRequired", {
                defaultValue: "Re-authorization required",
              })}
            />
          ) : bingersStatus?.needsReauthorization ? (
            <LinkedStatusBadge
              warning
              linkedLabel={t("profile.linkedAccounts.linked", {
                defaultValue: "Linked",
              })}
              warningLabel={t("profile.linkedAccounts.reauthRequired", {
                defaultValue: "Re-authorization required",
              })}
            />
          ) : undefined
        }
      >
        {bingersStatus?.linked ? (
          <div className="space-y-4">
            {bingersError && <IntegrationErrorBanner message={bingersError} />}
            <div className="flex items-start gap-4">
              {bingersStatus.image && (
                <img
                  src={bingersStatus.image}
                  alt="Profile"
                  className="h-16 w-16 shrink-0 rounded-full"
                />
              )}
              <div className="flex-1 space-y-2">
                {bingersStatus.username && (
                  <div>
                    <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                      {t("bingers.profile.username", {
                        defaultValue: "Username",
                      })}
                    </p>
                    <p className="text-sm text-foreground">
                      {bingersStatus.username}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleUnlinkBingers}
              disabled={bingersSaving || bingersSavingSettings}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
              title={t("bingers.unlink", { defaultValue: "Unlink" })}
            >
              <FaUnlink className="h-3.5 w-3.5" />
              <span>{t("bingers.unlink", { defaultValue: "Unlink" })}</span>
            </button>

            <div className="mt-4 border-t border-border pt-4">
              <h4 className="mb-3 text-sm font-semibold text-foreground">
                {t("bingers.settings.title", {
                  defaultValue: "Sync Settings",
                })}
              </h4>
              <p className="mb-4 text-xs text-muted-foreground">
                {t("bingers.settings.description", {
                  defaultValue:
                    "Mark media as rewatched when it was synced before or is already watched in Bingers. Rewatches increment the play count in Bingers (Watched x2, etc.).",
                })}
              </p>

              <div className="space-y-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <div className="mt-0.5">
                    <CustomCheckbox
                      checked={bingersMarkMoviesAsRewatched}
                      disabled={bingersSavingSettings}
                      onChange={() =>
                        setBingersMarkMoviesAsRewatched(
                          !bingersMarkMoviesAsRewatched
                        )
                      }
                      ariaLabel={t("bingers.settings.markMoviesAsRewatched", {
                        defaultValue: "Mark movies as rewatched",
                      })}
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground/90">
                      {t("bingers.settings.markMoviesAsRewatched", {
                        defaultValue: "Mark movies as rewatched",
                      })}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("bingers.settings.markMoviesAsRewatchedDescription", {
                        defaultValue:
                          "When enabled, movies already watched in Bingers (via Scroblarr sync, manual tracking, or import) will increment the play count on the next sync.",
                      })}
                    </p>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-3">
                  <div className="mt-0.5">
                    <CustomCheckbox
                      checked={bingersMarkEpisodesAsRewatched}
                      disabled={bingersSavingSettings}
                      onChange={() =>
                        setBingersMarkEpisodesAsRewatched(
                          !bingersMarkEpisodesAsRewatched
                        )
                      }
                      ariaLabel={t("bingers.settings.markEpisodesAsRewatched", {
                        defaultValue: "Mark episodes as rewatched",
                      })}
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground/90">
                      {t("bingers.settings.markEpisodesAsRewatched", {
                        defaultValue: "Mark episodes as rewatched",
                      })}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(
                        "bingers.settings.markEpisodesAsRewatchedDescription",
                        {
                          defaultValue:
                            "When enabled, episodes already watched in Bingers (via Scroblarr sync, manual tracking, or import) will increment the play count on the next sync.",
                        }
                      )}
                    </p>
                  </div>
                </label>
              </div>

              {bingersHasSettingsChanges && (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveBingersSettings}
                    disabled={bingersSavingSettings}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bingersSavingSettings ? (
                      <>
                        <Spinner size="md" variant="onPrimary" />
                        <span>
                          {t("common.saving", { defaultValue: "Saving..." })}
                        </span>
                      </>
                    ) : (
                      <>
                        <FaCheckCircle className="h-4 w-4" />
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
            <p className="text-sm text-muted-foreground">
              {t("bingers.docsHint", {
                defaultValue:
                  "Open Bingers sign-in to email yourself a magic link, then paste that link below.",
              })}
            </p>
            {bingersError && <IntegrationErrorBanner message={bingersError} />}
            {bingersStatus?.needsReauthorization && (
              <div className="flex items-start gap-2 rounded-lg border border-warning-500/30 bg-warning-500/10 px-3 py-2 text-warning-700 dark:text-warning-300">
                <FaExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm">
                  {t("bingers.needsReauthorization", {
                    defaultValue:
                      "Bingers authorization expired or was revoked. Link your account again to reconnect.",
                  })}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleOpenBingersSignIn}
              disabled={bingersLoading}
              className="w-full cursor-pointer rounded-lg bg-(--bingers-cta-bg) px-3 py-2 text-sm font-medium text-(--bingers-cta-fg) hover:bg-(--bingers-cta-hover) disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {t("bingers.openSignIn", {
                defaultValue: "Open Bingers sign-in",
              })}
            </button>

            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground/90">
                  {t("bingers.magicLink", {
                    defaultValue: "Magic-link from email",
                  })}
                </label>
                <input
                  type="text"
                  value={bingersMagicLink}
                  onChange={(e) => setBingersMagicLink(e.target.value)}
                  placeholder={t("bingers.magicLinkPlaceholder", {
                    defaultValue: "https://bingers.app/m?token=…",
                  })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </div>
              <button
                type="button"
                onClick={handleLinkBingers}
                disabled={bingersSaving || !bingersMagicLink.trim()}
                className="w-full cursor-pointer rounded-lg border border-(--bingers-border) bg-background px-3 py-2 text-sm font-medium text-(--bingers-chip-fg) hover:bg-(--bingers-chip-bg) disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {bingersSaving
                  ? t("common.loading", { defaultValue: "Loading..." })
                  : t("bingers.completeLink", {
                      defaultValue: "Complete link",
                    })}
              </button>
            </div>
          </div>
        )}
      </CollapsibleSettingsCard>

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
              className="cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {t("trakt.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              onClick={confirmUnlinkTrakt}
              disabled={traktSaving}
              className="cursor-pointer rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white hover:bg-destructive/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {traktSaving
                ? t("common.loading", { defaultValue: "Loading..." })
                : t("trakt.confirm", { defaultValue: "Confirm" })}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showSimklUnlinkModal}
        onOpenChange={setShowSimklUnlinkModal}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>
            {t("simkl.unlinkTitle", {
              defaultValue: "Unlink Simkl Account",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("simkl.unlinkMessage", {
              defaultValue:
                "Are you sure you want to unlink your Simkl account? This will stop syncing to Simkl.",
            })}
          </DialogDescription>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowSimklUnlinkModal(false)}
              className="cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {t("simkl.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              onClick={confirmUnlinkSimkl}
              disabled={simklSaving}
              className="cursor-pointer rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white hover:bg-destructive/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {simklSaving
                ? t("common.loading", { defaultValue: "Loading..." })
                : t("simkl.confirm", { defaultValue: "Confirm" })}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showBingersUnlinkModal}
        onOpenChange={setShowBingersUnlinkModal}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>
            {t("bingers.unlinkTitle", {
              defaultValue: "Unlink Bingers Account",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("bingers.unlinkMessage", {
              defaultValue:
                "Are you sure you want to unlink your Bingers account? Scroblarr will remove the stored session.",
            })}
          </DialogDescription>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowBingersUnlinkModal(false)}
              className="cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {t("bingers.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              onClick={confirmUnlinkBingers}
              disabled={bingersSaving || bingersSavingSettings}
              className="cursor-pointer rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white hover:bg-destructive/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bingersSaving
                ? t("common.loading", { defaultValue: "Loading..." })
                : t("bingers.confirm", { defaultValue: "Confirm" })}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
