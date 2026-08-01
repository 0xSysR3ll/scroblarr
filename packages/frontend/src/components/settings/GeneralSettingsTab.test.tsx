import { testTmdbConnection } from "@services/api/settings";
import { renderWithProviders } from "@test/render";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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

  it("describes the API key as required for webhooks", () => {
    renderTab();

    expect(
      screen.getByText(/Used for media-server webhooks and API authentication/)
    ).toBeInTheDocument();
  });

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

    await user.click(
      screen.getByRole("button", { name: "Hide TMDB access token" })
    );
    expect(tokenInput).toHaveAttribute("type", "password");
  });

  it("tests TMDB connection without a draft token", async () => {
    const user = userEvent.setup();
    vi.mocked(testTmdbConnection).mockResolvedValue({ success: true });
    renderTab();

    await user.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => {
      expect(testTmdbConnection).toHaveBeenCalledWith(undefined);
    });
  });

  it("shows a generic error when TMDB test rejects with a non-Error value", async () => {
    const user = userEvent.setup();
    vi.mocked(testTmdbConnection).mockRejectedValue("broken");
    renderTab({ tmdbAccessToken: "bad-token" });

    await user.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("TMDB connection failed");
    });
  });

  it("shows a loading state while testing the TMDB connection", async () => {
    const user = userEvent.setup();
    let resolveTest: ((value: { success: boolean }) => void) | undefined;
    vi.mocked(testTmdbConnection).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTest = resolve;
        })
    );
    renderTab({ tmdbAccessToken: "draft-token" });

    await user.click(screen.getByRole("button", { name: "Test connection" }));

    expect(
      screen.getByRole("button", { name: "Loading Testing..." })
    ).toBeDisabled();

    resolveTest?.({ success: true });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Test connection" })
      ).not.toBeDisabled();
    });
  });

  it("updates the sync history limit", async () => {
    renderTab();

    fireEvent.change(screen.getByLabelText("Sync History Limit"), {
      target: { value: "250" },
    });

    expect(onSyncHistoryLimitChange).toHaveBeenCalledWith(250);
  });

  it("copies, generates, and toggles the API key", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    try {
      renderWithProviders(
        <GeneralSettingsTab
          syncHistoryLimit={100}
          onSyncHistoryLimitChange={onSyncHistoryLimitChange}
          apiKey="sk_test"
          onApiKeyChange={onApiKeyChange}
          tmdbAccessToken=""
          onTmdbAccessTokenChange={onTmdbAccessTokenChange}
        />
      );

      const apiKeyInput = screen.getByLabelText("API Key");
      expect(apiKeyInput).toHaveAttribute("type", "password");

      await user.click(screen.getByRole("button", { name: "Show API key" }));
      expect(apiKeyInput).toHaveAttribute("type", "text");

      await user.click(screen.getByRole("button", { name: "Copy" }));
      expect(writeText).toHaveBeenCalledWith("sk_test");
      expect(showSuccess).toHaveBeenCalledWith("API key copied to clipboard");

      await user.click(screen.getByRole("button", { name: "Generate" }));
      expect(onApiKeyChange).toHaveBeenCalledWith(
        expect.stringMatching(/^sk_/)
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("silently ignores clipboard failures when copying the API key", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    try {
      renderWithProviders(
        <GeneralSettingsTab
          syncHistoryLimit={100}
          onSyncHistoryLimitChange={onSyncHistoryLimitChange}
          apiKey="sk_test"
          onApiKeyChange={onApiKeyChange}
          tmdbAccessToken=""
          onTmdbAccessTokenChange={onTmdbAccessTokenChange}
        />
      );

      await user.click(screen.getByRole("button", { name: "Copy" }));
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith("sk_test");
      });
      expect(showSuccess).not.toHaveBeenCalledWith(
        "API key copied to clipboard"
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
