import type { PlexServer, Settings } from "@services/api";

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
  // Jellyfin props
  settings: Settings;
  onJellyfinSettingsChange: (settings: {
    hostname: string;
    port: number;
    useSsl: boolean;
    urlBase: string;
    apiKey: string;
  }) => void;
  onSettingsUpdated?: () => void;
  /** Scroblarr Settings → General API key used for webhook auth. */
  scroblarrApiKey?: string;
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
  scroblarrApiKey,
}: MediaServerSettingsTabProps) {
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
        scroblarrApiKey={scroblarrApiKey}
      />

      <JellyfinSettingsTab
        settings={settings}
        onJellyfinSettingsChange={onJellyfinSettingsChange}
        onSettingsUpdated={onSettingsUpdated}
        scroblarrApiKey={scroblarrApiKey}
      />
    </div>
  );
}
