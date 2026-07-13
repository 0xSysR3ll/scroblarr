import { useAuth } from "@contexts/AuthContext";
import { getSettings, updateSettings } from "@services/api";
import { getAppVersion } from "@services/api/meta";
import { renderWithProviders } from "@test/render";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@services/api", () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  getPlexServers: vi.fn().mockResolvedValue([]),
  linkPlexAccount: vi.fn(),
  removePlexServer: vi.fn(),
  removeJellyfinServer: vi.fn(),
}));

vi.mock("@services/api/meta", () => ({
  getAppVersion: vi.fn(),
}));

vi.mock("@hooks/auth/usePlexLogin", () => ({
  usePlexLogin: vi.fn(() => ({
    loading: false,
    login: vi.fn(),
  })),
}));

vi.mock("@utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "admin-1", username: "admin", isAdmin: true },
      loading: false,
      logout: vi.fn(),
      checkAuth: vi.fn(),
      setUserFromLogin: vi.fn(),
      isAuthenticated: true,
      isAdmin: true,
    });
    vi.mocked(getSettings).mockResolvedValue({
      syncHistoryLimit: "100",
      tmdbAccessToken: "saved-token",
    });
    vi.mocked(getAppVersion).mockResolvedValue({
      version: "1.0.0",
      tag: "v1.0.0",
      githubRepository: "0xsysr3ll/scroblarr",
    });
    vi.mocked(updateSettings).mockResolvedValue({
      syncHistoryLimit: "100",
      tmdbAccessToken: "saved-token",
    });
  });

  it("includes the TMDB token in general settings saves when present", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />, { route: "/settings?tab=general" });

    await waitFor(() => {
      expect(screen.getByLabelText("TMDB API Read Access Token")).toHaveValue(
        "saved-token"
      );
    });

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          syncHistoryLimit: 100,
          tmdbAccessToken: "saved-token",
        })
      );
    });
  });

  it("omits the TMDB token from saves when the field is empty", async () => {
    vi.mocked(getSettings).mockResolvedValue({
      syncHistoryLimit: "100",
    });

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />, { route: "/settings?tab=general" });

    await waitFor(() => {
      expect(screen.getByLabelText("TMDB API Read Access Token")).toHaveValue(
        ""
      );
    });

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        syncHistoryLimit: 100,
      });
      expect(updateSettings).toHaveBeenCalledWith(
        expect.not.objectContaining({
          tmdbAccessToken: expect.anything(),
        })
      );
    });
  });

  it("saves an edited TMDB token from the general settings tab", async () => {
    vi.mocked(updateSettings).mockResolvedValue({
      syncHistoryLimit: "100",
      tmdbAccessToken: "updated-token",
    });

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />, { route: "/settings?tab=general" });

    const tokenInput = await screen.findByLabelText(
      "TMDB API Read Access Token"
    );
    await user.clear(tokenInput);
    await user.type(tokenInput, "updated-token");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          syncHistoryLimit: 100,
          tmdbAccessToken: "updated-token",
        })
      );
    });
  });

  it("clears a saved TMDB token when the field is emptied", async () => {
    vi.mocked(updateSettings).mockResolvedValue({
      syncHistoryLimit: "100",
    });

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />, { route: "/settings?tab=general" });

    const tokenInput = await screen.findByLabelText(
      "TMDB API Read Access Token"
    );
    await waitFor(() => {
      expect(tokenInput).toHaveValue("saved-token");
    });
    await user.clear(tokenInput);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        syncHistoryLimit: 100,
        tmdbAccessToken: "",
      });
    });
  });

  it("includes the API key in general settings saves when present", async () => {
    vi.mocked(getSettings).mockResolvedValue({
      syncHistoryLimit: "100",
      apiKey: "sk_saved",
    });
    vi.mocked(updateSettings).mockResolvedValue({
      syncHistoryLimit: "100",
      apiKey: "sk_saved",
    });

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />, { route: "/settings?tab=general" });

    await waitFor(() => {
      expect(screen.getByLabelText("API Key")).toHaveValue("sk_saved");
    });

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        syncHistoryLimit: 100,
        apiKey: "sk_saved",
      });
    });
  });
});
