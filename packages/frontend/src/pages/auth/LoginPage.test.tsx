import { useAuth } from "@contexts/AuthContext";
import { useJellyfinLogin } from "@hooks/auth/useJellyfinLogin";
import { usePlexLogin } from "@hooks/auth/usePlexLogin";
import { getAuthProviders, loginWithPlex } from "@services/api";
import { renderWithProviders } from "@test/render";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "./LoginPage";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@hooks/auth/usePlexLogin", () => ({
  usePlexLogin: vi.fn(),
}));

vi.mock("@hooks/auth/useJellyfinLogin", () => ({
  useJellyfinLogin: vi.fn(),
}));

vi.mock("@services/api", () => ({
  getAuthProviders: vi.fn(),
  loginWithPlex: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    loading: false,
    logout: vi.fn(),
    checkAuth: vi.fn().mockResolvedValue(undefined),
    setUserFromLogin: vi.fn(),
    isAuthenticated: false,
    isAdmin: false,
    ...overrides,
  });
}

describe("LoginPage", () => {
  const plexLogin = vi.fn();
  const jellyfinLogin = vi.fn();
  let plexOptions: Parameters<typeof usePlexLogin>[0];
  let jellyfinOptions: Parameters<typeof useJellyfinLogin>[0];

  beforeEach(() => {
    mockAuth();
    navigateMock.mockReset();
    plexLogin.mockReset();
    jellyfinLogin.mockReset();
    vi.mocked(usePlexLogin).mockImplementation((options) => {
      plexOptions = options;
      return {
        loading: false,
        login: plexLogin,
      };
    });
    vi.mocked(useJellyfinLogin).mockImplementation((options) => {
      jellyfinOptions = options;
      return {
        loading: false,
        login: jellyfinLogin,
      };
    });
    vi.mocked(getAuthProviders).mockResolvedValue({
      hasAdmin: true,
      plexConfigured: true,
      jellyfinConfigured: true,
    });
  });

  it("renders the Scroblarr brand and Login card", async () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Scroblarr" })).toBeVisible();
    expect(screen.getByText("Login")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: /Auto \(system\)|Light mode|Dark mode/i,
      })
    ).toBeVisible();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Plex OAuth/i })).toBeVisible();
    });
  });

  it("starts Plex OAuth when the button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    const plexButton = await screen.findByRole("button", {
      name: /Plex OAuth/i,
    });
    await user.click(plexButton);

    expect(plexLogin).toHaveBeenCalled();
  });

  it("toggles jellyfin password visibility", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    const password = await screen.findByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /Show password/i }));
    expect(password).toHaveAttribute("type", "text");
  });

  it("hides Plex OAuth when only Emby is configured even if an admin exists", async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({
      hasAdmin: true,
      plexConfigured: false,
      jellyfinConfigured: false,
      embyConfigured: true,
    });

    renderWithProviders(<LoginPage />);

    expect(await screen.findByText("Emby Login")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Plex OAuth/i })
    ).not.toBeInTheDocument();
  });

  it("renders Emby-specific login content and passes the Emby media browser type", async () => {
    const user = userEvent.setup();
    vi.mocked(getAuthProviders).mockResolvedValue({
      hasAdmin: false,
      plexConfigured: false,
      jellyfinConfigured: false,
      embyConfigured: true,
    });

    renderWithProviders(<LoginPage />);

    expect(await screen.findByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    const embyLoginText = await screen.findByText("Emby Login");
    const embyLoginButton = embyLoginText.closest("button");
    expect(embyLoginButton).toBeTruthy();
    expect(screen.getByAltText("Emby")).toHaveAttribute(
      "src",
      "/logos/emby.svg"
    );

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(embyLoginButton!);

    await waitFor(() => {
      expect(jellyfinLogin).toHaveBeenCalledWith(
        "alice",
        "secret",
        undefined,
        undefined,
        undefined,
        undefined,
        "emby"
      );
    });
  });

  it("shows the default Emby login error for non-Error rejections", async () => {
    const user = userEvent.setup();
    vi.mocked(getAuthProviders).mockResolvedValue({
      hasAdmin: false,
      plexConfigured: false,
      jellyfinConfigured: false,
      embyConfigured: true,
    });
    jellyfinLogin.mockRejectedValueOnce("offline");

    renderWithProviders(<LoginPage />);

    await user.type(await screen.findByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(
      (await screen.findByText("Emby Login")).closest("button")!
    );

    expect(await screen.findByText("Failed to login with Emby")).toBeVisible();
  });

  it("shows the default Jellyfin login error for non-Error rejections", async () => {
    const user = userEvent.setup();
    vi.mocked(getAuthProviders).mockResolvedValue({
      hasAdmin: false,
      plexConfigured: false,
      jellyfinConfigured: true,
      embyConfigured: false,
    });
    jellyfinLogin.mockRejectedValueOnce("offline");

    renderWithProviders(<LoginPage />);

    await user.type(await screen.findByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(
      (await screen.findByText("Jellyfin Login")).closest("button")!
    );

    expect(
      await screen.findByText("Failed to login with Jellyfin")
    ).toBeVisible();
  });

  it("shows Error.message when Jellyfin login rejects with an Error", async () => {
    const user = userEvent.setup();
    vi.mocked(getAuthProviders).mockResolvedValue({
      hasAdmin: false,
      plexConfigured: false,
      jellyfinConfigured: true,
      embyConfigured: false,
    });
    jellyfinLogin.mockRejectedValueOnce(new Error("bad credentials"));

    renderWithProviders(<LoginPage />);

    await user.type(await screen.findByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(
      (await screen.findByText("Jellyfin Login")).closest("button")!
    );

    expect(await screen.findByText("bad credentials")).toBeVisible();
  });

  it("requires username and password before Jellyfin login", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(await screen.findByLabelText("Password"), "{Enter}");

    expect(
      await screen.findByText("Please enter your username and password")
    ).toBeVisible();
    expect(jellyfinLogin).not.toHaveBeenCalled();
  });

  it("submits Jellyfin login when Enter is pressed in the password field", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(await screen.findByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "secret{Enter}");

    await waitFor(() => {
      expect(jellyfinLogin).toHaveBeenCalled();
    });
  });

  it("ignores auth provider load failures", async () => {
    vi.mocked(getAuthProviders).mockRejectedValueOnce(new Error("offline"));

    renderWithProviders(<LoginPage />);

    expect(await screen.findByText("Login")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Plex OAuth/i })
    ).not.toBeInTheDocument();
  });

  it("shows a message when no auth service is configured", async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({
      hasAdmin: false,
      plexConfigured: false,
      jellyfinConfigured: false,
      embyConfigured: false,
    });

    renderWithProviders(<LoginPage />);

    expect(
      await screen.findByText(
        "No authentication service configured. Please contact an administrator."
      )
    ).toBeVisible();
  });

  it("navigates home when already authenticated", async () => {
    mockAuth({ isAuthenticated: true });

    renderWithProviders(<LoginPage />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/");
    });
    expect(screen.queryByText("Login")).not.toBeInTheDocument();
  });

  it("completes Plex OAuth and refreshes auth", async () => {
    const checkAuth = vi.fn().mockResolvedValue(undefined);
    mockAuth({ checkAuth });
    vi.mocked(loginWithPlex).mockResolvedValue({
      id: "u1",
      username: "alice",
      isAdmin: false,
    });

    renderWithProviders(<LoginPage />);
    await screen.findByRole("button", { name: /Plex OAuth/i });

    await act(async () => {
      await plexOptions.onAuthToken!({
        authToken: "plex-token",
        clientIdentifier: "client-1",
      });
    });

    await waitFor(() => {
      expect(loginWithPlex).toHaveBeenCalledWith("plex-token", "client-1");
      expect(checkAuth).toHaveBeenCalled();
    });
  });

  it("shows Plex OAuth Error messages from loginWithPlex", async () => {
    vi.mocked(loginWithPlex).mockRejectedValueOnce(new Error("plex rejected"));

    renderWithProviders(<LoginPage />);
    await screen.findByRole("button", { name: /Plex OAuth/i });

    await act(async () => {
      await plexOptions.onAuthToken!({
        authToken: "plex-token",
        clientIdentifier: "client-1",
      });
    });

    expect(await screen.findByText("plex rejected")).toBeVisible();
  });

  it("shows the default Plex login failure for non-Error rejections", async () => {
    vi.mocked(loginWithPlex).mockRejectedValueOnce("offline");

    renderWithProviders(<LoginPage />);
    await screen.findByRole("button", { name: /Plex OAuth/i });

    await act(async () => {
      await plexOptions.onAuthToken!({
        authToken: "plex-token",
        clientIdentifier: "client-1",
      });
    });

    expect(await screen.findByText("Failed to login")).toBeVisible();
  });

  it("surfaces Plex hook onError messages", async () => {
    renderWithProviders(<LoginPage />);
    await screen.findByRole("button", { name: /Plex OAuth/i });

    act(() => {
      plexOptions.onError!("popup closed");
    });

    expect(await screen.findByText("popup closed")).toBeVisible();
  });

  it("refreshes auth after Jellyfin onSuccess", async () => {
    const checkAuth = vi.fn().mockResolvedValue(undefined);
    mockAuth({ checkAuth });

    renderWithProviders(<LoginPage />);
    await screen.findByRole("button", { name: /Plex OAuth/i });

    await act(async () => {
      await jellyfinOptions.onSuccess!({
        id: "u1",
        username: "alice",
        isAdmin: false,
      });
    });

    expect(checkAuth).toHaveBeenCalled();
  });

  it("surfaces Jellyfin hook onError messages", async () => {
    renderWithProviders(<LoginPage />);
    await screen.findByRole("button", { name: /Plex OAuth/i });

    act(() => {
      jellyfinOptions.onError!("Emby unreachable");
    });

    expect(await screen.findByText("Emby unreachable")).toBeVisible();
  });

  it("skips checkAuth when Plex login returns no response", async () => {
    const checkAuth = vi.fn().mockResolvedValue(undefined);
    mockAuth({ checkAuth });
    vi.mocked(loginWithPlex).mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof loginWithPlex>>
    );

    renderWithProviders(<LoginPage />);
    await screen.findByRole("button", { name: /Plex OAuth/i });

    await act(async () => {
      await plexOptions.onAuthToken!({
        authToken: "plex-token",
        clientIdentifier: "client-1",
      });
    });

    expect(loginWithPlex).toHaveBeenCalled();
    expect(checkAuth).not.toHaveBeenCalled();
  });

  it("shows loading labels for Plex and Jellyfin buttons", async () => {
    vi.mocked(usePlexLogin).mockReturnValue({
      loading: true,
      login: plexLogin,
    });
    vi.mocked(useJellyfinLogin).mockReturnValue({
      loading: true,
      login: jellyfinLogin,
    });

    renderWithProviders(<LoginPage />);

    expect(await screen.findAllByText("Loading...")).toHaveLength(2);
  });

  it("cycles the theme toggle through light and dark icons", async () => {
    const user = userEvent.setup();
    localStorage.setItem("theme", "auto");

    renderWithProviders(<LoginPage />);

    const toggle = await screen.findByRole("button", {
      name: /Auto \(system\)/i,
    });
    await user.click(toggle);
    expect(
      await screen.findByRole("button", { name: /Light mode/i })
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Light mode/i }));
    expect(
      await screen.findByRole("button", { name: /Dark mode/i })
    ).toBeVisible();
  });

  it("hides the password again after revealing it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    const password = await screen.findByLabelText("Password");
    await user.click(screen.getByRole("button", { name: /Show password/i }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: /Hide password/i }));
    expect(password).toHaveAttribute("type", "password");
  });
});
