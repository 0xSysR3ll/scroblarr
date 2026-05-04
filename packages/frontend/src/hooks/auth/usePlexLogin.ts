import { PlexOAuth, PlexAuthResult } from "@utils/PlexOAuth";
import { useState, useRef } from "react";

interface UsePlexLoginOptions {
  onAuthToken: (result: PlexAuthResult) => void;
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
        const result = await plexOAuth.login();
        onAuthToken(result);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to login with Plex";
        if (onError) {
          onError(errorMessage);
        }
      } finally {
        // Ensure popup is closed even if cross-origin close on first attempt was ignored.
        plexOAuth.closePopup();
        setLoading(false);
      }
    }, 1500);
  };

  return {
    loading,
    login,
  };
}
