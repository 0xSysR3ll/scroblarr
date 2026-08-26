/**
 * Static `t()` references for keys resolved dynamically at runtime.
 * i18next-scanner only sees literal `t("...")` calls; keep those keys here
 * so `removeUnusedKeys` does not drop them from locale files.
 *
 * This module is not imported by the application.
 */
export function explicitI18nKeys(
  t: (key: string, options?: { defaultValue?: string }) => string
): void {
  t("sync.destinations.trakt", { defaultValue: "Trakt" });
  t("sync.destinations.simkl", { defaultValue: "Simkl" });
  t("sync.destinations.bingers", { defaultValue: "Bingers" });
}
