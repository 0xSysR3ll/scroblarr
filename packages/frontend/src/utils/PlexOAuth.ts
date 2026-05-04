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

interface PlexHeaders extends Record<string, string> {
  Accept: string;
  "X-Plex-Product": string;
  "X-Plex-Version": string;
  "X-Plex-Client-Identifier": string;
  "X-Plex-Model": string;
  "X-Plex-Platform": string;
  "X-Plex-Platform-Version": string;
  "X-Plex-Device": string;
  "X-Plex-Device-Name": string;
  "X-Plex-Device-Screen-Resolution": string;
  "X-Plex-Language": string;
}

function getBrowserInfo() {
  const ua = navigator.userAgent;
  let browserName = "Unknown";
  let browserVersion = "Unknown";
  let osName = "Unknown";

  // Simple browser detection
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

  // Simple OS detection
  if (ua.indexOf("Windows") > -1) {
    osName = "Windows";
  } else if (ua.indexOf("Mac") > -1) {
    osName = "macOS";
  } else if (ua.indexOf("Linux") > -1) {
    osName = "Linux";
  } else if (ua.indexOf("Android") > -1) {
    osName = "Android";
  } else if (
    ua.indexOf("iOS") > -1 ||
    ua.indexOf("iPhone") > -1 ||
    ua.indexOf("iPad") > -1
  ) {
    osName = "iOS";
  }

  return { browserName, browserVersion, osName };
}

export class PlexOAuth {
  private plexHeaders?: PlexHeaders;
  private pin?: PlexPin;
  private oauthPopup: OAuthPopup;
  private clientIdentifier?: string;

  constructor() {
    this.oauthPopup = new OAuthPopup();
  }

  public initializeHeaders(clientIdentifier: string): void {
    if (typeof window === "undefined") {
      throw new Error(
        "Window is not defined. Are you calling this in the browser?"
      );
    }
    if (!clientIdentifier) {
      throw new Error("Missing Plex client identifier");
    }
    this.clientIdentifier = clientIdentifier;

    const { browserName, browserVersion, osName } = getBrowserInfo();
    this.plexHeaders = {
      Accept: "application/json",
      "X-Plex-Product": "Scroblarr",
      "X-Plex-Version": "1.0.0",
      "X-Plex-Client-Identifier": clientIdentifier,
      "X-Plex-Model": "Plex OAuth",
      "X-Plex-Platform": browserName,
      "X-Plex-Platform-Version": browserVersion,
      "X-Plex-Device": osName,
      "X-Plex-Device-Name": `${browserName} (Scroblarr)`,
      "X-Plex-Device-Screen-Resolution": `${window.screen.width}x${window.screen.height}`,
      "X-Plex-Language": "en",
    };
  }

  public async getPinFromBackend(): Promise<BackendPlexPinResponse> {
    const response = await fetch("/api/v1/auth/plex/pin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to create pin: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as BackendPlexPinResponse;
    return data;
  }

  public preparePopup(): void {
    this.oauthPopup.preparePopup("Plex Auth", 600, 700);
  }

  public closePopup(): void {
    this.oauthPopup.closePopup();
  }

  public async login(): Promise<PlexAuthResult> {
    if (!this.pin || !this.plexHeaders) {
      const backendPin = await this.getPinFromBackend();
      this.pin = { id: backendPin.pinId, code: backendPin.code };
      this.initializeHeaders(backendPin.clientIdentifier);
    }

    if (!this.plexHeaders || !this.pin) {
      throw new Error("Unable to call login if class is not initialized.");
    }

    const params = {
      clientID: this.plexHeaders["X-Plex-Client-Identifier"],
      "context[device][product]": this.plexHeaders["X-Plex-Product"],
      "context[device][version]": this.plexHeaders["X-Plex-Version"],
      "context[device][platform]": this.plexHeaders["X-Plex-Platform"],
      "context[device][platformVersion]":
        this.plexHeaders["X-Plex-Platform-Version"],
      "context[device][device]": this.plexHeaders["X-Plex-Device"],
      "context[device][deviceName]": this.plexHeaders["X-Plex-Device-Name"],
      "context[device][model]": this.plexHeaders["X-Plex-Model"],
      "context[device][screenResolution]":
        this.plexHeaders["X-Plex-Device-Screen-Resolution"],
      "context[device][layout]": "desktop",
      code: this.pin.code,
    };

    const authUrl = `https://app.plex.tv/auth/#!?${this.encodeData(params)}`;

    this.oauthPopup.navigateToUrl(authUrl);
    return this.pinPoll();
  }

  private async pinPoll(): Promise<PlexAuthResult> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timeoutMs = 3 * 60 * 1000; // 3 minutes

      const executePoll = async () => {
        try {
          if (!this.pin || !this.plexHeaders) {
            throw new Error("Unable to poll when pin is not initialized.");
          }

          const response = await fetch(
            `https://plex.tv/api/v2/pins/${this.pin.id}`,
            {
              headers: this.plexHeaders,
            }
          );

          if (!response.ok) {
            throw new Error(`Failed to poll pin: ${response.statusText}`);
          }

          const data = await response.json();

          if (data?.authToken) {
            this.oauthPopup.closePopup();
            resolve({
              authToken: data.authToken,
              clientIdentifier: this.clientIdentifier || "",
            });
          } else if (Date.now() - startedAt < timeoutMs) {
            // Keep polling even if popup appears "closed". COOP isolation can
            // make window.closed unreliable across origins on some setups.
            setTimeout(executePoll, 1000);
          } else {
            this.oauthPopup.closePopup();
            reject(
              new Error(
                "Plex authentication timed out before authorization completed"
              )
            );
          }
        } catch (e) {
          this.oauthPopup.closePopup();
          reject(e instanceof Error ? e : new Error("Polling failed"));
        }
      };

      executePoll();
    });
  }

  private encodeData(data: Record<string, string>): string {
    return Object.keys(data)
      .map((key) => [key, data[key]].map(encodeURIComponent).join("="))
      .join("&");
  }
}
