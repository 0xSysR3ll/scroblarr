import { act, renderHook } from "@testing-library/react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PULL_THRESHOLD_PX, usePullToRefresh } from "./usePullToRefresh";

function touchEvent(clientY: number): ReactTouchEvent {
  return {
    touches: [{ clientY }],
  } as unknown as ReactTouchEvent;
}

describe("usePullToRefresh", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not refresh when the pull stays below the threshold", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    act(() => {
      result.current.pullHandlers.onTouchStart(touchEvent(0));
      result.current.pullHandlers.onTouchMove(touchEvent(40));
    });

    await act(async () => {
      await result.current.pullHandlers.onTouchEnd();
    });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.pullDistance).toBe(0);
  });

  it("refreshes when the pull reaches the threshold", async () => {
    let resolveRefresh!: () => void;
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        })
    );
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));
    const pullDelta = Math.ceil(PULL_THRESHOLD_PX / 0.45) + 10;

    act(() => {
      result.current.pullHandlers.onTouchStart(touchEvent(0));
      result.current.pullHandlers.onTouchMove(touchEvent(pullDelta));
    });

    expect(result.current.pullDistance).toBeGreaterThan(0);

    let endPromise!: Promise<void>;
    act(() => {
      endPromise = result.current.pullHandlers.onTouchEnd();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      resolveRefresh();
      await endPromise;
    });

    expect(result.current.refreshing).toBe(false);
    expect(result.current.pullDistance).toBe(0);
  });

  it("ignores pulls while disabled", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh, disabled: true })
    );

    act(() => {
      result.current.pullHandlers.onTouchStart(touchEvent(0));
      result.current.pullHandlers.onTouchMove(touchEvent(200));
    });

    await act(async () => {
      await result.current.pullHandlers.onTouchEnd();
    });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.pullDistance).toBe(0);
  });

  it("ignores pulls when the page is scrolled", async () => {
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 40,
      writable: true,
    });
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    act(() => {
      result.current.pullHandlers.onTouchStart(touchEvent(0));
      result.current.pullHandlers.onTouchMove(touchEvent(200));
    });

    await act(async () => {
      await result.current.pullHandlers.onTouchEnd();
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("resets pull distance on touchcancel", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    act(() => {
      result.current.pullHandlers.onTouchStart(touchEvent(0));
      result.current.pullHandlers.onTouchMove(touchEvent(200));
    });
    expect(result.current.pullDistance).toBeGreaterThan(0);

    act(() => {
      result.current.pullHandlers.onTouchCancel();
    });

    expect(result.current.pullDistance).toBe(0);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("clears an in-progress pull when scroll leaves the top", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    act(() => {
      result.current.pullHandlers.onTouchStart(touchEvent(0));
      result.current.pullHandlers.onTouchMove(touchEvent(100));
    });
    expect(result.current.pullDistance).toBeGreaterThan(0);

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 12,
      writable: true,
    });

    act(() => {
      result.current.pullHandlers.onTouchMove(touchEvent(140));
    });

    expect(result.current.pullDistance).toBe(0);
  });
});
