import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { getCurrentUser } from "@services/api";

export interface AuthUser {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  isAdmin: boolean;
  thumb?: string;
  plexUsername?: string;
  jellyfinUsername?: string;
  tvtimeMarkMoviesAsRewatched?: boolean;
  tvtimeMarkEpisodesAsRewatched?: boolean;
  hasPlex?: boolean;
  hasJellyfin?: boolean;
  hasTrakt?: boolean;
  hasTVTime?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  logout: () => void;
  checkAuth: () => Promise<void>;
  setUserFromLogin: (userData: AuthUser) => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");

    if (token) {
      localStorage.setItem("plexAccessToken", token);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const plexToken = localStorage.getItem("plexAccessToken");
      const jellyfinToken = localStorage.getItem("jellyfinAccessToken");
      const token = plexToken || jellyfinToken;

      if (!token) {
        setLoading(false);
        setUser(null);
        return;
      }

      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (err: unknown) {
      const isUnauthorizedStatus =
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        typeof (err as { status?: unknown }).status === "number" &&
        (err as { status?: number }).status === 401;

      if (
        isUnauthorizedStatus ||
        (err instanceof Error && err.message.includes("401"))
      ) {
        localStorage.removeItem("plexAccessToken");
        localStorage.removeItem("jellyfinAccessToken");
        setUser(null);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }

  function setUserFromLogin(userData: AuthUser) {
    setUser(userData);
    setLoading(false);
  }

  function logout() {
    localStorage.removeItem("plexAccessToken");
    localStorage.removeItem("jellyfinAccessToken");
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        logout,
        checkAuth,
        setUserFromLogin,
        isAuthenticated: !!user,
        isAdmin: user?.isAdmin || false,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
