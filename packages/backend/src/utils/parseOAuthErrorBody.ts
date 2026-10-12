export function parseOAuthErrorBody(errorText: string): {
  error?: string;
  errorDescription?: string;
} {
  try {
    const body = JSON.parse(errorText) as {
      error?: string;
      error_description?: string;
      message?: string;
    };
    return {
      error: body.error,
      errorDescription: body.error_description || body.message,
    };
  } catch {
    return {};
  }
}
