import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { useTabNavigation } from "./useTabNavigation";

const tabs = ["overview", "settings"] as const;

function TabNavigationProbe() {
  const location = useLocation();
  const { activeTab, changeTab } = useTabNavigation({
    validTabs: tabs,
    basePath: "/profile",
    defaultTab: "overview",
  });

  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="active-tab">{activeTab}</span>
      <button type="button" onClick={() => changeTab("settings")}>
        Settings
      </button>
    </div>
  );
}

function renderProbe(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TabNavigationProbe />
    </MemoryRouter>
  );
}

describe("useTabNavigation", () => {
  it("redirects the base path to the default tab", async () => {
    renderProbe("/profile");

    await waitFor(() => {
      expect(screen.getByTestId("path")).toHaveTextContent("/profile/overview");
    });
    expect(screen.getByTestId("active-tab")).toHaveTextContent("overview");
  });

  it("falls back to the default tab for unknown path segments", () => {
    renderProbe("/profile/unknown");

    expect(screen.getByTestId("active-tab")).toHaveTextContent("overview");
    expect(screen.getByTestId("path")).toHaveTextContent("/profile/unknown");
  });

  it("honors direct navigation to a valid non-default tab", () => {
    renderProbe("/profile/settings");

    expect(screen.getByTestId("active-tab")).toHaveTextContent("settings");
    expect(screen.getByTestId("path")).toHaveTextContent("/profile/settings");
  });

  it("navigates to selected tabs", async () => {
    const user = userEvent.setup();
    renderProbe("/profile/overview");

    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(screen.getByTestId("path")).toHaveTextContent("/profile/settings");
    expect(screen.getByTestId("active-tab")).toHaveTextContent("settings");
  });
});
