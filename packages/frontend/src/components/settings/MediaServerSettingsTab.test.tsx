import type { PlexServer, Settings } from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildPlexWebhookUrl } from "@utils/webhooks";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MediaServerSettingsTab } from "./MediaServerSettingsTab";

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    isAdmin: true,
    checkAuth: vi.fn(),
    user: { id: "1", username: "admin", isAdmin: true },
    loading: false,
    logout: vi.fn(),
    setUserFromLogin: vi.fn(),
    isAuthenticated: true,
  })),
}));

vi.mock("@services/api", () => ({
  getAuthProviders: vi.fn().mockResolvedValue({
    hasAdmin: true,
    plexConfigured: true,
    jellyfinConfigured: true,
  }),
  removePlexServer: vi.fn(),
  removeJellyfinServer: vi.fn(),
  updateSettings: vi.fn(),
  linkJellyfinAccount: vi.fn(),
}));

vi.mock("@utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const plexServer: PlexServer = {
  name: "Home Plex",
  address: "192.168.1.10",
  port: "32400",
  version: "1.40.0",
  machineIdentifier: "machine-1",
  url: "http://192.168.1.10:32400",
  connections: [
    {
      uri: "http://192.168.1.10:32400",
      protocol: "http",
      address: "192.168.1.10",
      port: 32400,
      local: true,
      relay: false,
      reachable: true,
    },
  ],
};

const settings: Settings = {
  plexServerUrl: plexServer.url,
  jellyfinHost: "http://jellyfin.local:8096",
  jellyfinPort: "8096",
  jellyfinUseSsl: "false",
  jellyfinApiKey: "jellyfin-key",
  apiKey: "sk_admin",
};

describe("MediaServerSettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders collapsed Plex and Jellyfin cards and wires the webhook API key", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MediaServerSettingsTab
        servers={[plexServer]}
        selectedServerUrl={plexServer.url}
        savedServerUrl={plexServer.url}
        editingServer={null}
        onSelectedServerUrlChange={vi.fn()}
        onEditingServerChange={vi.fn()}
        onCancelEdit={vi.fn()}
        hasPlexAccount
        onPlexAuthenticate={vi.fn()}
        plexAuthLoading={false}
        plexRefreshLoading={false}
        onRefreshPlexServers={vi.fn()}
        plexLinkError={null}
        settings={settings}
        onJellyfinSettingsChange={vi.fn()}
        webhookApiKey="sk_webhook"
      />
    );

    expect(
      screen.getByRole("button", { name: /Plex Server/i })
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: /Jellyfin Server/i })
    ).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("button", { name: /Plex Server/i }));
    await user.click(screen.getByRole("button", { name: /Webhooks/i }));

    expect(screen.getByLabelText("Webhook URL")).toHaveValue(
      buildPlexWebhookUrl("sk_webhook")
    );
  });

  it("renders the Emby card instead of Jellyfin when Emby is configured", () => {
    renderWithProviders(
      <MediaServerSettingsTab
        servers={[plexServer]}
        selectedServerUrl={plexServer.url}
        savedServerUrl={plexServer.url}
        editingServer={null}
        onSelectedServerUrlChange={vi.fn()}
        onEditingServerChange={vi.fn()}
        onCancelEdit={vi.fn()}
        hasPlexAccount
        onPlexAuthenticate={vi.fn()}
        plexAuthLoading={false}
        plexRefreshLoading={false}
        onRefreshPlexServers={vi.fn()}
        plexLinkError={null}
        settings={{
          ...settings,
          mediaBrowserType: "emby",
        }}
        onJellyfinSettingsChange={vi.fn()}
        webhookApiKey="sk_webhook"
      />
    );

    expect(
      screen.getByRole("button", { name: /Emby Server/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Jellyfin Server/i })
    ).not.toBeInTheDocument();
  });

  it("keeps Jellyfin and Emby draft forms mutually exclusive when unconfigured", async () => {
    const user = userEvent.setup();
    const onJellyfinSettingsChange = vi.fn();

    renderWithProviders(
      <MediaServerSettingsTab
        servers={[]}
        selectedServerUrl=""
        editingServer={null}
        onSelectedServerUrlChange={vi.fn()}
        onEditingServerChange={vi.fn()}
        onCancelEdit={vi.fn()}
        hasPlexAccount={false}
        onPlexAuthenticate={vi.fn()}
        plexAuthLoading={false}
        plexRefreshLoading={false}
        onRefreshPlexServers={vi.fn()}
        plexLinkError={null}
        settings={{}}
        onJellyfinSettingsChange={onJellyfinSettingsChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /Jellyfin Server/i }));
    await user.click(
      screen.getByRole("button", { name: /Add Jellyfin Server/i })
    );

    expect(screen.getByLabelText(/Server Hostname/i)).toBeInTheDocument();
    expect(
      onJellyfinSettingsChange.mock.calls[
        onJellyfinSettingsChange.mock.calls.length - 1
      ]?.[0]
    ).toMatchObject({
      mediaBrowserType: "jellyfin",
    });

    await user.click(screen.getByRole("button", { name: /Emby Server/i }));
    await user.click(screen.getByRole("button", { name: /Add Emby Server/i }));

    expect(screen.getByLabelText(/Server Hostname/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add Jellyfin Server/i })
    ).toBeInTheDocument();
    expect(
      onJellyfinSettingsChange.mock.calls[
        onJellyfinSettingsChange.mock.calls.length - 1
      ]?.[0]
    ).toMatchObject({
      mediaBrowserType: "emby",
    });
  });
});
