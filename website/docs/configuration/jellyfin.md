---
sidebar_position: 2
---

# Jellyfin Configuration

Configure Jellyfin as a source for Scroblarr. This involves setting up the Jellyfin server connection and configuring webhooks.

## Server setup

1. Go to **Settings > Media Server** in the Scroblarr web interface
2. Enter your Jellyfin server details:
   - **Host**: Your Jellyfin server address (e.g., `192.168.1.100` or `jellyfin.example.com`)
   - **Port**: Usually `8096` for HTTP or `8920` for HTTPS
   - **Use SSL**: Check if your Jellyfin server uses HTTPS
   - **URL Base**: Leave empty unless you have a custom path (like `/jellyfin`)
   - **API Key**: Get this from Jellyfin Dashboard > **Advanced > API Keys**
3. Click **Save**

## Webhook configuration

After configuring the server, you need to set up webhooks so Jellyfin sends watch events to Scroblarr.

:::warning
Jellyfin requires the [Webhooks plugin](https://github.com/jellyfin/jellyfin-plugin-webhook) to be installed. If you don't see the Webhooks option in Plugins, you'll need to install it first from the Plugins catalog, then restart Jellyfin.
:::

:::warning API key required
Scroblarr **rejects** Jellyfin webhooks unless an API key is set under **Settings → General** and each request sends that same key via the **`X-API-Key`** header or an **`apiKey`** field in the JSON body (the server strips `apiKey` from the payload before parsing the event).
:::

### 1. Set the Scroblarr API key

In Scroblarr, open **Settings → General**, generate or set an **API key**, and save.

### 2. Add a Generic webhook destination

1. Open your Jellyfin Dashboard
2. Go to **Plugins → Webhook** (install the plugin and restart if needed)
3. Optionally set **Server Url** to your Jellyfin base URL (used for links in templates; not required for Scroblarr)
4. Click **Add Generic Destination**
5. Configure the destination:

| Setting          | Value                                                |
| ---------------- | ---------------------------------------------------- |
| **Webhook Name** | Anything you like (e.g. `Scroblarr`)                 |
| **Webhook Url**  | `http://your-scroblarr-url/api/v1/webhooks/jellyfin` |
| **Enable**       | Checked                                              |

Replace `your-scroblarr-url` with your actual Scroblarr URL (same format as [Plex](/docs/configuration/plex)).

### 3. Notification types (checkboxes)

Under **Notification Type**, enable **only**:

- **Playback Start**
- **Playback Stop**

Leave the rest unchecked (Progress, Item Added, auth events, etc.). Scroblarr only handles start/stop for movies and episodes; other events are ignored.

### 4. Item types (checkboxes)

Under **Item Type**, enable:

- **Movies**
- **Episodes**

Leave Season, Series, Albums, Songs, and Videos unchecked (Scroblarr does not scrobble those).

### 5. Send All Properties — leave unchecked

Do **not** enable **Send All Properties (ignores template)**.

That option posts Jellyfin’s raw property bag (PascalCase keys like `NotificationType`, `RunTimeTicks`). Scroblarr expects a specific camelCase JSON shape (`notificationType`, `runtimeTicks`, …), so you must use the template below instead.

Optional but fine to enable:

- **Trim leading and trailing whitespace from message body before sending**

### 6. Payload template

Paste this into the **Template** field:

```handlebars
{ "notificationType": "{{NotificationType}}", "username": "{{NotificationUsername}}",
"userId": "{{UserId}}", "itemType": "{{ItemType}}", "itemId": "{{ItemId}}",
"name": "{{{Name}}}", "year": "{{Year}}", "seriesName": "{{{SeriesName}}}",
"seasonNumber": "{{SeasonNumber}}", "episodeNumber": "{{EpisodeNumber}}",
"provider_tvdb": "{{Provider_tvdb}}", "provider_imdb": "{{Provider_imdb}}",
"provider_tmdb": "{{Provider_tmdb}}", "runtimeTicks": "{{RunTimeTicks}}",
"playbackPositionTicks": "{{PlaybackPositionTicks}}", "playedToCompletion": "{{PlayedToCompletion}}",
"timestamp": "{{UtcTimestamp}}" }
```

Notes:

- Use triple braces (`{{{Name}}}`, `{{{SeriesName}}}`) so Handlebars does not HTML-escape titles. The plugin already escapes quotes in those fields; wrapping them in `json_encode` would double-escape and can corrupt titles that contain `"`.
- Keep the surrounding JSON quotes on string fields. Without them you get invalid JSON like `"name": Head Games` and Jellyfin gets **400 Bad Request**.
- Empty fields (for example movie-only events without `SeriesName`) become empty strings; Scroblarr ignores what it does not need.
- `PlayedToCompletion` is only set on **Playback Stop**; on start it is empty and treated as not completed.

### 7. Request headers

Add these request headers (Generic destination → **Add Request Header**):

| Header         | Value                                    |
| -------------- | ---------------------------------------- |
| `Content-Type` | `application/json`                       |
| `X-API-Key`    | Your API key from **Settings → General** |

`Content-Type: application/json` is **recommended**. The plugin defaults to `text/plain`; Scroblarr can still parse JSON from that content type, but setting `application/json` makes the intent explicit.

**Alternative to `X-API-Key`:** add a top-level `"apiKey": "your_key_here"` field inside the template JSON instead. Header auth is preferred.

### 8. Save

Click **Save** at the bottom of the Webhook plugin page.

:::tip Docker users
Same considerations as Plex — make sure Jellyfin can reach your Scroblarr container. Use host IP addresses or Docker networking as needed.
:::

## What Scroblarr does with events

| Jellyfin notification                                     | Result in Scroblarr             |
| --------------------------------------------------------- | ------------------------------- |
| `PlaybackStart`                                           | Mark as playing                 |
| `PlaybackStop` + completed (≥90% or `playedToCompletion`) | Scrobble to linked destinations |
| `PlaybackStop` + not completed                            | Stopped (no scrobble)           |
| Other types / non-movie-or-episode                        | Ignored (`Event not supported`) |

Users are matched by Jellyfin **user id** (`userId` in the payload) to the linked Scroblarr account.

## Verification

Once configured, Jellyfin will send watch events to Scroblarr automatically. You can verify it's working by:

1. Watching something on Jellyfin (start and finish, or stop past ~90%)
2. Checking the Scroblarr Dashboard — you should see the sync appear within a few seconds

If webhooks aren't working, check the [Troubleshooting](/docs/troubleshooting) guide.
