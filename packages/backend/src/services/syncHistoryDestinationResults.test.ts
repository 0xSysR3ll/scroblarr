import { describe, expect, it } from "vitest";

import {
  applyDestinationResultsToHistoryItem,
  attemptsFromSyncResults,
  buildAttemptResult,
  buildGlobalFailureResult,
  getRetryDestinationNamesFromHistory,
  mergeRetryAttemptIntoHistory,
} from "./syncHistoryDestinationResults";

describe("syncHistoryDestinationResults", () => {
  it("ignores unknown destinations when building attempts", () => {
    expect(
      attemptsFromSyncResults([
        { destination: "Unknown", success: true },
        { destination: "TVTime", success: true },
      ])
    ).toEqual([{ destination: "TVTime", success: true }]);
  });

  it("builds a global failure result", () => {
    expect(buildGlobalFailureResult("network down")).toEqual({
      success: false,
      destinations: [],
      errorMessage: "network down",
      destinationResults: {},
    });
  });

  it("builds attempt results from sync results", () => {
    expect(
      buildAttemptResult([
        { destination: "Trakt", success: true },
        { destination: "Simkl", success: false, error: "401" },
        { destination: "Bingers", success: true },
      ])
    ).toEqual({
      success: true,
      destinations: ["Trakt", "Bingers"],
      errorMessage: "Simkl: 401",
      destinationResults: {
        Trakt: { status: "success" },
        Simkl: { status: "failed", error: "401" },
        Bingers: { status: "success" },
      },
    });
  });

  it("clears destinations when applying results with no successes", () => {
    const historyItem = {
      success: true,
      destinations: JSON.stringify(["Trakt"]),
      destinationResults: undefined as string | undefined,
    };

    applyDestinationResultsToHistoryItem(historyItem, {
      TVTime: { status: "failed", error: "down" },
    });

    expect(historyItem).toEqual({
      success: false,
      destinations: undefined,
      errorMessage: "TVTime: down",
      destinationResults: JSON.stringify({
        TVTime: { status: "failed", error: "down" },
      }),
    });
  });

  it("returns failed destination names for retry", () => {
    expect(
      getRetryDestinationNamesFromHistory({
        destinationResults: JSON.stringify({
          TVTime: { status: "success" },
          Trakt: { status: "failed", error: "401" },
        }),
      })
    ).toEqual(["Trakt"]);
  });

  it("returns undefined when no destinations failed", () => {
    expect(
      getRetryDestinationNamesFromHistory({
        destinationResults: JSON.stringify({
          TVTime: { status: "success" },
        }),
      })
    ).toBeUndefined();
  });

  it("merges retry attempts into history items", () => {
    const historyItem = {
      success: true,
      destinations: JSON.stringify(["TVTime"]),
      destinationResults: JSON.stringify({
        TVTime: { status: "success" },
        Trakt: { status: "failed", error: "401" },
      }),
      errorMessage: undefined as string | undefined,
    };

    const merged = mergeRetryAttemptIntoHistory(historyItem, {
      Trakt: { status: "success" },
    });

    expect(merged).toEqual({
      TVTime: { status: "success" },
      Trakt: { status: "success" },
    });
    expect(historyItem.success).toBe(true);
    expect(historyItem.destinations).toBe(JSON.stringify(["TVTime", "Trakt"]));
    expect(historyItem.errorMessage).toBeUndefined();
  });
});
