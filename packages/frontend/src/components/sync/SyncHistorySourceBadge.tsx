import { useTranslation } from "react-i18next";

interface SyncHistorySourceBadgeProps {
  source: string;
  iconClassName?: string;
}

export function SyncHistorySourceBadge({
  source,
  iconClassName = "w-3 h-3",
}: SyncHistorySourceBadgeProps) {
  const { t } = useTranslation();

  if (source === "plex") {
    return (
      <div className="chip-dense bg-(--plex-chip-bg) text-(--plex-chip-fg)">
        <img src="/logos/plex.svg" alt="Plex" className={iconClassName} />
        <span className="text-xs font-medium">
          {t("sync.sources.plex", {
            defaultValue: "Plex",
          })}
        </span>
      </div>
    );
  }

  if (source === "jellyfin") {
    return (
      <div className="chip-dense bg-(--jellyfin-chip-bg) text-(--jellyfin-chip-fg)">
        <img
          src="/logos/jellyfin.svg"
          alt="Jellyfin"
          className={iconClassName}
        />
        <span className="text-xs font-medium">
          {t("sync.sources.jellyfin", {
            defaultValue: "Jellyfin",
          })}
        </span>
      </div>
    );
  }

  if (source === "emby") {
    return (
      <div className="chip-dense bg-(--emby-chip-bg) text-(--emby-chip-fg)">
        <img src="/logos/emby.svg" alt="Emby" className={iconClassName} />
        <span className="text-xs font-medium">
          {t("sync.sources.emby", {
            defaultValue: "Emby",
          })}
        </span>
      </div>
    );
  }

  return (
    <span className="text-xs capitalize text-muted-foreground">{source}</span>
  );
}
