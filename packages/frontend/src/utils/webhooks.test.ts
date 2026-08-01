import {
  buildJellyfinWebhookUrl,
  buildPlexWebhookUrl,
  getScroblarrOrigin,
  JELLYFIN_WEBHOOK_TEMPLATE,
} from "@utils/webhooks";
import { describe, expect, it, vi } from "vitest";

describe("webhooks utils", () => {
  it("strips trailing slashes from the origin", () => {
    expect(getScroblarrOrigin("https://scroblarr.example.com/")).toBe(
      "https://scroblarr.example.com"
    );
  });

  it("builds a Plex webhook URL with an encoded apiKey", () => {
    expect(
      buildPlexWebhookUrl("sk_test+key", "https://scroblarr.example.com")
    ).toBe(
      "https://scroblarr.example.com/api/v1/webhooks/plex?apiKey=sk_test%2Bkey"
    );
  });

  it("builds a Jellyfin webhook URL without a query key", () => {
    expect(buildJellyfinWebhookUrl("http://192.168.1.10:3000")).toBe(
      "http://192.168.1.10:3000/api/v1/webhooks/jellyfin"
    );
  });

  it("exposes the Jellyfin Handlebars template fields Scroblarr expects", () => {
    expect(JELLYFIN_WEBHOOK_TEMPLATE).toContain(
      '"notificationType": "{{NotificationType}}"'
    );
    expect(JELLYFIN_WEBHOOK_TEMPLATE).toContain(
      '"playedToCompletion": "{{PlayedToCompletion}}"'
    );
    expect(JELLYFIN_WEBHOOK_TEMPLATE).toContain("{{{Name}}}");
  });

  it("falls back to an empty origin when none is provided and window is unavailable", () => {
    vi.stubGlobal("window", undefined);
    try {
      expect(getScroblarrOrigin()).toBe("");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
