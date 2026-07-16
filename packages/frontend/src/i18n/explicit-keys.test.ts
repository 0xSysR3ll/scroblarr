import { describe, expect, it, vi } from "vitest";

import { explicitI18nKeys } from "./explicit-keys";

describe("explicitI18nKeys", () => {
  it("emits dynamic destination keys for the scanner", () => {
    const t = vi.fn();

    explicitI18nKeys(t);

    expect(t).toHaveBeenCalledTimes(2);
    expect(t).toHaveBeenNthCalledWith(1, "sync.destinations.trakt", {
      defaultValue: "Trakt",
    });
    expect(t).toHaveBeenNthCalledWith(2, "sync.destinations.simkl", {
      defaultValue: "Simkl",
    });
  });
});
