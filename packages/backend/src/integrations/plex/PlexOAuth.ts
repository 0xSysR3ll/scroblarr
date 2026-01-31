import { parseString } from "xml2js";
import { logger } from "@utils/logger";

interface PlexConnection {
  protocol?: string;
  address?: string;
  port?: string;
  local?: string | boolean;
  relay?: string | boolean;
  uri?: string;
}

interface PlexDevice {
  provides?: string;
  product?: string;
  name?: string;
  clientIdentifier?: string;
  machineIdentifier?: string;
  productVersion?: string;
  version?: string;
  Connection?: PlexConnection | PlexConnection[];
}

interface PlexResourcesMediaContainer {
  Device?: PlexDevice | PlexDevice[];
}

interface PlexResourcesResponse {
  MediaContainer?: PlexResourcesMediaContainer;
}

interface PlexAccount {
  id?: string | number;
  name?: string;
  email?: string;
  thumb?: string;
}

interface PlexAccountsMediaContainer {
  Account?: PlexAccount | PlexAccount[];
}

interface PlexAccountsResponse {
  MediaContainer?: PlexAccountsMediaContainer;
}

interface PlexUser {
  id?: string | number;
  username?: string;
  title?: string;
  email?: string;
  thumb?: string;
}

interface PlexUsersMediaContainer {
  User?: PlexUser | PlexUser[];
}

interface PlexUsersResponse {
  MediaContainer?: PlexUsersMediaContainer;
}

export interface PlexPin {
  id: number;
  code: string;
}

export interface PlexOAuthToken {
  accessToken: string;
  username: string;
  email?: string;
  thumb?: string;
}

export class PlexOAuth {
  private clientIdentifier: string;
  private baseUrl = "https://plex.tv";

  constructor(clientIdentifier?: string) {
    this.clientIdentifier = clientIdentifier || this.generateClientIdentifier();
  }

  private generateClientIdentifier(): string {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      const seed = "scroblarr-installation-v1";
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      const hex = Math.abs(hash)
        .toString(16)
        .padStart(32, "0")
        .substring(0, 32);
      return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-4${hex.substring(
        12,
        15
      )}-${((parseInt(hex[15], 16) & 0x3) | 0x8).toString(16)}${hex.substring(
        16,
        19
      )}-${hex.substring(19, 31)}`;
    }
    return "scroblarr-client";
  }

  async createPin(): Promise<PlexPin> {
    const response = await fetch(`${this.baseUrl}/api/v2/pins?strong=true`, {
      method: "POST",
      headers: {
        "X-Plex-Client-Identifier": this.clientIdentifier,
        "X-Plex-Product": "Scroblarr",
        "X-Plex-Version": "1.0.0",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to create Plex OAuth pin: ${response.status} ${
          response.statusText
        } - ${text.substring(0, 200)}`
      );
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(
        `Expected JSON but got ${contentType}. Response: ${text.substring(
          0,
          200
        )}`
      );
    }

    const data = (await response.json()) as { id: number; code: string };
    return {
      id: data.id,
      code: data.code,
    };
  }

  async getTokenFromPin(pinId: number): Promise<PlexOAuthToken | null> {
    const response = await fetch(`${this.baseUrl}/api/v2/pins/${pinId}`, {
      headers: {
        "X-Plex-Client-Identifier": this.clientIdentifier,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to get token from pin: ${response.status} ${
          response.statusText
        } - ${text.substring(0, 200)}`
      );
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(
        `Expected JSON but got ${contentType}. Response: ${text.substring(
          0,
          200
        )}`
      );
    }

    const data = (await response.json()) as { authToken?: string };
    if (!data.authToken) {
      return null;
    }

    const userInfo = await this.getUserInfo(data.authToken);
    return {
      accessToken: data.authToken,
      username: userInfo.username,
      email: userInfo.email,
      thumb: userInfo.thumb,
    };
  }

  async getUserInfo(accessToken: string): Promise<{
    username: string;
    email?: string;
    thumb?: string;
  }> {
    const response = await fetch(`${this.baseUrl}/api/v2/user`, {
      headers: {
        "X-Plex-Token": accessToken,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      logger.plex.error(
        {
          status: response.status,
          statusText: response.statusText,
          errorText: text.substring(0, 500),
        },
        "Failed to get Plex user info"
      );
      throw new Error(
        `Failed to get user info: ${response.status} ${
          response.statusText
        } - ${text.substring(0, 200)}`
      );
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(
        `Expected JSON but got ${contentType}. Response: ${text.substring(
          0,
          200
        )}`
      );
    }

    const data = (await response.json()) as {
      username: string;
      email?: string;
      thumb?: string;
    };
    return {
      username: data.username,
      email: data.email,
      thumb: data.thumb,
    };
  }

  async getServers(accessToken: string): Promise<
    Array<{
      name: string;
      address: string;
      port: string;
      localAddresses?: string;
      machineIdentifier: string;
      version: string;
      url: string;
      connections: Array<{
        protocol: string;
        address: string;
        port: number;
        uri: string;
        local: boolean;
        relay?: boolean;
      }>;
    }>
  > {
    const response = await fetch(
      `${this.baseUrl}/api/resources?includeHttps=1&includeRelay=1`,
      {
        headers: {
          "X-Plex-Token": accessToken,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logger.plex.error(
        {
          status: response.status,
          statusText: response.statusText,
          errorText: text.substring(0, 500),
        },
        "Failed to get Plex servers"
      );
      throw new Error(
        `Failed to get servers: ${response.status} ${
          response.statusText
        } - ${text.substring(0, 200)}`
      );
    }

    const xmlText = await response.text();

    const data = await new Promise<PlexResourcesResponse>((resolve, reject) => {
      parseString(
        xmlText,
        { explicitArray: false, mergeAttrs: true },
        (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result as PlexResourcesResponse);
          }
        }
      );
    });

    const servers: Array<{
      name: string;
      address: string;
      port: string;
      localAddresses?: string;
      machineIdentifier: string;
      version: string;
      url: string;
      connections: Array<{
        protocol: string;
        address: string;
        port: number;
        uri: string;
        local: boolean;
        relay?: boolean;
      }>;
    }> = [];

    if (!data.MediaContainer || !data.MediaContainer.Device) {
      return servers;
    }

    const devices = Array.isArray(data.MediaContainer.Device)
      ? data.MediaContainer.Device
      : [data.MediaContainer.Device];

    for (const device of devices) {
      const provides = device.provides || "";
      const product = device.product || "";

      const isServer =
        (typeof provides === "string" && provides.includes("server")) ||
        product === "Plex Media Server";

      if (!isServer || !device.name) {
        continue;
      }

      const rawConnections: PlexConnection[] = Array.isArray(device.Connection)
        ? device.Connection
        : device.Connection
          ? [device.Connection]
          : [];

      const parsedConnections = rawConnections.map((c) => ({
        protocol: c.protocol || "http",
        address: c.address || "",
        port: Number(c.port || "32400"),
        uri:
          c.uri ||
          `${c.protocol || "http"}://${c.address || ""}:${c.port || "32400"}`,
        local: c.local === "1" || c.local === true || c.local === "true",
        relay: c.relay === "1" || c.relay === true || c.relay === "true",
      }));

      if (parsedConnections.length === 0) {
        continue;
      }

      // Prefer non-local connection (plex.direct) for remote access, fallback to local
      // plex.direct URLs work from anywhere, local IPs only work on same network
      const remoteConnection = parsedConnections.find(
        (c) => !c.local && c.uri && c.uri.includes("plex.direct")
      );
      const localConnection = parsedConnections.find((c) => c.local);
      const anyConnection = parsedConnections[0];

      // Prefer remote plex.direct, then local, then any
      const preferredConnection =
        remoteConnection || localConnection || anyConnection;

      servers.push({
        name: device.name,
        address: preferredConnection.address,
        port: String(preferredConnection.port),
        localAddresses: parsedConnections
          .filter((c) => c.local)
          .map((c) => c.address)
          .join(", "),
        machineIdentifier:
          device.clientIdentifier || device.machineIdentifier || "",
        version: device.productVersion || device.version || "",
        url: preferredConnection.uri,
        connections: parsedConnections,
      });
    }
    return servers;
  }

  async getServerUsers(
    accessToken: string,
    serverUrl: string
  ): Promise<
    Array<{
      username: string;
      displayName?: string;
      email?: string;
      thumb?: string;
    }>
  > {
    const response = await fetch(`${serverUrl}/accounts`, {
      headers: {
        "X-Plex-Token": accessToken,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      logger.plex.error(
        {
          status: response.status,
          statusText: response.statusText,
          errorText: text.substring(0, 500),
          serverUrl: serverUrl.replace(/\/\/.*@/, "//***@"),
        },
        "Failed to get Plex server users"
      );
      throw new Error(`Failed to get server users: ${response.statusText}`);
    }

    const xmlText = await response.text();

    const data = await new Promise<PlexAccountsResponse>((resolve, reject) => {
      parseString(
        xmlText,
        { explicitArray: false, mergeAttrs: true },
        (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result as PlexAccountsResponse);
          }
        }
      );
    });

    const accounts: Array<{
      username: string;
      displayName?: string;
      email?: string;
      thumb?: string;
    }> = [];

    if (data.MediaContainer && data.MediaContainer.Account) {
      const accountList = Array.isArray(data.MediaContainer.Account)
        ? data.MediaContainer.Account
        : [data.MediaContainer.Account];

      const plexTvUsers: Map<string, string> = new Map();
      const plexTvEmails: Map<string, string> = new Map();
      const plexTvThumbs: Map<string, string> = new Map();

      try {
        const usersResponse = await fetch(`${this.baseUrl}/api/users`, {
          headers: {
            "X-Plex-Token": accessToken,
          },
        });

        if (usersResponse.ok) {
          const usersXmlText = await usersResponse.text();

          const usersData = await new Promise<PlexUsersResponse>(
            (resolve, reject) => {
              parseString(
                usersXmlText,
                { explicitArray: false, mergeAttrs: true },
                (err, result) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve(result as PlexUsersResponse);
                  }
                }
              );
            }
          );

          if (usersData.MediaContainer?.User) {
            const userList = Array.isArray(usersData.MediaContainer.User)
              ? usersData.MediaContainer.User
              : [usersData.MediaContainer.User];

            for (const user of userList) {
              if (!user.id) continue;

              const username = user.username || user.title;
              if (username) {
                plexTvUsers.set(String(user.id), username);
              }
              if (user.email) {
                plexTvEmails.set(String(user.id), user.email);
              }
              if (user.thumb) {
                plexTvThumbs.set(String(user.id), user.thumb);
              }
            }
          }
        }
      } catch (error) {
        logger.plex.warn({ error }, "Failed to fetch users from plex.tv:");
      }

      for (const account of accountList) {
        const accountId = account.id;
        const displayName = account.name;

        if (!accountId) {
          continue;
        }

        if ((accountId === "0" || accountId === "1") && !displayName) {
          continue;
        }

        let plexUsername = plexTvUsers.get(String(accountId));
        if (!plexUsername) {
          if (displayName) {
            plexUsername = displayName;
          } else {
            continue;
          }
        }

        const email = plexTvEmails.get(String(accountId)) || account.email;

        const thumb = plexTvThumbs.get(String(accountId)) || account.thumb;

        accounts.push({
          username: plexUsername as string,
          displayName: displayName,
          email: email,
          thumb: thumb,
        });
      }
    }

    return accounts;
  }

  getAuthUrl(pinCode: string, clientIdentifier: string): string {
    const params = new URLSearchParams({
      clientID: clientIdentifier,
      "context[device][product]": "Scroblarr",
      "context[device][version]": "1.0.0",
      "context[device][platform]": "Web",
      "context[device][platformVersion]": "1.0",
      "context[device][device]": "Browser",
      "context[device][deviceName]": "Scroblarr (Web)",
      "context[device][model]": "Plex OAuth",
      "context[device][layout]": "desktop",
      code: pinCode,
    });
    return `https://app.plex.tv/auth/#!?${params.toString()}`;
  }
}
