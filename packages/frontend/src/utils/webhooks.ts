/** Handlebars payload expected by Scroblarr's Jellyfin webhook endpoint. */
export const JELLYFIN_WEBHOOK_TEMPLATE = `{
  "notificationType": "{{NotificationType}}",
  "username": "{{NotificationUsername}}",
  "userId": "{{UserId}}",
  "itemType": "{{ItemType}}",
  "itemId": "{{ItemId}}",
  "name": "{{{Name}}}",
  "year": "{{Year}}",
  "seriesName": "{{{SeriesName}}}",
  "seasonNumber": "{{SeasonNumber}}",
  "episodeNumber": "{{EpisodeNumber}}",
  "provider_tvdb": "{{Provider_tvdb}}",
  "provider_imdb": "{{Provider_imdb}}",
  "provider_tmdb": "{{Provider_tmdb}}",
  "runtimeTicks": "{{RunTimeTicks}}",
  "playbackPositionTicks": "{{PlaybackPositionTicks}}",
  "playedToCompletion": "{{PlayedToCompletion}}",
  "timestamp": "{{UtcTimestamp}}"
}`;

export function getScroblarrOrigin(origin?: string): string {
  const resolved =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return resolved.replace(/\/$/, "");
}

export function buildPlexWebhookUrl(apiKey: string, origin?: string): string {
  const base = getScroblarrOrigin(origin);
  return `${base}/api/v1/webhooks/plex?apiKey=${encodeURIComponent(apiKey)}`;
}

export function buildJellyfinWebhookUrl(origin?: string): string {
  const base = getScroblarrOrigin(origin);
  return `${base}/api/v1/webhooks/jellyfin`;
}
