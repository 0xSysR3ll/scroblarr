export function parseOAuthErrorBody(errorText: string): {
  error?: string;
  errorDescription?: string;
} {
  try {
    const parsed: unknown = JSON.parse(errorText);
    const body =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    return {
      error: typeof body.error === "string" ? body.error : undefined,
      errorDescription:
        typeof body.error_description === "string" && body.error_description
          ? body.error_description
          : typeof body.message === "string"
            ? body.message
            : undefined,
    };
  } catch {
    return {};
  }
}
