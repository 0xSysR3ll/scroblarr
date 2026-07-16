import type { AppVersionInfo } from "@services/api/meta";
import { useTranslation } from "react-i18next";
import {
  FaInfoCircle,
  FaExternalLinkAlt,
  FaGithub,
  FaBook,
  FaBug,
  FaTags,
  FaBalanceScale,
} from "react-icons/fa";

interface AboutSettingsTabProps {
  versionInfo: AppVersionInfo | null;
}

export function AboutSettingsTab({ versionInfo }: AboutSettingsTabProps) {
  const { t } = useTranslation();

  const repoSlug = versionInfo?.githubRepository ?? "0xsysr3ll/scroblarr";
  const repoUrl = `https://github.com/${repoSlug}`;
  const docsUrl = "https://0xsysr3ll.github.io/scroblarr/";
  const issuesUrl = `${repoUrl}/issues`;
  const releasesUrl = `${repoUrl}/releases`;
  const licenseUrl = `${repoUrl}/blob/main/LICENSE`;

  const linkClass =
    "inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-xs sm:text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5";

  const pill =
    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium";

  const latestReleaseUrl =
    versionInfo?.latestUrl ??
    (versionInfo?.latestTag && versionInfo.githubRepository
      ? `https://github.com/${versionInfo.githubRepository}/releases/tag/${versionInfo.latestTag}`
      : undefined);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 mb-1 sm:mb-2">
        <div className="shrink-0 rounded-lg bg-primary/15 p-2">
          <FaInfoCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground sm:text-xl">
            {t("settings.about.title", { defaultValue: "About Scroblarr" })}
          </h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {t("settings.about.description", {
              defaultValue:
                "Version information and links related to this Scroblarr instance.",
            })}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/30 p-4 sm:p-5">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          {t("settings.about.versionSection", {
            defaultValue: "Version",
          })}
        </h3>

        {versionInfo ? (
          <div className="space-y-2.5 text-xs sm:text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">
                {t("settings.about.currentTag", {
                  defaultValue: "Current version",
                })}
              </span>
              <span
                className={`${pill} border-border bg-background font-mono text-foreground`}
              >
                {versionInfo.tag ?? versionInfo.version ?? "unknown"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">
                {t("settings.about.latestVersionLabel", {
                  defaultValue: "Latest version",
                })}
              </span>
              {versionInfo.releasesError ? (
                <span
                  role="status"
                  className={`${pill} border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300`}
                  title={t("settings.about.releasesErrorHint", {
                    defaultValue: "Details are in the server logs.",
                  })}
                >
                  {t("settings.about.latestUnavailableBadge", {
                    defaultValue: "Unavailable",
                  })}
                </span>
              ) : versionInfo.latestTag ? (
                <>
                  {latestReleaseUrl ? (
                    <a
                      href={latestReleaseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`${pill} border-primary/40 bg-primary/10 text-primary hover:bg-primary/15`}
                    >
                      <span className="font-mono">{versionInfo.latestTag}</span>
                      <FaExternalLinkAlt className="h-3 w-3 opacity-80" />
                    </a>
                  ) : (
                    <span
                      className={`${pill} border-border bg-background font-mono text-foreground`}
                    >
                      {versionInfo.latestTag}
                    </span>
                  )}
                  {versionInfo.isLatest === true && (
                    <span
                      className={`${pill} border-green-500/45 bg-green-500/10 text-green-700 dark:text-green-400`}
                    >
                      {t("settings.about.badgeUpToDate", {
                        defaultValue: "Up to date",
                      })}
                    </span>
                  )}
                  {versionInfo.isLatest === false && (
                    <span
                      className={`${pill} border-amber-500/45 bg-amber-500/10 text-amber-800 dark:text-amber-200`}
                    >
                      {t("settings.about.badgeUpdateAvailable", {
                        defaultValue: "Update available",
                      })}
                    </span>
                  )}
                </>
              ) : (
                <span
                  className={`${pill} border-border bg-muted/50 text-muted-foreground`}
                >
                  —
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground sm:text-sm">
            {t("settings.about.versionUnavailable", {
              defaultValue: "Version information is currently unavailable.",
            })}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/30 p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {t("settings.about.linksSection", {
            defaultValue: "Links",
          })}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background">
              <FaGithub className="w-3.5 h-3.5" />
            </span>
            <span className="flex-1 underline underline-offset-2">
              {t("settings.about.githubRepo", {
                defaultValue: "GitHub repository",
              })}
            </span>
            <FaExternalLinkAlt className="w-3 h-3 shrink-0 opacity-70" />
          </a>

          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground">
              <FaBook className="w-3.5 h-3.5" />
            </span>
            <span className="flex-1 underline underline-offset-2">
              {t("settings.about.docs", {
                defaultValue: "Documentation",
              })}
            </span>
            <FaExternalLinkAlt className="w-3 h-3 shrink-0 opacity-70" />
          </a>

          <a
            href={issuesUrl}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300">
              <FaBug className="w-3.5 h-3.5" />
            </span>
            <span className="flex-1 underline underline-offset-2">
              {t("settings.about.issues", {
                defaultValue: "Issues & feedback",
              })}
            </span>
            <FaExternalLinkAlt className="w-3 h-3 shrink-0 opacity-70" />
          </a>

          <a
            href={releasesUrl}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
              <FaTags className="w-3.5 h-3.5" />
            </span>
            <span className="flex-1 underline underline-offset-2">
              {t("settings.about.releases", {
                defaultValue: "All releases",
              })}
            </span>
            <FaExternalLinkAlt className="w-3 h-3 shrink-0 opacity-70" />
          </a>

          <a
            href={licenseUrl}
            target="_blank"
            rel="noreferrer"
            className={`${linkClass} sm:col-span-2`}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground">
              <FaBalanceScale className="w-3.5 h-3.5" />
            </span>
            <span className="flex-1 underline underline-offset-2">
              {t("settings.about.license", {
                defaultValue: "License (MIT)",
              })}
            </span>
            <FaExternalLinkAlt className="w-3 h-3 shrink-0 opacity-70" />
          </a>
        </div>

        <p className="mt-4 border-t border-border/50 pt-3 text-[10px] leading-relaxed text-muted-foreground sm:text-xs">
          {t("settings.about.tmdbAttribution", {
            defaultValue:
              "This product uses the TMDB API but is not endorsed or certified by TMDB.",
          })}
        </p>

        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground sm:text-xs">
          {t("settings.about.trademarkDisclaimer", {
            defaultValue:
              "Plex, Jellyfin, Trakt, Simkl, and related marks are trademarks of their respective owners. Scroblarr is an independent project and is not sponsored, endorsed, or affiliated with those services.",
          })}
        </p>
      </div>
    </div>
  );
}
