import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
import { useAuth } from "@contexts/AuthContext";
import { useTheme } from "@contexts/ThemeContext";

export function Navbar() {
  const { isAuthenticated } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { t } = useTranslation();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <nav className="relative bg-white dark:bg-[#121212] border-b border-gray-200 dark:border-[#2d2d2d] shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4 md:gap-8">
            <NavBrand />
            <NavLinks
              isMobileMenuOpen={isMobileMenuOpen}
              onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
            />
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <ThemeToggle />
            <UserMenu />
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e1e1e] transition-colors"
              aria-label={t("nav.toggleMenu", { defaultValue: "Toggle menu" })}
            >
              {isMobileMenuOpen ? (
                <FaTimes className="h-5 w-5" />
              ) : (
                <FaBars className="h-5 w-5" />
              )}
            </button>
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
      onClick={() => navigate("/")}
      className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
    >
      <img src="/logo-icon.svg" alt="Scroblarr" className="h-8 w-8" />
      <span>Scroblarr</span>
    </button>
  );
}

function NavLinks({
  isMobileMenuOpen,
  onCloseMobileMenu,
}: {
  isMobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

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
      <div className="hidden md:flex items-center gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => handleNavClick(item.path)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#1e1e1e]"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      {isMobileMenuOpen && (
        <div className="absolute top-16 left-0 right-0 md:hidden bg-white dark:bg-[#121212] border-b border-gray-200 dark:border-[#2d2d2d] shadow-lg z-50">
          <div className="container mx-auto px-4 py-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavClick(item.path)}
                  className={`w-full flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
                      : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#1e1e1e]"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
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
    <button
      type="button"
      onClick={toggleTheme}
      className="p-2 rounded-lg text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e1e1e] transition-colors"
      aria-label={getAriaLabel()}
      title={getAriaLabel()}
    >
      {getIcon()}
    </button>
  );
}

function UserMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center gap-2 focus:outline-none group"
      >
        <div className="relative">
          <img
            src={
              user?.thumb ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                user?.displayName ||
                  user?.username ||
                  t("nav.user", { defaultValue: "User" })
              )}&background=3b82f6&color=fff&size=128`
            }
            alt={user?.displayName || user?.username}
            className="h-9 w-9 rounded-full object-cover border-2 border-gray-300 dark:border-[#2d2d2d] group-hover:border-blue-500 dark:group-hover:border-blue-400 transition-colors"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                `https://ui-avatars.com/api/?name=${encodeURIComponent(
                  user?.displayName || user?.username || "User"
                )}&background=3b82f6&color=fff&size=128`;
            }}
          />
          {user?.isAdmin && (
            <div className="absolute -top-1 -right-1 bg-blue-600 dark:bg-blue-500 rounded-full p-0.5">
              <FaCrown className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
        <FaChevronDown
          className={`w-3 h-3 text-gray-600 dark:text-slate-300 transition-transform ${
            isDropdownOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isDropdownOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#121212] rounded-lg shadow-lg py-2 z-50 border border-gray-200 dark:border-[#2d2d2d]">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-[#2d2d2d]">
            <div className="flex items-center gap-3">
              <img
                src={
                  user?.thumb ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    user?.displayName ||
                      user?.username ||
                      t("nav.user", { defaultValue: "User" })
                  )}&background=3b82f6&color=fff&size=128`
                }
                alt={user?.displayName || user?.username}
                className="h-10 w-10 rounded-full object-cover border-2 border-gray-300 dark:border-[#2d2d2d]"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      user?.displayName || user?.username || "User"
                    )}&background=3b82f6&color=fff&size=128`;
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {user?.displayName || user?.username}
                  </div>
                  {user?.isAdmin && (
                    <FaCrown className="w-3 h-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  )}
                </div>
                {user?.email && (
                  <div className="text-xs text-gray-500 dark:text-slate-400 truncate">
                    {user.email}
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              navigate("/profile");
              setIsDropdownOpen(false);
            }}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e1e1e] transition-colors"
          >
            <FaUser className="w-4 h-4" />
            <span>{t("profile.title", { defaultValue: "Profile" })}</span>
          </button>
          <button
            onClick={() => {
              handleLogout();
              setIsDropdownOpen(false);
            }}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e1e1e] transition-colors"
          >
            <FaSignOutAlt className="w-4 h-4" />
            <span>{t("auth.logout", { defaultValue: "Logout" })}</span>
          </button>
        </div>
      )}
    </div>
  );
}
