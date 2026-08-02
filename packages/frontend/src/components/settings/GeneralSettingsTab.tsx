import { Spinner } from "@components/ui/spinner";
import { testTmdbConnection } from "@services/api/settings";
import { showSuccess, showError } from "@utils/toast";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FaHistory,
  FaEye,
  FaEyeSlash,
  FaSync,
  FaCopy,
  FaPlug,
} from "react-icons/fa";

interface GeneralSettingsTabProps {
  syncHistoryLimit: number;
  onSyncHistoryLimitChange: (value: number) => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  tmdbAccessToken: string;
  onTmdbAccessTokenChange: (value: string) => void;
}

export function GeneralSettingsTab({
  syncHistoryLimit,
  onSyncHistoryLimitChange,
  apiKey,
  onApiKeyChange,
  tmdbAccessToken,
  onTmdbAccessTokenChange,
}: GeneralSettingsTabProps) {
  const { t } = useTranslation();
  const [showApiKey, setShowApiKey] = useState(false);
  const [showTmdbAccessToken, setShowTmdbAccessToken] = useState(false);
  const [testingTmdb, setTestingTmdb] = useState(false);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 mb-2 sm:mb-4">
        <div className="shrink-0 rounded-lg bg-primary/15 p-2">
          <FaHistory className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground sm:text-xl">
            {t("settings.general.title", {
              defaultValue: "General Settings",
            })}
          </h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {t("settings.general.description", {
              defaultValue:
                "General application settings will be available here.",
            })}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label
            htmlFor="apiKey"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            {t("settings.general.apiKey", {
              defaultValue: "API Key",
            })}
          </label>
          <p className="mb-2 text-xs text-muted-foreground">
            {t("settings.general.apiKeyDescription", {
              defaultValue:
                "Used for media-server webhooks and API authentication. Required before Plex or Jellyfin can send events.",
            })}
          </p>
          <div className="flex gap-2 items-start">
            <div className="relative flex-1 max-w-md">
              <input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                placeholder={t("settings.general.apiKeyPlaceholder", {
                  defaultValue: "sk_...",
                })}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? (
                  <FaEyeSlash className="w-4 h-4" />
                ) : (
                  <FaEye className="w-4 h-4" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!apiKey) return;
                try {
                  await navigator.clipboard.writeText(apiKey);
                  showSuccess(
                    t("settings.general.apiKeyCopied", {
                      defaultValue: "API key copied to clipboard",
                    })
                  );
                } catch {
                  // Clipboard API may fail in non-HTTPS or unsupported contexts
                }
              }}
              disabled={!apiKey}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
              title={t("settings.general.copyApiKey", {
                defaultValue: "Copy API key",
              })}
            >
              <FaCopy className="w-4 h-4" />
              <span className="hidden sm:inline">
                {t("settings.general.copy", { defaultValue: "Copy" })}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                const randomBytes = new Uint8Array(32);
                crypto.getRandomValues(randomBytes);
                const hexKey = Array.from(randomBytes)
                  .map((b) => b.toString(16).padStart(2, "0"))
                  .join("");
                onApiKeyChange(`sk_${hexKey}`);
                setShowApiKey(true);
              }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
              title={t("settings.general.generateApiKey", {
                defaultValue: "Generate new API key",
              })}
            >
              <FaSync className="w-4 h-4" />
              <span className="hidden sm:inline">
                {t("settings.general.generate", {
                  defaultValue: "Generate",
                })}
              </span>
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="tmdbAccessToken"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            {t("settings.general.tmdbAccessToken", {
              defaultValue: "TMDB API Read Access Token",
            })}
          </label>
          <p className="mb-2 text-xs text-muted-foreground">
            {t("settings.general.tmdbAccessTokenDescription", {
              defaultValue:
                "Used to load posters from The Movie Database when media is no longer available on your server. You can also set TMDB_ACCESS_TOKEN in the environment.",
            })}{" "}
            <a
              href="https://www.themoviedb.org/settings/api"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {t("settings.general.tmdbAccessTokenLink", {
                defaultValue: "Get a token from TMDB",
              })}
            </a>
          </p>
          <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-start">
            <div className="relative flex-1">
              <input
                id="tmdbAccessToken"
                type={showTmdbAccessToken ? "text" : "password"}
                value={tmdbAccessToken}
                onChange={(e) => onTmdbAccessTokenChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                placeholder={t("settings.general.tmdbAccessTokenPlaceholder", {
                  defaultValue: "eyJhbGciOiJIUzI1NiJ9...",
                })}
              />
              <button
                type="button"
                onClick={() => setShowTmdbAccessToken(!showTmdbAccessToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={
                  showTmdbAccessToken
                    ? "Hide TMDB access token"
                    : "Show TMDB access token"
                }
              >
                {showTmdbAccessToken ? (
                  <FaEyeSlash className="w-4 h-4" />
                ) : (
                  <FaEye className="w-4 h-4" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={async () => {
                setTestingTmdb(true);
                try {
                  await testTmdbConnection(
                    tmdbAccessToken.trim() ? tmdbAccessToken.trim() : undefined
                  );
                  showSuccess(
                    t("settings.general.tmdbTestSuccess", {
                      defaultValue: "TMDB connection successful",
                    })
                  );
                } catch (error) {
                  showError(
                    error instanceof Error
                      ? error.message
                      : t("settings.general.tmdbTestFailed", {
                          defaultValue: "TMDB connection failed",
                        })
                  );
                } finally {
                  setTestingTmdb(false);
                }
              }}
              disabled={testingTmdb}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testingTmdb ? (
                <Spinner size="sm" />
              ) : (
                <FaPlug className="w-4 h-4" />
              )}
              <span>
                {testingTmdb
                  ? t("settings.general.tmdbTesting", {
                      defaultValue: "Testing...",
                    })
                  : t("settings.general.tmdbTest", {
                      defaultValue: "Test connection",
                    })}
              </span>
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="syncHistoryLimit"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            {t("settings.general.syncHistoryLimit", {
              defaultValue: "Sync History Limit",
            })}
          </label>
          <p className="mb-2 text-xs text-muted-foreground">
            {t("settings.general.syncHistoryLimitDescription", {
              defaultValue:
                "Maximum number of sync history items to keep. Older items will be automatically removed. (10-10000)",
            })}
          </p>
          <input
            id="syncHistoryLimit"
            type="number"
            min="10"
            max="10000"
            value={syncHistoryLimit}
            onChange={(e) =>
              onSyncHistoryLimitChange(parseInt(e.target.value, 10) || 100)
            }
            className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>
      </div>
    </div>
  );
}
