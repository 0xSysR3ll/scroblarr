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

/** JSON body Tautulli substitutes and POSTs to Scroblarr's Tautulli webhook. */
export const TAUTULLI_WEBHOOK_TEMPLATE = `{
  "action": "{action}",
  "user": "{user}",
  "username": "{username}",
  "media_type": "{media_type}",
  "title": "{title}",
  "year": "{year}",
  "show_name": "{show_name}",
  "show_year": "{show_year}",
  "episode_name": "{episode_name}",
  "season_num": "{season_num}",
  "episode_num": "{episode_num}",
  "imdb_id": "{imdb_id}",
  "thetvdb_id": "{thetvdb_id}",
  "themoviedb_id": "{themoviedb_id}",
  "duration_ms": "{duration_ms}",
  "view_offset": "{view_offset}",
  "poster_url": "{poster_url}",
  "thumb": "{thumb}",
  "server_machine_id": "{server_machine_id}"
}`;

export function buildTautulliWebhookUrl(origin?: string): string {
  const base = getScroblarrOrigin(origin);
  return `${base}/api/v1/webhooks/tautulli`;
}

export function buildTautulliWebhookHeaders(apiKey: string): string {
  return JSON.stringify(
    {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    null,
    2
  );
}
