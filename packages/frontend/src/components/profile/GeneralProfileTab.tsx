import { useTranslation } from "react-i18next";
import { FaCrown } from "react-icons/fa";

interface GeneralProfileTabProps {
  displayName?: string;
  username?: string;
  email?: string;
  isAdmin?: boolean;
}

export function GeneralProfileTab({
  displayName,
  username,
  email,
  isAdmin,
}: GeneralProfileTabProps) {
  const { t } = useTranslation();

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
        {t("profile.general.title", {
          defaultValue: "General Information",
        })}
      </h2>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1">
            {t("users.displayName", { defaultValue: "Display Name" })}
          </label>
          <div className="flex items-center gap-2">
            <p className="dark:text-white text-gray-900">
              {displayName || username || "-"}
            </p>
            {isAdmin && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 rounded-full">
                <FaCrown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                  {t("users.admin", { defaultValue: "Admin" })}
                </span>
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium dark:text-slate-300 text-gray-700 mb-1">
            {t("users.email", { defaultValue: "Email" })}
          </label>
          <p className="dark:text-white text-gray-900">{email || "-"}</p>
        </div>
      </div>
    </div>
  );
}
