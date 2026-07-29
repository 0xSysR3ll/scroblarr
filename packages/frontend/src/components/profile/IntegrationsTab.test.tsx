import {
  getSimklAuthorizeUrl,
  getSimklStatus,
  getTraktAuthorizeUrl,
  getTraktStatus,
  linkSimkl,
  linkTrakt,
  unlinkSimkl,
  unlinkTrakt,
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
  getTraktStatus: vi.fn(),
  getTraktAuthorizeUrl: vi.fn(),
  linkTrakt: vi.fn(),
  unlinkTrakt: vi.fn(),
  getSimklStatus: vi.fn(),
  getSimklAuthorizeUrl: vi.fn(),
  linkSimkl: vi.fn(),
  unlinkSimkl: vi.fn(),
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

async function clickTraktAuthorize(
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  await user.click(
    within(getTraktSection()).getByRole("button", { name: "Authorize" })
  );
}

async function fillTraktCredentials(
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  await user.type(
    await screen.findByPlaceholderText("Enter your Trakt Client ID"),
    "client-id"
  );
  await user.type(
    screen.getByPlaceholderText("Enter your Trakt Client Secret"),
    "client-secret"
  );
}

describe("IntegrationsTab", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    oauthPopupMocks.preparePopup.mockReset();
    oauthPopupMocks.navigateToUrl.mockReset();
    oauthPopupMocks.closePopup.mockReset();

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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the Trakt PIN panel after generating a PIN code", async () => {
    vi.mocked(getTraktAuthorizeUrl).mockResolvedValue({
      userCode: "ABCD1234",
      verificationUrl: "https://trakt.tv/activate",
      expiresIn: 600,
      interval: 5,
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

    const authorizationPanel = screen.getByTestId("trakt-auth-panel");

    expect(within(authorizationPanel).getByText("ABCD1234")).toBeVisible();
    expect(
      within(authorizationPanel).getByRole("link", {
        name: "Open Trakt activation page",
      })
    ).toHaveAttribute("href", "https://trakt.tv/activate");
    expect(
      within(authorizationPanel).getByRole("button", {
        name: "Check approval now",
      })
    ).toBeVisible();

    expect(oauthPopupMocks.preparePopup).toHaveBeenCalledWith("Trakt Auth");
    expect(oauthPopupMocks.navigateToUrl).toHaveBeenCalledWith(
      "https://trakt.tv/activate"
    );
  });

  it("shows a re-authorization warning for linked Trakt accounts", async () => {
    vi.mocked(getTraktStatus).mockResolvedValue({
      linked: true,
      needsReauthorization: true,
      username: "trakt-user",
      image: "https://img.example/trakt.png",
      hasCredentials: true,
    });

    renderWithProviders(<IntegrationsTab />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(getTraktStatus).toHaveBeenCalledWith({ force: true });
    expect(screen.getByText("trakt-user")).toBeVisible();
    expect(
      screen.getAllByText("Re-authorization required").length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Trakt authorization expired or was revoked. Unlink and link your account again to resume syncing."
      )
    ).toBeVisible();
    expect(
      within(getTraktSection()).queryByText("Linked")
    ).not.toBeInTheDocument();
  });

  it("shows a linked state for linked Trakt accounts with valid tokens", async () => {
    vi.mocked(getTraktStatus).mockResolvedValue({
      linked: true,
      needsReauthorization: false,
      username: "trakt-user",
      image: "https://img.example/trakt.png",
      hasCredentials: true,
    });

    renderWithProviders(<IntegrationsTab />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      within(getTraktSection()).getAllByText("Linked").length
    ).toBeGreaterThan(0);
    expect(
      within(getTraktSection()).queryByText("Re-authorization required")
    ).not.toBeInTheDocument();
  });
});

describe("IntegrationsTab Trakt integration", () => {
  const onProfileUpdated = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
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
    oauthPopupMocks.navigateToUrl.mockReset();
    oauthPopupMocks.closePopup.mockReset();
    onProfileUpdated.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setupUser() {
    return userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
  }

  async function advanceAuthorizeDelay(): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
  }

  async function advancePinPoll(ms = 5000): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("links a Trakt account after PIN approval", async () => {
    const user = setupUser();
    vi.mocked(getTraktStatus)
      .mockResolvedValueOnce({
        linked: false,
        username: null,
        image: null,
        hasCredentials: false,
      })
      .mockResolvedValueOnce({
        linked: true,
        username: "trakt-user",
        image: "https://img.example/trakt.png",
        hasCredentials: true,
      });
    vi.mocked(getTraktAuthorizeUrl).mockResolvedValue({
      userCode: "ABCD1234",
      verificationUrl: "https://trakt.tv/activate",
      expiresIn: 900,
      interval: 5,
    });
    vi.mocked(linkTrakt).mockResolvedValue({ success: true });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillTraktCredentials(user);
    await clickTraktAuthorize(user);
    await advanceAuthorizeDelay();

    expect(await screen.findByText("ABCD1234")).toBeVisible();
    expect(oauthPopupMocks.navigateToUrl).toHaveBeenCalledWith(
      "https://trakt.tv/activate"
    );

    await user.click(
      screen.getByRole("button", { name: "Check approval now" })
    );

    await waitFor(() => {
      expect(linkTrakt).toHaveBeenCalledWith(
        "ABCD1234",
        "client-id",
        "client-secret"
      );
      expect(showSuccess).toHaveBeenCalledWith(
        "Trakt account linked successfully"
      );
      expect(onProfileUpdated).toHaveBeenCalled();
    });
  });

  it("unlinks a linked Trakt account", async () => {
    const user = setupUser();
    vi.mocked(getTraktStatus)
      .mockResolvedValueOnce({
        linked: true,
        username: "trakt-user",
        image: "https://img.example/trakt.png",
        hasCredentials: true,
      })
      .mockResolvedValueOnce({
        linked: false,
        username: null,
        image: null,
        hasCredentials: false,
      });
    vi.mocked(unlinkTrakt).mockResolvedValue({ success: true });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    expect(await screen.findByText("trakt-user")).toBeVisible();
    await user.click(screen.getAllByRole("button", { name: "Unlink" })[0]);
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(unlinkTrakt).toHaveBeenCalled();
      expect(showSuccess).toHaveBeenCalledWith(
        "Trakt account unlinked successfully"
      );
      expect(onProfileUpdated).toHaveBeenCalled();
    });
  });

  it("shows an error when Trakt popup setup fails", async () => {
    const user = setupUser();
    oauthPopupMocks.preparePopup.mockImplementation(() => {
      throw new Error("Popup blocked");
    });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillTraktCredentials(user);
    await clickTraktAuthorize(user);

    expect(await screen.findByText("Popup blocked")).toBeVisible();
    expect(getTraktAuthorizeUrl).not.toHaveBeenCalled();
  });

  it("shows a default error when popup setup rejects a non-Error", async () => {
    const user = setupUser();
    oauthPopupMocks.preparePopup.mockImplementation(() => {
      throw "blocked";
    });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillTraktCredentials(user);
    await clickTraktAuthorize(user);

    expect(
      await screen.findByText(
        "Failed to open authentication window. Please allow popups and try again."
      )
    ).toBeVisible();
  });

  it("shows an error when PIN authorization fails", async () => {
    const user = setupUser();
    vi.mocked(getTraktAuthorizeUrl).mockRejectedValue(
      new Error("PIN service down")
    );

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillTraktCredentials(user);
    await clickTraktAuthorize(user);
    await advanceAuthorizeDelay();

    expect(await screen.findByText("PIN service down")).toBeVisible();
    expect(oauthPopupMocks.closePopup).toHaveBeenCalled();
  });

  it("shows a default error when PIN authorization rejects a non-Error", async () => {
    const user = setupUser();
    vi.mocked(getTraktAuthorizeUrl).mockRejectedValue("pin unavailable");

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillTraktCredentials(user);
    await clickTraktAuthorize(user);
    await advanceAuthorizeDelay();

    expect(
      await screen.findByText("Failed to get Trakt PIN code")
    ).toBeVisible();
  });

  it("ignores a late PIN response after the tab unmounts", async () => {
    const user = setupUser();
    let resolveAuthorize!: (value: {
      userCode: string;
      verificationUrl: string;
      expiresIn: number;
      interval: number;
    }) => void;
    vi.mocked(getTraktAuthorizeUrl).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAuthorize = resolve;
        })
    );

    const view = renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillTraktCredentials(user);
    await clickTraktAuthorize(user);
    await advanceAuthorizeDelay();

    view.unmount();
    resolveAuthorize({
      userCode: "ABCD1234",
      verificationUrl: "https://trakt.tv/activate",
      expiresIn: 900,
      interval: 5,
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(oauthPopupMocks.navigateToUrl).not.toHaveBeenCalled();
    expect(linkTrakt).not.toHaveBeenCalled();
  });

  it("stops PIN polling after a fatal authorization error", async () => {
    const user = setupUser();
    vi.mocked(getTraktAuthorizeUrl).mockResolvedValue({
      userCode: "ABCD1234",
      verificationUrl: "https://trakt.tv/activate",
      expiresIn: 30,
      interval: 5,
    });
    vi.mocked(linkTrakt).mockRejectedValue(new Error("Invalid PIN"));

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillTraktCredentials(user);
    await clickTraktAuthorize(user);
    await advanceAuthorizeDelay();
    await advancePinPoll();

    await waitFor(() => {
      expect(linkTrakt).toHaveBeenCalledWith(
        "ABCD1234",
        "client-id",
        "client-secret"
      );
      expect(screen.getByText("Invalid PIN")).toBeVisible();
    });
    expect(linkTrakt).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("Waiting for approval on Trakt...")
    ).not.toBeInTheDocument();
  });

  it("continues polling while authorization is pending then links", async () => {
    const user = setupUser();
    vi.mocked(getTraktAuthorizeUrl).mockResolvedValue({
      userCode: "ABCD1234",
      verificationUrl: "https://trakt.tv/activate",
      expiresIn: 60,
      interval: 5,
    });
    vi.mocked(linkTrakt)
      .mockRejectedValueOnce(new Error("authorization pending"))
      .mockResolvedValueOnce({ success: true });
    vi.mocked(getTraktStatus)
      .mockResolvedValueOnce({
        linked: false,
        username: null,
        image: null,
        hasCredentials: false,
      })
      .mockResolvedValue({
        linked: true,
        username: "trakt-user",
        image: "https://img.example/trakt.png",
        hasCredentials: true,
      });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillTraktCredentials(user);
    await clickTraktAuthorize(user);
    await advanceAuthorizeDelay();
    await advancePinPoll();
    await advancePinPoll();

    await waitFor(() => {
      expect(linkTrakt).toHaveBeenCalledTimes(2);
      expect(showSuccess).toHaveBeenCalledWith(
        "Trakt account linked successfully"
      );
    });
  });

  it("increases the polling interval after a slow down response", async () => {
    const user = setupUser();
    vi.mocked(getTraktAuthorizeUrl).mockResolvedValue({
      userCode: "ABCD1234",
      verificationUrl: "https://trakt.tv/activate",
      expiresIn: 60,
      interval: 5,
    });
    vi.mocked(linkTrakt)
      .mockRejectedValueOnce(new Error("slow down"))
      .mockResolvedValueOnce({ success: true });
    vi.mocked(getTraktStatus)
      .mockResolvedValueOnce({
        linked: false,
        username: null,
        image: null,
        hasCredentials: false,
      })
      .mockResolvedValue({
        linked: true,
        username: "trakt-user",
        image: "https://img.example/trakt.png",
        hasCredentials: true,
      });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillTraktCredentials(user);
    await clickTraktAuthorize(user);
    await advanceAuthorizeDelay();
    await advancePinPoll(5000);

    expect(linkTrakt).toHaveBeenCalledTimes(1);

    await advancePinPoll(5000);
    expect(linkTrakt).toHaveBeenCalledTimes(1);

    await advancePinPoll(5000);
    await waitFor(() => {
      expect(linkTrakt).toHaveBeenCalledTimes(2);
      expect(showSuccess).toHaveBeenCalledWith(
        "Trakt account linked successfully"
      );
    });
  });

  it("ignores a late authorize error after the tab unmounts", async () => {
    const user = setupUser();
    let rejectAuthorize!: (reason?: unknown) => void;
    vi.mocked(getTraktAuthorizeUrl).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectAuthorize = reject;
        })
    );

    const view = renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillTraktCredentials(user);
    await clickTraktAuthorize(user);
    await advanceAuthorizeDelay();

    view.unmount();
    rejectAuthorize(new Error("stale authorize failure"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(oauthPopupMocks.closePopup).toHaveBeenCalled();
    expect(
      screen.queryByText("stale authorize failure")
    ).not.toBeInTheDocument();
  });

  it("surfaces manual link failures", async () => {
    const user = setupUser();
    vi.mocked(getTraktAuthorizeUrl).mockResolvedValue({
      userCode: "ABCD1234",
      verificationUrl: "https://trakt.tv/activate",
      expiresIn: 900,
      interval: 5,
    });
    vi.mocked(linkTrakt).mockRejectedValue(new Error("Invalid PIN"));

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillTraktCredentials(user);
    await clickTraktAuthorize(user);
    await advanceAuthorizeDelay();

    expect(await screen.findByText("ABCD1234")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Check approval now" })
    );

    expect(await screen.findByText("Invalid PIN")).toBeVisible();
  });

  it("surfaces a default link failure for non-Error rejections", async () => {
    const user = setupUser();
    vi.mocked(getTraktAuthorizeUrl).mockResolvedValue({
      userCode: "ABCD1234",
      verificationUrl: "https://trakt.tv/activate",
      expiresIn: 900,
      interval: 5,
    });
    vi.mocked(linkTrakt).mockRejectedValue("link blew up");

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillTraktCredentials(user);
    await clickTraktAuthorize(user);
    await advanceAuthorizeDelay();
    await user.click(
      screen.getByRole("button", { name: "Check approval now" })
    );

    expect(
      await screen.findByText("Failed to link Trakt account")
    ).toBeVisible();
  });

  it("shows when the Trakt PIN expires while waiting", async () => {
    const user = setupUser();
    vi.mocked(getTraktAuthorizeUrl).mockResolvedValue({
      userCode: "ABCD1234",
      verificationUrl: "https://trakt.tv/activate",
      expiresIn: 6,
      interval: 5,
    });
    vi.mocked(linkTrakt).mockRejectedValue(new Error("authorization pending"));

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillTraktCredentials(user);
    await clickTraktAuthorize(user);
    await advanceAuthorizeDelay();
    await advancePinPoll();
    await advancePinPoll();

    expect(
      await screen.findByText(
        "The Trakt PIN expired. Generate a new one to try again."
      )
    ).toBeVisible();
  });

  it("stops PIN polling when the tab unmounts mid-wait", async () => {
    const user = setupUser();
    vi.mocked(getTraktAuthorizeUrl).mockResolvedValue({
      userCode: "ABCD1234",
      verificationUrl: "https://trakt.tv/activate",
      expiresIn: 60,
      interval: 5,
    });
    vi.mocked(linkTrakt).mockRejectedValue(new Error("authorization pending"));

    const view = renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillTraktCredentials(user);
    await clickTraktAuthorize(user);
    await advanceAuthorizeDelay();

    expect(await screen.findByText("ABCD1234")).toBeVisible();
    view.unmount();
    await advancePinPoll();

    expect(linkTrakt).not.toHaveBeenCalled();
  });
});

describe("IntegrationsTab Simkl integration", () => {
  const onProfileUpdated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
