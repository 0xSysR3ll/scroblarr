import { useAuth } from "@contexts/AuthContext";
import { useTheme } from "@contexts/ThemeContext";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FaChevronDown,
  FaMoon,
  FaSun,
  FaDesktop,
  FaHome,
  FaUsers,
  FaCog,
  FaUser,
  FaSignOutAlt,
  FaSync,
  FaCrown,
  FaBars,
  FaTimes,
} from "react-icons/fa";
import { useNavigate, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Navbar() {
  const { isAuthenticated } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { t } = useTranslation();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <nav className="relative border-b border-border bg-card/90 shadow-sm backdrop-blur-md pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4 md:gap-8">
            <NavBrand />
            <NavLinks
              isMobileMenuOpen={isMobileMenuOpen}
              onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
              onMobileMenuOpenChange={setIsMobileMenuOpen}
            />
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <ThemeToggle />
            <UserMenu />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-primary-nav"
              aria-label={t("nav.toggleMenu", { defaultValue: "Toggle menu" })}
            >
              {isMobileMenuOpen ? (
                <FaTimes className="h-5 w-5" />
              ) : (
                <FaBars className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavBrand() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate("/")}
      className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
    >
      <img src="/logo-icon.svg" alt="Scroblarr" className="h-8 w-8" />
      <span>Scroblarr</span>
    </button>
  );
}

function NavLinks({
  isMobileMenuOpen,
  onCloseMobileMenu,
  onMobileMenuOpenChange,
}: {
  isMobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  onMobileMenuOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    function closeOnDesktop() {
      if (mq.matches) {
        onCloseMobileMenu();
      }
    }
    mq.addEventListener("change", closeOnDesktop);
    return () => mq.removeEventListener("change", closeOnDesktop);
  }, [onCloseMobileMenu]);

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    {
      path: "/",
      label: t("dashboard.title", { defaultValue: "Dashboard" }),
      icon: FaHome,
      show: true,
    },
    {
      path: "/sync",
      label: t("nav.sync", { defaultValue: "Sync" }),
      icon: FaSync,
      show: true,
    },
    {
      path: "/users",
      label: t("users.title", { defaultValue: "Users" }),
      icon: FaUsers,
      show: user?.isAdmin || false,
    },
    {
      path: "/settings",
      label: t("settings.title", { defaultValue: "Settings" }),
      icon: FaCog,
      show: user?.isAdmin || false,
    },
  ].filter((item) => item.show);

  function handleNavClick(path: string) {
    navigate(path);
    onCloseMobileMenu();
  }

  return (
    <>
      <div className="hidden items-center gap-1 md:flex">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => handleNavClick(item.path)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                active
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <Dialog
        open={isMobileMenuOpen}
        onOpenChange={onMobileMenuOpenChange}
        modal
      >
        <DialogContent
          id="mobile-primary-nav"
          className="fixed inset-x-0 top-[calc(4rem + env(safe-area-inset-top))] bottom-auto z-50 max-h-[min(85vh,calc(100dvh - 4rem - env(safe-area-inset-top)))] w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none border-x-0 border-b border-t-0 p-0 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:max-w-none md:hidden"
        >
          <DialogTitle className="sr-only">
            {t("nav.mobileNavTitle", {
              defaultValue: "Main navigation",
            })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("nav.mobileNavDescription", {
              defaultValue: "Links to sections of the app.",
            })}
          </DialogDescription>
          <div className="container mx-auto px-4 py-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => handleNavClick(item.path)}
                  className={`flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    active
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ThemeToggle() {
  const { themeMode, toggleTheme } = useTheme();
  const { t } = useTranslation();

  const getIcon = () => {
    if (themeMode === "auto") {
      return <FaDesktop className="h-5 w-5" />;
    }
    if (themeMode === "light") {
      return <FaSun className="h-5 w-5" />;
    }
    return <FaMoon className="h-5 w-5" />;
  };

  const getAriaLabel = () => {
    if (themeMode === "auto") {
      return t("theme.auto", { defaultValue: "Auto (system)" });
    }
    if (themeMode === "light") {
      return t("theme.light", { defaultValue: "Light mode" });
    }
    return t("theme.dark", { defaultValue: "Dark mode" });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={getAriaLabel()}
      title={getAriaLabel()}
    >
      {getIcon()}
    </Button>
  );
}

function UserMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const avatarUrl =
    user?.thumb ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      user?.displayName ||
        user?.username ||
        t("nav.user", { defaultValue: "User" })
    )}&background=3b82f6&color=fff&size=128`;

  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    user?.displayName || user?.username || "User"
  )}&background=3b82f6&color=fff&size=128`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-2 rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 [&[data-state=open]_svg]:rotate-180"
        >
          <div className="relative">
            <img
              src={avatarUrl}
              alt={user?.displayName || user?.username}
              className="h-9 w-9 rounded-full border-2 border-border object-cover transition-colors group-hover:border-primary"
              onError={(e) => {
                (e.target as HTMLImageElement).src = fallbackAvatar;
              }}
            />
            {user?.isAdmin && (
              <div className="absolute -right-1 -top-1 rounded-full bg-primary p-0.5">
                <FaCrown className="h-3 w-3 text-primary-foreground" />
              </div>
            )}
          </div>
          <FaChevronDown className="h-3 w-3 shrink-0 text-muted-foreground transition-transform" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-0">
        <DropdownMenuLabel className="border-b border-border px-4 py-3 font-normal">
          <div className="flex items-center gap-3">
            <img
              src={avatarUrl}
              alt={user?.displayName || user?.username}
              className="h-10 w-10 rounded-full border-2 border-border object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = fallbackAvatar;
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate text-sm font-medium text-foreground">
                  {user?.displayName || user?.username}
                </div>
                {user?.isAdmin && (
                  <FaCrown className="h-3 w-3 shrink-0 text-primary" />
                )}
              </div>
              {user?.email && (
                <div className="truncate text-xs text-muted-foreground">
                  {user.email}
                </div>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <div className="py-1">
          <DropdownMenuItem
            className="mx-1 gap-1.5 px-3"
            onSelect={() => {
              navigate("/profile");
            }}
          >
            <FaUser className="h-4 w-4" />
            {t("profile.title", { defaultValue: "Profile" })}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="mx-1 gap-1.5 px-3"
            onSelect={() => {
              handleLogout();
            }}
          >
            <FaSignOutAlt className="h-4 w-4" />
            {t("auth.logout", { defaultValue: "Logout" })}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
