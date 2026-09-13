import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlexOAuth } from "./PlexOAuth";

const popupMocks = vi.hoisted(() => ({
  preparePopup: vi.fn(),
  navigateToUrl: vi.fn(),
  closePopup: vi.fn(),
}));

vi.mock("@utils/OAuthPopup", () => ({
  OAuthPopup: class {
    preparePopup = popupMocks.preparePopup;
    navigateToUrl = popupMocks.navigateToUrl;
    closePopup = popupMocks.closePopup;
  },
}));

function stubUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    get: () => ua,
  });
}

function pinCreateResponse(
  overrides: Partial<{
    pinId: number;
    code: string;
    clientIdentifier: string;
  }> = {}
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      pinId: 42,
      code: "pin-code",
      clientIdentifier: "client-id",
      ...overrides,
    }),
  } as Response;
}

describe("PlexOAuth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    popupMocks.preparePopup.mockReset();
    popupMocks.navigateToUrl.mockReset();
    popupMocks.closePopup.mockReset();
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(window, "screen", {
      configurable: true,
      value: { width: 1920, height: 1080 },
    });
    stubUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0"
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("exposes preparePopup and closePopup", () => {
    const oauth = new PlexOAuth();
    oauth.preparePopup();
    oauth.closePopup();
    expect(popupMocks.preparePopup).toHaveBeenCalledWith("Plex Auth", 600, 700);
    expect(popupMocks.closePopup).toHaveBeenCalled();
  });

  it("mints a fresh pin, opens auth URL, and resolves via backend poll", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(pinCreateResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({ status: "pending" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          authToken: "plex-token",
          clientIdentifier: "client-id",
        }),
      } as Response);

    const oauth = new PlexOAuth();
    const loginPromise = oauth.login();

    await vi.advanceTimersByTimeAsync(0);
    expect(popupMocks.navigateToUrl).toHaveBeenCalledWith(
      expect.stringContaining("code=pin-code")
    );
    expect(popupMocks.navigateToUrl.mock.calls[0][0]).toContain(
      "context%5Bdevice%5D%5Bplatform%5D=Chrome"
    );
    expect(popupMocks.navigateToUrl.mock.calls[0][0]).toContain(
      "context%5Bdevice%5D%5Bdevice%5D=Linux"
    );

    await vi.advanceTimersByTimeAsync(1000);
    await expect(loginPromise).resolves.toEqual({
      authToken: "plex-token",
      clientIdentifier: "client-id",
    });
  });

  it("falls back to the local client identifier when the poll omits it", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(pinCreateResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ authToken: "plex-token" }),
      } as Response);

    await expect(new PlexOAuth().login()).resolves.toEqual({
      authToken: "plex-token",
      clientIdentifier: "client-id",
    });
  });

  it("keeps polling when a 200 response has no authToken yet", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(pinCreateResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          authToken: "late-token",
          clientIdentifier: "client-id",
        }),
      } as Response);

    const loginPromise = new PlexOAuth().login();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(loginPromise).resolves.toEqual({
      authToken: "late-token",
      clientIdentifier: "client-id",
    });
  });

  it("creates a new pin on every login instead of reusing a stale one", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(pinCreateResponse({ pinId: 1, code: "a" }))
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ error: "Plex PIN not found or expired" }),
      } as Response)
      .mockResolvedValueOnce(pinCreateResponse({ pinId: 2, code: "b" }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          authToken: "token-2",
          clientIdentifier: "client-id",
        }),
      } as Response);

    const oauth = new PlexOAuth();
    await expect(oauth.login()).rejects.toThrow(
      "Plex PIN not found or expired"
    );
    await expect(oauth.login()).resolves.toEqual({
      authToken: "token-2",
      clientIdentifier: "client-id",
    });

    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          url === "/api/v1/auth/plex/pin" &&
          (init as RequestInit | undefined)?.method === "POST"
      )
    ).toHaveLength(2);
  });

  it("throws when pin creation fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    await expect(new PlexOAuth().login()).rejects.toThrow(
      "Failed to create pin: 500 Internal Server Error"
    );
  });

  it("throws when the pin response is incomplete", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ pinId: 1 }),
    } as Response);

    await expect(new PlexOAuth().login()).rejects.toThrow(
      "Backend returned an incomplete Plex PIN response"
    );
  });

  it("uses a statusText fallback when the poll error body has no message", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(pinCreateResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => {
          throw new Error("no json");
        },
      } as unknown as Response);

    await expect(new PlexOAuth().login()).rejects.toThrow(
      "Failed to poll pin: 502 Bad Gateway"
    );
  });

  it("rethrows non-abort poll network errors", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(pinCreateResponse())
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(new PlexOAuth().login()).rejects.toThrow("Failed to fetch");
  });

  it("times out when the pin stays pending", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(pinCreateResponse())
      .mockResolvedValue({
        ok: true,
        status: 202,
        json: async () => ({ status: "pending" }),
      } as Response);

    const loginPromise = new PlexOAuth().login();
    loginPromise.catch(() => undefined);

    for (let i = 0; i < 181; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    await expect(loginPromise).rejects.toThrow(
      "Plex authentication timed out before authorization completed"
    );
    expect(popupMocks.closePopup).toHaveBeenCalled();
  });

  it("aborts a hung poll request when the login deadline expires", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(pinCreateResponse())
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) {
              return;
            }
            if (signal.aborted) {
              reject(new DOMException("Aborted", "AbortError"));
              return;
            }
            signal.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          })
      );

    const loginPromise = new PlexOAuth().login();
    loginPromise.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);

    await expect(loginPromise).rejects.toThrow(
      "Plex authentication timed out before authorization completed"
    );
    expect(popupMocks.closePopup).toHaveBeenCalled();
  });

  it.each([
    [
      "Firefox on Windows",
      "Mozilla/5.0 (Windows NT 10.0; rv:121.0) Gecko/20100101 Firefox/121.0",
      "Firefox",
      "Windows",
    ],
    [
      "Safari on macOS",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      "Safari",
      "macOS",
    ],
    [
      "legacy Edge",
      "Mozilla/5.0 (Windows NT 10.0; Trident/7.0; Edge/18.18363)",
      "Edge",
      "Windows",
    ],
    [
      "unknown browser on Android",
      "Mozilla/5.0 (Linux; Android 14)",
      "Unknown",
      "Android",
    ],
    [
      "unknown browser on iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      "Unknown",
      "iOS",
    ],
    [
      "unknown browser on iPad",
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
      "Unknown",
      "iOS",
    ],
    ["unknown browser on iOS token", "Something iOS Mobile", "Unknown", "iOS"],
    ["fully unknown", "CustomAgent/1.0", "Unknown", "Unknown"],
  ])("builds auth context for %s", async (_label, ua, browser, os) => {
    stubUserAgent(ua);
    vi.mocked(fetch)
      .mockResolvedValueOnce(pinCreateResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          authToken: "token",
          clientIdentifier: "client-id",
        }),
      } as Response);

    await new PlexOAuth().login();
    const authUrl = popupMocks.navigateToUrl.mock.calls[0][0] as string;
    expect(authUrl).toContain(
      `context%5Bdevice%5D%5Bplatform%5D=${encodeURIComponent(browser)}`
    );
    expect(authUrl).toContain(
      `context%5Bdevice%5D%5Bdevice%5D=${encodeURIComponent(os)}`
    );
  });

  it("falls back to Unknown when browser version cannot be parsed", async () => {
    stubUserAgent("Firefox without-version Windows");
    vi.mocked(fetch)
      .mockResolvedValueOnce(pinCreateResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          authToken: "token",
          clientIdentifier: "client-id",
        }),
      } as Response);

    await new PlexOAuth().login();
    expect(popupMocks.navigateToUrl.mock.calls[0][0]).toContain(
      "context%5Bdevice%5D%5BplatformVersion%5D=Unknown"
    );
  });

  it("falls back to Unknown for Safari and Edge without versions", async () => {
    stubUserAgent("Versionless Safari browser");
    vi.mocked(fetch)
      .mockResolvedValueOnce(pinCreateResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          authToken: "token",
          clientIdentifier: "client-id",
        }),
      } as Response);
    await new PlexOAuth().login();
    expect(popupMocks.navigateToUrl.mock.calls[0][0]).toContain(
      "context%5Bdevice%5D%5BplatformVersion%5D=Unknown"
    );

    stubUserAgent("Edge without digits");
    popupMocks.navigateToUrl.mockClear();
    vi.mocked(fetch)
      .mockResolvedValueOnce(pinCreateResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          authToken: "token",
          clientIdentifier: "client-id",
        }),
      } as Response);
    await new PlexOAuth().login();
    expect(popupMocks.navigateToUrl.mock.calls[0][0]).toContain(
      "context%5Bdevice%5D%5BplatformVersion%5D=Unknown"
    );
  });

  it("falls back to Unknown for Chrome without a version", async () => {
    stubUserAgent("Chrome without digits on Linux");
    vi.mocked(fetch)
      .mockResolvedValueOnce(pinCreateResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          authToken: "token",
          clientIdentifier: "client-id",
        }),
      } as Response);

    await new PlexOAuth().login();
    expect(popupMocks.navigateToUrl.mock.calls[0][0]).toContain(
      "context%5Bdevice%5D%5BplatformVersion%5D=Unknown"
    );
  });
});
