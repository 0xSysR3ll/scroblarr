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
      <h2 className="mb-4 text-xl font-semibold text-foreground">
        {t("profile.general.title", {
          defaultValue: "General Information",
        })}
      </h2>
      <div className="space-y-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            {t("users.displayName", { defaultValue: "Display Name" })}
          </label>
          <div className="flex items-center gap-2">
            <p className="text-foreground">{displayName || username || "-"}</p>
            {isAdmin && (
              <div className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5">
                <FaCrown className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium text-primary">
                  {t("users.admin", { defaultValue: "Admin" })}
                </span>
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            {t("users.email", { defaultValue: "Email" })}
          </label>
          <p className="text-foreground">{email || "-"}</p>
        </div>
      </div>
    </div>
  );
}
