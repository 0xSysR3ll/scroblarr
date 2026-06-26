import { TmdbRateLimitError } from "./TmdbApiError";

const TMDB_API_BASE = "https://api.themoviedb.org/3";

export interface TmdbConnectionTestSuccess {
  success: true;
}

export interface TmdbConnectionTestFailure {
  success: false;
  status: number;
  message: string;
}

export type TmdbConnectionTestResult =
  | TmdbConnectionTestSuccess
  | TmdbConnectionTestFailure;

export async function testTmdbAccessToken(
  accessToken: string
): Promise<TmdbConnectionTestResult> {
  const response = await fetch(`${TMDB_API_BASE}/configuration`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (response.ok) {
    return { success: true };
  }

  if (response.status === 401) {
    return {
      success: false,
      status: 401,
      message: "Invalid TMDB access token",
    };
  }

  if (response.status === 429) {
    return {
      success: false,
      status: 429,
      message: "TMDB rate limit exceeded. Try again shortly.",
    };
  }

  return {
    success: false,
    status: response.status,
    message: `TMDB API returned ${response.status}`,
  };
}

export function toTmdbConnectionTestError(
  error: unknown
): TmdbConnectionTestFailure {
  if (error instanceof TmdbRateLimitError) {
    return {
      success: false,
      status: 429,
      message: "TMDB rate limit exceeded. Try again shortly.",
    };
  }

  return {
    success: false,
    status: 500,
    message: "Failed to reach TMDB API",
  };
}
