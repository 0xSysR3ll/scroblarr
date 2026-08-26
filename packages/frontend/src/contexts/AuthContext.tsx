import {
  getCurrentUser,
  invalidateSimklCache,
  invalidateTraktCache,
} from "@services/api";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

export interface AuthUser {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  isAdmin: boolean;
  thumb?: string;
  plexUsername?: string;
  jellyfinUsername?: string;
  hasTrakt?: boolean;
  hasSimkl?: boolean;
  hasBingers?: boolean;
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

function invalidateIntegrationCaches() {
  invalidateSimklCache();
  invalidateTraktCache();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
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
        setUser(null);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }

  function setUserFromLogin(userData: AuthUser) {
    invalidateIntegrationCaches();
    setUser(userData);
    setLoading(false);
  }

  function logout() {
    fetch("/api/v1/logout", { method: "POST", credentials: "include" }).finally(
      () => {
        localStorage.removeItem("authSource");
        invalidateIntegrationCaches();
        setUser(null);
      }
    );
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
