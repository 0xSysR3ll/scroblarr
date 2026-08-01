import { renderWithProviders } from "@test/render";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showSuccess } from "@utils/toast";
import {
  buildJellyfinWebhookUrl,
  buildPlexWebhookUrl,
  JELLYFIN_WEBHOOK_TEMPLATE,
} from "@utils/webhooks";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WebhookSetupPanel } from "./WebhookSetupPanel";

vi.mock("@utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

async function expandWebhooks(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Webhooks/i }));
}

describe("WebhookSetupPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is collapsed by default and expands on click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WebhookSetupPanel source="plex" />);

    expect(screen.getByRole("button", { name: /Webhooks/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByLabelText("Webhook URL")).not.toBeInTheDocument();

    await expandWebhooks(user);

    expect(screen.getByRole("button", { name: /Webhooks/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByLabelText("Webhook URL")).toBeInTheDocument();
  });

  it("shows a Plex webhook URL and warns when the API key is missing", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WebhookSetupPanel source="plex" />);
    await expandWebhooks(user);

    expect(
      screen.getByText(/Set and save an API key under Settings → General first/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Webhook URL")).toHaveValue(
      buildPlexWebhookUrl("YOUR_API_KEY")
    );
    expect(screen.getByRole("link", { name: "Setup docs" })).toHaveAttribute(
      "href",
      "https://0xsysr3ll.github.io/scroblarr/docs/configuration/plex"
    );
  });

  it("copies the Plex webhook URL when an API key is set", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderWithProviders(
      <WebhookSetupPanel source="plex" apiKey="sk_live_key" />
    );
    await expandWebhooks(user);

    const expected = buildPlexWebhookUrl("sk_live_key");
    expect(screen.getByLabelText("Webhook URL")).toHaveValue(expected);
    expect(
      screen.queryByText(
        /Set and save an API key under Settings → General first/
      )
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy webhook URL" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expected);
      expect(showSuccess).toHaveBeenCalledWith("Copied to clipboard");
    });
  });

  it("shows Jellyfin URL, API key, and template copy fields", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderWithProviders(
      <WebhookSetupPanel source="jellyfin" apiKey="sk_jelly" />
    );
    await expandWebhooks(user);

    expect(screen.getByLabelText("Webhook URL")).toHaveValue(
      buildJellyfinWebhookUrl()
    );
    expect(screen.getByLabelText("X-API-Key header value")).toHaveValue(
      "sk_jelly"
    );
    expect(screen.getByLabelText("Payload template")).toHaveValue(
      JELLYFIN_WEBHOOK_TEMPLATE
    );
    expect(screen.getByRole("link", { name: "Setup docs" })).toHaveAttribute(
      "href",
      "https://0xsysr3ll.github.io/scroblarr/docs/configuration/jellyfin"
    );

    await user.click(
      screen.getByRole("button", { name: "Copy payload template" })
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(JELLYFIN_WEBHOOK_TEMPLATE);
    });
  });

  it("does not toast when clipboard copy fails", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderWithProviders(
      <WebhookSetupPanel source="plex" apiKey="sk_live_key" />
    );
    await expandWebhooks(user);

    await user.click(screen.getByRole("button", { name: "Copy webhook URL" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it("shows an empty Jellyfin API key field when no key is saved", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WebhookSetupPanel source="jellyfin" />);
    await expandWebhooks(user);

    expect(
      screen.getByText(/Set and save an API key under Settings → General first/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("X-API-Key header value")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Copy API key" })).toBeDisabled();
  });
});
