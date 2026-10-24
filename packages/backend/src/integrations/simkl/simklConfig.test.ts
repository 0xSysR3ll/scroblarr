import { afterEach, describe, expect, it } from "vitest";

import {
  getSimklClientId,
  isOfficialSimklClientId,
  SCROBLARR_SIMKL_CLIENT_ID,
} from "./simklConfig";

describe("simklConfig", () => {
  const originalEnv = process.env.SIMKL_CLIENT_ID;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SIMKL_CLIENT_ID;
    } else {
      process.env.SIMKL_CLIENT_ID = originalEnv;
    }
  });

  it("returns the hardcoded Scroblarr Client ID by default", () => {
    delete process.env.SIMKL_CLIENT_ID;
    expect(getSimklClientId()).toBe(SCROBLARR_SIMKL_CLIENT_ID);
  });

  it("prefers SIMKL_CLIENT_ID from the environment", () => {
    process.env.SIMKL_CLIENT_ID = " fork-client-id ";
    expect(getSimklClientId()).toBe("fork-client-id");
  });

  it("detects whether a stored Client ID matches the official one", () => {
    delete process.env.SIMKL_CLIENT_ID;
    expect(isOfficialSimklClientId(SCROBLARR_SIMKL_CLIENT_ID)).toBe(true);
    expect(isOfficialSimklClientId(` ${SCROBLARR_SIMKL_CLIENT_ID} `)).toBe(
      true
    );
    expect(isOfficialSimklClientId("personal-client-id")).toBe(false);
    expect(isOfficialSimklClientId(null)).toBe(false);
    expect(isOfficialSimklClientId(undefined)).toBe(false);
  });
});
