import { logger } from "@utils/logger";

import {
  getSimklHeaders,
  SIMKL_API_BASE_URL,
  SIMKL_AUTH_URL,
  withSimklQueryParams,
} from "./SimklApi";

export interface SimklTokenResponse {
  access_token: string;
  token_type?: string;
  scope?: string;
}

export interface SimklTokens {
  accessToken: string;
}

export interface SimklPinCodeResponse {
  result: "OK" | "KO";
  device_code?: string;
  user_code?: string;
  verification_url?: string;
  expires_in?: number;
  interval?: number;
  message?: string;
}

export interface SimklPinStatusResponse {
  result: "OK" | "KO";
  access_token?: string;
  message?: string;
}

const SIMKL_OAUTH_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(
  url: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  errorContext: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SIMKL_OAUTH_TIMEOUT_MS);

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

export class SimklOAuth {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret?: string
  ) {}

  getAuthUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
    });

    if (state) {
      params.append("state", state);
    }

    return `${SIMKL_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForToken(
    code: string,
    redirectUri: string
  ): Promise<SimklTokens> {
    if (!this.clientSecret) {
      throw new Error(
        "Simkl client secret is required for OAuth code exchange"
      );
    }

    const response = await fetchWithTimeout(
      withSimklQueryParams(`${SIMKL_API_BASE_URL}/oauth/token`, this.clientId),
      {
        method: "POST",
        headers: getSimklHeaders(this.clientId),
        body: JSON.stringify({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      },
      "Simkl authorization code exchange"
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.simkl.error(
        { status: response.status, errorText },
        "Failed to exchange Simkl authorization code"
      );
      throw new Error(
        `Failed to exchange Simkl authorization code: ${response.status} - ${errorText}`
      );
    }

    const tokenData = (await response.json()) as SimklTokenResponse;
    if (!tokenData.access_token) {
      throw new Error("Simkl token response did not include an access token");
    }

    return {
      accessToken: tokenData.access_token,
    };
  }

  async requestPinCode(): Promise<Required<SimklPinCodeResponse>> {
    const response = await fetchWithTimeout(
      withSimklQueryParams(`${SIMKL_API_BASE_URL}/oauth/pin`, this.clientId),
      {
        method: "GET",
        headers: getSimklHeaders(this.clientId),
      },
      "Simkl PIN code request"
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.simkl.error(
        { status: response.status, errorText },
        "Failed to request Simkl PIN code"
      );
      throw new Error(
        `Failed to request Simkl PIN code: ${response.status} - ${errorText}`
      );
    }

    const pinData = (await response.json()) as SimklPinCodeResponse;
    if (
      pinData.result !== "OK" ||
      !pinData.user_code ||
      !pinData.verification_url ||
      !pinData.expires_in ||
      !pinData.interval
    ) {
      throw new Error(
        pinData.message || "Simkl PIN response did not include a user code"
      );
    }

    return {
      result: pinData.result,
      device_code: pinData.device_code || "",
      user_code: pinData.user_code,
      verification_url: pinData.verification_url,
      expires_in: pinData.expires_in,
      interval: pinData.interval,
      message: pinData.message || "",
    };
  }

  async exchangePinForToken(userCode: string): Promise<SimklTokens> {
    const response = await fetchWithTimeout(
      withSimklQueryParams(
        `${SIMKL_API_BASE_URL}/oauth/pin/${encodeURIComponent(userCode)}`,
        this.clientId
      ),
      {
        method: "GET",
        headers: getSimklHeaders(this.clientId),
      },
      "Simkl PIN status check"
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.simkl.error(
        { status: response.status, errorText },
        "Failed to check Simkl PIN status"
      );
      throw new Error(
        `Failed to check Simkl PIN status: ${response.status} - ${errorText}`
      );
    }

    const pinStatus = (await response.json()) as SimklPinStatusResponse;
    if (pinStatus.result !== "OK" || !pinStatus.access_token) {
      throw new Error(pinStatus.message || "Simkl authorization is pending");
    }

    return {
      accessToken: pinStatus.access_token,
    };
  }
}
