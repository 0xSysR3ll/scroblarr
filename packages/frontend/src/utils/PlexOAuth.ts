import { OAuthPopup } from "@utils/OAuthPopup";

export interface PlexPin {
  id: number;
  code: string;
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

function uuidv4(): string {
  return ((1e7).toString() + -1e3 + -4e3 + -8e3 + -1e11).replace(
    /[018]/g,
    function (c) {
      return (
        parseInt(c) ^
        (window.crypto.getRandomValues(new Uint8Array(1))[0] &
          (15 >> (parseInt(c) / 4)))
      ).toString(16);
    }
  );
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

  constructor() {
    this.oauthPopup = new OAuthPopup();
  }

  public initializeHeaders(): void {
    if (typeof window === "undefined") {
      throw new Error(
        "Window is not defined. Are you calling this in the browser?"
      );
    }

    let clientId = localStorage.getItem("plex-client-id");
    if (!clientId) {
      const uuid = uuidv4();
      localStorage.setItem("plex-client-id", uuid);
      clientId = uuid;
    }

    const { browserName, browserVersion, osName } = getBrowserInfo();
    this.plexHeaders = {
      Accept: "application/json",
      "X-Plex-Product": "Scroblarr",
      "X-Plex-Version": "1.0.0",
      "X-Plex-Client-Identifier": clientId,
      "X-Plex-Model": "Plex OAuth",
      "X-Plex-Platform": browserName,
      "X-Plex-Platform-Version": browserVersion,
      "X-Plex-Device": osName,
      "X-Plex-Device-Name": `${browserName} (Scroblarr)`,
      "X-Plex-Device-Screen-Resolution": `${window.screen.width}x${window.screen.height}`,
      "X-Plex-Language": "en",
    };
  }

  public async getPin(): Promise<PlexPin> {
    if (!this.plexHeaders) {
      throw new Error(
        "You must initialize the plex headers clientside to login"
      );
    }

    const response = await fetch("https://plex.tv/api/v2/pins?strong=true", {
      method: "POST",
      headers: this.plexHeaders,
    });

    if (!response.ok) {
      throw new Error(`Failed to create pin: ${response.statusText}`);
    }

    const data = await response.json();
    this.pin = { id: data.id, code: data.code };
    return this.pin;
  }

  public preparePopup(): void {
    this.oauthPopup.preparePopup("Plex Auth", 600, 700);
  }

  public async login(): Promise<string> {
    if (!this.plexHeaders) {
      this.initializeHeaders();
    }
    if (!this.pin) {
      await this.getPin();
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

  private async pinPoll(): Promise<string> {
    return new Promise((resolve, reject) => {
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
            resolve(data.authToken);
          } else if (this.oauthPopup.isPopupOpen()) {
            setTimeout(executePoll, 1000);
          } else {
            this.oauthPopup.closePopup();
            reject(
              new Error(
                "Authentication window was closed before completing login"
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
