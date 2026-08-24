---
sidebar_position: 1
---

# Plex Configuration

Configure Plex as a source for Scroblarr. This involves setting up the Plex server connection and configuring webhooks.

## Server setup

1. Go to **Settings > Media Server** in the Scroblarr web interface
2. Click **Authenticate with Plex**
3. A popup will open asking you to sign in to Plex. After signing in, Scroblarr will fetch your available servers
4. Select the Plex server you want to use from the dropdown
5. Click **Save**

When you save, Scroblarr stores your chosen server's **machine identifier** (Plex's `machineIdentifier` / webhook `Server.uuid`) when Plex provides it.

### Connection list behavior

Scroblarr merges Plex-discovered HTTP and HTTPS connections, then keeps a compact, prioritized list to avoid showing too many duplicate URLs.

- Local connections are prioritized for self-hosted and Docker setups.
- Each connection now shows a **Reachable** or **Unreachable** badge based on a quick connection check.
- If discovery does not produce a usable URL for your network, you can set a **Manual Connection URL** (for example `http://192.168.x.x:32400`) and save it.

### Server identity and webhooks

If a machine identifier is stored, Scroblarr **rejects** Plex webhooks whose payload `Server.uuid` does not match that value (**401** / `Invalid server identity`). That prevents another Plex server from posting to your webhook URL if your API key were ever exposed.

**What you should do:**

- Always **Save** after picking the server you actually watch from (so the stored identifier matches that server).
- If you **move** watch activity to a different Plex server, open **Settings → Media Server**, select the new server, and **Save** again.
- If webhooks suddenly return 401 and logs mention server identity, confirm Plex is the same server you configured—not a friend's or a test instance hitting the same URL.

## Webhook configuration

After configuring the server, you need to set up webhooks so Plex sends watch events to Scroblarr.

:::warning Plex Pass required
Plex webhooks are only available to users with an active **Plex Pass** subscription. If you don't have Plex Pass, you won't see the Webhooks option in your Plex Media Server settings. Use [Tautulli notifications](#tautulli-no-plex-pass) instead — no Plex Pass required.
:::

:::warning API key required
Scroblarr **rejects** Plex webhooks unless a **webhook API key** is set under **Settings → General** and the same value is passed in the webhook URL query string. Plex cannot send custom headers, so the key must appear as `?apiKey=...` (see below). This is separate from the admin API key.
:::

1. In Scroblarr, open **Settings → General**, generate or set a **Webhook API key**, and save.
2. Open your Plex Media Server settings
3. Go to **Settings > Webhooks**
4. Click **Add Webhook**
5. Enter your Scroblarr webhook URL (replace placeholders):

   ```text
   YOUR_SCROBLARR_ORIGIN/api/v1/webhooks/plex?apiKey=sk_your_webhook_api_key_here
   ```

   Replace:
   - `YOUR_SCROBLARR_ORIGIN` with your Scroblarr origin (scheme + host + port), for example:
     - Local: `http://localhost:3000` or `http://192.168.1.100:3000`
     - Docker on the same machine: `http://host.docker.internal:3000` (from the Plex container) or your host IP
     - Reverse proxy: `https://scroblarr.example.com`
   - `sk_your_webhook_api_key_here` with the **exact** webhook API key from **Settings → General** (URL-encode if your key contains special characters)

6. Save

:::tip Docker users
If Plex is also running in Docker, you might need to use your host machine's IP address or set up Docker networking so containers can communicate. If Plex is on a different machine, use that machine's IP address or domain name.
:::

## Tautulli (no Plex Pass)

[Tautulli](https://tautulli.com) can send the same watch events without Plex Pass. Scroblarr treats them as Plex watches: users still match by Plex username, and sync history is stored as **Plex**.

You still need a Plex server saved in Scroblarr (for user import and server identity). Tautulli only replaces the Plex webhook.

### 1. Set the Scroblarr webhook API key

In Scroblarr, open **Settings → General**, generate or set a **Webhook API key**, and save.

### 2. Add a Tautulli webhook agent

1. Open Tautulli → **Settings → Notification Agents**
2. Click **Add a new notification agent** → **Webhook**
3. On the **Configuration** tab:

   | Setting            | Value                                            |
   | ------------------ | ------------------------------------------------ |
   | **Webhook URL**    | `YOUR_SCROBLARR_ORIGIN/api/v1/webhooks/tautulli` |
   | **Webhook Method** | `POST`                                           |
   | **Description**    | Anything you like (e.g. `Scroblarr`)             |

   Use the same origin format as the Plex webhook URL above. Tautulli can reach Scroblarr even when Plex cannot send custom headers.

### 3. Triggers

On the **Triggers** tab, enable **Watched**. That is the Tautulli equivalent of Plex's scrobble event and is what Scroblarr syncs to Trakt/Simkl.

Optional (ignored for sync, but accepted):

- Playback Start
- Playback Stop
- Playback Pause
- Playback Resume

Leave Recently Added and other triggers off.

### 4. JSON headers

On the **Data** tab, paste this into **JSON Headers** (replace the API key with the webhook key from **Settings → General**):

```json
{
  "Content-Type": "application/json",
  "X-API-Key": "sk_your_webhook_api_key_here"
}
```

Tautulli sends these as HTTP headers. Scroblarr also accepts `?apiKey=...` on the URL or an `apiKey` field in the JSON body if you prefer.

### 5. JSON data

Paste this into the **JSON Data** field for **each trigger you enabled** (at least **Watched**):

```json
{
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
}
```

Tautulli parses this JSON template, replaces `{parameters}` in the values, then serializes the result. Keep every value quoted so substitutions stay valid strings when a field is blank.

The Settings → Media Server page in Scroblarr copies this URL, headers, and JSON for you.

### 6. Save

Click **Save** on the notification agent.

:::tip Docker users
Tautulli must be able to reach Scroblarr. Use a host IP, Docker DNS name, or reverse-proxy URL the Tautulli container can access.
:::

## What Scroblarr does with Tautulli events

| Tautulli `{action}`          | Result in Scroblarr             |
| ---------------------------- | ------------------------------- |
| `watched`                    | Scrobble to linked destinations |
| `play` / `resume`            | Playing (not synced)            |
| `pause`                      | Paused (not synced)             |
| `stop`                       | Stopped (not synced)            |
| Other / non-movie-or-episode | Ignored (`Event not supported`) |

Users are matched by Tautulli `{username}` (Plex username), falling back to `{user}` (friendly name), against the linked Scroblarr Plex account.

If a Plex machine identifier is saved, Scroblarr **rejects** Tautulli payloads whose `{server_machine_id}` does not match (**401** / `Invalid server identity`), same as native Plex webhooks.

## Verification

Once configured, watch events reach Scroblarr from Plex webhooks or from Tautulli forwarding Plex playback. Plex remains the playback source. You can verify it's working by:

1. Watching something on Plex
2. Checking the Scroblarr Dashboard - you should see the sync appear within a few seconds

If webhooks aren't working, check the [Troubleshooting](/docs/troubleshooting) guide.
