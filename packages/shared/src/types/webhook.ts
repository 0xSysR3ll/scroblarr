export type WebhookSource = "plex";

export interface WebhookPayload {
  source: WebhookSource;
  event: string;
  payload: unknown;
  timestamp: Date;
}
