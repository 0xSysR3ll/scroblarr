import { useState } from "react";
import { loginWithJellyfin } from "@services/api";

interface UseJellyfinLoginOptions {
  onSuccess?: (response: {
    id: string;
    username: string;
    displayName?: string;
    email?: string;
    isAdmin: boolean;
    accessToken?: string;
  }) => void;
  onError?: (message: string) => void;
}

export function useJellyfinLogin({
  onSuccess,
  onError,
}: UseJellyfinLoginOptions) {
  const [loading, setLoading] = useState(false);

  async function login(
    username: string,
    password: string,
    hostname?: string,
    port?: number,
    useSsl?: boolean,
    urlBase?: string
  ) {
    try {
      setLoading(true);
      const response = await loginWithJellyfin(
        username,
        password,
        hostname,
        port,
        useSsl,
        urlBase
      );
      if (onSuccess) {
        onSuccess(response);
      }
      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to login with Jellyfin";
      if (onError) {
        onError(errorMessage);
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    login,
  };
}
