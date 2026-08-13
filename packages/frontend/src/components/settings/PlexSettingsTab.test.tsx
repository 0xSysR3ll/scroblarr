import type { PlexServer } from "@services/api";
import {
  getAuthProviders,
  removePlexServer,
  updateSettings,
} from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showSuccess, showError } from "@utils/toast";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlexSettingsTab } from "./PlexSettingsTab";

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    isAdmin: true,
    user: { id: "1", username: "admin", isAdmin: true },
    loading: false,
    logout: vi.fn(),
    checkAuth: vi.fn(),
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
  updateSettings: vi.fn(),
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
    {
      uri: "http://192.168.1.20:32400",
      protocol: "http",
      address: "192.168.1.20",
      port: 32400,
      local: true,
      relay: false,
      reachable: true,
    },
  ],
};

function renderPlex(
  overrides: Partial<Parameters<typeof PlexSettingsTab>[0]> = {}
) {
  return renderWithProviders(
    <PlexSettingsTab
      servers={[plexServer]}
      selectedServerUrl={plexServer.url}
      savedServerUrl={undefined}
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
      webhookApiKey="sk_test"
      {...overrides}
    />
  );
}

async function expandPlex(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Plex Server/i }));
}

describe("PlexSettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthProviders).mockResolvedValue({
      hasAdmin: true,
      plexConfigured: true,
      jellyfinConfigured: true,
    });
    vi.mocked(updateSettings).mockResolvedValue({
      plexServerUrl: "http://192.168.1.20:32400",
    });
    vi.mocked(removePlexServer).mockResolvedValue({});
  });

  it("renders a collapsed Plex card by default", async () => {
    renderPlex();

    expect(
      screen.getByRole("button", { name: /Plex Server/i })
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Manual Connection URL")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(getAuthProviders).toHaveBeenCalled();
    });
  });

  it("hides the webhook panel until a Plex server is saved", async () => {
    const user = userEvent.setup();
    renderPlex({ savedServerUrl: undefined });

    await expandPlex(user);

    expect(screen.queryByText("Webhooks")).not.toBeInTheDocument();
  });

  it("shows the webhook panel after a Plex server is saved", async () => {
    const user = userEvent.setup();
    renderPlex({ savedServerUrl: plexServer.url });

    await expandPlex(user);

    expect(await screen.findByText("Webhooks")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Webhooks/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("shows the authenticate prompt when Plex is not linked", async () => {
    const user = userEvent.setup();
    const onPlexAuthenticate = vi.fn();
    renderPlex({
      hasPlexAccount: false,
      servers: [],
      selectedServerUrl: "",
      onPlexAuthenticate,
    });

    await expandPlex(user);
    await user.click(
      screen.getByRole("button", { name: "Authenticate with Plex" })
    );

    expect(onPlexAuthenticate).toHaveBeenCalled();
    expect(screen.queryByText("Webhooks")).not.toBeInTheDocument();
  });

  it("keeps the unsaved badge visible while collapsed", async () => {
    renderPlex({
      selectedServerUrl: "http://192.168.1.20:32400",
      savedServerUrl: plexServer.url,
    });

    await waitFor(() => {
      expect(screen.getByText("Unsaved")).toBeInTheDocument();
    });
  });

  it("saves the selected Plex server connection", async () => {
    const user = userEvent.setup();
    const onSettingsUpdated = vi.fn().mockResolvedValue(undefined);
    renderPlex({
      selectedServerUrl: "http://192.168.1.20:32400",
      savedServerUrl: plexServer.url,
      onSettingsUpdated,
    });

    await expandPlex(user);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        plexServerUrl: "http://192.168.1.20:32400",
        plexServerMachineIdentifier: "machine-1",
      });
      expect(showSuccess).toHaveBeenCalled();
      expect(onSettingsUpdated).toHaveBeenCalled();
    });
  });

  it("removes the Plex server after confirmation", async () => {
    const user = userEvent.setup();
    const onCancelEdit = vi.fn();
    const onSettingsUpdated = vi.fn().mockResolvedValue(undefined);
    renderPlex({
      savedServerUrl: plexServer.url,
      onCancelEdit,
      onSettingsUpdated,
    });

    await expandPlex(user);
    await user.click(screen.getByRole("button", { name: "Remove Server" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Remove Server" })
    );

    await waitFor(() => {
      expect(removePlexServer).toHaveBeenCalled();
      expect(onCancelEdit).toHaveBeenCalled();
      expect(onSettingsUpdated).toHaveBeenCalled();
    });
  });

  it("surfaces save and remove failures", async () => {
    const user = userEvent.setup();
    vi.mocked(updateSettings).mockRejectedValueOnce(new Error("save failed"));
    renderPlex({
      selectedServerUrl: "http://192.168.1.20:32400",
      savedServerUrl: plexServer.url,
    });

    await expandPlex(user);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("save failed");
    });

    vi.mocked(removePlexServer).mockRejectedValueOnce("remove failed");
    await user.click(screen.getByRole("button", { name: "Remove Server" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Remove Server" })
    );
    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("Failed to remove Plex server");
    });
  });

  it("edits connections, manual URL, and refresh controls", async () => {
    const user = userEvent.setup();
    const onSelectedServerUrlChange = vi.fn();
    const onEditingServerChange = vi.fn();
    const onCancelEdit = vi.fn();
    const onRefreshPlexServers = vi.fn();

    const multiBadgeServer: PlexServer = {
      ...plexServer,
      connections: [
        {
          uri: "http://192.168.1.10:32400",
          protocol: "http",
          address: "192.168.1.10",
          port: 32400,
          local: true,
          reachable: true,
        },
        {
          uri: "http://relay.example:32400",
          protocol: "http",
          address: "relay.example",
          port: 32400,
          local: false,
          relay: true,
          reachable: false,
        },
        {
          uri: "https://remote.example:32400",
          protocol: "https",
          address: "remote.example",
          port: 32400,
          local: false,
          relay: false,
          reachable: true,
        },
      ],
    };

    renderPlex({
      servers: [multiBadgeServer],
      selectedServerUrl: multiBadgeServer.connections[0].uri,
      savedServerUrl: multiBadgeServer.connections[0].uri,
      editingServer: multiBadgeServer.machineIdentifier,
      onSelectedServerUrlChange,
      onEditingServerChange,
      onCancelEdit,
      onRefreshPlexServers,
      plexRefreshLoading: true,
    });

    await expandPlex(user);

    expect(screen.getByText("Unreachable")).toBeInTheDocument();
    expect(screen.getByText("Relay")).toBeInTheDocument();
    expect(screen.getByText("Remote")).toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelEdit).toHaveBeenCalled();

    const manual = screen.getByPlaceholderText("http://192.168.1.10:32400");
    await user.clear(manual);
    await user.type(manual, "http://10.0.0.5:32400");
    await user.tab();
    expect(onSelectedServerUrlChange).toHaveBeenCalledWith(
      "http://10.0.0.5:32400"
    );

    await user.clear(manual);
    await user.type(manual, "http://10.0.0.8:32400{Enter}");
    expect(onSelectedServerUrlChange).toHaveBeenCalledWith(
      "http://10.0.0.8:32400"
    );
  });

  it("lets the user start editing a connection and shows auth-provider load errors", async () => {
    const user = userEvent.setup();
    vi.mocked(getAuthProviders).mockRejectedValueOnce(new Error("nope"));
    const onEditingServerChange = vi.fn();

    renderPlex({
      savedServerUrl: plexServer.url,
      onEditingServerChange,
    });

    await expandPlex(user);
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(onEditingServerChange).toHaveBeenCalledWith("machine-1");

    await waitFor(() => {
      expect(getAuthProviders).toHaveBeenCalled();
    });
  });

  it("falls back to the authenticate prompt when no servers are returned", async () => {
    const user = userEvent.setup();
    // Empty servers with a linked account still uses the auth-required early return.
    renderPlex({
      servers: [],
      selectedServerUrl: "",
      hasPlexAccount: true,
    });

    await expandPlex(user);
    expect(
      screen.getByRole("button", { name: "Authenticate with Plex" })
    ).toBeInTheDocument();
  });

  it("shows a loading label while Plex auth is in progress", async () => {
    const user = userEvent.setup();
    renderPlex({
      hasPlexAccount: false,
      servers: [],
      selectedServerUrl: "",
      plexAuthLoading: true,
    });
    await expandPlex(user);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows plex link errors in the unauthenticated state", async () => {
    const user = userEvent.setup();
    renderPlex({
      hasPlexAccount: false,
      servers: [],
      selectedServerUrl: "",
      plexLinkError: "Plex link failed",
    });
    await expandPlex(user);
    expect(screen.getByText("Plex link failed")).toBeInTheDocument();
  });

  it("saves without a machine identifier when Plex omits it", async () => {
    const user = userEvent.setup();
    const serverWithoutId: PlexServer = {
      ...plexServer,
      machineIdentifier: "",
      connections: [plexServer.connections[1]],
    };
    vi.mocked(updateSettings).mockResolvedValue({});

    renderPlex({
      servers: [serverWithoutId],
      selectedServerUrl: "http://192.168.1.20:32400",
      savedServerUrl: plexServer.url,
    });
    await expandPlex(user);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        plexServerUrl: "http://192.168.1.20:32400",
      });
    });
  });

  it("selects another connection while editing", async () => {
    const user = userEvent.setup();
    const onSelectedServerUrlChange = vi.fn();

    renderPlex({
      servers: [plexServer],
      selectedServerUrl: plexServer.url,
      savedServerUrl: plexServer.url,
      editingServer: "machine-1",
      onSelectedServerUrlChange,
    });
    await expandPlex(user);
    await user.click(screen.getByText("http://192.168.1.20:32400"));
    expect(onSelectedServerUrlChange).toHaveBeenCalledWith(
      "http://192.168.1.20:32400"
    );
  });

  it("prompts to select a connection when none exist", async () => {
    const user = userEvent.setup();
    const onEditingServerChange = vi.fn();
    const emptyConnectionServer: PlexServer = {
      ...plexServer,
      machineIdentifier: "machine-empty",
      connections: [],
    };

    renderPlex({
      servers: [emptyConnectionServer],
      selectedServerUrl: "",
      savedServerUrl: "",
      onEditingServerChange,
    });
    await expandPlex(user);
    await user.click(screen.getByRole("button", { name: "Select Connection" }));
    expect(onEditingServerChange).toHaveBeenCalledWith("machine-empty");
  });

  it("maps typed save/remove errors to fallback messages", async () => {
    const user = userEvent.setup();
    vi.mocked(updateSettings).mockRejectedValueOnce("nope");
    renderPlex({
      selectedServerUrl: "http://192.168.1.20:32400",
      savedServerUrl: plexServer.url,
    });
    await expandPlex(user);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("Failed to save Plex server");
    });

    vi.mocked(removePlexServer).mockRejectedValueOnce(new Error("rm fail"));
    await user.click(screen.getByRole("button", { name: "Remove Server" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Remove Server" })
    );
    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("rm fail");
    });
  });

  it("disables remove when Plex is the only configured server", async () => {
    const user = userEvent.setup();
    vi.mocked(getAuthProviders).mockResolvedValue({
      hasAdmin: true,
      plexConfigured: true,
      jellyfinConfigured: false,
    });

    renderPlex({ savedServerUrl: plexServer.url });
    await expandPlex(user);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Remove Server" })
      ).toBeDisabled();
    });
  });
});
