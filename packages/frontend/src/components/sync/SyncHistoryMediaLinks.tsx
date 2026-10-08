import type { SyncHistoryItem } from "@services/api";
import { getMediaLinks } from "@utils/syncHistory";
import { FaExternalLinkAlt } from "react-icons/fa";

interface SyncHistoryMediaLinksProps {
  item: SyncHistoryItem;
}

export function SyncHistoryMediaLinks({ item }: SyncHistoryMediaLinksProps) {
  return (
    <>
      {getMediaLinks(item).map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
            link.needsDarkBg
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
          title={`${link.label}: ${link.url}`}
        >
          <img src={link.logoPath} alt={link.label} className="h-3 w-auto" />
          <FaExternalLinkAlt className="h-2.5 w-2.5" aria-hidden />
        </a>
      ))}
    </>
  );
}
