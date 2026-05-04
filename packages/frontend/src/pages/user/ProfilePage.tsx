import { GeneralProfileTab } from "@components/profile/GeneralProfileTab";
import { IntegrationsTab } from "@components/profile/IntegrationsTab";
import { LinkedAccountsTab } from "@components/profile/LinkedAccountsTab";
import { useAuth } from "@contexts/AuthContext";
import { useTabNavigation } from "@hooks/useTabNavigation";
import { getAuthProviders } from "@services/api";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

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
      <h1 className="mb-4 text-2xl font-bold text-foreground sm:mb-6 sm:text-3xl">
        {t("profile.title", { defaultValue: "Profile" })}
      </h1>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card text-card-foreground shadow-lg">
        <div className="border-b border-border">
          <nav className="-mb-px flex" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => changeTab(tab.id)}
                className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
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
