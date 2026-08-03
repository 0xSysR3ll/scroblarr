import { renderWithProviders } from "@test/render";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OfflinePage } from "./OfflinePage";

describe("OfflinePage", () => {
  it("renders unavailable messaging and retries on click", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    renderWithProviders(<OfflinePage onRetry={onRetry} />);

    expect(
      screen.getByRole("heading", { name: /scroblarr is unavailable/i })
    ).toBeVisible();
    expect(screen.getByText(/can't reach the server right now/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
