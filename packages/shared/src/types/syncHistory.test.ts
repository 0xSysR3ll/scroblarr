import { describe, expect, it } from "vitest";

import {
  buildDestinationResultsFromAttempts,
  deriveLegacySyncFields,
  getFailedDestinationNames,
  mergeDestinationResultsForRetry,
  parseDestinationResultsFromHistory,
  serializeDestinationResults,
} from "./syncHistory.js";

describe("syncHistory destination results", () => {
  it("derives legacy fields from structured results", () => {
    const results = buildDestinationResultsFromAttempts([
      { destination: "TVTime", success: true },
      { destination: "Trakt", success: true },
      { destination: "Simkl", success: false, error: "not found" },
    ]);

    expect(deriveLegacySyncFields(results)).toEqual({
      success: true,
      destinations: ["TVTime", "Trakt"],
      errorMessage: "Simkl: not found",
    });
  });

  it("parses legacy history rows into structured results", () => {
    expect(
      parseDestinationResultsFromHistory({
        destinations: JSON.stringify(["Trakt", "TVTime"]),
        errorMessage: "Simkl: rate limited",
      })
    ).toEqual({
      TVTime: { status: "success" },
      Trakt: { status: "success" },
      Simkl: { status: "failed", error: "rate limited" },
    });
  });

  it("prefers stored destinationResults over legacy fields", () => {
    const stored = serializeDestinationResults({
      TVTime: { status: "success" },
      Trakt: { status: "failed", error: "401" },
    });

    expect(
      parseDestinationResultsFromHistory({
        destinationResults: stored,
        destinations: JSON.stringify(["Simkl"]),
        errorMessage: "Simkl: ignored",
      })
    ).toEqual({
      TVTime: { status: "success" },
      Trakt: { status: "failed", error: "401" },
    });
  });

  it("merges retry results without dropping prior successes", () => {
    const merged = mergeDestinationResultsForRetry(
      {
        TVTime: { status: "success" },
        Trakt: { status: "failed", error: "401" },
      },
      {
        Trakt: { status: "success" },
      }
    );

    expect(getFailedDestinationNames(merged)).toEqual([]);
    expect(deriveLegacySyncFields(merged)).toEqual({
      success: true,
      destinations: ["TVTime", "Trakt"],
      errorMessage: undefined,
    });
  });

  it("treats failed destinations as higher priority than legacy success lists", () => {
    expect(
      parseDestinationResultsFromHistory({
        destinations: JSON.stringify(["Simkl"]),
        errorMessage: "Simkl: could not match",
      })
    ).toEqual({
      Simkl: { status: "failed", error: "could not match" },
    });
  });
});
