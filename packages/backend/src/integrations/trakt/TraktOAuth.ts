import { logger } from "@utils/logger";

import { TraktApiError } from "./TraktApiError";

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

export interface TraktPinCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

interface PendingTraktPin {
  deviceCode: string;
  userCode: string;
  expiresAt: number;
}

const TRAKT_USER_AGENT = "Scroblarr/1.0.0";
const TRAKT_OAUTH_TIMEOUT_MS = 30_000;
const TRAKT_API_BASE_URL = "https://api.trakt.tv";
const pendingPinsByUserId = new Map<string, PendingTraktPin>();

async function fetchWithTimeout(
  url: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  errorContext: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRAKT_OAUTH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${errorContext} timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseOAuthErrorBody(errorText: string): {
  error?: string;
  errorDescription?: string;
} {
  try {
    const body = JSON.parse(errorText) as {
      error?: string;
      error_description?: string;
    };
    return {
      error: body.error,
      errorDescription: body.error_description,
    };
  } catch {
    return {};
  }
}

export function rememberTraktPin(
  userId: string,
  pin: Pick<TraktPinCodeResponse, "device_code" | "user_code" | "expires_in">
): void {
  pendingPinsByUserId.set(userId, {
    deviceCode: pin.device_code,
    userCode: pin.user_code,
    expiresAt: Date.now() + pin.expires_in * 1000,
  });
}

export function resolveTraktDeviceCode(
  userId: string,
  userCode: string
): string {
  const pending = pendingPinsByUserId.get(userId);
  if (!pending || pending.expiresAt <= Date.now()) {
    pendingPinsByUserId.delete(userId);
    throw new Error(
      "Trakt device code expired. Generate a new one to try again."
    );
  }

  if (pending.userCode !== userCode) {
    throw new Error("Trakt PIN code does not match the active authorization");
  }

  return pending.deviceCode;
}

export function clearTraktPin(userId: string): void {
  pendingPinsByUserId.delete(userId);
}

export class TraktOAuth {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  private getJsonHeaders(): Record<string, string> {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": TRAKT_USER_AGENT,
      "trakt-api-version": "2",
      "trakt-api-key": this.clientId,
    };
  }

  private toTokens(tokenData: TraktTokenResponse): TraktTokens {
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    };
  }

  async requestPinCode(): Promise<TraktPinCodeResponse> {
    const response = await fetchWithTimeout(
      `${TRAKT_API_BASE_URL}/oauth/device/code`,
      {
        method: "POST",
        headers: this.getJsonHeaders(),
        body: JSON.stringify({
          client_id: this.clientId,
        }),
      },
      "Trakt PIN code request"
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.trakt.error(
        { status: response.status, errorText },
        "Failed to request Trakt PIN code"
      );
      throw new Error(
        `Failed to request Trakt PIN code: ${response.status} - ${errorText}`
      );
    }

    const pinData = (await response.json()) as Partial<TraktPinCodeResponse>;
    if (
      !pinData.device_code ||
      !pinData.user_code ||
      !pinData.verification_url ||
      !pinData.expires_in ||
      !pinData.interval
    ) {
      throw new Error("Trakt PIN response did not include a user code");
    }

    return {
      device_code: pinData.device_code,
      user_code: pinData.user_code,
      verification_url: pinData.verification_url,
      expires_in: pinData.expires_in,
      interval: pinData.interval,
    };
  }

  async exchangePinForToken(deviceCode: string): Promise<TraktTokens> {
    const response = await fetchWithTimeout(
      `${TRAKT_API_BASE_URL}/oauth/device/token`,
      {
        method: "POST",
        headers: this.getJsonHeaders(),
        body: JSON.stringify({
          code: deviceCode,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      },
      "Trakt PIN status check"
    );

    if (response.ok) {
      const tokenData = (await response.json()) as TraktTokenResponse;
      if (!tokenData.access_token || !tokenData.refresh_token) {
        throw new Error("Trakt token response did not include an access token");
      }
      return this.toTokens(tokenData);
    }

    const errorText = await response.text();
    const { error, errorDescription } = parseOAuthErrorBody(errorText);

    // Trakt device auth uses status codes: 400 pending, 410 expired, 429 slow down.
    // Pending responses are often an empty body without an OAuth error field.
    if (
      response.status === 400 ||
      error === "authorization_pending" ||
      error === "pending"
    ) {
      throw new Error("authorization pending");
    }
    if (response.status === 429 || error === "slow_down") {
      throw new Error("slow down");
    }
    if (
      response.status === 410 ||
      error === "expired_token" ||
      error === "expired"
    ) {
      throw new Error(
        "Trakt device code expired. Generate a new one to try again."
      );
    }

    logger.trakt.error(
      { status: response.status, errorText, error },
      "Failed to check Trakt PIN status"
    );
    throw new Error(
      errorDescription ||
        error ||
        `Failed to check Trakt PIN status: ${response.status} - ${errorText}`
    );
  }

  async refreshToken(refreshToken: string): Promise<TraktTokens> {
    const response = await fetchWithTimeout(
      `${TRAKT_API_BASE_URL}/oauth/token`,
      {
        method: "POST",
        headers: this.getJsonHeaders(),
        body: JSON.stringify({
          refresh_token: refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
          grant_type: "refresh_token",
        }),
      },
      "Trakt token refresh"
    );

    if (!response.ok) {
      const errorText = await response.text();
      const apiError = TraktApiError.fromResponse(
        response.status,
        errorText,
        response.headers.get("www-authenticate")
      );
      logger.trakt.error(
        {
          status: response.status,
          errorText,
          wwwAuthenticate: response.headers.get("www-authenticate"),
        },
        "Failed to refresh Trakt token"
      );
      throw apiError;
    }

    const tokenData = (await response.json()) as TraktTokenResponse;
    return this.toTokens(tokenData);
  }
}
