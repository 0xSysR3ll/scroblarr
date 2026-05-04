export const API_BASE_URL = "/api/v1";

export function getAuthHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
  };
}
