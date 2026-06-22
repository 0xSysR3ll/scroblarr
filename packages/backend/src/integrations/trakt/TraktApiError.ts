export const TRAKT_REAUTH_MESSAGE =
  "Trakt token expired or revoked; re-link your account in Profile > Integrations";

export class TraktApiError extends Error {
  readonly status: number;
  readonly isAuthError: boolean;

  constructor(message: string, status: number, isAuthError: boolean) {
    super(message);
    this.name = "TraktApiError";
    this.status = status;
    this.isAuthError = isAuthError;
  }

  static fromResponse(
    status: number,
    errorText: string,
    wwwAuthenticate: string | null
  ): TraktApiError {
    const { error, errorDescription } = parseWwwAuthenticate(wwwAuthenticate);
    const bodyError = extractOAuthError(errorText);
    const oauthError = bodyError || error;
    const isAuthError =
      status === 401 ||
      status === 403 ||
      oauthError === "invalid_token" ||
      oauthError === "invalid_grant";

    if (isAuthError) {
      return new TraktApiError(TRAKT_REAUTH_MESSAGE, status, true);
    }

    const detail = extractBodyMessage(errorText) || errorDescription || error;
    const message = detail
      ? `Trakt API error: ${status} - ${detail}`
      : `Trakt API error: ${status}`;

    return new TraktApiError(message, status, false);
  }
}

export function isTraktAuthError(error: unknown): boolean {
  return error instanceof TraktApiError && error.isAuthError;
}

export function parseWwwAuthenticate(header: string | null): {
  error?: string;
  errorDescription?: string;
} {
  if (!header) {
    return {};
  }

  const errorMatch = header.match(/error="([^"]+)"/);
  const descriptionMatch = header.match(/error_description="([^"]+)"/);

  return {
    error: errorMatch?.[1],
    errorDescription: descriptionMatch?.[1],
  };
}

function extractBodyMessage(errorText: string): string | undefined {
  const trimmed = errorText.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const errorJson = JSON.parse(trimmed) as {
      error?: string;
      message?: string;
      error_description?: string;
    };
    return errorJson.error_description || errorJson.message || errorJson.error;
  } catch {
    return trimmed.substring(0, 200);
  }
}

function extractOAuthError(errorText: string): string | undefined {
  const trimmed = errorText.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const errorJson = JSON.parse(trimmed) as { error?: string };
    return errorJson.error;
  } catch {
    return undefined;
  }
}
