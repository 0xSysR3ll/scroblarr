import { CollapsibleSettingsCard } from "@components/settings/CollapsibleSettingsCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@components/ui/dialog";
import { Spinner } from "@components/ui/spinner";
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
} from "@services/api";
import { OAuthPopup } from "@utils/OAuthPopup";
import { showSuccess } from "@utils/toast";
import { useState, useEffect, useRef } from "react";
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

function isPinAuthPendingMessage(message: string): boolean {
  return /authorization pending/i.test(message);
}

function isPinAuthSlowDownMessage(message: string): boolean {
  return /slow down/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PinPollResult = "linked" | "pending" | "slow_down" | "failed";

interface IntegrationsTabProps {
  onProfileUpdated?: () => void;
}

export function IntegrationsTab({ onProfileUpdated }: IntegrationsTabProps) {
  const { t } = useTranslation();
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
  const [simklClientId, setSimklClientId] = useState("");
  const [simklAuthUrl, setSimklAuthUrl] = useState<string | null>(null);
  const [simklPinPolling, setSimklPinPolling] = useState(false);
  const [simklPinMessage, setSimklPinMessage] = useState<string | null>(null);
  const [showSimklUnlinkModal, setShowSimklUnlinkModal] = useState(false);
  const [simklOAuthPopup] = useState(() => new OAuthPopup());
  const traktPinPollIdRef = useRef(0);
  const simklPinPollIdRef = useRef(0);

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
    clientId: string | undefined,
    showPendingError = true
  ): Promise<PinPollResult> {
    let result: PinPollResult = "failed";
    try {
      if (showPendingError) {
        setSimklSaving(true);
      }
      setSimklError(null);
      await linkSimkl(userCode.trim(), clientId);
      simklPinPollIdRef.current += 1;
      setSimklPinPolling(false);
      setSimklPinMessage(null);
      setSimklCode("");
      setSimklClientId("");
      setSimklAuthUrl(null);
      simklOAuthPopup.closePopup();
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
    clientId: string | undefined,
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

      const result = await completeSimklLink(userCode, clientId, false);
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
        const clientId = simklClientId.trim() || undefined;

        const response = await getSimklAuthorizeUrl(clientId);
        if (pollId !== simklPinPollIdRef.current) {
          return;
        }

        setSimklCode(response.userCode);
        setSimklAuthUrl(response.verificationUrl);

        simklOAuthPopup.navigateToUrl(response.verificationUrl);
        void startSimklPinPolling(
          response.userCode,
          clientId,
          response.interval,
          response.expiresIn,
          pollId
        );
      } catch (err) {
        if (pollId !== simklPinPollIdRef.current) {
          return;
        }
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
    const clientId = simklClientId.trim() || undefined;
    await completeSimklLink(simklCode.trim(), clientId);
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
      setSimklClientId("");
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

  if (traktLoading && simklLoading && !traktStatus && !simklStatus) {
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
            traktStatus.needsReauthorization ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400">
                <FaExclamationTriangle className="h-4 w-4" />
                {t("profile.linkedAccounts.reauthRequired", {
                  defaultValue: "Re-authorization required",
                })}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                <FaCheckCircle className="h-4 w-4" />
                {t("profile.linkedAccounts.linked", {
                  defaultValue: "Linked",
                })}
              </span>
            )
          ) : undefined
        }
      >
        {traktStatus?.linked ? (
          <div className="space-y-4">
            {traktError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
                <div className="flex items-start gap-2">
                  <FaTimesCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                  <p className="text-sm text-red-800 dark:text-red-200">
                    {traktError}
                  </p>
                </div>
              </div>
            )}
            {traktStatus.needsReauthorization && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
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
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300"
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
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
                <div className="flex items-start gap-2">
                  <FaTimesCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                  <div className="flex-1">
                    <p className="mb-2 text-sm text-red-800 dark:text-red-200">
                      {traktError}
                    </p>
                    {traktAuthUrl && (
                      <a
                        href={traktAuthUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-sm text-red-800 underline hover:text-red-900 dark:text-red-200 dark:hover:text-red-100"
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
                  className="w-full rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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
                      className="inline-flex w-fit items-center rounded-md border border-purple-300 bg-background px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-950"
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
                    className="mt-3 w-full rounded-md border border-purple-300 bg-background px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-950"
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
        headerMeta={
          simklStatus?.linked ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
              <FaCheckCircle className="h-4 w-4" />
              {t("profile.linkedAccounts.linked", {
                defaultValue: "Linked",
              })}
            </span>
          ) : undefined
        }
      >
        {simklStatus?.linked ? (
          <div className="space-y-4">
            {simklError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
                <div className="flex items-start gap-2">
                  <FaTimesCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                  <p className="text-sm text-red-800 dark:text-red-200">
                    {simklError}
                  </p>
                </div>
              </div>
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
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300"
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
                defaultValue:
                  "Create a Simkl app and enter its Client ID below. Simkl PIN authorization does not require a client secret.",
              })}
            </p>
            {simklError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
                <div className="flex items-start gap-2">
                  <FaTimesCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                  <div className="flex-1">
                    <p className="mb-2 text-sm text-red-800 dark:text-red-200">
                      {simklError}
                    </p>
                    {simklAuthUrl && (
                      <a
                        href={simklAuthUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-sm text-red-800 underline hover:text-red-900 dark:text-red-200 dark:hover:text-red-100"
                      >
                        {simklAuthUrl}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {!simklStatus?.hasCredentials && (
                <div className="space-y-3 border-b border-border pb-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground/90">
                      {t("simkl.clientId", { defaultValue: "Client ID" })}
                    </label>
                    <input
                      type="text"
                      value={simklClientId}
                      onChange={(e) => setSimklClientId(e.target.value)}
                      placeholder={t("simkl.clientIdPlaceholder", {
                        defaultValue: "Enter your Simkl Client ID",
                      })}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm text-foreground/90">
                  {t("simkl.oauthInstructions", {
                    defaultValue:
                      "Click 'Authorize' to get a Simkl PIN code, then enter that code on Simkl's PIN page.",
                  })}
                </p>
                <button
                  type="button"
                  onClick={handleGetSimklAuthUrl}
                  disabled={
                    simklSaving ||
                    simklLoading ||
                    (!simklStatus?.hasCredentials && !simklClientId.trim())
                  }
                  className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {t("simkl.authorize", { defaultValue: "Authorize" })}
                </button>
              </div>

              {simklAuthUrl && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                        {t("simkl.authorizationCode", {
                          defaultValue: "PIN Code",
                        })}
                      </p>
                      <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.25em] text-foreground">
                        {simklCode}
                      </p>
                    </div>
                    <a
                      href={simklAuthUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center rounded-md border border-emerald-300 bg-background px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                    >
                      {t("simkl.openPinPage", {
                        defaultValue: "Open Simkl PIN page",
                      })}
                    </a>
                  </div>
                  {simklPinMessage && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-200">
                      {simklPinPolling && <Spinner size="sm" />}
                      <span>{simklPinMessage}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleLinkSimkl}
                    disabled={
                      simklSaving ||
                      !simklCode.trim() ||
                      (!simklStatus?.hasCredentials && !simklClientId.trim())
                    }
                    className="mt-3 w-full rounded-md border border-emerald-300 bg-background px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                  >
                    {simklSaving
                      ? t("simkl.checkingPin", {
                          defaultValue: "Checking...",
                        })
                      : t("simkl.checkPin", {
                          defaultValue: "Check approval now",
                        })}
                  </button>
                </div>
              )}
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
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {t("simkl.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              onClick={confirmUnlinkSimkl}
              disabled={simklSaving}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {simklSaving
                ? t("common.loading", { defaultValue: "Loading..." })
                : t("simkl.confirm", { defaultValue: "Confirm" })}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
