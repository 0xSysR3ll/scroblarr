import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

type OfflinePageProps = {
  onRetry: () => void;
};

export function OfflinePage({ onRetry }: OfflinePageProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-5 px-4 py-8 text-center">
      <img
        src="/logo-icon.svg"
        alt=""
        className="h-14 w-14 opacity-90"
        width={56}
        height={56}
      />
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
          {t("errors.unavailableTitle", {
            defaultValue: "Scroblarr is unavailable",
          })}
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          {t("errors.unavailableBody", {
            defaultValue:
              "Can't reach the server right now. It may be starting up, restarting, or having issues. Try again in a moment.",
          })}
        </p>
      </div>
      <Button type="button" onClick={onRetry}>
        {t("errors.tryAgain", { defaultValue: "Try again" })}
      </Button>
    </div>
  );
}
