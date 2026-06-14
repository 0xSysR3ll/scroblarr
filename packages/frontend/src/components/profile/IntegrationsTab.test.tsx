import {
  getSimklAuthorizeUrl,
  getSimklStatus,
  getTVTimeStatus,
  getTraktAuthorizeUrl,
  getTraktStatus,
  linkSimkl,
  unlinkSimkl,
} from "@services/api";
import { renderWithProviders } from "@test/render";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showSuccess } from "@utils/toast";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function getTraktSection(): HTMLElement {
  const heading = screen.getByRole("heading", { name: "Trakt" });
  const section = heading.closest(".rounded-lg.border");
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

function getSimklSection(): HTMLElement {
  const heading = screen.getByRole("heading", { name: "Simkl" });
  const section = heading.closest(".rounded-lg.border");
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

async function clickSimklAuthorize(
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  await user.click(
    within(getSimklSection()).getByRole("button", { name: "Authorize" })
  );
}

describe("IntegrationsTab", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    oauthPopupMocks.preparePopup.mockReset();
    oauthPopupMocks.navigateToUrl.mockReset();
    oauthPopupMocks.closePopup.mockReset();

    vi.mocked(getTVTimeStatus).mockResolvedValue({
      linked: false,
      email: null,
      username: null,
    });
    vi.mocked(getTraktStatus).mockResolvedValue({
      linked: false,
      username: null,
      image: null,
      hasCredentials: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the polished Trakt authorization panel after generating an auth URL", async () => {
    vi.mocked(getTraktAuthorizeUrl).mockResolvedValue({
      authUrl: "https://trakt.tv/oauth/authorize",
    });

    renderWithProviders(<IntegrationsTab />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(getTraktStatus).toHaveBeenCalled();

    fireEvent.change(
      screen.getByPlaceholderText("Enter your Trakt Client ID"),
      {
        target: { value: "client-id" },
      }
    );
    fireEvent.change(
      screen.getByPlaceholderText("Enter your Trakt Client Secret"),
      {
        target: { value: "client-secret" },
      }
    );
    fireEvent.click(
      within(getTraktSection()).getByRole("button", { name: "Authorize" })
    );

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    const panel = screen.getByText("Authorization Code");
    const authorizationPanel =
      panel.closest("div")?.parentElement?.parentElement;

    expect(authorizationPanel).toBeInstanceOf(HTMLElement);
    expect(
      within(authorizationPanel as HTMLElement).getByText(
        "Paste the code Trakt shows after authorization."
      )
    ).toBeVisible();
    expect(
      within(authorizationPanel as HTMLElement).getByRole("link", {
        name: "Open Trakt auth page",
      })
    ).toHaveAttribute("href", "https://trakt.tv/oauth/authorize");
    const codeInput = within(authorizationPanel as HTMLElement).getByRole(
      "textbox",
      {
        name: "Authorization Code",
        description: "Paste the code Trakt shows after authorization.",
      }
    );

    expect(codeInput).toBeVisible();
    expect(codeInput).toHaveAttribute("aria-labelledby");
    expect(codeInput).toHaveAttribute("aria-describedby");
    expect(oauthPopupMocks.navigateToUrl).toHaveBeenCalledWith(
      "https://trakt.tv/oauth/authorize"
    );
  });
});

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
    await clickSimklAuthorize(user);

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

  it("shows an error when Simkl popup setup fails", async () => {
    const user = userEvent.setup();
    oauthPopupMocks.preparePopup.mockImplementation(() => {
      throw new Error("Popup blocked");
    });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await user.type(
      await screen.findByPlaceholderText("Enter your Simkl Client ID"),
      "client-id"
    );
    await clickSimklAuthorize(user);

    expect(await screen.findByText("Popup blocked")).toBeVisible();
    expect(getSimklAuthorizeUrl).not.toHaveBeenCalled();
  });

  it("shows an error when PIN authorization fails", async () => {
    const user = userEvent.setup();
    vi.mocked(getSimklAuthorizeUrl).mockRejectedValue(
      new Error("PIN service down")
    );

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await user.type(
      await screen.findByPlaceholderText("Enter your Simkl Client ID"),
      "client-id"
    );
    await clickSimklAuthorize(user);

    expect(
      await screen.findByText("PIN service down", {}, { timeout: 3000 })
    ).toBeVisible();
  });

  it("stops PIN polling after a fatal authorization error", async () => {
    const user = userEvent.setup();
    vi.mocked(getSimklAuthorizeUrl).mockResolvedValue({
      userCode: "ABCDE",
      verificationUrl: "https://simkl.com/pin/",
      expiresIn: 30,
      interval: 5,
    });
    vi.mocked(linkSimkl).mockRejectedValue(new Error("Invalid PIN"));

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await user.type(
      await screen.findByPlaceholderText("Enter your Simkl Client ID"),
      "client-id"
    );
    await clickSimklAuthorize(user);

    await waitFor(
      () => {
        expect(linkSimkl).toHaveBeenCalledWith("ABCDE", "client-id");
        expect(screen.getByText("Invalid PIN")).toBeVisible();
      },
      { timeout: 10000 }
    );
    expect(linkSimkl).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("Waiting for approval on Simkl...")
    ).not.toBeInTheDocument();
  }, 15000);

  it("surfaces manual link failures", async () => {
    const user = userEvent.setup();
    vi.mocked(getSimklAuthorizeUrl).mockResolvedValue({
      userCode: "ABCDE",
      verificationUrl: "https://simkl.com/pin/",
      expiresIn: 900,
      interval: 5,
    });
    vi.mocked(linkSimkl).mockRejectedValue(new Error("Invalid PIN"));

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await user.type(
      await screen.findByPlaceholderText("Enter your Simkl Client ID"),
      "client-id"
    );
    await clickSimklAuthorize(user);

    expect(
      await screen.findByText("ABCDE", {}, { timeout: 3000 })
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Check approval now" })
    );

    expect(await screen.findByText("Invalid PIN")).toBeVisible();
  });
});
