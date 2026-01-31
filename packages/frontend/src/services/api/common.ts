export const API_BASE_URL = "/api/v1";

export function getAuthHeaders(): HeadersInit {
  const plexToken = localStorage.getItem("plexAccessToken");
  const jellyfinToken = localStorage.getItem("jellyfinAccessToken");
  const token = plexToken || jellyfinToken;
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}
