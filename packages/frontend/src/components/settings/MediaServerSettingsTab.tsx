import type { PlexServer, Settings } from "@services/api";
import { useState } from "react";

import { JellyfinSettingsTab } from "./JellyfinSettingsTab";
import { PlexSettingsTab } from "./PlexSettingsTab";

interface MediaServerSettingsTabProps {
  // Plex props
  servers: PlexServer[];
  selectedServerUrl: string;
  savedServerUrl?: string;
  editingServer: string | null;
  onSelectedServerUrlChange: (url: string) => void;
  onEditingServerChange: (serverId: string | null) => void;
  onCancelEdit: () => void;
  hasPlexAccount: boolean;
  onPlexAuthenticate: () => void;
  plexAuthLoading: boolean;
  plexRefreshLoading: boolean;
  onRefreshPlexServers: () => void;
  plexLinkError: string | null;
  settings: Settings;
  onJellyfinSettingsChange: (settings: {
    hostname: string;
    port: number;
    useSsl: boolean;
    urlBase: string;
    apiKey: string;
    mediaBrowserType: "jellyfin" | "emby";
  }) => void;
  onSettingsUpdated?: () => void;
  webhookApiKey?: string;
}

export function MediaServerSettingsTab({
  servers,
  selectedServerUrl,
  savedServerUrl,
  editingServer,
  onSelectedServerUrlChange,
  onEditingServerChange,
  onCancelEdit,
  hasPlexAccount,
  onPlexAuthenticate,
  plexAuthLoading,
  plexRefreshLoading,
  onRefreshPlexServers,
  plexLinkError,
  settings,
  onJellyfinSettingsChange,
  onSettingsUpdated,
  webhookApiKey,
}: MediaServerSettingsTabProps) {
  const configuredType = settings.jellyfinHost
    ? settings.mediaBrowserType === "emby"
      ? "emby"
      : "jellyfin"
    : null;
  const showJellyfin = configuredType === null || configuredType === "jellyfin";
  const showEmby = configuredType === null || configuredType === "emby";
  const [draftProvider, setDraftProvider] = useState<
    "jellyfin" | "emby" | null
  >(null);

  return (
    <div className="space-y-4">
      <PlexSettingsTab
        servers={servers}
        selectedServerUrl={selectedServerUrl}
        savedServerUrl={savedServerUrl}
        editingServer={editingServer}
        onSelectedServerUrlChange={onSelectedServerUrlChange}
        onEditingServerChange={onEditingServerChange}
        onCancelEdit={onCancelEdit}
        hasPlexAccount={hasPlexAccount}
        onPlexAuthenticate={onPlexAuthenticate}
        plexAuthLoading={plexAuthLoading}
        plexRefreshLoading={plexRefreshLoading}
        onRefreshPlexServers={onRefreshPlexServers}
        plexLinkError={plexLinkError}
        onSettingsUpdated={onSettingsUpdated}
        webhookApiKey={webhookApiKey}
      />

      {showJellyfin && (
        <JellyfinSettingsTab
          settings={settings}
          mediaBrowserType="jellyfin"
          formOpen={
            configuredType !== null ? true : draftProvider === "jellyfin"
          }
          onFormOpenChange={() => {
            if (configuredType === null) {
              setDraftProvider("jellyfin");
            }
          }}
          onJellyfinSettingsChange={onJellyfinSettingsChange}
          onSettingsUpdated={onSettingsUpdated}
          webhookApiKey={webhookApiKey}
        />
      )}

      {showEmby && (
        <JellyfinSettingsTab
          settings={settings}
          mediaBrowserType="emby"
          formOpen={configuredType !== null ? true : draftProvider === "emby"}
          onFormOpenChange={() => {
            if (configuredType === null) {
              setDraftProvider("emby");
            }
          }}
          onJellyfinSettingsChange={onJellyfinSettingsChange}
          onSettingsUpdated={onSettingsUpdated}
          webhookApiKey={webhookApiKey}
        />
      )}
    </div>
  );
}
