import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaHistory, FaEye, FaEyeSlash, FaSync } from "react-icons/fa";

interface GeneralSettingsTabProps {
  syncHistoryLimit: number;
  onSyncHistoryLimitChange: (value: number) => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
}

export function GeneralSettingsTab({
  syncHistoryLimit,
  onSyncHistoryLimitChange,
  apiKey,
  onApiKeyChange,
}: GeneralSettingsTabProps) {
  const { t } = useTranslation();
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 mb-2 sm:mb-4">
        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg flex-shrink-0">
          <FaHistory className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
            {t("settings.general.title", { defaultValue: "General Settings" })}
          </h2>
          <p className="text-xs sm:text-sm dark:text-slate-400 text-gray-600">
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
            className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1"
          >
            {t("settings.general.apiKey", {
              defaultValue: "API Key",
            })}
          </label>
          <p className="text-xs dark:text-slate-400 text-gray-500 mb-2">
            {t("settings.general.apiKeyDescription", {
              defaultValue: "Global API key for API authentication.",
            })}
          </p>
          <div className="flex gap-2 items-start">
            <div className="relative flex-1 max-w-md">
              <input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-[#2d2d2d] rounded-md bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-slate-100 font-mono text-sm"
                placeholder={t("settings.general.apiKeyPlaceholder", {
                  defaultValue: "sk_...",
                })}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
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
              onClick={() => {
                const randomBytes = new Uint8Array(32);
                crypto.getRandomValues(randomBytes);
                const hexKey = Array.from(randomBytes)
                  .map((b) => b.toString(16).padStart(2, "0"))
                  .join("");
                onApiKeyChange(`sk_${hexKey}`);
                setShowApiKey(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-gray-100 dark:bg-[#2d2d2d] text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-[#2d2d2d] rounded-md hover:bg-gray-200 dark:hover:bg-[#3d3d3d] transition-colors whitespace-nowrap"
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
            htmlFor="syncHistoryLimit"
            className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1"
          >
            {t("settings.general.syncHistoryLimit", {
              defaultValue: "Sync History Limit",
            })}
          </label>
          <p className="text-xs dark:text-slate-400 text-gray-500 mb-2">
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
            className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-[#2d2d2d] rounded-md bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-slate-100"
          />
        </div>
      </div>
    </div>
  );
}
