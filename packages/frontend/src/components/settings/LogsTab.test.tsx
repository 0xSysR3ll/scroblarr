import { getLogFiles, getLogs } from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LogsTab } from "./LogsTab";

vi.mock("@services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@services/api")>();
  return {
    ...actual,
    getLogs: vi.fn(),
    getLogFiles: vi.fn(),
    downloadLogFile: vi.fn(),
  };
});

describe("LogsTab", () => {
  beforeEach(() => {
    vi.mocked(getLogFiles).mockResolvedValue({ files: [] });
    vi.mocked(getLogs).mockImplementation(async (params) => {
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      return {
        logs: [
          {
            level: 30,
            time: Date.now(),
            msg: `log page ${page}`,
            label: "system",
          },
        ],
        pagination: {
          page,
          pageSize,
          total: 60,
          totalPages: 3,
        },
      };
    });
  });

  it("renders pagination and navigates pages", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LogsTab />);

    expect(
      await screen.findByText(/Showing 1 to 20 of 60 results/i)
    ).toBeVisible();

    expect(screen.getByRole("button", { name: "First page" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Next" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Last page" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(getLogs).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });
    expect(
      await screen.findByText(/Showing 21 to 40 of 60 results/i)
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Last page" }));
    await waitFor(() => {
      expect(getLogs).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3 })
      );
    });
    expect(
      await screen.findByText(/Showing 41 to 60 of 60 results/i)
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "1" }));
    expect(
      await screen.findByText(/Showing 1 to 20 of 60 results/i)
    ).toBeVisible();
  });

  it("shows load errors, severity row styles, and log files", async () => {
    vi.mocked(getLogs).mockRejectedValueOnce(new Error("boom"));
    vi.mocked(getLogFiles).mockResolvedValue({
      files: [
        {
          name: "app.log",
          size: 2048,
          modified: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        },
      ],
    });

    const user = userEvent.setup();
    renderWithProviders(<LogsTab />);
    expect(await screen.findByText("boom")).toBeVisible();

    vi.mocked(getLogs).mockResolvedValue({
      logs: [
        { level: 50, time: Date.now(), msg: "fatal row", label: "system" },
        { level: 40, time: Date.now(), msg: "warn row", label: "system" },
      ],
      pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
    });

    await user.click(screen.getByRole("button", { name: /Refresh/i }));
    expect(await screen.findByText("fatal row")).toBeVisible();
    expect(screen.getByText("warn row")).toBeVisible();
    expect(await screen.findByText("app.log")).toBeVisible();
  });
});
