import { describe, expect, it } from "vitest";

import {
  TraktApiError,
  TRAKT_REAUTH_MESSAGE,
  isTraktAuthError,
  parseWwwAuthenticate,
} from "./TraktApiError";

describe("TraktApiError", () => {
  it("parses WWW-Authenticate headers", () => {
    expect(
      parseWwwAuthenticate(
        'Bearer realm="Trakt", error="invalid_token", error_description="The access token is invalid"'
      )
    ).toEqual({
      error: "invalid_token",
      errorDescription: "The access token is invalid",
    });
    expect(parseWwwAuthenticate(null)).toEqual({});
  });

  it("maps empty 401 bodies with WWW-Authenticate to a re-auth message", () => {
    const error = TraktApiError.fromResponse(
      401,
      "",
      'Bearer realm="Trakt", error="invalid_token", error_description="The access token is invalid"'
    );

    expect(error.message).toBe(TRAKT_REAUTH_MESSAGE);
    expect(error.isAuthError).toBe(true);
    expect(isTraktAuthError(error)).toBe(true);
  });

  it("maps invalid_grant refresh failures to a re-auth message", () => {
    const error = TraktApiError.fromResponse(
      400,
      "",
      'Bearer realm="Trakt", error="invalid_grant", error_description="The provided authorization grant is invalid"'
    );

    expect(error.message).toBe(TRAKT_REAUTH_MESSAGE);
    expect(error.isAuthError).toBe(true);
  });

  it("maps invalid_grant JSON bodies from token refresh to a re-auth message", () => {
    const error = TraktApiError.fromResponse(
      400,
      JSON.stringify({
        error: "invalid_grant",
        error_description: "The provided authorization grant is invalid",
      }),
      null
    );

    expect(error.message).toBe(TRAKT_REAUTH_MESSAGE);
    expect(error.isAuthError).toBe(true);
  });

  it("keeps non-auth API errors descriptive", () => {
    const error = TraktApiError.fromResponse(
      409,
      JSON.stringify({
        watched_at: "2026-05-11T19:40:00.000Z",
        expires_at: "2026-05-11T20:38:00.000Z",
      }),
      null
    );

    expect(error.isAuthError).toBe(false);
    expect(error.message).toContain("409");
    expect(isTraktAuthError(error)).toBe(false);
  });

  it("falls back to plain-text bodies for non-auth errors", () => {
    const error = TraktApiError.fromResponse(500, "upstream unavailable", null);

    expect(error.isAuthError).toBe(false);
    expect(error.message).toBe("Trakt API error: 500 - upstream unavailable");
  });

  it("uses status-only messages when no error detail is available", () => {
    const error = TraktApiError.fromResponse(502, "", null);

    expect(error.isAuthError).toBe(false);
    expect(error.message).toBe("Trakt API error: 502");
  });

  it("treats 403 responses as auth errors", () => {
    const error = TraktApiError.fromResponse(403, "", null);

    expect(error.isAuthError).toBe(true);
    expect(error.message).toBe(TRAKT_REAUTH_MESSAGE);
  });
});
