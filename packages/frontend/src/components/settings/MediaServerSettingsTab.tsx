import { PlexSettingsTab } from "./PlexSettingsTab";
import { JellyfinSettingsTab } from "./JellyfinSettingsTab";
import type { PlexServer, Settings } from "@services/api";

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
  plexLinkError,
  settings,
  onJellyfinSettingsChange,
  onSettingsUpdated,
}: MediaServerSettingsTabProps) {
  return (
    <div className="space-y-8">
      {/* Plex Section */}
      <div>
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
          plexLinkError={plexLinkError}
          onSettingsUpdated={onSettingsUpdated}
        />
      </div>

      {/* Divider */}
      <div className="border-t dark:border-[#2d2d2d] border-gray-200"></div>

      {/* Jellyfin Section */}
      <div>
        <JellyfinSettingsTab
          settings={settings}
          onJellyfinSettingsChange={onJellyfinSettingsChange}
          onSettingsUpdated={onSettingsUpdated}
        />
      </div>
    </div>
  );
}
