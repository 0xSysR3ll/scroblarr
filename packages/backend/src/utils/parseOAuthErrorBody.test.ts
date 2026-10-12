import { describe, expect, it } from "vitest";

import { parseOAuthErrorBody } from "./parseOAuthErrorBody";

describe("parseOAuthErrorBody", () => {
  it("parses OAuth error fields", () => {
    expect(
      parseOAuthErrorBody(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "bad code",
        })
      )
    ).toEqual({
      error: "invalid_grant",
      errorDescription: "bad code",
    });
  });

  it("falls back to message when error_description is absent", () => {
    expect(
      parseOAuthErrorBody(
        JSON.stringify({
          error: "server_error",
          message: "try again",
        })
      )
    ).toEqual({
      error: "server_error",
      errorDescription: "try again",
    });
  });

  it("returns an empty object for invalid JSON", () => {
    expect(parseOAuthErrorBody("not-json")).toEqual({});
  });
});
