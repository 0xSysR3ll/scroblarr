import { useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export function useTabNavigation<T extends string>({
  validTabs,
  basePath,
  defaultTab,
}: {
  validTabs: readonly T[];
  basePath: string;
  defaultTab: T;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const activeTab = useMemo<T>(() => {
    const segments = location.pathname.split("/").filter(Boolean);
    const tabSegment = segments[segments.length - 1];
    return validTabs.includes(tabSegment as T) ? (tabSegment as T) : defaultTab;
  }, [location.pathname, validTabs, defaultTab]);

  useEffect(() => {
    if (location.pathname === basePath) {
      navigate(`${basePath}/${defaultTab}`, { replace: true });
    }
  }, [location.pathname, navigate, basePath, defaultTab]);

  const changeTab = (tab: T) => {
    navigate(`${basePath}/${tab}`);
  };

  return { activeTab, changeTab };
}
