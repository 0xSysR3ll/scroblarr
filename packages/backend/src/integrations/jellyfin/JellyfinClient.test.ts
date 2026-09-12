import { afterEach, describe, expect, it, vi } from "vitest";

import { JellyfinClient } from "./JellyfinClient";

describe("JellyfinClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches images with the provided abort signal", async () => {
    const imageBytes = new Uint8Array([1, 2, 3]).buffer;
    const signal = AbortSignal.timeout(10_000);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "image/jpeg" : null,
      },
      arrayBuffer: async () => imageBytes,
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new JellyfinClient("https://jellyfin.local");
    const result = await client.fetchImage(
      "access-token",
      "https://jellyfin.local/Items/1/Images/Primary",
      signal
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://jellyfin.local/Items/1/Images/Primary",
      expect.objectContaining({ signal })
    );
    expect(result.contentType).toBe("image/jpeg");
    expect(result.buffer).toBe(imageBytes);
  });

  it("throws when Jellyfin image fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(
      client.fetchImage(
        "access-token",
        "https://jellyfin.local/Items/1/Images/Primary"
      )
    ).rejects.toThrow("Failed to fetch image: 404 Not Found");
  });

  it("rejects image URLs outside the configured Jellyfin host", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(
      client.fetchImage(
        "access-token",
        "http://169.254.169.254/latest/meta-data/"
      )
    ).rejects.toThrow("Jellyfin image URL must match configured server");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid image URLs before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(
      client.fetchImage("access-token", "not-a-url")
    ).rejects.toThrow("Jellyfin image URL must match configured server");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows image URLs when only the default HTTPS port differs", async () => {
    const imageBytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      arrayBuffer: async () => imageBytes,
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new JellyfinClient("https://jellyfin.local:443");
    const result = await client.fetchImage(
      "access-token",
      "https://jellyfin.local/Items/1/Images/Primary"
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.contentType).toBe("image/jpeg");
  });

  it("builds season poster URLs under the configured Jellyfin base path", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ Type: "Series", Id: "series-1" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Items: [{ Id: "season-9", IndexNumber: 2 }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new JellyfinClient("https://jellyfin.local/jf");
    await expect(
      client.getSeasonPosterUrl("access-token", "episode-1", 2)
    ).resolves.toBe("https://jellyfin.local/jf/Items/season-9/Images/Primary");
  });

  it("returns null when season poster lookup throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(
      client.getSeasonPosterUrl("access-token", "episode-1", 1)
    ).resolves.toBeNull();
  });
});
