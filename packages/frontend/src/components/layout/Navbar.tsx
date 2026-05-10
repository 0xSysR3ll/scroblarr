import { useAuth } from "@contexts/AuthContext";
import { useTheme } from "@contexts/ThemeContext";
import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { IconType } from "react-icons";
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
} from "react-icons/fa";
import { useNavigate, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  path: string;
  label: string;
  icon: IconType;
  show: boolean;
};

function buildNavItems(t: TFunction, isAdmin: boolean): NavItem[] {
  return [
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
      show: isAdmin,
    },
    {
      path: "/settings",
      label: t("settings.title", { defaultValue: "Settings" }),
      icon: FaCog,
      show: isAdmin,
    },
  ].filter((item) => item.show);
}

function isNavActive(path: string, pathname: string) {
  if (path === "/") {
    return pathname === "/";
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function Navbar() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <header className="relative border-b border-border bg-card/90 shadow-sm backdrop-blur-md pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center justify-between gap-2 md:h-16">
            <NavBrand />
            <div className="flex shrink-0 items-center gap-1 md:hidden">
              <ThemeToggle />
              <UserMenu compact />
            </div>
            <DesktopChrome />
          </div>
        </div>
      </header>
      <MobileBottomNav />
    </>
  );
}

function NavBrand() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate("/")}
      className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground transition-colors hover:text-primary md:text-xl"
    >
      <img
        src="/logo-icon.svg"
        alt="Scroblarr"
        className="h-7 w-7 md:h-8 md:w-8"
      />
      <span>Scroblarr</span>
    </button>
  );
}

function DesktopChrome() {
  return (
    <div className="hidden md:flex md:items-center md:gap-4">
      <DesktopNavLinks />
      <ThemeToggle />
      <UserMenu />
    </div>
  );
}

function DesktopNavLinks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const navItems = useMemo(
    () => buildNavItems(t, user?.isAdmin ?? false),
    [t, user?.isAdmin]
  );

  return (
    <div className="flex items-center gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isNavActive(item.path, location.pathname);
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
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
  );
}

function MobileBottomNav() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const navItems = useMemo(
    () => buildNavItems(t, user?.isAdmin ?? false),
    [t, user?.isAdmin]
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 shadow-[0_-4px_24px_color-mix(in_oklch,var(--foreground)_6%,transparent)] backdrop-blur-md md:hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pt-1"
      aria-label={t("nav.mobileBottomLabel", {
        defaultValue: "Primary navigation",
      })}
    >
      <div className="flex max-w-full items-stretch justify-evenly gap-1 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isNavActive(item.path, location.pathname);
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium leading-tight transition-colors ${
                active
                  ? "text-primary"
                  : "text-muted-foreground active:bg-muted/80"
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-primary/15" : ""
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
              </span>
              <span className="line-clamp-2 w-full px-0.5 text-center">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function ThemeToggle({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  const { themeMode, toggleTheme } = useTheme();
  const { t } = useTranslation();

  const getIcon = () => {
    if (themeMode === "auto") {
      return <FaDesktop className={iconClassName ?? "h-5 w-5"} />;
    }
    if (themeMode === "light") {
      return <FaSun className={iconClassName ?? "h-5 w-5"} />;
    }
    return <FaMoon className={iconClassName ?? "h-5 w-5"} />;
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
      className={className}
      onClick={toggleTheme}
      aria-label={getAriaLabel()}
      title={getAriaLabel()}
    >
      {getIcon()}
    </Button>
  );
}

function UserMenu({
  compact,
  menuSide = "bottom",
}: {
  compact?: boolean;
  menuSide?: "top" | "bottom";
}) {
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
          className={`group flex items-center rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 ${
            compact
              ? "p-0"
              : "gap-2 rounded-lg [&[data-state=open]_svg]:rotate-180"
          }`}
        >
          <div className="relative">
            <img
              src={avatarUrl}
              alt={user?.displayName || user?.username}
              className={`rounded-full border-2 border-border object-cover transition-colors group-hover:border-primary ${
                compact ? "h-8 w-8" : "h-9 w-9"
              }`}
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
          {!compact && (
            <FaChevronDown className="h-3 w-3 shrink-0 text-muted-foreground transition-transform" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={menuSide}
        align="end"
        className="w-56 p-0"
        sideOffset={compact ? 8 : 4}
      >
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
