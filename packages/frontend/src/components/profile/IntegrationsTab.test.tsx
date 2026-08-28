import {
  getBingersStatus,
  getSimklAuthorizeUrl,
  getSimklStatus,
  getTraktAuthorizeUrl,
  getTraktStatus,
  linkBingers,
  linkSimkl,
  linkTrakt,
  unlinkBingers,
  unlinkSimkl,
  unlinkTrakt,
  updateBingersSettings,
  type BingersStatus,
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
  getBingersStatus: vi.fn(),
  linkBingers: vi.fn(),
  unlinkBingers: vi.fn(),
  updateBingersSettings: vi.fn(),
  BINGERS_MOBILE_SIGNIN_URL: "https://bingers.app/mobile-signin",
}));

async function getTraktSection(): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { name: /Trakt/i });
  const section = heading.closest(".rounded-lg.border");
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

async function getSimklSection(): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { name: /Simkl/i });
  const section = heading.closest(".rounded-lg.border");
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

async function expandSection(
  user: ReturnType<typeof userEvent.setup>,
  section: HTMLElement,
  name: RegExp
): Promise<HTMLElement> {
  const toggle = within(section).getByRole("button", { name });
  if (toggle.getAttribute("aria-expanded") === "false") {
    await user.click(toggle);
  }
  return section;
}

async function expandTraktSection(
  user: ReturnType<typeof userEvent.setup>
): Promise<HTMLElement> {
  return expandSection(user, await getTraktSection(), /Trakt/i);
}

async function expandSimklSection(
  user: ReturnType<typeof userEvent.setup>
): Promise<HTMLElement> {
  return expandSection(user, await getSimklSection(), /Simkl/i);
}

async function getBingersSection(): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { name: /Bingers/i });
  const section = heading.closest(".rounded-lg.border");
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

async function expandBingersSection(
  user: ReturnType<typeof userEvent.setup>
): Promise<HTMLElement> {
  return expandSection(user, await getBingersSection(), /Bingers/i);
}

async function clickSimklAuthorize(
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  const section = await expandSimklSection(user);
  await user.click(within(section).getByRole("button", { name: "Authorize" }));
}

async function clickTraktAuthorize(
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  const section = await expandTraktSection(user);
  await user.click(within(section).getByRole("button", { name: "Authorize" }));
}

async function fillTraktCredentials(
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  await expandTraktSection(user);
  await user.type(
    await screen.findByPlaceholderText("Enter your Trakt Client ID"),
    "client-id"
  );
  await user.type(
    screen.getByPlaceholderText("Enter your Trakt Client Secret"),
    "client-secret"
  );
}

async function fillSimklClientId(
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  await expandSimklSection(user);
  await user.type(
    await screen.findByPlaceholderText("Enter your Simkl Client ID"),
    "client-id"
  );
}

describe("IntegrationsTab", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
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
    vi.mocked(getBingersStatus).mockResolvedValue({
      linked: false,
      needsReauthorization: false,
      username: null,
      image: null,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
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

    fireEvent.click(
      within(await getTraktSection()).getByRole("button", { name: /Trakt/i })
    );

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
      within(await getTraktSection()).getByRole("button", { name: "Authorize" })
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

  it("keeps Trakt and Simkl cards collapsed by default", async () => {
    renderWithProviders(<IntegrationsTab />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      within(await getTraktSection()).getByRole("button", { name: /Trakt/i })
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      within(await getSimklSection()).getByRole("button", { name: /Simkl/i })
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByPlaceholderText("Enter your Trakt Client ID")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Enter your Simkl Client ID")
    ).not.toBeInTheDocument();
  });

  it("opens Trakt when re-authorization is required", async () => {
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

    expect(
      within(await getTraktSection()).getByRole("button", { name: /Trakt/i })
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("trakt-user")).toBeVisible();
  });

  it("opens Trakt for re-authorization when Simkl status resolves first", async () => {
    let resolveTrakt!: (
      value: Awaited<ReturnType<typeof getTraktStatus>>
    ) => void;
    vi.mocked(getTraktStatus).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTrakt = resolve;
        })
    );
    vi.mocked(getSimklStatus).mockResolvedValue({
      linked: false,
      username: null,
      image: null,
      hasCredentials: false,
    });

    renderWithProviders(<IntegrationsTab />);

    await act(async () => {
      await Promise.resolve();
    });

    // Simkl finished first, so the cards mount before Trakt status is known.
    expect(
      within(await getTraktSection()).getByRole("button", { name: /Trakt/i })
    ).toHaveAttribute("aria-expanded", "false");

    await act(async () => {
      resolveTrakt({
        linked: true,
        needsReauthorization: true,
        username: "trakt-user",
        image: "https://img.example/trakt.png",
        hasCredentials: true,
      });
      await Promise.resolve();
    });

    expect(
      within(await getTraktSection()).getByRole("button", { name: /Trakt/i })
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("trakt-user")).toBeVisible();
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
      within(await getTraktSection()).queryByText("Linked")
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
      within(await getTraktSection()).getAllByText("Linked").length
    ).toBeGreaterThan(0);
    expect(
      within(await getTraktSection()).queryByText("Re-authorization required")
    ).not.toBeInTheDocument();
  });

  it("shows a linked badge for linked Simkl accounts while collapsed", async () => {
    vi.mocked(getSimklStatus).mockResolvedValue({
      linked: true,
      username: "simkl-user",
      image: "https://img.example/simkl.png",
      hasCredentials: true,
    });

    renderWithProviders(<IntegrationsTab />);

    await act(async () => {
      await Promise.resolve();
    });

    const section = await getSimklSection();
    expect(
      within(section).getByRole("button", { name: /Simkl/i })
    ).toHaveAttribute("aria-expanded", "false");
    expect(within(section).getByText("Linked")).toBeVisible();
    expect(screen.queryByText("simkl-user")).not.toBeInTheDocument();
  });

  it("hides integration logos when they fail to load", async () => {
    renderWithProviders(<IntegrationsTab />);

    await act(async () => {
      await Promise.resolve();
    });

    const traktLogo = document.querySelector(
      'img[src="/logos/trakt.svg"]'
    ) as HTMLImageElement;
    const simklLogo = document.querySelector(
      'img[src="/logos/simkl.svg"]'
    ) as HTMLImageElement;

    expect(traktLogo).toBeTruthy();
    expect(simklLogo).toBeTruthy();

    fireEvent.error(traktLogo);
    fireEvent.error(simklLogo);

    expect(traktLogo.style.display).toBe("none");
    expect(simklLogo.style.display).toBe("none");
  });

  it("toggles Trakt client secret visibility", async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    renderWithProviders(<IntegrationsTab />);

    await expandTraktSection(user);

    const secretInput = await screen.findByPlaceholderText(
      "Enter your Trakt Client Secret"
    );
    expect(secretInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(secretInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(secretInput).toHaveAttribute("type", "password");
  });

  it("expands and collapses an integration card from the header", async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    renderWithProviders(<IntegrationsTab />);

    const section = await expandTraktSection(user);
    const toggle = within(section).getByRole("button", { name: /Trakt/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByPlaceholderText("Enter your Trakt Client ID")
    ).toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByPlaceholderText("Enter your Trakt Client ID")
    ).not.toBeInTheDocument();
  });

  it("renders after status loads fail", async () => {
    vi.mocked(getTraktStatus).mockRejectedValue(new Error("trakt down"));
    vi.mocked(getSimklStatus).mockRejectedValue(new Error("simkl down"));

    renderWithProviders(<IntegrationsTab />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      within(await getTraktSection()).getByRole("button", { name: /Trakt/i })
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      within(await getSimklSection()).getByRole("button", { name: /Simkl/i })
    ).toHaveAttribute("aria-expanded", "false");
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
    vi.mocked(getBingersStatus).mockResolvedValue({
      linked: false,
      needsReauthorization: false,
      username: null,
      image: null,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
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

    await expandTraktSection(user);
    expect(await screen.findByText("trakt-user")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(unlinkTrakt).toHaveBeenCalled();
      expect(showSuccess).toHaveBeenCalledWith(
        "Trakt account unlinked successfully"
      );
      expect(onProfileUpdated).toHaveBeenCalled();
    });
  });

  it("shows an error when unlinking Trakt fails", async () => {
    const user = setupUser();
    vi.mocked(getTraktStatus).mockResolvedValue({
      linked: true,
      username: "trakt-user",
      image: "https://img.example/trakt.png",
      hasCredentials: true,
    });
    vi.mocked(unlinkTrakt).mockRejectedValue(new Error("unlink denied"));

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await expandTraktSection(user);
    expect(await screen.findByText("trakt-user")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("unlink denied")).toBeVisible();
    expect(onProfileUpdated).not.toHaveBeenCalled();
  });

  it("shows a default error when Trakt unlink rejects a non-Error", async () => {
    const user = setupUser();
    vi.mocked(getTraktStatus).mockResolvedValue({
      linked: true,
      username: "trakt-user",
      image: "https://img.example/trakt.png",
      hasCredentials: true,
    });
    vi.mocked(unlinkTrakt).mockRejectedValue("unlink blew up");

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await expandTraktSection(user);
    expect(await screen.findByText("trakt-user")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText("Failed to unlink Trakt account")
    ).toBeVisible();
  });

  it("cancels the Trakt unlink confirmation dialog", async () => {
    const user = setupUser();
    vi.mocked(getTraktStatus).mockResolvedValue({
      linked: true,
      username: "trakt-user",
      image: "https://img.example/trakt.png",
      hasCredentials: true,
    });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await expandTraktSection(user);
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    expect(
      screen.getByText(
        "Are you sure you want to unlink your Trakt account? This will stop syncing to Trakt."
      )
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(unlinkTrakt).not.toHaveBeenCalled();
    expect(screen.getByText("trakt-user")).toBeVisible();
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

  it("authorizes without credentials when inputs are empty", async () => {
    const user = setupUser();
    vi.mocked(getTraktStatus).mockResolvedValue({
      linked: false,
      username: null,
      image: null,
      hasCredentials: true,
    });
    vi.mocked(getTraktAuthorizeUrl).mockResolvedValue({
      userCode: "ABCD1234",
      verificationUrl: "https://trakt.tv/activate",
      expiresIn: 900,
      interval: 5,
    });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    expect(
      await screen.findByRole("heading", { name: /Trakt/i })
    ).toBeVisible();
    await expandTraktSection(user);
    expect(
      within(await getTraktSection()).getByRole("button", { name: "Authorize" })
    ).toBeEnabled();
    await clickTraktAuthorize(user);
    await advanceAuthorizeDelay();

    await waitFor(() => {
      expect(getTraktAuthorizeUrl).toHaveBeenCalledWith(undefined, undefined);
    });
    expect(await screen.findByText("ABCD1234")).toBeVisible();

    vi.mocked(linkTrakt).mockResolvedValue({ success: true });
    vi.mocked(getTraktStatus).mockResolvedValue({
      linked: true,
      username: "trakt-user",
      image: null,
      hasCredentials: true,
    });

    await user.click(
      screen.getByRole("button", { name: "Check approval now" })
    );

    await waitFor(() => {
      expect(linkTrakt).toHaveBeenCalledWith("ABCD1234", undefined, undefined);
      expect(showSuccess).toHaveBeenCalledWith(
        "Trakt account linked successfully"
      );
    });
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
    vi.mocked(getBingersStatus).mockResolvedValue({
      linked: false,
      needsReauthorization: false,
      username: null,
      image: null,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
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

    await fillSimklClientId(user);
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

    await expandSimklSection(user);
    expect(await screen.findByText("simkl-user")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(unlinkSimkl).toHaveBeenCalled();
      expect(showSuccess).toHaveBeenCalledWith(
        "Simkl account unlinked successfully"
      );
      expect(onProfileUpdated).toHaveBeenCalled();
    });
  });

  it("shows an error when unlinking Simkl fails", async () => {
    const user = userEvent.setup();
    vi.mocked(getSimklStatus).mockResolvedValue({
      linked: true,
      username: "simkl-user",
      image: "https://img.example/simkl.png",
      hasCredentials: true,
    });
    vi.mocked(unlinkSimkl).mockRejectedValue(new Error("unlink denied"));

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await expandSimklSection(user);
    expect(await screen.findByText("simkl-user")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("unlink denied")).toBeVisible();
    expect(onProfileUpdated).not.toHaveBeenCalled();
  });

  it("shows a default error when Simkl unlink rejects a non-Error", async () => {
    const user = userEvent.setup();
    vi.mocked(getSimklStatus).mockResolvedValue({
      linked: true,
      username: "simkl-user",
      image: "https://img.example/simkl.png",
      hasCredentials: true,
    });
    vi.mocked(unlinkSimkl).mockRejectedValue("unlink blew up");

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await expandSimklSection(user);
    expect(await screen.findByText("simkl-user")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText("Failed to unlink Simkl account")
    ).toBeVisible();
  });

  it("cancels the Simkl unlink confirmation dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(getSimklStatus).mockResolvedValue({
      linked: true,
      username: "simkl-user",
      image: "https://img.example/simkl.png",
      hasCredentials: true,
    });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await expandSimklSection(user);
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    expect(
      screen.getByText(
        "Are you sure you want to unlink your Simkl account? This will stop syncing to Simkl."
      )
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(unlinkSimkl).not.toHaveBeenCalled();
    expect(screen.getByText("simkl-user")).toBeVisible();
  });

  it("shows an error when Simkl popup setup fails", async () => {
    const user = userEvent.setup();
    oauthPopupMocks.preparePopup.mockImplementation(() => {
      throw new Error("Popup blocked");
    });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillSimklClientId(user);
    await clickSimklAuthorize(user);

    expect(await screen.findByText("Popup blocked")).toBeVisible();
    expect(getSimklAuthorizeUrl).not.toHaveBeenCalled();
  });

  it("shows a default error when Simkl popup setup rejects a non-Error", async () => {
    const user = userEvent.setup();
    oauthPopupMocks.preparePopup.mockImplementation(() => {
      throw "popup blocked";
    });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillSimklClientId(user);
    await clickSimklAuthorize(user);

    expect(
      await screen.findByText(
        "Failed to open authentication window. Please allow popups and try again."
      )
    ).toBeVisible();
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

    await fillSimklClientId(user);
    await clickSimklAuthorize(user);

    expect(
      await screen.findByText("PIN service down", {}, { timeout: 3000 })
    ).toBeVisible();
    expect(oauthPopupMocks.closePopup).toHaveBeenCalled();
  });

  it("shows a default error when Simkl PIN authorization rejects a non-Error", async () => {
    const user = userEvent.setup();
    vi.mocked(getSimklAuthorizeUrl).mockRejectedValue("pin unavailable");

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillSimklClientId(user);
    await clickSimklAuthorize(user);

    expect(
      await screen.findByText(
        "Failed to get Simkl PIN code",
        {},
        { timeout: 3000 }
      )
    ).toBeVisible();
    expect(oauthPopupMocks.closePopup).toHaveBeenCalled();
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

    await fillSimklClientId(user);
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

    await fillSimklClientId(user);
    await clickSimklAuthorize(user);

    expect(
      await screen.findByText("ABCDE", {}, { timeout: 3000 })
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Check approval now" })
    );

    expect(await screen.findByText("Invalid PIN")).toBeVisible();
  });

  it("surfaces a default link failure for non-Error rejections", async () => {
    const user = userEvent.setup();
    vi.mocked(getSimklAuthorizeUrl).mockResolvedValue({
      userCode: "ABCDE",
      verificationUrl: "https://simkl.com/pin/",
      expiresIn: 900,
      interval: 5,
    });
    vi.mocked(linkSimkl).mockRejectedValue("link blew up");

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await fillSimklClientId(user);
    await clickSimklAuthorize(user);

    expect(
      await screen.findByText("ABCDE", {}, { timeout: 3000 })
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Check approval now" })
    );

    expect(
      await screen.findByText("Failed to link Simkl account")
    ).toBeVisible();
  });

  it("continues polling while authorization is pending then links", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      vi.mocked(getSimklAuthorizeUrl).mockResolvedValue({
        userCode: "ABCDE",
        verificationUrl: "https://simkl.com/pin/",
        expiresIn: 60,
        interval: 5,
      });
      vi.mocked(linkSimkl)
        .mockRejectedValueOnce(new Error("authorization pending"))
        .mockResolvedValueOnce({ success: true });
      vi.mocked(getSimklStatus)
        .mockResolvedValueOnce({
          linked: false,
          username: null,
          image: null,
          hasCredentials: false,
        })
        .mockResolvedValue({
          linked: true,
          username: "simkl-user",
          image: "https://img.example/simkl.png",
          hasCredentials: true,
        });

      renderWithProviders(
        <IntegrationsTab onProfileUpdated={onProfileUpdated} />
      );

      await fillSimklClientId(user);
      await clickSimklAuthorize(user);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      await waitFor(() => {
        expect(linkSimkl).toHaveBeenCalledTimes(2);
        expect(showSuccess).toHaveBeenCalledWith(
          "Simkl account linked successfully"
        );
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("increases the polling interval after a slow down response", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      vi.mocked(getSimklAuthorizeUrl).mockResolvedValue({
        userCode: "ABCDE",
        verificationUrl: "https://simkl.com/pin/",
        expiresIn: 60,
        interval: 5,
      });
      vi.mocked(linkSimkl)
        .mockRejectedValueOnce(new Error("slow down"))
        .mockResolvedValueOnce({ success: true });
      vi.mocked(getSimklStatus)
        .mockResolvedValueOnce({
          linked: false,
          username: null,
          image: null,
          hasCredentials: false,
        })
        .mockResolvedValue({
          linked: true,
          username: "simkl-user",
          image: "https://img.example/simkl.png",
          hasCredentials: true,
        });

      renderWithProviders(
        <IntegrationsTab onProfileUpdated={onProfileUpdated} />
      );

      await fillSimklClientId(user);
      await clickSimklAuthorize(user);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(linkSimkl).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(linkSimkl).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      await waitFor(() => {
        expect(linkSimkl).toHaveBeenCalledTimes(2);
        expect(showSuccess).toHaveBeenCalledWith(
          "Simkl account linked successfully"
        );
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a late authorize error after the tab unmounts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      let rejectAuthorize!: (reason?: unknown) => void;
      vi.mocked(getSimklAuthorizeUrl).mockImplementation(
        () =>
          new Promise((_, reject) => {
            rejectAuthorize = reject;
          })
      );

      const view = renderWithProviders(
        <IntegrationsTab onProfileUpdated={onProfileUpdated} />
      );

      await fillSimklClientId(user);
      await clickSimklAuthorize(user);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      view.unmount();
      rejectAuthorize(new Error("stale authorize failure"));
      await act(async () => {
        await Promise.resolve();
      });

      expect(
        screen.queryByText("stale authorize failure")
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a late PIN response after the tab unmounts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      let resolveAuthorize!: (value: {
        userCode: string;
        verificationUrl: string;
        expiresIn: number;
        interval: number;
      }) => void;
      vi.mocked(getSimklAuthorizeUrl).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAuthorize = resolve;
          })
      );

      const view = renderWithProviders(
        <IntegrationsTab onProfileUpdated={onProfileUpdated} />
      );

      await fillSimklClientId(user);
      await clickSimklAuthorize(user);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      view.unmount();
      resolveAuthorize({
        userCode: "ABCDE",
        verificationUrl: "https://simkl.com/pin/",
        expiresIn: 900,
        interval: 5,
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(oauthPopupMocks.navigateToUrl).not.toHaveBeenCalled();
      expect(linkSimkl).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows when the Simkl PIN expires while waiting", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      vi.mocked(getSimklAuthorizeUrl).mockResolvedValue({
        userCode: "ABCDE",
        verificationUrl: "https://simkl.com/pin/",
        expiresIn: 6,
        interval: 5,
      });
      vi.mocked(linkSimkl).mockRejectedValue(
        new Error("authorization pending")
      );

      renderWithProviders(
        <IntegrationsTab onProfileUpdated={onProfileUpdated} />
      );

      await fillSimklClientId(user);
      await clickSimklAuthorize(user);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(
        await screen.findByText(
          "The Simkl PIN expired. Generate a new one to try again."
        )
      ).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("authorizes without a client id when credentials are empty", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      vi.mocked(getSimklStatus).mockResolvedValue({
        linked: false,
        username: null,
        image: null,
        hasCredentials: true,
      });
      vi.mocked(getSimklAuthorizeUrl).mockResolvedValue({
        userCode: "ABCDE",
        verificationUrl: "https://simkl.com/pin/",
        expiresIn: 900,
        interval: 5,
      });

      renderWithProviders(
        <IntegrationsTab onProfileUpdated={onProfileUpdated} />
      );

      await screen.findByRole("heading", { name: /Simkl/i });
      await expandSimklSection(user);
      expect(
        within(await getSimklSection()).getByRole("button", {
          name: "Authorize",
        })
      ).toBeEnabled();
      await clickSimklAuthorize(user);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      await waitFor(() => {
        expect(getSimklAuthorizeUrl).toHaveBeenCalledWith(undefined);
      });
      expect(await screen.findByText("ABCDE")).toBeVisible();

      vi.mocked(linkSimkl).mockResolvedValue({ success: true });
      vi.mocked(getSimklStatus).mockResolvedValue({
        linked: true,
        username: "simkl-user",
        image: null,
        hasCredentials: true,
      });

      await user.click(
        screen.getByRole("button", { name: "Check approval now" })
      );

      await waitFor(() => {
        expect(linkSimkl).toHaveBeenCalledWith("ABCDE", undefined);
        expect(showSuccess).toHaveBeenCalledWith(
          "Simkl account linked successfully"
        );
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("IntegrationsTab Bingers integration", () => {
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
    vi.mocked(getBingersStatus).mockResolvedValue({
      linked: false,
      needsReauthorization: false,
      username: null,
      image: null,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
    });
    oauthPopupMocks.preparePopup.mockReturnValue({ closed: false });
    onProfileUpdated.mockReset();
  });

  it("keeps the unlinked Bingers form when the initial status fetch fails", async () => {
    const user = userEvent.setup();
    vi.mocked(getBingersStatus).mockRejectedValue(new Error("status down"));

    renderWithProviders(<IntegrationsTab />);
    await expandBingersSection(user);

    expect(
      screen.getByRole("button", { name: "Open Bingers sign-in" })
    ).toBeVisible();
    expect(
      screen.getByPlaceholderText("https://bingers.app/m?token=…")
    ).toBeVisible();
  });

  it("links a Bingers account from a pasted magic link", async () => {
    const user = userEvent.setup();
    vi.mocked(linkBingers).mockResolvedValue({ success: true });
    vi.mocked(getBingersStatus)
      .mockResolvedValueOnce({
        linked: false,
        needsReauthorization: false,
        username: null,
        image: null,
        markMoviesAsRewatched: false,
        markEpisodesAsRewatched: false,
      })
      .mockResolvedValueOnce({
        linked: true,
        needsReauthorization: false,
        username: "bingers-user",
        image: "https://img.example/bingers.png",
        markMoviesAsRewatched: false,
        markEpisodesAsRewatched: false,
      });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await expandBingersSection(user);
    await user.type(
      screen.getByPlaceholderText("https://bingers.app/m?token=…"),
      "https://bingers.app/m?token=magic"
    );
    await user.click(screen.getByRole("button", { name: "Complete link" }));

    await waitFor(() => {
      expect(linkBingers).toHaveBeenCalledWith(
        "https://bingers.app/m?token=magic"
      );
      expect(showSuccess).toHaveBeenCalledWith(
        "Bingers account linked successfully"
      );
      expect(onProfileUpdated).toHaveBeenCalled();
    });
    expect(await screen.findByText("bingers-user")).toBeVisible();
  });

  it("unlinks a linked Bingers account", async () => {
    const user = userEvent.setup();
    vi.mocked(getBingersStatus)
      .mockResolvedValueOnce({
        linked: true,
        needsReauthorization: false,
        username: "bingers-user",
        image: null,
        markMoviesAsRewatched: false,
        markEpisodesAsRewatched: false,
      })
      .mockResolvedValueOnce({
        linked: false,
        needsReauthorization: false,
        username: null,
        image: null,
        markMoviesAsRewatched: false,
        markEpisodesAsRewatched: false,
      });
    vi.mocked(unlinkBingers).mockResolvedValue({ success: true });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );

    await expandBingersSection(user);
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(unlinkBingers).toHaveBeenCalled();
      expect(showSuccess).toHaveBeenCalledWith(
        "Bingers account unlinked successfully"
      );
    });
  });

  it("opens Bingers when re-authorization is required", async () => {
    vi.mocked(getBingersStatus).mockResolvedValue({
      linked: false,
      needsReauthorization: true,
      username: "bingers-user",
      image: null,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
    });

    renderWithProviders(<IntegrationsTab />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      within(await getBingersSection()).getByRole("button", {
        expanded: true,
      })
    ).toBeVisible();
    expect(
      screen.getByText(
        "Bingers authorization expired or was revoked. Link your account again to reconnect."
      )
    ).toBeVisible();
  });

  it("shows link errors from the API", async () => {
    const user = userEvent.setup();
    vi.mocked(linkBingers).mockRejectedValue(new Error("Magic link expired"));

    renderWithProviders(<IntegrationsTab />);
    await expandBingersSection(user);
    await user.type(
      screen.getByPlaceholderText("https://bingers.app/m?token=…"),
      "https://bingers.app/m?token=dead"
    );
    await user.click(screen.getByRole("button", { name: "Complete link" }));

    expect(await screen.findByText("Magic link expired")).toBeVisible();
  });

  it("shows a default link message when link rejects a non-Error", async () => {
    const user = userEvent.setup();
    vi.mocked(linkBingers).mockRejectedValue("nope");

    renderWithProviders(<IntegrationsTab />);
    await expandBingersSection(user);
    await user.type(
      screen.getByPlaceholderText("https://bingers.app/m?token=…"),
      "https://bingers.app/m?token=dead"
    );
    await user.click(screen.getByRole("button", { name: "Complete link" }));

    expect(
      await screen.findByText("Failed to link Bingers account")
    ).toBeVisible();
  });

  it("clears Bingers loading after link even if the initial status fetch is still in flight", async () => {
    const user = userEvent.setup();
    let resolveInitial: (value: BingersStatus) => void = () => undefined;

    vi.mocked(getBingersStatus)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveInitial = resolve;
          })
      )
      .mockResolvedValueOnce({
        linked: true,
        needsReauthorization: false,
        username: "bingers-user",
        image: null,
        markMoviesAsRewatched: false,
        markEpisodesAsRewatched: false,
      });
    vi.mocked(linkBingers).mockResolvedValue({ success: true });

    renderWithProviders(<IntegrationsTab />);
    await expandBingersSection(user);
    await user.type(
      screen.getByPlaceholderText("https://bingers.app/m?token=…"),
      "https://bingers.app/m?token=magic"
    );
    await user.click(screen.getByRole("button", { name: "Complete link" }));

    await waitFor(() => {
      expect(screen.getByText("bingers-user")).toBeVisible();
    });

    await act(async () => {
      resolveInitial({
        linked: false,
        needsReauthorization: false,
        username: null,
        image: null,
        markMoviesAsRewatched: false,
        markEpisodesAsRewatched: false,
      });
    });

    // Stale initial response must not overwrite the linked status.
    // Loading is cleared by the initial effect's finally (not link/unlink).
    expect(screen.getByText("bingers-user")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    vi.mocked(getBingersStatus).mockResolvedValue({
      linked: false,
      needsReauthorization: false,
      username: null,
      image: null,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
    });
    vi.mocked(unlinkBingers).mockResolvedValue({ success: true });
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Open Bingers sign-in" })
      ).toBeEnabled();
    });
  });

  it("ignores a stale Bingers status response after a newer request completes", async () => {
    const user = userEvent.setup();
    let resolveInitial: (value: BingersStatus) => void = () => undefined;

    vi.mocked(getBingersStatus)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveInitial = resolve;
          })
      )
      .mockResolvedValueOnce({
        linked: true,
        needsReauthorization: false,
        username: "fresh-user",
        image: null,
        markMoviesAsRewatched: false,
        markEpisodesAsRewatched: false,
      });
    vi.mocked(linkBingers).mockResolvedValue({ success: true });

    renderWithProviders(<IntegrationsTab />);
    await expandBingersSection(user);
    await user.type(
      screen.getByPlaceholderText("https://bingers.app/m?token=…"),
      "https://bingers.app/m?token=magic"
    );
    await user.click(screen.getByRole("button", { name: "Complete link" }));

    await waitFor(() => {
      expect(screen.getByText("fresh-user")).toBeVisible();
    });

    await act(async () => {
      resolveInitial({
        linked: true,
        needsReauthorization: false,
        username: "stale-user",
        image: null,
        markMoviesAsRewatched: false,
        markEpisodesAsRewatched: false,
      });
    });

    expect(screen.getByText("fresh-user")).toBeVisible();
    expect(screen.queryByText("stale-user")).not.toBeInTheDocument();
  });

  it("shows unlink errors while the account is still linked", async () => {
    const user = userEvent.setup();
    vi.mocked(getBingersStatus).mockResolvedValue({
      linked: true,
      needsReauthorization: false,
      username: "bingers-user",
      image: null,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
    });
    vi.mocked(unlinkBingers).mockRejectedValue(new Error("unlink denied"));

    renderWithProviders(<IntegrationsTab />);
    await expandBingersSection(user);
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("unlink denied")).toBeVisible();
    expect(screen.getByText("bingers-user")).toBeVisible();
  });

  it("shows a default unlink message when unlink rejects a non-Error", async () => {
    const user = userEvent.setup();
    vi.mocked(getBingersStatus).mockResolvedValue({
      linked: true,
      needsReauthorization: false,
      username: "bingers-user",
      image: null,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
    });
    vi.mocked(unlinkBingers).mockRejectedValue("nope");

    renderWithProviders(<IntegrationsTab />);
    await expandBingersSection(user);
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText("Failed to unlink Bingers account")
    ).toBeVisible();
  });

  it("shows popup Error messages when opening sign-in fails", async () => {
    const user = userEvent.setup();
    oauthPopupMocks.preparePopup.mockImplementation(() => {
      throw new Error("popup blocked by browser");
    });
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    renderWithProviders(<IntegrationsTab />);
    await expandBingersSection(user);
    await user.click(
      screen.getByRole("button", { name: "Open Bingers sign-in" })
    );

    expect(oauthPopupMocks.closePopup).toHaveBeenCalled();
    expect(await screen.findByText("popup blocked by browser")).toBeVisible();
    openSpy.mockRestore();
  });

  it("closes the managed popup before opening the fallback when navigation fails", async () => {
    const user = userEvent.setup();
    oauthPopupMocks.preparePopup.mockReturnValue({ closed: false });
    oauthPopupMocks.navigateToUrl.mockImplementation(() => {
      throw new Error("navigation failed");
    });
    const fallbackWindow = { closed: false, opener: {} as Window | null };
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue(fallbackWindow as Window);

    renderWithProviders(<IntegrationsTab />);
    await expandBingersSection(user);
    await user.click(
      screen.getByRole("button", { name: "Open Bingers sign-in" })
    );

    expect(oauthPopupMocks.closePopup).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith(
      "https://bingers.app/mobile-signin",
      "_blank"
    );
    expect(fallbackWindow.opener).toBeNull();
    openSpy.mockRestore();
  });

  it("shows link success even when the post-link status refresh fails", async () => {
    const user = userEvent.setup();
    vi.mocked(linkBingers).mockResolvedValue({ success: true });
    vi.mocked(getBingersStatus)
      .mockResolvedValueOnce({
        linked: false,
        needsReauthorization: false,
        username: null,
        image: null,
        markMoviesAsRewatched: false,
        markEpisodesAsRewatched: false,
      })
      .mockRejectedValueOnce(new Error("status down"));

    renderWithProviders(<IntegrationsTab />);
    await expandBingersSection(user);
    await user.type(
      screen.getByPlaceholderText("https://bingers.app/m?token=…"),
      "https://bingers.app/m?token=magic"
    );
    await user.click(screen.getByRole("button", { name: "Complete link" }));

    await waitFor(() => {
      expect(showSuccess).toHaveBeenCalledWith(
        "Bingers account linked successfully"
      );
    });
    expect(
      screen.queryByText("Failed to link Bingers account")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlink" })).toBeVisible();
  });

  it("shows unlink success even when the post-unlink status refresh fails", async () => {
    const user = userEvent.setup();
    vi.mocked(getBingersStatus)
      .mockResolvedValueOnce({
        linked: true,
        needsReauthorization: false,
        username: "bingers-user",
        image: null,
        markMoviesAsRewatched: false,
        markEpisodesAsRewatched: false,
      })
      .mockRejectedValueOnce(new Error("status down"));
    vi.mocked(unlinkBingers).mockResolvedValue({ success: true });

    renderWithProviders(<IntegrationsTab />);
    await expandBingersSection(user);
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(showSuccess).toHaveBeenCalledWith(
        "Bingers account unlinked successfully"
      );
    });
    expect(
      screen.queryByText("Failed to unlink Bingers account")
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Bingers sign-in" })
    ).toBeVisible();
  });

  it("saves Bingers rewatch settings when linked", async () => {
    const user = userEvent.setup();
    vi.mocked(getBingersStatus).mockResolvedValue({
      linked: true,
      needsReauthorization: false,
      username: "bingers-user",
      image: null,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
    });
    vi.mocked(updateBingersSettings).mockResolvedValue({
      success: true,
      markMoviesAsRewatched: true,
      markEpisodesAsRewatched: false,
    });

    renderWithProviders(
      <IntegrationsTab onProfileUpdated={onProfileUpdated} />
    );
    await expandBingersSection(user);

    await user.click(
      screen.getByRole("checkbox", { name: "Mark movies as rewatched" })
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateBingersSettings).toHaveBeenCalledWith({
        markMoviesAsRewatched: true,
        markEpisodesAsRewatched: false,
      });
      expect(showSuccess).toHaveBeenCalledWith("Settings saved successfully!");
      expect(onProfileUpdated).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
  });

  it("shows an error when saving Bingers rewatch settings fails", async () => {
    const user = userEvent.setup();
    vi.mocked(getBingersStatus).mockResolvedValue({
      linked: true,
      needsReauthorization: false,
      username: "bingers-user",
      image: null,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
    });
    vi.mocked(updateBingersSettings).mockRejectedValue(
      new Error("Settings unavailable")
    );

    renderWithProviders(<IntegrationsTab />);
    await expandBingersSection(user);

    await user.click(
      screen.getByRole("checkbox", { name: "Mark episodes as rewatched" })
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Settings unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("skips the error banner when the window.open fallback succeeds", async () => {
    const user = userEvent.setup();
    oauthPopupMocks.preparePopup.mockImplementation(() => {
      throw new Error("popup blocked by browser");
    });
    const fallbackWindow = { closed: false, opener: {} as Window | null };
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue(fallbackWindow as Window);

    renderWithProviders(<IntegrationsTab />);
    await expandBingersSection(user);
    await user.click(
      screen.getByRole("button", { name: "Open Bingers sign-in" })
    );

    expect(openSpy).toHaveBeenCalledWith(
      "https://bingers.app/mobile-signin",
      "_blank"
    );
    expect(fallbackWindow.opener).toBeNull();
    expect(
      screen.queryByText("popup blocked by browser")
    ).not.toBeInTheDocument();
    openSpy.mockRestore();
  });

  it("shows a default message when opening sign-in fails without an Error", async () => {
    const user = userEvent.setup();
    oauthPopupMocks.preparePopup.mockImplementation(() => {
      throw "popup blocked";
    });
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    renderWithProviders(<IntegrationsTab />);
    await expandBingersSection(user);
    await user.click(
      screen.getByRole("button", { name: "Open Bingers sign-in" })
    );

    expect(
      await screen.findByText(
        "Failed to open sign-in window. Please allow popups and try again."
      )
    ).toBeVisible();
    expect(openSpy).toHaveBeenCalledWith(
      "https://bingers.app/mobile-signin",
      "_blank"
    );
    openSpy.mockRestore();
  });
});
