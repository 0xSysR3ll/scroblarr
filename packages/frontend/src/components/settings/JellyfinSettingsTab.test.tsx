import type { Settings } from "@services/api";
import {
  getAuthProviders,
  linkJellyfinAccount,
  removeJellyfinServer,
} from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showSuccess, showError } from "@utils/toast";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JellyfinSettingsTab } from "./JellyfinSettingsTab";

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
  linkJellyfinAccount: vi.fn(),
  removeJellyfinServer: vi.fn(),
}));

vi.mock("@utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const configuredSettings: Settings = {
  jellyfinHost: "http://jellyfin.local:8096",
  jellyfinPort: "8096",
  jellyfinUseSsl: "false",
  jellyfinUrlBase: "",
  jellyfinApiKey: "jellyfin-key",
};

function renderJellyfin(
  overrides: Partial<{
    settings: Settings;
    scroblarrApiKey?: string;
    onJellyfinSettingsChange?: ReturnType<typeof vi.fn>;
    onSettingsUpdated?: ReturnType<typeof vi.fn>;
  }> = {}
) {
  return renderWithProviders(
    <JellyfinSettingsTab
      settings={overrides.settings ?? {}}
      onJellyfinSettingsChange={overrides.onJellyfinSettingsChange ?? vi.fn()}
      onSettingsUpdated={overrides.onSettingsUpdated}
      scroblarrApiKey={overrides.scroblarrApiKey ?? "sk_test"}
    />
  );
}

async function expandJellyfin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Jellyfin Server/i }));
}

describe("JellyfinSettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthProviders).mockResolvedValue({
      hasAdmin: true,
      plexConfigured: true,
      jellyfinConfigured: true,
    });
    vi.mocked(removeJellyfinServer).mockResolvedValue({});
    vi.mocked(linkJellyfinAccount).mockResolvedValue(undefined as never);
  });

  it("renders a collapsed Jellyfin card by default", async () => {
    renderJellyfin();

    expect(
      screen.getByRole("button", { name: /Jellyfin Server/i })
    ).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => {
      expect(getAuthProviders).toHaveBeenCalled();
    });
  });

  it("hides the webhook panel when Jellyfin is not saved", async () => {
    const user = userEvent.setup();
    renderJellyfin({ settings: {} });

    await expandJellyfin(user);
    await user.click(
      screen.getByRole("button", { name: "Add Jellyfin Server" })
    );

    expect(
      screen.getByPlaceholderText("jellyfin.example.com")
    ).toBeInTheDocument();
    expect(screen.queryByText("Webhooks")).not.toBeInTheDocument();
  });

  it("shows the webhook panel when Jellyfin host and API key are saved", async () => {
    const user = userEvent.setup();
    renderJellyfin({ settings: configuredSettings });

    await expandJellyfin(user);

    expect(await screen.findByText("Webhooks")).toBeInTheDocument();
  });

  it("updates connection fields and notifies the parent", async () => {
    const user = userEvent.setup();
    const onJellyfinSettingsChange = vi.fn();
    renderJellyfin({
      settings: configuredSettings,
      onJellyfinSettingsChange,
    });

    await expandJellyfin(user);

    const host = screen.getByPlaceholderText("jellyfin.example.com");
    await user.clear(host);
    await user.type(host, "jellyfin.example.com");

    await waitFor(() => {
      expect(onJellyfinSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: "jellyfin.example.com",
          apiKey: "jellyfin-key",
        })
      );
    });
  });

  it("removes the Jellyfin server after confirmation", async () => {
    const user = userEvent.setup();
    const onSettingsUpdated = vi.fn();
    renderJellyfin({
      settings: configuredSettings,
      onSettingsUpdated,
    });

    await expandJellyfin(user);
    await user.click(screen.getByRole("button", { name: "Remove Server" }));

    const dialog = await screen.findByRole("dialog");
    const confirm = Array.from(dialog.querySelectorAll("button")).find((btn) =>
      (btn.textContent ?? "").includes("Remove Server")
    );
    expect(confirm).toBeTruthy();
    await user.click(confirm!);

    await waitFor(() => {
      expect(removeJellyfinServer).toHaveBeenCalled();
      expect(showSuccess).toHaveBeenCalled();
      expect(onSettingsUpdated).toHaveBeenCalled();
    });
  });

  it("toggles SSL, port, URL base, and API key visibility", async () => {
    const user = userEvent.setup();
    const onJellyfinSettingsChange = vi.fn();
    renderJellyfin({
      settings: {
        jellyfinHost: "https://jellyfin.local:8920/jellyfin",
        jellyfinUseSsl: "true",
        jellyfinUrlBase: "/jellyfin",
        jellyfinApiKey: "jellyfin-key",
      },
      onJellyfinSettingsChange,
    });

    await expandJellyfin(user);

    expect(
      screen.getByText(/https:\/\/jellyfin.local:8920\/jellyfin/)
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText("Use SSL"));
    await waitFor(() => {
      expect(onJellyfinSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ useSsl: false, port: 8096 })
      );
    });

    const port = screen.getByDisplayValue("8096");
    await user.clear(port);
    await user.type(port, "8097");

    const urlBase = screen.getByPlaceholderText("/jellyfin");
    await user.clear(urlBase);
    await user.type(urlBase, "/media");

    const apiKeyToggle = screen.getByRole("button", {
      name: /Show (API key|password)/i,
    });
    await user.click(apiKeyToggle);
    expect(screen.getByDisplayValue("jellyfin-key")).toHaveAttribute(
      "type",
      "text"
    );
  });

  it("parses a host port when jellyfinPort is omitted", async () => {
    const user = userEvent.setup();
    renderJellyfin({
      settings: {
        jellyfinHost: "http://jellyfin.local:18096",
        jellyfinApiKey: "key",
      },
    });

    await expandJellyfin(user);
    expect(screen.getByDisplayValue("18096")).toBeInTheDocument();
  });

  it("generates a Jellyfin API key via login and handles failures", async () => {
    const user = userEvent.setup();
    const onSettingsUpdated = vi.fn();
    renderJellyfin({
      settings: {},
      onSettingsUpdated,
    });

    await expandJellyfin(user);
    await user.click(
      screen.getByRole("button", { name: "Add Jellyfin Server" })
    );

    const host = screen.getByPlaceholderText("jellyfin.example.com");
    await user.clear(host);
    await user.type(host, "jf");
    await user.type(screen.getByPlaceholderText("Username"), "admin");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    const passwordToggle = screen.getAllByRole("button", {
      name: /Show password/i,
    })[0];
    await user.click(passwordToggle);
    expect(screen.getByPlaceholderText("Password")).toHaveAttribute(
      "type",
      "text"
    );
    await user.click(
      screen.getAllByRole("button", { name: /Hide password/i })[0]
    );

    await user.click(
      screen.getByRole("button", { name: "Login & Generate API Key" })
    );

    await waitFor(() => {
      expect(linkJellyfinAccount).toHaveBeenCalledWith(
        "admin",
        "secret",
        "jf",
        8096,
        false,
        ""
      );
      expect(showSuccess).toHaveBeenCalled();
      expect(onSettingsUpdated).toHaveBeenCalled();
    });

    vi.mocked(linkJellyfinAccount).mockRejectedValueOnce(
      new Error("bad creds")
    );
    await user.clear(screen.getByPlaceholderText("Username"));
    await user.clear(screen.getByPlaceholderText("Password"));
    await user.type(screen.getByPlaceholderText("Username"), "admin");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(
      screen.getByRole("button", { name: "Login & Generate API Key" })
    );
    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("bad creds");
    });

    vi.mocked(linkJellyfinAccount).mockRejectedValueOnce("offline");
    await user.clear(screen.getByPlaceholderText("Username"));
    await user.clear(screen.getByPlaceholderText("Password"));
    await user.type(screen.getByPlaceholderText("Username"), "admin");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(
      screen.getByRole("button", { name: "Login & Generate API Key" })
    );
    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("Failed to login");
    });
  });

  it("ignores auth-provider load errors", async () => {
    vi.mocked(getAuthProviders).mockRejectedValueOnce(new Error("offline"));
    renderJellyfin({ settings: configuredSettings });

    await waitFor(() => {
      expect(getAuthProviders).toHaveBeenCalled();
    });
    expect(
      screen.getByRole("button", { name: /Jellyfin Server/i })
    ).toBeInTheDocument();
  });

  it("surfaces remove failures", async () => {
    const user = userEvent.setup();
    vi.mocked(removeJellyfinServer).mockRejectedValueOnce("boom");

    renderJellyfin({ settings: configuredSettings });
    await expandJellyfin(user);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Remove Server" })
      ).not.toBeDisabled();
    });
    await user.click(screen.getByRole("button", { name: "Remove Server" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Remove Server" })
    );

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        "Failed to remove Jellyfin server"
      );
    });
  });

  it("surfaces typed remove errors from Jellyfin", async () => {
    const user = userEvent.setup();
    vi.mocked(removeJellyfinServer).mockRejectedValueOnce(
      new Error("delete blocked")
    );

    renderJellyfin({ settings: configuredSettings });
    await expandJellyfin(user);
    await user.click(screen.getByRole("button", { name: "Remove Server" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Remove Server" })
    );

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("delete blocked");
    });
  });
});
