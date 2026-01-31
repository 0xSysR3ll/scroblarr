import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { UsersPage } from "@pages/admin/UsersPage";
import { DashboardPage } from "@pages/user/DashboardPage";
import { LoginPage } from "@pages/auth/LoginPage";
import { SetupPage } from "@pages/auth/SetupPage";
import { SettingsPage } from "@pages/admin/SettingsPage";
import { ProfilePage } from "@pages/user/ProfilePage";
import { SyncDashboardPage } from "@pages/user/SyncDashboardPage";
import { ProtectedRoute } from "@components/ui/ProtectedRoute";
import { AuthProvider, useAuth } from "@contexts/AuthContext";
import { Navbar } from "@components/layout/Navbar";
import { Footer } from "@components/layout/Footer";
import { PageBackground } from "@components/layout/PageBackground";
import { showError } from "@utils/toast";

function AppRoutes() {
  const { t } = useTranslation();
  const { isAuthenticated, loading } = useAuth();
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  const checkAdmin = async () => {
    try {
      const response = await fetch("/api/v1/auth/check-admin");
      const data = response.ok ? await response.json() : null;
      setHasAdmin(data?.hasAdmin ?? false);
    } catch {
      setHasAdmin(false);
    } finally {
      setCheckingAdmin(false);
    }
  };

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

    checkAdmin();
  }, [t]);

  useEffect(() => {
    if (isAuthenticated && !hasAdmin) {
      checkAdmin();
    }
  }, [isAuthenticated, hasAdmin]);

  if (checkingAdmin || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-[#0a0a0a]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!hasAdmin) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <>
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
    </>
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
              top: "80px",
            }}
            toastOptions={{
              duration: 3000,
              className:
                "!bg-white dark:!bg-[#1e1e1e] !text-gray-900 dark:!text-white !border-gray-200 dark:!border-[#2d2d2d] !shadow-lg",
              style: {
                borderRadius: "0.5rem",
                padding: "12px 16px",
                boxShadow:
                  "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
              },
              success: {
                className:
                  "!bg-green-50 dark:!bg-green-950/30 !text-green-900 dark:!text-green-100 !border-green-200 dark:!border-green-800 !shadow-lg",
                iconTheme: {
                  primary: "#10b981",
                  secondary: "#fff",
                },
              },
              error: {
                className:
                  "!bg-red-50 dark:!bg-red-950/30 !text-red-900 dark:!text-red-100 !border-red-200 dark:!border-red-800 !shadow-lg",
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
