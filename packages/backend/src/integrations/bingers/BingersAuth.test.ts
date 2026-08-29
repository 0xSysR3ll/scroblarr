import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BingersApiError,
  bingersErrorFromResponse,
  isBingersAuthError,
  isBingersRateLimitError,
} from "./BingersApiError";
import { BingersAuth, extractMagicLinkToken } from "./BingersAuth";
import {
  cookieHeaderFromJar,
  collectSetCookieHeaders,
  emptyCookieJar,
  hasUsableSessionCookie,
  isCorruptStoredCookieJar,
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

  it("returns an empty jar for blank or invalid JSON", () => {
    expect(parseCookieJar("")).toEqual({});
    expect(parseCookieJar("not-json")).toEqual({});
    expect(parseCookieJar("[]")).toEqual({});
  });

  it("omits expired cookies from the Cookie header", () => {
    expect(
      cookieHeaderFromJar({
        live: { name: "live", value: "1", expires: Date.now() + 60_000 },
        dead: { name: "dead", value: "2", expires: Date.now() - 1 },
      })
    ).toBe("live=1");
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

  it("splits comma-joined Set-Cookie values after Path=/ without breaking Expires", () => {
    const jar = mergeSetCookieHeaders({}, [
      "session_token=abc; Expires=Thu, 01 Jan 2030 00:00:00 GMT; Path=/, other=xyz; Path=/",
    ]);
    expect(jar.session_token?.value).toBe("abc");
    expect(jar.other?.value).toBe("xyz");
  });

  it("falls back to headers.get when getSetCookie is unavailable", () => {
    const response = {
      headers: {
        getSetCookie: undefined,
        get: (name: string) =>
          name.toLowerCase() === "set-cookie"
            ? "session_token=abc; Path=/, other=xyz; Path=/"
            : null,
      },
    } as unknown as Response;

    const headers = collectSetCookieHeaders(response);
    expect(headers).toEqual(["session_token=abc; Path=/, other=xyz; Path=/"]);

    const jar = mergeSetCookieHeaders({}, headers);
    expect(jar.session_token?.value).toBe("abc");
    expect(jar.other?.value).toBe("xyz");
  });

  it("returns an empty list when Set-Cookie headers are absent", () => {
    const response = {
      headers: {
        getSetCookie: undefined,
        get: () => null,
      },
    } as unknown as Response;

    expect(collectSetCookieHeaders(response)).toEqual([]);
  });

  it("returns an empty jar helper", () => {
    expect(emptyCookieJar()).toEqual({});
  });

  it("detects corrupt stored cookie jars", () => {
    expect(isCorruptStoredCookieJar(null)).toBe(false);
    expect(isCorruptStoredCookieJar("")).toBe(false);
    expect(isCorruptStoredCookieJar("not-json")).toBe(true);
    expect(isCorruptStoredCookieJar('{"bad":{"value":"x"}}')).toBe(true);
    expect(
      isCorruptStoredCookieJar(
        serializeCookieJar({
          session_token: { name: "session_token", value: "abc" },
        })
      )
    ).toBe(false);
  });

  it("checks for a usable session cookie", () => {
    expect(hasUsableSessionCookie({})).toBe(false);
    expect(
      hasUsableSessionCookie({
        session_token: { name: "session_token", value: "abc" },
      })
    ).toBe(true);
    expect(
      hasUsableSessionCookie({
        session_token: {
          name: "session_token",
          value: "dead",
          expires: Date.now() - 1,
        },
      })
    ).toBe(false);
  });

  it("skips invalid jar entries when parsing", () => {
    expect(
      parseCookieJar(
        JSON.stringify({
          ok: { value: "1", expires: 99 },
          badType: "nope",
          noValue: { expires: 1 },
          nullEntry: null,
        })
      )
    ).toEqual({ ok: { name: "ok", value: "1", expires: 99 } });
  });

  it("ignores blank or malformed Set-Cookie parts", () => {
    const jar = mergeSetCookieHeaders({}, [
      "",
      "=novalue",
      "deleted=; Max-Age=0",
      "gone=deleted; Path=/",
      "live=1; Path=/",
    ]);
    expect(jar).toEqual({
      live: expect.objectContaining({ name: "live", value: "1" }),
    });
  });
});

describe("BingersApiError helpers", () => {
  it("detects auth and rate-limit errors", () => {
    const auth = new BingersApiError("dead", 401, { isAuthError: true });
    const rate = new BingersApiError("slow", 429, { isRateLimited: true });
    expect(isBingersAuthError(auth)).toBe(true);
    expect(isBingersAuthError(rate)).toBe(false);
    expect(isBingersRateLimitError(rate)).toBe(true);
    expect(isBingersRateLimitError(new Error("nope"))).toBe(false);
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

  it("throws for blank input", () => {
    expect(() => extractMagicLinkToken("   ")).toThrow(/required/i);
  });

  it("reads magic_link_token query param", () => {
    expect(
      extractMagicLinkToken("https://bingers.app/m?magic_link_token=mlt")
    ).toBe("mlt");
  });

  it("extracts from relative path-style input via placeholder URL", () => {
    expect(extractMagicLinkToken("m?token=rel-token")).toBe("rel-token");
  });

  it("falls back to regex when URL parsing fails", () => {
    expect(extractMagicLinkToken("https://%?token=catch-tok")).toBe(
      "catch-tok"
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

  it("marks 401 responses as auth errors and falls back to body text", () => {
    const error = bingersErrorFromResponse(401, "unauthorized");
    expect(error.isAuthError).toBe(true);
    expect(error.message).toBe("unauthorized");
  });

  it("uses a default message when the body is empty", () => {
    const error = bingersErrorFromResponse(500, "   ");
    expect(error.message).toBe("Bingers API error: 500");
    expect(error.isRateLimited).toBe(false);
  });

  it("treats 429 as rate limited", () => {
    const error = bingersErrorFromResponse(429, '{"message":"slow down"}');
    expect(error.isRateLimited).toBe(true);
    expect(error.message).toBe("slow down");
  });

  it("treats positive retryAfterSeconds as rate limited without a known code", () => {
    const error = bingersErrorFromResponse(
      400,
      JSON.stringify({
        error: {
          message: "try later",
          retryAfterSeconds: 30,
        },
      })
    );
    expect(error.isRateLimited).toBe(true);
    expect(error.retryAfterSeconds).toBe(30);
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

  it("follows a redirect after magic-link verify when cookies are present", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: {
          get: () => null,
          getSetCookie: () => ["session_token=sess; Path=/"],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          session: { id: "s1", expiresAt: 1_800_000_000 },
          user: { id: "u1", email: "user@example.com" },
        }),
        headers: { get: () => null, getSetCookie: () => [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: { id: "u1" }, profile: {} }),
        headers: { get: () => null, getSetCookie: () => [] },
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const session = await new BingersAuth().verifyMagicLink("magic-token");
    expect(session.cookieJar.session_token?.value).toBe("sess");
    expect(session.expiresAt).toBe(1_800_000_000_000);
  });

  it("rejects reused magic links that redirect without cookies", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 302,
      headers: { get: () => null, getSetCookie: () => [] },
    }) as unknown as typeof fetch;

    await expect(
      new BingersAuth().verifyMagicLink("used-token")
    ).rejects.toMatchObject({
      message:
        "Magic link already used or expired; request a new sign-in link from Bingers",
      code: "magic_link_invalid",
      status: 400,
    });
  });

  it("throws when magic-link verify returns no cookies", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null, getSetCookie: () => [] },
    }) as unknown as typeof fetch;

    await expect(new BingersAuth().verifyMagicLink("token")).rejects.toThrow(
      /did not return session cookies/i
    );
  });

  it("throws auth errors from get-session and keeps non-auth me failures best-effort", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          session: { id: "s1" },
          user: { id: "u1", email: "user@example.com", name: "User" },
        }),
        headers: { get: () => null, getSetCookie: () => [] },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "me down",
        headers: { get: () => null, getSetCookie: () => [] },
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const session = await new BingersAuth().getSession({
      session_token: { name: "session_token", value: "sess" },
    });
    expect(session.user?.email).toBe("user@example.com");
    expect(session.user?.name).toBe("User");
  });

  it("rejects empty cookie jars as auth errors", async () => {
    await expect(new BingersAuth().getSession({})).rejects.toMatchObject({
      isAuthError: true,
      status: 401,
    });
  });

  it("maps get-session 403 responses to auth errors", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => null, getSetCookie: () => [] },
    }) as unknown as typeof fetch;

    await expect(
      new BingersAuth().getSession({
        session_token: { name: "session_token", value: "sess" },
      })
    ).rejects.toMatchObject({ isAuthError: true, status: 403 });
  });

  it("rethrows auth errors from getMe during enrichment", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          session: { id: "s1" },
          user: { id: "u1" },
        }),
        headers: { get: () => null, getSetCookie: () => [] },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => null, getSetCookie: () => [] },
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      new BingersAuth().getSession({
        session_token: { name: "session_token", value: "sess" },
      })
    ).rejects.toMatchObject({ isAuthError: true, status: 401 });
  });

  it("maps magic-link verify HTTP errors when no cookies are returned", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: { code: "magic_link_expired", message: "expired" },
        }),
      headers: { get: () => null, getSetCookie: () => [] },
    }) as unknown as typeof fetch;

    await expect(
      new BingersAuth().verifyMagicLink("dead")
    ).rejects.toMatchObject({
      message: "expired",
      code: "magic_link_expired",
      status: 400,
    });
  });

  it("maps non-auth get-session failures", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
      headers: { get: () => null, getSetCookie: () => [] },
    }) as unknown as typeof fetch;

    await expect(
      new BingersAuth().getSession({
        session_token: { name: "session_token", value: "sess" },
      })
    ).rejects.toMatchObject({ status: 500, message: "boom" });
  });

  it("rejects null and empty get-session payloads as auth errors", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
        headers: { get: () => null, getSetCookie: () => [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
        headers: { get: () => null, getSetCookie: () => [] },
      }) as unknown as typeof fetch;

    const auth = new BingersAuth();
    await expect(
      auth.getSession({
        session_token: { name: "session_token", value: "sess" },
      })
    ).rejects.toMatchObject({ isAuthError: true });
    await expect(
      auth.getSession({
        session_token: { name: "session_token", value: "sess" },
      })
    ).rejects.toMatchObject({ isAuthError: true });
  });

  it("rejects empty cookie jars in getMe", async () => {
    await expect(new BingersAuth().getMe({})).rejects.toMatchObject({
      isAuthError: true,
      status: 401,
    });
  });

  it("normalizes flat session payloads and displayName-only profiles", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "s1",
          expiresAt: "not-a-date",
          user: {
            id: 42,
            email: "user@example.com",
            name: "User",
          },
        }),
        headers: { get: () => null, getSetCookie: () => [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          user: { id: "u1", name: "  " },
          profile: { displayName: "Display", avatarUrl: "  " },
        }),
        headers: { get: () => null, getSetCookie: () => [] },
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const session = await new BingersAuth().getSession({
      session_token: { name: "session_token", value: "sess" },
    });
    expect(session.session).toMatchObject({ id: "s1" });
    expect(session.expiresAt).toBeUndefined();
    expect(session.user?.username).toBe("Display");
    expect(session.user?.id).toBe("u1");
  });

  it("keeps session when me enrichment returns a non-object body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          session: { id: "s1", expires: 1_800_000_000 },
          user: { id: "u1", username: "handle" },
        }),
        headers: { get: () => null, getSetCookie: () => [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
        headers: { get: () => null, getSetCookie: () => [] },
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const session = await new BingersAuth().getSession({
      session_token: { name: "session_token", value: "sess" },
    });
    expect(session.expiresAt).toBe(1_800_000_000_000);
    expect(session.user?.username).toBe("handle");
  });

  it("treats non-object get-session bodies as empty sessions", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => 42,
      headers: { get: () => null, getSetCookie: () => [] },
    }) as unknown as typeof fetch;

    await expect(
      new BingersAuth().getSession({
        session_token: { name: "session_token", value: "sess" },
      })
    ).rejects.toMatchObject({ isAuthError: true });
  });

  it("ignores non-object me user/profile fields and keeps avatar URLs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          session: { id: "s1" },
          user: { id: "u1", name: "User" },
        }),
        headers: { get: () => null, getSetCookie: () => [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          user: "not-an-object",
          profile: 7,
        }),
        headers: { get: () => null, getSetCookie: () => [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          session: { id: "s2" },
          user: { id: "u2" },
        }),
        headers: { get: () => null, getSetCookie: () => [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          user: { id: "u2" },
          profile: { avatarUrl: "https://img.example/a.png" },
        }),
        headers: { get: () => null, getSetCookie: () => [] },
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const auth = new BingersAuth();
    const first = await auth.getSession({
      session_token: { name: "session_token", value: "sess" },
    });
    expect(first.user?.username).toBe("User");

    const second = await auth.getSession({
      session_token: { name: "session_token", value: "sess" },
    });
    expect(second.user?.image).toBe("https://img.example/a.png");
  });

  it("defaults cookie-less verify errors to status 400 when response status is 0", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 0,
      headers: { get: () => null, getSetCookie: () => [] },
    }) as unknown as typeof fetch;

    await expect(
      new BingersAuth().verifyMagicLink("token")
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/did not return session cookies/i),
    });
  });

  it("defaults verify HTTP errors to status 400 when response.status is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: undefined,
      text: async () => "bad",
      headers: { get: () => null, getSetCookie: () => [] },
    }) as unknown as typeof fetch;

    await expect(
      new BingersAuth().verifyMagicLink("token")
    ).rejects.toMatchObject({
      status: 400,
      message: "bad",
    });
  });

  it("uses an empty body when verify error text() fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => {
        throw new Error("stream closed");
      },
      headers: { get: () => null, getSetCookie: () => [] },
    }) as unknown as typeof fetch;

    await expect(
      new BingersAuth().verifyMagicLink("token")
    ).rejects.toMatchObject({
      status: 502,
      message: "Bingers API error: 502",
    });
  });

  it("normalizes flat sessions with expires and string user image", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "s1",
          expires: 1_800_000_000_000,
          user: {
            id: "u1",
            email: "user@example.com",
            username: "handle",
            image: "https://img.example/from-session.png",
          },
        }),
        headers: { get: () => null, getSetCookie: () => [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: { id: "u1" }, profile: {} }),
        headers: { get: () => null, getSetCookie: () => [] },
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const session = await new BingersAuth().getSession({
      session_token: { name: "session_token", value: "sess" },
    });
    expect(session.expiresAt).toBe(1_800_000_000_000);
    expect(session.user?.username).toBe("handle");
    expect(session.user?.image).toBe("https://img.example/from-session.png");
  });
});
