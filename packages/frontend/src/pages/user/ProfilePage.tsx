import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@contexts/AuthContext";
import { getAuthProviders } from "@services/api";
import { useTabNavigation } from "@hooks/useTabNavigation";
import { GeneralProfileTab } from "@components/profile/GeneralProfileTab";
import { LinkedAccountsTab } from "@components/profile/LinkedAccountsTab";
import { IntegrationsTab } from "@components/profile/IntegrationsTab";

type ProfileTab = "general" | "linkedAccounts" | "integrations";

const PROFILE_TABS = ["general", "linkedAccounts", "integrations"] as const;

export function ProfilePage() {
  const { t } = useTranslation();
  const { user, checkAuth } = useAuth();

  const { activeTab, changeTab } = useTabNavigation<ProfileTab>({
    validTabs: PROFILE_TABS,
    basePath: "/profile",
    defaultTab: "general",
  });

  const [authProviders, setAuthProviders] = useState<{
    hasAdmin: boolean;
    jellyfinConfigured: boolean;
    plexConfigured: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthProviders() {
      try {
        const providers = await getAuthProviders();
        if (!cancelled) {
          setAuthProviders(providers);
        }
      } catch {
        if (!cancelled) {
          setAuthProviders(null);
        }
      }
    }

    loadAuthProviders();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const tabs = useMemo(
    () => [
      {
        id: "general" as ProfileTab,
        label: t("profile.tabs.general", { defaultValue: "General" }),
      },
      {
        id: "linkedAccounts" as ProfileTab,
        label: t("profile.tabs.linkedAccounts", {
          defaultValue: "Linked Accounts",
        }),
      },
      {
        id: "integrations" as ProfileTab,
        label: t("profile.tabs.integrations", {
          defaultValue: "Integrations",
        }),
      },
    ],
    [t]
  );

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case "general":
        return (
          <GeneralProfileTab
            displayName={user?.displayName}
            username={user?.username}
            email={user?.email}
            isAdmin={user?.isAdmin}
          />
        );
      case "linkedAccounts":
        return (
          <LinkedAccountsTab
            plexUsername={user?.plexUsername}
            jellyfinUsername={user?.jellyfinUsername}
            plexConfigured={authProviders?.plexConfigured ?? false}
            jellyfinConfigured={authProviders?.jellyfinConfigured ?? false}
            onAccountLinked={checkAuth}
          />
        );
      case "integrations":
        return (
          <IntegrationsTab
            tvtimeMarkMoviesAsRewatched={user?.tvtimeMarkMoviesAsRewatched}
            tvtimeMarkEpisodesAsRewatched={user?.tvtimeMarkEpisodesAsRewatched}
            onProfileUpdated={checkAuth}
          />
        );
    }
  }, [activeTab, user, authProviders, checkAuth]);

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-gray-900 dark:text-white">
        {t("profile.title", { defaultValue: "Profile" })}
      </h1>

      <div className="dark:bg-[#121212] bg-white rounded-lg shadow-lg">
        <div className="border-b dark:border-[#2d2d2d] border-gray-200">
          <nav className="flex -mb-px" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => changeTab(tab.id)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent dark:text-slate-400 text-gray-500 hover:dark:text-slate-300 hover:text-gray-700 hover:dark:border-[#1e1e1e] hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">{tabContent}</div>
      </div>
    </div>
  );
}
