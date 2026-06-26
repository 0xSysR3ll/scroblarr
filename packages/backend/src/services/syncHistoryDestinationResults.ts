import {
  buildDestinationResultsFromAttempts,
  deriveLegacySyncFields,
  getFailedDestinationNames,
  mergeDestinationResultsForRetry,
  parseDestinationResultsFromHistory,
  serializeDestinationResults,
  type SyncDestinationAttempt,
  type SyncDestinationResults,
} from "@scroblarr/shared";

export interface SyncAttemptResult {
  success: boolean;
  destinations: string[];
  errorMessage?: string;
  destinationResults: SyncDestinationResults;
}

export function attemptsFromSyncResults(
  syncResults: Array<{
    destination: string;
    success: boolean;
    error?: string;
  }>
): SyncDestinationAttempt[] {
  return syncResults.flatMap((result) => {
    if (
      result.destination !== "TVTime" &&
      result.destination !== "Trakt" &&
      result.destination !== "Simkl"
    ) {
      return [];
    }

    return [
      {
        destination: result.destination,
        success: result.success,
        error: result.error,
      },
    ];
  });
}

export function buildGlobalFailureResult(
  errorMessage: string
): SyncAttemptResult {
  return {
    success: false,
    destinations: [],
    errorMessage,
    destinationResults: {},
  };
}

export function buildAttemptResult(
  syncResults: Array<{
    destination: string;
    success: boolean;
    error?: string;
  }>
): SyncAttemptResult {
  const destinationResults = buildDestinationResultsFromAttempts(
    attemptsFromSyncResults(syncResults)
  );
  const legacy = deriveLegacySyncFields(destinationResults);

  return {
    success: legacy.success,
    destinations: legacy.destinations,
    errorMessage: legacy.errorMessage,
    destinationResults,
  };
}

export function applyDestinationResultsToHistoryItem(
  historyItem: {
    success: boolean;
    errorMessage?: string;
    destinations?: string;
    destinationResults?: string;
  },
  results: SyncDestinationResults
): void {
  const legacy = deriveLegacySyncFields(results);
  historyItem.destinationResults = serializeDestinationResults(results);
  historyItem.success = legacy.success;
  historyItem.errorMessage = legacy.errorMessage;
  historyItem.destinations =
    legacy.destinations.length > 0
      ? JSON.stringify(legacy.destinations)
      : undefined;
}

export function getRetryDestinationNamesFromHistory(historyItem: {
  destinationResults?: string | null;
  destinations?: string | null;
  errorMessage?: string | null;
}): string[] | undefined {
  const failed = getFailedDestinationNames(
    parseDestinationResultsFromHistory(historyItem)
  );

  return failed.length > 0 ? failed : undefined;
}

export function mergeRetryAttemptIntoHistory(
  historyItem: {
    success: boolean;
    errorMessage?: string;
    destinations?: string;
    destinationResults?: string;
  },
  retryAttempt: SyncDestinationResults
): SyncDestinationResults {
  const merged = mergeDestinationResultsForRetry(
    parseDestinationResultsFromHistory(historyItem),
    retryAttempt
  );
  applyDestinationResultsToHistoryItem(historyItem, merged);
  return merged;
}
