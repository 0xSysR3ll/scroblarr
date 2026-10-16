export async function fetchWithTimeout(
  url: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  errorContext: string,
  timeoutMs = 30_000
): Promise<Response> {
  const callerSignal = init?.signal;
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) {
    controller.abort(callerSignal.reason);
  } else {
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  }

  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response | undefined;
  let failure: unknown;
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }

  if (failure !== undefined) {
    if (
      failure instanceof Error &&
      failure.name === "AbortError" &&
      !callerSignal?.aborted
    ) {
      throw new Error(`${errorContext} timed out`);
    }
    throw failure;
  }

  return response as Response;
}
