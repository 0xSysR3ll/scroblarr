import { Footer } from "@components/layout/Footer";
import { Navbar } from "@components/layout/Navbar";
import { PageBackground } from "@components/layout/PageBackground";
import { ProtectedRoute } from "@components/ui/ProtectedRoute";
import { RouteErrorBoundary } from "@components/ui/route-error-boundary";
import { Spinner } from "@components/ui/spinner";
import { AuthProvider, useAuth } from "@contexts/AuthContext";
import { LoginPage } from "@pages/auth/LoginPage";
import { OfflinePage } from "@pages/auth/OfflinePage";
import { SetupPage } from "@pages/auth/SetupPage";
import { DashboardPage } from "@pages/user/DashboardPage";
import { showError } from "@utils/toast";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Toaster } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

const SettingsPage = lazy(() =>
  import("@pages/admin/SettingsPage").then((m) => ({
    default: m.SettingsPage,
  }))
);
const UsersPage = lazy(() =>
  import("@pages/admin/UsersPage").then((m) => ({ default: m.UsersPage }))
);
const ProfilePage = lazy(() =>
  import("@pages/user/ProfilePage").then((m) => ({ default: m.ProfilePage }))
);
const SyncDashboardPage = lazy(() =>
  import("@pages/user/SyncDashboardPage").then((m) => ({
    default: m.SyncDashboardPage,
  }))
);

function AppRoutes() {
  const { t } = useTranslation();
  const { isAuthenticated, loading } = useAuth();
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [apiUnreachable, setApiUnreachable] = useState(false);
  const isCheckingAdminRef = useRef(false);
  const hasAdminRef = useRef(hasAdmin);

  useEffect(() => {
    hasAdminRef.current = hasAdmin;
  }, [hasAdmin]);

  const checkAdmin = useCallback(async (options?: { retry?: boolean }) => {
    if (isCheckingAdminRef.current) {
      return;
    }
    isCheckingAdminRef.current = true;
    if (options?.retry) {
      setCheckingAdmin(true);
      setApiUnreachable(false);
    }
    try {
      const response = await fetch("/api/v1/auth/check-admin");
      if (response.ok) {
        const data = await response.json();
        setHasAdmin(data?.hasAdmin ?? false);
        setApiUnreachable(false);
        return;
      }
      // Keep a known setup state on transient failures; only show offline
      // when we never successfully determined whether setup is complete.
      if (hasAdminRef.current === null) {
        setApiUnreachable(true);
      }
    } catch {
      if (hasAdminRef.current === null) {
        setApiUnreachable(true);
      }
    } finally {
      isCheckingAdminRef.current = false;
      setCheckingAdmin(false);
    }
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get("error");
    if (errorParam) {
      showError(
        t("auth.oauthError", {
          defaultValue: "Authentication error: {{error}}",
          error: errorParam,
        })
      );
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const id = requestAnimationFrame(() => {
      void checkAdmin();
    });
    return () => cancelAnimationFrame(id);
  }, [t, checkAdmin]);

  useEffect(() => {
    if (!(isAuthenticated && hasAdmin === false)) {
      return;
    }
    const id = requestAnimationFrame(() => {
      void checkAdmin();
    });
    return () => cancelAnimationFrame(id);
  }, [isAuthenticated, hasAdmin, checkAdmin]);

  if (checkingAdmin || loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <img
          src="/logo-icon.svg"
          alt=""
          className="h-12 w-12 opacity-90"
          width={48}
          height={48}
        />
        <Spinner
          size="2xl"
          aria-label={t("common.loading", { defaultValue: "Loading" })}
        />
      </div>
    );
  }

  if (apiUnreachable) {
    return (
      <OfflinePage
        onRetry={() => {
          void checkAdmin({ retry: true });
        }}
      />
    );
  }

  if (hasAdmin === false) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <RouteErrorBoundary>
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4">
            <Spinner
              size="2xl"
              aria-label={t("common.loading", { defaultValue: "Loading" })}
            />
          </div>
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute requireAdmin>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/*"
            element={
              <ProtectedRoute requireAdmin>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/*"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sync"
            element={
              <ProtectedRoute>
                <SyncDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/login"
            element={
              isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PageBackground>
          <Navbar />
          <main className="flex-1 flex flex-col">
            <AppRoutes />
          </main>
          <Footer />
          <Toaster
            position="top-right"
            containerStyle={{
              top: "calc(4.25rem + env(safe-area-inset-top))",
              right: "calc(0px + env(safe-area-inset-right))",
            }}
            toastOptions={{
              duration: 3000,
              className:
                "!border-border !bg-card !text-card-foreground !shadow-lg !backdrop-blur-sm",
              style: {
                borderRadius: "var(--radius-lg)",
                padding: "12px 16px",
                boxShadow:
                  "0 10px 15px -3px color-mix(in oklch, var(--foreground) 12%, transparent)",
              },
              success: {
                className:
                  "!border-success-200 !bg-success-50 !text-success-900 dark:!border-success-800 dark:!bg-success-950/40 dark:!text-success-100 !shadow-lg",
                iconTheme: {
                  primary: "#10b981",
                  secondary: "#fff",
                },
              },
              error: {
                className:
                  "!border-error-200 !bg-error-50 !text-error-900 dark:!border-error-800 dark:!bg-error-950/40 dark:!text-error-100 !shadow-lg",
                iconTheme: {
                  primary: "#ef4444",
                  secondary: "#fff",
                },
              },
            }}
          />
        </PageBackground>
      </AuthProvider>
    </BrowserRouter>
  );
}
