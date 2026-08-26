export const SYNC_DESTINATION_NAMES = [
  "TVTime",
  "Trakt",
  "Simkl",
  "Bingers",
] as const;

export type SyncDestinationName = (typeof SYNC_DESTINATION_NAMES)[number];

export type SyncDestinationStatus = "success" | "failed";

export interface SyncDestinationResultRecord {
  status: SyncDestinationStatus;
  error?: string;
}

export type SyncDestinationResults = Partial<
  Record<SyncDestinationName, SyncDestinationResultRecord>
>;

export interface SyncHistoryLegacyFields {
  success: boolean;
  destinations: SyncDestinationName[];
  errorMessage?: string;
}

export interface SyncDestinationAttempt {
  destination: SyncDestinationName;
  success: boolean;
  error?: string;
}

const DESTINATION_ERROR_PATTERN = /(?:^|;\s*)(TVTime|Trakt|Simkl|Bingers):\s*/g;

export function isSyncDestinationName(
  value: string
): value is SyncDestinationName {
  return (SYNC_DESTINATION_NAMES as readonly string[]).includes(value);
}

export function buildDestinationResultsFromAttempts(
  attempts: SyncDestinationAttempt[]
): SyncDestinationResults {
  const results: SyncDestinationResults = {};

  for (const attempt of attempts) {
    if (!isSyncDestinationName(attempt.destination)) {
      continue;
    }

    results[attempt.destination] = attempt.success
      ? { status: "success" }
      : { status: "failed", error: attempt.error };
  }

  return results;
}

export function deriveLegacySyncFields(
  results: SyncDestinationResults
): SyncHistoryLegacyFields {
  const successful: SyncDestinationName[] = [];
  const failedEntries: Array<[SyncDestinationName, string]> = [];

  for (const destination of SYNC_DESTINATION_NAMES) {
    const result = results[destination];
    if (!result) {
      continue;
    }

    if (result.status === "success") {
      successful.push(destination);
      continue;
    }

    failedEntries.push([destination, result.error ?? "Unknown error"]);
  }

  return {
    success: successful.length > 0,
    destinations: successful,
    errorMessage:
      failedEntries.length > 0
        ? failedEntries.map(([name, error]) => `${name}: ${error}`).join("; ")
        : undefined,
  };
}

export function parseDestinationResultsJson(
  raw?: string | null
): SyncDestinationResults | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const results: SyncDestinationResults = {};
    for (const destination of SYNC_DESTINATION_NAMES) {
      const entry = parsed[destination];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }

      const status = (entry as SyncDestinationResultRecord).status;
      if (status !== "success" && status !== "failed") {
        continue;
      }

      const error = (entry as SyncDestinationResultRecord).error;
      results[destination] = {
        status,
        error: typeof error === "string" ? error : undefined,
      };
    }

    return Object.keys(results).length > 0 ? results : undefined;
  } catch {
    return undefined;
  }
}

export function serializeDestinationResults(
  results: SyncDestinationResults
): string {
  return JSON.stringify(results);
}

function parseLegacyDestinations(
  destinationsJson?: string | null
): SyncDestinationName[] {
  if (!destinationsJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(destinationsJson);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (destination): destination is SyncDestinationName =>
        typeof destination === "string" && isSyncDestinationName(destination)
    );
  } catch {
    return [];
  }
}

function parseErrorsFromLegacyMessage(
  errorMessage?: string | null
): Map<SyncDestinationName, string> {
  const errors = new Map<SyncDestinationName, string>();
  if (!errorMessage) {
    return errors;
  }

  const matches = [...errorMessage.matchAll(DESTINATION_ERROR_PATTERN)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const name = match[1];
    if (!isSyncDestinationName(name)) {
      continue;
    }

    const errorStart = match.index! + match[0].length;
    const errorEnd = matches[i + 1]?.index ?? errorMessage.length;
    const destinationError = errorMessage.slice(errorStart, errorEnd).trim();
    if (destinationError) {
      errors.set(name, destinationError);
    }
  }

  return errors;
}

export function parseDestinationResultsFromHistory(history: {
  destinationResults?: string | null;
  destinations?: string | null;
  errorMessage?: string | null;
}): SyncDestinationResults {
  const stored = parseDestinationResultsJson(history.destinationResults);
  if (stored) {
    return stored;
  }

  const successful = new Set(parseLegacyDestinations(history.destinations));
  const failed = parseErrorsFromLegacyMessage(history.errorMessage);
  const results: SyncDestinationResults = {};

  for (const destination of SYNC_DESTINATION_NAMES) {
    if (failed.has(destination)) {
      results[destination] = {
        status: "failed",
        error: failed.get(destination),
      };
    } else if (successful.has(destination)) {
      results[destination] = { status: "success" };
    }
  }

  return results;
}

export function mergeDestinationResultsForRetry(
  existing: SyncDestinationResults,
  retryResults: SyncDestinationResults
): SyncDestinationResults {
  return {
    ...existing,
    ...retryResults,
  };
}

export function getFailedDestinationNames(
  results: SyncDestinationResults
): SyncDestinationName[] {
  return SYNC_DESTINATION_NAMES.filter(
    (destination) => results[destination]?.status === "failed"
  );
}

export function getSuccessfulDestinationNames(
  results: SyncDestinationResults
): SyncDestinationName[] {
  return SYNC_DESTINATION_NAMES.filter(
    (destination) => results[destination]?.status === "success"
  );
}
