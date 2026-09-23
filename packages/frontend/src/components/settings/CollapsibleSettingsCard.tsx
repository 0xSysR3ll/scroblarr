import { useId, useState, type ReactNode } from "react";
import { FaChevronDown } from "react-icons/fa";

interface CollapsibleSettingsCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  /** Defaults to collapsed. */
  defaultOpen?: boolean;
  /** Extra controls shown in the header (e.g. status badge). */
  headerMeta?: ReactNode;
  children: ReactNode;
}

export function CollapsibleSettingsCard({
  title,
  description,
  icon,
  defaultOpen = false,
  headerMeta,
  children,
}: CollapsibleSettingsCardProps) {
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="surface-panel">
      <h2 className="m-0 text-base font-normal">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full cursor-pointer items-start gap-3 p-4 text-left transition-colors hover:bg-muted/30"
        >
          <FaChevronDown
            className={`mt-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
              open ? "rotate-0" : "-rotate-90"
            }`}
            aria-hidden
          />
          <span className="inline-flex shrink-0 rounded-lg bg-primary/15 p-2">
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-foreground sm:text-lg">
                {title}
              </span>
              {headerMeta}
            </span>
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:text-sm">
              {description}
            </span>
          </span>
        </button>
      </h2>

      {open && (
        <div id={panelId} className="space-y-4 border-t border-border/50 p-4">
          {children}
        </div>
      )}
    </div>
  );
}
