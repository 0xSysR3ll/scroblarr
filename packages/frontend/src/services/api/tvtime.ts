import { API_BASE_URL, getAuthHeaders } from "./common";

export interface TVTimeStatus {
  linked: boolean;
  email: string | null;
  username: string | null;
}

export interface TVTimeProfile {
  id: string | null;
  username: string | null;
  email: string | null;
  image: string | null;
}

export async function getTVTimeStatus(): Promise<TVTimeStatus> {
  const response = await fetch(`${API_BASE_URL}/tvtime/status`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch TVTime status");
  }
  return response.json();
}

export async function linkTVTime(
  email: string,
  password: string
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/tvtime/link`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to link TVTime account");
  }
  return response.json();
}

export async function unlinkTVTime(): Promise<{
  success: boolean;
}> {
  const response = await fetch(`${API_BASE_URL}/tvtime/unlink`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to unlink TVTime account");
  }
  return response.json();
}

export async function getTVTimeProfile(): Promise<TVTimeProfile> {
  const response = await fetch(`${API_BASE_URL}/tvtime/profile`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    let errorMessage = "Failed to fetch TVTime profile";
    try {
      const error = await response.json();
      errorMessage = error.error || errorMessage;
    } catch {
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  return response.json();
}
