import { PlexOAuth, PlexAuthResult } from "@utils/PlexOAuth";
import { useRef, useState } from "react";

interface UsePlexLoginOptions {
  onAuthToken: (result: PlexAuthResult) => void | Promise<void>;
  onError?: (message: string) => void;
}

export function usePlexLogin({ onAuthToken, onError }: UsePlexLoginOptions) {
  const [loading, setLoading] = useState(false);
  const plexOAuthRef = useRef<PlexOAuth | null>(null);
  const inFlightRef = useRef(false);

  const login = () => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setLoading(true);

    if (!plexOAuthRef.current) {
      plexOAuthRef.current = new PlexOAuth();
    }
    const plexOAuth = plexOAuthRef.current;

    try {
      plexOAuth.preparePopup();
    } catch (error) {
      inFlightRef.current = false;
      setLoading(false);
      onError?.(
        error instanceof Error
          ? error.message
          : "Failed to open authentication window. Please allow popups and try again."
      );
      return;
    }

    setTimeout(async () => {
      try {
        const result = await plexOAuth.login();
        await onAuthToken(result);
      } catch (error) {
        onError?.(
          error instanceof Error ? error.message : "Failed to login with Plex"
        );
      } finally {
        plexOAuth.closePopup();
        inFlightRef.current = false;
        setLoading(false);
      }
    }, 1500);
  };

  return {
    loading,
    login,
  };
}
