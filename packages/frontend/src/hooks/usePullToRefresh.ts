import {
  useCallback,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from "react";

export const PULL_THRESHOLD_PX = 64;
const PULL_MAX_PX = 96;

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  disabled?: boolean;
}

export function usePullToRefresh({
  onRefresh,
  disabled = false,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);

  const resetPull = useCallback(() => {
    pullingRef.current = false;
    startYRef.current = 0;
    pullDistanceRef.current = 0;
    setPullDistance(0);
  }, []);

  const onTouchStart = useCallback(
    (event: ReactTouchEvent) => {
      if (disabled || refreshingRef.current) return;
      if (typeof window !== "undefined" && window.scrollY > 0) return;

      startYRef.current = event.touches[0]?.clientY ?? 0;
      pullingRef.current = true;
    },
    [disabled]
  );

  const onTouchMove = useCallback(
    (event: ReactTouchEvent) => {
      if (!pullingRef.current || disabled || refreshingRef.current) return;
      if (typeof window !== "undefined" && window.scrollY > 0) {
        resetPull();
        return;
      }

      const currentY = event.touches[0]?.clientY ?? 0;
      const delta = currentY - startYRef.current;
      if (delta <= 0) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }

      const resisted = Math.min(PULL_MAX_PX, delta * 0.45);
      pullDistanceRef.current = resisted;
      setPullDistance(resisted);
    },
    [disabled, resetPull]
  );

  const onTouchEnd = useCallback(async () => {
    if (!pullingRef.current || disabled) {
      resetPull();
      return;
    }

    const shouldRefresh = pullDistanceRef.current >= PULL_THRESHOLD_PX;
    resetPull();

    if (!shouldRefresh || refreshingRef.current) return;

    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [disabled, onRefresh, resetPull]);

  return {
    pullDistance,
    refreshing,
    pullHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: resetPull,
    },
  };
}
