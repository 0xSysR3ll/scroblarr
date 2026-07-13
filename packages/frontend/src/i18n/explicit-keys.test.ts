import { describe, expect, it, vi } from "vitest";

import { explicitI18nKeys } from "./explicit-keys";

describe("explicitI18nKeys", () => {
  it("emits dynamic destination keys for the scanner", () => {
    const t = vi.fn();

    explicitI18nKeys(t);

    expect(t).toHaveBeenCalledWith("sync.destinations.tvtime", {
      defaultValue: "TVTime",
    });
    expect(t).toHaveBeenCalledWith("sync.destinations.trakt", {
      defaultValue: "Trakt",
    });
    expect(t).toHaveBeenCalledWith("sync.destinations.simkl", {
      defaultValue: "Simkl",
    });
  });
});
