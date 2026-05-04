import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@components/ui/dialog";
import { useAuth } from "@contexts/AuthContext";
import { usePlexLogin } from "@hooks/auth/usePlexLogin";
import {
  linkPlexAccount,
  linkJellyfinAccount,
  unlinkPlexAccount,
  unlinkJellyfinAccount,
} from "@services/api";
import { showSuccess, showError } from "@utils/toast";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaCheckCircle, FaUnlink } from "react-icons/fa";

interface LinkedAccountsTabProps {
  plexUsername?: string;
  jellyfinUsername?: string;
  plexConfigured: boolean;
  jellyfinConfigured: boolean;
  onAccountLinked: () => void;
}

export function LinkedAccountsTab({
  plexUsername,
  jellyfinUsername,
  plexConfigured,
  jellyfinConfigured,
  onAccountLinked,
}: LinkedAccountsTabProps) {
  const { t } = useTranslation();
  const { checkAuth, user } = useAuth();
  const [linkingPlex, setLinkingPlex] = useState(false);
  const [linkingJellyfin, setLinkingJellyfin] = useState(false);
  const [jellyfinUsernameInput, setJellyfinUsernameInput] = useState("");
  const [jellyfinPassword, setJellyfinPassword] = useState("");
  const [plexLinkError, setPlexLinkError] = useState<string | null>(null);
  const [jellyfinLinkError, setJellyfinLinkError] = useState<string | null>(
    null
  );
  const [unlinkingPlex, setUnlinkingPlex] = useState(false);
  const [unlinkingJellyfin, setUnlinkingJellyfin] = useState(false);
  const [showUnlinkPlexModal, setShowUnlinkPlexModal] = useState(false);
  const [showUnlinkJellyfinModal, setShowUnlinkJellyfinModal] = useState(false);

  const { loading: plexLoading, login: plexLogin } = usePlexLogin({
    onAuthToken: async ({ authToken, clientIdentifier }) => {
      try {
        setPlexLinkError(null);
        setLinkingPlex(true);
        await linkPlexAccount(authToken, clientIdentifier);
        await checkAuth();
        onAccountLinked();
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

  async function handleLinkJellyfin() {
    try {
      setLinkingJellyfin(true);
      setJellyfinLinkError(null);

      if (!jellyfinUsernameInput || !jellyfinPassword) {
        setJellyfinLinkError(
          t("users.jellyfinCredentialsRequired", {
            defaultValue: "Jellyfin username and password are required",
          })
        );
        return;
      }

      await linkJellyfinAccount(jellyfinUsernameInput, jellyfinPassword);
      setJellyfinPassword("");
      await checkAuth();
      onAccountLinked();
    } catch (err) {
      setJellyfinLinkError(
        err instanceof Error
          ? err.message
          : t("auth.loginFailed", { defaultValue: "Failed to login" })
      );
    } finally {
      setLinkingJellyfin(false);
    }
  }

  async function handleUnlinkPlex() {
    setShowUnlinkPlexModal(true);
  }

  async function confirmUnlinkPlex() {
    setShowUnlinkPlexModal(false);
    try {
      setUnlinkingPlex(true);
      await unlinkPlexAccount();
      showSuccess(
        t("profile.linkedAccounts.unlinkSuccess", {
          defaultValue: "Plex account unlinked successfully!",
        })
      );
      await checkAuth();
      onAccountLinked();
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : t("profile.linkedAccounts.unlinkFailed", {
              defaultValue: "Failed to unlink Plex account",
            })
      );
    } finally {
      setUnlinkingPlex(false);
    }
  }

  async function handleUnlinkJellyfin() {
    setShowUnlinkJellyfinModal(true);
  }

  async function confirmUnlinkJellyfin() {
    setShowUnlinkJellyfinModal(false);
    try {
      setUnlinkingJellyfin(true);
      await unlinkJellyfinAccount();
      showSuccess(
        t("profile.linkedAccounts.unlinkSuccess", {
          defaultValue: "Jellyfin account unlinked successfully!",
        })
      );
      await checkAuth();
      onAccountLinked();
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : t("profile.linkedAccounts.unlinkFailed", {
              defaultValue: "Failed to unlink Jellyfin account",
            })
      );
    } finally {
      setUnlinkingJellyfin(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-xl font-semibold text-foreground">
          {t("profile.linkedAccounts.title", {
            defaultValue: "Linked Accounts",
          })}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("profile.linkedAccounts.description", {
            defaultValue: "Link your media server accounts to enable syncing.",
          })}
        </p>
      </div>

      {(plexConfigured ||
        jellyfinConfigured ||
        plexUsername ||
        jellyfinUsername) && (
        <div className="space-y-4">
          {/* Plex linking */}
          {(plexConfigured || plexUsername) && (
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <img src="/logos/plex.svg" alt="Plex" className="w-6 h-6" />
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Plex
                    </h3>
                    {plexUsername && (
                      <p className="text-sm text-muted-foreground">
                        {plexUsername}
                      </p>
                    )}
                  </div>
                </div>
                {plexUsername ? (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <FaCheckCircle className="w-5 h-5" />
                      <span className="text-sm font-medium">
                        {t("profile.linkedAccounts.linked", {
                          defaultValue: "Linked",
                        })}
                      </span>
                    </div>
                    <button
                      onClick={handleUnlinkPlex}
                      disabled={unlinkingPlex}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={t("profile.linkedAccounts.unlink", {
                        defaultValue: "Unlink Plex Account",
                      })}
                    >
                      <FaUnlink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">
                        {t("profile.linkedAccounts.unlink", {
                          defaultValue: "Unlink",
                        })}
                      </span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={plexLogin}
                    disabled={plexLoading || linkingPlex}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {plexLoading || linkingPlex
                      ? t("common.loading", {
                          defaultValue: "Loading...",
                        })
                      : t("auth.plexAuth", {
                          defaultValue: "Authenticate with Plex",
                        })}
                  </button>
                )}
              </div>
              {plexLinkError && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                  {plexLinkError}
                </p>
              )}
            </div>
          )}

          {/* Jellyfin linking */}
          {(jellyfinConfigured || jellyfinUsername) && (
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/logos/jellyfin.svg"
                    alt="Jellyfin"
                    className="w-6 h-6"
                  />
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Jellyfin
                    </h3>
                    {jellyfinUsername && (
                      <p className="text-sm text-muted-foreground">
                        {jellyfinUsername}
                      </p>
                    )}
                  </div>
                </div>
                {jellyfinUsername ? (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <FaCheckCircle className="w-5 h-5" />
                      <span className="text-sm font-medium">
                        {t("profile.linkedAccounts.linked", {
                          defaultValue: "Linked",
                        })}
                      </span>
                    </div>
                    <button
                      onClick={handleUnlinkJellyfin}
                      disabled={unlinkingJellyfin}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={t("profile.linkedAccounts.unlink", {
                        defaultValue: "Unlink Jellyfin Account",
                      })}
                    >
                      <FaUnlink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">
                        {t("profile.linkedAccounts.unlink", {
                          defaultValue: "Unlink",
                        })}
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-end gap-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
                      <input
                        type="text"
                        value={jellyfinUsernameInput}
                        onChange={(e) =>
                          setJellyfinUsernameInput(e.target.value)
                        }
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                        placeholder={t("users.jellyfinUsername", {
                          defaultValue: "Jellyfin username",
                        })}
                      />
                      <input
                        type="password"
                        value={jellyfinPassword}
                        onChange={(e) => setJellyfinPassword(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                        placeholder={t("auth.password", {
                          defaultValue: "Password",
                        })}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleLinkJellyfin}
                      disabled={
                        linkingJellyfin ||
                        !jellyfinUsernameInput ||
                        !jellyfinPassword
                      }
                      className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {linkingJellyfin
                        ? t("common.loading", {
                            defaultValue: "Loading...",
                          })
                        : t("auth.jellyfinAuth", {
                            defaultValue: "Authenticate with Jellyfin",
                          })}
                    </button>
                  </div>
                )}
              </div>
              {jellyfinLinkError && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                  {jellyfinLinkError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {!plexConfigured && !jellyfinConfigured && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border-l-4 border-yellow-400 dark:border-yellow-600 p-4 rounded">
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            {t("profile.linkedAccounts.notConfigured", {
              defaultValue:
                "No media servers are configured. Please ask an admin to configure Plex or Jellyfin in the settings.",
            })}
          </p>
        </div>
      )}

      <Dialog open={showUnlinkPlexModal} onOpenChange={setShowUnlinkPlexModal}>
        <DialogContent className="max-w-md">
          <DialogTitle>
            {t("profile.linkedAccounts.unlinkConfirmTitle", {
              defaultValue: "Unlink Plex Account",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("profile.linkedAccounts.unlinkConfirmMessage", {
              defaultValue:
                "This will remove your Plex account connection. You will need to link your account again to sync watched media.",
            })}
          </DialogDescription>
          {user?.isAdmin && !jellyfinUsername && (
            <div className="mb-4 rounded border-l-4 border-yellow-400 bg-yellow-50 p-3 dark:border-yellow-600 dark:bg-yellow-950">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                {t("profile.linkedAccounts.adminWarning", {
                  defaultValue:
                    "As an admin, you must have at least one linked account. If you unlink Plex and only Plex is configured, you may lose access. Please ensure Jellyfin is configured and linked first.",
                })}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowUnlinkPlexModal(false)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              onClick={confirmUnlinkPlex}
              disabled={unlinkingPlex}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {unlinkingPlex
                ? t("common.loading", { defaultValue: "Loading..." })
                : t("common.confirm", { defaultValue: "Confirm" })}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showUnlinkJellyfinModal}
        onOpenChange={setShowUnlinkJellyfinModal}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>
            {t("profile.linkedAccounts.unlinkConfirmTitle", {
              defaultValue: "Unlink Jellyfin Account",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("profile.linkedAccounts.unlinkConfirmMessage", {
              defaultValue:
                "This will remove your Jellyfin account connection. You will need to link your account again to sync watched media.",
            })}
          </DialogDescription>
          {user?.isAdmin && !plexUsername && (
            <div className="mb-4 rounded border-l-4 border-yellow-400 bg-yellow-50 p-3 dark:border-yellow-600 dark:bg-yellow-950">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                {t("profile.linkedAccounts.adminWarning", {
                  defaultValue:
                    "As an admin, you must have at least one linked account. If you unlink Jellyfin and only Jellyfin is configured, you may lose access. Please ensure Plex is configured and linked first.",
                })}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowUnlinkJellyfinModal(false)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              onClick={confirmUnlinkJellyfin}
              disabled={unlinkingJellyfin}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {unlinkingJellyfin
                ? t("common.loading", { defaultValue: "Loading..." })
                : t("common.confirm", { defaultValue: "Confirm" })}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
