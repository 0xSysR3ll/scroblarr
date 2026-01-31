import { logger } from "@utils/logger";

export interface JellyfinUser {
  Id: string;
  Name: string;
  ServerId?: string;
  ServerName?: string;
  PrimaryImageTag?: string;
  Configuration?: {
    GroupedFolders: string[];
  };
  Policy?: {
    IsAdministrator: boolean;
  };
}

export interface JellyfinLoginResponse {
  User: JellyfinUser;
  AccessToken: string;
  ServerId?: string;
}

export interface JellyfinUserInfo {
  username: string;
  displayName?: string;
  email?: string;
  thumb?: string;
  id: string;
  isAdmin?: boolean;
}

export class JellyfinClient {
  private baseUrl: string;
  private deviceId: string;
  private clientName: string;

  constructor(baseUrl: string, deviceId?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.deviceId = deviceId || this.generateDeviceId();
    this.clientName = "Scroblarr";
  }

  private generateDeviceId(): string {
    return Buffer.from("scroblarr").toString("base64");
  }

  getAuthHeader(token?: string): string {
    const version = "1.0.0";
    if (token) {
      return `MediaBrowser Client="${this.clientName}", Device="Scroblarr", DeviceId="${this.deviceId}", Version="${version}", Token="${token}"`;
    }
    return `MediaBrowser Client="${this.clientName}", Device="Scroblarr", DeviceId="${this.deviceId}", Version="${version}"`;
  }

  async login(
    username: string,
    password: string
  ): Promise<JellyfinLoginResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/Users/AuthenticateByName`, {
        method: "POST",
        headers: {
          Authorization: this.getAuthHeader(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          Username: username,
          Pw: password,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const statusCode = response.status;

        if (statusCode === 401) {
          logger.jellyfin.warn(
            {
              username,
              errorText: errorText.substring(0, 500),
            },
            "Jellyfin login failed: invalid credentials (401)"
          );
          throw new Error("Invalid credentials");
        }

        logger.jellyfin.error(
          {
            status: statusCode,
            statusText: response.statusText,
            errorText: errorText.substring(0, 500),
            username,
          },
          "Jellyfin login failed"
        );
        throw new Error(
          `Jellyfin authentication failed: ${statusCode} ${response.statusText}`
        );
      }

      const data = (await response.json()) as JellyfinLoginResponse;
      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Failed to authenticate with Jellyfin");
    }
  }

  async getUsers(accessToken: string): Promise<JellyfinUser[]> {
    try {
      const authHeader = this.getAuthHeader(accessToken);
      const response = await fetch(`${this.baseUrl}/Users`, {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        const statusCode = response.status;
        logger.jellyfin.error(
          {
            status: statusCode,
            statusText: response.statusText,
            errorText: errorText.substring(0, 500),
            baseUrl: this.baseUrl.replace(/\/\/.*@/, "//***@"),
          },
          "Failed to get Jellyfin users"
        );
        throw new Error(
          `Failed to get Jellyfin users: ${statusCode} ${response.statusText}`
        );
      }

      const users = (await response.json()) as JellyfinUser[];
      logger.jellyfin.debug(
        {
          userCount: users.length,
          baseUrl: this.baseUrl.replace(/\/\/.*@/, "//***@"),
        },
        "Fetched Jellyfin users"
      );
      return users;
    } catch (error) {
      logger.jellyfin.error({ error }, "Error fetching Jellyfin users");
      throw error;
    }
  }

  async getUserInfo(
    accessToken: string,
    userId: string
  ): Promise<JellyfinUserInfo> {
    try {
      const authHeader = this.getAuthHeader(accessToken);
      const response = await fetch(`${this.baseUrl}/Users/${userId}`, {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        const statusCode = response.status;
        logger.jellyfin.error(
          {
            status: statusCode,
            statusText: response.statusText,
            errorText: errorText.substring(0, 500),
            userId,
          },
          "Failed to get Jellyfin user info"
        );
        throw new Error(
          `Failed to get Jellyfin user info: ${statusCode} ${response.statusText}`
        );
      }

      const user = (await response.json()) as JellyfinUser;
      const thumb = user.PrimaryImageTag
        ? `/api/v1/avatars/jellyfin/${userId}`
        : undefined;

      const userInfo = {
        id: user.Id,
        username: user.Name,
        displayName: user.Name,
        email: undefined,
        thumb,
        isAdmin: user.Policy?.IsAdministrator || false,
      };
      logger.jellyfin.debug(
        {
          userId: user.Id,
          username: user.Name,
          isAdmin: userInfo.isAdmin,
        },
        "Fetched Jellyfin user info"
      );
      return userInfo;
    } catch (error) {
      logger.jellyfin.error(
        { error, userId },
        "Error fetching Jellyfin user info"
      );
      throw error;
    }
  }

  async getSystemInfo(accessToken: string): Promise<{
    ServerName: string;
    Version: string;
  }> {
    try {
      const authHeader = this.getAuthHeader(accessToken);
      const response = await fetch(`${this.baseUrl}/System/Info`, {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.jellyfin.error(
          {
            status: response.status,
            errorText,
          },
          "Failed to get Jellyfin system info"
        );
        throw new Error(
          `Failed to get Jellyfin system info: ${response.status} ${response.statusText}`
        );
      }

      const systemInfo = (await response.json()) as {
        ServerName: string;
        Version: string;
      };
      logger.jellyfin.debug(
        {
          serverName: systemInfo.ServerName,
          version: systemInfo.Version,
        },
        "Fetched Jellyfin system info"
      );
      return systemInfo;
    } catch (error) {
      logger.jellyfin.error({ error }, "Error fetching Jellyfin system info");
      throw error;
    }
  }

  async createApiKey(accessToken: string, appName: string): Promise<string> {
    try {
      const authHeader = this.getAuthHeader(accessToken);
      const createResponse = await fetch(
        `${this.baseUrl}/Auth/Keys?App=${encodeURIComponent(appName)}`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        logger.jellyfin.error(
          {
            status: createResponse.status,
            errorText,
          },
          "Failed to create Jellyfin API key"
        );
        throw new Error(
          `Failed to create API key: ${createResponse.status} ${createResponse.statusText}`
        );
      }

      const keysResponse = await fetch(`${this.baseUrl}/Auth/Keys`, {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      if (!keysResponse.ok) {
        throw new Error("Failed to fetch API keys");
      }

      const keys = (await keysResponse.json()) as {
        Items: Array<{ AppName: string; AccessToken: string }>;
      };

      const apiKey = keys.Items.reverse().find(
        (item) => item.AppName === appName
      );
      if (!apiKey) {
        throw new Error("API key not found after creation");
      }

      return apiKey.AccessToken;
    } catch (error) {
      logger.jellyfin.error({ error }, "Error creating Jellyfin API key");
      throw error;
    }
  }

  async getSeasonPosterUrl(
    accessToken: string,
    episodeItemId: string,
    seasonNumber: number
  ): Promise<string | null> {
    try {
      const authHeader = this.getAuthHeader(accessToken);

      const ancestorsResponse = await fetch(
        `${this.baseUrl}/Items/${episodeItemId}/Ancestors`,
        {
          headers: {
            Authorization: authHeader,
            Accept: "application/json",
          },
        }
      );

      if (!ancestorsResponse.ok) {
        return null;
      }

      const ancestors = (await ancestorsResponse.json()) as Array<{
        Type?: string;
        Id?: string;
      }>;

      const series = ancestors.find((item) => item.Type === "Series");
      if (!series?.Id) {
        return null;
      }

      const seasonsResponse = await fetch(
        `${this.baseUrl}/Shows/${series.Id}/Seasons`,
        {
          headers: {
            Authorization: authHeader,
            Accept: "application/json",
          },
        }
      );

      if (!seasonsResponse.ok) {
        return null;
      }

      const seasonsData = (await seasonsResponse.json()) as {
        Items?: Array<{
          Id?: string;
          IndexNumber?: number;
        }>;
      };

      const season = seasonsData.Items?.find(
        (s) => s.IndexNumber === seasonNumber
      );

      if (!season?.Id) {
        return null;
      }

      return new URL(
        `/Items/${season.Id}/Images/Primary`,
        this.baseUrl
      ).toString();
    } catch (error) {
      logger.jellyfin.error(
        { error, episodeItemId, seasonNumber },
        "Error fetching season poster URL"
      );
      return null;
    }
  }

  async fetchImage(
    accessToken: string,
    imageUrl: string
  ): Promise<{ buffer: ArrayBuffer; contentType: string }> {
    const authHeader = this.getAuthHeader(accessToken);
    const response = await fetch(imageUrl, {
      headers: {
        Authorization: authHeader,
        Accept: "image/*",
      },
    });

    if (!response.ok) {
      logger.jellyfin.warn(
        {
          status: response.status,
          imageUrl,
        },
        "Failed to fetch Jellyfin image"
      );
      throw new Error(
        `Failed to fetch image: ${response.status} ${response.statusText}`
      );
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();

    return { buffer, contentType };
  }
}
