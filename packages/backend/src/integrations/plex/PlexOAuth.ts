import { logger } from "@utils/logger";
import { parseString } from "xml2js";

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

type ParsedPlexConnection = {
  protocol: string;
  address: string;
  port: number;
  uri: string;
  local: boolean;
  relay?: boolean;
  reachable?: boolean;
};

type DiscoveredPlexServer = {
  name: string;
  address: string;
  port: string;
  localAddresses?: string;
  machineIdentifier: string;
  version: string;
  url: string;
  connections: ParsedPlexConnection[];
};

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
  private static readonly MAX_CONNECTIONS_PER_SERVER = 6;

  constructor(clientIdentifier?: string) {
    this.clientIdentifier = clientIdentifier || this.generateClientIdentifier();
  }

  getClientIdentifier(): string {
    return this.clientIdentifier;
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
        "X-Plex-Client-Identifier": this.clientIdentifier,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401) {
        logger.plex.debug(
          {
            status: response.status,
            statusText: response.statusText,
          },
          "Plex user not authenticated; skipping user info fetch"
        );
      } else {
        logger.plex.error(
          {
            status: response.status,
            statusText: response.statusText,
            errorText: text.substring(0, 500),
          },
          "Failed to get Plex user info"
        );
      }
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

  async getServers(accessToken: string): Promise<DiscoveredPlexServer[]> {
    const [httpsData, httpData] = await Promise.all([
      this.fetchResources(accessToken, true),
      this.fetchResources(accessToken, false),
    ]);

    const servers: DiscoveredPlexServer[] = [];

    const devicesFromHttps = httpsData.MediaContainer?.Device;
    const devicesFromHttp = httpData.MediaContainer?.Device;

    if (!devicesFromHttps && !devicesFromHttp) {
      return servers;
    }

    const normalizeDevices = (
      devices: PlexDevice | PlexDevice[] | undefined
    ): PlexDevice[] => {
      if (!devices) return [];
      return Array.isArray(devices) ? devices : [devices];
    };

    const allDevices = [
      ...normalizeDevices(devicesFromHttps),
      ...normalizeDevices(devicesFromHttp),
    ];

    const devicesByMachineIdentifier = new Map<string, PlexDevice>();
    const rawConnectionsByMachineIdentifier = new Map<
      string,
      PlexConnection[]
    >();
    const getDeviceId = (device: PlexDevice): string =>
      device.clientIdentifier || device.machineIdentifier || device.name || "";
    const collectRawConnections = (d: PlexDevice): PlexConnection[] =>
      Array.isArray(d.Connection)
        ? d.Connection
        : d.Connection
          ? [d.Connection]
          : [];

    for (const device of allDevices) {
      const id = getDeviceId(device);
      if (!id) continue;
      if (!devicesByMachineIdentifier.has(id)) {
        devicesByMachineIdentifier.set(id, device);
      }
      const existingConnections =
        rawConnectionsByMachineIdentifier.get(id) || [];
      rawConnectionsByMachineIdentifier.set(id, [
        ...existingConnections,
        ...collectRawConnections(device),
      ]);
    }

    const devices = Array.from(devicesByMachineIdentifier.values());

    for (const device of devices) {
      const provides = device.provides || "";
      const product = device.product || "";

      const isServer =
        (typeof provides === "string" && provides.includes("server")) ||
        product === "Plex Media Server";

      if (!isServer || !device.name) {
        continue;
      }

      const rawConnections =
        rawConnectionsByMachineIdentifier.get(getDeviceId(device)) || [];

      const connectionMap = new Map<string, ParsedPlexConnection>();

      for (const c of rawConnections) {
        const protocol = c.protocol || "http";
        const address = c.address || "";
        const port = Number(c.port || "32400");
        const uri = c.uri || `${protocol}://${address}:${port}`;
        const local = c.local === "1" || c.local === true || c.local === "true";
        const relay = c.relay === "1" || c.relay === true || c.relay === "true";
        const key = `${protocol}|${address}|${port}|${local ? "1" : "0"}|${
          relay ? "1" : "0"
        }`;

        connectionMap.set(key, {
          protocol,
          address,
          port,
          uri,
          local,
          relay,
        });
      }

      const parsedConnections = this.compactAndSortConnections(
        Array.from(connectionMap.values())
      );

      if (parsedConnections.length === 0) {
        continue;
      }

      const connectionsWithReachability =
        await this.annotateConnectionReachability(
          parsedConnections,
          accessToken
        );

      const localSecureConnection = connectionsWithReachability.find(
        (c) => c.local && c.protocol === "https"
      );
      const localConnection = connectionsWithReachability.find((c) => c.local);
      const remoteSecureConnection = connectionsWithReachability.find(
        (c) => !c.local && c.protocol === "https"
      );
      const remotePlexDirectConnection = connectionsWithReachability.find(
        (c) => !c.local && c.uri && c.uri.includes("plex.direct")
      );
      const anyConnection = connectionsWithReachability[0];

      // Prefer local connection by default because it's usually reachable
      // from self-hosted containers, then fallback to remote options.
      const preferredConnection =
        localSecureConnection ||
        localConnection ||
        remoteSecureConnection ||
        remotePlexDirectConnection ||
        anyConnection;

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
        connections: connectionsWithReachability,
      });
    }
    return servers;
  }

  private async annotateConnectionReachability(
    connections: ParsedPlexConnection[],
    accessToken: string
  ): Promise<ParsedPlexConnection[]> {
    const timeoutMs = 1500;
    return Promise.all(
      connections.map(async (connection) => {
        try {
          const identityUrl = `${connection.uri}/identity`;
          const response = await fetch(identityUrl, {
            headers: {
              "X-Plex-Token": accessToken,
            },
            signal: AbortSignal.timeout(timeoutMs),
          });
          return {
            ...connection,
            // Any HTTP response means the endpoint is reachable.
            reachable: response.status > 0,
          };
        } catch {
          return { ...connection, reachable: false };
        }
      })
    );
  }

  private async fetchResources(
    accessToken: string,
    includeHttps: boolean
  ): Promise<PlexResourcesResponse> {
    const query = includeHttps
      ? "includeHttps=1&includeRelay=1"
      : "includeRelay=1";
    const response = await fetch(`${this.baseUrl}/api/resources?${query}`, {
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
          includeHttps,
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
    return new Promise<PlexResourcesResponse>((resolve, reject) => {
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
  }

  private compactAndSortConnections(
    connections: ParsedPlexConnection[]
  ): ParsedPlexConnection[] {
    const scoreConnection = (connection: ParsedPlexConnection): number => {
      if (connection.local && connection.protocol === "http") return 0;
      if (connection.local && connection.protocol === "https") return 1;
      if (
        !connection.local &&
        !connection.relay &&
        connection.protocol === "https"
      )
        return 2;
      if (
        !connection.local &&
        !connection.relay &&
        connection.protocol === "http"
      )
        return 3;
      return 4;
    };

    const sorted = [...connections].sort((a, b) => {
      const byScore = scoreConnection(a) - scoreConnection(b);
      if (byScore !== 0) return byScore;
      return a.uri.localeCompare(b.uri);
    });

    const picked: typeof sorted = [];
    const seenAddressPort = new Set<string>();
    for (const connection of sorted) {
      const addressPort = `${connection.address}:${connection.port}`;
      const shouldKeepDuplicateAddressPort =
        connection.local && connection.protocol === "https";

      if (seenAddressPort.has(addressPort) && !shouldKeepDuplicateAddressPort) {
        continue;
      }

      picked.push(connection);
      seenAddressPort.add(addressPort);

      if (picked.length >= PlexOAuth.MAX_CONNECTIONS_PER_SERVER) {
        break;
      }
    }

    return picked;
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
