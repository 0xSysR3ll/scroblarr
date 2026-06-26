import { testTmdbConnection } from "@services/api/settings";
import { renderWithProviders } from "@test/render";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError, showSuccess } from "@utils/toast";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GeneralSettingsTab } from "./GeneralSettingsTab";

vi.mock("@services/api/settings", () => ({
  testTmdbConnection: vi.fn(),
}));

vi.mock("@utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

describe("GeneralSettingsTab", () => {
  const onSyncHistoryLimitChange = vi.fn();
  const onApiKeyChange = vi.fn();
  const onTmdbAccessTokenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderTab(
    overrides: Partial<{
      tmdbAccessToken: string;
    }> = {}
  ) {
    renderWithProviders(
      <GeneralSettingsTab
        syncHistoryLimit={100}
        onSyncHistoryLimitChange={onSyncHistoryLimitChange}
        apiKey="sk_test"
        onApiKeyChange={onApiKeyChange}
        tmdbAccessToken={overrides.tmdbAccessToken ?? ""}
        onTmdbAccessTokenChange={onTmdbAccessTokenChange}
      />
    );
  }

  it("renders TMDB settings and updates the token field", async () => {
    const user = userEvent.setup();
    renderTab();

    expect(
      screen.getByLabelText("TMDB API Read Access Token")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Get a token from TMDB" })
    ).toHaveAttribute("href", "https://www.themoviedb.org/settings/api");

    await user.type(
      screen.getByLabelText("TMDB API Read Access Token"),
      "draft-token"
    );
    expect(onTmdbAccessTokenChange).toHaveBeenCalled();
  });

  it("tests the TMDB connection successfully", async () => {
    const user = userEvent.setup();
    vi.mocked(testTmdbConnection).mockResolvedValue({ success: true });
    renderTab({ tmdbAccessToken: "draft-token" });

    await user.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => {
      expect(testTmdbConnection).toHaveBeenCalledWith("draft-token");
      expect(showSuccess).toHaveBeenCalledWith("TMDB connection successful");
    });
  });

  it("shows an error when the TMDB connection test fails", async () => {
    const user = userEvent.setup();
    vi.mocked(testTmdbConnection).mockRejectedValue(
      new Error("Invalid TMDB access token")
    );
    renderTab({ tmdbAccessToken: "bad-token" });

    await user.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("Invalid TMDB access token");
    });
  });

  it("toggles TMDB token visibility", async () => {
    const user = userEvent.setup();
    renderTab({ tmdbAccessToken: "secret-token" });

    const tokenInput = screen.getByLabelText("TMDB API Read Access Token");
    expect(tokenInput).toHaveAttribute("type", "password");

    await user.click(
      screen.getByRole("button", { name: "Show TMDB access token" })
    );
    expect(tokenInput).toHaveAttribute("type", "text");
  });
});
