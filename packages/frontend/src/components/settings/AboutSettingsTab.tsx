import type { AppVersionInfo } from "@services/api/meta";
import { useTranslation } from "react-i18next";
import {
  FaExternalLinkAlt,
  FaGithub,
  FaBook,
  FaBug,
  FaTags,
  FaBalanceScale,
  FaExclamationTriangle,
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

  const DEVELOP_BRANCH = "develop";
  const rawVersion = versionInfo?.version ?? "unknown";
  const isDevelop = rawVersion.startsWith("develop-");
  const displayVersion = rawVersion.replace(/^develop-/, "");
  const commitTag = versionInfo?.commitTag ?? "local";
  const showUpdateBadge = Boolean(versionInfo) && commitTag !== "local";
  const badgeHref = isDevelop
    ? `https://github.com/${repoSlug}/compare/${commitTag}...${DEVELOP_BRANCH}`
    : (versionInfo?.latestUrl ?? releasesUrl);
  const updateAvailable = Boolean(versionInfo?.updateAvailable);
  const badgeClass = updateAvailable
    ? `${pill} border-warning-500/45 bg-warning-500/10 text-warning-800 hover:bg-warning-500/15 dark:text-warning-200`
    : `${pill} border-success-500/45 bg-success-500/10 text-success-700 hover:bg-success-500/15 dark:text-success-400`;
  const badgeLabel = updateAvailable
    ? t("settings.about.badgeOutOfDate", {
        defaultValue: "Out of Date",
      })
    : t("settings.about.badgeUpToDate", {
        defaultValue: "Up to Date",
      });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("settings.about.description", {
          defaultValue:
            "Version information and links related to this Scroblarr instance.",
        })}
      </p>

      {isDevelop && (
        <div
          role="status"
          className="flex gap-2 rounded border-l-4 border-warning-400 bg-warning-50 p-3 dark:border-warning-600 dark:bg-warning-950"
        >
          <FaExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-700 dark:text-warning-300" />
          <p className="text-xs text-warning-900 dark:text-warning-100 sm:text-sm">
            {t("settings.about.runningDevelop", {
              defaultValue:
                "You are running the develop branch of Scroblarr, which is only recommended for those contributing to development or assisting with bleeding-edge testing.",
            })}
          </p>
        </div>
      )}

      <div className="surface-tile p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          {t("settings.about.versionSection", {
            defaultValue: "Version",
          })}
        </h3>

        {versionInfo ? (
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <span className="font-mono text-foreground">{displayVersion}</span>
            {versionInfo.releasesError ? (
              <span
                role="status"
                className={`${pill} border-destructive/50 bg-destructive/10 text-destructive`}
                title={t("settings.about.releasesErrorHint", {
                  defaultValue: "Details are in the server logs.",
                })}
              >
                {t("settings.about.latestUnavailableBadge", {
                  defaultValue: "Unavailable",
                })}
              </span>
            ) : (
              showUpdateBadge && (
                <a
                  href={badgeHref}
                  target="_blank"
                  rel="noreferrer"
                  className={badgeClass}
                >
                  {badgeLabel}
                  <FaExternalLinkAlt className="h-3 w-3 opacity-80" />
                </a>
              )
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground sm:text-sm">
            {t("settings.about.versionUnavailable", {
              defaultValue: "Version information is currently unavailable.",
            })}
          </p>
        )}
      </div>

      <div className="surface-tile p-4">
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
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-warning-500/15 text-warning-800 dark:text-warning-300">
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
              "Plex, Jellyfin, Trakt, Simkl, Bingers, and related marks are trademarks of their respective owners. Scroblarr is an independent project and is not sponsored, endorsed, or affiliated with those services.",
          })}
        </p>
      </div>
    </div>
  );
}
