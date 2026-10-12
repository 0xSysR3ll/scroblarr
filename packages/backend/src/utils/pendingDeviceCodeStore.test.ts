import { afterEach, describe, expect, it, vi } from "vitest";

import { createPendingDeviceCodeStore } from "./pendingDeviceCodeStore";

describe("createPendingDeviceCodeStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("remembers and resolves device codes", () => {
    const store = createPendingDeviceCodeStore("Simkl");
    store.remember("user-id", {
      device_code: "device-code",
      user_code: "ABCD-EFGH",
      expires_in: 900,
    });

    expect(store.resolve("user-id", "ABCD-EFGH")).toBe("device-code");
  });

  it("rejects mismatched user codes", () => {
    const store = createPendingDeviceCodeStore("Simkl");
    store.remember("user-id", {
      device_code: "device-code",
      user_code: "ABCD-EFGH",
      expires_in: 900,
    });

    expect(() => store.resolve("user-id", "WRONG")).toThrow(
      "Simkl PIN code does not match the active authorization"
    );
  });

  it("rejects missing or expired device codes", () => {
    vi.useFakeTimers();
    const store = createPendingDeviceCodeStore("Simkl");

    expect(() => store.resolve("missing", "ABCD-EFGH")).toThrow(
      "Simkl device code expired"
    );

    store.remember("user-id", {
      device_code: "device-code",
      user_code: "ABCD-EFGH",
      expires_in: 1,
    });
    vi.advanceTimersByTime(1_500);

    expect(() => store.resolve("user-id", "ABCD-EFGH")).toThrow(
      "Simkl device code expired"
    );
  });

  it("prunes expired entries when remembering a new code", () => {
    vi.useFakeTimers();
    const store = createPendingDeviceCodeStore("Simkl");

    store.remember("expired-user", {
      device_code: "old-device",
      user_code: "OLD1-CODE",
      expires_in: 1,
    });
    vi.advanceTimersByTime(1_500);

    store.remember("fresh-user", {
      device_code: "new-device",
      user_code: "NEW1-CODE",
      expires_in: 900,
    });

    expect(() => store.resolve("expired-user", "OLD1-CODE")).toThrow(
      "Simkl device code expired"
    );
    expect(store.resolve("fresh-user", "NEW1-CODE")).toBe("new-device");
  });

  it("clears stored device codes", () => {
    const store = createPendingDeviceCodeStore("Simkl");
    store.remember("user-id", {
      device_code: "device-code",
      user_code: "ABCD-EFGH",
      expires_in: 900,
    });
    store.clear("user-id");

    expect(() => store.resolve("user-id", "ABCD-EFGH")).toThrow(
      "Simkl device code expired"
    );
  });
});
