export const BINGERS_REAUTH_MESSAGE =
  "Bingers session expired or revoked; re-link your account in Profile > Integrations";

export class BingersApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfterSeconds?: number;
  readonly isAuthError: boolean;
  readonly isRateLimited: boolean;

  constructor(
    message: string,
    status: number,
    options: {
      code?: string;
      retryAfterSeconds?: number;
      isAuthError?: boolean;
      isRateLimited?: boolean;
    } = {}
  ) {
    super(message);
    this.name = "BingersApiError";
    this.status = status;
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.isAuthError = options.isAuthError ?? false;
    this.isRateLimited = options.isRateLimited ?? false;
  }
}

export function isBingersAuthError(error: unknown): boolean {
  return error instanceof BingersApiError && error.isAuthError;
}

export function isBingersRateLimitError(error: unknown): boolean {
  return error instanceof BingersApiError && error.isRateLimited;
}

interface BingersErrorBody {
  error?: {
    code?: string;
    message?: string;
    retryAfterSeconds?: number;
    requestId?: string;
  };
  message?: string;
}

export function bingersErrorFromResponse(
  status: number,
  bodyText: string
): BingersApiError {
  let parsed: BingersErrorBody | undefined;
  try {
    parsed = JSON.parse(bodyText) as BingersErrorBody;
  } catch {
    parsed = undefined;
  }

  const code = parsed?.error?.code;
  const message =
    parsed?.error?.message ||
    parsed?.message ||
    (bodyText.trim()
      ? bodyText.trim().slice(0, 200)
      : `Bingers API error: ${status}`);

  const retryAfterSeconds = parsed?.error?.retryAfterSeconds;
  const isRateLimited =
    code === "magic_link_recently_sent" ||
    status === 429 ||
    (typeof retryAfterSeconds === "number" && retryAfterSeconds > 0);

  const isAuthError = status === 401 || status === 403;

  return new BingersApiError(message, status, {
    code,
    retryAfterSeconds:
      typeof retryAfterSeconds === "number" ? retryAfterSeconds : undefined,
    isAuthError,
    isRateLimited,
  });
}
