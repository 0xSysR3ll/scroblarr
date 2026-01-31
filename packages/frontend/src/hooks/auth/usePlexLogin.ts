import { useState, useRef } from "react";
import { PlexOAuth } from "@utils/PlexOAuth";

interface UsePlexLoginOptions {
  onAuthToken: (authToken: string) => void;
  onError?: (message: string) => void;
}

export function usePlexLogin({ onAuthToken, onError }: UsePlexLoginOptions) {
  const [loading, setLoading] = useState(false);
  const plexOAuthRef = useRef<PlexOAuth | null>(null);

  const login = () => {
    if (!plexOAuthRef.current) {
      plexOAuthRef.current = new PlexOAuth();
    }

    const plexOAuth = plexOAuthRef.current;

    try {
      plexOAuth.preparePopup();
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to open authentication window. Please allow popups and try again.";
      if (onError) {
        onError(errorMessage);
      }
      return;
    }

    setTimeout(async () => {
      try {
        setLoading(true);
        const authToken = await plexOAuth.login();
        onAuthToken(authToken);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to login with Plex";
        if (onError) {
          onError(errorMessage);
        }
      } finally {
        setLoading(false);
      }
    }, 1500);
  };

  return {
    loading,
    login,
  };
}
