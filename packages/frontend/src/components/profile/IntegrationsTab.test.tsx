import {
  getSimklAuthorizeUrl,
  getSimklStatus,
  getTVTimeStatus,
  getTraktStatus,
  linkSimkl,
  unlinkSimkl,
} from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showSuccess } from "@utils/toast";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IntegrationsTab } from "./IntegrationsTab";

const oauthPopupMocks = vi.hoisted(() => ({
  preparePopup: vi.fn(),
  navigateToUrl: vi.fn(),
  closePopup: vi.fn(),
}));

vi.mock("@utils/OAuthPopup", () => ({
  OAuthPopup: class {
    preparePopup = oauthPopupMocks.preparePopup;
    navigateToUrl = oauthPopupMocks.navigateToUrl;
    closePopup = oauthPopupMocks.closePopup;
  },
}));

vi.mock("@utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("@services/api", () => ({
  getTVTimeStatus: vi.fn(),
  linkTVTime: vi.fn(),
  unlinkTVTime: vi.fn(),
  getTVTimeProfile: vi.fn(),
  getTraktStatus: vi.fn(),
  getTraktAuthorizeUrl: vi.fn(),
  linkTrakt: vi.fn(),
  unlinkTrakt: vi.fn(),
  getSimklStatus: vi.fn(),
  getSimklAuthorizeUrl: vi.fn(),
  linkSimkl: vi.fn(),
  unlinkSimkl: vi.fn(),
  updateProfile: vi.fn(),
}));

describe("IntegrationsTab Simkl integration", () => {
  const onProfileUpdated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTVTimeStatus).mockResolvedValue({
      linked: false,
      username: null,
      email: null,
    });
    vi.mocked(getTraktStatus).mockResolvedValue({
      linked: false,
      username: null,
      image: null,
      hasCredentials: false,
    });
    vi.mocked(getSimklStatus).mockResolvedValue({
      linked: false,
      username: null,
      image: null,
      hasCredentials: false,
    });
    oauthPopupMocks.preparePopup.mockReturnValue({ closed: false });
    onProfileUpdated.mockReset();
  });

  it("links a Simkl account after PIN approval", async () => {
    const user = userEvent.setup();
    vi.mocked(getSimklStatus)
      .mockResolvedValueOnce({
        linked: false,
        username: null,
        image: null,
        hasCredentials: false,
      })
      .mockResolvedValueOnce({
        linked: true,
        username: "simkl-user",
        image: "https://img.example/simkl.png",
        hasCredentials: true,
      });
    vi.mocked(getSimklAuthorizeUrl).mockResolvedValue({
      userCode: "ABCDE",
      verificationUrl: "https://simkl.com/pin/",
      expiresIn: 900,
      interval: 5,
    });
    vi.mocked(linkSimkl).mockResolvedValue({ success: true });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await user.type(
      await screen.findByPlaceholderText("Enter your Simkl Client ID"),
      "client-id"
    );
    const authorizeButtons = screen.getAllByRole("button", {
      name: "Authorize",
    });
    await user.click(authorizeButtons[authorizeButtons.length - 1]);

    expect(
      await screen.findByText("ABCDE", {}, { timeout: 2500 })
    ).toBeVisible();
    expect(oauthPopupMocks.navigateToUrl).toHaveBeenCalledWith(
      "https://simkl.com/pin/"
    );

    await user.click(
      screen.getByRole("button", { name: "Check approval now" })
    );

    await waitFor(() => {
      expect(linkSimkl).toHaveBeenCalledWith("ABCDE", "client-id");
      expect(showSuccess).toHaveBeenCalledWith(
        "Simkl account linked successfully"
      );
      expect(onProfileUpdated).toHaveBeenCalled();
    });
  });

  it("unlinks a linked Simkl account", async () => {
    const user = userEvent.setup();
    vi.mocked(getSimklStatus)
      .mockResolvedValueOnce({
        linked: true,
        username: "simkl-user",
        image: "https://img.example/simkl.png",
        hasCredentials: true,
      })
      .mockResolvedValueOnce({
        linked: false,
        username: null,
        image: null,
        hasCredentials: false,
      });
    vi.mocked(unlinkSimkl).mockResolvedValue({ success: true });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    expect(await screen.findByText("simkl-user")).toBeVisible();
    await user.click(screen.getAllByRole("button", { name: "Unlink" })[0]);
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(unlinkSimkl).toHaveBeenCalled();
      expect(showSuccess).toHaveBeenCalledWith(
        "Simkl account unlinked successfully"
      );
      expect(onProfileUpdated).toHaveBeenCalled();
    });
  });
});
