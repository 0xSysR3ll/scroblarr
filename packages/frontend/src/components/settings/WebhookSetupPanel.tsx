import { showError, showSuccess } from "@utils/toast";
import {
  buildJellyfinWebhookUrl,
  buildPlexWebhookUrl,
  JELLYFIN_WEBHOOK_TEMPLATE,
} from "@utils/webhooks";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FaBook,
  FaChevronDown,
  FaCopy,
  FaExclamationTriangle,
} from "react-icons/fa";

const DOCS_URL =
  (import.meta as { env?: { VITE_DOCS_URL?: string } }).env?.VITE_DOCS_URL ||
  "https://0xsysr3ll.github.io/scroblarr/docs";

export type WebhookSource = "plex" | "jellyfin";

interface WebhookSetupPanelProps {
  source: WebhookSource;
  webhookApiKey?: string;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function CopyField({
  id,
  label,
  value,
  multiline = false,
  disabled = false,
  copyLabel,
}: {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  disabled?: boolean;
  copyLabel: string;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      <div className="flex gap-2 items-start">
        {multiline ? (
          <textarea
            id={id}
            readOnly
            value={value}
            rows={12}
            className="min-h-[16rem] w-full flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5 text-foreground whitespace-pre"
          />
        ) : (
          <input
            id={id}
            type="text"
            readOnly
            value={value}
            className="w-full flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground sm:text-sm"
          />
        )}
        <button
          type="button"
          disabled={disabled || !value}
          onClick={async () => {
            const ok = await copyText(value);
            if (ok) {
              showSuccess(
                t("settings.webhook.copied", {
                  defaultValue: "Copied to clipboard",
                })
              );
            } else {
              showError(
                t("settings.webhook.copyFailed", {
                  defaultValue: "Failed to copy to clipboard",
                })
              );
            }
          }}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
          title={copyLabel}
          aria-label={copyLabel}
        >
          <FaCopy className="w-4 h-4" />
          <span className="hidden sm:inline">
            {t("settings.general.copy", { defaultValue: "Copy" })}
          </span>
        </button>
      </div>
    </div>
  );
}

export function WebhookSetupPanel({
  source,
  webhookApiKey,
}: WebhookSetupPanelProps) {
  const { t } = useTranslation();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const hasApiKey = !!webhookApiKey?.trim();
  const docsHref =
    source === "plex"
      ? `${DOCS_URL}/configuration/plex`
      : `${DOCS_URL}/configuration/jellyfin`;

  const webhookUrl =
    source === "plex"
      ? hasApiKey
        ? buildPlexWebhookUrl(webhookApiKey!.trim())
        : buildPlexWebhookUrl("YOUR_WEBHOOK_API_KEY")
      : buildJellyfinWebhookUrl();

  const description =
    source === "plex"
      ? t("settings.webhook.plexDescription", {
          defaultValue:
            "Copy this URL into Plex so completed watches sync to Scroblarr.",
        })
      : t("settings.webhook.jellyfinDescription", {
          defaultValue:
            "Configure a Generic webhook destination in Jellyfin with these values.",
        });

  const checklist =
    source === "plex"
      ? [
          t("settings.webhook.plexChecklist.pass", {
            defaultValue: "Plex Pass is required for webhooks",
          }),
          t("settings.webhook.plexChecklist.paste", {
            defaultValue:
              "Paste the URL in Plex → Settings → Webhooks → Add Webhook",
          }),
          t("settings.webhook.plexChecklist.save", {
            defaultValue:
              "Save the Plex server above so Server.uuid matches webhooks",
          }),
        ]
      : [
          t("settings.webhook.jellyfinChecklist.plugin", {
            defaultValue: "Install the Jellyfin Webhooks plugin and restart",
          }),
          t("settings.webhook.jellyfinChecklist.events", {
            defaultValue: "Enable Playback Start/Stop and Movies/Episodes only",
          }),
          t("settings.webhook.jellyfinChecklist.template", {
            defaultValue:
              "Paste the template (leave Send All Properties unchecked)",
          }),
          t("settings.webhook.jellyfinChecklist.headers", {
            defaultValue:
              "Add Content-Type: application/json and X-API-Key headers",
          }),
        ];

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/40 sm:p-5"
      >
        <FaChevronDown
          className={`mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-0" : "-rotate-90"
          }`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground sm:text-base">
            {t("settings.webhook.title", { defaultValue: "Webhooks" })}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground sm:text-sm">
            {description}
          </span>
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          className="space-y-4 border-t border-border p-4 sm:p-5"
        >
          <div className="flex justify-end">
            <a
              href={docsHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 sm:text-sm"
            >
              <FaBook className="w-3.5 h-3.5" />
              {t("settings.webhook.docs", { defaultValue: "Setup docs" })}
            </a>
          </div>

          {!hasApiKey && (
            <div className="flex gap-2 rounded border-l-4 border-amber-400 bg-amber-50 p-3 dark:border-amber-600 dark:bg-amber-950">
              <FaExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {t("settings.webhook.apiKeyRequired", {
                  defaultValue:
                    "Set and save an API key under Settings → General first. Webhooks are rejected without it.",
                })}
              </p>
            </div>
          )}

          <CopyField
            id={`${source}-webhook-url`}
            label={t("settings.webhook.url", { defaultValue: "Webhook URL" })}
            value={webhookUrl}
            disabled={source === "plex" && !hasApiKey}
            copyLabel={t("settings.webhook.copyUrl", {
              defaultValue: "Copy webhook URL",
            })}
          />

          {source === "jellyfin" && (
            <>
              <CopyField
                id="jellyfin-webhook-api-key"
                label={t("settings.webhook.apiKeyHeader", {
                  defaultValue: "X-API-Key header value",
                })}
                value={hasApiKey ? webhookApiKey!.trim() : ""}
                disabled={!hasApiKey}
                copyLabel={t("settings.webhook.copyApiKey", {
                  defaultValue: "Copy API key",
                })}
              />
              <CopyField
                id="jellyfin-webhook-template"
                label={t("settings.webhook.template", {
                  defaultValue: "Payload template",
                })}
                value={JELLYFIN_WEBHOOK_TEMPLATE}
                multiline
                copyLabel={t("settings.webhook.copyTemplate", {
                  defaultValue: "Copy payload template",
                })}
              />
            </>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">
              {t("settings.webhook.checklist", { defaultValue: "Checklist" })}
            </p>
            <ul className="space-y-1.5 text-xs text-muted-foreground sm:text-sm">
              {checklist.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-muted-foreground/70" aria-hidden>
                    •
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("settings.webhook.urlHint", {
              defaultValue:
                "If your media server cannot reach this host (Docker, reverse proxy), replace the origin with a URL it can access.",
            })}
          </p>
        </div>
      )}
    </div>
  );
}
