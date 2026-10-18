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

  it("ignores non-object JSON and non-string error fields", () => {
    expect(parseOAuthErrorBody("null")).toEqual({});
    expect(parseOAuthErrorBody("42")).toEqual({});
    expect(parseOAuthErrorBody(JSON.stringify(["invalid_grant"]))).toEqual({});
    expect(
      parseOAuthErrorBody(
        JSON.stringify({
          error: { code: "invalid_grant" },
          error_description: 42,
          message: null,
        })
      )
    ).toEqual({});
  });

  it("skips empty error_description in favor of message", () => {
    expect(
      parseOAuthErrorBody(
        JSON.stringify({
          error: "server_error",
          error_description: "",
          message: "try again",
        })
      )
    ).toEqual({
      error: "server_error",
      errorDescription: "try again",
    });
  });
});
