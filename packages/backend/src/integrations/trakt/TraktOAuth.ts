import { logger } from "@utils/logger";

export interface TraktTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

export interface TraktTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class TraktOAuth {
  private clientId: string;
  private clientSecret: string;
  private baseUrl = "https://api.trakt.tv";
  private authUrl = "https://trakt.tv/oauth/authorize";

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  getAuthUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
    });

    if (state) {
      params.append("state", state);
    }

    return `${this.authUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(
    code: string,
    redirectUri: string
  ): Promise<TraktTokens> {
    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": this.clientId,
      },
      body: JSON.stringify({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.trakt.error(
        { status: response.status, errorText },
        "Failed to exchange Trakt authorization code"
      );
      throw new Error(
        `Failed to exchange Trakt authorization code: ${response.status} - ${errorText}`
      );
    }

    const tokenData = (await response.json()) as TraktTokenResponse;

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    };
  }

  async refreshToken(refreshToken: string): Promise<TraktTokens> {
    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": this.clientId,
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.trakt.error(
        { status: response.status, errorText },
        "Failed to refresh Trakt token"
      );
      throw new Error(
        `Failed to refresh Trakt token: ${response.status} - ${errorText}`
      );
    }

    const tokenData = (await response.json()) as TraktTokenResponse;

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    };
  }
}
