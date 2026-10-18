import { getUserAgent } from "@utils/appVersion";
import { describe, expect, it } from "vitest";

import {
  getSimklHeaders,
  isSimklV2AccessToken,
  withSimklQueryParams,
} from "./SimklApi";

describe("SimklApi helpers", () => {
  it("adds required query parameters", () => {
    const url = new URL(
      withSimklQueryParams("https://api.simkl.com/users/settings", "client-id")
    );

    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("app-name")).toBe("scroblarr");
    expect(url.searchParams.get("app-version")).toBeTruthy();
  });

  it("builds JSON headers with an optional bearer token", () => {
    expect(getSimklHeaders("client-id")).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": getUserAgent(),
      "simkl-api-key": "client-id",
    });

    expect(getSimklHeaders("client-id", "simkl_at_token")).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": getUserAgent(),
      "simkl-api-key": "client-id",
      Authorization: "Bearer simkl_at_token",
    });

    expect(
      getSimklHeaders(
        "client-id",
        undefined,
        "application/x-www-form-urlencoded"
      )["Content-Type"]
    ).toBe("application/x-www-form-urlencoded");
  });

  it("detects V2 access tokens by prefix", () => {
    expect(isSimklV2AccessToken("simkl_at_abc")).toBe(true);
    expect(isSimklV2AccessToken("legacy-hex-token")).toBe(false);
  });
});
