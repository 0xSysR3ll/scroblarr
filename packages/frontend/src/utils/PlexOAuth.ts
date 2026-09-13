import { OAuthPopup } from "@utils/OAuthPopup";

export interface PlexPin {
  id: number;
  code: string;
}

interface BackendPlexPinResponse {
  pinId: number;
  code: string;
  clientIdentifier: string;
}

export interface PlexAuthResult {
  authToken: string;
  clientIdentifier: string;
}

function getBrowserInfo() {
  const ua = navigator.userAgent;
  let browserName = "Unknown";
  let browserVersion = "Unknown";
  let osName = "Unknown";

  if (ua.indexOf("Chrome") > -1) {
    browserName = "Chrome";
    const match = ua.match(/Chrome\/(\d+)/);
    browserVersion = match ? match[1] : "Unknown";
  } else if (ua.indexOf("Firefox") > -1) {
    browserName = "Firefox";
    const match = ua.match(/Firefox\/(\d+)/);
    browserVersion = match ? match[1] : "Unknown";
  } else if (ua.indexOf("Safari") > -1) {
    browserName = "Safari";
    const match = ua.match(/Version\/(\d+)/);
    browserVersion = match ? match[1] : "Unknown";
  } else if (ua.indexOf("Edge") > -1) {
    browserName = "Edge";
    const match = ua.match(/Edge\/(\d+)/);
    browserVersion = match ? match[1] : "Unknown";
  }

  if (ua.indexOf("Windows") > -1) {
    osName = "Windows";
  } else if (
    ua.indexOf("iOS") > -1 ||
    ua.indexOf("iPhone") > -1 ||
    ua.indexOf("iPad") > -1
  ) {
    osName = "iOS";
  } else if (ua.indexOf("Android") > -1) {
    osName = "Android";
  } else if (ua.indexOf("Mac") > -1) {
    osName = "macOS";
  } else if (ua.indexOf("Linux") > -1) {
    osName = "Linux";
  }

  return { browserName, browserVersion, osName };
}

export class PlexOAuth {
  private pin?: PlexPin;
  private oauthPopup: OAuthPopup;
  private clientIdentifier?: string;

  constructor() {
    this.oauthPopup = new OAuthPopup();
  }

  public preparePopup(): void {
    this.oauthPopup.preparePopup("Plex Auth", 600, 700);
  }

  public closePopup(): void {
    this.oauthPopup.closePopup();
  }

  public async login(): Promise<PlexAuthResult> {
    this.pin = undefined;
    this.clientIdentifier = undefined;

    const response = await fetch("/api/v1/auth/plex/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to create pin: ${response.status} ${response.statusText}`
      );
    }

    const backendPin = (await response.json()) as BackendPlexPinResponse;
    if (!backendPin.pinId || !backendPin.code || !backendPin.clientIdentifier) {
      throw new Error("Backend returned an incomplete Plex PIN response");
    }

    this.pin = { id: backendPin.pinId, code: backendPin.code };
    this.clientIdentifier = backendPin.clientIdentifier;
    this.oauthPopup.navigateToUrl(this.buildAuthUrl(backendPin));
    return this.pinPoll();
  }

  private buildAuthUrl(backendPin: BackendPlexPinResponse): string {
    const { browserName, browserVersion, osName } = getBrowserInfo();
    const params: Record<string, string> = {
      clientID: backendPin.clientIdentifier,
      "context[device][product]": "Scroblarr",
      "context[device][version]": "1.0.0",
      "context[device][platform]": browserName,
      "context[device][platformVersion]": browserVersion,
      "context[device][device]": osName,
      "context[device][deviceName]": `${browserName} (Scroblarr)`,
      "context[device][model]": "Plex OAuth",
      "context[device][screenResolution]": `${window.screen.width}x${window.screen.height}`,
      "context[device][layout]": "desktop",
      code: backendPin.code,
    };

    return `https://app.plex.tv/auth/#!?${Object.keys(params)
      .map((key) => [key, params[key]].map(encodeURIComponent).join("="))
      .join("&")}`;
  }

  private async pinPoll(): Promise<PlexAuthResult> {
    const startedAt = Date.now();
    const timeoutMs = 3 * 60 * 1000;

    while (Date.now() - startedAt < timeoutMs) {
      const remainingMs = timeoutMs - (Date.now() - startedAt);
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), remainingMs);

      let response: Response;
      try {
        response = await fetch("/api/v1/auth/plex/pin/poll", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pinId: this.pin!.id }),
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          break;
        }
        throw error;
      } finally {
        clearTimeout(abortTimer);
      }

      if (response.status === 202) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error ||
            `Failed to poll pin: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        authToken?: string;
        clientIdentifier?: string;
      };
      if (data.authToken) {
        const result = {
          authToken: data.authToken,
          clientIdentifier: data.clientIdentifier || this.clientIdentifier!,
        };
        this.pin = undefined;
        this.clientIdentifier = undefined;
        this.oauthPopup.closePopup();
        return result;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    this.oauthPopup.closePopup();
    throw new Error(
      "Plex authentication timed out before authorization completed"
    );
  }
}
