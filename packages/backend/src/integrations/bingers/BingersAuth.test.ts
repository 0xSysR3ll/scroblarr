import { afterEach, describe, expect, it, vi } from "vitest";

import { BingersApiError, bingersErrorFromResponse } from "./BingersApiError";
import { BingersAuth, extractMagicLinkToken } from "./BingersAuth";
import {
  cookieHeaderFromJar,
  mergeSetCookieHeaders,
  parseCookieJar,
  serializeCookieJar,
} from "./cookieJar";

describe("cookieJar", () => {
  it("serializes and parses jar entries", () => {
    const jar = {
      session_token: { name: "session_token", value: "abc", expires: 123 },
    };
    expect(parseCookieJar(serializeCookieJar(jar))).toEqual(jar);
  });

  it("merges Set-Cookie headers into the jar", () => {
    const jar = mergeSetCookieHeaders({ old: { name: "old", value: "1" } }, [
      "session_token=xyz; Path=/; Max-Age=3600; HttpOnly",
      "old=; Max-Age=0",
    ]);
    expect(jar.session_token?.value).toBe("xyz");
    expect(jar.old).toBeUndefined();
    expect(cookieHeaderFromJar(jar)).toContain("session_token=xyz");
  });
});

describe("extractMagicLinkToken", () => {
  it("accepts a raw token", () => {
    expect(extractMagicLinkToken("raw-token-value")).toBe("raw-token-value");
  });

  it("extracts token from https magic-link URL", () => {
    expect(
      extractMagicLinkToken("https://bingers.app/m?token=abc%2F123&x=1")
    ).toBe("abc/123");
  });

  it("extracts token from deep link", () => {
    expect(
      extractMagicLinkToken("bingers:///magic-link?token=deep-token")
    ).toBe("deep-token");
  });

  it("throws when token is missing", () => {
    expect(() => extractMagicLinkToken("https://bingers.app/m")).toThrow(
      BingersApiError
    );
  });
});

describe("bingersErrorFromResponse", () => {
  it("parses magic_link_recently_sent", () => {
    const error = bingersErrorFromResponse(
      400,
      JSON.stringify({
        error: {
          code: "magic_link_recently_sent",
          message: "We already emailed a sign-in link",
          retryAfterSeconds: 157,
        },
      })
    );
    expect(error.isRateLimited).toBe(true);
    expect(error.retryAfterSeconds).toBe(157);
    expect(error.code).toBe("magic_link_recently_sent");
  });
});

describe("BingersAuth", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("verifies magic-link and loads session from cookies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({}),
        headers: {
          get: () => null,
          getSetCookie: () => [
            "session_token=sess; Path=/; Max-Age=86400; HttpOnly",
          ],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          session: { expiresAt: "2026-09-01T00:00:00.000Z" },
          user: { id: "u1", email: "user@example.com", name: "User" },
        }),
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: "u1",
            name: "User",
            image: "https://lh3.googleusercontent.com/a/avatar",
          },
          profile: {
            handle: "myhandle",
            displayName: "User",
            avatarUrl: null,
          },
        }),
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const auth = new BingersAuth();
    const session = await auth.verifyMagicLink("magic-token");

    expect(session.cookieJar.session_token?.value).toBe("sess");
    expect(session.user?.email).toBe("user@example.com");
    expect(session.user?.username).toBe("myhandle");
    expect(session.user?.image).toBe(
      "https://lh3.googleusercontent.com/a/avatar"
    );
    expect(session.expiresAt).toBe(Date.parse("2026-09-01T00:00:00.000Z"));
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.bingers.app/me",
      expect.objectContaining({ method: "GET" })
    );
  });
});
