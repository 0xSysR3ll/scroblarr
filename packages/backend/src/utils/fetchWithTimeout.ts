export async function fetchWithTimeout(
  url: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  errorContext: string,
  timeoutMs = 30_000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${errorContext} timed out`);
    }
    throw error;
  }
}
