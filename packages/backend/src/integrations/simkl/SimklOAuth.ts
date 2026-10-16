import { fetchWithTimeout } from "@utils/fetchWithTimeout";
import { logger } from "@utils/logger";
import { parseOAuthErrorBody } from "@utils/parseOAuthErrorBody";
import { createPendingDeviceCodeStore } from "@utils/pendingDeviceCodeStore";

import {
  getSimklHeaders,
  SIMKL_API_BASE_URL,
  SIMKL_OAUTH_SCOPES,
  withSimklQueryParams,
} from "./SimklApi";

export interface SimklTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface SimklTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

export interface SimklDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

const simklDeviceStore = createPendingDeviceCodeStore("Simkl");
export const rememberSimklDevice = simklDeviceStore.remember;
export const resolveSimklDeviceCode = simklDeviceStore.resolve;
export const clearSimklDevice = simklDeviceStore.clear;

function toTokens(tokenData: SimklTokenResponse): SimklTokens {
  if (!tokenData.access_token) {
    throw new Error("Simkl token response did not include an access token");
  }

  const tokens: SimklTokens = {
    accessToken: tokenData.access_token,
    scope: tokenData.scope,
  };

  if (tokenData.refresh_token) {
    tokens.refreshToken = tokenData.refresh_token;
  }
  if (typeof tokenData.expires_in === "number") {
    tokens.expiresAt = Date.now() + tokenData.expires_in * 1000;
  }

  return tokens;
}

export class SimklOAuth {
  constructor(private readonly clientId: string) {}

  private getFormHeaders(): Record<string, string> {
    return getSimklHeaders(
      this.clientId,
      undefined,
      "application/x-www-form-urlencoded"
    );
  }

  async requestPinCode(): Promise<SimklDeviceCodeResponse> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      scope: SIMKL_OAUTH_SCOPES,
    });

    const response = await fetchWithTimeout(
      withSimklQueryParams(
        `${SIMKL_API_BASE_URL}/oauth2/device`,
        this.clientId
      ),
      {
        method: "POST",
        headers: this.getFormHeaders(),
        body,
      },
      "Simkl device code request"
    );

    if (!response.ok) {
      const errorText = await response.text();
      const { error, errorDescription } = parseOAuthErrorBody(errorText);
      logger.simkl.error(
        { status: response.status, errorText, error },
        "Failed to request Simkl device code"
      );

      if (error === "invalid_client" || response.status === 401) {
        throw new Error(
          "This Client ID is not supported for Simkl linking. Create a new app at https://simkl.com/settings/developer/ and use that Client ID."
        );
      }

      throw new Error(
        errorDescription ||
          error ||
          `Failed to request Simkl device code: ${response.status} - ${errorText}`
      );
    }

    const pinData = (await response.json()) as Partial<SimklDeviceCodeResponse>;
    if (
      !pinData.device_code ||
      !pinData.user_code ||
      !pinData.verification_uri ||
      !pinData.expires_in ||
      !pinData.interval
    ) {
      throw new Error("Simkl device response did not include a user code");
    }

    return {
      device_code: pinData.device_code,
      user_code: pinData.user_code,
      verification_uri: pinData.verification_uri,
      verification_uri_complete: pinData.verification_uri_complete,
      expires_in: pinData.expires_in,
      interval: pinData.interval,
    };
  }

  async exchangePinForToken(deviceCode: string): Promise<SimklTokens> {
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: this.clientId,
      device_code: deviceCode,
    });

    const response = await fetchWithTimeout(
      withSimklQueryParams(`${SIMKL_API_BASE_URL}/oauth2/token`, this.clientId),
      {
        method: "POST",
        headers: this.getFormHeaders(),
        body,
      },
      "Simkl device token poll"
    );

    if (response.ok) {
      const tokenData = (await response.json()) as SimklTokenResponse;
      const tokens = toTokens(tokenData);

      if (tokenData.scope && !/\bmedia:write\b/.test(tokenData.scope)) {
        logger.simkl.warn(
          { scope: tokenData.scope },
          "Simkl token is missing media:write; scrobbling may fail"
        );
      }

      return tokens;
    }

    const errorText = await response.text();
    const { error, errorDescription } = parseOAuthErrorBody(errorText);

    if (error === "authorization_pending") {
      throw new Error("authorization pending");
    }
    if (error === "slow_down") {
      throw new Error("slow down");
    }
    if (error === "expired_token") {
      throw new Error(
        "Simkl device code expired. Generate a new one to try again."
      );
    }
    if (error === "invalid_client" || response.status === 401) {
      throw new Error(
        "This Client ID is not supported for Simkl linking. Create a new app at https://simkl.com/settings/developer/ and use that Client ID."
      );
    }

    logger.simkl.error(
      { status: response.status, errorText, error },
      "Failed to poll Simkl device token"
    );
    throw new Error(
      errorDescription ||
        error ||
        `Failed to poll Simkl device token: ${response.status} - ${errorText}`
    );
  }

  async refreshToken(refreshToken: string): Promise<SimklTokens> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.clientId,
      refresh_token: refreshToken,
    });

    const response = await fetchWithTimeout(
      withSimklQueryParams(`${SIMKL_API_BASE_URL}/oauth2/token`, this.clientId),
      {
        method: "POST",
        headers: this.getFormHeaders(),
        body,
      },
      "Simkl token refresh"
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.simkl.error(
        { status: response.status, errorText },
        "Failed to refresh Simkl token"
      );
      throw new Error(
        `Failed to refresh Simkl token: ${response.status} - ${errorText}`
      );
    }

    const tokenData = (await response.json()) as SimklTokenResponse;
    return toTokens(tokenData);
  }

  async revokeToken(token: string): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      token,
    });

    const response = await fetchWithTimeout(
      withSimklQueryParams(
        `${SIMKL_API_BASE_URL}/oauth2/revoke`,
        this.clientId
      ),
      {
        method: "POST",
        headers: this.getFormHeaders(),
        body,
      },
      "Simkl token revoke"
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.simkl.warn(
        { status: response.status, errorText },
        "Simkl token revoke returned a non-OK status"
      );
    }
  }
}
