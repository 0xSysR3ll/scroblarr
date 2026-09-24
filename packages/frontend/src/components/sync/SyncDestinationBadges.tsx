import type { SyncHistoryItem } from "@services/api";
import {
  getDestinationResults,
  type SyncDestinationName,
  type SyncDestinationResult,
} from "@utils/syncHistory";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FaExclamationCircle } from "react-icons/fa";

interface SyncDestinationBadgesProps {
  item: SyncHistoryItem;
  className?: string;
  emptyFallback?: ReactNode;
}

const destinationLabels: Record<SyncDestinationName, string> = {
  TVTime: "TVTime",
  Trakt: "Trakt",
  Simkl: "Simkl",
  Bingers: "Bingers",
};

const destinationLogoPaths: Record<SyncDestinationName, string> = {
  TVTime: "/logos/tvtime.svg",
  Trakt: "/logos/trakt.svg",
  Simkl: "/logos/simkl.svg",
  Bingers: "/logos/bingers.png",
};

const destinationTranslationKeys: Record<SyncDestinationName, string> = {
  TVTime: "sync.destinations.tvtime",
  Trakt: "sync.destinations.trakt",
  Simkl: "sync.destinations.simkl",
  Bingers: "sync.destinations.bingers",
};

function getBadgeClasses(destination: SyncDestinationResult): string {
  if (destination.status === "failed") {
    return "bg-destructive/15 text-destructive";
  }

  if (destination.name === "TVTime") {
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300";
  }

  if (destination.name === "Simkl") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";
  }

  if (destination.name === "Bingers") {
    return "bg-(--bingers-chip-bg) text-(--bingers-chip-fg)";
  }

  return "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300";
}

export function SyncDestinationBadges({
  item,
  className,
  emptyFallback = null,
}: SyncDestinationBadgesProps) {
  const { t } = useTranslation();
  const destinations = getDestinationResults(item);

  if (destinations.length === 0) {
    return className && emptyFallback ? (
      <div className={className}>{emptyFallback}</div>
    ) : (
      <>{emptyFallback}</>
    );
  }

  const badges = (
    <>
      {destinations.map((destination) => {
        const label = t(destinationTranslationKeys[destination.name], {
          defaultValue: destinationLabels[destination.name],
        });
        const title =
          destination.status === "failed" && destination.errorMessage
            ? `${label}: ${destination.errorMessage}`
            : label;

        return (
          <div
            key={destination.name}
            className={`chip-dense ${getBadgeClasses(destination)}`}
            title={title}
            aria-label={title}
          >
            <img
              src={destinationLogoPaths[destination.name]}
              alt={label}
              className="h-2.5 w-2.5"
            />
            <span className="text-xs font-medium">{label}</span>
            {destination.status === "failed" && (
              <FaExclamationCircle className="h-2.5 w-2.5" />
            )}
          </div>
        );
      })}
    </>
  );

  return className ? <div className={className}>{badges}</div> : badges;
}
