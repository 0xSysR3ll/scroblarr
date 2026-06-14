import { jsonResponse } from "@test/jsonResponse";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSimklAuthorizeUrl,
  getSimklStatus,
  invalidateSimklCache,
  linkSimkl,
  unlinkSimkl,
} from "./simkl";

const expectedHeaders = { "Content-Type": "application/json" };

describe("simkl api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    invalidateSimklCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    invalidateSimklCache();
  });

  it("requests a PIN authorization payload with client ID", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        userCode: "ABCDE",
        verificationUrl: "https://simkl.com/pin/",
        expiresIn: 900,
        interval: 5,
      })
    );

    await expect(getSimklAuthorizeUrl("client id")).resolves.toEqual({
      userCode: "ABCDE",
      verificationUrl: "https://simkl.com/pin/",
      expiresIn: 900,
      interval: 5,
    });

    const actualUrl = new URL(String(fetchMock.mock.calls[0][0]), "http://app");
    expect(actualUrl.pathname).toBe("/api/v1/simkl/authorize");
    expect(actualUrl.searchParams.get("clientId")).toBe("client id");
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      headers: expectedHeaders,
    });
  });

  it("posts PIN codes and invalidates cached status", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          linked: false,
          username: null,
          image: null,
          hasCredentials: true,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          linked: true,
          username: "alice",
          image: "https://img.example/alice.png",
          hasCredentials: true,
        })
      );

    await getSimklStatus();
    await expect(linkSimkl("ABCDE", "id")).resolves.toEqual({
      success: true,
    });
    await expect(getSimklStatus()).resolves.toMatchObject({
      linked: true,
      username: "alice",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/simkl/link", {
      method: "POST",
      headers: expectedHeaders,
      body: JSON.stringify({
        userCode: "ABCDE",
        clientId: "id",
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("unlinks accounts and clears cached status", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          linked: true,
          username: "alice",
          image: null,
          hasCredentials: true,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          linked: false,
          username: null,
          image: null,
          hasCredentials: false,
        })
      );

    await getSimklStatus();
    await expect(unlinkSimkl()).resolves.toEqual({ success: true });
    await expect(getSimklStatus()).resolves.toMatchObject({ linked: false });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/simkl/unlink", {
      method: "POST",
      headers: expectedHeaders,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
